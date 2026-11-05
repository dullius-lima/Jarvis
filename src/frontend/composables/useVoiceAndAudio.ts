// Wake word ("Jarvis"), STT contínuo, bipe e TTS local/API

import { ref } from 'vue';

export function useVoiceAndAudio(onVoiceCommand: (text: string) => void) {
  const isAlwaysListening = ref<boolean>(false);
  const isJarvisAwake = ref<boolean>(false);
  const isJarvisSpeaking = ref<boolean>(false);
  const isVoiceMuted = ref<boolean>(false);
  const isRecognitionActive = ref<boolean>(false);
  const voiceStatusText = ref<string>('🎙️ Clique no microfone para falar');

  let wakeRecognition: any = null;
  let wakeTimeoutId: any = null;
  let lastChimeTime = 0;
  let consecutiveNoSpeechCount = 0;
  let currentAudioElement: HTMLAudioElement | null = null;

  function playJarvisChime(type: 'wake' | 'send' = 'wake') {
    const now = Date.now();
    if (type === 'wake' && now - lastChimeTime < 3000) return;
    lastChimeTime = now;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      if (type === 'wake') {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
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
      setTimeout(() => ctx.close().catch(() => {}), 300);
    } catch {}
  }

  function initWakeWordListener(singleShotCommand = false) {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      voiceStatusText.value = '⚠️ Reconhecimento de voz requer Chrome ou Edge.';
      return;
    }
    if (isRecognitionActive.value && wakeRecognition) return;

    if (!wakeRecognition) {
      wakeRecognition = new SpeechRec();
      wakeRecognition.lang = 'pt-BR';
      wakeRecognition.interimResults = false;
    }

    wakeRecognition.continuous = !singleShotCommand && isAlwaysListening.value;

    wakeRecognition.onstart = () => {
      isRecognitionActive.value = true;
      voiceStatusText.value = isJarvisAwake.value
        ? '🎙️ Ouvindo seu comando...'
        : isAlwaysListening.value
        ? '🟢 Vigília ativa: diga "Jarvis"...'
        : '🎙️ Pronto para ouvir comando';
    };

    wakeRecognition.onresult = (event: any) => {
      if (isJarvisSpeaking.value) return;
      consecutiveNoSpeechCount = 0;

      const lastIdx = event.results.length - 1;
      const result = event.results[lastIdx];
      if (!result || !result[0]) return;

      const transcript = String(result[0].transcript || '').trim();
      const lower = transcript.toLowerCase();

      if (isJarvisAwake.value && transcript.length > 1) {
        const cleanCmd = transcript.replace(/^(jarvis|jávis|jarves)[,.\s!?-]*/i, '').trim();
        if (cleanCmd.length > 1) {
          isJarvisAwake.value = false;
          if (wakeTimeoutId) clearTimeout(wakeTimeoutId);
          playJarvisChime('send');
          voiceStatusText.value = `⚡ Processando: "${cleanCmd}"`;
          onVoiceCommand(cleanCmd);
          return;
        }
      }

      if (lower.includes('jarvis') || lower.includes('jávis') || lower.includes('jarves')) {
        const afterWake = transcript
          .split(/jarvis|jávis|jarves/i)
          .pop()
          ?.replace(/^[,.\s!?-]+/, '')
          .trim() || '';

        if (afterWake.length > 3) {
          playJarvisChime('wake');
          voiceStatusText.value = `⚡ Comando: "${afterWake}"`;
          onVoiceCommand(afterWake);
        } else {
          isJarvisAwake.value = true;
          playJarvisChime('wake');
          voiceStatusText.value = '🎙️ Sim, senhor? Diga seu comando...';
          speakJarvisResponse('Sim, senhor? Estou ouvindo.', () => {
            if (wakeTimeoutId) clearTimeout(wakeTimeoutId);
            wakeTimeoutId = setTimeout(() => {
              if (isJarvisAwake.value) {
                isJarvisAwake.value = false;
                voiceStatusText.value = isAlwaysListening.value
                  ? '🟢 Vigília ativa: diga "Jarvis"...'
                  : '🎙️ Clique no microfone para falar';
              }
            }, 8000);
          });
        }
      }
    };

    wakeRecognition.onerror = (ev: any) => {
      isRecognitionActive.value = false;
      if (ev.error === 'no-speech') {
        consecutiveNoSpeechCount++;
        if (consecutiveNoSpeechCount >= 3) {
          isAlwaysListening.value = false;
          isJarvisAwake.value = false;
          voiceStatusText.value = '🎙️ Microfone em pausa (clique para falar)';
        }
        return;
      }
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'aborted', 'network'].includes(ev.error)) {
        isAlwaysListening.value = false;
        isJarvisAwake.value = false;
        voiceStatusText.value = '🔴 Microfone pausado (clique no 🎙️ para falar)';
      }
    };

    wakeRecognition.onend = () => {
      isRecognitionActive.value = false;
      if (isAlwaysListening.value && !isJarvisSpeaking.value && consecutiveNoSpeechCount < 3) {
        setTimeout(() => {
          if (isAlwaysListening.value && !isJarvisSpeaking.value && !isRecognitionActive.value) {
            try {
              wakeRecognition.start();
            } catch {}
          }
        }, 1500);
      } else {
        isJarvisAwake.value = false;
        if (!isJarvisSpeaking.value) {
          voiceStatusText.value = isAlwaysListening.value
            ? '🟢 Vigília ativa: diga "Jarvis"...'
            : '🎙️ Clique no microfone para falar';
        }
      }
    };

    try {
      wakeRecognition.start();
    } catch {}
  }

  function toggleMicrophone() {
    consecutiveNoSpeechCount = 0;
    if (isRecognitionActive.value || isJarvisAwake.value) {
      isAlwaysListening.value = false;
      isJarvisAwake.value = false;
      isRecognitionActive.value = false;
      if (wakeRecognition) {
        try {
          wakeRecognition.stop();
        } catch {}
      }
      voiceStatusText.value = '🎙️ Microfone desligado.';
      return;
    }
    isJarvisAwake.value = true;
    playJarvisChime('wake');
    initWakeWordListener(true);
  }

  function manualRestartWakeWord() {
    consecutiveNoSpeechCount = 0;
    isAlwaysListening.value = !isAlwaysListening.value;
    if (isAlwaysListening.value) {
      initWakeWordListener(false);
    } else {
      if (wakeRecognition) {
        try {
          wakeRecognition.stop();
        } catch {}
      }
      voiceStatusText.value = '🎙️ Vigília desativada (clique para falar)';
    }
  }

  async function speakJarvisResponse(rawText: string, onDoneCallback?: () => void) {
    if (isVoiceMuted.value || !rawText) {
      if (onDoneCallback) onDoneCallback();
      return;
    }
    if (currentAudioElement) {
      try {
        currentAudioElement.pause();
        currentAudioElement = null;
      } catch {}
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    isJarvisSpeaking.value = true;
    if (wakeRecognition && isRecognitionActive.value) {
      try {
        wakeRecognition.stop();
      } catch {}
    }

    const finishSpeaking = () => {
      isJarvisSpeaking.value = false;
      if (onDoneCallback) onDoneCallback();
      if (isAlwaysListening.value) {
        setTimeout(() => {
          if (!isJarvisSpeaking.value && !isRecognitionActive.value) {
            try {
              initWakeWordListener(false);
            } catch {}
          }
        }, 800);
      }
    };

    const cleanText = rawText
      .replace(/```[\s\S]*?```/g, 'bloco de código exibido na tela.')
      .replace(/[*#_`~>|]/g, '')
      .replace(/https?:\/\/\S+/g, 'link na tela')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) {
      finishSpeaking();
      return;
    }

    try {
      const response = await fetch('/api/v1/audio/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, mode: 'auto' })
      });
      if (response.ok) {
        const audioData = await response.json().catch(() => null);
        if (audioData?.success && audioData?.audioBase64) {
          const audio = new Audio(`data:${audioData.mimeType || 'audio/mpeg'};base64,${audioData.audioBase64}`);
          currentAudioElement = audio;
          audio.onended = () => {
            currentAudioElement = null;
            finishSpeaking();
          };
          audio.onerror = () => {
            currentAudioElement = null;
            fallbackSpeechSynthesis(cleanText, finishSpeaking);
          };
          await audio.play();
          return;
        }
      }
    } catch {}

    fallbackSpeechSynthesis(cleanText, finishSpeaking);
  }

  function fallbackSpeechSynthesis(text: string, onComplete: () => void) {
    if (!('speechSynthesis' in window)) {
      onComplete();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();

      setTimeout(() => {
        const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
        const voices = window.speechSynthesis.getVoices();
        const ptVoice =
          voices.find(
            (v) =>
              v.lang.toLowerCase().includes('pt') &&
              (v.name.includes('Antonio') || v.name.includes('Francisca') || v.name.includes('Google'))
          ) || voices.find((v) => v.lang.toLowerCase().startsWith('pt'));

        sentences.forEach((sentence, idx) => {
          const trimmed = sentence.trim();
          if (!trimmed) return;
          const utterance = new SpeechSynthesisUtterance(trimmed);
          utterance.lang = 'pt-BR';
          utterance.rate = 1.08;
          utterance.pitch = 0.95;
          if (ptVoice) utterance.voice = ptVoice;
          if (idx === sentences.length - 1) {
            utterance.onend = () => onComplete();
            utterance.onerror = () => onComplete();
          }
          window.speechSynthesis.speak(utterance);
        });
      }, 80);
    } catch {
      onComplete();
    }
  }

  function stopAllAudio() {
    if (wakeRecognition) {
      try {
        wakeRecognition.stop();
      } catch {}
    }
  }

  return {
    isAlwaysListening,
    isJarvisAwake,
    isJarvisSpeaking,
    isVoiceMuted,
    isRecognitionActive,
    voiceStatusText,
    toggleMicrophone,
    manualRestartWakeWord,
    speakJarvisResponse,
    stopAllAudio
  };
}