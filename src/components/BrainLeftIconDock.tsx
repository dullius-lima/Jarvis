import React, { useState } from 'react';
import {
  Brain,
  Zap,
  Bot,
  Wrench,
  Database,
  Camera,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Minimize2,
  ShieldAlert,
  Flame,
  CheckCircle2,
  Activity,
} from 'lucide-react';
import { AgentDefinition, SynapseMemory } from '../types/neural';
import { ToolDefinition } from '../services/toolService';
import { NeurotransmitterType, NEUROTRANSMITTER_CONFIGS } from '../types/brainLink';
import { brainLinkService } from '../services/brainLinkService';

export type DockTabType = 'lobes' | 'synapses' | 'agents' | 'tools' | 'memories' | 'camera' | null;

export interface BrainLobeInfo {
  id: string;
  name: string;
  subname: string;
  location: string;
  colorHex: string;
  role: string;
  mappedItems: string[];
}

export const BRAIN_LOBES: BrainLobeInfo[] = [
  {
    id: 'frontal',
    name: 'Lobo Frontal',
    subname: 'Córtex Pré-Frontal & Executivo',
    location: 'Polo Anterior Superior',
    colorHex: '#f59e0b',
    role: 'Tomada de decisão estratégica, liderança suprema e planejamento financeiro.',
    mappedItems: ['Jarvis Supervisor Líder', 'Agente CFO Alocador de Capital'],
  },
  {
    id: 'parietal',
    name: 'Lobo Parietal',
    subname: 'Integração Multimodal',
    location: 'Dorso Superior-Posterior',
    colorHex: '#8b5cf6',
    role: 'Integração de estímulos sensoriais, percepção espacial e memórias sinápticas.',
    mappedItems: ['Memórias Neurais', 'Sincronizador de Agenda & Prazos'],
  },
  {
    id: 'temporal',
    name: 'Lobo Temporal',
    subname: 'Área Auditiva & Linguagem',
    location: 'Face Lateral-Inferior',
    colorHex: '#00e5ff',
    role: 'Reconhecimento contínuo de voz (Wake Word), transcrição Whisper e síntese vocal.',
    mappedItems: ['Webhook Microfone STT', 'Whisper Local', 'Edge-TTS Voz'],
  },
  {
    id: 'occipital',
    name: 'Lobo Occipital',
    subname: 'Córtex Visual & Alerta',
    location: 'Polo Posterior Caudal',
    colorHex: '#ef4444',
    role: 'Processamento de visão computacional, sentinela 24/7 e blindagem contra anomalias.',
    mappedItems: ['Sentinela & Firewall 24/7', 'Sensor de Visão/Tela'],
  },
  {
    id: 'cerebellum',
    name: 'Cerebelo',
    subname: 'Coordenação Subcortical',
    location: 'Base Póstero-Inferior',
    colorHex: '#0284c7',
    role: 'Equilíbrio temporal, harmonia entre fluxos paralelos e sincronização multi-máquinas.',
    mappedItems: ['Barramento Multi-Dispositivo', 'Fila de Tarefas Paralelas'],
  },
  {
    id: 'brainstem',
    name: 'Tronco Encefálico',
    subname: 'Eixo Vital & Barramento',
    location: 'Base Central Inferior',
    colorHex: '#38bdf8',
    role: 'Ingresso de Webhooks externos, ponte TCP/HTTP com a nuvem e orquestração n8n.',
    mappedItems: ['Universal Inbox Webhook', 'Conector n8n Neural Cloud'],
  },
];

