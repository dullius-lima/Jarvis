import React, { useState, useEffect } from 'react';
import { VoiceConfig } from '../types/neural';
import { JarvisVoiceService } from '../services/jarvisVoice';
import { Volume2, Mic, Sliders, X, Check, Play, Sparkles } from 'lucide-react';

interface VoiceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: VoiceConfig;
  onSaveConfig: (cfg: VoiceConfig) => void;
}

export const VoiceSettingsModal: React.FC<VoiceSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
}) => {
  const [currentConfig, setCurrentConfig] = useState<VoiceConfig>(config);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [testandoVoz, setTestandoVoz] = useState(false);

  useEffect(() => {
    setCurrentConfig(config);

    const filterUniqueVoices = (list: SpeechSynthesisVoice[]) => {
      const seen = new Set<string>();
      return list.filter((v, idx) => {
        const id = `${v.voiceURI || v.name}_${v.lang}_${idx}`;
        const naturalKey = `${v.voiceURI || v.name}::${v.lang}`;
        if (seen.has(naturalKey)) {
          return false;
        }
        seen.add(naturalKey);
        return true;
      });
    };

    const available = JarvisVoiceService.getInstance().getAvailableVoices();
    setVoices(filterUniqueVoices(available));

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        setVoices(filterUniqueVoices(window.speechSynthesis.getVoices()));
      };
    }
  }, [config, isOpen]);

  if (!isOpen) return null;

  const handleTestarVoz = () => {
    setTestandoVoz(true);
    const service = JarvisVoiceService.getInstance();
    service.updateConfig(currentConfig);
    service.playBeepSound();
    service.speak(
      `Sistemas online. Eu sou o JARVIS, a inteligência central da família Dullius. Todos os circuitos sinápticos e memórias estão operacionais.`,
      () => setTestandoVoz(false)
    );
  };

  const handleSalvar = () => {
    onSaveConfig(currentConfig);
    JarvisVoiceService.getInstance().updateConfig(currentConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-950 border border-cyan-500/40 rounded-2xl p-6 shadow-[0_0_60px_rgba(6,182,212,0.25)] relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 border-b border-slate-800 pb-4 mb-5">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Configuração da Voz do JARVIS
            </h3>
            <p className="text-xs text-slate-400">
              Personalize o timbre, velocidade, tom e comportamento do assistente.
            </p>
          </div>
        </div>

        <div className="space-y-5 text-xs">
          {/* Persona de Voz */}
          <div>
            <label className="block text-slate-300 font-bold mb-2">
              Personalidade Vocal do Assistente
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'jarvis_executive', nome: 'JARVIS Executivo', desc: 'Frio, técnico, tom grave e direto' },
                { id: 'jarvis_classic', nome: 'JARVIS Clássico', desc: 'Britânico, calmo e institucional' },
                { id: 'jarvis_cyber', nome: 'JARVIS Cibernético', desc: 'Tom futurista e de alta frequência' },
                { id: 'jarvis_warm', nome: 'JARVIS Família', desc: 'Amigável, acolhedor e natural' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() =>
                    setCurrentConfig((prev) => ({
                      ...prev,
                      persona: p.id as any,
                      pitch: p.id === 'jarvis_executive' ? 0.85 : p.id === 'jarvis_cyber' ? 1.15 : 1.0,
                      rate: p.id === 'jarvis_executive' ? 1.05 : 1.0,
                    }))
                  }
                  className={`p-3 rounded-xl border text-left transition-all ${
                    currentConfig.persona === p.id
                      ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200 shadow-[0_0_20px_rgba(6,182,212,0.2)]'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-bold text-slate-100">{p.nome}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Seleção de Voz do Sistema / Sintetizador */}
          {voices.length > 0 && (
            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                Voz de Síntese Instalada no Dispositivo
              </label>
              <select
                value={currentConfig.voiceURI || ''}
                onChange={(e) => setCurrentConfig((prev) => ({ ...prev, voiceURI: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono text-xs"
              >
                <option value="">Automática Recomendada (Português Natural)</option>
                {voices.map((v, idx) => (
                  <option key={`${v.voiceURI || v.name}-${v.lang}-${idx}`} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sliders de Tom e Velocidade */}
          <div className="grid grid-cols-2 gap-4 bg-slate-900/40 p-3.5 rounded-xl border border-slate-800/80">
            <div>
              <div className="flex justify-between font-bold text-slate-300 mb-1">
                <span>Tom (Pitch):</span>
                <span className="font-mono text-cyan-400">{currentConfig.pitch.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.6"
                max="1.4"
                step="0.05"
                value={currentConfig.pitch}
                onChange={(e) =>
                  setCurrentConfig((prev) => ({ ...prev, pitch: parseFloat(e.target.value) }))
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                <span>Grave</span>
                <span>Médio</span>
                <span>Agudo</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between font-bold text-slate-300 mb-1">
                <span>Velocidade (Rate):</span>
                <span className="font-mono text-cyan-400">{currentConfig.rate.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.8"
                max="1.4"
                step="0.05"
                value={currentConfig.rate}
                onChange={(e) =>
                  setCurrentConfig((prev) => ({ ...prev, rate: parseFloat(e.target.value) }))
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                <span>Calmo</span>
                <span>Normal</span>
                <span>Rápido</span>
              </div>
            </div>
          </div>

          {/* Wake-Word Personalizada */}
          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 flex items-center justify-between gap-4">
            <div>
              <span className="font-bold text-slate-200 block">Palavra de Ativação (Wake-Word)</span>
              <span className="text-[11px] text-slate-400">
                Basta dizer este nome no ambiente para o cérebro despertar e responder.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-cyan-400 bg-cyan-950 px-2 py-1 rounded border border-cyan-500/40 font-bold uppercase">
                "{currentConfig.wakeWord}"
              </span>
            </div>
          </div>
        </div>

        {/* Rodapé de Ações */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={handleTestarVoz}
            disabled={testandoVoz}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-cyan-400 border border-cyan-500/40 rounded-xl font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            {testandoVoz ? 'Reproduzindo...' : 'Testar Voz do JARVIS'}
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSalvar}
              className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold rounded-xl shadow-lg transition-colors flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Aplicar Voz
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
