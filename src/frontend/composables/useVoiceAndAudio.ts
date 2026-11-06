// src/frontend/composables/useVoiceAndAudio.ts
import { ref } from 'vue';

export function useVoiceAndAudio(
  onCommandDetected: (text: string, audioBase64?: string) => void
) {
  const isJarvisAwake = ref<boolean>(false);
  const isJarvisSpeaking = ref<boolean>(false);
  const isRecordingAudio = ref<boolean>(false);
  const voiceStatusText = ref<string>('Toque no Globo ou diga "Jarvis"');
  const isVoiceMuted = ref<boolean>(false);

  let recognition: any = null;
  let speechSilenceTimer: any = null;
  let speechAccumulatedBuffer = '';
  let lastChimeTimestamp = 0;
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let localAudioStream: MediaStream | null = null;

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

      gain.gain.setValueAtTime(0.09, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
      setTimeout(() => ctx.close().catch(() => {}), 300);
    } catch {}
  }

  async function ensureMicrophonePermission(): Promise<boolean> {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        if (!localAudioStream || !localAudioStream.active) {
          localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        return true;
      }
    } catch (err) {
      console.warn('Microfone não acessível:', err);
      return false;
    }
    return false;
  }

  async function startWhisperFallbackRecording(onFallbackText?: (text: string) => void) {
    if (!localAudioStream) return;
    try {
      audioChunks = [];
      mediaRecorder = new MediaRecorder(localAudioStream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        isRecordingAudio.value = false;
        if (audioChunks.length === 0) return;

        voiceStatusText.value = '⚡ Processando áudio...';
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          if (!base64Audio) return;

          try {
            const res = await fetch('/api/v1/audio/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioBase64: base64Audio })
            });
            const data = await res.json();
            if (data.success && data.text && data.text.trim().length > 1) {
              const spoken = data.text.trim();
              if (onFallbackText) onFallbackText(spoken);

              if (/^(oi\s+|ol[aá]\s+)?(jarvis|j[aá]vis)[.!?,\s]*$/i.test(spoken)) {
                speakJarvisResponse('Sim, senhor? Estou ouvindo.', () => activateDirectListening());
              } else {
                onCommandDetected(spoken, base64Audio);
              }
            } else {
              voiceStatusText.value = 'Toque no Globo ou diga "Jarvis"';
            }
          } catch {
            voiceStatusText.value = 'Toque no Globo ou diga "Jarvis"';
          }
        };
      };
      mediaRecorder.start();
      isRecordingAudio.value = true;
    } catch {}
  }

  function stopWhisperFallbackRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      try { mediaRecorder.stop(); } catch {}
    }
    isRecordingAudio.value = false;
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
      const wakeWordPattern = /(?:oi|ol[aá]|ei|ok|fala|al[oô])?\s*(jarvis|j[aá]vis|jarves|iarvis|jarbas)/i;

      // Detecção de Wake Word
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
          speechAccumulatedBuffer = '';
          if (onTextChange) onTextChange('');
          voiceStatusText.value = '🔊 "Sim, senhor? Estou ouvindo..."';
          speakJarvisResponse('Sim, senhor? Estou ouvindo.', () => {
            activateDirectListening(onTextChange);
          });
          return;
        }
      }

      // Escuta ativa
      if (isJarvisAwake.value && liveText.length > 1) {
        const cleaned = liveText.replace(wakeWordPattern, '').replace(/^[,.\s!?-]+/, '').trim();
        if (!cleaned) return;

        if (onTextChange) onTextChange(cleaned);
        voiceStatusText.value = `🎙️ "${cleaned}"`;

        speechSilenceTimer = setTimeout(() => {
          if (cleaned.length > 1) {
            playJarvisChime('send');
            voiceStatusText.value = '⚡ Processando comando...';
            stopMicrophoneSession();
            onCommandDetected(cleaned);
          }
        }, 2100);
      }
    };

    rec.onerror = (event: any) => {
      if (['service-not-allowed', 'network'].includes(event.error)) {
        if (isJarvisAwake.value && !isRecordingAudio.value) {
          startWhisperFallbackRecording(onTextChange);
        }
      }
    };

    rec.onend = () => {
      if (isJarvisAwake.value && !isJarvisSpeaking.value) {
        try { rec.start(); } catch {}
      }
    };

    return rec;
  }

  function activateDirectListening(onTextChange?: (text: string) => void) {
    speechAccumulatedBuffer = '';
    isJarvisAwake.value = true;
    voiceStatusText.value = '🎙️ Ouvindo você... Pode falar';

    if (!recognition) recognition = initSTT(onTextChange);
    try { recognition?.start(); } catch {}
    startWhisperFallbackRecording(onTextChange);

    if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
    speechSilenceTimer = setTimeout(() => {
      if (isJarvisAwake.value) {
        stopMicrophoneSession();
        voiceStatusText.value = 'Toque no Globo ou diga "Jarvis"';
      }
    }, 5500);
  }

  async function onJarvisCoreClick(onTextChange?: (text: string) => void) {
    if (isJarvisAwake.value || isJarvisSpeaking.value) {
      stopMicrophoneSession();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      isJarvisSpeaking.value = false;
      voiceStatusText.value = 'Toque no Globo ou diga "Jarvis"';
      return;
    }

    playJarvisChime('wake');
    const hasPerm = await ensureMicrophonePermission();
    if (!hasPerm) {
      voiceStatusText.value = '⚠️ Microfone inacessível no app';
      speakJarvisResponse('Sim, senhor? Digite sua mensagem abaixo ou abra pelo navegador.');
      return;
    }

    activateDirectListening(onTextChange);
  }

  function stopMicrophoneSession() {
    if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
    isJarvisAwake.value = false;
    speechAccumulatedBuffer = '';
    stopWhisperFallbackRecording();
    if (recognition) {
      try { recognition.stop(); } catch {}
    }
  }

  async function speakJarvisResponse(rawText: string, onDone?: () => void) {
    if (isVoiceMuted.value || !rawText) {
      if (onDone) onDone();
      return;
    }

    stopMicrophoneSession();
    isJarvisSpeaking.value = true;

    const cleanText = rawText
      .replace(/```[\s\S]*?```/g, 'bloco de código.')
      .replace(/[*#_`~>|]/g, '')
      .trim();

    const finish = () => {
      isJarvisSpeaking.value = false;
      if (!isJarvisAwake.value) {
        voiceStatusText.value = 'Toque no Globo ou diga "Jarvis"';
      }
      if (onDone) onDone();
    };

    // 1. Tenta sintetizador backend
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

    // 2. Fallback navegador
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
    stopMicrophoneSession();
    if (localAudioStream) {
      localAudioStream.getTracks().forEach((t) => t.stop());
      localAudioStream = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  function setupAudioUnlockListener() {
    const unlock = async () => {
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