interface BrainLeftIconDockProps {
  agents: AgentDefinition[];
  tools: ToolDefinition[];
  memories: SynapseMemory[];
  selectedAgentId: string;
  selectedToolId: string;
  selectedMemoryId: string;
  onSelectAgent: (id: string) => void;
  onSelectTool: (id: string) => void;
  onSelectMemory: (id: string) => void;
  onSelectLobe?: (lobeId: string) => void;
  selectedLobeId?: string | null;
  currentCameraView: 'iso' | 'top' | 'front' | 'side';
  onSetCameraView: (view: 'iso' | 'top' | 'front' | 'side') => void;
  onAdjustZoom: (delta: number) => void;
  onToggleRotate: () => void;
  isAutoRotating: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export const BrainLeftIconDock: React.FC<BrainLeftIconDockProps> = ({
  agents,
  tools,
  memories,
  selectedAgentId,
  selectedToolId,
  selectedMemoryId,
  onSelectAgent,
  onSelectTool,
  onSelectMemory,
  onSelectLobe,
  selectedLobeId,
  currentCameraView,
  onSetCameraView,
  onAdjustZoom,
  onToggleRotate,
  isAutoRotating,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const [activeTab, setActiveTab] = useState<DockTabType>(null);

  const toggleTab = (tab: DockTabType) => {
    setActiveTab((prev) => (prev === tab ? null : tab));
  };

  const handleStimulate = (type: NeurotransmitterType) => {
    const axonMap: Record<NeurotransmitterType, string> = {
      ADRENALINA: 'axon-core-sentinel',
      DOPAMINA: 'axon-core-cfo',
      SEROTONINA: 'axon-core-universal',
      ACETILCOLINA: 'axon-core-voice',
      CORTISOL: 'axon-core-n8n',
      GABA: 'axon-core-n8n',
    };
    brainLinkService.triggerNeurotransmitterTest(type, axonMap[type]);
  };

  const handleTriggerBrokenSynapse = () => {
    brainLinkService.triggerBrokenSynapseTest('axon-core-n8n');
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
    <div className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 z-40 flex items-center pointer-events-none select-none">
      {/* Barra de Ícones Vertical Compacta */}
      <div className="pointer-events-auto flex flex-col items-center gap-2 p-1.5 sm:p-2 bg-slate-950/90 backdrop-blur-xl border border-cyan-500/30 rounded-2xl shadow-[0_0_35px_rgba(2,132,199,0.25)]">
        {/* 1. Lobos Anatômicos */}
        <button
          onClick={() => toggleTab('lobes')}
          className={`p-2.5 rounded-xl transition-all cursor-pointer relative group ${
            activeTab === 'lobes'
              ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
              : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
          }`}
          title="Lobos Cerebrais Anatômicos"
        >
          <Brain className="w-5 h-5 text-cyan-400" />
          <span className="sr-only">Lobos</span>
          {/* Tooltip hover */}
          <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-950 border border-slate-700 text-cyan-300 text-[10px] font-mono rounded shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity hidden sm:block">
            Lobos Anatômicos
          </span>
        </button>

        {/* 2. Sinapses & Neurotransmissores */}
        <button
          onClick={() => toggleTab('synapses')}
          className={`p-2.5 rounded-xl transition-all cursor-pointer relative group ${
            activeTab === 'synapses'
              ? 'bg-amber-500/25 text-amber-300 border border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
              : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
          }`}
          title="Sinapses & Neurotransmissores"
        >
          <Zap className="w-5 h-5 text-amber-400" />
          <span className="sr-only">Sinapses</span>
          <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-950 border border-slate-700 text-amber-300 text-[10px] font-mono rounded shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity hidden sm:block">
            Neurotransmissores
          </span>
        </button>

        {/* 3. Meus Agentes (Criações do Usuário) */}
        <button
          onClick={() => toggleTab('agents')}
          className={`p-2.5 rounded-xl transition-all cursor-pointer relative group ${
            activeTab === 'agents'
              ? 'bg-red-500/25 text-red-300 border border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
              : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
          }`}
          title="Meus Agentes & Especialistas"
        >
          <Bot className="w-5 h-5 text-red-400" />
          <span className="sr-only">Agentes</span>
          <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-950 border border-slate-700 text-red-300 text-[10px] font-mono rounded shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity hidden sm:block">
            Meus Agentes ({agents.length})
          </span>
        </button>

        {/* 4. Ferramentas do Córtex */}
        <button
          onClick={() => toggleTab('tools')}
          className={`p-2.5 rounded-xl transition-all cursor-pointer relative group ${
            activeTab === 'tools'
              ? 'bg-yellow-500/25 text-yellow-300 border border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.4)]'
              : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
          }`}
          title="Ferramentas do Córtex"
        >
          <Wrench className="w-5 h-5 text-yellow-400" />
          <span className="sr-only">Ferramentas</span>
          <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-950 border border-slate-700 text-yellow-300 text-[10px] font-mono rounded shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity hidden sm:block">
            Ferramentas ({tools.length})
          </span>
        </button>

        {/* 5. Memórias Sinápticas */}
        <button
          onClick={() => toggleTab('memories')}
          className={`p-2.5 rounded-xl transition-all cursor-pointer relative group ${
            activeTab === 'memories'
              ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
              : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
          }`}
          title="Memórias Sinápticas"
        >
          <Database className="w-5 h-5 text-cyan-400" />
          <span className="sr-only">Memórias</span>
          <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-950 border border-slate-700 text-cyan-300 text-[10px] font-mono rounded shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity hidden sm:block">
            Memórias ({memories.length})
          </span>
        </button>

        {/* Divisor */}
        <div className="w-5 h-px bg-slate-800 my-0.5" />

        {/* 6. Câmera & Visualização 3D */}
        <button
          onClick={() => toggleTab('camera')}
          className={`p-2.5 rounded-xl transition-all cursor-pointer relative group ${
            activeTab === 'camera'
              ? 'bg-purple-500/25 text-purple-300 border border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.4)]'
              : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
          }`}
          title="Ângulos de Câmera & Rotação"
        >
          <Camera className="w-5 h-5 text-purple-400" />
          <span className="sr-only">Câmera</span>
          <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-950 border border-slate-700 text-purple-300 text-[10px] font-mono rounded shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity hidden sm:block">
            Câmera & Controles 3D
          </span>
        </button>
      </div>

      {/* Gaveta Expansível à Direita do Dock (Slide-over limpo sem cobrir o centro do cérebro) */}
      {activeTab && (
        <div className="pointer-events-auto ml-2.5 w-[280px] sm:w-[320px] max-h-[75vh] overflow-y-auto scrollbar-thin bg-slate-950/95 backdrop-blur-2xl border border-cyan-500/40 rounded-2xl p-4 shadow-[0_0_50px_rgba(2,132,199,0.35)] text-slate-100 font-mono animate-in slide-in-from-left-4 fade-in duration-200">
          {/* Cabeçalho da Gaveta com Botão Fechar */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
            <span className="text-xs font-black uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
              {activeTab === 'lobes' && <Brain className="w-4 h-4 text-cyan-400" />}
              {activeTab === 'synapses' && <Zap className="w-4 h-4 text-amber-400" />}
              {activeTab === 'agents' && <Bot className="w-4 h-4 text-red-400" />}
              {activeTab === 'tools' && <Wrench className="w-4 h-4 text-yellow-400" />}
              {activeTab === 'memories' && <Database className="w-4 h-4 text-cyan-400" />}
              {activeTab === 'camera' && <Camera className="w-4 h-4 text-purple-400" />}
              {activeTab === 'lobes' && 'Lobos Anatômicos'}
              {activeTab === 'synapses' && 'Barramento Sináptico'}
              {activeTab === 'agents' && 'Meus Agentes'}
              {activeTab === 'tools' && 'Ferramentas do Córtex'}
              {activeTab === 'memories' && 'Memórias Sinápticas'}
              {activeTab === 'camera' && 'Câmera & Visualização'}
            </span>
            <button
              onClick={() => setActiveTab(null)}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-900 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* 1. Conteúdo: Lobos Cerebrais */}
          {activeTab === 'lobes' && (
            <div className="space-y-2.5 text-xs">
              <p className="text-[10px] text-slate-400 leading-snug">
                Cada lobo anatômico é preenchido com sulcos profundos e hospeda agentes e ferramentas físicas:
              </p>
              <div className="space-y-2">
                {BRAIN_LOBES.map((lobe) => {
                  const isSelected = selectedLobeId === lobe.id;
                  return (
                    <div
                      key={lobe.id}
                      onClick={() => onSelectLobe?.(lobe.id)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-cyan-950/60 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-bold text-[11px]" style={{ color: lobe.colorHex }}>
                          {lobe.name}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                          {lobe.location}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-300 leading-tight mb-1.5">
                        {lobe.role}
                      </p>
                      <div className="flex items-center gap-1 flex-wrap">
                        {lobe.mappedItems.map((item) => (
                          <span
                            key={item}
                            className="text-[8px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 font-sans"
                          >
                            ● {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Conteúdo: Sinapses & Neurotransmissores */}
          {activeTab === 'synapses' && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400">Pulsos de Neurotransmissores:</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                  WebSocket 60 FPS
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {neurotransmitters.map((type) => {
                  const cfg = NEUROTRANSMITTER_CONFIGS[type];
                  return (
                    <button
                      key={type}
                      onClick={() => handleStimulate(type)}
                      className="p-2 rounded-xl border text-left transition-all cursor-pointer hover:scale-[1.02] active:scale-98"
                      style={{
                        borderColor: `${cfg.colorHex}40`,
                        backgroundColor: `${cfg.colorHex}12`,
                      }}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-bold text-[10px] uppercase" style={{ color: cfg.colorHex }}>
                          {cfg.name}
                        </span>
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: cfg.colorHex, boxShadow: `0 0 6px ${cfg.colorHex}` }}
                        />
                      </div>
                      <p className="text-[9px] text-slate-300 leading-tight">
                        {cfg.meaning}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Botão de Falha com Faísca */}
              <button
                onClick={handleTriggerBrokenSynapse}
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-600 via-orange-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(249,115,22,0.4)] cursor-pointer active:scale-98 transition-all"
              >
                <Flame className="w-3.5 h-3.5 text-yellow-200 animate-bounce" />
                <span>Sinapse Quebrada (Faísca Elétrica)</span>
              </button>
            </div>
          )}

          {/* 3. Conteúdo: Meus Agentes (Criações Reais) */}
          {activeTab === 'agents' && (
            <div className="space-y-2 text-xs">
              <div className="text-[10px] text-slate-400 flex items-center justify-between">
                <span>Agentes Fixados no Tecido Cerebral:</span>
                <span className="text-[9px] text-cyan-400 font-bold">{agents.length} Ativos</span>
              </div>
              <div className="space-y-1.5">
                {agents.map((ag) => {
                  const isSel = ag.id === selectedAgentId;
                  return (
                    <div
                      key={ag.id}
                      onClick={() => onSelectAgent(ag.id)}
                      className={`p-2 rounded-xl border transition-all cursor-pointer ${
                        isSel
                          ? 'bg-red-950/60 border-red-500 text-red-200 shadow-[0_0_12px_rgba(239,68,68,0.3)]'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-bold text-[11px] truncate">{ag.name}</span>
                        <span className="text-[8px] px-1 rounded bg-slate-950 text-slate-400 border border-slate-800">
                          {ag.targetDatabase || 'NÚCLEO'}
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-400 line-clamp-1">{ag.role}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Conteúdo: Ferramentas do Córtex */}
          {activeTab === 'tools' && (
            <div className="space-y-2 text-xs">
              <div className="text-[10px] text-slate-400 flex items-center justify-between">
                <span>Ferramentas de Execução:</span>
                <span className="text-[9px] text-yellow-400 font-bold">{tools.length}</span>
              </div>
              <div className="space-y-1.5">
                {tools.map((tl) => {
                  const isSel = tl.id === selectedToolId;
                  return (
                    <div
                      key={tl.id}
                      onClick={() => onSelectTool(tl.id)}
                      className={`p-2 rounded-xl border transition-all cursor-pointer ${
                        isSel
                          ? 'bg-yellow-950/60 border-yellow-500 text-yellow-200 shadow-[0_0_12px_rgba(250,204,21,0.3)]'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-bold text-[11px] truncate">{tl.name}</span>
                        <span className="text-[8px] px-1 rounded bg-slate-950 text-yellow-400/80 border border-slate-800">
                          {tl.type.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-400 line-clamp-1">{tl.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. Conteúdo: Memórias Sinápticas */}
          {activeTab === 'memories' && (
            <div className="space-y-2 text-xs">
              <div className="text-[10px] text-slate-400 flex items-center justify-between">
                <span>Memórias Fixadas no Córtex:</span>
                <span className="text-[9px] text-cyan-400 font-bold">{memories.length}</span>
              </div>
              <div className="space-y-1.5">
                {memories.map((mm) => {
                  const isSel = mm.id === selectedMemoryId;
                  return (
                    <div
                      key={mm.id}
                      onClick={() => onSelectMemory(mm.id)}
                      className={`p-2 rounded-xl border transition-all cursor-pointer ${
                        isSel
                          ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-bold text-[11px] truncate">{mm.title}</span>
                        <span className="text-[8px] px-1 rounded bg-slate-950 text-cyan-400/80 border border-slate-800">
                          {mm.category}
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-400 line-clamp-1">{mm.content || mm.title}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 6. Conteúdo: Câmera & Visualização 3D */}
          {activeTab === 'camera' && (
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1.5 font-bold">
                  Perspectivas Anatômicas:
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'iso', label: '3D Isométrica' },
                    { id: 'top', label: 'Superior (Dorso)' },
                    { id: 'front', label: 'Frontal (Rosto)' },
                    { id: 'side', label: 'Lateral (Perfil)' },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => onSetCameraView(preset.id as any)}
                      className={`p-2 rounded-xl text-center font-bold text-[10px] transition-all cursor-pointer border ${
                        currentCameraView === preset.id
                          ? 'bg-purple-600/30 text-purple-200 border-purple-400'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1.5 font-bold">
                  Controle de Zoom & Rotação:
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onAdjustZoom(-0.8)}
                    className="flex-1 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Zoom +</span>
                  </button>
                  <button
                    onClick={() => onAdjustZoom(0.8)}
                    className="flex-1 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <ZoomOut className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Zoom -</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
                <button
                  onClick={onToggleRotate}
                  className={`flex-1 py-1.5 rounded-lg border text-[10px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    isAutoRotating
                      ? 'bg-cyan-950 border-cyan-500/50 text-cyan-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>{isAutoRotating ? 'Rotação Ativa' : 'Pausar Giro'}</span>
                </button>
                <button
                  onClick={onToggleFullscreen}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white cursor-pointer"
                  title="Tela cheia"
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
