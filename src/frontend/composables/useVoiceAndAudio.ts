// src/frontend/composables/useVoiceAndAudio.ts
import { ref } from 'vue';

export function useVoiceAndAudio(
  onCommandDetected: (text: string, audioSignaturePayload?: string) => void
) {
  const isVigilanceEnabled = ref<boolean>(true);
  const isJarvisAwake = ref<boolean>(false);
  const isJarvisSpeaking = ref<boolean>(false);
  const isRecordingAudio = ref<boolean>(false);
  const voiceStatusText = ref<string>('🟢 Vigília ativa: Diga "Jarvis" ou toque no Globo');
  const isVoiceMuted = ref<boolean>(false);

  let recognition: any = null;
  let isRecognitionRunning = false;
  let speechSilenceTimer: any = null;
  let vadFallbackTimer: any = null;
  let speechAccumulatedBuffer = '';
  let lastChimeTimestamp = 0;

  // Analisador Acústico Biométrico (Pitch + 16 Bandas Espectrais de Timbre + VAD)
  let localAudioStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let pitchMonitorInterval: any = null;
  let measuredPitches: number[] = [];
  let measuredEnergies: number[] = [];
  let measuredSpectra: number[][] = [];
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let vadDetectedHumanSpeech = false;

  function playJarvisChime(type: 'wake' | 'send' = 'wake') {
    const now = Date.now();
    if (now - lastChimeTimestamp < 1200 && type === 'wake') return;
    lastChimeTimestamp = now;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      if (type === 'wake') {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.09);
      } else {
        osc.frequency.setValueAtTime(659.25, ctx.currentTime);
        osc.frequency.setValueAtTime(523.25, ctx.currentTime + 0.09);
      }

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
      setTimeout(() => ctx.close().catch(() => {}), 300);
    } catch {}
  }

  // Mede Pitch (Hz) + RMS (Volume) por Autocorrelação
  function detectPitchFromBuffer(buf: Float32Array, sampleRate: number): { pitch: number; rms: number } {
    let sumSquares = 0;
    for (let i = 0; i < buf.length; i++) {
      sumSquares += buf[i] * buf[i];
    }
    const rms = Math.sqrt(sumSquares / buf.length);
    if (rms < 0.014) return { pitch: -1, rms };

    const minPeriod = Math.floor(sampleRate / 380);
    const maxPeriod = Math.floor(sampleRate / 75);
    let bestOffset = -1;
    let bestCorrelation = 0;

    for (let offset = minPeriod; offset <= maxPeriod; offset++) {
      let correlation = 0;
      for (let i = 0; i < buf.length - offset; i++) {
        correlation += buf[i] * buf[i + offset];
      }
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestOffset = offset;
      }
    }

    if (bestOffset > 0) {
      const pitch = sampleRate / bestOffset;
      if (pitch >= 75 && pitch <= 380) {
        return { pitch, rms };
      }
    }
    return { pitch: -1, rms };
  }

  // Extrai 16 bandas de formantes vocais (85 Hz a 3400 Hz) para diferenciar timbres da família
  function extract16BandVoiceSpectrum(analyser: AnalyserNode): number[] {
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);
    const bands: number[] = [];
    const binsPerBand = 4; // Cobre as frequências fundamentais e formantes F1, F2, F3
    for (let b = 0; b < 16; b++) {
      let sum = 0;
      for (let j = 0; j < binsPerBand; j++) {
        sum += freqData[b * binsPerBand + j + 2] || 0;
      }
      bands.push(Number((sum / (binsPerBand * 255)).toFixed(4)));
    }
    return bands;
  }

  async function startAcousticBiometricCapture(): Promise<boolean> {
    try {
      if (!localAudioStream || !localAudioStream.active) {
        localAudioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      }

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx && !audioContext) {
        audioContext = new AudioCtx();
        const source = audioContext.createMediaStreamSource(localAudioStream);
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 2048;
        source.connect(analyserNode);
      }

      if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      if (pitchMonitorInterval) clearInterval(pitchMonitorInterval);
      pitchMonitorInterval = setInterval(() => {
        if (!analyserNode || !audioContext || isJarvisSpeaking.value) return;
        const buffer = new Float32Array(analyserNode.fftSize);
        analyserNode.getFloatTimeDomainData(buffer);
        const { pitch, rms } = detectPitchFromBuffer(buffer, audioContext.sampleRate);

        if (pitch > 0 && rms >= 0.018) {
          measuredPitches.push(pitch);
          measuredEnergies.push(rms);
          measuredSpectra.push(extract16BandVoiceSpectrum(analyserNode));

          if (measuredPitches.length > 45) measuredPitches.shift();
          if (measuredEnergies.length > 45) measuredEnergies.shift();
          if (measuredSpectra.length > 45) measuredSpectra.shift();

          // VAD Fallback: Se o Jarvis está acordado ouvindo e detectou voz humana, agenda envio caso a Web Speech falhe
          if (isJarvisAwake.value) {
            vadDetectedHumanSpeech = true;
            if (vadFallbackTimer) clearTimeout(vadFallbackTimer);
            vadFallbackTimer = setTimeout(async () => {
              // Se após 2.4s de silêncio o Web Speech não preencheu nada no buffer, envia o áudio direto para o Whisper!
              if (isJarvisAwake.value && vadDetectedHumanSpeech && speechAccumulatedBuffer.trim().length === 0) {
                vadDetectedHumanSpeech = false;
                playJarvisChime('send');
                voiceStatusText.value = '⚡ Processando áudio via Whisper Local...';
                const bioPayload = await buildVoiceBiometricPayloadAsync();
                isJarvisAwake.value = false;
                onCommandDetected('__VAD_AUDIO_ONLY__', bioPayload);
              }
            }, 2400);
          }
        }
      }, 60);

      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        audioChunks = [];
        mediaRecorder = new MediaRecorder(localAudioStream);
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunks.push(e.data);
            // Mantém apenas os últimos ~6 segundos de chunks para não crescer infinitamente
            if (audioChunks.length > 24) audioChunks.shift();
          }
        };
        mediaRecorder.start(250);
        isRecordingAudio.value = true;
      }

      return true;
    } catch (err) {
      console.warn('Permissão de microfone pendente:', err);
      return false;
    }
  }

  // Converte os chunks gravados no momento exato da fala em Base64 + Vetor Biométrico
  async function buildVoiceBiometricPayloadAsync(): Promise<string> {
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

    let base64Data = '';
    if (audioChunks.length > 0) {
      try {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        base64Data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const res = (reader.result as string) || '';
            resolve(res.split(',')[1] || '');
          };
          reader.onerror = () => resolve('');
          reader.readAsDataURL(blob);
        });
      } catch {}
    }

    // Limpa os buffers para a próxima fala
    measuredPitches = [];
    measuredEnergies = [];
    measuredSpectra = [];
    audioChunks = [];

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
        ? '🎙️ Ouvindo você... Pode falar'
        : '🟢 Vigília ativa: Diga "Jarvis" ou toque no Globo';
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
      const lower = liveText.toLowerCase();

      const wakeWordPattern =
        /(?:oi|ol[aá]|ei|ok|fala|al[oô]|e a[ií])?\s*(jarvis|j[aá]vis|jarves|iarvis|jarbas|chaves|j[aá]rvis)/i;

      // 1. Detectou a Wake Word ("Jarvis")
      if (!isJarvisAwake.value && wakeWordPattern.test(lower)) {
        isJarvisAwake.value = true;
        playJarvisChime('wake');

        const parts = liveText.split(wakeWordPattern);
        const afterWake = parts.pop()?.replace(/^[,.\s!?-]+/, '').trim() || '';

        if (afterWake.length > 2) {
          speechAccumulatedBuffer = afterWake;
          if (onTextChange) onTextChange(afterWake);
          voiceStatusText.value = `🎙️ "${afterWake}"`;
        } else {
          // Aguarda 1.8s para ver se a pessoa vai continuar a frase ou se disse apenas "Jarvis"
          speechAccumulatedBuffer = '';
          voiceStatusText.value = '🎙️ Sim? Estou ouvindo...';
          speechSilenceTimer = setTimeout(async () => {
            if (isJarvisAwake.value && speechAccumulatedBuffer.trim().length === 0) {
              const bioPayload = await buildVoiceBiometricPayloadAsync();
              isJarvisAwake.value = false;
              onCommandDetected('Jarvis', bioPayload);
            }
          }, 1800);
          return;
        }
      }

      // 2. Já está acordado ouvindo o comando
      if (isJarvisAwake.value && liveText.length > 1) {
        const cleaned = liveText.replace(wakeWordPattern, '').replace(/^[,.\s!?-]+/, '').trim() || liveText;
        if (onTextChange) onTextChange(cleaned);
        voiceStatusText.value = `🎙️ "${cleaned}"`;

        speechSilenceTimer = setTimeout(async () => {
          if (cleaned.length > 1) {
            playJarvisChime('send');
            voiceStatusText.value = '⚡ Identificando voz e processando...';
            const bioPayload = await buildVoiceBiometricPayloadAsync();
            isJarvisAwake.value = false;
            speechAccumulatedBuffer = '';
            vadDetectedHumanSpeech = false;
            onCommandDetected(cleaned, bioPayload);
          }
        }, 1800);
      }
    };

    rec.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        isVigilanceEnabled.value = false;
        voiceStatusText.value = '⚠️ Permissão de microfone bloqueada';
      }
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
    if (isJarvisAwake.value || isJarvisSpeaking.value) {
      isJarvisAwake.value = false;
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      isJarvisSpeaking.value = false;
      voiceStatusText.value = '🟢 Vigília ativa: Diga "Jarvis" ou toque no Globo';
      return;
    }

    isVigilanceEnabled.value = true;
    playJarvisChime('wake');
    const hasPerm = await startAcousticBiometricCapture();
    if (!hasPerm) {
      voiceStatusText.value = '⚠️ Autorize o microfone no navegador';
      return;
    }

    speechAccumulatedBuffer = '';
    measuredPitches = [];
    measuredEnergies = [];
    measuredSpectra = [];
    audioChunks = [];
    isJarvisAwake.value = true;
    voiceStatusText.value = '🎙️ Ouvindo você... Pode falar!';

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
      .replace(/```[\s\S]*?```/g, 'bloco de código na tela.')
      .replace(/[*#_`~>|]/g, '')
      .trim();

    const finish = () => {
      isJarvisSpeaking.value = false;
      // Se o Jarvis pediu a confirmação ou próxima amostra do Voice Match, já deixa o microfone aberto!
      if (/com quem estou falando|diga mais uma frase|s[oó] mais uma vez|para eu calibrar/i.test(cleanText)) {
        isJarvisAwake.value = true;
        voiceStatusText.value = '🎙️ Voice Match ativo: Pode falar sua frase...';
      } else {
        voiceStatusText.value = '🟢 Vigília ativa: Diga "Jarvis" ou toque no Globo';
      }

      if (isVigilanceEnabled.value && recognition) {
        setTimeout(() => {
          try { recognition.start(); } catch {}
        }, 250);
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
        audio.onerror = finish;
        await audio.play();
        return;
      }
    } catch {}

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'pt-BR';
        utterance.rate = 1.06;
        utterance.pitch = 0.95;
        utterance.onend = finish;
        utterance.onerror = finish;
        window.speechSynthesis.speak(utterance);
      }, 80);
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
