import sys
import json
import os
import subprocess
import warnings

warnings.filterwarnings("ignore")

def transcribe_audio(file_path: str, model_size: str = "base"):
    if not os.path.exists(file_path):
        print(json.dumps({"success": False, "error": f"Arquivo não encontrado: {file_path}"}))
        return

    # Garante conversão segura para WAV 16kHz Mono via FFmpeg (resolve 100% das incompatibilidades de codecs do celular)
    wav_path = file_path + ".wav"
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", file_path, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav_path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True
        )
        target_audio = wav_path
    except Exception:
        target_audio = file_path

    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
        segments, info = model.transcribe(target_audio, language="pt", beam_size=5)
        text = " ".join([segment.text.strip() for segment in segments]).strip()

        print(json.dumps({
            "success": True,
            "engine": "faster-whisper",
            "model": model_size,
            "text": text
        }, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"Erro na transcrição Whisper: {str(e)}"
        }, ensure_ascii=False))
    finally:
        if os.path.exists(wav_path):
            try: os.remove(wav_path)
            except: pass

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Caminho de áudio não informado."}))
        sys.exit(1)

    audio_path = sys.argv[1]
    chosen_model = sys.argv[2] if len(sys.argv) > 2 else "base"
    transcribe_audio(audio_path, chosen_model)
EOF

# 2. Atualizar src/services/whisperLocalService.ts
cat << 'EOF' > src/services/whisperLocalService.ts
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface WhisperTranscriptionResult {
  success: boolean;
  text?: string;
  engine?: string;
  model?: string;
  durationMs?: number;
  error?: string;
}

