import { ref, onMounted, onUnmounted } from 'vue';

export interface JarvisAudioPrefs {
  listen_screen_off: boolean;
  listen_only_unlocked: boolean;
  listen_only_app_open: boolean;
  push_to_talk_only: boolean;
  silent_text_only: boolean;
  chime_enabled: boolean;
  edge_glow_enabled: boolean;
  wake_screen_on_call: boolean;
  privacy_lock_camera: boolean;
  continuous_chat_seconds: number;
  mic_sensitivity: 'high' | 'balanced' | 'noisy';
}

const DEFAULT_PREFS: JarvisAudioPrefs = {
  listen_screen_off: true,
  listen_only_unlocked: false,
  listen_only_app_open: false,
  push_to_talk_only: false,
  silent_text_only: false,
  chime_enabled: true,
  edge_glow_enabled: true,
  wake_screen_on_call: true,
  privacy_lock_camera: false,
  continuous_chat_seconds: 15,
  mic_sensitivity: 'balanced'
};

export function useVoiceAndAudio(
  onCommandDetected: (text: string, audioSample?: string) => Promise<void> | void
) {
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
  let userPrefs: JarvisAudioPrefs = { ...DEFAULT_PREFS };

  function loadCachedPrefs() {
    try {
      const raw = localStorage.getItem('jarvis_user_prefs');
      if (raw) {
        userPrefs = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
      }
    } catch {}
    applyPrefsState();
  }

  function applyPrefsState() {
    isVoiceMuted.value = Boolean(userPrefs.silent_text_only);
    if (userPrefs.push_to_talk_only) {
      shouldBeListening = false;
      if (!isJarvisAwake.value) {
        stopRecognitionInstance();
        voiceStatusText.value = '🎙️ Modo Push-to-Talk: toque no Globo para falar';
      }
    } else {
      shouldBeListening = true;
      if (!isListening.value && !isJarvisSpeaking.value && !document.hidden) {
        voiceStatusText.value = isJarvisAwake.value
          ? '🎙️ Conversa ativa... pode falar'
          : '🟢 Vigília ativa: Diga "Jarvis"...';
      }
    }
  }

  async function syncFrontendAudioPrefs() {
    loadCachedPrefs();
    try {
      const res = await fetch('/api/v1/preferences');
      const data = await res.json();
      if (data?.success && data?.data) {
        userPrefs = { ...DEFAULT_PREFS, ...data.data };
        localStorage.setItem('jarvis_user_prefs', JSON.stringify(userPrefs));
        applyPrefsState();
      }
    } catch {}
  }

  function handlePrefsEvent(e: Event) {
    const custom = e as CustomEvent<Partial<JarvisAudioPrefs>>;
    if (custom?.detail) {
      userPrefs = { ...userPrefs, ...custom.detail };
      localStorage.setItem('jarvis_user_prefs', JSON.stringify(userPrefs));
      applyPrefsState();
      if (!userPrefs.push_to_talk_only && !isListening.value && !isJarvisSpeaking.value) {
        startContinuousVigilance();
      }
    } else {
      loadCachedPrefs();
    }
  }

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
    if (!userPrefs.chime_enabled || userPrefs.silent_text_only) return;
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
      gain.gain.setValueAtTime(0.16, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
      setTimeout(() => ctx.close().catch(() => {}), 220);
    } catch {}
  }

  function closeAwakeWindow() {
    if (awakeTimer) {
      clearTimeout(awakeTimer);
      awakeTimer = null;
    }
    isJarvisAwake.value = false;
    isRecordingAudio.value = false;
    voiceStatusText.value = userPrefs.push_to_talk_only
      ? '🎙️ Modo Push-to-Talk: toque no Globo para falar'
      : '🟢 Vigília ativa: Diga "Jarvis"...';
    if (userPrefs.push_to_talk_only) {
      stopRecognitionInstance();
    }
  }

  function keepAwakeWindow(seconds?: number) {
    const windowSec = typeof seconds === 'number'
      ? seconds
      : Math.max(10, Number(userPrefs.continuous_chat_seconds ?? 15));

    isJarvisAwake.value = true;
    isRecordingAudio.value = true;
    voiceStatusText.value = `🎙️ Ouvindo (${windowSec}s)... pode falar`;

    if (awakeTimer) clearTimeout(awakeTimer);
    awakeTimer = setTimeout(() => {
      closeAwakeWindow();
    }, windowSec * 1000);
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
    const cleanText = (rawText || '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/[*#_`~>|]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const followUpAfterReply = () => {
      isJarvisSpeaking.value = false;
      const configuredSec = Number(userPrefs.continuous_chat_seconds ?? 15);
      const normReply = cleanText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const jarvisAskedQuestion =
        cleanText.endsWith('?') ||
        /\b(qual deles|qual contato|qual aparelho|qual comodo|confirma|deseja|quer que eu|pode repetir)\b/.test(normReply);

      // Mantém conversa aberta pelo tempo configurado (padrão 15s) ou 12s se JARVIS fez uma pergunta
      const nextWindowSec = configuredSec > 0 ? configuredSec : (jarvisAskedQuestion ? 12 : 0);

      if (nextWindowSec > 0 && !document.hidden) {
        keepAwakeWindow(nextWindowSec);
        setTimeout(() => startContinuousVigilance(true), 220);
      } else {
        closeAwakeWindow();
        if (!userPrefs.push_to_talk_only && !document.hidden) {
          setTimeout(() => startContinuousVigilance(false), 220);
        }
      }
    };

    if (isVoiceMuted.value || userPrefs.silent_text_only || !cleanText) {
      followUpAfterReply();
      return;
    }

    isJarvisSpeaking.value = true;
    stopRecognitionInstance();

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
        currentTtsAudio.onended = followUpAfterReply;
        currentTtsAudio.onerror = followUpAfterReply;
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
          utter.onend = followUpAfterReply;
          utter.onerror = followUpAfterReply;
          window.speechSynthesis.speak(utter);
        }, 60);
        return;
      } catch {}
    }

    followUpAfterReply();
  }

  function stopRecognitionInstance() {
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
    if (recognition) {
      try { recognition.onend = null; recognition.onerror = null; recognition.stop(); } catch {}
      recognition = null;
    }
    isListening.value = false;
  }

  function startContinuousVigilance(forceManualPush = false) {
    if (userPrefs.push_to_talk_only && !forceManualPush && !isJarvisAwake.value) {
      shouldBeListening = false;
      stopRecognitionInstance();
      voiceStatusText.value = '🎙️ Modo Push-to-Talk: toque no Globo para falar';
      return;
    }

    shouldBeListening = !userPrefs.push_to_talk_only;
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
    recognition.continuous = !userPrefs.push_to_talk_only;
    recognition.interimResults = true;

    recognition.onstart = () => {
      isListening.value = true;
      voiceStatusText.value = isJarvisAwake.value
        ? '🎙️ Ouvindo... pode falar'
        : '🟢 Vigília ativa: Diga "Jarvis"...';
    };

    recognition.onresult = async (event: any) => {
      if (isJarvisSpeaking.value) return;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const rawTranscript = result[0].transcript.trim();
        const normalized = rawTranscript
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');

        // Gatilho limpo: removidas palavras comuns como "chaves"
        const hasWakeWord = /\b(jarvis|javis|jarves|jaives|javes|iarvis|yarvis|jarbas)\b/i.test(normalized);

        if (hasWakeWord && !isJarvisAwake.value) {
          playActivationSignal('wake');
          keepAwakeWindow();
        }

        if (result.isFinal && (hasWakeWord || isJarvisAwake.value)) {
          const cleanedCommand = rawTranscript
            .replace(/^(?:oi|ol[aá]|ei|ok|fala|e\s*a[ií])?[\s,.-]*(?:jarvis|j[aá]vis|jarves|jaives|javes|iarvis|yarvis|jarbas|j\.a\.r\.v\.i\.s\.?)[\s,.:!?-]*/i, '')
            .trim();

          // Chamou apenas "Jarvis": abre a janela de conversa sem repetir frase robótica
          if (cleanedCommand.length < 2) {
            playActivationSignal('wake');
            keepAwakeWindow();
            return;
          }

          // Frases de encerramento fecham a conversa contínua na hora
          const normCmd = cleanedCommand
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f?!.]/g, '')
            .trim();
          if (/^(obrigado|obrigada|valeu|so isso|pode descansar|dispensado|tchau|encerrar|parar)$/.test(normCmd)) {
            closeAwakeWindow();
            return;
          }

          playActivationSignal('confirm');
          keepAwakeWindow();
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
      if ((shouldBeListening || isJarvisAwake.value) && !isJarvisSpeaking.value && !document.hidden) {
        restartTimer = setTimeout(() => startContinuousVigilance(isJarvisAwake.value), 250);
      } else if (userPrefs.push_to_talk_only) {
        closeAwakeWindow();
      }
    };

    try {
      recognition.start();
    } catch {
      restartTimer = setTimeout(() => startContinuousVigilance(forceManualPush), 450);
    }
  }

  function stopContinuousVigilance() {
    shouldBeListening = false;
    closeAwakeWindow();
    stopRecognitionInstance();
  }

  function toggleMicrophone() {
    ensureAudioUnlocked();
    playActivationSignal('wake');
    keepAwakeWindow(Math.max(15, Number(userPrefs.continuous_chat_seconds || 15)));
    startContinuousVigilance(true);
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      stopRecognitionInstance();
    } else {
      syncFrontendAudioPrefs().finally(() => {
        if (!userPrefs.push_to_talk_only) {
          setTimeout(() => startContinuousVigilance(false), 300);
        }
      });
    }
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('jarvis-prefs-updated', handlePrefsEvent);
    window.addEventListener('storage', loadCachedPrefs);
    syncFrontendAudioPrefs().finally(() => {
      if (!userPrefs.push_to_talk_only) {
        setTimeout(() => startContinuousVigilance(false), 350);
      }
    });
  });

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('jarvis-prefs-updated', handlePrefsEvent);
    window.removeEventListener('storage', loadCachedPrefs);
    stopContinuousVigilance();
  });

  return {
    isListening,
    isJarvisAwake,
    isJarvisSpeaking,
    isRecordingAudio,
    isVoiceMuted,
    isVoiceSupported,
    voiceStatusText,
    activeVoiceProfileName,
    currentPitchHz,
    latestAudioBase64,
    ensureAudioUnlocked,
    setupAudioUnlockListener,
    startContinuousVigilance,
    stopContinuousVigilance,
    stopMicrophoneSession: stopContinuousVigilance,
    toggleMicrophone,
    onJarvisCoreClick: () => toggleMicrophone(),
    speakJarvisResponse,
    stopAllAudio,
    playActivationSignal,
    playJarvisChime: playActivationSignal
  };
}
