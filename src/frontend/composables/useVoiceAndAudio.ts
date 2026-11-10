// src/frontend/composables/useVoiceAndAudio.ts
import { ref, onMounted } from 'vue';

export function useVoiceAndAudio(
  onCommandDetected: (text: string, audioSignaturePayload?: string) => void
) {
  const isVigilanceEnabled = ref<boolean>(true);
  const isJarvisAwake = ref<boolean>(false);
  const isJarvisSpeaking = ref<boolean>(false);
  const isRecordingAudio = ref<boolean>(false);
  const voiceStatusText = ref<string>('🟢 Vigília Sempre Ativa: Diga "Jarvis"...');
  const isVoiceMuted = ref<boolean>(false);

  let speechSilenceTimer: any = null;
  let lastChimeTimestamp = 0;

  // Analisador Acústico e Gravador para Whisper
  let localAudioStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let pitchMonitorInterval: any = null;
  let measuredPitches: number[] = [];
  let measuredEnergies: number[] = [];
  let measuredSpectra: number[][] = [];
  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];
  let isCurrentlyCapturingSpeech = false;
  let speechFramesCount = 0;
  let forceDirectCommand = false;

  function getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ];
    for (const t of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return '';
  }

  function playJarvisChime(type: 'wake' | 'send' = 'wake') {
    const now = Date.now();
    if (now - lastChimeTimestamp < 700) return;
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

      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
      setTimeout(() => ctx.close().catch(() => {}), 250);
    } catch {}
  }

  function detectPitch(buf: Float32Array, sampleRate: number): { pitch: number; rms: number } {
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
    const rms = Math.sqrt(sumSq / buf.length);
    if (rms < 0.018) return { pitch: -1, rms };

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

  function startUtteranceRecorder() {
    if (!localAudioStream || !localAudioStream.active) return;
    if (mediaRecorder && mediaRecorder.state === 'recording') return;

    recordedChunks = [];
    try {
      const mimeType = getSupportedMimeType();
      mediaRecorder = mimeType
        ? new MediaRecorder(localAudioStream, { mimeType })
        : new MediaRecorder(localAudioStream);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };
      mediaRecorder.start(100);
      isRecordingAudio.value = true;
    } catch (err) {
      console.warn('Erro ao iniciar MediaRecorder:', err);
    }
  }

  async function stopAndExportAudioBase64(): Promise<string> {
    if (!mediaRecorder) return '';

    return new Promise<string>((resolve) => {
      const exportChunks = () => {
        isRecordingAudio.value = false;
        if (recordedChunks.length === 0) return resolve('');
        try {
          const mimeType = mediaRecorder?.mimeType || 'audio/webm';
          const blob = new Blob(recordedChunks, { type: mimeType });
          recordedChunks = [];
          if (blob.size < 800) return resolve('');
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

      if (mediaRecorder.state === 'inactive') {
        exportChunks();
        return;
      }

      mediaRecorder.onstop = exportChunks;
      try {
        mediaRecorder.stop();
      } catch {
        exportChunks();
      }
    });
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

    return `PITCH:${avgPitch}|ENERGY:${avgEnergy}|SPEC:${avgSpectrum.join(',')}|DATA:${base64Data}`;
  }

  async function processFinishedSpeech() {
    if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
    isCurrentlyCapturingSpeech = false;
    speechFramesCount = 0;

    const audioB64 = await stopAndExportAudioBase64();
    if (!audioB64 || audioB64.length < 300) {
      isJarvisAwake.value = false;
      voiceStatusText.value = '🟢 Vigília Sempre Ativa: Diga "Jarvis"...';
      return;
    }

    voiceStatusText.value = '⚡ Verificando chamada "Jarvis"...';
    const bioPayload = buildBiometricString(audioB64);
    const modeTag = forceDirectCommand ? '__VAD_AUDIO_ONLY__' : '__WAKE_WORD_CHECK__';
    forceDirectCommand = false;
    isJarvisAwake.value = false;

    onCommandDetected(modeTag, bioPayload);
  }

  async function startAlwaysOnSentinel(): Promise<boolean> {
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

      voiceStatusText.value = '🟢 Vigília Sempre Ativa: Diga "Jarvis"...';

      if (pitchMonitorInterval) clearInterval(pitchMonitorInterval);
      pitchMonitorInterval = setInterval(() => {
        if (!analyserNode || !audioContext || isJarvisSpeaking.value) return;

        const buffer = new Float32Array(analyserNode.fftSize);
        analyserNode.getFloatTimeDomainData(buffer);
        const { pitch, rms } = detectPitch(buffer, audioContext.sampleRate);

        if (pitch > 0 && rms >= 0.022) {
          speechFramesCount++;
          measuredPitches.push(pitch);
          measuredEnergies.push(rms);
          measuredSpectra.push(extract16Bands(analyserNode));

          if (!isCurrentlyCapturingSpeech) {
            isCurrentlyCapturingSpeech = true;
            startUtteranceRecorder();
          }

          if (speechFramesCount >= 3) {
            isJarvisAwake.value = true;
            voiceStatusText.value = '🎙️ Detectando voz... (Diga "Jarvis" + seu comando)';
          }

          if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
          speechSilenceTimer = setTimeout(() => {
            if (isCurrentlyCapturingSpeech && speechFramesCount >= 4) {
              processFinishedSpeech();
            } else {
              isCurrentlyCapturingSpeech = false;
              speechFramesCount = 0;
              isJarvisAwake.value = false;
              stopAndExportAudioBase64();
              voiceStatusText.value = '🟢 Vigília Sempre Ativa: Diga "Jarvis"...';
            }
          }, 1400);
        }
      }, 60);

      return true;
    } catch {
      return false;
    }
  }

  async function onJarvisCoreClick(_onTextChange?: (text: string) => void) {
    if (isJarvisSpeaking.value) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      isJarvisSpeaking.value = false;
    }

    if (isCurrentlyCapturingSpeech && recordedChunks.length > 2) {
      await processFinishedSpeech();
      return;
    }

    isVigilanceEnabled.value = true;
    forceDirectCommand = true;
    playJarvisChime('wake');
    const ok = await startAlwaysOnSentinel();
    if (ok) {
      startUtteranceRecorder();
      isCurrentlyCapturingSpeech = true;
      isJarvisAwake.value = true;
      voiceStatusText.value = '🎙️ Estou ouvindo! Pode falar...';
    }
  }

  function stopMicrophoneSession() {
    if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
    isJarvisAwake.value = false;
    isCurrentlyCapturingSpeech = false;
  }

  async function speakJarvisResponse(rawText: string, onDone?: () => void) {
    if (isVoiceMuted.value || !rawText) {
      voiceStatusText.value = '🟢 Vigília Sempre Ativa: Diga "Jarvis"...';
      if (onDone) onDone();
      return;
    }

    isJarvisSpeaking.value = true;
    if (speechSilenceTimer) clearTimeout(speechSilenceTimer);

    const cleanText = rawText
      .replace(/```[\s\S]*?```/g, 'bloco de código.')
      .replace(/[*#_`~>|]/g, '')
      .trim();

    const finish = () => {
      isJarvisSpeaking.value = false;
      voiceStatusText.value = '🟢 Vigília Sempre Ativa: Diga "Jarvis"...';
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

  function setupAudioUnlockListener(_onTextChange?: (text: string) => void) {
    startAlwaysOnSentinel();

    const unlock = async () => {
      if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      await startAlwaysOnSentinel();
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
  }

  onMounted(() => {
    startAlwaysOnSentinel();
  });

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
