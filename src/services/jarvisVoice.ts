import { VoiceConfig, FamilyProfile, FAMILY_PROFILES } from '../types/neural';

export interface AudioMetrics {
  amplitude: number; // 0.0 a 1.0 (nível de intensidade de voz)
  waveform: number[]; // Array normalizado de 0 a 255 com o espectro de frequências / formato de onda
  isListening: boolean; // Se o córtex auditivo de entrada está ativo
  isSpeaking: boolean; // Se a síntese vocal do Jarvis está emitindo fala
  volumeDb?: number; // Decibéis relativos (-60dB a 0dB)
}

export class JarvisVoiceService {
  private static instance: JarvisVoiceService;
  private wakeRecognition: any = null;
  private dictationRecognition: any = null;
  private continuousRecognition: any = null;

  private isListeningContinuous: boolean = false;
  private isDictating: boolean = false;
  private isContinuousCortex: boolean = false;
  private isJarvisSpeaking: boolean = false;

  private onWakeWordDetectedCallback: ((phrase: string, speaker: FamilyProfile) => void) | null = null;
  private onSpeechResultCallback: ((text: string) => void) | null = null;
  private onStateChangeCallback: ((listening: boolean) => void) | null = null;

  // Web Audio API para análise em tempo real (ondas senoidais e partículas reluzentes)
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  private audioMetricsListeners: Array<(metrics: AudioMetrics) => void> = [];
  private currentMetrics: AudioMetrics = {
    amplitude: 0,
    waveform: new Array(64).fill(128),
    isListening: false,
    isSpeaking: false,
    volumeDb: -60,
  };

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
    this.initVoicesPreload();
  }

  public static getInstance(): JarvisVoiceService {
    if (!JarvisVoiceService.instance) {
      JarvisVoiceService.instance = new JarvisVoiceService();
    }
    return JarvisVoiceService.instance;
  }

  private initVoicesPreload() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }

  public getConfig(): VoiceConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<VoiceConfig>) {
    this.config = { ...this.config, ...newConfig };
    if (this.wakeRecognition) {
      this.wakeRecognition.lang = this.config.lang;
    }
    if (this.continuousRecognition) {
      this.continuousRecognition.lang = this.config.lang;
    }
  }

  public isSpeechRecognitionSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  public getAvailableVoices(): SpeechSynthesisVoice[] {
    if (typeof window === 'undefined' || !window.speechSynthesis) return [];
    return window.speechSynthesis.getVoices();
  }

  public async requestMicrophonePermission(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }
    if (this.micStream && this.micStream.active) {
      return true;
    }
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      return true;
    } catch (err) {
      console.warn('Permissão de microfone rejeitada ou indisponível:', err);
      return false;
    }
  }

  // =========================================================================
  // WEB AUDIO API ANALYSER (ONDAS SENOIDAIS & PARTÍCULAS RELUZENTES)
  // =========================================================================
  private async setupAudioAnalyser(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return false;

      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioCtxClass();
      }
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      if (!this.micStream) {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      }

      const source = this.audioCtx.createMediaStreamSource(this.micStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.75;
      source.connect(this.analyser);

      this.startMetricsLoop();
      return true;
    } catch (err) {
      console.warn('AudioContext Analyser não pôde ser iniciado:', err);
      return false;
    }
  }

  private startMetricsLoop() {
    if (this.animationFrameId) return;

    const dataArray = new Uint8Array(128);
    const timeDomainArray = new Uint8Array(128);

    const updateLoop = () => {
      let amp = 0;
      let db = -60;

      if (this.analyser && this.isContinuousCortex) {
        this.analyser.getByteFrequencyData(dataArray);
        this.analyser.getByteTimeDomainData(timeDomainArray);

        let sumSquares = 0;
        for (let i = 0; i < timeDomainArray.length; i++) {
          const val = (timeDomainArray[i] - 128) / 128;
          sumSquares += val * val;
        }
        const rms = Math.sqrt(sumSquares / timeDomainArray.length);
        amp = Math.min(1.0, rms * 4.2);
        db = Math.max(-60, Math.round(20 * Math.log10(Math.max(0.001, rms))));
      } else if (this.isJarvisSpeaking) {
        // Quando o Jarvis vocaliza, simula ondas senoidais harmônicas com ritmo da fala
        const t = performance.now() * 0.006;
        amp = 0.35 + Math.sin(t * 3) * 0.2 + Math.cos(t * 7) * 0.15;
        amp = Math.max(0.1, Math.min(0.9, amp));
        db = -12 + Math.round(amp * 10);
        for (let i = 0; i < 64; i++) {
          dataArray[i] = Math.round(128 + Math.sin(i * 0.2 + t * 4) * 80 * amp);
        }
      }

      const waveformSlice = Array.from(timeDomainArray.slice(0, 64));

      this.currentMetrics = {
        amplitude: amp,
        waveform: waveformSlice.length > 0 ? waveformSlice : new Array(64).fill(128),
        isListening: this.isContinuousCortex || this.isListeningContinuous || this.isDictating,
        isSpeaking: this.isJarvisSpeaking,
        volumeDb: db,
      };

      this.audioMetricsListeners.forEach((fn) => {
        try {
          fn(this.currentMetrics);
        } catch {}
      });

      if (this.isContinuousCortex || this.isJarvisSpeaking || this.isDictating) {
        this.animationFrameId = requestAnimationFrame(updateLoop);
      } else {
        this.animationFrameId = null;
      }
    };

    this.animationFrameId = requestAnimationFrame(updateLoop);
  }

  public subscribeAudioMetrics(cb: (metrics: AudioMetrics) => void): () => void {
    this.audioMetricsListeners.push(cb);
    cb(this.currentMetrics);
    return () => {
      this.audioMetricsListeners = this.audioMetricsListeners.filter((l) => l !== cb);
    };
  }

  public getAudioMetrics(): AudioMetrics {
    return { ...this.currentMetrics };
  }

  // =========================================================================
  // CANAL DE VOZ: CÓRTEX AUDITIVO CONTÍNUO (STT / TRANSCRIÇÃO EM TEMPO REAL)
  // =========================================================================
  public async startContinuousCortex(callbacks: {
    onStart?: () => void;
    onInterim?: (text: string) => void;
    onFinal?: (text: string, speaker: FamilyProfile) => void;
    onError?: (err: string) => void;
    onStateChange?: (active: boolean) => void;
  }) {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      callbacks.onError?.('Navegador sem suporte a SpeechRecognition nativo.');
      return;
    }

    // Garante que nenhuma outra instância de SpeechRecognition (WakeWord ou Dictation avulso) concorra pelo hardware
    if (this.wakeRecognition) {
      this.isListeningContinuous = false;
      try {
        this.wakeRecognition.abort();
      } catch {}
    }
    if (this.dictationRecognition) {
      try {
        this.dictationRecognition.abort();
      } catch {}
    }

    this.isContinuousCortex = true;
    callbacks.onStateChange?.(true);

    // Liga o Analyser de áudio para ondas senoidais e partículas reluzentes
    await this.setupAudioAnalyser();
    this.startMetricsLoop();
    this.playBeepSound();

    const startRecognitionInstance = () => {
      if (!this.isContinuousCortex) return;

      try {
        if (this.continuousRecognition) {
          try {
            this.continuousRecognition.abort();
          } catch {}
        }

        const rec = new SpeechRecognition();
        rec.lang = this.config.lang;
        rec.continuous = true;
        rec.interimResults = true;

        rec.onstart = () => {
          callbacks.onStart?.();
        };

        rec.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const chunk = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += chunk;
            } else {
              interimTranscript += chunk;
            }
          }

          const currentLive = (finalTranscript || interimTranscript).trim();
          if (currentLive) {
            callbacks.onInterim?.(currentLive);
          }

          if (finalTranscript.trim()) {
            const speaker = this.detectSpeaker(finalTranscript);
            callbacks.onFinal?.(finalTranscript.trim(), speaker);
          }
        };

        rec.onerror = (event: any) => {
          if (event.error === 'no-speech' || event.error === 'network') {
            // Ignora silêncio para manter escuta contínua ativa
            return;
          }
          if (event.error === 'not-allowed') {
            this.isContinuousCortex = false;
            callbacks.onStateChange?.(false);
            callbacks.onError?.('Permissão de microfone negada. Autorize o microfone no navegador.');
          }
        };

        rec.onend = () => {
          // AUTO RE-ARM: se o modo contínuo estiver ativado, reativa imediatamente sem desarmar
          if (this.isContinuousCortex) {
            setTimeout(() => {
              if (this.isContinuousCortex) {
                startRecognitionInstance();
              }
            }, 120);
          } else {
            callbacks.onStateChange?.(false);
          }
        };

        this.continuousRecognition = rec;
        rec.start();
      } catch (err) {
        console.warn('Erro ao ligar instância do SpeechRecognition contínuo:', err);
      }
    };

    startRecognitionInstance();
  }

  public stopContinuousCortex() {
    this.isContinuousCortex = false;
    if (this.continuousRecognition) {
      try {
        this.continuousRecognition.stop();
      } catch {}
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.currentMetrics = {
      amplitude: 0,
      waveform: new Array(64).fill(128),
      isListening: false,
      isSpeaking: false,
      volumeDb: -60,
    };
    this.audioMetricsListeners.forEach((fn) => fn(this.currentMetrics));
  }

  public isContinuousCortexActive(): boolean {
    return this.isContinuousCortex;
  }

  // =========================================================================
  // DITADO DIRETO (COMPATIBILIDADE PONTUAL)
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
      callbacks.onError('Seu navegador não possui suporte ao Reconhecimento de Voz nativo (SpeechRecognition).');
      return;
    }

    if (this.wakeRecognition) {
      try {
        this.wakeRecognition.abort();
      } catch {}
    }

    try {
      if (this.dictationRecognition) {
        try {
          this.dictationRecognition.abort();
        } catch {}
      }

      this.setupAudioAnalyser();

      this.dictationRecognition = new SpeechRecognition();
      this.dictationRecognition.lang = this.config.lang;
      this.dictationRecognition.continuous = false;
      this.dictationRecognition.interimResults = true;
      this.isDictating = true;

      let finalTranscript = '';

      this.dictationRecognition.onstart = () => {
        this.playBeepSound();
        this.startMetricsLoop();
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
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          callbacks.onError('Acesso ao microfone foi negado pelo navegador.');
        } else if (event.error === 'no-speech') {
          callbacks.onError('Nenhuma voz detectada. Fale mais próximo ao microfone.');
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

        if (this.isListeningContinuous && this.wakeRecognition) {
          setTimeout(() => {
            try {
              this.wakeRecognition.start();
            } catch {}
          }, 300);
        }
      };

      this.dictationRecognition.start();
    } catch (err: any) {
      this.isDictating = false;
      callbacks.onError('Não foi possível iniciar o microfone.');
    }
  }

  public stopDictation() {
    this.isDictating = false;
    if (this.dictationRecognition) {
      try {
        this.dictationRecognition.stop();
      } catch {}
    }
  }

  public detectSpeaker(transcript: string): FamilyProfile {
    const lower = transcript.toLowerCase();
    for (const profile of FAMILY_PROFILES) {
      for (const kw of profile.voiceKeywords) {
        if (lower.includes(kw)) {
          return profile;
        }
      }
    }
    return FAMILY_PROFILES[0];
  }

  public startWakeWordListening(
    onWake: (phrase: string, speaker: FamilyProfile) => void,
    onSpeech?: (text: string) => void,
    onState?: (listening: boolean) => void
  ) {
    this.onWakeWordDetectedCallback = onWake;
    this.onSpeechResultCallback = onSpeech || null;
    this.onStateChangeCallback = onState || null;

    // Se o Córtex Auditivo Contínuo já está ativo, não inicia segunda instância concorrente
    if (this.isContinuousCortex) {
      return;
    }

    this.isListeningContinuous = true;

    if (!this.wakeRecognition) {
      this.initWakeRecognition();
    }

    try {
      this.wakeRecognition?.start();
    } catch {}
  }

  public stopWakeWordListening() {
    this.isListeningContinuous = false;
    try {
      this.wakeRecognition?.abort();
    } catch {}
    this.onStateChangeCallback?.(false);
  }

  private initWakeRecognition() {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

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
        if (this.isListeningContinuous && !this.isDictating && !this.isContinuousCortex) {
          try {
            this.wakeRecognition.start();
          } catch {}
        } else {
          this.onStateChangeCallback?.(false);
        }
      };

      this.wakeRecognition.onerror = (event: any) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('Reconhecimento de voz wake-word:', event.error);
        }
      };

      this.wakeRecognition.onresult = (event: any) => {
        const lastResultIndex = event.results.length - 1;
        const transcript = event.results[lastResultIndex][0].transcript.trim().toLowerCase();

        this.onSpeechResultCallback?.(transcript);

        const wakeWord = this.config.wakeWord.toLowerCase();
        if (transcript.includes(wakeWord)) {
          const speaker = this.detectSpeaker(transcript);
          this.playBeepSound();
          this.onWakeWordDetectedCallback?.(transcript, speaker);
        }
      };
    } catch (e) {
      console.error('Falha ao inicializar Wake Word Recognition:', e);
    }
  }

  // =========================================================================
  // SÍNTESE DE VOZ NATURAL (TTS) COM REAÇÃO VISUAL EM TEMPO REAL
  // =========================================================================
  public speak(text: string, onEnd?: () => void) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.config.lang;
    utterance.pitch = this.config.pitch;
    utterance.rate = this.config.rate;

    const voices = this.getAvailableVoices();
    if (voices.length > 0) {
      if (this.config.voiceURI) {
        const found = voices.find((v) => v.voiceURI === this.config.voiceURI);
        if (found) utterance.voice = found;
      } else {
        const ptVoice = voices.find((v) =>
          v.lang.startsWith('pt') &&
          (v.name.includes('Luciana') || v.name.includes('Daniel') || v.name.includes('Google') || v.name.includes('Natural'))
        );
        if (ptVoice) {
          utterance.voice = ptVoice;
        }
      }
    }

    this.isJarvisSpeaking = true;
    this.startMetricsLoop();

    utterance.onstart = () => {
      this.isJarvisSpeaking = true;
      this.startMetricsLoop();
    };

    utterance.onend = () => {
      this.isJarvisSpeaking = false;
      onEnd?.();
    };

    utterance.onerror = () => {
      this.isJarvisSpeaking = false;
      onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
  }

  public playBeepSound() {
    if (!this.config.soundEffectsEnabled || typeof window === 'undefined') return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {}
  }
}
