// src/frontend/composables/useVoiceAndAudio.ts
import { ref, onMounted } from 'vue';

export function useVoiceAndAudio(
  onCommandDetected: (text: string, audioSignaturePayload?: string) => void
) {
  const isVigilanceEnabled = ref<boolean>(true);
  const isJarvisAwake = ref<boolean>(false);
  const isJarvisSpeaking = ref<boolean>(false);
  const isRecordingAudio = ref<boolean>(false);
  const voiceStatusText = ref<string>('🟢 Vigília Ativa: Diga "Jarvis"...');
  const isVoiceMuted = ref<boolean>(false);

  let speechSilenceTimer: any = null;
  let lastChimeTimestamp = 0;

  let localAudioStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let scriptProcessorNode: ScriptProcessorNode | null = null;
  let gainNode: GainNode | null = null;
  let pitchMonitorInterval: any = null;

  // Buffer Circular de Pre-Roll (800ms a 16kHz = 12.800 amostras)
  const PRE_ROLL_SAMPLES = 12800;
  let preRollBuffer: number[] = [];
  let speechPcmSamples: number[] = [];
  let isCurrentlyCapturingSpeech = false;
  let speechFramesCount = 0;
  let forceDirectCommand = false;

  let measuredPitches: number[] = [];
  let measuredEnergies: number[] = [];

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

      gain.gain.setValueAtTime(0.09, ctx.currentTime);
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
    if (rms < 0.024) return { pitch: -1, rms };

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

  function encodeWavBase64(samples: number[], sampleRate = 16000): string {
    const numSamples = samples.length;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    let offset = 44;
    for (let i = 0; i < numSamples; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i += 8192) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(i, Math.min(i + 8192, len)) as any
      );
    }
    return window.btoa(binary);
  }

  async function processFinishedSpeech() {
    if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
    isCurrentlyCapturingSpeech = false;
    isRecordingAudio.value = false;
    speechFramesCount = 0;

    const isDirect = forceDirectCommand;
    forceDirectCommand = false;

    // Combina o buffer de Pre-Roll (contendo o "Jar-") com o restante da fala
    const completeSpeech = [...preRollBuffer, ...speechPcmSamples];
    speechPcmSamples = [];

    if (completeSpeech.length < 6400) {
      if (isDirect) {
        isJarvisAwake.value = false;
        voiceStatusText.value = '🟢 Vigília Ativa: Diga "Jarvis"...';
      }
      return;
    }

    const wavBase64 = encodeWavBase64(completeSpeech, 16000);
    if (!wavBase64 || wavBase64.length < 300) {
      if (isDirect) {
        isJarvisAwake.value = false;
        voiceStatusText.value = '🟢 Vigília Ativa: Diga "Jarvis"...';
      }
      return;
    }

    if (isDirect) {
      playJarvisChime('send');
      voiceStatusText.value = '⚡ Processando seu comando de voz...';
    }

    const avgPitch =
      measuredPitches.length > 0
        ? (measuredPitches.reduce((a, b) => a + b, 0) / measuredPitches.length).toFixed(2)
        : '130.00';
    const avgEnergy =
      measuredEnergies.length > 0
        ? (measuredEnergies.reduce((a, b) => a + b, 0) / measuredEnergies.length).toFixed(4)
        : '0.0500';

    measuredPitches = [];
    measuredEnergies = [];

    const bioPayload = `PITCH:${avgPitch}|ENERGY:${avgEnergy}|DATA:${wavBase64}`;
    const modeTag = isDirect ? '__VAD_AUDIO_ONLY__' : '__WAKE_WORD_CHECK__';

    onCommandDetected(modeTag, bioPayload);
  }

  async function startAlwaysOnSentinel(): Promise<boolean> {
    try {
      const nav = navigator as any;
      if (!localAudioStream || !localAudioStream.active) {
        if (nav.mediaDevices && nav.mediaDevices.getUserMedia) {
          localAudioStream = await nav.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
        } else {
          return false;
        }
      }

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx && !audioContext) {
        audioContext = new AudioCtx();
      }

      if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      if (!analyserNode) {
        const source = audioContext!.createMediaStreamSource(localAudioStream!);
        analyserNode = audioContext!.createAnalyser();
        analyserNode.fftSize = 2048;

        scriptProcessorNode = audioContext!.createScriptProcessor(4096, 1, 1);
        gainNode = audioContext!.createGain();
        gainNode.gain.value = 0;

        scriptProcessorNode.onaudioprocess = (e) => {
          if (isJarvisSpeaking.value || !isVigilanceEnabled.value) return;

          const inputData = e.inputBuffer.getChannelData(0);
          const sampleRate = audioContext!.sampleRate;
          const ratio = sampleRate / 16000;
          const newLength = Math.floor(inputData.length / ratio);
          const downsampled = new Float32Array(newLength);
          for (let i = 0; i < newLength; i++) {
            downsampled[i] = inputData[Math.floor(i * ratio)];
          }

          if (isCurrentlyCapturingSpeech) {
            for (let i = 0; i < downsampled.length; i++) {
              speechPcmSamples.push(downsampled[i]);
            }
          } else {
            for (let i = 0; i < downsampled.length; i++) {
              preRollBuffer.push(downsampled[i]);
            }
            if (preRollBuffer.length > PRE_ROLL_SAMPLES) {
              preRollBuffer.splice(0, preRollBuffer.length - PRE_ROLL_SAMPLES);
            }
          }
        };

        source.connect(analyserNode);
        analyserNode.connect(scriptProcessorNode);
        scriptProcessorNode.connect(gainNode);
        gainNode.connect(audioContext!.destination);
      }

      voiceStatusText.value = '🟢 Vigília Ativa: Diga "Jarvis"...';

      if (pitchMonitorInterval) clearInterval(pitchMonitorInterval);
      pitchMonitorInterval = setInterval(() => {
        if (!analyserNode || !audioContext || isJarvisSpeaking.value || !isVigilanceEnabled.value) return;

        const activeTag = document.activeElement?.tagName?.toUpperCase();
        if (activeTag === 'TEXTAREA' || activeTag === 'INPUT') {
          if (!forceDirectCommand) return;
        }

        const buffer = new Float32Array(analyserNode.fftSize);
        analyserNode.getFloatTimeDomainData(buffer);
        const { pitch, rms } = detectPitch(buffer, audioContext.sampleRate);

        if (pitch > 0 && rms >= 0.026) {
          speechFramesCount++;
          measuredPitches.push(pitch);
          measuredEnergies.push(rms);

          if (speechFramesCount >= 2 && !isCurrentlyCapturingSpeech) {
            isCurrentlyCapturingSpeech = true;
            isRecordingAudio.value = true;
            if (forceDirectCommand) {
              isJarvisAwake.value = true;
              voiceStatusText.value = '🎙️ Ouvindo comando...';
            }
          }

          if (isCurrentlyCapturingSpeech) {
            if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
            speechSilenceTimer = setTimeout(() => {
              if (isCurrentlyCapturingSpeech && speechFramesCount >= 3) {
                processFinishedSpeech();
              } else {
                isCurrentlyCapturingSpeech = false;
                isRecordingAudio.value = false;
                speechFramesCount = 0;
                speechPcmSamples = [];
                if (forceDirectCommand) {
                  isJarvisAwake.value = false;
                  forceDirectCommand = false;
                }
              }
            }, 1200);
          }
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

    if (isCurrentlyCapturingSpeech && speechPcmSamples.length > 2000) {
      forceDirectCommand = true;
      await processFinishedSpeech();
      return;
    }

    isVigilanceEnabled.value = true;
    forceDirectCommand = true;
    playJarvisChime('wake');
    const ok = await startAlwaysOnSentinel();
    if (ok) {
      isCurrentlyCapturingSpeech = true;
      isRecordingAudio.value = true;
      speechFramesCount = 3;
      isJarvisAwake.value = true;
      voiceStatusText.value = '🎙️ Estou ouvindo! Fale seu comando...';
    }
  }

  function stopMicrophoneSession() {
    if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
    isJarvisAwake.value = false;
    isCurrentlyCapturingSpeech = false;
    isRecordingAudio.value = false;
  }

  async function speakJarvisResponse(rawText: string, onDone?: () => void) {
    if (isVoiceMuted.value || !rawText) {
      voiceStatusText.value = '🟢 Vigília Ativa: Diga "Jarvis"...';
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
      voiceStatusText.value = '🟢 Vigília Ativa: Diga "Jarvis"...';
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
    if (scriptProcessorNode) {
      try { scriptProcessorNode.disconnect(); } catch {}
      scriptProcessorNode = null;
    }
    if (gainNode) {
      try { gainNode.disconnect(); } catch {}
      gainNode = null;
    }
    if (localAudioStream) {
      localAudioStream.getTracks().forEach((t) => t.stop());
      localAudioStream = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
      try { audioContext.close(); } catch {}
      audioContext = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  function setupAudioUnlockListener(_onTextChange?: (text: string) => void) {
    startAlwaysOnSentinel();

    const unlock = async () => {
      if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      if (!localAudioStream || !localAudioStream.active) {
        await startAlwaysOnSentinel();
      }
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
