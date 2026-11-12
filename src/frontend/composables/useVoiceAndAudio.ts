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
  let speakingSafetyTimer: any = null;
  let lastChimeTimestamp = 0;
  let speakingCooldownUntil = 0;
  let manualClickTimestamp = 0;

  let localAudioStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let scriptProcessorNode: ScriptProcessorNode | null = null;
  let gainNode: GainNode | null = null;
  let vadMonitorInterval: any = null;

  const PRE_ROLL_SAMPLES = 12800; // 800ms a 16kHz
  const MAX_SPEECH_SAMPLES = 192000; // 12s max

  let preRollBuffer: number[] = [];
  let speechPcmSamples: number[] = [];
  let isCurrentlyCapturingSpeech = false;
  let isManualMicSession = false;
  let hasSpokenInManualSession = false;
  let speechFramesCount = 0;
  let forceDirectCommand = false;
  let measuredEnergies: number[] = [];

  function playJarvisChime(type: 'wake' | 'send' = 'wake') {
    const now = Date.now();
    if (now - lastChimeTimestamp < 600) return;
    lastChimeTimestamp = now;

    try {
      if (!audioContext || audioContext.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) audioContext = new AudioCtx();
      }
      if (!audioContext) return;
      if (audioContext.state === 'suspended') audioContext.resume();

      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();

      osc.type = 'sine';
      if (type === 'wake') {
        osc.frequency.setValueAtTime(523.25, audioContext.currentTime);
        osc.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.08);
      } else {
        osc.frequency.setValueAtTime(659.25, audioContext.currentTime);
        osc.frequency.setValueAtTime(523.25, audioContext.currentTime + 0.08);
      }

      gain.gain.setValueAtTime(0.06, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + 0.18);
    } catch {}
  }

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

  // Codifica WAV 16kHz com remoção de DC Offset e normalização inteligente de volume
  function encodeWavBase64(samples: number[], sampleRate = 16000): string {
    const numSamples = samples.length;
    if (numSamples === 0) return '';

    // 1. Remove DC offset do microfone mobile
    let sum = 0;
    for (let i = 0; i < numSamples; i++) sum += samples[i];
    const mean = sum / numSamples;

    // 2. Encontra o pico ignorando os primeiros 150ms (possível estalo do toque no ecrã)
    const ignoreHead = Math.min(2400, Math.floor(numSamples * 0.15));
    let maxPeak = 0;
    for (let i = ignoreHead; i < numSamples; i++) {
      const abs = Math.abs(samples[i] - mean);
      if (abs > maxPeak) maxPeak = abs;
    }
    if (maxPeak === 0) maxPeak = 0.05;

    const gainMultiplier = maxPeak > 0.002 && maxPeak < 0.85 ? Math.min(18.0, 0.88 / maxPeak) : 1.0;

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
      const centered = (samples[i] - mean) * gainMultiplier;
      const s = Math.max(-1, Math.min(1, centered));
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

    const wasManualSession = isManualMicSession;
    isManualMicSession = false;
    hasSpokenInManualSession = false;

    const capturedVoiceLength = speechPcmSamples.length;
    const isDirect = wasManualSession || forceDirectCommand || isJarvisAwake.value;

    const completeSpeech = [...preRollBuffer, ...speechPcmSamples];
    preRollBuffer = [];
    speechPcmSamples = [];
    speechFramesCount = 0;

    if (capturedVoiceLength < 4800) {
      measuredEnergies = [];
      if (!isJarvisAwake.value) {
        voiceStatusText.value = '🟢 Vigília Ativa: Diga "Jarvis"...';
      } else {
        voiceStatusText.value = '🎙️ JARVIS Ativo: Pode falar seu comando...';
      }
      return;
    }

    const wavBase64 = encodeWavBase64(completeSpeech, 16000);
    if (!wavBase64 || wavBase64.length < 400) {
      voiceStatusText.value = '🟢 Vigília Ativa: Diga "Jarvis"...';
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
          voiceStatusText.value = '⚠️ Microfone bloqueado (ative HTTPS ou flag do Chrome)';
          return false;
        }
      }

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx && (!audioContext || audioContext.state === 'closed')) {
        audioContext = new AudioCtx();
      }

      if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      if (!analyserNode && audioContext && localAudioStream) {
        const source = audioContext.createMediaStreamSource(localAudioStream);
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 1024;

        scriptProcessorNode = audioContext.createScriptProcessor(4096, 1, 1);
        gainNode = audioContext.createGain();
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

          // Downsampling com média (Filtro Anti-Aliasing) para nitidez total em telemóveis 48kHz
          for (let i = 0; i < newLength; i++) {
            const startIdx = Math.floor(i * ratio);
            const endIdx = Math.min(inputData.length, Math.floor((i + 1) * ratio));
            let sum = 0;
            let count = 0;
            for (let j = startIdx; j < endIdx; j++) {
              sum += inputData[j];
              count++;
            }
            const sample = count > 0 ? sum / count : inputData[startIdx];

            if (isCurrentlyCapturingSpeech) {
              speechPcmSamples.push(sample);
            } else {
              preRollBuffer.push(sample);
            }
          }

          if (isCurrentlyCapturingSpeech) {
            if (speechPcmSamples.length >= MAX_SPEECH_SAMPLES) {
              processFinishedSpeech();
            }
          } else if (preRollBuffer.length > PRE_ROLL_SAMPLES) {
            preRollBuffer.splice(0, preRollBuffer.length - PRE_ROLL_SAMPLES);
          }
        };

        source.connect(analyserNode);
        analyserNode.connect(scriptProcessorNode);
        scriptProcessorNode.connect(gainNode);
        gainNode.connect(audioContext.destination);
      }

      if (!isJarvisAwake.value && !isManualMicSession) {
        voiceStatusText.value = '🟢 Vigília Ativa: Diga "Jarvis"...';
      }

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

        if (audioContext.state === 'suspended') {
          audioContext.resume().catch(() => {});
        }

        const activeTag = document.activeElement?.tagName?.toUpperCase();
        if ((activeTag === 'TEXTAREA' || activeTag === 'INPUT') && !forceDirectCommand && !isManualMicSession) {
          return;
        }

        analyserNode.getFloatTimeDomainData(timeDomainBuf);
        let sumSq = 0;
        for (let i = 0; i < timeDomainBuf.length; i++) {
          sumSq += timeDomainBuf[i] * timeDomainBuf[i];
        }
        const rms = Math.sqrt(sumSq / timeDomainBuf.length);

        // Limiar sensível para continuar a captar toda a frase no telemóvel sem cortar no meio
        const startThreshold = isManualMicSession || isJarvisAwake.value ? 0.009 : 0.022;
        const continueThreshold = 0.005;
        const activeThreshold = isCurrentlyCapturingSpeech ? continueThreshold : startThreshold;

        if (rms >= activeThreshold) {
          speechFramesCount++;
          measuredEnergies.push(rms);

          if (isManualMicSession) {
            hasSpokenInManualSession = true;
            voiceStatusText.value = '🎙️ Captando sua voz... (toque no mic p/ enviar já)';
          }

          if (speechFramesCount >= 2 && !isCurrentlyCapturingSpeech) {
            isCurrentlyCapturingSpeech = true;
            isRecordingAudio.value = true;
            if (isJarvisAwake.value || forceDirectCommand) {
              voiceStatusText.value = '🎙️ Ouvindo seu comando...';
            }

            if (maxCaptureSafetyTimer) clearTimeout(maxCaptureSafetyTimer);
            maxCaptureSafetyTimer = setTimeout(() => {
              if (isCurrentlyCapturingSpeech) {
                processFinishedSpeech();
              }
            }, 12000);
          }

          // Sempre que houver voz (mesmo suave no final das palavras), adia o fecho em 1.8s
          if (isCurrentlyCapturingSpeech && (!isManualMicSession || hasSpokenInManualSession)) {
            if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
            speechSilenceTimer = setTimeout(() => {
              if (isCurrentlyCapturingSpeech) {
                processFinishedSpeech();
              }
            }, 1800);
          }
        }
      }, 100);

      return true;
    } catch {
      return false;
    }
  }

  async function onJarvisCoreClick(_onTextChange?: (text: string) => void) {
    if (isJarvisSpeaking.value) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      if (speakingSafetyTimer) clearTimeout(speakingSafetyTimer);
      isJarvisSpeaking.value = false;
    }

    // Se já estava a gravar e o utilizador tocou novamente no microfone, envia na hora!
    if (
      isCurrentlyCapturingSpeech &&
      Date.now() - manualClickTimestamp > 600 &&
      speechPcmSamples.length > 4800
    ) {
      forceDirectCommand = true;
      await processFinishedSpeech();
      return;
    }

    clearCaptureTimers();
    speechPcmSamples = [];
    preRollBuffer = [];
    measuredEnergies = [];
    speechFramesCount = 0;

    isVigilanceEnabled.value = true;
    isManualMicSession = true;
    hasSpokenInManualSession = false;
    manualClickTimestamp = Date.now();

    speakingCooldownUntil = Date.now() + 220;
    playJarvisChime('wake');

    const ok = await startAlwaysOnSentinel();
    if (ok) {
      activateAwakeListeningWindow(25000);
      isCurrentlyCapturingSpeech = true;
      isRecordingAudio.value = true;
      voiceStatusText.value = '🎙️ Estou ouvindo! Fale seu comando...';

      // Aguarda até 6.5 segundos para começar a falar
      speechSilenceTimer = setTimeout(() => {
        if (isCurrentlyCapturingSpeech) {
          processFinishedSpeech();
        }
      }, 6500);
    }
  }

  function stopMicrophoneSession() {
    clearCaptureTimers();
    isManualMicSession = false;
    hasSpokenInManualSession = false;
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
    voiceStatusText.value = '🔊 JARVIS respondendo...';
    clearCaptureTimers();
    isCurrentlyCapturingSpeech = false;
    isRecordingAudio.value = false;
    preRollBuffer = [];
    speechPcmSamples = [];

    const cleanText = rawText
      .replace(/```[\s\S]*?```/g, 'bloco de código.')
      .replace(/[*#_`~>|]/g, '')
      .trim();

    let alreadyFinished = false;
    const finish = () => {
      if (alreadyFinished) return;
      alreadyFinished = true;
      if (speakingSafetyTimer) {
        clearTimeout(speakingSafetyTimer);
        speakingSafetyTimer = null;
      }
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

    // Timeout de segurança: garante que no Android a barra NUNCA fica presa se o TTS falhar em disparar onend
    const estimatedSpeakMs = Math.min(18000, Math.max(3500, cleanText.length * 85));
    speakingSafetyTimer = setTimeout(finish, estimatedSpeakMs);

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
      try {
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
      } catch {
        finish();
      }
    } else {
      finish();
    }
  }

  function stopAllAudio() {
    isVigilanceEnabled.value = false;
    if (awakeWindowTimer) clearTimeout(awakeWindowTimer);
    if (speakingSafetyTimer) clearTimeout(speakingSafetyTimer);
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
    const unlock = async () => {
      if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume().catch(() => {});
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
