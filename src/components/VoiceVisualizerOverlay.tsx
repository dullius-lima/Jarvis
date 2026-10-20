import React, { useEffect, useRef, useState } from 'react';
import { JarvisVoiceService, AudioMetrics } from '../services/jarvisVoice';
import { Mic, Volume2, Sparkles, Activity, ShieldCheck, X } from 'lucide-react';

interface VoiceVisualizerOverlayProps {
  isListeningContinuous: boolean;
  onToggleContinuousListening: () => void;
  lastTranscript?: string;
  isJarvisSpeaking: boolean;
}

export const VoiceVisualizerOverlay: React.FC<VoiceVisualizerOverlayProps> = ({
  isListeningContinuous,
  onToggleContinuousListening,
  lastTranscript,
  isJarvisSpeaking,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [metrics, setMetrics] = useState<AudioMetrics>({
    amplitude: 0,
    waveform: new Array(64).fill(128),
    isListening: false,
    isSpeaking: false,
    volumeDb: -60,
  });
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    const voiceService = JarvisVoiceService.getInstance();
    const unsubscribe = voiceService.subscribeAudioMetrics((m) => {
      setMetrics(m);
    });
    return () => unsubscribe();
  }, []);

  // Animação de Ondas Senoidais & Partículas Reluzentes no Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let phase = 0;

    // Partículas reluzentes
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      alpha: number;
      hue: number;
      life: number;
    }> = [];

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const amp = Math.max(0.04, metrics.amplitude);
      const isVoiceActive = metrics.amplitude > 0.08 || isJarvisSpeaking;
      phase += 0.05 + amp * 0.12;

      // 1. Spawna partículas reluzentes proporcionalmente à amplitude
      if (isVoiceActive && particles.length < 50) {
        const countToSpawn = Math.floor(amp * 4) + 1;
        for (let i = 0; i < countToSpawn; i++) {
          particles.push({
            x: width * 0.5 + (Math.random() - 0.5) * (width * 0.6),
            y: height * 0.5 + (Math.random() - 0.5) * 20,
            vx: (Math.random() - 0.5) * 2,
            vy: -1 - Math.random() * 2 * amp,
            size: 1 + Math.random() * 2.5 * (1 + amp),
            alpha: 0.8 + Math.random() * 0.2,
            hue: isJarvisSpeaking ? 45 : 185, // Dourado se Jarvis fala, Ciano se usuário fala
            life: 1.0,
          });
        }
      }

      // 2. Desenha ondas senoidais sobrepostas
      const waveCount = 3;
      const colors = isJarvisSpeaking
        ? ['rgba(234, 179, 8, 0.8)', 'rgba(250, 204, 21, 0.5)', 'rgba(245, 158, 11, 0.3)']
        : ['rgba(6, 182, 212, 0.9)', 'rgba(56, 189, 248, 0.6)', 'rgba(147, 51, 234, 0.4)'];

      for (let w = 0; w < waveCount; w++) {
        ctx.beginPath();
        ctx.lineWidth = 1.8 - w * 0.4;
        ctx.strokeStyle = colors[w];

        const waveAmp = (height * 0.35) * amp * (1 - w * 0.2);
        const freq = 0.02 + w * 0.01;
        const wavePhase = phase + w * 0.9;

        for (let x = 0; x < width; x += 3) {
          // Envelope gaussiano para atenuar as pontas
          const envelope = Math.sin((x / width) * Math.PI);
          const y = height * 0.5 + Math.sin(x * freq + wavePhase) * waveAmp * envelope;
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      // 3. Atualiza e desenha partículas reluzentes
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.02;
        p.life -= 0.02;

        if (p.alpha <= 0 || p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${p.alpha})`;
        ctx.shadowColor = `hsla(${p.hue}, 100%, 60%, ${p.alpha})`;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [metrics.amplitude, isJarvisSpeaking]);

  if (!isListeningContinuous && !isJarvisSpeaking && !metrics.isListening) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm w-full sm:w-80 pointer-events-auto animate-in fade-in slide-in-from-bottom-3 duration-200">
      <div className="bg-slate-950/90 backdrop-blur-xl border border-cyan-500/40 rounded-2xl p-3 shadow-[0_0_40px_rgba(6,182,212,0.25)] relative overflow-hidden">
        {/* Barra superior de status */}
        <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-cyan-500/20 text-xs">
          <div className="flex items-center gap-1.5 font-mono font-bold">
            <span
              className={`w-2 h-2 rounded-full ${
                isJarvisSpeaking
                  ? 'bg-amber-400 animate-ping'
                  : isListeningContinuous
                  ? 'bg-cyan-400 animate-pulse'
                  : 'bg-slate-500'
              }`}
            />
            <span className={isJarvisSpeaking ? 'text-amber-300' : 'text-cyan-300'}>
              {isJarvisSpeaking ? 'JARVIS SÍNTESE VOCAL' : 'CÓRTEX AUDITIVO CONTÍNUO'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
              {metrics.volumeDb} dB
            </span>
            <button
              onClick={() => setIsMinimized((prev) => !prev)}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
              title={isMinimized ? 'Expandir' : 'Minimizar'}
            >
              {isMinimized ? '+' : '–'}
            </button>
          </div>
        </div>

        {!isMinimized && (
          <>
            {/* Canvas de Ondas Senoidais e Partículas */}
            <div className="relative w-full h-16 bg-slate-900/80 rounded-xl border border-cyan-500/20 overflow-hidden flex items-center justify-center">
              <canvas ref={canvasRef} width={280} height={64} className="w-full h-full" />
              <div className="absolute top-1 left-2 flex items-center gap-1 text-[9px] font-mono text-cyan-400/80">
                <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
                <span>Ondas Senoidais & Partículas</span>
              </div>
            </div>

            {/* Transcrição em tempo real (Whisper / Speech-to-Text) */}
            {lastTranscript && (
              <div className="mt-2 p-2 bg-slate-900/60 rounded-xl border border-slate-800 text-[11px] text-slate-200 font-sans line-clamp-2">
                <span className="text-cyan-400 font-mono font-bold mr-1">STT ms:</span>
                "{lastTranscript}"
              </div>
            )}

            {/* Controle de Escuta Contínua */}
            <div className="mt-2.5 flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-sans flex items-center gap-1">
                <Activity className="w-3 h-3 text-cyan-400" />
                Escuta ativa 24/7
              </span>

              <button
                onClick={onToggleContinuousListening}
                className={`px-2.5 py-1 rounded-lg font-mono font-bold text-[10px] transition-all flex items-center gap-1 ${
                  isListeningContinuous
                    ? 'bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30'
                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30'
                }`}
              >
                {isListeningContinuous ? 'Pausar Córtex' : 'Ligar Contínuo'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