export async function transcribeWithLocalWhisper(
  audioBase64: string,
  modelSize: string = process.env.WHISPER_MODEL_SIZE || 'base'
): Promise<WhisperTranscriptionResult> {
  const startTime = Date.now();

  if (!audioBase64 || audioBase64.length < 100) {
    return { success: false, error: 'Áudio Base64 vazio ou insuficiente.' };
  }

  const cleanBase64 = audioBase64.replace(/^data:audio\/[a-zA-Z0-9+-]+;base64,/, '').trim();
  const tempFilePath = path.join(os.tmpdir(), `jarvis_voice_${Date.now()}.webm`);

  try {
    const audioBuffer = Buffer.from(cleanBase64, 'base64');
    await fs.promises.writeFile(tempFilePath, audioBuffer);

    const scriptPath = path.resolve(process.cwd(), 'scripts', 'whisper_transcribe.py');
    const venvPython = path.resolve(process.cwd(), 'whisper-env', 'bin', 'python3');
    const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python3';

    return await new Promise<WhisperTranscriptionResult>((resolve) => {
      const pyProcess = spawn(pythonCmd, [scriptPath, tempFilePath, modelSize], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdoutData = '';
      let stderrData = '';

      pyProcess.stdout.on('data', (chunk) => { stdoutData += chunk.toString('utf8'); });
      pyProcess.stderr.on('data', (chunk) => { stderrData += chunk.toString('utf8'); });

      pyProcess.on('close', async () => {
        try {
          if (fs.existsSync(tempFilePath)) await fs.promises.unlink(tempFilePath);
        } catch {}

        const durationMs = Date.now() - startTime;
        try {
          const lines = stdoutData.trim().split('\n');
          const lastJsonLine = lines[lines.length - 1] || '{}';
          const parsed = JSON.parse(lastJsonLine);
          resolve({ ...parsed, durationMs });
        } catch {
          resolve({
            success: false,
            durationMs,
            error: `Falha na saída do Whisper: ${stderrData || stdoutData}`
          });
        }
      });

      pyProcess.on('error', (err) => {
        resolve({
          success: false,
          error: `Falha ao iniciar processo Python (${pythonCmd}): ${err.message}`
        });
      });
    });
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
EOF

# 3. Atualizar src/frontend/composables/useVoiceAndAudio.ts com gravação íntegra de WebM
cat << 'EOF' > src/frontend/composables/useVoiceAndAudio.ts
import { ref } from 'vue';

export function useVoiceAndAudio(
  onCommandDetected: (text: string, audioSignaturePayload?: string) => void
) {
  const isVigilanceEnabled = ref<boolean>(true);
  const isJarvisAwake = ref<boolean>(false);
  const isJarvisSpeaking = ref<boolean>(false);
  const isRecordingAudio = ref<boolean>(false);
  const voiceStatusText = ref<string>('🟢 Vigília ativa: Diga "Jarvis" ou toque no Microfone');
  const isVoiceMuted = ref<boolean>(false);

  let recognition: any = null;
  let isRecognitionRunning = false;
  let speechSilenceTimer: any = null;
  let vadFallbackTimer: any = null;
  let speechAccumulatedBuffer = '';
  let lastChimeTimestamp = 0;

  let localAudioStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let pitchMonitorInterval: any = null;
  let measuredPitches: number[] = [];
  let measuredEnergies: number[] = [];
  let measuredSpectra: number[][] = [];
  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];

  function playJarvisChime(type: 'wake' | 'send' = 'wake') {
    const now = Date.now();
    if (now - lastChimeTimestamp < 800) return;
    lastChimeTimestamp = now;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      if (type === 'wake') {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.08);
      } else {
        osc.frequency.setValueAtTime(659.25, ctx.currentTime);
        osc.frequency.setValueAtTime(523.25, ctx.currentTime + 0.08);
      }

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
      setTimeout(() => ctx.close().catch(() => {}), 250);
    } catch {}
  }

  function detectPitch(buf: Float32Array, sampleRate: number): { pitch: number; rms: number } {
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
    const rms = Math.sqrt(sumSq / buf.length);
    if (rms < 0.015) return { pitch: -1, rms };

    const minPeriod = Math.floor(sampleRate / 380);
    const maxPeriod = Math.floor(sampleRate / 75);
    let bestOffset = -1;
    let bestCorr = 0;

    for (let offset = minPeriod; offset <= maxPeriod; offset++) {
      let corr = 0;
      for (let i = 0; i < buf.length - offset; i++) corr += buf[i] * buf[i + offset];
      if (corr > bestCorr) {
        bestCorr = corr;
        bestOffset = offset;
      }
    }
    const pitch = bestOffset > 0 ? sampleRate / bestOffset : -1;
    return { pitch: pitch >= 75 && pitch <= 380 ? pitch : -1, rms };
  }

  function extract16Bands(analyser: AnalyserNode): number[] {
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);
    const bands: number[] = [];
    for (let b = 0; b < 16; b++) {
      let sum = 0;
      for (let j = 0; j < 4; j++) sum += freqData[b * 4 + j + 2] || 0;
      bands.push(Number((sum / (4 * 255)).toFixed(4)));
    }
    return bands;
  }

  function startRecordingUtterance() {
    if (!localAudioStream || !localAudioStream.active) return;
    try {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
    } catch {}

    recordedChunks = [];
    try {
      mediaRecorder = new MediaRecorder(localAudioStream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };
      mediaRecorder.start(100);
      isRecordingAudio.value = true;
    } catch {}
  }

  async function stopAndExportAudioBase64(): Promise<string> {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return '';

    return new Promise<string>((resolve) => {
      mediaRecorder!.onstop = () => {
        isRecordingAudio.value = false;
        try {
          if (recordedChunks.length === 0) return resolve('');
          const blob = new Blob(recordedChunks, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = () => {
            const res = (reader.result as string) || '';
            resolve(res.split(',')[1] || '');
          };
          reader.onerror = () => resolve('');
          reader.readAsDataURL(blob);
        } catch {
          resolve('');
        }
      };
      try {
        mediaRecorder!.stop();
      } catch {
        resolve('');
      }
    });
  }

  async function startAcousticBiometricCapture(): Promise<boolean> {
    try {
      const nav = navigator as any;
      if (!localAudioStream || !localAudioStream.active) {
        if (nav.mediaDevices && nav.mediaDevices.getUserMedia) {
          localAudioStream = await nav.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          });
        } else {
          return false;
        }
      }

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx && !audioContext) {
        audioContext = new AudioCtx();
        const source = audioContext.createMediaStreamSource(localAudioStream!);
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 2048;
        source.connect(analyserNode);
      }

      if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      startRecordingUtterance();

      if (pitchMonitorInterval) clearInterval(pitchMonitorInterval);
      pitchMonitorInterval = setInterval(() => {
        if (!analyserNode || !audioContext || isJarvisSpeaking.value) return;
        const buffer = new Float32Array(analyserNode.fftSize);
        analyserNode.getFloatTimeDomainData(buffer);
        const { pitch, rms } = detectPitch(buffer, audioContext.sampleRate);

        if (pitch > 0 && rms >= 0.016) {
          measuredPitches.push(pitch);
          measuredEnergies.push(rms);
          measuredSpectra.push(extract16Bands(analyserNode));

          if (measuredPitches.length > 45) measuredPitches.shift();
          if (measuredEnergies.length > 45) measuredEnergies.shift();
          if (measuredSpectra.length > 45) measuredSpectra.shift();

          if (isJarvisAwake.value) {
            voiceStatusText.value = `🎙️ Ouvindo você (${Math.round(pitch)} Hz)...`;
            if (vadFallbackTimer) clearTimeout(vadFallbackTimer);
            vadFallbackTimer = setTimeout(async () => {
              if (isJarvisAwake.value && speechAccumulatedBuffer.trim().length === 0) {
                playJarvisChime('send');
                voiceStatusText.value = '⚡ Transcrevendo voz no Whisper Local...';
                const audioB64 = await stopAndExportAudioBase64();
                const bioPayload = buildBiometricString(audioB64);
                isJarvisAwake.value = false;
                onCommandDetected('__VAD_AUDIO_ONLY__', bioPayload);
              }
            }, 1800);
          }
        }
      }, 60);

      return true;
    } catch {
      return false;
    }
  }

  function buildBiometricString(base64Data: string): string {
    const avgPitch =
      measuredPitches.length > 0
        ? (measuredPitches.reduce((a, b) => a + b, 0) / measuredPitches.length).toFixed(2)
        : '130.00';
    const avgEnergy =
      measuredEnergies.length > 0
        ? (measuredEnergies.reduce((a, b) => a + b, 0) / measuredEnergies.length).toFixed(4)
        : '0.0500';

    const avgSpectrum = new Array(16).fill(0);
    if (measuredSpectra.length > 0) {
      for (const spec of measuredSpectra) {
        for (let i = 0; i < 16; i++) avgSpectrum[i] += spec[i] || 0;
      }
      for (let i = 0; i < 16; i++) {
        avgSpectrum[i] = Number((avgSpectrum[i] / measuredSpectra.length).toFixed(4));
      }
    }

    measuredPitches = [];
    measuredEnergies = [];
    measuredSpectra = [];

    return `PITCH:${avgPitch}|ENERGY:${avgEnergy}|SPEC:${avgSpectrum.join(',')}|DATA:${base64Data || 'SPEECH_SAMPLE'}`;
  }

  function initSTT(onTextChange?: (text: string) => void) {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return null;

    const rec = new SpeechRecognition();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      isRecognitionRunning = true;
      voiceStatusText.value = isJarvisAwake.value
        ? '🎙️ Ouvindo você... Pode falar!'
        : '🟢 Vigília ativa: Diga "Jarvis" ou toque no Microfone';
    };

    rec.onresult = (event: any) => {
      if (isJarvisSpeaking.value) return;
      if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
      if (vadFallbackTimer) clearTimeout(vadFallbackTimer);

      let currentInterim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const part = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          speechAccumulatedBuffer += ' ' + part;
        } else {
          currentInterim += part;
        }
      }

      const liveText = (speechAccumulatedBuffer + ' ' + currentInterim).trim();
      if (!liveText) return;

      const wakeWordPattern =
        /(?:oi|ol[aá]|ei|ok|fala|al[oô]|e a[ií])?\s*(jarvis|j[aá]vis|jarves|iarvis|jarbas|chaves|j[aá]rvis)|(?:preciso\s+de\s+ajuda|me\s+ajuda|socorro|assistente)/i;

      if (!isJarvisAwake.value && wakeWordPattern.test(liveText)) {
        isJarvisAwake.value = true;
        playJarvisChime('wake');
        startRecordingUtterance();

        const parts = liveText.split(wakeWordPattern);
        const remainder = parts.pop()?.replace(/^[,.\s!?-]+/, '').trim() || '';

        if (remainder.length > 2) {
          speechAccumulatedBuffer = remainder;
          if (onTextChange) onTextChange(remainder);
          voiceStatusText.value = `🎙️ "${remainder}"`;
        } else {
          speechAccumulatedBuffer = '';
          voiceStatusText.value = '🎙️ Sim? Estou ouvindo... Diga seu comando!';
        }
      }

      if (isJarvisAwake.value && liveText.length > 1) {
        const cleaned = liveText.replace(wakeWordPattern, '').replace(/^[,.\s!?-]+/, '').trim() || liveText;
        if (onTextChange) onTextChange(cleaned);
        voiceStatusText.value = `🎙️ "${cleaned}"`;

        speechSilenceTimer = setTimeout(async () => {
          if (cleaned.length > 1) {
            playJarvisChime('send');
            voiceStatusText.value = '⚡ Processando comando...';
            const audioB64 = await stopAndExportAudioBase64();
            const bioPayload = buildBiometricString(audioB64);
            isJarvisAwake.value = false;
            speechAccumulatedBuffer = '';
            onCommandDetected(cleaned, bioPayload);
          }
        }, 1500);
      }
    };

    rec.onerror = () => {
      // Falha esperada em conexões HTTP sem SSL confiável no Android
    };

    rec.onend = () => {
      isRecognitionRunning = false;
      if (isVigilanceEnabled.value && !isJarvisSpeaking.value) {
        setTimeout(() => {
          if (!isRecognitionRunning && !isJarvisSpeaking.value) {
            try { rec.start(); } catch {}
          }
        }, 300);
      }
    };

    return rec;
  }

  async function onJarvisCoreClick(onTextChange?: (text: string) => void) {
    if (isJarvisSpeaking.value) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      isJarvisSpeaking.value = false;
    }

    // Se já estava gravando e você clicou de novo, finaliza e envia imediatamente
    if (isJarvisAwake.value) {
      if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
      if (vadFallbackTimer) clearTimeout(vadFallbackTimer);
      playJarvisChime('send');
      voiceStatusText.value = '⚡ Transcrevendo fala...';
      const textCaptured = speechAccumulatedBuffer.trim();
      const audioB64 = await stopAndExportAudioBase64();
      const bioPayload = buildBiometricString(audioB64);
      isJarvisAwake.value = false;
      speechAccumulatedBuffer = '';
      onCommandDetected(textCaptured || '__VAD_AUDIO_ONLY__', bioPayload);
      return;
    }

    isVigilanceEnabled.value = true;
    playJarvisChime('wake');
    const hasMic = await startAcousticBiometricCapture();

    speechAccumulatedBuffer = '';
    measuredPitches = [];
    measuredEnergies = [];
    measuredSpectra = [];
    isJarvisAwake.value = true;

    if (hasMic) {
      voiceStatusText.value = '🎙️ Gravando... Fale seu comando (ou toque no botão para enviar)!';
    } else {
      voiceStatusText.value = '⚠️ Microfone bloqueado pelo navegador';
    }

    if (!recognition) recognition = initSTT(onTextChange);
    if (!isRecognitionRunning) {
      try { recognition?.start(); } catch {}
    }
  }

  function stopMicrophoneSession() {
    if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
    if (vadFallbackTimer) clearTimeout(vadFallbackTimer);
    isJarvisAwake.value = false;
    speechAccumulatedBuffer = '';
  }

  async function speakJarvisResponse(rawText: string, onDone?: () => void) {
    if (isVoiceMuted.value || !rawText) {
      if (onDone) onDone();
      return;
    }

    isJarvisSpeaking.value = true;
    if (recognition && isRecognitionRunning) {
      try { recognition.stop(); } catch {}
    }

    const cleanText = rawText
      .replace(/```[\s\S]*?```/g, 'bloco de código.')
      .replace(/[*#_`~>|]/g, '')
      .trim();

    const finish = () => {
      isJarvisSpeaking.value = false;
      voiceStatusText.value = '🟢 Vigília ativa: Diga "Jarvis" ou toque no Microfone';

      if (isVigilanceEnabled.value && recognition && !isRecognitionRunning) {
        setTimeout(() => {
          try { recognition.start(); } catch {}
        }, 300);
      }
      if (onDone) onDone();
    };

    try {
      const res = await fetch('/api/v1/audio/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, mode: 'auto' })
      });
      const data = await res.json();
      if (data.success && data.audioBase64) {
        const audio = new Audio(`data:${data.mimeType || 'audio/mpeg'};base64,${data.audioBase64}`);
        audio.onended = finish;
        audio.onerror = () => fallbackSpeech(cleanText, finish);
        await audio.play();
        return;
      }
    } catch {}

    fallbackSpeech(cleanText, finish);
  }

  function fallbackSpeech(text: string, finish: () => void) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'pt-BR';
        utterance.rate = 1.05;
        utterance.pitch = 0.95;
        utterance.onend = finish;
        utterance.onerror = finish;
        window.speechSynthesis.speak(utterance);
      }, 60);
    } else {
      finish();
    }
  }

  function stopAllAudio() {
    isVigilanceEnabled.value = false;
    stopMicrophoneSession();
    if (pitchMonitorInterval) clearInterval(pitchMonitorInterval);
    if (localAudioStream) {
      localAudioStream.getTracks().forEach((t) => t.stop());
      localAudioStream = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  function setupAudioUnlockListener(onTextChange?: (text: string) => void) {
    const unlock = async () => {
      await startAcousticBiometricCapture();
      if (!recognition) recognition = initSTT(onTextChange);
      if (!isRecognitionRunning) {
        try { recognition?.start(); } catch {}
      }
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
  }

  return {
    isJarvisAwake,
    isJarvisSpeaking,
    isRecordingAudio,
    voiceStatusText,
    isVoiceMuted,
    onJarvisCoreClick,
    stopMicrophoneSession,
    speakJarvisResponse,
    stopAllAudio,
    setupAudioUnlockListener
  };
}
