import { VoiceConfig, FamilyProfile, FAMILY_PROFILES } from '../types/neural';

export class JarvisVoiceService {
  private static instance: JarvisVoiceService;
  private wakeRecognition: any = null;
  private dictationRecognition: any = null;
  private isListeningContinuous: boolean = false;
  private isDictating: boolean = false;
  private onWakeWordDetectedCallback: ((phrase: string, speaker: FamilyProfile) => void) | null = null;
  private onSpeechResultCallback: ((text: string) => void) | null = null;
  private onStateChangeCallback: ((listening: boolean) => void) | null = null;

  private config: VoiceConfig = {
    persona: 'jarvis_executive',
    lang: 'pt-BR',
    pitch: 0.9,
    rate: 1.05,
    wakeWord: 'jarvis',
    wakeWordEnabled: true,
    soundEffectsEnabled: true,
  };

  private constructor() {
    this.initWakeRecognition();
  }

  public static getInstance(): JarvisVoiceService {
    if (!JarvisVoiceService.instance) {
      JarvisVoiceService.instance = new JarvisVoiceService();
    }
    return JarvisVoiceService.instance;
  }

  public getConfig(): VoiceConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<VoiceConfig>) {
    this.config = { ...this.config, ...newConfig };
    if (this.wakeRecognition) {
      this.wakeRecognition.lang = this.config.lang;
    }
  }

  public isSpeechRecognitionSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  // Obter vozes disponíveis do navegador
  public getAvailableVoices(): SpeechSynthesisVoice[] {
    if (typeof window === 'undefined' || !window.speechSynthesis) return [];
    return window.speechSynthesis.getVoices();
  }

  // Solicitar permissão de microfone explicitamente pelo navegador
  public async requestMicrophonePermission(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Fecha a track para liberar o microfone imediatamente
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err) {
      console.warn('Permissão de microfone rejeitada ou indisponível:', err);
      return false;
    }
  }

  // Inicialização do Reconhecimento Contínuo da Wake-Word "Jarvis"
  private initWakeRecognition() {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition não suportado neste navegador.');
      return;
    }

    try {
      this.wakeRecognition = new SpeechRecognition();
      this.wakeRecognition.lang = this.config.lang;
      this.wakeRecognition.continuous = true;
      this.wakeRecognition.interimResults = false;

      this.wakeRecognition.onstart = () => {
        this.isListeningContinuous = true;
        this.onStateChangeCallback?.(true);
      };

      this.wakeRecognition.onend = () => {
        if (this.isListeningContinuous && !this.isDictating) {
          try {
            this.wakeRecognition.start();
          } catch (e) {
            // Ignora se já estiver ativo
          }
        } else {
          this.onStateChangeCallback?.(false);
        }
      };

      this.wakeRecognition.onerror = (event: any) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('Reconhecimento de voz contínuo:', event.error);
        }
      };

      this.wakeRecognition.onresult = (event: any) => {
        const lastResultIndex = event.results.length - 1;
        const transcript = event.results[lastResultIndex][0].transcript.trim().toLowerCase();

        this.onSpeechResultCallback?.(transcript);

        // Verificação da Wake-Word "Jarvis"
        const wakeWord = this.config.wakeWord.toLowerCase();
        if (transcript.includes(wakeWord)) {
          const speaker = this.detectSpeaker(transcript);
          this.playBeepSound();
          this.onWakeWordDetectedCallback?.(transcript, speaker);
        }
      };
    } catch (e) {
      console.error('Falha ao inicializar Web Speech Recognition:', e);
    }
  }

  // =========================================================================
  // DITADO DIRETO AO CLICAR NO BOTÃO DE MICROFONE (Instantâneo)
  // =========================================================================
  public startDirectDictation(callbacks: {
    onStart: () => void;
    onInterim: (text: string) => void;
    onFinal: (text: string, speaker: FamilyProfile) => void;
    onError: (err: string) => void;
    onEnd: () => void;
  }) {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      callbacks.onError('Seu navegador não possui suporte ao Reconhecimento de Voz nativo (SpeechRecognition). Utilize os comandos de texto ou atalhos sugeridos.');
      return;
    }

    // Se a escuta contínua estiver rodando, pausa temporariamente para liberar o microfone
    if (this.wakeRecognition) {
      try {
        this.wakeRecognition.abort();
      } catch (e) {}
    }

    try {
      if (this.dictationRecognition) {
        try {
          this.dictationRecognition.abort();
        } catch (e) {}
      }

      this.dictationRecognition = new SpeechRecognition();
      this.dictationRecognition.lang = this.config.lang;
      this.dictationRecognition.continuous = false;
      this.dictationRecognition.interimResults = true;
      this.isDictating = true;

      let finalTranscript = '';

      this.dictationRecognition.onstart = () => {
        this.playBeepSound();
        callbacks.onStart();
      };

      this.dictationRecognition.onresult = (event: any) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const currentText = (finalTranscript || interimTranscript).trim();
        if (currentText) {
          callbacks.onInterim(currentText);
        }
      };

      this.dictationRecognition.onerror = (event: any) => {
        this.isDictating = false;
        console.warn('Erro no ditado de voz:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          callbacks.onError('Acesso ao microfone foi negado pelo navegador. Por favor, clique no ícone de cadeado/permissões na barra de endereço do navegador e autorize o Microfone.');
        } else if (event.error === 'no-speech') {
          callbacks.onError('Nenhuma voz detectada. Tente falar mais próximo ao microfone.');
        } else {
          callbacks.onError(`Erro no reconhecimento de voz (${event.error}).`);
        }
      };

      this.dictationRecognition.onend = () => {
        this.isDictating = false;
        callbacks.onEnd();

        if (finalTranscript.trim()) {
          const speaker = this.detectSpeaker(finalTranscript);
          callbacks.onFinal(finalTranscript.trim(), speaker);
        }

        // Retoma o ouvinte da wake-word se configurado
        if (this.isListeningContinuous && this.wakeRecognition) {
          setTimeout(() => {
            try {
              this.wakeRecognition.start();
            } catch (e) {}
          }, 300);
        }
      };

      this.dictationRecognition.start();
    } catch (err: any) {
      this.isDictating = false;
      callbacks.onError('Não foi possível iniciar o microfone. Verifique as permissões de áudio do dispositivo.');
    }
  }

  public stopDictation() {
    this.isDictating = false;
    if (this.dictationRecognition) {
      try {
        this.dictationRecognition.stop();
      } catch (e) {}
    }
  }

  // Detectar perfil familiar com base em palavras-chave na fala
  public detectSpeaker(transcript: string): FamilyProfile {
    const lower = transcript.toLowerCase();
    for (const profile of FAMILY_PROFILES) {
      for (const kw of profile.voiceKeywords) {
        if (lower.includes(kw)) {
          return profile;
        }
      }
    }
    return FAMILY_PROFILES[0]; // Matheus Dullius como padrão
  }

  // Iniciar Escuta Contínua da Wake-Word
  public startWakeWordListening(
    onWake: (phrase: string, speaker: FamilyProfile) => void,
    onSpeech?: (text: string) => void,
    onState?: (listening: boolean) => void
  ) {
    this.onWakeWordDetectedCallback = onWake;
    this.onSpeechResultCallback = onSpeech || null;
    this.onStateChangeCallback = onState || null;
    this.isListeningContinuous = true;

    if (!this.wakeRecognition) {
      this.initWakeRecognition();
    }

    try {
      this.wakeRecognition?.start();
    } catch (e) {
      // Já pode estar rodando
    }
  }

  public stopWakeWordListening() {
    this.isListeningContinuous = false;
    try {
      this.wakeRecognition?.stop();
    } catch (e) {}
    this.onStateChangeCallback?.(false);
  }

  // Síntese de Voz do Jarvis (TTS Personalizável)
  public speak(text: string, onEnd?: () => void) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel(); // Interrompe fala anterior

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.config.lang;
    utterance.pitch = this.config.pitch;
    utterance.rate = this.config.rate;

    // Seleção de voz baseada no persona
    const voices = this.getAvailableVoices();
    if (voices.length > 0) {
      if (this.config.voiceURI) {
        const found = voices.find((v) => v.voiceURI === this.config.voiceURI);
        if (found) utterance.voice = found;
      } else {
        const ptVoice = voices.find((v) => v.lang.startsWith('pt') && (v.name.includes('Luciana') || v.name.includes('Daniel') || v.name.includes('Google') || v.name.includes('Natural')));
        if (ptVoice) {
          utterance.voice = ptVoice;
        }
      }
    }

    utterance.onend = () => {
      onEnd?.();
    };

    utterance.onerror = () => {
      onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
  }

  // Som holográfico de ativação da Wake-Word (Web Audio API nativo sem assets externos)
  public playBeepSound() {
    if (!this.config.soundEffectsEnabled || typeof window === 'undefined') return;
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
      // Ignora falhas de áudio
    }
  }
}
