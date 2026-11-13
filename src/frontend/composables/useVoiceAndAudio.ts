import { ref, onMounted, onUnmounted } from 'vue';

export function useVoiceAndAudio(onCommandDetected: (text: string, audioSample?: string) => Promise<void> | void) {
  const isListening = ref(false);
  const isJarvisAwake = ref(false);
  const isJarvisSpeaking = ref(false);
  const isRecordingAudio = ref(false);
  const isVoiceMuted = ref(false);
  const isVoiceSupported = ref(true);
  const voiceStatusText = ref('🟢 Vigília ativa: Diga "Jarvis"...');
  const activeVoiceProfileName = ref<string>('Matheus');
  const currentPitchHz = ref<number>(0);
  const latestAudioBase64 = ref<string | null>(null);

  let recognition: any = null;
  let awakeTimer: any = null;
  let restartTimer: any = null;
  let lastChimeAt = 0;
  let audioUnlocked = false;
  let currentTtsAudio: HTMLAudioElement | null = null;
  let shouldBeListening = true;

  function ensureAudioUnlocked() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        setTimeout(() => ctx.close().catch(() => {}), 200);
      }
      if ('speechSynthesis' in window) window.speechSynthesis.resume();
    } catch {}
  }

  function setupAudioUnlockListener() {
    ensureAudioUnlocked();
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', ensureAudioUnlocked, { once: true });
      window.addEventListener('touchstart', ensureAudioUnlocked, { once: true });
    }
  }

  function playActivationSignal(type: 'wake' | 'confirm' | 'send' = 'wake') {
    const now = Date.now();
    if (type === 'wake' && now - lastChimeAt < 900) return;
    lastChimeAt = now;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(type === 'wake' ? 660 : 880, ctx.currentTime);
      osc.frequency.setValueAtTime(type === 'wake' ? 990 : 1174, ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
      setTimeout(() => ctx.close().catch(() => {}), 220);
    } catch {}
  }

  function keepAwakeWindow(seconds = 20) {
    isJarvisAwake.value = true;
    isRecordingAudio.value = true;
    voiceStatusText.value = '🎙️ Ouvindo... pode falar';
    if (awakeTimer) clearTimeout(awakeTimer);
    awakeTimer = setTimeout(() => {
      isJarvisAwake.value = false;
      isRecordingAudio.value = false;
      voiceStatusText.value = '🟢 Vigília ativa: Diga "Jarvis"...';
    }, seconds * 1000);
  }

  function stopAllAudio() {
    if (currentTtsAudio) {
      try { currentTtsAudio.pause(); currentTtsAudio = null; } catch {}
    }
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
    isJarvisSpeaking.value = false;
  }

  async function speakJarvisResponse(rawText: string) {
    if (isVoiceMuted.value || !rawText) return;
    const cleanText = rawText
      .replace(/```[\s\S]*?```/g, '')
      .replace(/[*#_`~>|]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleanText) return;

    isJarvisSpeaking.value = true;
    stopRecognitionInstance();

    const finishSpeaking = () => {
      isJarvisSpeaking.value = false;
      if (shouldBeListening && !document.hidden) {
        // Mantém a conversa aberta por 20s após responder para continuidade natural
        keepAwakeWindow(20);
        setTimeout(() => startContinuousVigilance(), 250);
      }
    };

    try {
      const res = await fetch('/api/v1/audio/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, mode: 'auto' })
      });
      const data = await res.json();
      if (data.success && data.audioBase64) {
        if (currentTtsAudio) currentTtsAudio.pause();
        currentTtsAudio = new Audio(`data:${data.mimeType || 'audio/mpeg'};base64,${data.audioBase64}`);
        currentTtsAudio.onended = finishSpeaking;
        currentTtsAudio.onerror = finishSpeaking;
        await currentTtsAudio.play();
        return;
      }
    } catch {}

    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        setTimeout(() => {
          window.speechSynthesis.resume();
          const utter = new SpeechSynthesisUtterance(cleanText);
          utter.lang = 'pt-BR';
          utter.rate = 1.06;
          utter.onend = finishSpeaking;
          utter.onerror = finishSpeaking;
          window.speechSynthesis.speak(utter);
        }, 60);
        return;
      } catch {}
    }
    finishSpeaking();
  }

  function stopRecognitionInstance() {
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
    if (recognition) {
      try { recognition.onend = null; recognition.onerror = null; recognition.stop(); } catch {}
      recognition = null;
    }
    isListening.value = false;
  }

  function startContinuousVigilance() {
    shouldBeListening = true;
    if (isJarvisSpeaking.value || document.hidden) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      isVoiceSupported.value = false;
      voiceStatusText.value = '🟢 Escuta nativa em segundo plano ativa';
      return;
    }

    stopRecognitionInstance();
    recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      isListening.value = true;
      voiceStatusText.value = isJarvisAwake.value ? '🎙️ Ouvindo... pode falar' : '🟢 Vigília ativa: Diga "Jarvis"...';
    };

    recognition.onresult = async (event: any) => {
      if (isJarvisSpeaking.value) return;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const rawTranscript = result[0].transcript.trim();
        const normalized = rawTranscript.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const hasWakeWord = /\b(jarvis|javis|jarves|javes|iarvis|yarvis|jarbas|chaves)\b/i.test(normalized);

        if (hasWakeWord && !isJarvisAwake.value) {
          playActivationSignal('wake');
          keepAwakeWindow(20);
        }

        if (result.isFinal && (hasWakeWord || isJarvisAwake.value)) {
          const cleanedCommand = rawTranscript
            .replace(/^(?:oi|ol[aá]|ei|ok|fala|e\s*a[ií])?[\s,.-]*(?:jarvis|j[aá]vis|jarves|javes|iarvis|jarbas|chaves|j\.a\.r\.v\.i\.s\.?)[\s,.:!?-]*/i, '')
            .trim();

          // Se disse apenas "Jarvis", NÃO fala "Sim senhor": apenas mantém o microfone aberto!
          if (cleanedCommand.length < 2) {
            playActivationSignal('wake');
            keepAwakeWindow(20);
            return;
          }

          playActivationSignal('confirm');
          keepAwakeWindow(20);
          voiceStatusText.value = `⚡ Executando: "${cleanedCommand}"`;
          await onCommandDetected(cleanedCommand, latestAudioBase64.value || undefined);
          return;
        }
      }
    };

    recognition.onerror = (event: any) => {
      isListening.value = false;
      if (event?.error === 'not-allowed') {
        shouldBeListening = false;
        voiceStatusText.value = '🔴 Permissão de microfone negada';
      }
    };

    recognition.onend = () => {
      isListening.value = false;
      if (shouldBeListening && !isJarvisSpeaking.value && !document.hidden) {
        restartTimer = setTimeout(() => startContinuousVigilance(), 250);
      }
    };

    try { recognition.start(); } catch {
      restartTimer = setTimeout(() => startContinuousVigilance(), 450);
    }
  }

  function stopContinuousVigilance() {
    shouldBeListening = false;
    isJarvisAwake.value = false;
    isRecordingAudio.value = false;
    stopRecognitionInstance();
  }

  function toggleMicrophone() {
    ensureAudioUnlocked();
    playActivationSignal('wake');
    keepAwakeWindow(20);
    startContinuousVigilance();
  }

  function handleVisibilityChange() {
    if (document.hidden) stopRecognitionInstance();
    else if (shouldBeListening) setTimeout(() => startContinuousVigilance(), 300);
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    setTimeout(() => startContinuousVigilance(), 400);
  });

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    stopContinuousVigilance();
  });

  return {
    isListening, isJarvisAwake, isJarvisSpeaking, isRecordingAudio,
    isVoiceMuted, isVoiceSupported, voiceStatusText, activeVoiceProfileName,
    currentPitchHz, latestAudioBase64, ensureAudioUnlocked, setupAudioUnlockListener,
    startContinuousVigilance, stopContinuousVigilance, stopMicrophoneSession: stopContinuousVigilance,
    toggleMicrophone, onJarvisCoreClick: () => toggleMicrophone(),
    speakJarvisResponse, stopAllAudio, playActivationSignal, playJarvisChime: playActivationSignal
  };
}
