import React, { useState } from 'react';
import { AgentDefinition, AgentAuditResult, AgentTool, LLMProviderType, BodyPartAnatomy } from '../types/neural';
import { AgentRegistryService, BODY_PARTS_CONFIG } from '../services/agentRegistry';
import { MicroDatastoresService } from '../services/microDatastores';
import { cfoDecisionService } from '../services/cfoDecisionService';
import { JarvisVoiceService } from '../services/jarvisVoice';
import { AgentTerminalModal } from './AgentTerminalModal';
import {
  Bot,
  Plus,
  X,
  Play,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Database,
  Cpu,
  Save,
  Search,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Terminal,
  MessageSquare,
  Code,
  History,
  Layers,
  ChevronDown,
  ChevronUp,
  FileText,
  HelpCircle,
  Radio,
  FileSpreadsheet,
  UploadCloud,
  Heart,
  ExternalLink,
} from 'lucide-react';
import { InvestmentAgentStudioModal } from './InvestmentAgentStudioModal';
import { AgentPromptBehaviorModal } from './AgentPromptBehaviorModal';

interface AgentRegistryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerSynapse: (label: string) => void;
  onAutonomousAction?: (actions: any) => void;
  onAddMemory?: (mem: any) => void;
  onOpenCfoDecisions?: () => void;
  onOpenPromptBehavior?: (agentId?: string) => void;
}

