// src/frontend/composables/useVoiceAndAudio.ts
import { ref } from 'vue';

export function useVoiceAndAudio(
  onCommandDetected: (text: string, audioSignaturePayload?: string) => void
) {
  const isVigilanceEnabled = ref<boolean>(true); // Mantém o ouvido atento ao "Jarvis"
  const isJarvisAwake = ref<boolean>(false);
  const isJarvisSpeaking = ref<boolean>(false);
  const isRecordingAudio = ref<boolean>(false);
  const voiceStatusText = ref<string>('🟢 Vigília ativa: Diga "Jarvis" ou toque no Globo');
  const isVoiceMuted = ref<boolean>(false);

  let recognition: any = null;
  let speechSilenceTimer: any = null;
  let speechAccumulatedBuffer = '';
  let lastChimeTimestamp = 0;

  // Analisador acústico em tempo real (Pitch Hz + Energia + MediaRecorder)
  let localAudioStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let pitchMonitorInterval: any = null;
  let measuredPitches: number[] = [];
  let measuredEnergies: number[] = [];
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let latestAudioBase64 = '';

  function playJarvisChime(type: 'wake' | 'send' = 'wake') {
    const now = Date.now();
    if (now - lastChimeTimestamp < 1500 && type === 'wake') return;
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

  // Algoritmo de Autocorrelação para medir a frequência da voz (Homem ~110Hz, Mulher ~200Hz, Criança ~280Hz)
  function detectPitchFromBuffer(buf: Float32Array, sampleRate: number): { pitch: number; rms: number } {
    let sumSquares = 0;
    for (let i = 0; i < buf.length; i++) {
      sumSquares += buf[i] * buf[i];
    }
    const rms = Math.sqrt(sumSquares / buf.length);
    if (rms < 0.015) return { pitch: -1, rms }; // Silêncio

    const minPeriod = Math.floor(sampleRate / 380); // Até 380 Hz
    const maxPeriod = Math.floor(sampleRate / 75);  // A partir de 75 Hz
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

  // Inicia o medidor de frequência vocal e gravador de voz em paralelo
  async function startAcousticBiometricCapture(): Promise<boolean> {
    try {
      if (!localAudioStream || !localAudioStream.active) {
        localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

      measuredPitches = [];
      measuredEnergies = [];

      if (pitchMonitorInterval) clearInterval(pitchMonitorInterval);
      pitchMonitorInterval = setInterval(() => {
        if (!analyserNode || !audioContext || isJarvisSpeaking.value) return;
        const buffer = new Float32Array(analyserNode.fftSize);
        analyserNode.getFloatTimeDomainData(buffer);
        const { pitch, rms } = detectPitchFromBuffer(buffer, audioContext.sampleRate);
        if (pitch > 0) {
          measuredPitches.push(pitch);
          measuredEnergies.push(rms);
          if (measuredPitches.length > 40) measuredPitches.shift();
          if (measuredEnergies.length > 40) measuredEnergies.shift();
        }
      }, 60);

      // Inicia gravação de chunks para enviar ao backend/Whisper
      audioChunks = [];
      mediaRecorder = new MediaRecorder(localAudioStream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        isRecordingAudio.value = false;
        if (audioChunks.length > 0) {
          const blob = new Blob(audioChunks, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = () => {
            latestAudioBase64 = ((reader.result as string) || '').split(',')[1] || '';
          };
        }
      };
      mediaRecorder.start(250);
      isRecordingAudio.value = true;
      return true;
    } catch (err) {
      console.warn('Permissão de microfone pendente:', err);
      return false;
    }
  }

  function buildVoiceBiometricPayload(): string {
    const avgPitch =
      measuredPitches.length > 0
        ? (measuredPitches.reduce((a, b) => a + b, 0) / measuredPitches.length).toFixed(2)
        : '130.00';
    const avgEnergy =
      measuredEnergies.length > 0
        ? (measuredEnergies.reduce((a, b) => a + b, 0) / measuredEnergies.length).toFixed(4)
        : '0.0500';

    return `PITCH:${avgPitch}|ENERGY:${avgEnergy}|DATA:${latestAudioBase64 || 'SPEECH_API_SAMPLE'}`;
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
      voiceStatusText.value = isJarvisAwake.value
        ? '🎙️ Ouvindo você... Pode falar'
        : '🟢 Vigília ativa: Diga "Jarvis" ou toque no Globo';
    };

    rec.onresult = (event: any) => {
      if (isJarvisSpeaking.value) return;
      if (speechSilenceTimer) clearTimeout(speechSilenceTimer);

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

      // Reconhece variações fonéticas de "Jarvis" em português
      const wakeWordPattern =
        /(?:oi|ol[aá]|ei|ok|fala|al[oô]|e a[ií])?\s*(jarvis|j[aá]vis|jarves|iarvis|jarbas|chaves|j[aá]rvis)/i;

      // 1. Se estava apenas em vigília e ouviu "Jarvis"
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
          // Chamou apenas "Jarvis" -> Dispara para o backend verificar a voz da pessoa ou saudar!
          speechAccumulatedBuffer = '';
          if (onTextChange) onTextChange('');
          const bioPayload = buildVoiceBiometricPayload();
          isJarvisAwake.value = false;
          onCommandDetected('Jarvis', bioPayload);
          return;
        }
      }

      // 2. Se já está acordado ouvindo o comando
      if (isJarvisAwake.value && liveText.length > 1) {
        const cleaned = liveText.replace(wakeWordPattern, '').replace(/^[,.\s!?-]+/, '').trim() || liveText;
        if (onTextChange) onTextChange(cleaned);
        voiceStatusText.value = `🎙️ "${cleaned}"`;

        // Aguarda 2 segundos de pausa (respiração) antes de enviar
        speechSilenceTimer = setTimeout(() => {
          if (cleaned.length > 1) {
            playJarvisChime('send');
            voiceStatusText.value = '⚡ Processando voz e comando...';
            const bioPayload = buildVoiceBiometricPayload();
            isJarvisAwake.value = false;
            speechAccumulatedBuffer = '';
            measuredPitches = [];
            onCommandDetected(cleaned, bioPayload);
          }
        }, 2000);
      }
    };

    rec.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        isVigilanceEnabled.value = false;
        voiceStatusText.value = '⚠️ Permissão de microfone bloqueada';
      }
    };

    // RECONEXÃO AUTOMÁTICA SILENCIOSA: Mantém a escuta do "Jarvis" viva 24h!
    rec.onend = () => {
      if (isVigilanceEnabled.value && !isJarvisSpeaking.value) {
        setTimeout(() => {
          try {
            rec.start();
          } catch {}
        }, 350);
      }
    };

    return rec;
  }

  // Ao clicar no Globo 3D ou no botão de Microfone
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
      voiceStatusText.value = '⚠️ Autorize o microfone nas permissões do aparelho';
      return;
    }

    speechAccumulatedBuffer = '';
    isJarvisAwake.value = true;
    voiceStatusText.value = '🎙️ Ouvindo você... Pode falar!';

    if (!recognition) recognition = initSTT(onTextChange);
    try {
      recognition?.start();
    } catch {}
  }

  function stopMicrophoneSession() {
    if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
    isJarvisAwake.value = false;
    speechAccumulatedBuffer = '';
  }

  async function speakJarvisResponse(rawText: string, onDone?: () => void) {
    if (isVoiceMuted.value || !rawText) {
      if (onDone) onDone();
      return;
    }

    isJarvisSpeaking.value = true;
    if (recognition) {
      try { recognition.stop(); } catch {}
    }

    const cleanText = rawText
      .replace(/```[\s\S]*?```/g, 'bloco de código na tela.')
      .replace(/[*#_`~>|]/g, '')
      .trim();

    const finish = () => {
      isJarvisSpeaking.value = false;
      // Se o JARVIS acabou de perguntar "Com quem estou falando?", já abre a escuta ativa automaticamente!
      if (/com quem estou falando|quem est[aá] falando|qual [eé] o seu nome/i.test(cleanText)) {
        isJarvisAwake.value = true;
        voiceStatusText.value = '🎙️ Diga "Sou o [Seu Nome]" para eu gravar sua voz...';
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

  function setupAudioUnlockListener() {
    const unlock = async () => {
      await startAcousticBiometricCapture();
      if (!recognition) recognition = initSTT();
      try { recognition?.start(); } catch {}
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