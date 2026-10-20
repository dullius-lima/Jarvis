import React, { useState } from 'react';
import {
  Activity,
  X,
  Thermometer,
  Zap,
  Radio,
  Sparkles,
  CheckCircle2,
  Hand,
  Flame,
} from 'lucide-react';
import { sensoryInputService, SkinSensoryTelemetry } from '../services/sensoryInputService';

interface SkinSensoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerSkinStimulus?: (telemetry: SkinSensoryTelemetry) => void;
}

export const SkinSensoryModal: React.FC<SkinSensoryModalProps> = ({
  isOpen,
  onClose,
  onTriggerSkinStimulus,
}) => {
  const [telemetry, setTelemetry] = useState<SkinSensoryTelemetry>(() =>
    sensoryInputService.getSkinTelemetry()
  );
  const [hapticTriggered, setHapticTriggered] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleEmitStimulus = (location: 'palma_mao' | 'dedo_biometrico' | 'antebraço' | 'cervical') => {
    setHapticTriggered(true);
    const updated = sensoryInputService.triggerSkinStimulus({
      contactLocation: location,
      tactilePressureLevel: 0.85,
      dermalTemperatureCelsius: 36.6,
      hapticFeedbackActive: true,
    });
    setTelemetry(updated);
    onTriggerSkinStimulus?.(updated);

    setTimeout(() => {
      setHapticTriggered(false);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-950 border border-purple-500/40 rounded-3xl p-5 shadow-[0_0_60px_rgba(168,85,247,0.25)] relative overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-purple-500/20 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <Hand className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 font-mono">
                Capitula de Pele · Córtex Somatossensorial
              </h3>
              <p className="text-xs text-slate-400">
                Lobo Parietal: Percepção de temperatura, tato fino, pressão mecânica e resposta galvânica.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Telemetria Cutânea em Tempo Real */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 bg-slate-900/70 border border-purple-500/30 rounded-2xl flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Thermometer className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-mono">Temperatura Dérmica</span>
              <span className="text-base font-bold text-slate-100 font-mono">
                {telemetry.dermalTemperatureCelsius.toFixed(1)} °C
              </span>
            </div>
          </div>

          <div className="p-3 bg-slate-900/70 border border-purple-500/30 rounded-2xl flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-mono">Pressão Mecânica</span>
              <span className="text-base font-bold text-slate-100 font-mono">
                {(telemetry.tactilePressureLevel * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          <div className="p-3 bg-slate-900/70 border border-purple-500/30 rounded-2xl flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-mono">Condutância (GSR)</span>
              <span className="text-base font-bold text-slate-100 font-mono">
                {telemetry.electrodermalConductanceMicrosiemens.toFixed(1)} µS
              </span>
            </div>
          </div>

          <div className="p-3 bg-slate-900/70 border border-purple-500/30 rounded-2xl flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-mono">Resposta ao Estresse</span>
              <span
                className={`text-xs font-bold font-mono px-2 py-0.5 rounded border ${
                  telemetry.stressResponse === 'RELAXADO'
                    ? 'text-emerald-300 bg-emerald-950/60 border-emerald-500/40'
                    : 'text-amber-300 bg-amber-950/60 border-amber-500/40'
                }`}
              >
                {telemetry.stressResponse}
              </span>
            </div>
          </div>
        </div>

        {/* Receptores Cutâneos Ativos */}
        <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-2xl mb-4 text-xs space-y-2">
          <span className="text-[11px] text-purple-300 font-mono font-bold block">
            Mecanoreceptores Ativos (Córtex Somatossensorial S1):
          </span>
          <div className="flex flex-wrap gap-1.5">
            {telemetry.receptorsActive.map((r, i) => (
              <span
                key={i}
                className="text-[10px] px-2 py-0.5 rounded-lg bg-purple-950/80 border border-purple-500/40 text-purple-300 font-mono"
              >
                {r}
              </span>
            ))}
          </div>
        </div>

        {/* Ações de Estímulo Somático */}
        <div className="space-y-2 mb-4">
          <span className="text-xs text-slate-300 font-mono font-bold block">
            Disparar Estímulo Somático / Háptico (Fixar no Lobo Parietal):
          </span>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { id: 'palma_mao', label: 'Palma da Mão' },
              { id: 'dedo_biometrico', label: 'Dedo Biométrico' },
              { id: 'antebraço', label: 'Antebraço' },
              { id: 'cervical', label: 'Pescoço / Cervical' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => handleEmitStimulus(p.id as any)}
                className={`py-2 px-3 rounded-xl border text-left font-mono transition-all flex items-center justify-between cursor-pointer ${
                  telemetry.contactLocation === p.id && hapticTriggered
                    ? 'bg-purple-600 text-white border-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.5)] scale-98'
                    : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-purple-500/50'
                }`}
              >
                <span>{p.label}</span>
                <Zap className="w-3.5 h-3.5 text-purple-400" />
              </button>
            ))}
          </div>
        </div>

        {hapticTriggered && (
          <div className="text-xs text-center font-mono text-purple-300 bg-purple-950/50 border border-purple-500/40 rounded-xl p-2 animate-pulse">
            Estímulo elétrico somático enviado ao Lobo Parietal no Cérebro 3D!
          </div>
        )}

        {/* Rodapé */}
        <div className="mt-4 pt-3 border-t border-purple-500/20 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