export const AgentRegistryModal: React.FC<AgentRegistryModalProps> = ({
  isOpen,
  onClose,
  onTriggerSynapse,
  onAutonomousAction,
  onAddMemory,
  onOpenCfoDecisions,
  onOpenPromptBehavior,
}) => {
  const agentService = AgentRegistryService.getInstance();
  const microService = MicroDatastoresService.getInstance();

  const [agents, setAgents] = useState<AgentDefinition[]>(() => agentService.listAgents());
  const [searchTerm, setSearchTerm] = useState('');
  const [editingAgent, setEditingAgent] = useState<AgentDefinition | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showStudioModal, setShowStudioModal] = useState(false);
  const [showPromptBehaviorModal, setShowPromptBehaviorModal] = useState(false);
  const [selectedPromptAgentId, setSelectedPromptAgentId] = useState<string | null>(null);
  const [runningAuditId, setRunningAuditId] = useState<string | null>(null);
  const [lastAuditResult, setLastAuditResult] = useState<AgentAuditResult | null>(null);
  const [selectedAgentForTerminal, setSelectedAgentForTerminal] = useState<AgentDefinition | null>(null);

  // Estados de Criação Autônoma pela LLM (Avaliação Cognitiva de Necessidades)
  const [showAutonomousModal, setShowAutonomousModal] = useState(false);
  const [autonomousObjective, setAutonomousObjective] = useState('');
  const [autonomousAssetClass, setAutonomousAssetClass] = useState('Ações B3 & Renda Fixa');
  const [isGeneratingAgent, setIsGeneratingAgent] = useState(false);
  const [generatedAgentFeedback, setGeneratedAgentFeedback] = useState<AgentDefinition | null>(null);
  const [expandedCognitiveId, setExpandedCognitiveId] = useState<string | null>(null);

  // Estados de Transcrição de Protocolo MCP / API fornecidos pelo usuário via chat
  const [selectedAgentForMcp, setSelectedAgentForMcp] = useState<AgentDefinition | null>(null);
  const [mcpRawPayload, setMcpRawPayload] = useState('');
  const [isTranscribingMcp, setIsTranscribingMcp] = useState(false);
  const [mcpSuccessFeedback, setMcpSuccessFeedback] = useState<string | null>(null);

  // Estados para Ferramentas & Funções Customizadas (Tools de API, MCP, Webhook, Funções)
  const [selectedAgentForAddTool, setSelectedAgentForAddTool] = useState<AgentDefinition | null>(null);
  const [newToolName, setNewToolName] = useState('');
  const [newToolType, setNewToolType] = useState<'API' | 'MCP' | 'WEBHOOK' | 'FUNCTION' | 'WORKSPACE' | 'SQL'>('API');
  const [newToolEndpoint, setNewToolEndpoint] = useState('');
  const [newToolParams, setNewToolParams] = useState('');
  const [newToolCode, setNewToolCode] = useState('');
  const [newToolDescription, setNewToolDescription] = useState('');
  const [executedToolFeedback, setExecutedToolFeedback] = useState<{ toolId: string; result: string; timestamp: string } | null>(null);
  const [activeTriggerFeedback, setActiveTriggerFeedback] = useState<{ agentName: string; action: string } | null>(null);

  // Formulário de Criação de Novo Agente Manual
  const [novoNome, setNovoNome] = useState('');
  const [novoPapel, setNovoPapel] = useState('');
  const [novoBanco, setNovoBanco] = useState('');
  const [novoBodyPart, setNovoBodyPart] = useState<BodyPartAnatomy>('torax_tronco');
  const [novaLogica, setNovaLogica] = useState('');
  const [novoProvedor, setNovoProvedor] = useState<LLMProviderType | 'global'>('global');
  const [novosGatilhos, setNovosGatilhos] = useState('');

  if (!isOpen) return null;

  const handleLimparTodosAgentes = () => {
    if (window.confirm('Deseja excluir todos os agentes para deixar o ficheiro 100% limpo e criar novos agentes do zero?')) {
      agentService.clearAllAgents();
      setAgents([]);
      onTriggerSynapse('Ficheiro de agentes limpo com sucesso.');
    }
  };

  const recarregar = () => {
    setAgents(agentService.listAgents());
  };

  const handleTranscreverMcp = async (agent: AgentDefinition, customPayload?: string) => {
    const payload = customPayload || mcpRawPayload;
    if (!payload.trim()) return;

    setIsTranscribingMcp(true);
    setMcpSuccessFeedback(null);
    onTriggerSynapse(`Transcrevendo dados de API/MCP para ${agent.name}...`);

    try {
      const res = await agentService.transcribeDataToAgent(agent.id, payload.trim());

      cfoDecisionService.registrarDecisao({
        tipoAcao: 'TRANSCRICAO_DADOS_API_MCP',
        titulo: `Transcrição Manual de Dados MCP: ${agent.name}`,
        ativoOuAlvo: agent.targetDatabase,
        categoria:
          agent.targetDatabase === 'BTC'
            ? 'CRIPTOATIVOS'
            : agent.targetDatabase.includes('TESOURO')
            ? 'TESOURO DIRETO'
            : agent.targetDatabase.includes('COMMODITIES')
            ? 'COMMODITIES'
            : 'AÇÕES B3',
        impacto: 'ALTO',
        justificativaLogica: `Dados fornecidos pelo usuário foram transcritos diretamente para o agente ${agent.name}.`,
        detalhesExecutivos: `Silo ${agent.targetDatabase} atualizado com novas métricas e síntese de preservação de tokens.`,
        targetNodeId: `mem-${agent.targetDatabase.toLowerCase()}`,
        autor: 'Usuário & LLM Autônoma',
        status: 'EXECUTADO',
        reversivel: true,
        parametros: {
          motivo: `Alimentação de insumos do agente ${agent.name}`,
        },
      });

      if (res.memory && onAddMemory) {
        onAddMemory(res.memory);
      }

      setMcpSuccessFeedback(`Dados assimilados com sucesso para ${agent.name}! Silo particionado e nó sináptico gravados.`);
      recarregar();
      onTriggerSynapse(`Métricas da API/MCP Transcritas para ${agent.name}!`);
    } catch (e: any) {
      console.warn('Erro ao transcrever dados MCP:', e);
    } finally {
      setIsTranscribingMcp(false);
    }
  };

  const handleCriarAgenteAutonomo = async (e?: React.FormEvent, presetObjective?: string, presetAssetClass?: string) => {
    if (e) e.preventDefault();
    const objToUse = presetObjective || autonomousObjective;
    const assetToUse = presetAssetClass || autonomousAssetClass;

    if (!objToUse.trim()) return;

    setIsGeneratingAgent(true);
    setGeneratedAgentFeedback(null);
    onTriggerSynapse('Avaliando Necessidades de Informação do Agente com LLM...');

    try {
      const created = await agentService.autonomouslyCreateAgentByLLM(objToUse.trim(), undefined, assetToUse);
      
      // Registrar no Histórico de Decisões do CFO
      cfoDecisionService.registrarDecisao({
        tipoAcao: 'CRIACAO_AGENTE',
        titulo: `Criação Autônoma da LLM: ${created.name}`,
        ativoOuAlvo: created.targetDatabase,
        categoria:
          created.targetDatabase === 'BTC'
            ? 'CRIPTOATIVOS'
            : created.targetDatabase.includes('TESOURO')
            ? 'TESOURO DIRETO'
            : created.targetDatabase.includes('COMMODITIES')
            ? 'COMMODITIES'
            : 'AÇÕES B3',
        impacto: 'ALTO',
        justificativaLogica:
          created.cognitiveEvaluation?.evaluationRationale ||
          `Agente criado autonomamente pela LLM após avaliar que o objetivo "${objToUse}" exige isolamento em silo ${created.targetDatabase}.`,
        detalhesExecutivos: `Papel: ${created.role}. Insumos avaliados: ${created.cognitiveEvaluation?.requiredInformation?.join('; ')}. Diretrizes: ${created.cognitiveEvaluation?.whatToRequest?.join('; ')}.`,
        targetNodeId: `mem-${created.targetDatabase.toLowerCase()}`,
        autor: 'LLM Autônoma (Avaliação Cognitiva)',
        status: 'EXECUTADO',
        reversivel: true,
        parametros: {
          horizonte: '10 anos',
          motivo: `Avaliação cognitiva de necessidade de informação para o objetivo: ${objToUse}`,
          informacoesNecessarias: created.cognitiveEvaluation?.requiredInformation,
          oquePedirParaAgente: created.cognitiveEvaluation?.whatToRequest,
        },
      });

      setGeneratedAgentFeedback(created);
      recarregar();
      onTriggerSynapse(`Agente ${created.name} Criado Autonomamente pela LLM!`);
    } catch (err: any) {
      console.warn('Erro ao criar agente com LLM:', err);
    } finally {
      setIsGeneratingAgent(false);
    }
  };

  const handleSalvarEdicao = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAgent) return;
    agentService.updateAgent(editingAgent.id, editingAgent);
    recarregar();
    onTriggerSynapse(`Lógica do Agente ${editingAgent.name} Atualizada`);
    setEditingAgent(null);
  };

  const handleCriarAgente = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoNome.trim() || !novaLogica.trim()) return;

    const dbKey = (novoBanco.trim() || 'GERAL').toUpperCase();
    const id = `agente-custom-${Date.now()}`;

    const novo: AgentDefinition = {
      id,
      name: novoNome.trim(),
      role: novoPapel.trim() || `Especialista em ${dbKey}`,
      targetDatabase: dbKey,
      logic: novaLogica.trim(),
      llmProvider: novoProvedor,
      model: 'padrão-sistema',
      status: 'ativo',
      bodyPart: novoBodyPart,
      bodyCoordinates: BODY_PARTS_CONFIG[novoBodyPart]?.coords,
      lastAuditVerdict: 'OK',
      lastAuditDetails: `Agente vinculado ao órgão [${BODY_PARTS_CONFIG[novoBodyPart]?.label || novoBodyPart}]. Pronto para auditorias.`,
      lastAuditDate: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
      triggers: novosGatilhos
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      isAutonomous: true,
      createdAt: new Date().toLocaleDateString('pt-BR'),
      author: 'Matheus Dullius',
    };

    agentService.registerAgent(novo);
    // Garantir que o banco isolado também exista se não existir
    if (dbKey !== 'GERAL') {
      microService.autoAlimentarOuCriar(dbKey, 'ativo_b3');
    }

    recarregar();
    onTriggerSynapse(`Novo Agente Criado: ${novo.name}`);
    setShowCreateModal(false);
    setNovoNome('');
    setNovoPapel('');
    setNovoBanco('');
    setNovaLogica('');
    setNovosGatilhos('');
  };

  const handleSalvarNovaTool = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentForAddTool || !newToolName.trim()) return;

    const novaTool: AgentTool = {
      id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: newToolName.trim(),
      description: newToolDescription.trim() || `Ferramenta ${newToolType} configurada para ${selectedAgentForAddTool.name}`,
      type: newToolType,
      endpointOrMethod: newToolEndpoint.trim() || undefined,
      parametersSchema: newToolParams.trim() || undefined,
      codeSnippet: newToolCode.trim() || undefined,
      enabled: true,
      author: 'USUARIO',
      createdAt: new Date().toLocaleDateString('pt-BR'),
    };

    agentService.addToolToAgent(selectedAgentForAddTool.id, novaTool);
    recarregar();
    setSelectedAgentForAddTool(null);
    setNewToolName('');
    setNewToolEndpoint('');
    setNewToolParams('');
    setNewToolCode('');
    setNewToolDescription('');
    onTriggerSynapse(`Nova Tool [${novaTool.type}] Criada para ${selectedAgentForAddTool.name}!`);

    try {
      JarvisVoiceService.getInstance().speak(`Nova ferramenta ${novaTool.name} integrada com sucesso.`);
    } catch {}
  };

  const handleExecutarTool = async (agent: AgentDefinition, tool: AgentTool) => {
    setActiveTriggerFeedback({
      agentName: agent.name,
      action: `Executando Ferramenta [${tool.name}] (${tool.type})...`,
    });

    onTriggerSynapse(`⚡ Tool [${tool.name}] do Agente ${agent.name} Acionada!`);

    try {
      JarvisVoiceService.getInstance().speak(`Acionando ${tool.name} do agente ${agent.name}.`);
    } catch {}

    const res = await agentService.executeAgentTool(agent.id, tool.id);
    setExecutedToolFeedback({
      toolId: tool.id,
      result: res.result,
      timestamp: res.timestamp,
    });
    recarregar();

    setTimeout(() => {
      setActiveTriggerFeedback(null);
    }, 4500);
  };

  const handleExecutarAuditoria = async (agent: AgentDefinition) => {
    setRunningAuditId(agent.id);
    setActiveTriggerFeedback({
      agentName: agent.name,
      action: 'Auditoria de Solvência & Valuation Decenal Iniciada...',
    });

    onTriggerSynapse(`⚡ Agente Acionado: ${agent.name}`);

    try {
      JarvisVoiceService.getInstance().speak(`Agente ${agent.name} acionado para auditoria.`);
    } catch {}

    try {
      const res = await agentService.delegateAudit(agent.id);
      setLastAuditResult(res);
      recarregar();
    } catch (e: any) {
      console.warn('Erro ao executar auditoria delegada:', e);
    } finally {
      setRunningAuditId(null);
      setTimeout(() => {
        setActiveTriggerFeedback(null);
      }, 4500);
    }
  };

  const handleExcluirAgente = (id: string, name: string) => {
    if (confirm(`Deseja desativar e excluir o agente "${name}"?`)) {
      agentService.deleteAgent(id);
      recarregar();
      onTriggerSynapse(`Agente ${name} Removido`);
    }
  };

  const bancosDisponiveis = microService.listarTodos();
  const agentesFiltrados = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.targetDatabase.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-4xl max-h-[92vh] bg-slate-950 border border-red-500/40 rounded-3xl p-5 sm:p-7 shadow-[0_0_80px_rgba(239,68,68,0.25)] flex flex-col relative overflow-hidden text-slate-100">
        {/* Header Responsivo (Sem sobreposições no mobile) */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-red-500/15 border border-red-500/40 flex items-center justify-center text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.3)] shrink-0">
              <Bot className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold font-mono tracking-wide text-red-200">
                  Ficheiro de Agentes & Lógica Neural
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-950 border border-red-500/40 text-red-400 font-bold uppercase">
                  {agents.length} Agentes Registrados
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 font-sans mt-0.5">
                Programe pipelines em código, audite dados de mercado e gerencie especialistas do Jarvis.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-900 border border-slate-800 transition-colors shrink-0"
            title="Fechar Ficheiro"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Banner de Interação Ativa quando um Agente ou Tool é Acionado */}
        {activeTriggerFeedback && (
          <div className="mb-3 p-3.5 rounded-2xl bg-gradient-to-r from-red-950/90 via-slate-900 to-cyan-950/80 border border-red-500/60 shadow-[0_0_30px_rgba(239,68,68,0.4)] flex items-center justify-between text-xs animate-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-ping shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">
                    ⚡ Agente Acionado: {activeTriggerFeedback.agentName}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-600 text-white font-bold uppercase">
                    Em Execução
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5 font-sans">
                  {activeTriggerFeedback.action}
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTriggerFeedback(null)}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg border border-slate-700 hover:bg-slate-800"
            >
              ✕
            </button>
          </div>
        )}

        {/* Barra de Ações: Busca & Abrir Estúdio de Código / Criar Agente */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 mb-4">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar agente, papel ou ticker..."
              className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-red-500/60 font-mono"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Botão de Destaque: Auto-Criar Agente com IA (Avaliação Cognitiva) */}
            <button
              onClick={() => {
                setShowAutonomousModal(!showAutonomousModal);
                setShowCreateModal(false);
              }}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white text-xs font-mono font-bold flex items-center justify-center gap-1.5 shadow-[0_0_20px_rgba(239,68,68,0.35)] transition-all shrink-0"
              title="A LLM avalia autonomamente o objetivo, define quais informações precisa e cria o agente"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
              <span>Auto-Criar com IA</span>
            </button>

            {/* Botão de Estúdio de Código do Agente de Investimento (10 Anos) */}
            <button
              onClick={() => setShowStudioModal(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-all shrink-0"
              title="Abrir Estúdio para programar o agente de investimento em código com análise decenal"
            >
              <Code className="w-3.5 h-3.5 text-amber-400" />
              <span>Estúdio Código (10a)</span>
            </button>

            {/* Botão para Abrir Página Dedicada agents.html */}
            <button
              onClick={() => window.open('/agents.html', '_blank')}
              className="px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-600 via-sky-500 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-slate-950 font-bold text-xs font-mono flex items-center justify-center gap-1.5 shadow-md transition-all shrink-0 cursor-pointer"
              title="Abrir Construtor de Agentes em Página HTML Dedicada (com Webhooks, Bancos de Dados e Testes)"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Abrir agents.html</span>
            </button>

            {/* Botão de Histórico e Auditoria do CFO */}
            {onOpenCfoDecisions && (
              <button
                onClick={() => {
                  onClose();
                  onOpenCfoDecisions();
                }}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-amber-950/40 border border-slate-800 hover:border-amber-500/50 text-amber-300 text-xs font-mono flex items-center justify-center gap-1.5 transition-colors shrink-0"
                title="Abrir Histórico e Auditoria de Decisões Autônomas do CFO"
              >
                <History className="w-3.5 h-3.5 text-amber-400" />
                <span>Decisões CFO</span>
              </button>
            )}

            <button
              onClick={() => {
                setShowCreateModal(!showCreateModal);
                setShowAutonomousModal(false);
              }}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-mono flex items-center justify-center gap-1.5 transition-colors shrink-0"
              title="Criar agente com formulário manual"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Manual</span>
            </button>

            {/* Espaço de Prompt & Comportamento da IA */}
            <button
              onClick={() => {
                if (onOpenPromptBehavior) onOpenPromptBehavior();
                else setShowPromptBehaviorModal(true);
              }}
              className="px-3 py-2 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/50 text-purple-200 text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-all shadow-md shrink-0"
              title="Escrever prompt e definir comportamento da IA para agentes"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Prompt & IA</span>
            </button>

            <button
              onClick={handleLimparTodosAgentes}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-rose-950/60 border border-slate-800 hover:border-rose-500/50 text-rose-400 text-xs font-mono flex items-center justify-center gap-1.5 transition-colors shrink-0"
              title="Excluir todos os agentes padronizados e deixar o ficheiro limpo do zero"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar Ficheiro</span>
            </button>
          </div>
        </div>

        {/* Painel de Criação Autônoma de Agentes pela LLM (Avaliação Cognitiva) */}
        {showAutonomousModal && (
          <div className="mb-4 p-4 rounded-2xl bg-gradient-to-b from-red-950/40 via-slate-900/95 to-slate-950 border border-amber-500/40 shadow-[0_0_40px_rgba(245,158,11,0.15)] space-y-3.5 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-amber-500/30 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-mono font-bold text-amber-300 uppercase flex items-center gap-2">
                    Criação Autônoma de Agentes pela LLM
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 border border-amber-500/40 font-mono">
                      Avaliação Cognitiva de Informações
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                    A IA avalia o objetivo do agente, determina que tipo de informação precisa e formula o que pedir para o agente executar.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAutonomousModal(false);
                  setGeneratedAgentFeedback(null);
                }}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>

            {/* Presets Rápidos por Classe de Ativo */}
            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1.5">
                ⚡ Presets Rápidos do Mercado Financeiro (1-Clique):
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  {
                    title: '🏛️ Tesouro Direto IPCA+',
                    desc: 'Auditar taxas de juros reais da curva soberana (IPCA+ > 6%) e duration decenal.',
                    asset: 'Títulos Públicos',
                  },
                  {
                    title: '🏢 FIIs & Risco de Crédito',
                    desc: 'Auditar carteiras de CRI, vacância física e desconto sobre valor patrimonial (P/VP).',
                    asset: 'Fundos Imobiliários',
                  },
                  {
                    title: '🌾 Commodities Agrícolas',
                    desc: 'Monitorar cotações de soja, milho e hedge cambial para proteção contra inflação.',
                    asset: 'Commodities',
                  },
                  {
                    title: '🌎 Títulos Estrangeiros (US)',
                    desc: 'Auditar yields dos títulos do Tesouro Americano de 10 anos e risco cambial.',
                    asset: 'Títulos Estrangeiros',
                  },
                  {
                    title: '⚡ Debêntures de Infraestrutura',
                    desc: 'Auditar solvência de concessionárias de saneamento e prêmio sobre NTN-B.',
                    asset: 'Renda Fixa Privada',
                  },
                  {
                    title: '₿ Criptoativos On-Chain 24/7',
                    desc: 'Monitorar suporte técnico, hash rate e reservas em silêncio operacional no ruído.',
                    asset: 'Criptoativos',
                  },
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={isGeneratingAgent}
                    onClick={() => {
                      setAutonomousObjective(preset.desc);
                      setAutonomousAssetClass(preset.asset);
                      handleCriarAgenteAutonomo(undefined, preset.desc, preset.asset);
                    }}
                    className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/40 text-left transition-all group disabled:opacity-50"
                  >
                    <div className="text-xs font-bold font-mono text-amber-200 group-hover:text-amber-300">
                      {preset.title}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                      {preset.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Formulário Personalizado de Objetivo para a LLM */}
            <form onSubmit={(e) => handleCriarAgenteAutonomo(e)} className="space-y-2.5 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div className="sm:col-span-3">
                  <label className="text-[10px] font-mono text-slate-400 uppercase block mb-1">
                    Escreva em linguagem natural o objetivo que você deseja para o agente:
                  </label>
                  <input
                    type="text"
                    value={autonomousObjective}
                    onChange={(e) => setAutonomousObjective(e.target.value)}
                    placeholder="Ex: Criar um sentinela para auditar debêntures incentivadas de saneamento com spread sobre IPCA..."
                    className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none font-mono"
                    disabled={isGeneratingAgent}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-slate-400 uppercase block mb-1">
                    Classe de Ativo
                  </label>
                  <select
                    value={autonomousAssetClass}
                    onChange={(e) => setAutonomousAssetClass(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-200 outline-none font-mono"
                    disabled={isGeneratingAgent}
                  >
                    <option value="Ações B3">Ações B3</option>
                    <option value="Fundos Imobiliários">Fundos Imobiliários</option>
                    <option value="Títulos Públicos">Títulos Públicos / Tesouro</option>
                    <option value="Títulos Estrangeiros">Títulos Estrangeiros</option>
                    <option value="Commodities">Commodities</option>
                    <option value="Criptoativos">Criptoativos</option>
                    <option value="Geral">Sistema Geral</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                  A LLM formula o nome, lógica e diretrizes ideais automaticamente.
                </span>

                <button
                  type="submit"
                  disabled={isGeneratingAgent || !autonomousObjective.trim()}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white font-mono text-xs font-bold flex items-center gap-2 shadow-lg disabled:opacity-50 transition-all cursor-pointer"
                >
                  {isGeneratingAgent ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>LLM Avaliando Necessidades...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Avaliar & Criar Agente com IA</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Feedback Detalhado do Agente Criado Autonomamente */}
            {generatedAgentFeedback && (
              <div className="p-3.5 rounded-xl bg-slate-950 border border-emerald-500/50 shadow-lg space-y-2 animate-in zoom-in-95">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold font-mono text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Agente Criado com Sucesso pela LLM: {generatedAgentFeedback.name}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                    Silo: {generatedAgentFeedback.targetDatabase}
                  </span>
                </div>

                {generatedAgentFeedback.cognitiveEvaluation && (
                  <div className="space-y-1.5 text-xs text-slate-300">
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <strong className="text-amber-300 font-mono text-[11px] block">
                        📥 Informações que a LLM determinou precisar:
                      </strong>
                      <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-300 mt-1">
                        {generatedAgentFeedback.cognitiveEvaluation.requiredInformation?.map((inf, i) => (
                          <li key={i}>{inf}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <strong className="text-cyan-300 font-mono text-[11px] block">
                        📤 O que a LLM determinou pedir ao agente:
                      </strong>
                      <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-300 mt-1">
                        {generatedAgentFeedback.cognitiveEvaluation.whatToRequest?.map((req, i) => (
                          <li key={i}>{req}</li>
                        ))}
                      </ul>
                    </div>

                    <p className="text-[11px] font-mono text-slate-400 italic">
                      🛡️ Justificativa da LLM: {generatedAgentFeedback.cognitiveEvaluation.evaluationRationale}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Modal Inline de Criação de Agente */}
        {showCreateModal && (
          <form
            onSubmit={handleCriarAgente}
            className="mb-4 p-4 rounded-2xl bg-red-950/20 border border-red-500/50 space-y-3 animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-red-500/30 pb-2">
              <span className="text-xs font-bold font-mono text-red-300 uppercase flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-red-400" />
                Autoria de Novo Agente Especialista
              </span>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                  Nome do Agente
                </label>
                <input
                  type="text"
                  required
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  placeholder="Ex: Auditor Bazin CPLE6"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:border-red-500 outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                  Papel / Função
                </label>
                <input
                  type="text"
                  value={novoPapel}
                  onChange={(e) => setNovoPapel(e.target.value)}
                  placeholder="Ex: Auditor de Energia & Proventos"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:border-red-500 outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                  Banco de Dados Vinculado
                </label>
                <input
                  type="text"
                  value={novoBanco}
                  onChange={(e) => setNovoBanco(e.target.value)}
                  placeholder="Ex: CPLE6 ou GERAL"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:border-red-500 outline-none"
                />
              </div>
            </div>

            {/* Mapeamento Anatômico: Posição no Corpo Humano */}
            <div>
              <label className="text-[10px] font-mono uppercase text-cyan-300 block mb-1.5 flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5 text-red-400" />
                Posição Anatômica no Corpo Humano (Instalação 3D)
              </label>
              <select
                value={novoBodyPart}
                onChange={(e) => setNovoBodyPart(e.target.value as BodyPartAnatomy)}
                className="w-full bg-slate-900 border border-cyan-500/40 rounded-xl px-3 py-2 text-xs text-cyan-200 outline-none font-mono"
              >
                {Object.values(BODY_PARTS_CONFIG).map((part) => (
                  <option key={part.id} value={part.id}>
                    {part.label} ({part.organ}) — {part.description}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 font-mono mt-1">
                Uma terminação nervosa do sistema periférico conectará o cérebro à esta posição no corpo humano.
              </p>
            </div>

            <div>
              <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                Lógica & Diretrizes do Agente (Prompt de Auditoria)
              </label>
              <textarea
                rows={3}
                required
                value={novaLogica}
                onChange={(e) => setNovaLogica(e.target.value)}
                placeholder="Descreva a lógica estrita: cálculo de preço-teto Bazin, limites de dívida/EBITDA, gatilhos de alerta e condições para veredito..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 focus:border-red-500 outline-none font-mono"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                  Gatilhos de Alerta (separados por vírgula)
                </label>
                <input
                  type="text"
                  value={novosGatilhos}
                  onChange={(e) => setNovosGatilhos(e.target.value)}
                  placeholder="Cotação > Teto, Dívida/EBITDA > 3.5x"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:border-red-500 outline-none"
                />
              </div>

              <div className="flex items-end justify-end">
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold flex items-center gap-1.5 shadow-md"
                >
                  <Save className="w-4 h-4" />
                  Salvar e Registrar Agente
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Modal de Edição de Lógica */}
        {editingAgent && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
            <div className="w-full max-w-2xl bg-slate-950 border border-red-500/50 rounded-2xl p-6 shadow-2xl relative">
              <button
                onClick={() => setEditingAgent(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2 mb-3">
                <Edit3 className="w-5 h-5 text-red-400" />
                <h3 className="text-sm font-mono font-bold text-white uppercase">
                  Modificar Lógica: {editingAgent.name}
                </h3>
              </div>

              <form onSubmit={handleSalvarEdicao} className="space-y-3">
                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                    Nome e Função
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={editingAgent.name}
                      onChange={(e) => setEditingAgent({ ...editingAgent, name: e.target.value })}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none"
                    />
                    <input
                      type="text"
                      value={editingAgent.role}
                      onChange={(e) => setEditingAgent({ ...editingAgent, role: e.target.value })}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                    Lógica e Diretrizes de Auditoria (Instruções Sistêmicas)
                  </label>
                  <textarea
                    rows={6}
                    value={editingAgent.logic}
                    onChange={(e) => setEditingAgent({ ...editingAgent, logic: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 outline-none font-mono leading-relaxed"
                  />
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="text-[10px] font-mono text-slate-400">
                    Banco de Dados: <strong className="text-red-400">{editingAgent.targetDatabase}</strong>
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingAgent(null)}
                      className="px-4 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-white"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold flex items-center gap-1.5"
                    >
                      <Save className="w-4 h-4" />
                      Salvar Alterações
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Feedback de Última Auditoria Executada */}
        {lastAuditResult && (
          <div className="mb-4 p-3 rounded-2xl bg-slate-900 border border-red-500/40 flex items-start justify-between text-xs animate-in slide-in-from-top-1">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-red-300 font-mono">
                  [{lastAuditResult.agentName}] Veredito:
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                    lastAuditResult.verdict === 'COMPRAR'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                      : lastAuditResult.verdict === 'QUARENTENA'
                      ? 'bg-rose-950 text-rose-400 border border-rose-500/40'
                      : 'bg-amber-950 text-amber-400 border border-amber-500/40'
                  }`}
                >
                  {lastAuditResult.verdict}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {lastAuditResult.timestamp}
                </span>
              </div>
              <p className="text-slate-300 font-sans text-xs">{lastAuditResult.details}</p>
            </div>
            <button
              onClick={() => setLastAuditResult(null)}
              className="text-[10px] text-slate-500 hover:text-slate-300 shrink-0 ml-3"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Lista de Ficheiro de Agentes */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {agentesFiltrados.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-900/40 border border-dashed border-slate-800 text-center flex flex-col items-center justify-center gap-3 text-slate-400">
              <Bot className="w-10 h-10 text-slate-600 animate-pulse" />
              <div>
                <p className="text-sm font-mono text-slate-300 font-bold">Ficheiro de Agentes Limpo</p>
                <p className="text-xs text-slate-400 font-sans mt-1 max-w-md">
                  Nenhum agente pré-programado ou padronizado ativo. Você tem total liberdade de criar e moldar cada agente de IA especialista do zero.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Criar Primeiro Agente</span>
                </button>
                <button
                  onClick={() => setShowAutonomousModal(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Auto-Criar com IA</span>
                </button>
              </div>
            </div>
          ) : (
            agentesFiltrados.map((agent) => {
              const isRunning = runningAuditId === agent.id;
              return (
                <div
                  key={agent.id}
                  className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-red-500/40 transition-all flex flex-col gap-2.5"
                >
                  {/* Cabeçalho do Card */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          agent.status === 'alerta'
                            ? 'bg-rose-500 animate-ping'
                            : agent.status === 'em_auditoria'
                            ? 'bg-amber-400 animate-pulse'
                            : 'bg-emerald-500'
                        }`}
                      />
                      <div>
                        <h4 className="font-bold text-sm text-slate-100 flex items-center gap-2 flex-wrap">
                          <span>{agent.name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                            {agent.role}
                          </span>
                          {agent.bodyPart && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/90 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                              {BODY_PARTS_CONFIG[agent.bodyPart]?.label || agent.bodyPart} ({BODY_PARTS_CONFIG[agent.bodyPart]?.organ})
                            </span>
                          )}
                        </h4>
                      <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                        <span>Banco: <strong className="text-red-400">{agent.targetDatabase}</strong></span>
                        <span>·</span>
                        <span>Autor: {agent.author}</span>
                        <span>·</span>
                        <span>Última auditoria: {agent.lastAuditDate || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Veredito Atual */}
                  {agent.lastAuditVerdict && (
                    <div className="flex items-center gap-1.5 self-start sm:self-center">
                      <span className="text-[10px] font-mono text-slate-400">Veredito:</span>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold uppercase border ${
                          agent.lastAuditVerdict === 'COMPRAR'
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                            : agent.lastAuditVerdict === 'QUARENTENA'
                            ? 'bg-rose-950/80 text-rose-300 border-rose-500/50'
                            : 'bg-amber-950/80 text-amber-300 border-amber-500/50'
                        }`}
                      >
                        {agent.lastAuditVerdict}
                      </span>
                    </div>
                  )}
                </div>

                {/* Caixa de Lógica Resumida */}
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs font-mono text-slate-300 whitespace-pre-line leading-relaxed max-h-24 overflow-y-auto">
                  {agent.logic}
                </div>

                {/* Bloco de Avaliação Cognitiva da LLM (Objetivo & Informações Necessárias) */}
                {agent.cognitiveEvaluation && (
                  <div className="rounded-xl bg-slate-950/90 border border-amber-500/30 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-amber-300 font-mono font-bold text-[11px]">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Avaliação Cognitiva da LLM (Objetivo & Insumos Avaliados)</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/40">
                        {agent.cognitiveEvaluation.targetAssetClass || 'Mercado'}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-300 font-sans">
                      <strong className="text-amber-400 font-mono">🎯 Objetivo do Agente:</strong>{' '}
                      {agent.cognitiveEvaluation.objective}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] font-mono">
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-amber-300 font-bold block mb-1">
                          📥 Informações que a LLM determinou precisar:
                        </span>
                        <ul className="list-disc list-inside space-y-0.5 text-slate-300">
                          {agent.cognitiveEvaluation.requiredInformation?.map((inf, i) => (
                            <li key={i}>{inf}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-cyan-300 font-bold block mb-1">
                          📤 O que a LLM determinou pedir para o agente:
                        </span>
                        <ul className="list-disc list-inside space-y-0.5 text-slate-300">
                          {agent.cognitiveEvaluation.whatToRequest?.map((req, i) => (
                            <li key={i}>{req}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {agent.cognitiveEvaluation.evaluationRationale && (
                      <p className="text-[10px] font-mono text-slate-400 italic pt-0.5">
                        🛡️ Racional: {agent.cognitiveEvaluation.evaluationRationale}
                      </p>
                    )}
                  </div>
                )}

                {/* Notificação Ativa se a IA tiver Solicitado Dados da API/MCP */}
                {agent.pendingDataRequest && (
                  <div className="rounded-xl bg-amber-950/40 border border-amber-500/60 p-3 space-y-1.5 text-xs animate-pulse">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-amber-300 flex items-center gap-1.5 text-[11px]">
                        <Radio className="w-3.5 h-3.5 text-amber-400" />
                        IA Solicitou Dados de {agent.pendingDataRequest.protocol} ao Usuário
                      </span>
                      <span className="text-[10px] font-mono text-amber-400">
                        {agent.pendingDataRequest.requestedAt}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      <strong className="text-amber-200">Campos solicitados no chat:</strong> {agent.pendingDataRequest.requestedFields?.join(', ')}
                    </p>
                    <p className="text-[10px] text-slate-400 italic">
                      Motivo da IA: {agent.pendingDataRequest.requestReason}
                    </p>
                    <button
                      onClick={() => {
                        setSelectedAgentForMcp(agent);
                        setMcpRawPayload('');
                        setMcpSuccessFeedback(null);
                      }}
                      className="mt-1 px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-mono text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <UploadCloud className="w-3 h-3" />
                      <span>Colar Dados de API/MCP Agora</span>
                    </button>
                  </div>
                )}

                {/* Bloco de Dados MCP/API Já Transcritos via Chat */}
                {agent.transcribedMcpData && (
                  <div className="rounded-xl bg-slate-950/90 border border-cyan-500/40 p-3 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-cyan-300 flex items-center gap-1.5 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                        Dados de API/MCP Transcritos via Chat ({agent.transcribedMcpData.protocol})
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {agent.transcribedMcpData.lastTranscriptionDate}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono text-slate-300 pt-1">
                      {Object.entries(agent.transcribedMcpData.parsedMetrics || {}).slice(0, 4).map(([k, v]) => (
                        <div key={k} className="p-1.5 rounded bg-slate-900 border border-slate-800">
                          <span className="text-slate-400 block truncate">{k}</span>
                          <span className="text-cyan-300 font-bold truncate block">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-slate-400">
                      <span className="truncate max-w-[65%]">{agent.transcribedMcpData.rawSummary}</span>
                      <span className="text-emerald-400 font-bold">
                        🛡️ Economia: {agent.transcribedMcpData.tokensEstimatedBefore} → {agent.transcribedMcpData.tokensPreservedAfter} tokens
                      </span>
                    </div>
                  </div>
                )}

                {/* Seção de Ferramentas & Funções Integradas no Código (Tools do Agente) */}
                <div className="rounded-2xl bg-slate-950/85 border border-slate-800/90 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Code className="w-4 h-4 text-cyan-400" />
                      <span className="font-bold text-xs text-white">
                        Ferramentas & Funções Integradas ({agent.tools?.length || 0} Tools)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAgentForAddTool(agent);
                        setNewToolName('');
                        setNewToolType('API');
                        setNewToolEndpoint('');
                        setNewToolParams('');
                        setNewToolCode('');
                        setNewToolDescription('');
                      }}
                      className="px-2.5 py-1 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Adicionar uma nova ferramenta (API, MCP, Webhook, Função)"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Criar Tool (+)</span>
                    </button>
                  </div>

                  {(!agent.tools || agent.tools.length === 0) ? (
                    <div className="text-xs text-slate-400 py-1 font-sans italic">
                      Nenhuma ferramenta customizada criada ainda. Clique em "Criar Tool (+)" para adicionar API, protocolo MCP, Webhook ou funções de código.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {agent.tools.map((t) => (
                        <div
                          key={t.id}
                          className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 flex flex-col justify-between gap-2"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span
                                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase border ${
                                  t.type === 'API'
                                    ? 'bg-blue-950/80 text-blue-300 border-blue-500/40'
                                    : t.type === 'MCP'
                                    ? 'bg-purple-950/80 text-purple-300 border-purple-500/40'
                                    : t.type === 'WEBHOOK'
                                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                                    : t.type === 'WORKSPACE'
                                    ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                                    : 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40'
                                }`}
                              >
                                {t.type}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {t.author === 'USUARIO' ? 'Personalizada' : 'Código IA'}
                              </span>
                            </div>
                            <h5 className="font-bold text-xs text-white leading-tight">
                              {t.name}
                            </h5>
                            <p className="text-[11px] text-slate-300 mt-1 line-clamp-2 leading-relaxed">
                              {t.description}
                            </p>
                            {t.endpointOrMethod && (
                              <div className="mt-1 text-[10px] font-mono text-cyan-400/90 truncate">
                                🔗 {t.endpointOrMethod}
                              </div>
                            )}
                            {t.lastExecutionResult && (
                              <div className="mt-1.5 p-1.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-emerald-300 truncate">
                                ✓ {t.lastExecutionResult}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                            <span className="text-[10px] text-slate-400 font-mono">
                              {t.lastExecutedAt || 'Pronta'}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleExecutarTool(agent, t)}
                                className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-bold flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                                title="Executar esta ferramenta e verificar interação do agente"
                              >
                                <Play className="w-3 h-3" />
                                <span>Executar</span>
                              </button>
                              {t.author === 'USUARIO' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    agentService.deleteToolFromAgent(agent.id, t.id);
                                    recarregar();
                                  }}
                                  className="p-1 text-slate-500 hover:text-rose-400 rounded"
                                  title="Remover ferramenta"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Rodapé do Card: Ações */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {agent.triggers?.map((trig, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800/60 text-slate-400 border border-slate-700/60"
                      >
                        ⚡ {trig}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Botão Fornecer Dados MCP */}
                    <button
                      onClick={() => {
                        setSelectedAgentForMcp(agent);
                        setMcpRawPayload('');
                        setMcpSuccessFeedback(null);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-bold flex items-center gap-1.5 transition-all"
                      title="Fornecer ou transcrever dados da API/MCP para este agente"
                    >
                      <Radio className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="hidden sm:inline">Dados MCP</span>
                    </button>

                    {/* Botão Interagir com LLM */}
                    <button
                      onClick={() => setSelectedAgentForTerminal(agent)}
                      className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-md"
                      title="Interagir diretamente com a LLM deste especialista"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Interagir</span>
                    </button>

                    {/* Botão Estúdio de Código (10 Anos) */}
                    <button
                      onClick={() => setShowStudioModal(true)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-mono font-bold flex items-center gap-1.5 transition-all"
                      title="Programar pipeline em código com dados decenais"
                    >
                      <Code className="w-3.5 h-3.5 text-amber-400" />
                      <span className="hidden sm:inline">Código</span>
                    </button>

                    {/* Botão Modificar Lógica */}
                    <button
                      onClick={() => setEditingAgent(agent)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono flex items-center gap-1.5 transition-colors"
                      title="Mudar regras e lógica do agente"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-red-400" />
                      <span className="hidden sm:inline">Lógica</span>
                    </button>

                    {/* Botão Prompt & IA Dedicada */}
                    <button
                      onClick={() => {
                        setSelectedPromptAgentId(agent.id);
                        setShowPromptBehaviorModal(true);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-purple-950/80 hover:bg-purple-900 border border-purple-500/40 text-purple-200 text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm"
                      title="Editar prompt de comportamento e escolher IA opcional dedicada para este agente"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <span className="hidden sm:inline">Prompt & IA</span>
                    </button>

                    {/* Botão Executar Auditoria */}
                    <button
                      disabled={isRunning}
                      onClick={() => handleExecutarAuditoria(agent)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-red-300 border border-red-500/30 text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
                      title="Delegar auditoria viva agora"
                    >
                      {isRunning ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-red-400" />
                      ) : (
                        <Play className="w-3.5 h-3.5 text-red-400" />
                      )}
                      <span>{isRunning ? 'Auditando...' : 'Auditar'}</span>
                    </button>

                    {/* Excluir Agente com Total Liberdade */}
                    <button
                      onClick={() => handleExcluirAgente(agent.id, agent.name)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-950/40 border border-transparent hover:border-rose-500/30 transition-colors"
                      title="Excluir Agente"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
        </div>
      </div>

      {/* Modal de Transcrição de Protocolo MCP / API Fornecido pelo Usuário */}
      {selectedAgentForMcp && (
        <div className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-300 font-bold">
                  <Radio className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-100">
                    Fornecer Dados de API ou Protocolo MCP
                  </h3>
                  <p className="text-[10px] font-mono text-slate-400">
                    Agente: <strong className="text-cyan-300">{selectedAgentForMcp.name}</strong> · Silo: <strong className="text-red-400">{selectedAgentForMcp.targetDatabase}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedAgentForMcp(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-2">
              <p>
                Cole abaixo os dados brutos da API, retorno do protocolo MCP, JSON de cotações/balanços ou texto com métricas financeiras.
                A LLM avaliará o conteúdo, transcreverá os indicadores diretamente para o agente e destilará uma memória sináptica de alta densidade semântica para preservar tokens.
              </p>

              {/* Botões Rápidos de Exemplo para Teste */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[10px] font-mono text-slate-400 self-center">Exemplos rápidos:</span>
                <button
                  type="button"
                  onClick={() => {
                    setMcpRawPayload(JSON.stringify({
                      protocol: "MCP",
                      ticker: selectedAgentForMcp.targetDatabase,
                      cotacaoAtual: 34.80,
                      tetoBazin: 38.83,
                      margemSegurancaPct: 11.58,
                      dlEbitda: 2.35,
                      dyMedioDecenal: 9.6,
                      pl: 6.2,
                      pvp: 1.1,
                      lucroLiquidoDecenal: "Perene e crescente acima de R$ 1.2B a.a.",
                      status: "COMPRA AUTORIZADA"
                    }, null, 2));
                  }}
                  className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 text-[10px] font-mono border border-cyan-500/30"
                >
                  Feed B3 Bazin
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMcpRawPayload(JSON.stringify({
                      protocol: "MCP",
                      titulo: "Tesouro IPCA+ 2035",
                      taxaAnual: "6.35% a.a. + IPCA",
                      vencimento: "15/05/2035",
                      indexador: "IPCA",
                      riscoCredito: "Soberano Brasil (Risco Zero Local)",
                      diretriz: "Proteção contra inflação decenal para holding"
                    }, null, 2));
                  }}
                  className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 text-[10px] font-mono border border-amber-500/30"
                >
                  Tesouro IPCA+
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMcpRawPayload(JSON.stringify({
                      protocol: "MCP",
                      commodity: "Ouro Spot / Minério 62%",
                      precoSpotUsd: 2680.50,
                      curvaFuturos: "Backwardation moderada",
                      estoquesGlobais: "Em queda nos portos de Qingdao",
                      diretriz: "Hedge cambial e reserva de valor para holding"
                    }, null, 2));
                  }}
                  className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 text-[10px] font-mono border border-emerald-500/30"
                >
                  Commodities / Ouro
                </button>
              </div>

              <textarea
                rows={6}
                value={mcpRawPayload}
                onChange={(e) => setMcpRawPayload(e.target.value)}
                placeholder={`Cole aqui o retorno da API ou protocolo MCP em formato JSON ou texto:\n{\n  "ticker": "${selectedAgentForMcp.targetDatabase}",\n  "cotacaoAtual": 34.50,\n  "tetoBazin": 38.80,\n  "dlEbitda": 2.1\n}`}
                className="w-full bg-slate-950 border border-slate-700 rounded-2xl p-3 text-xs text-slate-200 font-mono outline-none focus:border-cyan-500 transition-colors"
              />

              {mcpSuccessFeedback && (
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 font-mono text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{mcpSuccessFeedback}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 pt-3">
              <span className="text-[10px] font-mono text-slate-500">
                Preserva tokens substituindo payloads brutos por memória destilada.
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedAgentForMcp(null)}
                  className="px-4 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-white"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  disabled={isTranscribingMcp || !mcpRawPayload.trim()}
                  onClick={() => handleTranscreverMcp(selectedAgentForMcp)}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 font-mono text-xs font-bold flex items-center gap-1.5 transition-all shadow-lg cursor-pointer"
                >
                  {isTranscribingMcp ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Transcrevendo com IA...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>Transcrever para o Agente</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Criar Nova Ferramenta / Tool Personalizada para o Agente */}
      {selectedAgentForAddTool && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-xl bg-slate-900 border border-cyan-500/50 rounded-3xl p-6 shadow-2xl relative text-slate-100 flex flex-col max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedAgentForAddTool(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                <Code className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Criar Nova Tool para {selectedAgentForAddTool.name}
                </h3>
                <p className="text-xs text-slate-400 font-sans">
                  Adicione API, protocolo MCP, Webhook ou função executável ao pipeline deste agente.
                </p>
              </div>
            </div>

            <form onSubmit={handleSalvarNovaTool} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold uppercase text-slate-300 block mb-1">
                  Nome da Ferramenta / Tool
                </label>
                <input
                  type="text"
                  required
                  value={newToolName}
                  onChange={(e) => setNewToolName(e.target.value)}
                  placeholder="Ex: API B3 Cotador Intradiário, MCP Feed Balanço..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-cyan-500 font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase text-slate-300 block mb-1">
                    Tipo de Ferramenta
                  </label>
                  <select
                    value={newToolType}
                    onChange={(e: any) => setNewToolType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500 font-mono"
                  >
                    <option value="API">API REST / Feed</option>
                    <option value="MCP">Protocolo MCP</option>
                    <option value="WEBHOOK">Webhook Externo (n8n)</option>
                    <option value="FUNCTION">Função de Código Local</option>
                    <option value="WORKSPACE">Google Workspace</option>
                    <option value="SQL">Query / Relacional</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase text-slate-300 block mb-1">
                    Endpoint / Método
                  </label>
                  <input
                    type="text"
                    value={newToolEndpoint}
                    onChange={(e) => setNewToolEndpoint(e.target.value)}
                    placeholder="https://... ou mcp://... ou func.exec()"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-slate-300 block mb-1">
                  Descrição da Ação da Tool
                </label>
                <input
                  type="text"
                  value={newToolDescription}
                  onChange={(e) => setNewToolDescription(e.target.value)}
                  placeholder="Ex: Coleta cotações em tempo real e calcula margem de segurança de Bazin"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500 font-sans"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-slate-300 block mb-1">
                  Parâmetros / Schema JSON (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={newToolParams}
                  onChange={(e) => setNewToolParams(e.target.value)}
                  placeholder={`{\n  "ticker": "${selectedAgentForAddTool.targetDatabase}",\n  "intervalo": "1d"\n}`}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-slate-300 block mb-1">
                  Código / Instrução de Execução (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={newToolCode}
                  onChange={(e) => setNewToolCode(e.target.value)}
                  placeholder="const result = await fetch(endpoint, { headers }); return result.json();"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedAgentForAddTool(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-lg transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Salvar Ferramenta no Agente</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Terminal Interativo do Agente Especialista com LLM Direta */}
      <AgentTerminalModal
        agent={selectedAgentForTerminal}
        isOpen={Boolean(selectedAgentForTerminal)}
        onClose={() => setSelectedAgentForTerminal(null)}
        onAgentDeleted={(id) => {
          recarregar();
          setSelectedAgentForTerminal(null);
        }}
        onTriggerSynapse={onTriggerSynapse}
        onAutonomousAction={(actions) => {
          recarregar();
          if (onAutonomousAction) onAutonomousAction(actions);
        }}
      />

      {/* Estúdio de Desenvolvimento do Agente de Investimento em Código (10 Anos) */}
      <InvestmentAgentStudioModal
        isOpen={showStudioModal}
        onClose={() => setShowStudioModal(false)}
        onAgentSaved={(ag) => {
          recarregar();
          setShowStudioModal(false);
        }}
        onTriggerSynapse={onTriggerSynapse}
        onAddMemory={onAddMemory}
      />

      {/* Espaço de Prompt Customizado & IA Dedicada para Agentes */}
      <AgentPromptBehaviorModal
        isOpen={showPromptBehaviorModal}
        onClose={() => setShowPromptBehaviorModal(false)}
        selectedAgentId={selectedPromptAgentId}
        onSaved={(ag) => {
          recarregar();
          onTriggerSynapse(`Prompt e IA do agente [${ag.name}] salvos com sucesso.`);
        }}
        onTriggerSynapse={onTriggerSynapse}
      />
    </div>
  );
};
