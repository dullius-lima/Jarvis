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
  let maxCaptureSafetyTimer: any = null;
  let awakeWindowTimer: any = null;
  let lastChimeTimestamp = 0;
  let speakingCooldownUntil = 0;

  let localAudioStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let scriptProcessorNode: ScriptProcessorNode | null = null;
  let gainNode: GainNode | null = null;
  let vadMonitorInterval: any = null;

  // Buffer Circular de Pre-Roll (600ms a 16kHz = 9.600 amostras)
  const PRE_ROLL_SAMPLES = 9600;
  // Limite máximo de 12 segundos por frase (192.000 amostras a 16kHz)
  const MAX_SPEECH_SAMPLES = 192000;

  let preRollBuffer: number[] = [];
  let speechPcmSamples: number[] = [];
  let isCurrentlyCapturingSpeech = false;
  let speechFramesCount = 0;
  let forceDirectCommand = false;
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

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
      setTimeout(() => ctx.close().catch(() => {}), 250);
    } catch {}
  }

  // Cálculo leve de Pitch executado APENAS 1 VEZ ao encerrar a fala (Zero peso na CPU em repouso)
  function estimateAveragePitch16k(samples: number[]): number {
    if (samples.length < 2048) return 130;
    const midStart = Math.floor(samples.length / 3);
    const slice = samples.slice(midStart, midStart + 2048);
    const sampleRate = 16000;
    const minPeriod = Math.floor(sampleRate / 350);
    const maxPeriod = Math.floor(sampleRate / 80);

    let bestOffset = -1;
    let bestCorr = 0;
    for (let offset = minPeriod; offset <= maxPeriod; offset++) {
      let corr = 0;
      for (let i = 0; i < slice.length - offset; i++) {
        corr += slice[i] * slice[i + offset];
      }
      if (corr > bestCorr) {
        bestCorr = corr;
        bestOffset = offset;
      }
    }
    const pitch = bestOffset > 0 ? sampleRate / bestOffset : 130;
    return pitch >= 75 && pitch <= 360 ? pitch : 130;
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

  function clearCaptureTimers() {
    if (speechSilenceTimer) {
      clearTimeout(speechSilenceTimer);
      speechSilenceTimer = null;
    }
    if (maxCaptureSafetyTimer) {
      clearTimeout(maxCaptureSafetyTimer);
      maxCaptureSafetyTimer = null;
    }
  }

  // Mantém o JARVIS acordado por 25s para conversa fluida sem precisar repetir "Jarvis"
  function activateAwakeListeningWindow(durationMs = 25000) {
    isJarvisAwake.value = true;
    forceDirectCommand = true;
    voiceStatusText.value = '🎙️ JARVIS Ativo: Pode falar seu comando...';

    if (awakeWindowTimer) clearTimeout(awakeWindowTimer);
    awakeWindowTimer = setTimeout(() => {
      if (!isCurrentlyCapturingSpeech && !isJarvisSpeaking.value) {
        isJarvisAwake.value = false;
        forceDirectCommand = false;
        voiceStatusText.value = '🟢 Vigília Ativa: Diga "Jarvis"...';
      }
    }, durationMs);
  }

  async function processFinishedSpeech() {
    clearCaptureTimers();
    isCurrentlyCapturingSpeech = false;
    isRecordingAudio.value = false;

    const capturedVoiceLength = speechPcmSamples.length;
    const isDirect = forceDirectCommand || isJarvisAwake.value;

    // Combina o Pre-Roll com a fala real e LIMPA AMBOS os buffers
    const completeSpeech = [...preRollBuffer, ...speechPcmSamples];
    preRollBuffer = [];
    speechPcmSamples = [];
    speechFramesCount = 0;

    // Exige pelo menos ~450ms reais de voz captada (7.200 amostras a 16kHz) para ignorar cliques/ruídos curtos
    if (capturedVoiceLength < 7200) {
      measuredEnergies = [];
      if (!isJarvisAwake.value) {
        voiceStatusText.value = '🟢 Vigília Ativa: Diga "Jarvis"...';
      }
      return;
    }

    const wavBase64 = encodeWavBase64(completeSpeech, 16000);
    if (!wavBase64 || wavBase64.length < 400) {
      return;
    }

    if (isDirect) {
      playJarvisChime('send');
      voiceStatusText.value = '⚡ Processando seu comando de voz...';
    }

    const avgPitch = estimateAveragePitch16k(completeSpeech).toFixed(2);
    const avgEnergy =
      measuredEnergies.length > 0
        ? (measuredEnergies.reduce((a, b) => a + b, 0) / measuredEnergies.length).toFixed(4)
        : '0.0500';

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
        analyserNode.fftSize = 1024;

        scriptProcessorNode = audioContext!.createScriptProcessor(4096, 1, 1);
        gainNode = audioContext!.createGain();
        gainNode.gain.value = 0;

        scriptProcessorNode.onaudioprocess = (e) => {
          if (
            isJarvisSpeaking.value ||
            !isVigilanceEnabled.value ||
            Date.now() < speakingCooldownUntil
          ) {
            return;
          }

          const inputData = e.inputBuffer.getChannelData(0);
          const sampleRate = audioContext!.sampleRate;
          const ratio = sampleRate / 16000;
          const newLength = Math.floor(inputData.length / ratio);

          if (isCurrentlyCapturingSpeech) {
            for (let i = 0; i < newLength; i++) {
              speechPcmSamples.push(inputData[Math.floor(i * ratio)]);
            }
            if (speechPcmSamples.length >= MAX_SPEECH_SAMPLES) {
              processFinishedSpeech();
            }
          } else {
            for (let i = 0; i < newLength; i++) {
              preRollBuffer.push(inputData[Math.floor(i * ratio)]);
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

      if (!isJarvisAwake.value) {
        voiceStatusText.value = '🟢 Vigília Ativa: Diga "Jarvis"...';
      }

      // Monitor de Energia Vocal (VAD Leve a cada 120ms - Zero impacto de CPU)
      if (vadMonitorInterval) clearInterval(vadMonitorInterval);
      const timeDomainBuf = new Float32Array(1024);

      vadMonitorInterval = setInterval(() => {
        if (
          !analyserNode ||
          !audioContext ||
          isJarvisSpeaking.value ||
          !isVigilanceEnabled.value ||
          Date.now() < speakingCooldownUntil
        ) {
          return;
        }

        const activeTag = document.activeElement?.tagName?.toUpperCase();
        if ((activeTag === 'TEXTAREA' || activeTag === 'INPUT') && !forceDirectCommand) {
          return;
        }

        analyserNode.getFloatTimeDomainData(timeDomainBuf);
        let sumSq = 0;
        for (let i = 0; i < timeDomainBuf.length; i++) {
          sumSq += timeDomainBuf[i] * timeDomainBuf[i];
        }
        const rms = Math.sqrt(sumSq / timeDomainBuf.length);

        // Limiar calibrado para voz humana real (ignora ruído branco de fundo)
        const threshold = isJarvisAwake.value ? 0.024 : 0.032;

        if (rms >= threshold) {
          speechFramesCount++;
          measuredEnergies.push(rms);

          if (speechFramesCount >= 3 && !isCurrentlyCapturingSpeech) {
            isCurrentlyCapturingSpeech = true;
            isRecordingAudio.value = true;
            if (isJarvisAwake.value || forceDirectCommand) {
              voiceStatusText.value = '🎙️ Ouvindo seu comando...';
            }

            // Timeout máximo de segurança (10s) para nunca travar aberto em ambientes ruidosos
            if (maxCaptureSafetyTimer) clearTimeout(maxCaptureSafetyTimer);
            maxCaptureSafetyTimer = setTimeout(() => {
              if (isCurrentlyCapturingSpeech) {
                processFinishedSpeech();
              }
            }, 10000);
          }

          if (isCurrentlyCapturingSpeech) {
            if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
            speechSilenceTimer = setTimeout(() => {
              if (isCurrentlyCapturingSpeech) {
                processFinishedSpeech();
              }
            }, 1300);
          }
        }
      }, 120);

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

    if (isCurrentlyCapturingSpeech && speechPcmSamples.length > 4000) {
      forceDirectCommand = true;
      await processFinishedSpeech();
      return;
    }

    isVigilanceEnabled.value = true;
    playJarvisChime('wake');
    const ok = await startAlwaysOnSentinel();
    if (ok) {
      activateAwakeListeningWindow(25000);
      isCurrentlyCapturingSpeech = true;
      isRecordingAudio.value = true;
      speechFramesCount = 3;
      voiceStatusText.value = '🎙️ Estou ouvindo! Fale seu comando...';

      // Garante que mesmo se o usuário demorar a falar, a gravação encerra após o silêncio
      if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
      speechSilenceTimer = setTimeout(() => {
        if (isCurrentlyCapturingSpeech) {
          processFinishedSpeech();
        }
      }, 4500);
    }
  }

  function stopMicrophoneSession() {
    clearCaptureTimers();
    isJarvisAwake.value = false;
    forceDirectCommand = false;
    isCurrentlyCapturingSpeech = false;
    isRecordingAudio.value = false;
    speechPcmSamples = [];
    preRollBuffer = [];
  }

  async function speakJarvisResponse(rawText: string, keepAwakeAfter = false, onDone?: () => void) {
    if (isVoiceMuted.value || !rawText) {
      if (keepAwakeAfter) {
        activateAwakeListeningWindow(25000);
      } else {
        voiceStatusText.value = '🟢 Vigília Ativa: Diga "Jarvis"...';
      }
      if (onDone) onDone();
      return;
    }

    isJarvisSpeaking.value = true;
    clearCaptureTimers();
    isCurrentlyCapturingSpeech = false;
    isRecordingAudio.value = false;
    preRollBuffer = [];
    speechPcmSamples = [];

    const cleanText = rawText
      .replace(/```[\s\S]*?```/g, 'bloco de código.')
      .replace(/[*#_`~>|]/g, '')
      .trim();

    const finish = () => {
      // Cooldown de 450ms para o microfone não captar a reverberação final do alto-falante
      speakingCooldownUntil = Date.now() + 450;
      preRollBuffer = [];
      speechPcmSamples = [];
      isJarvisSpeaking.value = false;

      if (keepAwakeAfter) {
        activateAwakeListeningWindow(25000);
      } else {
        voiceStatusText.value = '🟢 Vigília Ativa: Diga "Jarvis"...';
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
    if (awakeWindowTimer) clearTimeout(awakeWindowTimer);
    stopMicrophoneSession();
    if (vadMonitorInterval) clearInterval(vadMonitorInterval);
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
    activateAwakeListeningWindow,
    stopMicrophoneSession,
    speakJarvisResponse,
    stopAllAudio,
    setupAudioUnlockListener
  };
}
