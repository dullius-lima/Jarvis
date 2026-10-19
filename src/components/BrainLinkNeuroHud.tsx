import React, { useState, useEffect } from 'react';
import {
  BrainLinkEvent,
  NeurotransmitterType,
  NEUROTRANSMITTER_CONFIGS,
} from '../types/brainLink';
import { brainLinkService, ActivePulseState } from '../services/brainLinkService';
import {
  Zap,
  Activity,
  AlertOctagon,
  Sparkles,
  RefreshCw,
  Radio,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
  Cpu,
  Flame,
  Volume2,
} from 'lucide-react';

interface BrainLinkNeuroHudProps {
  onTriggerSynapse?: (label: string) => void;
}

export const BrainLinkNeuroHud: React.FC<BrainLinkNeuroHudProps> = ({ onTriggerSynapse }) => {
  const [isConnected, setIsConnected] = useState<boolean>(() => brainLinkService.isSocketConnected());
  const [latestEvent, setLatestEvent] = useState<BrainLinkEvent | null>(null);
  const [eventHistory, setEventHistory] = useState<BrainLinkEvent[]>([]);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [pulseCount, setPulseCount] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'neurotransmitters' | 'stream'>('neurotransmitters');

  useEffect(() => {
    // Polling do status da conexão WebSocket
    const interval = setInterval(() => {
      setIsConnected(brainLinkService.isSocketConnected());
    }, 1500);

    // Escuta de eventos em tempo real
    const unsub = brainLinkService.subscribeToEvents((event) => {
      setLatestEvent(event);
      setPulseCount((c) => c + 1);
      setEventHistory((prev) => [event, ...prev.slice(0, 19)]);
    });

    return () => {
      clearInterval(interval);
      unsub();
    };
  }, []);

  const handleStimulate = (type: NeurotransmitterType) => {
    const axonMap: Record<NeurotransmitterType, string> = {
      ADRENALINA: 'axon-core-sentinel',
      DOPAMINA: 'axon-core-cfo',
      SEROTONINA: 'axon-core-universal',
      ACETILCOLINA: 'axon-core-voice',
      CORTISOL: 'axon-core-n8n',
      GABA: 'axon-core-n8n',
    };
    const evt = brainLinkService.triggerNeurotransmitterTest(type, axonMap[type]);
    if (onTriggerSynapse) {
      onTriggerSynapse(`Estímulo ${type}: ${NEUROTRANSMITTER_CONFIGS[type].meaning}`);
    }
  };

  const handleTriggerBrokenSynapse = () => {
    const evt = brainLinkService.triggerBrokenSynapseTest('axon-core-n8n');
    if (onTriggerSynapse) {
      onTriggerSynapse('⚡ Sinapse Quebrada! Faísca de desconexão gerada.');
    }
  };

  const neurotransmitters: NeurotransmitterType[] = [
    'ADRENALINA',
    'DOPAMINA',
    'SEROTONINA',
    'ACETILCOLINA',
    'CORTISOL',
    'GABA',
  ];

  return (
    <div className="pointer-events-auto bg-slate-950/90 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl overflow-hidden transition-all text-xs font-mono select-none">
      {/* Barra de Cabeçalho / Ticker de Status */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-900/80 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isConnected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400 animate-pulse'
              }`}
            />
          </div>
          <span className="text-[11px] font-black text-cyan-300 uppercase tracking-wider flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            BrainLink WebSocket
          </span>
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
              isConnected
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40'
                : 'bg-amber-950/80 text-amber-400 border border-amber-500/40'
            }`}
          >
            {isConnected ? 'ONLINE / 60FPS' : 'CONECTANDO'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {latestEvent && (
            <span
              className="text-[9px] px-2 py-0.5 rounded font-bold truncate max-w-[150px] sm:max-w-[200px]"
              style={{
                color: NEUROTRANSMITTER_CONFIGS[latestEvent.neurotransmitter_type]?.colorHex || '#fff',
                backgroundColor: `${NEUROTRANSMITTER_CONFIGS[latestEvent.neurotransmitter_type]?.colorHex || '#fff'}15`,
                border: `1px solid ${NEUROTRANSMITTER_CONFIGS[latestEvent.neurotransmitter_type]?.colorHex || '#fff'}40`,
              }}
              title={latestEvent.payload_summary}
            >
              #{latestEvent.sequence_id}: {latestEvent.neurotransmitter_type}
            </span>
          )}

          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title={isExpanded ? 'Recolher painel' : 'Expandir painel de neurotransmissores'}
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Corpo Expandido */}
      {isExpanded && (
        <div className="p-3 space-y-3 max-w-lg">
          {/* Navegação por Abas */}
          <div className="flex items-center gap-1 border-b border-slate-800 pb-1.5 text-[10px]">
            <button
              onClick={() => setActiveTab('neurotransmitters')}
              className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                activeTab === 'neurotransmitters'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Neurotransmissores & Estímulos
            </button>
            <button
              onClick={() => setActiveTab('stream')}
              className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors flex items-center gap-1 ${
                activeTab === 'stream'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity className="w-3 h-3 text-cyan-400" />
              Telemetria ao Vivo ({eventHistory.length})
            </button>
          </div>

          {activeTab === 'neurotransmitters' ? (
            <div className="space-y-2.5">
              <div className="text-[10px] text-slate-400 flex items-center justify-between">
                <span>Clique para injetar carga sináptica no grafo 3D:</span>
                <span className="text-[9px] text-cyan-400">Total pulsos: {pulseCount}</span>
              </div>

              {/* Grid dos 6 Neurotransmissores */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {neurotransmitters.map((type) => {
                  const cfg = NEUROTRANSMITTER_CONFIGS[type];
                  return (
                    <button
                      key={type}
                      onClick={() => handleStimulate(type)}
                      className="p-2 rounded-xl border text-left transition-all cursor-pointer hover:scale-[1.02] active:scale-98 flex flex-col justify-between"
                      style={{
                        borderColor: `${cfg.colorHex}40`,
                        backgroundColor: `${cfg.colorHex}10`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-black text-[10px] uppercase" style={{ color: cfg.colorHex }}>
                          {cfg.name}
                        </span>
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{
                            backgroundColor: cfg.colorHex,
                            boxShadow: `0 0 6px ${cfg.colorHex}`,
                          }}
                        />
                      </div>
                      <p className="text-[9px] text-slate-300 line-clamp-2 leading-tight">
                        {cfg.meaning}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Botão Especial: Sinapse Quebrada (Faísca de Desconexão) */}
              <button
                onClick={handleTriggerBrokenSynapse}
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-600 via-orange-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white font-bold text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(249,115,22,0.4)] cursor-pointer active:scale-98 transition-all"
              >
                <Flame className="w-4 h-4 text-yellow-200 animate-bounce" />
                <span>Simular "Sinapse Quebrada" com Faísca</span>
              </button>
            </div>
          ) : (
            /* Stream de Eventos Telemetria */
            <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin pr-1">
              {eventHistory.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-[10px]">
                  Nenhum evento registrado ainda. Dispare um neurotransmissor acima.
                </div>
              ) : (
                eventHistory.map((evt) => {
                  const cfg = NEUROTRANSMITTER_CONFIGS[evt.neurotransmitter_type] || NEUROTRANSMITTER_CONFIGS.SEROTONINA;
                  const isFail = evt.status === 'FAILED';
                  return (
                    <div
                      key={`${evt.sequence_id}_${evt.timestamp}`}
                      className="p-1.5 rounded-lg border text-[10px] flex items-center justify-between gap-2"
                      style={{
                        borderColor: isFail ? '#ef4444' : `${cfg.colorHex}30`,
                        backgroundColor: isFail ? '#450a0a' : `${cfg.colorHex}08`,
                      }}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: isFail ? '#ef4444' : cfg.colorHex }}
                        />
                        <span className="font-bold text-slate-200">
                          #{evt.sequence_id}
                        </span>
                        <span className="font-bold" style={{ color: cfg.colorHex }}>
                          {evt.neurotransmitter_type}
                        </span>
                        <span className="text-slate-400 truncate">
                          {evt.axon_id} ({evt.direction})
                        </span>
                      </div>
                      <span
                        className={`text-[9px] px-1 py-0.5 rounded font-bold uppercase shrink-0 ${
                          isFail ? 'bg-red-950 text-red-400 border border-red-500/50' : 'text-slate-400'
                        }`}
                      >
                        {isFail ? 'QUEBRADA' : `${Math.round(evt.intensity * 100)}%`}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
