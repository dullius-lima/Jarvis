import React, { useState, useEffect, useRef } from 'react';
import {
  N8nEngineService,
  KNOWN_BIOMETRIC_PROFILES,
} from '../services/n8nEngineService';
import {
  BiometricIdentityBadge,
  SubWorkflowDefinition,
  CompleteN8nOrchestrationResult,
  SubWorkflowModuleId,
} from '../types/n8nArchitecture';
import {
  X,
  Play,
  Activity,
  Cpu,
  Layers,
  Shield,
  Eye,
  Camera,
  Monitor,
  Mic,
  MicOff,
  Volume2,
  Database,
  Server,
  FolderGit2,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  Sparkles,
  RefreshCw,
  Download,
  Copy,
  ExternalLink,
  ChevronRight,
  UserCheck,
  TrendingUp,
  ShoppingCart,
  Calendar,
  FileText,
  Search,
  Home,
  Sliders,
  Code,
} from 'lucide-react';

interface N8nNeuralStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerSynapse?: (label: string) => void;
}

export const N8nNeuralStudioModal: React.FC<N8nNeuralStudioModalProps> = ({
  isOpen,
  onClose,
  onTriggerSynapse,
}) => {
  const n8nService = N8nEngineService.getInstance();

  const [activeTab, setActiveTab] = useState<'graph' | 'sensory' | 'subworkflows' | 'memory' | 'deploy'>('graph');
  const [activeBadge, setActiveBadge] = useState<BiometricIdentityBadge>(() => n8nService.getActiveBadge());
  const [envMode, setEnvMode] = useState<'TESTING' | 'PRODUCTION'>(() => n8nService.getEnvMode());
  const [subWorkflows, setSubWorkflows] = useState<SubWorkflowDefinition[]>(() => n8nService.getSubWorkflows());
  const [executionHistory, setExecutionHistory] = useState<CompleteN8nOrchestrationResult[]>(() => n8nService.getExecutionHistory());

  // Input sensorial para teste
  const [voiceInputText, setVoiceInputText] = useState<string>('Auditar alocação B3 da carteira e ajustar luzes da sala para modo noturno.');
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<CompleteN8nOrchestrationResult | null>(null);

  // Câmera & Tela
  const [screenSnapshot, setScreenSnapshot] = useState<string | null>(() => n8nService.getLastScreenSnapshot());
  const [isCapturingScreen, setIsCapturingScreen] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Copiado feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Nó selecionado no grafo
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('node-orchestrator');

  useEffect(() => {
    const unsub = n8nService.subscribe(() => {
      setActiveBadge(n8nService.getActiveBadge());
      setEnvMode(n8nService.getEnvMode());
      setSubWorkflows(n8nService.getSubWorkflows());
      setExecutionHistory(n8nService.getExecutionHistory());
      setScreenSnapshot(n8nService.getLastScreenSnapshot());
    });
    return () => unsub();
  }, []);

  // Gerenciamento da Webcam para biometria ao vivo
  useEffect(() => {
    if (isCameraActive && videoRef.current) {
      navigator.mediaDevices?.getUserMedia({ video: { width: 320, height: 240 } })
        .then((stream) => {
          mediaStreamRef.current = stream;
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch((err) => {
          console.warn('Não foi possível acessar a webcam:', err.message);
          setIsCameraActive(false);
        });
    } else {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    }
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isCameraActive]);

  if (!isOpen) return null;

  const handleCaptureScreen = async () => {
    setIsCapturingScreen(true);
    const snap = await n8nService.captureLiveScreen();
    if (snap) {
      setScreenSnapshot(snap);
      onTriggerSynapse?.('Captura de tela assimilada pela Camada Sensorial do n8n.');
    }
    setIsCapturingScreen(false);
  };

  const handleExecutePipeline = async () => {
    if (!voiceInputText.trim() || isExecuting) return;
    setIsExecuting(true);
    onTriggerSynapse?.(`Disparando Master Workflow n8n via Crachá [${activeBadge.name}]...`);

    try {
      const res = await n8nService.executeMasterWorkflow(voiceInputText, {
        includeScreen: Boolean(screenSnapshot),
        includeCamera: isCameraActive,
        customBadge: activeBadge,
      });
      setLastResult(res);
      onTriggerSynapse?.(`Pipeline n8n executado em OCI VM. Resposta sintetizada.`);
    } finally {
      setIsExecuting(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const deployPack = n8nService.getOracleDeployPackage();

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xl flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl max-w-6xl w-full h-[94vh] flex flex-col shadow-[0_0_50px_rgba(6,182,212,0.15)] overflow-hidden">
        
        {/* ================================================================== */}
        {/* CABEÇALHO EXECUTIVO N8N & STATUS ORACLE VM                         */}
        {/* ================================================================== */}
        <header className="px-4 sm:px-6 py-3.5 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-500/50 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-sans text-white tracking-wide flex items-center gap-2">
                  <span>JARVIS N8N NEURAL ENGINE</span>
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/40">
                    Oracle Cloud VM · Port 5678
                  </span>
                </h2>
              </div>
              <p className="text-xs text-slate-400 font-sans">
                Sistema Operacional Autônomo com 5 Camadas: Sensorial, Roteamento, Memória, Sub-workflows e Governança
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Alternador de Ambiente: TESTE vs PRODUÇÃO */}
            <button
              onClick={() => n8nService.toggleEnvMode()}
              className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                envMode === 'PRODUCTION'
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/60'
                  : 'bg-amber-950/60 border-amber-500/50 text-amber-300 hover:bg-amber-900/60'
              }`}
              title="Alternar variáveis de ambiente globais"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Ambiente: {envMode === 'PRODUCTION' ? 'PRODUÇÃO' : 'TESTES'}</span>
            </button>

            {/* Crachá Biométrico Ativo (Reconhecimento Facial) */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1">
              <img
                src={activeBadge.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80'}
                alt={activeBadge.name}
                className="w-6 h-6 rounded-full object-cover border border-cyan-400/60"
              />
              <div className="text-left">
                <div className="text-[11px] font-bold text-slate-200 leading-tight">
                  {activeBadge.name}
                </div>
                <div className="text-[9px] text-cyan-400 font-mono leading-tight flex items-center gap-1">
                  {activeBadge.role === 'ADMIN_TOTAL' ? <Shield className="w-2.5 h-2.5 text-cyan-400" /> : <Lock className="w-2.5 h-2.5 text-amber-400" />}
                  {activeBadge.role === 'ADMIN_TOTAL' ? 'ACESSO TOTAL' : 'RESTRITO'}
                </div>
              </div>
              {/* Seletor rápido de quem está na câmera */}
              <select
                value={activeBadge.personId}
                onChange={(e) => {
                  const b = KNOWN_BIOMETRIC_PROFILES.find((p) => p.personId === e.target.value);
                  if (b) {
                    n8nService.setActiveBadge(b);
                    onTriggerSynapse?.(`Crachá biométrico alterado para [${b.name}]`);
                  }
                }}
                className="bg-slate-950 border border-slate-700 text-slate-200 rounded px-1.5 py-0.5 text-[10px] outline-none ml-1 cursor-pointer"
              >
                {KNOWN_BIOMETRIC_PROFILES.map((p) => (
                  <option key={p.personId} value={p.personId}>
                    {p.name} ({p.role === 'ADMIN_TOTAL' ? 'Admin' : 'Família'})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              title="Fechar Studio"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* ================================================================== */}
        {/* NAVEGAÇÃO ENTRE ABAS DO N8N STUDIO                                 */}
        {/* ================================================================== */}
        <nav className="flex items-center gap-1 px-4 sm:px-6 bg-slate-950/50 border-b border-slate-800/80 overflow-x-auto py-2 shrink-0 text-xs font-mono">
          <button
            onClick={() => setActiveTab('graph')}
            className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'graph'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Activity className="w-4 h-4 text-cyan-400" />
            <span>Grafo Neural & Fluxos</span>
          </button>

          <button
            onClick={() => setActiveTab('sensory')}
            className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'sensory'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Eye className="w-4 h-4 text-sky-400" />
            <span>Camada Sensorial (Voz & Olhos)</span>
          </button>

          <button
            onClick={() => setActiveTab('subworkflows')}
            className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'subworkflows'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Cpu className="w-4 h-4 text-purple-400" />
            <span>Sub-Workflows (Módulos 1 a 4)</span>
          </button>

          <button
            onClick={() => setActiveTab('memory')}
            className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'memory'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Database className="w-4 h-4 text-emerald-400" />
            <span>Data Lake, RAG & Evolução</span>
          </button>

          <button
            onClick={() => setActiveTab('deploy')}
            className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'deploy'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Server className="w-4 h-4 text-amber-400" />
            <span>Deploy Oracle VM & VSCode</span>
          </button>
        </nav>

        {/* ================================================================== */}
        {/* CORPO PRINCIPAL COM CONTEÚDO DAS ABAS                              */}
        {/* ================================================================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-900/60">

          {/* ---------------------------------------------------------------- */}
          {/* ABA 1: GRAFO NEURAL & FLUXOS (CÉREBRO CENTRAL & SINAPSES N8N)    */}
          {/* ---------------------------------------------------------------- */}
          {activeTab === 'graph' && (
            <div className="space-y-4">
              {/* Barra de Disparo Rápido do Pipeline */}
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-cyan-500/30 flex flex-col sm:flex-row items-center gap-3 shadow-lg">
                <div className="flex items-center gap-2 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                  <span className="text-xs font-mono font-bold text-cyan-300">DISPARO DO MASTER WORKFLOW:</span>
                </div>
                <input
                  type="text"
                  value={voiceInputText}
                  onChange={(e) => setVoiceInputText(e.target.value)}
                  placeholder="Digite o comando sensorial de voz ou requisição..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400 font-sans w-full"
                />
                <button
                  onClick={handleExecutePipeline}
                  disabled={isExecuting || !voiceInputText.trim()}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 via-sky-500 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-slate-950 font-bold text-xs flex items-center gap-2 disabled:opacity-40 transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] cursor-pointer shrink-0"
                >
                  <Play className={`w-4 h-4 fill-current ${isExecuting ? 'animate-spin' : ''}`} />
                  <span>{isExecuting ? 'Orquestrando n8n...' : 'Executar Pipeline n8n'}</span>
                </button>
              </div>

              {/* Canvas Visual do Grafo de Nós com Linhas de Sinapse Pulsantes */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 relative overflow-hidden shadow-2xl min-h-[420px]">
                <div className="flex items-center justify-between mb-3 text-xs font-mono text-slate-400 border-b border-slate-850 pb-2">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <span className="font-bold text-slate-200">MONITORAMENTO VISUAL DO GRAFO DE EXECUÇÃO N8N</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400"></span> Camada 1: Sensorial</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400"></span> Camada 2: Roteamento</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400"></span> Camada 3: Memória</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400"></span> Camada 4: Sub-Workflows</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400"></span> Camada 5: Governança</span>
                  </div>
                </div>

                {/* SVG Interativo com Nós e Sinapses Pulsantes */}
                <div className="relative w-full h-[380px] bg-[#020617] rounded-xl border border-slate-900 p-2 overflow-x-auto flex items-center justify-between gap-4">
                  {/* Coluna 1: Entradas Sensoriais */}
                  <div className="flex flex-col justify-around h-full w-48 shrink-0 space-y-2">
                    <div className={`p-2.5 rounded-xl border text-xs font-mono transition-all ${isExecuting ? 'bg-sky-950/80 border-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.5)]' : 'bg-slate-900/90 border-slate-700 text-slate-300'}`}>
                      <div className="flex items-center gap-1.5 font-bold text-sky-400">
                        <Mic className="w-3.5 h-3.5" />
                        <span>Canal de Voz (STT)</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 truncate">
                        "{voiceInputText.slice(0, 24)}..."
                      </div>
                    </div>

                    <div className={`p-2.5 rounded-xl border text-xs font-mono transition-all ${screenSnapshot ? 'bg-sky-950/80 border-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.5)]' : 'bg-slate-900/90 border-slate-700 text-slate-300'}`}>
                      <div className="flex items-center gap-1.5 font-bold text-sky-400">
                        <Monitor className="w-3.5 h-3.5" />
                        <span>Monitor de Tela</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        {screenSnapshot ? 'Frame Capturado' : 'Aguardando Disparo'}
                      </div>
                    </div>

                    <div className={`p-2.5 rounded-xl border text-xs font-mono transition-all ${isCameraActive ? 'bg-sky-950/80 border-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.5)]' : 'bg-slate-900/90 border-slate-700 text-slate-300'}`}>
                      <div className="flex items-center gap-1.5 font-bold text-sky-400">
                        <Camera className="w-3.5 h-3.5" />
                        <span>Reconhecimento Facial</span>
                      </div>
                      <div className="text-[10px] text-emerald-400 mt-1 truncate">
                        Crachá: {activeBadge.name}
                      </div>
                    </div>
                  </div>

                  {/* Seta/Sinapse de Conexão 1 -> 2 */}
                  <div className="flex flex-col items-center justify-center text-cyan-400 animate-pulse">
                    <ChevronRight className="w-6 h-6" />
                    <span className="text-[9px] font-mono">Webhook</span>
                  </div>

                  {/* Coluna 2: Cérebro Central & Orquestrador n8n */}
                  <div className="flex flex-col justify-center h-full w-64 shrink-0">
                    <div
                      onClick={() => setSelectedNodeId('node-orchestrator')}
                      className={`p-3.5 rounded-2xl border text-xs font-mono transition-all cursor-pointer ${
                        selectedNodeId === 'node-orchestrator'
                          ? 'bg-cyan-950/90 border-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.4)] ring-2 ring-cyan-500/30'
                          : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:border-cyan-500/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                          <Cpu className="w-4 h-4 text-cyan-400" />
                          ORQUESTRADOR N8N
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-500/40 font-bold">
                          CÉREBRO
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-300">
                        Roteamento Inteligente Híbrido:
                      </div>
                      <div className="mt-1.5 flex flex-col gap-1 text-[10px]">
                        <span className="px-2 py-0.5 rounded bg-slate-950 text-emerald-400 border border-emerald-500/30">
                          • LLM Integrada: Rotinas & Privado
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-950 text-sky-400 border border-sky-500/30">
                          • LLM Comercial: Visão & Estratégia
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Seta/Sinapse de Conexão 2 -> 3 e 4 */}
                  <div className="flex flex-col items-center justify-center text-purple-400 animate-pulse">
                    <ChevronRight className="w-6 h-6" />
                    <span className="text-[9px] font-mono">Delegação</span>
                  </div>

                  {/* Coluna 3: Sub-workflows Independentes (Módulos 1 a 4) */}
                  <div className="flex flex-col justify-around h-full w-64 shrink-0 space-y-1.5">
                    {subWorkflows.slice(0, 4).map((sw) => (
                      <div
                        key={sw.id}
                        onClick={() => setSelectedNodeId(sw.id)}
                        className={`p-2 rounded-xl border text-[11px] font-mono transition-all cursor-pointer flex items-center justify-between ${
                          sw.status === 'COMPLETED'
                            ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300'
                            : sw.status === 'BLOCKED_RBAC'
                            ? 'bg-red-950/60 border-red-500/60 text-red-300'
                            : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:border-purple-400'
                        }`}
                      >
                        <div className="truncate pr-1">
                          <div className="font-bold truncate">{sw.name}</div>
                          <div className="text-[9px] text-slate-400">{sw.codeLanguage} · {sw.moduleGroupName}</div>
                        </div>
                        <span className="text-[9px] font-bold shrink-0 px-1.5 py-0.5 rounded bg-slate-950">
                          {sw.status === 'COMPLETED' ? 'OK' : sw.status === 'BLOCKED_RBAC' ? 'RBAC' : 'IDLE'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Seta/Sinapse de Conexão 4 -> 5 */}
                  <div className="flex flex-col items-center justify-center text-amber-400 animate-pulse">
                    <ChevronRight className="w-6 h-6" />
                    <span className="text-[9px] font-mono">Síntese</span>
                  </div>

                  {/* Coluna 4: Saída de Voz TTS & Retorno de Governança */}
                  <div className="flex flex-col justify-center h-full w-48 shrink-0 space-y-2">
                    <div className="p-3 rounded-xl bg-slate-900 border border-amber-500/40 text-xs font-mono">
                      <div className="font-bold text-amber-400 flex items-center gap-1.5">
                        <Volume2 className="w-4 h-4" />
                        <span>Saída de Voz (TTS)</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        Síntese vocal natural gerada pelo n8n
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/40 text-xs font-mono">
                      <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                        <Database className="w-4 h-4" />
                        <span>Gravação Evolutiva</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        Auto-aperfeiçoamento gravado no PostgreSQL
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Painel Inferior: Chain of Thought (Pensamento da IA) & Último Retorno */}
              {lastResult && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-cyan-500/30 text-xs font-mono space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-bold text-cyan-300 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                      CHAIN OF THOUGHT (RACIOCÍNIO DO ORQUESTRADOR N8N)
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Motor: {lastResult.orchestratorDecision.modelChosen} ({lastResult.orchestratorDecision.provider})
                    </span>
                  </div>

                  {/* Passos de Raciocínio */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                      <div className="font-bold text-slate-300 text-[11px] mb-1">Passos Cognitivos:</div>
                      {lastResult.orchestratorDecision.chainOfThought.map((cot, idx) => (
                        <div key={idx} className="text-[11px] text-slate-400 flex items-start gap-1.5">
                          <span className="text-cyan-400">›</span>
                          <span>{cot}</span>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                      <div className="font-bold text-slate-300 text-[11px]">Voz Sintetizada de Resposta:</div>
                      <div className="text-slate-200 text-[11px] italic bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                        "{lastResult.finalSpeechSynthesisText}"
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                        <span>Tokens Preservados: ~{lastResult.orchestratorDecision.estimatedTokensPreserved}</span>
                        <span className="text-emerald-400 font-bold">RBAC: {lastResult.rbacSummary.clearanceLevel}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* ABA 2: CAMADA SENSORIAL & PERCEPÇÃO (VOZ, TELA & WEBCAM)         */}
          {/* ---------------------------------------------------------------- */}
          {activeTab === 'sensory' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Canal de Voz (STT & TTS) */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Mic className="w-5 h-5 text-cyan-400" />
                  <div>
                    <h3 className="font-bold text-white text-sm">Canal 1: Voz (Ouvido & Fala)</h3>
                    <p className="text-xs text-slate-400">Captura em milissegundos com Speech-to-Text e resposta em áudio natural TTS</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-300 font-mono block mb-1">Entrada de Voz Transcrita (STT):</label>
                    <textarea
                      rows={3}
                      value={voiceInputText}
                      onChange={(e) => setVoiceInputText(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none focus:border-cyan-400 font-mono"
                    />
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-300">Voz do Jarvis:</span>
                    <span className="text-xs font-mono text-cyan-400 font-bold">Natural PT-BR Neuronal</span>
                  </div>
                </div>
              </div>

              {/* Canal de Visão Computacional (Tela & Webcam) */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Eye className="w-5 h-5 text-sky-400" />
                  <div>
                    <h3 className="font-bold text-white text-sm">Canal 2: Olhos (Tela & Webcam)</h3>
                    <p className="text-xs text-slate-400">Monitoramento de tela ativa e reconhecimento facial com crachá de identidade</p>
                  </div>
                </div>

                {/* Captura de Tela */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-300 font-mono">Monitor de Tela:</span>
                    <button
                      onClick={handleCaptureScreen}
                      disabled={isCapturingScreen}
                      className="px-3 py-1 rounded-lg bg-sky-950 border border-sky-500/40 hover:bg-sky-900 text-sky-300 text-xs font-mono flex items-center gap-1.5 cursor-pointer"
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      <span>{isCapturingScreen ? 'Capturando...' : 'Capturar Tela Agora'}</span>
                    </button>
                  </div>

                  {screenSnapshot ? (
                    <div className="relative rounded-xl overflow-hidden border border-slate-700 h-28 bg-black">
                      <img src={screenSnapshot} alt="Captura de Tela" className="w-full h-full object-cover" />
                      <div className="absolute bottom-1 right-1 bg-black/80 px-2 py-0.5 rounded text-[10px] text-cyan-300 font-mono">
                        Frame Ativo no n8n
                      </div>
                    </div>
                  ) : (
                    <div className="h-24 rounded-xl border border-dashed border-slate-800 flex items-center justify-center text-xs text-slate-500 font-mono">
                      Nenhuma captura de tela no buffer
                    </div>
                  )}
                </div>

                {/* Webcam & Biometria Facial */}
                <div className="space-y-2 pt-2 border-t border-slate-850">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-300 font-mono">Webcam Facial:</span>
                    <button
                      onClick={() => setIsCameraActive(!isCameraActive)}
                      className={`px-3 py-1 rounded-lg border text-xs font-mono flex items-center gap-1.5 cursor-pointer ${
                        isCameraActive
                          ? 'bg-red-950 border-red-500/50 text-red-300'
                          : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-cyan-400'
                      }`}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>{isCameraActive ? 'Desativar Câmera' : 'Ativar Webcam'}</span>
                    </button>
                  </div>

                  {isCameraActive ? (
                    <div className="relative rounded-xl overflow-hidden border border-emerald-500/50 h-28 bg-black">
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                      <div className="absolute top-1 left-1 bg-emerald-950/90 border border-emerald-500/40 px-2 py-0.5 rounded text-[10px] text-emerald-300 font-mono flex items-center gap-1">
                        <UserCheck className="w-3 h-3" />
                        <span>Crachá Identificado: {activeBadge.name} ({Math.round(activeBadge.confidence * 100)}%)</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span>Crachá ativo por padrão: <strong>{activeBadge.name}</strong> ({activeBadge.role})</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* ABA 3: SUB-WORKFLOWS & MÓDULOS (AI TOOLS INDEPENDENTES)          */}
          {/* ---------------------------------------------------------------- */}
          {activeTab === 'subworkflows' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-purple-500/30 text-xs font-mono text-slate-300 flex items-center justify-between">
                <span>Arquitetura Desacoplada: Cada módulo roda como um Sub-Workflow independente no n8n acionado sob demanda.</span>
                <span className="text-purple-400 font-bold">{subWorkflows.length} Módulos Registrados</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {subWorkflows.map((sw) => (
                  <div
                    key={sw.id}
                    className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-purple-500/40 transition-all space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-purple-950/70 border border-purple-500/40 flex items-center justify-center text-purple-300">
                          <Code className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-xs">{sw.name}</h4>
                          <span className="text-[10px] text-purple-400 font-mono">{sw.moduleGroupName}</span>
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-slate-900 border border-slate-700 text-slate-300">
                        {sw.codeLanguage}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 font-sans">
                      {sw.description}
                    </p>

                    <div className="pt-2 border-t border-slate-850 flex items-center justify-between text-[11px] font-mono">
                      <span className="text-slate-500 truncate">Endpoint: {sw.triggerWebhookPath}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        sw.status === 'COMPLETED' ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-900 text-slate-400'
                      }`}>
                        {sw.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* ABA 4: DATA LAKE, RAG & EVOLUÇÃO (MEMÓRIA VETORIAL E HISTÓRICO)  */}
          {/* ---------------------------------------------------------------- */}
          {activeTab === 'memory' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Documentos RAG & Banco Vetorial */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="font-bold text-white text-xs flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-400" />
                    Memória Semântica & RAG (Banco Vetorial)
                  </h4>
                  <span className="text-[10px] text-emerald-400 font-mono">4 Documentos Ativos</span>
                </div>

                <div className="space-y-2.5">
                  {n8nService.getRagDocuments().map((doc) => (
                    <div key={doc.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-200">{doc.title}</span>
                        <span className="text-[10px] text-cyan-400 font-mono">{Math.round(doc.similarityScore * 100)}% match</span>
                      </div>
                      <p className="text-[11px] text-slate-400">{doc.snippet}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Memória Biográfica & Evolução */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="font-bold text-white text-xs flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Memória Biográfica & Treinamento da LLM Proprietária
                  </h4>
                  <span className="text-[10px] text-amber-400 font-mono">Evolução Contínua</span>
                </div>

                <div className="space-y-2 text-xs font-mono">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <div className="font-bold text-emerald-400">Época 42: Ajuste de Bazin sobre TAEE11</div>
                    <p className="text-[11px] text-slate-400">
                      Decisão validada por Matheus Dullius: Margem de segurança de 12% aprovada para aporte fracionado.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <div className="font-bold text-cyan-400">Época 41: Reconhecimento Facial Marina</div>
                    <p className="text-[11px] text-slate-400">
                      Ajustada iluminação e temperatura ao detectar presença no escritório após 19:30.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <div className="font-bold text-purple-400">Época 40: Bloqueio de Acesso por Biometria</div>
                    <p className="text-[11px] text-slate-400">
                      Tentativa de consulta a chaves privadas rejeitada por crachá sem privilégio ADMIN_TOTAL.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* ABA 5: DEPLOY ORACLE VM & VSCODE (PACOTE DE IMPLANTAÇÃO)         */}
          {/* ---------------------------------------------------------------- */}
          {activeTab === 'deploy' && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/40 via-slate-950 to-slate-950 border border-amber-500/40 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <Server className="w-4 h-4 text-amber-400" />
                    PACOTE COMPLETO DE IMPLANTAÇÃO NA MÁQUINA DA ORACLE & VSCODE
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Tudo pronto para rodar na sua máquina da Oracle Cloud Always Free com PostgreSQL, Docker Compose e workflows JSON.
                  </p>
                </div>
                <button
                  onClick={() => {
                    const blob = new Blob([
                      `=== DOCKER COMPOSE ===\n${deployPack.dockerCompose}\n\n=== SCRIPT ORACLE BASH ===\n${deployPack.oracleSetupBash}\n\n=== WORKFLOW JSON ===\n${deployPack.masterWorkflowJson}`
                    ], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'jarvis-n8n-oracle-deploy-pack.txt';
                    a.click();
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar Pacote (.txt)</span>
                </button>
              </div>

              {/* Seletor de Arquivos para Copiar */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. docker-compose.yml */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-200 font-mono">1. docker-compose.yml (Oracle VM)</span>
                    <button
                      onClick={() => copyToClipboard(deployPack.dockerCompose, 'docker')}
                      className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-cyan-400 text-[11px] font-mono border border-slate-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedKey === 'docker' ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                  <pre className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-[10px] text-slate-300 font-mono overflow-x-auto max-h-56">
                    {deployPack.dockerCompose}
                  </pre>
                </div>

                {/* 2. oracle-setup.sh */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-200 font-mono">2. oracle-setup.sh (1-Click Install)</span>
                    <button
                      onClick={() => copyToClipboard(deployPack.oracleSetupBash, 'bash')}
                      className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-cyan-400 text-[11px] font-mono border border-slate-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedKey === 'bash' ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                  <pre className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-[10px] text-slate-300 font-mono overflow-x-auto max-h-56">
                    {deployPack.oracleSetupBash}
                  </pre>
                </div>

                {/* 3. master-workflow.json */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-200 font-mono">3. jarvis-master-orchestrator.json (n8n Import)</span>
                    <button
                      onClick={() => copyToClipboard(deployPack.masterWorkflowJson, 'workflow')}
                      className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-cyan-400 text-[11px] font-mono border border-slate-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedKey === 'workflow' ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                  <pre className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-[10px] text-slate-300 font-mono overflow-x-auto max-h-56">
                    {deployPack.masterWorkflowJson}
                  </pre>
                </div>

                {/* 4. VSCode Debug Launch */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-200 font-mono">4. .vscode/launch.json (Debug no VSCode)</span>
                    <button
                      onClick={() => copyToClipboard(deployPack.vscodeConfig, 'vscode')}
                      className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-cyan-400 text-[11px] font-mono border border-slate-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedKey === 'vscode' ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                  <pre className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-[10px] text-slate-300 font-mono overflow-x-auto max-h-56">
                    {deployPack.vscodeConfig}
                  </pre>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
