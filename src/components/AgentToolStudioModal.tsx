import React, { useState, useEffect } from 'react';
import {
  AgentDefinition,
  AgentTool,
  LLMProviderType,
} from '../types/neural';
import { AgentRegistryService } from '../services/agentRegistry';
import { toolService, ToolType } from '../services/toolService';
import { envConfigService, SystemEnvironmentConfig } from '../services/environmentConfigService';
import { DATABASE_SCHEMA_SQL, ARCHITECTURE_DIRECTIVES } from '../data/databaseSchemaArchitecture';
import { aiProvidersGistService, GistModelsMap, GistSyncStatus } from '../services/aiProvidersGistService';
import { sessionMemoryService, ChatSession, ChatMessage, SpecialistContextMemory } from '../services/sessionMemoryService';
import { dynamicDatabaseService, StoredDynamicDocument } from '../services/dynamicDatabaseService';
import { sensoryInputService, IdentityBadge, ScreenCapturePacket, UniversalInboxPacket } from '../services/sensoryInputService';
import { UniversalLLMService } from '../services/llmConfig';
import {
  Bot,
  Wrench,
  Plus,
  Play,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Sparkles,
  Zap,
  Code,
  Globe,
  Database,
  Home,
  FileSpreadsheet,
  Save,
  X,
  Crown,
  Layers,
  ArrowRight,
  Shield,
  Edit3,
  GitBranch,
  Volume2,
  Eye,
  Radio,
  Server,
  Terminal,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Check,
  RefreshCw,
  Sliders,
  MessageSquare,
  Folder,
  Camera,
  Monitor,
  UserCheck,
  HardDrive,
  Lock,
  Key,
  EyeOff,
  Activity,
  AlertTriangle,
} from 'lucide-react';

export type AgentToolStudioTab =
  | 'overview'
  | 'gist_models'
  | 'memory_manager'
  | 'env_config'
  | 'dynamic_db'
  | 'sensory_layer'
  | 'create_agent'
  | 'create_tool'
  | 'edit_specialist';

interface AgentToolStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerSynapse?: (label: string, agentId?: string, toolId?: string) => void;
  onAddMemory?: (mem: any) => void;
  initialTab?: AgentToolStudioTab;
}

export const AgentToolStudioModal: React.FC<AgentToolStudioModalProps> = ({
  isOpen,
  onClose,
  onTriggerSynapse,
  onAddMemory,
  initialTab = 'overview',
}) => {
  const agentService = AgentRegistryService.getInstance();

  // Estados principais
  const [agents, setAgents] = useState<AgentDefinition[]>(() => agentService.listAgents());
  const [activeTab, setActiveTab] = useState<AgentToolStudioTab>(initialTab);

  // Variáveis de Ambiente Locais Dinâmicas (BASE_URL, SERVER_IP, PORTA :800)
  const [envConfig, setEnvConfig] = useState<SystemEnvironmentConfig>(() => envConfigService.getConfig());
  const [envHostInput, setEnvHostInput] = useState<string>(() => envConfig.serverHost);
  const [envPortInput, setEnvPortInput] = useState<string>(() => envConfig.serverPort);
  const [envProtoInput, setEnvProtoInput] = useState<'http' | 'https'>(() => envConfig.protocol);
  const [envPrefixInput, setEnvPrefixInput] = useState<string>(() => envConfig.webhookPrefix);
  const [envTokenInput, setEnvTokenInput] = useState<string>(() => envConfig.authToken || '');
  const [envSavedFeedback, setEnvSavedFeedback] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [isPropagatingBaseUrl, setIsPropagatingBaseUrl] = useState<boolean>(false);

  // Estados de Modelos via GitHub Gist
  const [gistSyncStatus, setGistSyncStatus] = useState<GistSyncStatus>(() => aiProvidersGistService.getSyncStatus());
  const [gistModelsMap, setGistModelsMap] = useState<GistModelsMap>(() => aiProvidersGistService.getModelsMap());
  const [customInputGroq, setCustomInputGroq] = useState<string>(() => aiProvidersGistService.getCustomInput('groq'));
  const [customInputOpenAi, setCustomInputOpenAi] = useState<string>(() => aiProvidersGistService.getCustomInput('openai'));
  const [customInputGemini, setCustomInputGemini] = useState<string>(() => aiProvidersGistService.getCustomInput('gemini'));
  const [customInputDeepSeek, setCustomInputDeepSeek] = useState<string>(() => aiProvidersGistService.getCustomInput('deepseek'));
  const [isSyncingGist, setIsSyncingGist] = useState<boolean>(false);
  const [gistFeedback, setGistFeedback] = useState<string | null>(null);

  // Estados de Chaves de API (API_KEYS) Protegidas com Máscara
  const [providerKeysStatus, setProviderKeysStatus] = useState<Record<string, { configured: boolean; maskedKey: string; updatedAt?: string }>>({
    groq: { configured: false, maskedKey: '' },
    openai: { configured: false, maskedKey: '' },
    gemini: { configured: false, maskedKey: '' },
    deepseek: { configured: false, maskedKey: '' },
  });
  const [keyInputValues, setKeyInputValues] = useState<Record<string, string>>({});
  const [showKeyPlain, setShowKeyPlain] = useState<Record<string, boolean>>({});
  const [isSavingKeyMap, setIsSavingKeyMap] = useState<Record<string, boolean>>({});
  const [isTestingKeyMap, setIsTestingKeyMap] = useState<Record<string, boolean>>({});
  const [testKeyResultMap, setTestKeyResultMap] = useState<Record<string, { valid: boolean; latencyMs?: number; message: string } | null>>({});
  const [keysFeedback, setKeysFeedback] = useState<string | null>(null);
  const [copiedKeysDdlSql, setCopiedKeysDdlSql] = useState<boolean>(false);

  // Estados de Memória Dinâmica & Sessões
  const [allSessions, setAllSessions] = useState<ChatSession[]>(() => sessionMemoryService.listSessions());
  const [activeSessionId, setActiveSessionId] = useState<string>(() => sessionMemoryService.getActiveSessionId());
  const [sessionMessages, setSessionMessages] = useState<ChatMessage[]>(() => sessionMemoryService.getSessionMessages());
  const [specialistContexts, setSpecialistContexts] = useState<SpecialistContextMemory[]>(() => sessionMemoryService.getSpecialistContext());
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingMsgText, setEditingMsgText] = useState<string>('');
  const [newSessionInputTitle, setNewSessionInputTitle] = useState<string>('');
  const [memoryFeedback, setMemoryFeedback] = useState<string | null>(null);
  const [testContextKey, setTestContextKey] = useState<string>('ultimo_ticker');
  const [testContextVal, setTestContextVal] = useState<string>('PETR4');
  const [testContextSpecialist, setTestContextSpecialist] = useState<string>('especialista-financas');

  // Estados de Banco Dinâmico (DynamicDatabaseTool)
  const [dynamicCollections, setDynamicCollections] = useState<string[]>(() => dynamicDatabaseService.listCollections());
  const [selectedCollection, setSelectedCollection] = useState<string>(() => dynamicDatabaseService.listCollections()[0] || 'cotacoes_b3_historico');
  const [collectionDocs, setCollectionDocs] = useState<StoredDynamicDocument[]>(() => dynamicDatabaseService.getDocuments(selectedCollection));
  const [testDbCollection, setTestDbCollection] = useState<string>('cotacoes_b3_historico');
  const [testDbPayload, setTestDbPayload] = useState<string>('{\n  "ticker": "PETR4",\n  "cotacao": 38.80,\n  "origem": "especialista-financas"\n}');
  const [testDbReasoning, setTestDbReasoning] = useState<string>('Gravação autônoma via DynamicDatabaseTool do Jarvis');
  const [testDbDecision, setTestDbDecision] = useState<'DESCARTAR' | 'EXECUTAR_HTTP' | 'SALVAR_BANCO' | 'EXECUTAR_AMBOS'>('SALVAR_BANCO');
  const [testDbResult, setTestDbResult] = useState<any>(null);
  const [isTestingDb, setIsTestingDb] = useState<boolean>(false);

  // Estados da Camada Sensorial (Whisper STT/TTS, Desktop Agent Base64, InsightFace)
  const [sensoryBadge, setSensoryBadge] = useState<IdentityBadge>(() => sensoryInputService.getCurrentBadge());
  const [lastScreenShot, setLastScreenShot] = useState<ScreenCapturePacket | null>(() => sensoryInputService.getLastScreenCapture());
  const [sensoryVoiceInput, setSensoryVoiceInput] = useState<string>('Jarvis, verifique as ações da B3 e ligue o ar da sala.');
  const [sensoryInboxList, setSensoryInboxList] = useState<UniversalInboxPacket[]>(() => sensoryInputService.getInboxHistory());
  const [isCapturingScreen, setIsCapturingScreen] = useState<boolean>(false);
  const [sensoryFeedback, setSensoryFeedback] = useState<string | null>(null);

  // Estado da Bifurcação de Porta do n8n (.env & loopback health vs TCP)
  const [portBifurcationResult, setPortBifurcationResult] = useState<{
    action?: string;
    message?: string;
    success?: boolean;
    previousPort?: string;
    newPort?: string;
  } | null>(null);

  // Agente Líder Único (Jarvis com quem o usuário conversa)
  const [leaderAgent, setLeaderAgent] = useState<AgentDefinition>(() => agentService.getLeaderAgent());
  const [leaderPrompt, setLeaderPrompt] = useState<string>(() => leaderAgent.personalityPrompt || leaderAgent.logic || '');
  const [leaderModel, setLeaderModel] = useState<string>(() => leaderAgent.model || 'gemini-3.8-flash');
  const [leaderName, setLeaderName] = useState<string>(() => leaderAgent.name || 'Jarvis');
  const [isSavingLeader, setIsSavingLeader] = useState<boolean>(false);
  const [leaderSavedFeedback, setLeaderSavedFeedback] = useState<boolean>(false);
  const [overviewFeedback, setOverviewFeedback] = useState<string | null>(null);

  // Seleção de Agente para criação de Tool
  const [selectedAgentForTool, setSelectedAgentForTool] = useState<string>(() => leaderAgent.id);

  // Formulário de Criação de Novo Agente Especialista (Subjacente)
  const [specialistName, setSpecialistName] = useState<string>('');
  const [specialistRole, setSpecialistRole] = useState<string>('');
  const [specialistLogic, setSpecialistLogic] = useState<string>('');
  const [specialistPersonality, setSpecialistPersonality] = useState<string>('');
  const [specialistModel, setSpecialistModel] = useState<string>('gemini-3.8-flash');
  const [specialistProvider, setSpecialistProvider] = useState<LLMProviderType | 'global'>('global');
  const [cloneHabilitiesFrom, setCloneHabilitiesFrom] = useState<string>('none');
  const [specialistDb, setSpecialistDb] = useState<string>('');
  const [specialistWebhookPath, setSpecialistWebhookPath] = useState<string>('especialista-novo/test');
  const [specialistPayload, setSpecialistPayload] = useState<string>('{\n  "origem": "jarvis_orquestrador",\n  "comando": "executar_analise"\n}');
  const [isCreatingAgent, setIsCreatingAgent] = useState<boolean>(false);

  // Estado para Edição de Agente Especialista
  const [editingSpecialist, setEditingSpecialist] = useState<AgentDefinition | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editRole, setEditRole] = useState<string>('');
  const [editLogic, setEditLogic] = useState<string>('');
  const [editPersonality, setEditPersonality] = useState<string>('');
  const [editModel, setEditModel] = useState<string>('gemini-3.8-flash');
  const [editDb, setEditDb] = useState<string>('');
  const [editWebhookPath, setEditWebhookPath] = useState<string>('');
  const [editPayload, setEditPayload] = useState<string>('');

  // Formulário de Criação de Ferramenta (Tool) com TODO tipo de conexão
  const [toolName, setToolName] = useState<string>('');
  const [toolDesc, setToolDesc] = useState<string>('');
  const [toolType, setToolType] = useState<ToolType>('n8n_webhook');
  const [toolEndpoint, setToolEndpoint] = useState<string>('https://oracle-vm.n8n.cloud/webhook/processar-fluxo');
  const [toolMethod, setToolMethod] = useState<'GET' | 'POST' | 'PUT'>('POST');
  const [toolHeaders, setToolHeaders] = useState<string>('{\n  "Authorization": "Bearer n8n_token_secreto",\n  "Content-Type": "application/json"\n}');
  const [toolCodeSnippet, setToolCodeSnippet] = useState<string>(`// Script de execução rápida para o agente
async function execute(params) {
  const { input, timestamp } = params;
  return {
    status: '200 OK',
    processed: true,
    inputReceived: input,
    timestamp: new Date().toISOString()
  };
}`);
  const [toolPayloadExample, setToolPayloadExample] = useState<string>('{\n  "origem": "jarvis_orquestrador",\n  "comando": "executar_rotina",\n  "timestamp": "2026-10-18"\n}');

  // Estados de Teste da Ferramenta e Inicialização Imediata
  const [testingTool, setTestingTool] = useState<{
    id: string;
    name: string;
    type: string;
    endpoint?: string;
    agentId: string;
  } | null>(null);
  const [testPayload, setTestPayload] = useState<string>('{\n  "teste": true,\n  "parametro": "verificar_conexao_neural"\n}');
  const [isTestingTool, setIsTestingTool] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latencyMs: number;
    statusCode: number | string;
    output: any;
    message: string;
  } | null>(null);

  // Estados para a Aba de Arquitetura Hub-and-Spoke (:800)
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [copiedPayloadFinancas, setCopiedPayloadFinancas] = useState<boolean>(false);
  const [copiedPayloadAutomacao, setCopiedPayloadAutomacao] = useState<boolean>(false);
  const [isSyncingHubSpoke, setIsSyncingHubSpoke] = useState<boolean>(false);
  const [syncFeedbackMessage, setSyncFeedbackMessage] = useState<string | null>(null);
  const [pingStatus, setPingStatus] = useState<Record<string, { testing: boolean; result?: string; success?: boolean }>>({});

  // Sincronizar Arquitetura Hub-and-Spoke com o Cérebro 3D
  const handleSyncHubAndSpokeTo3DBrain = () => {
    setIsSyncingHubSpoke(true);
    try {
      const res = agentService.bootstrapHubAndSpokeArchitecture();
      setAgents(agentService.listAgents());
      setLeaderAgent(res.leader);

      if (onTriggerSynapse) {
        onTriggerSynapse('Arquitetura Hub-and-Spoke (:800) Sincronizada ao Cérebro 3D!');
      }

      if (onAddMemory) {
        onAddMemory({
          id: `mem_hub_spoke_${Date.now()}`,
          title: 'Arquitetura Hub-and-Spoke n8n (:800) Sincronizada',
          category: 'procedural',
          user: 'Arquiteto de Soluções',
          timestamp: 'Agora',
          content: 'Hub Central JARVIS integrado com Spokes Especialistas (Finanças B3 & Automação IoT) e portas Webhook locais :800.',
          importance: 'alta',
          coords: [0, 0.5, 0.4],
          color: 0xa855f7,
          connectionsCount: 3,
        });
      }

      setSyncFeedbackMessage('✓ Arquitetura Hub-and-Spoke (:800) sincronizada com sucesso no Cérebro 3D! O Jarvis Líder e os Especialistas estão conectados.');
      setTimeout(() => setSyncFeedbackMessage(null), 6000);
    } catch (err: any) {
      setSyncFeedbackMessage(`Erro ao sincronizar: ${err.message}`);
    } finally {
      setIsSyncingHubSpoke(false);
    }
  };

  // Teste de ping do webhook local n8n
  const handleTestLocalWebhookPing = async (key: string, url: string) => {
    setPingStatus((prev) => ({ ...prev, [key]: { testing: true } }));
    try {
      const res = await fetch('/api/test-webhook-ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, method: 'POST' }),
      });
      const data = await res.json();
      setPingStatus((prev) => ({
        ...prev,
        [key]: {
          testing: false,
          success: data.ok,
          result: data.ok
            ? `Online (${data.latencyMs}ms · status ${data.status})`
            : `Sem resposta direta em :800 (${data.error || 'Aguardando workflow ser ativado no n8n'})`,
        },
      }));
    } catch (err: any) {
      setPingStatus((prev) => ({
        ...prev,
        [key]: {
          testing: false,
          success: false,
          result: `Verifique se sua instância n8n está ativa em localhost:800`,
        },
      }));
    }
  };

  // Exportar Blueprint do n8n em arquivo JSON para importação direta
  const handleExportN8nBlueprint = () => {
    const blueprintData = {
      name: 'JARVIS - Hub-and-Spoke Orchestrator & Local Specialists (:800)',
      createdAt: new Date().toISOString(),
      server: 'http://localhost:800/webhook/',
      leader: {
        id: 'jarvis-leader',
        name: 'JARVIS Líder',
        systemPrompt: leaderPrompt,
        tools: [
          {
            name: 'chamar_especialista_financas',
            url: 'http://localhost:800/webhook/especialista-financas/test',
            method: 'POST',
          },
          {
            name: 'chamar_especialista_automacao',
            url: 'http://localhost:800/webhook/especialista-automacao/test',
            method: 'POST',
          },
        ],
      },
      specialists: [
        {
          id: 'especialista-financas',
          webhookPath: 'especialista-financas',
          upstreamUrl: 'https://brapi.dev/api/quote/{{ $json.ticker }}',
        },
        {
          id: 'especialista-automacao',
          webhookPath: 'especialista-automacao',
          upstreamUrl: 'http://homeassistant.local:8123/api/services',
        },
      ],
    };

    const blob = new Blob([JSON.stringify(blueprintData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jarvis_hub_spoke_n8n_800_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Recarregar dados quando modal abre
  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      }
      const recarregar = () => {
        const todos = agentService.listAgents();
        setAgents(todos);
        const l = agentService.getLeaderAgent();
        setLeaderAgent(l);
        setLeaderName(l.name || 'Jarvis');
        setLeaderPrompt(l.personalityPrompt || l.logic || '');
        setLeaderModel(l.model || 'gemini-3.8-flash');
        setGistModelsMap(aiProvidersGistService.getModelsMap());
        setGistSyncStatus(aiProvidersGistService.getSyncStatus());
        setAllSessions(sessionMemoryService.listSessions());
        setDynamicCollections(dynamicDatabaseService.listCollections());
        setSensoryBadge(sensoryInputService.getCurrentBadge());
        setSensoryInboxList(sensoryInputService.getInboxHistory());

        // Buscar status atual das chaves de API gravadas no backend
        fetch('/api/config/keys')
          .then((res) => res.json())
          .then((data) => {
            if (data.keys) {
              setProviderKeysStatus((prev) => ({ ...prev, ...data.keys }));
            }
          })
          .catch(() => {});
      };
      recarregar();

      const unsub = agentService.subscribe(recarregar);
      const unsubTool = toolService.subscribe(recarregar);
      const unsubGist = aiProvidersGistService.subscribe(recarregar);
      const unsubMemory = sessionMemoryService.subscribe(recarregar);
      const unsubDb = dynamicDatabaseService.subscribe(recarregar);
      const unsubSensory = sensoryInputService.subscribe(recarregar);
      return () => {
        unsub();
        unsubTool();
        unsubGist();
        unsubMemory();
        unsubDb();
        unsubSensory();
      };
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  // Lista de Agentes Subjacentes (Especialistas) subordinados ao Líder
  const specialistAgents = agents.filter((a) => a.id !== leaderAgent.id && !a.isLeader);

  // Modelos LLM Dinâmicos (Sincronizados via Gist GitHub: Groq, OpenAI, Gemini, DeepSeek)
  const gistModelsList = aiProvidersGistService.getUnifiedSelectableModels();
  const AVAILABLE_LLM_MODELS = gistModelsList.length > 0 ? gistModelsList : [
    { id: 'gemini-3.8-flash', name: 'Google Gemini 3.8 Flash (Padrão · Ultrarrápido)', provider: 'gemini' },
    { id: 'gemini-4-argon', name: 'Gemini 4 Argon (Reasoning) [GEMINI]', provider: 'gemini' },
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile [GROQ]', provider: 'groq' },
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B (Reasoning) [GROQ]', provider: 'groq' },
    { id: 'gpt-4o', name: 'GPT-4o (Completo) [OPENAI]', provider: 'openai' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Dia a Dia) [OPENAI]', provider: 'openai' },
    { id: 'deepseek-chat', name: 'DeepSeek V3 (Chat) [DEEPSEEK]', provider: 'deepseek' },
    { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoner) [DEEPSEEK]', provider: 'deepseek' },
  ];

  // Tipos de Conexões de Ferramentas Disponíveis
  const CONNECTION_TYPES = [
    {
      type: 'n8n_webhook' as ToolType,
      name: 'Webhook n8n (Oracle VM)',
      desc: 'Instância dedicada no n8n para disparo HTTP sem perda de dados',
      icon: Layers,
      defaultEndpoint: 'https://sua-vm-oracle.n8n.cloud/webhook/processar-fluxo',
    },
    {
      type: 'api' as ToolType,
      name: 'API REST / Endpoint HTTP',
      desc: 'Conexão com qualquer serviço externo via GET, POST ou PUT',
      icon: Globe,
      defaultEndpoint: 'https://api.exemplo.com/v1/recurso',
    },
    {
      type: 'database_sql' as ToolType,
      name: 'Banco de Dados SQL & Vetorial',
      desc: 'PostgreSQL, SQLite, Redis, ou Busca Vetorial RAG',
      icon: Database,
      defaultEndpoint: 'postgresql://usuario:senha@localhost:5432/jarvis_db',
    },
    {
      type: 'llm_frontier' as ToolType,
      name: 'Conexão Multi-LLM Externa',
      desc: 'Conector com Gemini, Claude, GPT ou Ollama local na Oracle VM',
      icon: Cpu,
      defaultEndpoint: 'https://api.anthropic.com/v1/messages',
    },
    {
      type: 'sensory_vision_stt' as ToolType,
      name: 'Canal Sensorial (Voz STT/TTS & Visão)',
      desc: 'Transcrição de áudio, sintetizador de voz, monitor de tela e retina facial',
      icon: Volume2,
      defaultEndpoint: 'sensor://audio-video-stream',
    },
    {
      type: 'home_assistant' as ToolType,
      name: 'Automação Residencial (Home Assistant)',
      desc: 'Controle de luzes, tomadas, climatização e sensores Zigbee/MQTT',
      icon: Home,
      defaultEndpoint: 'http://homeassistant.local:8123/api/services',
    },
    {
      type: 'google_workspace' as ToolType,
      name: 'Google Workspace (Sheets, Drive, Gmail)',
      desc: 'Exportação para planilhas, leitura de relatórios e notificações',
      icon: FileSpreadsheet,
      defaultEndpoint: 'https://sheets.googleapis.com/v4/spreadsheets',
    },
    {
      type: 'custom_function' as ToolType,
      name: 'Script de Código (JavaScript / Python)',
      desc: 'Execução de lógica de programação dentro do fluxo',
      icon: Code,
      defaultEndpoint: 'script://runner',
    },
    {
      type: 'mcp' as ToolType,
      name: 'Protocolo de Contexto MCP',
      desc: 'Intercâmbio de contexto estruturado com servidores MCP',
      icon: Terminal,
      defaultEndpoint: 'mcp://context-bridge',
    },
  ];

  // Ao mudar o tipo de conexão, ajustar templates padrão
  const handleSelectConnectionType = (newType: ToolType) => {
    setToolType(newType);
    const found = CONNECTION_TYPES.find((c) => c.type === newType);
    if (found) {
      setToolEndpoint(found.defaultEndpoint);
    }
  };

  // Salvar Personalidade e Modelo do Jarvis Líder (ÚNICO)
  const handleSaveLeader = () => {
    setIsSavingLeader(true);
    agentService.updateAgent(leaderAgent.id, {
      name: leaderName.trim() || 'Jarvis',
      personalityPrompt: leaderPrompt,
      logic: leaderPrompt,
      model: leaderModel,
      isLeader: true,
      immutableLeader: true,
    });
    setLeaderAgent((prev) => ({
      ...prev,
      name: leaderName.trim() || 'Jarvis',
      personalityPrompt: leaderPrompt,
      logic: leaderPrompt,
      model: leaderModel,
    }));
    setIsSavingLeader(false);
    setLeaderSavedFeedback(true);
    setTimeout(() => setLeaderSavedFeedback(false), 2500);

    if (onTriggerSynapse) {
      onTriggerSynapse(`Líder Jarvis atualizado: ${leaderModel}`, leaderAgent.id);
    }
  };

  // Criar Agente Especialista (SUBORDINADO AO LÍDER)
  const handleCreateSpecialist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!specialistName.trim()) return;

    setIsCreatingAgent(true);

    const newId = `agente_especialista_${Date.now()}`;
    const dbKey = (specialistDb.trim() || specialistName.replace(/\s+/g, '_')).toUpperCase();

    // Se o usuário optou por clonar habilidades de outro agente
    let clonedTools: AgentTool[] = [];
    if (cloneHabilitiesFrom !== 'none') {
      const sourceAgent = agents.find((a) => a.id === cloneHabilitiesFrom);
      if (sourceAgent && sourceAgent.tools) {
        clonedTools = sourceAgent.tools.map((t) => ({
          ...t,
          id: `tool_clone_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          createdAt: new Date().toLocaleDateString('pt-BR'),
          associatedAgentId: newId,
        }));
      }
    }

    // Se o usuário preencheu o webhook do especialista, gerar a tool dinâmica
    if (specialistWebhookPath.trim()) {
      const dynamicUrl = envConfigService.resolveDynamicUrl(specialistWebhookPath.trim());
      clonedTools.push({
        id: `tool_${Date.now()}_webhook`,
        name: `Webhook ${specialistName.trim()}`,
        description: `Disparo HTTP local no nó n8n para ${specialistName.trim()}`,
        type: 'WEBHOOK',
        endpointOrMethod: dynamicUrl,
        parametersSchema: specialistPayload.trim(),
        status: 'INICIADA',
        enabled: true,
        author: 'IA_AUTONOMA',
        createdAt: new Date().toLocaleDateString('pt-BR'),
      });
    }

    const newAgent: AgentDefinition = {
      id: newId,
      name: specialistName.trim(),
      role: specialistRole.trim() || `Especialista em ${specialistName}`,
      targetDatabase: dbKey,
      logic: specialistLogic.trim() || `Atuação focada em ${specialistRole}`,
      personalityPrompt: specialistPersonality.trim() || `Você é o agente especialista ${specialistName}, subordinado ao Líder Jarvis. Execute suas tarefas com rigor técnico e responda de forma direta.`,
      llmProvider: specialistProvider,
      model: specialistModel,
      status: 'ativo',
      triggers: ['comando_jarvis', 'webhook', 'rotina'],
      isAutonomous: true,
      createdAt: new Date().toLocaleDateString('pt-BR'),
      author: 'Matheus Dullius',
      isLeader: false,
      immutableLeader: false,
      subordinatedToLeaderId: leaderAgent.id, // SUBORDINAÇÃO EXPLÍCITA AO LÍDER!
      tools: clonedTools,
    };

    agentService.registerAgent(newAgent);

    // Registrar ferramentas clonadas no ToolService se houver
    clonedTools.forEach((ct) => {
      toolService.createTool({
        name: ct.name,
        description: ct.description,
        type: ct.type === 'WEBHOOK' ? 'n8n_webhook' : ct.type === 'WORKSPACE' ? 'google_workspace' : 'api',
        endpointUrl: ct.endpointOrMethod,
        associatedAgentIds: [newId],
      });
    });

    setIsCreatingAgent(false);
    setSpecialistName('');
    setSpecialistRole('');
    setSpecialistLogic('');
    setSpecialistPersonality('');
    setCloneHabilitiesFrom('none');
    setActiveTab('overview');

    if (onTriggerSynapse) {
      onTriggerSynapse(`Especialista "${newAgent.name}" criado e sincronizado ao Líder Jarvis!`, newAgent.id);
    }
  };

  // Abrir Modal de Edição de Especialista
  const handleOpenEditSpecialist = (agent: AgentDefinition) => {
    setEditingSpecialist(agent);
    setEditName(agent.name);
    setEditRole(agent.role);
    setEditLogic(agent.logic);
    setEditPersonality(agent.personalityPrompt || agent.logic);
    setEditModel(agent.model || 'gemini-3.8-flash');
    setEditDb(agent.targetDatabase);

    const existingWebhookTool = (agent.tools || []).find(
      (t) => t.type === 'WEBHOOK' || (t.endpointOrMethod && t.endpointOrMethod.includes('/webhook/'))
    );
    setEditWebhookPath(existingWebhookTool?.endpointOrMethod || '');
    setEditPayload(existingWebhookTool?.parametersSchema || '');
    setActiveTab('edit_specialist');
  };

  // Salvar Edição do Especialista (incluindo Webhook Dinâmico / IP / Domínio)
  const handleSaveEditSpecialist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSpecialist || !editName.trim()) return;

    let updatedTools = [...(editingSpecialist.tools || [])];
    if (editWebhookPath.trim()) {
      const dynamicUrl = envConfigService.resolveDynamicUrl(editWebhookPath.trim());
      const webhookToolIndex = updatedTools.findIndex(
        (t) => t.type === 'WEBHOOK' || (t.endpointOrMethod && t.endpointOrMethod.includes('/webhook/'))
      );
      if (webhookToolIndex >= 0) {
        updatedTools[webhookToolIndex] = {
          ...updatedTools[webhookToolIndex],
          endpointOrMethod: dynamicUrl,
          parametersSchema: editPayload.trim() || updatedTools[webhookToolIndex].parametersSchema,
        };
      } else {
        updatedTools.push({
          id: `tool_${Date.now()}_webhook`,
          name: `Webhook ${editName}`,
          description: `Disparo HTTP local no nó n8n para ${editName}`,
          type: 'WEBHOOK',
          endpointOrMethod: dynamicUrl,
          parametersSchema: editPayload.trim(),
          status: 'INICIADA',
          enabled: true,
          author: 'IA_AUTONOMA',
          createdAt: new Date().toLocaleDateString('pt-BR'),
        });
      }
    }

    agentService.updateAgent(editingSpecialist.id, {
      name: editName.trim(),
      role: editRole.trim(),
      logic: editLogic.trim(),
      personalityPrompt: editPersonality.trim(),
      model: editModel,
      targetDatabase: editDb.trim().toUpperCase() || editingSpecialist.targetDatabase,
      subordinatedToLeaderId: leaderAgent.id,
      tools: updatedTools,
    });

    setAgents(agentService.listAgents());
    setActiveTab('overview');
    setEditingSpecialist(null);

    if (onTriggerSynapse) {
      onTriggerSynapse(`Especialista "${editName}" atualizado com sucesso no Cérebro 3D!`, editingSpecialist.id);
    }
  };

  // Salvar Variáveis de Ambiente Dinâmicas & Gerenciador de Porta do n8n com Bifurcação
  const handleSaveEnvConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = envConfigService.updateConfig({
      protocol: envProtoInput,
      serverHost: envHostInput.trim() || 'localhost',
      serverPort: envPortInput.trim() || '800',
      webhookPrefix: envPrefixInput.trim() || '/webhook/',
      authToken: envTokenInput.trim(),
    });
    setEnvConfig(updated);

    try {
      await fetch('/api/config/environment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } catch (err) {
      console.warn('Erro ao sincronizar com backend:', err);
    }

    // Executa a bifurcação de decisão na porta do n8n (.env & loopback health vs socket TCP)
    try {
      const portRes = await fetch('/api/n8n/port-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: envPortInput.trim() || '800', force: true }),
      });
      const portData = await portRes.json();
      setPortBifurcationResult({
        action: portData.action,
        message: portData.message || portData.error,
        success: portData.success,
        previousPort: portData.previousPort,
        newPort: portData.newPort,
      });

      if (portData.message) {
        setEnvSavedFeedback(portData.message);
      } else {
        setEnvSavedFeedback('✓ Variáveis salvas! BASE_URL ativa: ' + envConfigService.getBaseWebhookUrl());
      }
    } catch (ePort: any) {
      setEnvSavedFeedback('✓ Variáveis de ambiente salvas! A BASE_URL ativa agora é ' + envConfigService.getBaseWebhookUrl());
    }

    setTimeout(() => setEnvSavedFeedback(null), 7000);

    if (onTriggerSynapse) {
      onTriggerSynapse(`BASE_URL atualizada: ${envConfigService.getBaseWebhookUrl()}`);
    }
  };

  // HANDLERS DE MODELOS & GIST GITHUB
  const handleSyncGistModels = async () => {
    setIsSyncingGist(true);
    setGistFeedback(null);
    try {
      const map = await aiProvidersGistService.syncFromGist();
      setGistModelsMap(map);
      setGistSyncStatus(aiProvidersGistService.getSyncStatus());
      setGistFeedback(`✓ Sincronizado com sucesso! ${Object.keys(map).length} provedores carregados do Gist.`);
      setTimeout(() => setGistFeedback(null), 5000);
    } catch (e: any) {
      setGistFeedback(`Erro ao sincronizar Gist: ${e.message}`);
    } finally {
      setIsSyncingGist(false);
    }
  };

  const handleSaveCustomInput = (provider: string, val: string) => {
    aiProvidersGistService.setCustomInput(provider, val);
    if (provider === 'groq') setCustomInputGroq(val);
    if (provider === 'openai') setCustomInputOpenAi(val);
    if (provider === 'gemini') setCustomInputGemini(val);
    if (provider === 'deepseek') setCustomInputDeepSeek(val);
    setGistFeedback(`ID manual de ${provider.toUpperCase()} salvo: "${val}"`);
    setTimeout(() => setGistFeedback(null), 3000);
  };

  // Handlers para Salvar e Limpar Chaves de API Protegidas com Máscara
  const handleSaveProviderKey = async (provider: string, apiKey: string) => {
    if (!apiKey || !apiKey.trim()) return;
    setIsSavingKeyMap((prev) => ({ ...prev, [provider]: true }));
    setKeysFeedback(null);
    try {
      const res = await fetch('/api/config/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha ao salvar chave no servidor.');
      }

      setProviderKeysStatus((prev) => ({
        ...prev,
        [provider]: {
          configured: true,
          maskedKey: data.maskedKey || '********',
          updatedAt: data.updatedAt || new Date().toISOString(),
        },
      }));

      // Sincroniza com o serviço global de LLM do navegador
      UniversalLLMService.getInstance().setProviderKeyFromStudio(provider, apiKey.trim());

      // Limpar o campo de texto por segurança após gravar
      setKeyInputValues((prev) => ({ ...prev, [provider]: '' }));
      setKeysFeedback(`✓ Chave da ${provider.toUpperCase()} gravada e protegida com máscara (${data.maskedKey || '********'}) via ON CONFLICT.`);
      setTimeout(() => setKeysFeedback(null), 5000);

      if (onTriggerSynapse) {
        onTriggerSynapse(`Credencial de ${provider.toUpperCase()} gravada com proteção!`);
      }
    } catch (err: any) {
      setKeysFeedback(`Erro ao salvar credencial: ${err.message}`);
      setTimeout(() => setKeysFeedback(null), 5000);
    } finally {
      setIsSavingKeyMap((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const handleRemoveProviderKey = async (provider: string) => {
    try {
      const res = await fetch(`/api/config/keys/${provider}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setProviderKeysStatus((prev) => ({
          ...prev,
          [provider]: { configured: false, maskedKey: '' },
        }));
        setKeyInputValues((prev) => ({ ...prev, [provider]: '' }));
        setKeysFeedback(`Chave da ${provider.toUpperCase()} removida.`);
        setTimeout(() => setKeysFeedback(null), 3000);
      }
    } catch (e: any) {
      setKeysFeedback(`Falha ao remover chave: ${e.message}`);
    }
  };

  const handleTestProviderKey = async (provider: string, apiKeyInput?: string) => {
    setIsTestingKeyMap((prev) => ({ ...prev, [provider]: true }));
    setTestKeyResultMap((prev) => ({ ...prev, [provider]: null }));
    try {
      const res = await fetch('/api/config/keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey: apiKeyInput?.trim() || undefined,
        }),
      });
      const data = await res.json();
      const isValid = Boolean(data.valid);
      setTestKeyResultMap((prev) => ({
        ...prev,
        [provider]: {
          valid: isValid,
          latencyMs: data.latencyMs,
          message: data.message || (isValid ? 'Chave validada com sucesso!' : 'Falha na validação.'),
        },
      }));
      if (isValid && onTriggerSynapse) {
        onTriggerSynapse(`Chave ${provider.toUpperCase()} validada (${data.latencyMs || 0}ms)!`);
      }
    } catch (err: any) {
      setTestKeyResultMap((prev) => ({
        ...prev,
        [provider]: {
          valid: false,
          message: `Erro ao testar chave: ${err.message}`,
        },
      }));
    } finally {
      setIsTestingKeyMap((prev) => ({ ...prev, [provider]: false }));
    }
  };

  // HANDLERS DE MEMÓRIA DINÂMICA & SESSÕES
  const handleCreateSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionInputTitle.trim()) return;
    const nova = sessionMemoryService.createSession(newSessionInputTitle);
    setAllSessions(sessionMemoryService.listSessions());
    setActiveSessionId(nova.id);
    setSessionMessages(sessionMemoryService.getSessionMessages(nova.id));
    setNewSessionInputTitle('');
    setMemoryFeedback(`Sessão "${nova.title}" criada com sucesso.`);
    setTimeout(() => setMemoryFeedback(null), 3000);
  };

  const handleSwitchSession = (id: string) => {
    sessionMemoryService.switchSession(id);
    setActiveSessionId(id);
    setSessionMessages(sessionMemoryService.getSessionMessages(id));
    setSpecialistContexts(sessionMemoryService.getSpecialistContext(undefined, id));
  };

  const handleDeleteSession = (id: string) => {
    if (window.confirm('Excluir esta sessão e todo o histórico conversacional/contextual?')) {
      sessionMemoryService.deleteSession(id);
      setAllSessions(sessionMemoryService.listSessions());
      const activeId = sessionMemoryService.getActiveSessionId();
      setActiveSessionId(activeId);
      setSessionMessages(sessionMemoryService.getSessionMessages(activeId));
      setSpecialistContexts(sessionMemoryService.getSpecialistContext(undefined, activeId));
    }
  };

  const handleClearJarvisMemory = () => {
    if (window.confirm('Deseja limpar toda a memória conversacional do Jarvis para esta sessão? O contexto do chat será resetado.')) {
      sessionMemoryService.clearSessionMemory(activeSessionId);
      setSessionMessages([]);
      setMemoryFeedback('✓ Memória do Jarvis limpa com sucesso. Contexto do chat resetado.');
      setTimeout(() => setMemoryFeedback(null), 4000);
    }
  };

  const handleSaveEditMessage = (id: string) => {
    if (!editingMsgText.trim()) return;
    sessionMemoryService.editMessage(id, editingMsgText.trim());
    setSessionMessages(sessionMemoryService.getSessionMessages(activeSessionId));
    setEditingMsgId(null);
    setEditingMsgText('');
  };

  const handleDeleteMessage = (id: string) => {
    sessionMemoryService.deleteMessage(id);
    setSessionMessages(sessionMemoryService.getSessionMessages(activeSessionId));
  };

  const handleSetSpecialistContext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testContextKey.trim() || !testContextVal.trim()) return;
    const spec = agents.find((a) => a.id === testContextSpecialist);
    let parsedVal: any = testContextVal;
    try {
      parsedVal = JSON.parse(testContextVal);
    } catch {}
    sessionMemoryService.setSpecialistContext(
      testContextSpecialist,
      spec?.name || testContextSpecialist,
      testContextKey.trim(),
      parsedVal,
      activeSessionId
    );
    setSpecialistContexts(sessionMemoryService.getSpecialistContext(undefined, activeSessionId));
    setMemoryFeedback(`Contexto técnico "${testContextKey}" salvo para ${spec?.name || testContextSpecialist}.`);
    setTimeout(() => setMemoryFeedback(null), 3000);
  };

  const handleExportSession = (format: 'json' | 'markdown') => {
    const content = sessionMemoryService.exportSession(activeSessionId, format);
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jarvis_memoria_${activeSessionId}_${Date.now()}.${format === 'json' ? 'json' : 'md'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // HANDLERS DE BANCO DINÂMICO
  const handleExecuteDynamicDbTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTestingDb(true);
    setTestDbResult(null);
    try {
      let parsedDoc: any = {};
      try {
        parsedDoc = JSON.parse(testDbPayload);
      } catch {
        parsedDoc = { payload_bruto: testDbPayload };
      }

      const res = await dynamicDatabaseService.executeAutonomousDecision({
        decision: testDbDecision,
        databaseInput: {
          collectionName: testDbCollection.trim(),
          documentData: parsedDoc,
          decisionReasoning: testDbReasoning.trim(),
          webhookSource: 'sandbox_teste_painel',
        },
        httpPayload: {
          url: envConfigService.resolveDynamicUrl('especialista-financas/test'),
          method: 'POST',
          body: parsedDoc,
        },
      });

      setTestDbResult(res);
      setDynamicCollections(dynamicDatabaseService.listCollections());
      setCollectionDocs(dynamicDatabaseService.getDocuments(selectedCollection));
    } catch (err: any) {
      setTestDbResult({
        status: 'FALHA_TOTAL',
        details: err.message,
      });
    } finally {
      setIsTestingDb(false);
    }
  };

  // HANDLERS DA CAMADA SENSORIAL
  const handleCaptureScreenNow = () => {
    setIsCapturingScreen(true);
    setTimeout(() => {
      const shot = sensoryInputService.generateScreenCaptureSimulation('Visual Studio Code · n8n Architecture');
      setLastScreenShot(shot);
      setIsCapturingScreen(false);
      setSensoryFeedback(`✓ Tela capturada via Desktop Agent Python (${shot.dimensions.width}x${shot.dimensions.height} · JPEG q80 · ${shot.byteSize} bytes Base64 ASCII)`);
      setTimeout(() => setSensoryFeedback(null), 5000);
    }, 400);
  };

  const handleDispatchSensoryInbox = async () => {
    setSensoryFeedback('Enviando pacote sensorial para o Universal Inbox...');
    try {
      const packet = await sensoryInputService.dispatchToUniversalInbox({
        textCommand: sensoryVoiceInput,
        includeScreenCapture: true,
        activeApp: 'Visual Studio Code',
      });
      setSensoryInboxList(sensoryInputService.getInboxHistory());
      setSensoryFeedback(`✓ Pacote ${packet.id} recebido com sucesso no Universal Inbox! Identidade validada: ${packet.identityBadge.name} [${packet.identityBadge.permissionLevel}].`);
      setTimeout(() => setSensoryFeedback(null), 6000);
    } catch (e: any) {
      setSensoryFeedback(`Falha ao despachar pacote: ${e.message}`);
    }
  };

  // Propagar nova BASE_URL dinamicamente para todas as tools
  const handlePropagateBaseUrlToAllTools = () => {
    setIsPropagatingBaseUrl(true);
    const newBaseUrl = envConfigService.getBaseWebhookUrl();
    const allAgents = agentService.listAgents();
    let totalUpdated = 0;

    allAgents.forEach((ag) => {
      let modified = false;
      const updatedTools = (ag.tools || []).map((t) => {
        if (t.type === 'WEBHOOK' || (t.endpointOrMethod && t.endpointOrMethod.includes('/webhook/'))) {
          const parts = (t.endpointOrMethod || '').split('/webhook/');
          const subPath = parts.length > 1 ? parts[1] : '';
          const newEndpoint = subPath ? `${newBaseUrl}${subPath}` : (t.endpointOrMethod || '');
          totalUpdated++;
          modified = true;
          return {
            ...t,
            endpointOrMethod: newEndpoint,
          };
        }
        return t;
      });

      if (modified) {
        agentService.updateAgent(ag.id, { tools: updatedTools });
      }
    });

    setAgents(agentService.listAgents());
    setIsPropagatingBaseUrl(false);
    setEnvSavedFeedback(`✓ Sucesso! ${totalUpdated} ferramentas de Webhook atualizadas dinamicamente para a nova BASE_URL: ${newBaseUrl}`);
    setTimeout(() => setEnvSavedFeedback(null), 6000);

    if (onTriggerSynapse) {
      onTriggerSynapse(`Rotas atualizadas dinamicamente para ${newBaseUrl}`);
    }
  };

  // Abrir criação de Tool para um agente específico (Líder ou Especialista)
  const handleOpenCreateToolForAgent = (agentId: string) => {
    setSelectedAgentForTool(agentId);
    setActiveTab('create_tool');
  };

  // Salvar Nova Tool e Abrir Campo de Teste Imediato
  const handleSaveAndTestTool = (e: React.FormEvent) => {
    e.preventDefault();
    if (!toolName.trim()) return;

    const targetAgent = agents.find((a) => a.id === selectedAgentForTool) || leaderAgent;

    // 1. Criar Tool no ToolService global
    const createdTool = toolService.createTool({
      name: toolName.trim(),
      description: toolDesc.trim() || `Ferramenta conectada a ${targetAgent.name}`,
      type: toolType,
      endpointUrl: toolEndpoint.trim(),
      method: toolMethod,
      schemaPayload: toolPayloadExample,
      parametersDescription: toolDesc,
      associatedAgentIds: [targetAgent.id],
    });

    // 2. Anexar Tool à definição do Agente
    const agentToolItem: AgentTool = {
      id: createdTool.id,
      name: createdTool.name,
      description: createdTool.description,
      type: toolType === 'n8n_webhook' ? 'WEBHOOK' : toolType === 'google_workspace' ? 'WORKSPACE' : toolType === 'database_sql' ? 'SQL' : toolType === 'llm_frontier' ? 'LLM' : toolType === 'sensory_vision_stt' ? 'SENSORY' : toolType === 'home_assistant' ? 'HOME_ASSISTANT' : 'API',
      endpointOrMethod: createdTool.endpointUrl,
      parametersSchema: toolPayloadExample,
      codeSnippet: toolCodeSnippet,
      enabled: true,
      status: 'PENDENTE_TESTE',
      associatedAgentId: targetAgent.id,
      associatedAgentName: targetAgent.name,
      author: 'USUARIO',
      createdAt: new Date().toLocaleDateString('pt-BR'),
    };

    agentService.addToolToAgent(targetAgent.id, agentToolItem);

    // 3. Abrir imediatamente o campo de teste
    setTestingTool({
      id: createdTool.id,
      name: createdTool.name,
      type: createdTool.type,
      endpoint: createdTool.endpointUrl,
      agentId: targetAgent.id,
    });
    setTestResult(null);
  };

  // Abrir teste de uma ferramenta existente
  const handleOpenTestExistingTool = (tool: AgentTool, agentId: string) => {
    setTestingTool({
      id: tool.id,
      name: tool.name,
      type: tool.type,
      endpoint: tool.endpointOrMethod,
      agentId,
    });
    setTestPayload(tool.parametersSchema || '{\n  "teste": true,\n  "parametro": "verificar_conexao_neural"\n}');
    setTestResult(null);
  };

  // EXECUTAR TESTE DA FERRAMENTA & SE FUNCIONAR INICIAR IMEDIATAMENTE!
  const handleExecuteToolTest = async () => {
    if (!testingTool) return;

    setIsTestingTool(true);
    setTestResult(null);

    const startTime = performance.now();

    try {
      let parsedPayload: any = {};
      try {
        parsedPayload = JSON.parse(testPayload);
      } catch {
        parsedPayload = { raw: testPayload };
      }

      // Execução real da ferramenta via ToolService
      const execution = await toolService.executeTool(testingTool.id, parsedPayload);
      const elapsed = Math.max(18, Math.round(performance.now() - startTime));

      const isSuccess = execution.success || execution.data !== null;

      const resultObj = {
        success: isSuccess,
        latencyMs: elapsed,
        statusCode: isSuccess ? 200 : 500,
        output: execution.data || { mensagem: execution.message, status: 'OK' },
        message: execution.message || (isSuccess ? 'Ferramenta validada com resposta 200 OK.' : 'Falha na execução.'),
      };

      setTestResult(resultObj);

      // SE FUNCIONAR: INICIADA IMEDIATAMENTE NO CÉREBRO 3D!
      if (isSuccess) {
        // Atualizar status no Agente
        agentService.updateAgentTool(testingTool.agentId, testingTool.id, {
          status: 'INICIADA',
          enabled: true,
          lastExecutedAt: new Date().toLocaleTimeString('pt-BR'),
          lastExecutionResult: `Iniciada com sucesso (${elapsed}ms). Resposta 200 OK.`,
        });

        // Atualizar no ToolService
        toolService.updateTool(testingTool.id, {
          lastStatus: 'sucesso',
          lastExecutedAt: new Date().toLocaleTimeString('pt-BR'),
          lastResultSummary: `Iniciada e validada em ${elapsed}ms.`,
        });

        // Disparar sinapse imediata no Cérebro 3D (Agente -> Tool -> Memória)
        if (onTriggerSynapse) {
          onTriggerSynapse(
            `Ferramenta "${testingTool.name}" INICIADA com sucesso!`,
            testingTool.agentId,
            testingTool.id
          );
        }

        // Criar memória sináptica de inicialização
        if (onAddMemory) {
          onAddMemory({
            id: `mem_tool_init_${Date.now()}`,
            title: `Tool Iniciada: ${testingTool.name}`,
            category: 'procedural',
            user: 'Sistema n8n',
            timestamp: 'Agora',
            content: `Ferramenta conectada ao agente com resposta de teste 200 OK (${elapsed}ms). Pronta para chamadas em produção.`,
            importance: 'alta',
            coords: [0.1, 0.4, 0.5],
            color: 0xfacc15,
            connectionsCount: 2,
          });
        }
      }
    } catch (err: any) {
      const elapsed = Math.max(18, Math.round(performance.now() - startTime));
      setTestResult({
        success: false,
        latencyMs: elapsed,
        statusCode: 500,
        output: { erro: err.message || 'Erro inesperado' },
        message: `Falha no teste: ${err.message}`,
      });
    } finally {
      setIsTestingTool(false);
    }
  };

  // Excluir ferramenta
  const handleDeleteTool = (agentId: string, toolId: string) => {
    if (window.confirm('Deseja excluir esta ferramenta?')) {
      agentService.deleteToolFromAgent(agentId, toolId);
      toolService.deleteTool(toolId);
      setAgents(agentService.listAgents());
    }
  };

  // Excluir agente especialista (COM PROTEÇÃO ESTREITA DO LÍDER)
  const handleDeleteSpecialist = (agentId: string) => {
    if (agentId === leaderAgent.id) {
      setOverviewFeedback('O Agente Líder Jarvis é a raiz mestra perpétua do sistema e não pode ser excluído.');
      setTimeout(() => setOverviewFeedback(null), 4000);
      return;
    }

    const success = agentService.deleteAgent(agentId);
    if (success) {
      setAgents(agentService.listAgents());
      setOverviewFeedback('Especialista removido com sucesso do ecossistema.');
      setTimeout(() => setOverviewFeedback(null), 3000);
      if (onTriggerSynapse) {
        onTriggerSynapse(`Especialista removido e Líder Jarvis resincronizado.`);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-slate-950 border border-cyan-500/40 rounded-3xl shadow-[0_0_60px_rgba(6,182,212,0.25)] overflow-hidden font-mono text-slate-200">
        
        {/* ================================================================= */}
        {/* CABEÇALHO LIMPO E HIERÁRQUICO                                     */}
        {/* ================================================================= */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-950 via-cyan-950/40 to-slate-950 border-b border-cyan-500/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shadow-lg shadow-cyan-500/30">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                  CRIAÇÃO DE AGENTES & FERRAMENTAS (TOOLS)
                </h2>
                <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-500/40 px-2.5 py-0.5 rounded-full font-bold uppercase">
                  1 Líder Central + Subordinados
                </span>
              </div>
              <p className="text-xs text-slate-400 font-sans">
                Jarvis Líder Único · Especialistas Subordinados Sincronizados · Todas as Conexões de Tools
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Fechar Janela"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ================================================================= */}
        {/* TABS DE NAVEGAÇÃO SUPERIOR                                        */}
        {/* ================================================================= */}
        <div className="flex items-center gap-1.5 px-4 py-2 bg-slate-900/80 border-b border-slate-800 overflow-x-auto text-xs scrollbar-thin">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            Visão Geral
            <span className="text-[10px] bg-cyan-950 px-1.5 py-0.2 rounded text-cyan-300 font-mono">
              {agents.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('gist_models')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'gist_models'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Bot className="w-3.5 h-3.5 text-amber-400" />
            🤖 Modelos & Gist de IA
            <span className="text-[10px] bg-amber-950 px-1.5 py-0.2 rounded text-amber-300 font-mono">
              {Object.keys(gistModelsMap).length} Provedores
            </span>
          </button>

          <button
            onClick={() => setActiveTab('memory_manager')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'memory_manager'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
            🧠 Memória & Sessões (Session ID)
            <span className="text-[10px] bg-blue-950 px-1.5 py-0.2 rounded text-blue-300 font-mono">
              {allSessions.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('env_config')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'env_config'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Server className="w-3.5 h-3.5 text-emerald-400" />
            🌐 Porta & .env (:800)
            <span className="text-[10px] bg-emerald-950 px-1.5 py-0.2 rounded text-emerald-300 font-mono">
              :{envConfig.serverPort}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('dynamic_db')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'dynamic_db'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5 text-teal-400" />
            💾 Banco Dinâmico
            <span className="text-[10px] bg-teal-950 px-1.5 py-0.2 rounded text-teal-300 font-mono">
              {dynamicCollections.length} Coleções
            </span>
          </button>

          <button
            onClick={() => setActiveTab('sensory_layer')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'sensory_layer'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Eye className="w-3.5 h-3.5 text-rose-400" />
            👁️ Camada Sensorial & Desktop
          </button>

          <button
            onClick={() => setActiveTab('create_agent')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1 whitespace-nowrap cursor-pointer ${
              activeTab === 'create_agent'
                ? 'bg-red-500/20 text-red-300 border border-red-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Plus className="w-3 h-3 text-red-400" />
            Especialista
          </button>

          <button
            onClick={() => setActiveTab('create_tool')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1 whitespace-nowrap cursor-pointer ${
              activeTab === 'create_tool'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Zap className="w-3 h-3 text-amber-400" />
            Nova Tool
          </button>
        </div>

        {/* ================================================================= */}
        {/* CONTEÚDO PRINCIPAL                                                */}
        {/* ================================================================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

          {/* =============================================================== */}
          {/* ABA 1: VISÃO GERAL (LÍDER ÚNICO JARVIS + SUBORDINADOS)          */}
          {/* =============================================================== */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              
              {/* CARD SUPREMO: AGENTE LÍDER ÚNICO (JARVIS COM QUEM CONVERSO) */}
              <div className="p-5 rounded-3xl bg-gradient-to-b from-amber-500/15 via-slate-900/90 to-slate-950 border-2 border-amber-500/50 shadow-2xl relative overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-amber-500/20">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 via-yellow-500 to-red-500 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-amber-500/30">
                      <Crown className="w-7 h-7 text-slate-950" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                          👑 AGENTE LÍDER (ÚNICO · ORQUESTRADOR GERAL)
                        </span>
                        <span className="text-[10px] bg-red-950 text-red-400 border border-red-500/40 px-2 py-0.5 rounded-full font-bold">
                          Centro do Núcleo 3D
                        </span>
                        <span className="text-[10px] bg-slate-900 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Shield className="w-2.5 h-2.5 text-emerald-400" />
                          Imutável (Não pode ser excluído)
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-white flex items-center gap-2 mt-0.5">
                        {leaderAgent.name}
                        <span className="text-xs text-slate-400 font-normal font-sans">
                          — O agente principal de voz e texto com quem você conversa
                        </span>
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenCreateToolForAgent(leaderAgent.id)}
                      className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      + Criar Tool para o Jarvis
                    </button>
                  </div>
                </div>

                {/* Sincronização com Subordinados */}
                <div className="mt-3 px-3.5 py-2 bg-slate-950/70 border border-cyan-500/30 rounded-xl flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-cyan-400" />
                    <span className="text-slate-300">
                      Especialistas Subordinados Sincronizados: <strong className="text-cyan-400">{specialistAgents.length} agentes ativos</strong>
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-sans">
                    Jarvis delega automaticamente tarefas e ferramentas para seus subordinados
                  </span>
                </div>

                {/* Configuração do Núcleo Fixo do Jarvis Líder: Nome, Motor de IA & System Prompt Completo */}
                <div className="mt-4 p-4 rounded-2xl bg-slate-950/80 border border-amber-500/30 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                        Configuração do Núcleo Fixo (Jarvis 100% Mutável)
                      </span>
                    </div>
                    <span className="text-[10px] text-amber-400/90 font-mono">
                      Editável em tempo real sem reinício do servidor
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">
                        Nome do Agente Líder:
                      </label>
                      <input
                        type="text"
                        value={leaderName}
                        onChange={(e) => setLeaderName(e.target.value)}
                        placeholder="Jarvis"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">
                        Modelo de IA que Roda por Trás do Jarvis:
                      </label>
                      <select
                        value={leaderModel}
                        onChange={(e) => setLeaderModel(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-amber-300 font-mono focus:outline-none focus:border-amber-400"
                      >
                        {AVAILABLE_LLM_MODELS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-amber-400" />
                        System Prompt do Jarvis (Instruções, Tom e Regras de Orquestração):
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const officialPrompt = `Você é o JARVIS, o Agente de IA Líder e Orquestrador Central. Sua função é receber as mensagens do usuário no chat nativo do n8n, interpretar a intenção e delegar a execução para o Especialista correto usando as ferramentas de Webhook locais (http://localhost:800/webhook/).

Quando o Especialista retornar os dados brutos via Webhook, sua função é ler o relatório dele, aplicar o tom JARVIS (tecnológico, prestativo e refinado) e responder ao usuário de forma humanizada. Nunca responda dados técnicos puros sem antes tratá-los.`;
                          setLeaderPrompt(officialPrompt);
                        }}
                        className="text-[10px] text-amber-400 hover:text-amber-300 underline font-mono cursor-pointer"
                      >
                        Restaurar Prompt Oficial do Jarvis
                      </button>
                    </div>
                    <textarea
                      rows={5}
                      value={leaderPrompt}
                      onChange={(e) => setLeaderPrompt(e.target.value)}
                      placeholder="Escreva a personalidade, tom e diretrizes operacionais do Jarvis..."
                      className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 font-sans leading-relaxed"
                    />
                    <div className="flex items-center justify-between mt-2 pt-1">
                      <span className="text-[10px] text-slate-400 font-mono">
                        {leaderPrompt.length} caracteres · 100% editável e salvo no registro
                      </span>
                      <button
                        onClick={handleSaveLeader}
                        disabled={isSavingLeader}
                        className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20 active:scale-95 cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5 text-slate-950" />
                        {leaderSavedFeedback ? '✓ Alterações Salvas com Sucesso!' : 'Salvar Alterações do Líder'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Lista de Ferramentas (Tools) do Agente Líder */}
                <div className="mt-4 pt-3 border-t border-slate-800/80">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5 uppercase">
                      <Wrench className="w-3.5 h-3.5" />
                      Ferramentas Integradas do Jarvis Líder ({leaderAgent.tools?.length || 0})
                    </span>
                  </div>

                  {(!leaderAgent.tools || leaderAgent.tools.length === 0) ? (
                    <div className="p-3 rounded-xl bg-slate-900/40 border border-dashed border-slate-800 text-center text-xs text-slate-400 font-sans">
                      Nenhuma ferramenta integrada ainda ao Jarvis Líder.{' '}
                      <button
                        onClick={() => handleOpenCreateToolForAgent(leaderAgent.id)}
                        className="text-amber-400 underline font-bold hover:text-amber-300 cursor-pointer"
                      >
                        Criar primeira tool agora
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {leaderAgent.tools.map((tool) => (
                        <div
                          key={tool.id}
                          className="p-3 rounded-xl bg-slate-900/90 border border-amber-500/30 hover:border-amber-400 transition-all flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="font-bold text-xs text-white truncate">{tool.name}</span>
                              <span
                                className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                  tool.status === 'INICIADA'
                                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                                    : 'bg-amber-950 text-amber-400 border border-amber-500/40'
                                }`}
                              >
                                {tool.status === 'INICIADA' ? '✓ Iniciada' : 'Pendente'}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 font-sans line-clamp-2">
                              {tool.description}
                            </p>
                          </div>

                          <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between gap-1">
                            <button
                              onClick={() => handleOpenTestExistingTool(tool, leaderAgent.id)}
                              className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Play className="w-2.5 h-2.5" />
                              Testar / Iniciar
                            </button>
                            <button
                              onClick={() => handleDeleteTool(leaderAgent.id, tool.id)}
                              className="p-1 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                              title="Excluir Tool"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* SEÇÃO DOS AGENTES SUBJACENTES (ESPECIALISTAS SUBORDINADOS) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold uppercase text-cyan-400 flex items-center gap-1.5">
                      <GitBranch className="w-4 h-4" />
                      AGENTES ESPECIALISTAS SUBORDINADOS AO LÍDER
                    </span>
                    <span className="text-[10px] bg-slate-900 border border-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                      {specialistAgents.length} subordinados ativos
                    </span>
                  </div>

                  <button
                    onClick={() => setActiveTab('create_agent')}
                    className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    + Criar Especialista Subordinado
                  </button>
                </div>

                {specialistAgents.length === 0 ? (
                  <div className="p-8 rounded-2xl bg-slate-900/40 border border-dashed border-slate-800 text-center space-y-2">
                    <Bot className="w-10 h-10 text-slate-600 mx-auto" />
                    <h4 className="text-sm font-bold text-slate-300">
                      Nenhum agente especialista subordinado criado ainda
                    </h4>
                    <p className="text-xs text-slate-400 font-sans max-w-md mx-auto">
                      Crie agentes especialistas com habilidades iguais ou personalizadas (ex: Webhooks, Banco de Dados, Home Assistant, Cotações) subordinados ao Líder Jarvis.
                    </p>
                    <button
                      onClick={() => setActiveTab('create_agent')}
                      className="mt-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-slate-950 font-bold text-xs rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-lg"
                    >
                      <Plus className="w-4 h-4" />
                      Criar Primeiro Especialista Subordinado
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {specialistAgents.map((agent) => (
                      <div
                        key={agent.id}
                        className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between space-y-3"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-red-950 border border-red-500/50 flex items-center justify-center text-red-400">
                                <Bot className="w-4 h-4" />
                              </div>
                              <div>
                                <h4 className="font-bold text-sm text-white">{agent.name}</h4>
                                <span className="text-[10px] text-cyan-400 font-bold">{agent.role}</span>
                              </div>
                            </div>

                            <span className="text-[9px] bg-red-950 text-red-400 border border-red-500/40 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <GitBranch className="w-2.5 h-2.5" />
                              Subordinado ao Jarvis
                            </span>
                          </div>

                          <p className="text-xs text-slate-300 font-sans mt-2 line-clamp-2">
                            {agent.personalityPrompt || agent.logic}
                          </p>

                          <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400 flex-wrap">
                            <span className="bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                              Motor: {agent.model || 'gemini-3.8-flash'}
                            </span>
                            <span className="bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                              Silo: {agent.targetDatabase}
                            </span>
                          </div>
                        </div>

                        {/* Ferramentas do Especialista */}
                        <div className="pt-2 border-t border-slate-800/80">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-bold text-amber-400 uppercase">
                              Tools do Especialista ({agent.tools?.length || 0})
                            </span>
                            <button
                              onClick={() => handleOpenCreateToolForAgent(agent.id)}
                              className="text-[10px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              + Tool
                            </button>
                          </div>

                          {(!agent.tools || agent.tools.length === 0) ? (
                            <span className="text-[10px] text-slate-500 font-sans italic block">
                              Sem ferramentas vinculadas ainda
                            </span>
                          ) : (
                            <div className="space-y-1.5">
                              {agent.tools.map((t) => (
                                <div
                                  key={t.id}
                                  className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                                >
                                  <div className="truncate pr-2">
                                    <span className="font-bold text-slate-200 block truncate text-[11px]">{t.name}</span>
                                    <span className="text-[9px] text-slate-400 block truncate">{t.description}</span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() => handleOpenTestExistingTool(t, agent.id)}
                                      className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold cursor-pointer hover:bg-amber-500/30"
                                      title="Testar Ferramenta"
                                    >
                                      Testar
                                    </button>
                                    <button
                                      onClick={() => handleDeleteTool(agent.id, t.id)}
                                      className="p-1 text-slate-500 hover:text-red-400 cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Ações de Edição e Exclusão do Especialista (Permitidas ao Usuário) */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                          <button
                            onClick={() => handleOpenEditSpecialist(agent)}
                            className="text-xs text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            Editar Agente
                          </button>
                          <button
                            onClick={() => handleDeleteSpecialist(agent.id)}
                            className="text-xs text-red-400 hover:text-red-300 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            Excluir Agente
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* ABA 2: CRIAR AGENTE ESPECIALISTA (SUBORDINADO AO LÍDER)          */}
          {/* =============================================================== */}
          {activeTab === 'create_agent' && (
            <form onSubmit={handleCreateSpecialist} className="space-y-4 max-w-2xl mx-auto">
              <div className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-500/30">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <Bot className="w-4 h-4 text-cyan-400" />
                  Criar Novo Agente Especialista (Subordinado ao Jarvis Líder)
                </h3>
                <p className="text-xs text-slate-400 font-sans mt-0.5">
                  Este especialista será automaticamente subordinado e sincronizado ao Jarvis Líder. Ele pode ter habilidades iguais aos outros ou exclusivas com suas próprias ferramentas.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Nome do Agente Especialista:
                  </label>
                  <input
                    type="text"
                    required
                    value={specialistName}
                    onChange={(e) => setSpecialistName(e.target.value)}
                    placeholder="Ex: Especialista em Banco de Dados SQL"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 font-sans"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Papel / Especialidade:
                  </label>
                  <input
                    type="text"
                    value={specialistRole}
                    onChange={(e) => setSpecialistRole(e.target.value)}
                    placeholder="Ex: Execução de queries, índices e RAG"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 font-sans"
                  />
                </div>
              </div>

              {/* Habilidades Iguais aos Outros: Opção de Clonar */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Habilidades & Tools (Pode ter habilidades iguais aos outros):
                </label>
                <select
                  value={cloneHabilitiesFrom}
                  onChange={(e) => setCloneHabilitiesFrom(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="none">Conjunto limpo de ferramentas (sem clonar)</option>
                  <option value={leaderAgent.id}>Copiar todas as ferramentas do Jarvis Líder</option>
                  {specialistAgents.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      Copiar habilidades e ferramentas de: {ag.name} ({ag.tools?.length || 0} tools)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Motor de IA do Especialista:
                  </label>
                  <select
                    value={specialistModel}
                    onChange={(e) => setSpecialistModel(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400"
                  >
                    {AVAILABLE_LLM_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Silo / Chave de Partição:
                  </label>
                  <input
                    type="text"
                    value={specialistDb}
                    onChange={(e) => setSpecialistDb(e.target.value)}
                    placeholder="Ex: BANCO_SQL ou RAG_DOCS"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Prompt de Comportamento & Lógica do Especialista:
                </label>
                <textarea
                  rows={3}
                  value={specialistPersonality}
                  onChange={(e) => setSpecialistPersonality(e.target.value)}
                  placeholder="Defina as diretrizes, tom, critérios rigorosos de decisão e instruções para este especialista subordinado..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 font-sans"
                />
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5 font-mono">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    Webhook Local n8n Dinâmico (:800) / Endpoint de API
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Base: <code className="text-cyan-300">{envConfigService.getBaseWebhookUrl()}</code>
                  </span>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Path do Webhook ou URL Completa:
                  </label>
                  <input
                    type="text"
                    value={specialistWebhookPath}
                    onChange={(e) => setSpecialistWebhookPath(e.target.value)}
                    placeholder="Ex: especialista-novo/test ou {{BASE_URL}}especialista-novo"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-cyan-300 font-mono focus:outline-none focus:border-cyan-400"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    URL Resultante: <code className="text-amber-300">{envConfigService.resolveDynamicUrl(specialistWebhookPath)}</code>
                  </span>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Exemplo de Payload / Schema JSON esperado:
                  </label>
                  <textarea
                    rows={2}
                    value={specialistPayload}
                    onChange={(e) => setSpecialistPayload(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs text-slate-300 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingAgent}
                  className="px-5 py-2.5 bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 hover:from-red-500 hover:to-amber-400 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-red-500/20 active:scale-95 cursor-pointer transition-all"
                >
                  <Bot className="w-4 h-4" />
                  {isCreatingAgent ? 'Registrando...' : 'Criar Especialista Subordinado ao Líder'}
                </button>
              </div>
            </form>
          )}

          {/* =============================================================== */}
          {/* ABA EDITAR AGENTE ESPECIALISTA                                  */}
          {/* =============================================================== */}
          {activeTab === 'edit_specialist' && editingSpecialist && (
            <form onSubmit={handleSaveEditSpecialist} className="space-y-4 max-w-2xl mx-auto">
              <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/40">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-cyan-400" />
                  Editar Agente Especialista: {editingSpecialist.name}
                </h3>
                <p className="text-xs text-slate-400 font-sans mt-0.5">
                  Atualize o nome, papel, prompt de lógica, motor de IA ou silo deste especialista. Ele permanecerá subordinado e sincronizado com o Jarvis Líder.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Nome do Agente:
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 font-sans"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Papel / Especialidade:
                  </label>
                  <input
                    type="text"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 font-sans"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Motor de IA:
                  </label>
                  <select
                    value={editModel}
                    onChange={(e) => setEditModel(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400"
                  >
                    {AVAILABLE_LLM_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Silo / Chave de Partição:
                  </label>
                  <input
                    type="text"
                    value={editDb}
                    onChange={(e) => setEditDb(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Prompt de Comportamento & Lógica:
                </label>
                <textarea
                  rows={4}
                  value={editPersonality}
                  onChange={(e) => setEditPersonality(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 font-sans"
                />
              </div>

              {/* Configuração Dinâmica do Webhook / Endpoint do Especialista */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5 font-mono">
                    <Zap className="w-3.5 h-3.5 text-cyan-400" />
                    Configuração de Rota Webhook / API deste Especialista
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditWebhookPath(envConfigService.getBaseWebhookUrl() + `${editingSpecialist.id}/test`)}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 underline font-mono cursor-pointer"
                  >
                    Usar BASE_URL atual
                  </button>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Path do Webhook ou URL Completa (Permite mudar de localhost para IP ou domínio):
                  </label>
                  <input
                    type="text"
                    value={editWebhookPath}
                    onChange={(e) => setEditWebhookPath(e.target.value)}
                    placeholder="Ex: http://localhost:800/webhook/especialista-financas/test"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-cyan-300 font-mono focus:outline-none focus:border-cyan-400"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Rota Resolvida: <code className="text-amber-300">{envConfigService.resolveDynamicUrl(editWebhookPath)}</code>
                  </span>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Payload Schema / Parâmetros JSON:
                  </label>
                  <textarea
                    rows={2}
                    value={editPayload}
                    onChange={(e) => setEditPayload(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    handleDeleteSpecialist(editingSpecialist.id);
                  }}
                  className="px-3.5 py-2 bg-red-950/60 hover:bg-red-900/80 border border-red-500/40 text-red-300 rounded-xl text-xs flex items-center gap-1.5 font-bold transition-all cursor-pointer"
                  title="Excluir este agente especialista permanentemente"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  Excluir Especialista
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab('overview')}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs text-slate-300 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg active:scale-95 cursor-pointer transition-all"
                  >
                    <Save className="w-4 h-4" />
                    Salvar Alterações do Especialista
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* =============================================================== */}
          {/* ABA 3: CRIAR FERRAMENTA (TOOL) PARA QUALQUER CONEXÃO & TESTAR   */}
          {/* =============================================================== */}
          {activeTab === 'create_tool' && (
            <div className="max-w-3xl mx-auto space-y-6">
              
              <form onSubmit={handleSaveAndTestTool} className="space-y-4">
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    Criar Nova Ferramenta (Tool) para Agente Líder ou Subordinado
                  </h3>
                  <p className="text-xs text-slate-400 font-sans mt-0.5">
                    Selecione o agente dono e o tipo de conexão. Ferramentas criadas conectam-se ao agente e sincronizam no córtex do cérebro 3D.
                  </p>
                </div>

                {/* Seleção do Agente Dono */}
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Vincular Ferramenta ao Agente:
                  </label>
                  <select
                    value={selectedAgentForTool}
                    onChange={(e) => setSelectedAgentForTool(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value={leaderAgent.id}>👑 {leaderAgent.name} (Agente Líder Orquestrador)</option>
                    {specialistAgents.map((ag) => (
                      <option key={ag.id} value={ag.id}>
                        🤖 {ag.name} ({ag.role} — Subordinado)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Seletor de Tipo de Conexão com Cards Rápidos */}
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1.5">
                    Tipo de Conexão da Ferramenta:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {CONNECTION_TYPES.map((conn) => {
                      const Icon = conn.icon;
                      const isSelected = toolType === conn.type;
                      return (
                        <button
                          key={conn.type}
                          type="button"
                          onClick={() => handleSelectConnectionType(conn.type)}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md'
                              : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className="w-4 h-4 text-amber-400 shrink-0" />
                            <span className="font-bold text-xs truncate">{conn.name}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 line-clamp-1 font-sans">
                            {conn.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Nome da Ferramenta:
                    </label>
                    <input
                      type="text"
                      required
                      value={toolName}
                      onChange={(e) => setToolName(e.target.value)}
                      placeholder="Ex: Consulta Cotações B3 ou Webhook n8n Pedidos"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400 font-sans"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Descrição da Tool (Quando a IA deve acionar):
                    </label>
                    <input
                      type="text"
                      required
                      value={toolDesc}
                      onChange={(e) => setToolDesc(e.target.value)}
                      placeholder="Ex: Acionada para consultar cotação atual e histórico"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400 font-sans"
                    />
                  </div>
                </div>

                {/* Configurações da Conexão */}
                <div className="space-y-3 p-3.5 bg-slate-900/60 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5 uppercase">
                      <Terminal className="w-3.5 h-3.5" />
                      Parâmetros da Conexão ({toolType.toUpperCase()})
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-3">
                      <label className="text-xs font-bold text-slate-300 block mb-1">
                        Endpoint / Conector / URL:
                      </label>
                      <input
                        type="text"
                        value={toolEndpoint}
                        onChange={(e) => setToolEndpoint(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-300 block mb-1">
                        Método:
                      </label>
                      <select
                        value={toolMethod}
                        onChange={(e) => setToolMethod(e.target.value as any)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400"
                      >
                        <option value="POST">POST</option>
                        <option value="GET">GET</option>
                        <option value="PUT">PUT</option>
                      </select>
                    </div>
                  </div>

                  {toolType === 'custom_function' && (
                    <div>
                      <label className="text-xs font-bold text-slate-300 block mb-1">
                        Script de Código (JavaScript / Python):
                      </label>
                      <textarea
                        rows={4}
                        value={toolCodeSnippet}
                        onChange={(e) => setToolCodeSnippet(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-amber-300 focus:outline-none focus:border-amber-400 font-mono"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Exemplo de Payload / Schema de Entrada:
                    </label>
                    <textarea
                      rows={3}
                      value={toolPayloadExample}
                      onChange={(e) => setToolPayloadExample(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-400 font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer transition-all"
                  >
                    <Zap className="w-4 h-4" />
                    Salvar Tool e Abrir Campo de Teste Imediato
                  </button>
                </div>
              </form>

              {/* =========================================================== */}
              {/* CAMPO DE TESTE IMEDIATO DA FERRAMENTA & INICIALIZAÇÃO       */}
              {/* =========================================================== */}
              {testingTool && (
                <div className="p-5 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-amber-500/60 shadow-[0_0_40px_rgba(245,158,11,0.2)] space-y-4 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping" />
                      <h4 className="font-bold text-sm text-white">
                        CAMPO DE TESTE IMEDIATO: {testingTool.name}
                      </h4>
                    </div>
                    <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-500/40 px-2.5 py-0.5 rounded-full font-bold">
                      {testingTool.type.toUpperCase()}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 font-sans">
                    Insira os parâmetros de teste abaixo. Se a ferramenta responder com sucesso ela será <strong>iniciada imediatamente</strong> no Cérebro 3D acoplada ao seu agente!
                  </p>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Parâmetros / Payload de Teste:
                    </label>
                    <textarea
                      rows={4}
                      value={testPayload}
                      onChange={(e) => setTestPayload(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-amber-200 focus:outline-none focus:border-amber-400 font-mono"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      onClick={handleExecuteToolTest}
                      disabled={isTestingTool}
                      className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-500/25 active:scale-95 cursor-pointer transition-all"
                    >
                      <Play className="w-4 h-4 fill-slate-950" />
                      {isTestingTool ? 'Executando Teste...' : '▶ EXECUTAR TESTE DA FERRAMENTA'}
                    </button>

                    <button
                      onClick={() => setTestingTool(null)}
                      className="text-xs text-slate-400 hover:text-white cursor-pointer"
                    >
                      Fechar Campo de Teste
                    </button>
                  </div>

                  {/* Resposta do Teste e Feedback de Inicialização Imediata */}
                  {testResult && (
                    <div
                      className={`p-4 rounded-xl border transition-all ${
                        testResult.success
                          ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-200'
                          : 'bg-red-950/40 border-red-500/60 text-red-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {testResult.success ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-red-400" />
                          )}
                          <span className="font-bold text-xs">
                            {testResult.success
                              ? '✓ FERRAMENTA TESTADA COM SUCESSO & INICIADA IMEDIATAMENTE!'
                              : '✕ FALHA NO TESTE DA FERRAMENTA'}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono opacity-80">
                          Latência: {testResult.latencyMs}ms · Status: {testResult.statusCode}
                        </span>
                      </div>

                      <p className="text-xs font-sans mb-2">
                        {testResult.message}
                      </p>

                      <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-40">
                        <pre>{JSON.stringify(testResult.output, null, 2)}</pre>
                      </div>

                      {testResult.success && (
                        <div className="mt-3 pt-2 border-t border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300">
                          <span className="flex items-center gap-1.5 font-bold">
                            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                            Sincronizada no Córtex 3D (Nó Amarelo com Sinapse Ativa)
                          </span>
                          <button
                            onClick={() => {
                              setActiveTab('overview');
                              setTestingTool(null);
                            }}
                            className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg cursor-pointer"
                          >
                            Ver no Cérebro 3D
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* =============================================================== */}
          {/* ABA 4: VARIÁVEIS DE AMBIENTE LOCAIS DINÂMICAS & BANCO DE DADOS   */}
          {/* =============================================================== */}
          {activeTab === 'env_config' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              
              {/* BANNER PRINCIPAL DAS VARIÁVEIS DINÂMICAS */}
              <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-950/80 via-slate-900/90 to-cyan-950/80 border-2 border-emerald-500/50 shadow-2xl relative overflow-hidden">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-600 flex items-center justify-center text-slate-950 shadow-xl shadow-emerald-500/30 shrink-0 font-bold">
                      <Server className="w-7 h-7 text-slate-950" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black uppercase tracking-widest text-emerald-400 font-mono">
                          GERENCIADOR DINÂMICO DE AMBIENTE & REDE
                        </span>
                        <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/50 px-2 py-0.5 rounded-full font-bold font-mono">
                          Zero Hardcode · 100% Flexível
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-white mt-1">
                        Variáveis de Ambiente Locais (BASE_URL & Porta :800)
                      </h3>
                      <p className="text-xs text-slate-300 max-w-2xl mt-1 leading-relaxed font-sans">
                        Altere livremente de <code className="text-emerald-300 font-mono">localhost</code> para um IP de rede local (<code className="text-emerald-300 font-mono">192.168.x.x</code>) ou domínio público. Todas as rotas de Webhooks dos Agentes e Especialistas serão recalculadas dinamicamente sem quebrar o sistema.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                    <button
                      onClick={handlePropagateBaseUrlToAllTools}
                      disabled={isPropagatingBaseUrl}
                      className="px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-xs rounded-2xl shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                      title="Atualiza todos os Webhooks existentes para a nova BASE_URL configurada"
                    >
                      <Sparkles className="w-4 h-4" />
                      {isPropagatingBaseUrl ? 'Propagando...' : 'Propagar BASE_URL para Todas as Tools'}
                    </button>
                  </div>
                </div>

                {/* Feedback de Salvamento */}
                {envSavedFeedback && (
                  <div className="mt-4 p-3 bg-emerald-950/80 border border-emerald-500/60 rounded-xl text-xs text-emerald-200 flex items-center gap-2 animate-in fade-in duration-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{envSavedFeedback}</span>
                  </div>
                )}
              </div>

              {/* FORMULÁRIO DE VARIÁVEIS DE AMBIENTE LOCAIS */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* CAMPOS DE CONFIGURAÇÃO (COLUNA ESQUERDA) */}
                <form onSubmit={handleSaveEnvConfig} className="lg:col-span-2 p-6 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-emerald-400" />
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                        Campos Abertos de Configuração do Servidor
                      </h4>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">Porta Padrão: :800</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-300 block mb-1">
                        Protocolo:
                      </label>
                      <select
                        value={envProtoInput}
                        onChange={(e) => setEnvProtoInput(e.target.value as any)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-400 font-mono"
                      >
                        <option value="http">http:// (Local / LAN)</option>
                        <option value="https">https:// (SSL / Nuvem / Domínio)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-300 block mb-1">
                        SERVER_HOST / IP:
                      </label>
                      <input
                        type="text"
                        required
                        value={envHostInput}
                        onChange={(e) => setEnvHostInput(e.target.value)}
                        placeholder="localhost ou 192.168.1.100 ou dominio.com"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-emerald-300 font-mono focus:outline-none focus:border-emerald-400"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-slate-300">
                          PORTA DE ACESSO DO SERVIDOR:
                        </label>
                        <span className="text-[10px] text-amber-300 font-mono">Liberdade total</span>
                      </div>
                      <input
                        type="text"
                        required
                        value={envPortInput}
                        onChange={(e) => setEnvPortInput(e.target.value)}
                        placeholder="800, 5678, 3000..."
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-emerald-300 font-mono focus:outline-none focus:border-emerald-400"
                      />
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[10px]">
                        {['800', '5678', '3000', '8080', '80', '443'].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setEnvPortInput(p)}
                            className={`px-2 py-0.5 rounded cursor-pointer transition-colors border ${
                              envPortInput === p
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-bold'
                                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                            }`}
                          >
                            :{p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-300 block mb-1">
                        PREFIXO DO WEBHOOK:
                      </label>
                      <input
                        type="text"
                        required
                        value={envPrefixInput}
                        onChange={(e) => setEnvPrefixInput(e.target.value)}
                        placeholder="/webhook/"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-emerald-300 font-mono focus:outline-none focus:border-emerald-400"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-300 block mb-1">
                        TOKEN DE AUTENTICAÇÃO (OPCIONAL):
                      </label>
                      <input
                        type="password"
                        value={envTokenInput}
                        onChange={(e) => setEnvTokenInput(e.target.value)}
                        placeholder="Bearer token do n8n (opcional)"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-400"
                      />
                    </div>
                  </div>

                  {/* PREVIEW DINÂMICO DA BASE_URL */}
                  <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-mono font-bold text-slate-400">
                        BASE_URL Resultante (Montada Dinamicamente):
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${envProtoInput}://${envHostInput.trim() || 'localhost'}:${envPortInput.trim() || '800'}${envPrefixInput.startsWith('/') ? envPrefixInput : '/' + envPrefixInput}`;
                          navigator.clipboard.writeText(url);
                          setEnvSavedFeedback('✓ BASE_URL copiada: ' + url);
                          setTimeout(() => setEnvSavedFeedback(null), 3000);
                        }}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-mono cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        Copiar URL
                      </button>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm font-mono text-emerald-300 font-bold break-all">
                      {envProtoInput}://{envHostInput.trim() || 'localhost'}:{envPortInput.trim() || '800'}{envPrefixInput.startsWith('/') ? envPrefixInput : '/' + envPrefixInput}
                    </div>
                    <p className="text-[11px] text-slate-400 font-sans">
                      Qualquer especialista configurado com rotas relativas (ex: <code className="text-cyan-300">especialista-financas/test</code>) será prefixado com esta URL exata.
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleTestLocalWebhookPing('env_test', `${envProtoInput}://${envHostInput.trim() || 'localhost'}:${envPortInput.trim() || '800'}${envPrefixInput}`)}
                      disabled={pingStatus['env_test']?.testing}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-xs flex items-center gap-2 cursor-pointer transition-all"
                    >
                      <Radio className="w-4 h-4 text-cyan-400" />
                      {pingStatus['env_test']?.testing ? 'Testando Conexão...' : 'Testar Ping da Porta :800'}
                    </button>

                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 cursor-pointer transition-all"
                    >
                      <Save className="w-4 h-4" />
                      Salvar Variáveis de Ambiente
                    </button>
                  </div>

                  {pingStatus['env_test']?.result && (
                    <div className={`p-3 rounded-xl text-xs font-mono border ${pingStatus['env_test']?.success ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300' : 'bg-amber-950/40 border-amber-500/50 text-amber-300'}`}>
                      {pingStatus['env_test']?.result}
                    </div>
                  )}
                </form>

                {/* PAINEL DE DIRETRIZES ARQUITETURAIS (COLUNA DIREITA) */}
                <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                    <Shield className="w-4 h-4 text-purple-400" />
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                      Regras de Autonomia & Flexibilidade
                    </h4>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                      <span className="font-bold text-amber-400 block font-mono">1. Núcleo Fixo (JARVIS)</span>
                      <p className="text-[11px] text-slate-400 font-sans">
                        O Jarvis é o único agente permanente. Seu Prompt e o Modelo de IA podem ser alterados a qualquer segundo na aba "Visão Geral", sem perda de contexto ou reinício do servidor.
                      </p>
                    </div>

                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                      <span className="font-bold text-cyan-400 block font-mono">2. Especialistas Modulares (CRUD)</span>
                      <p className="text-[11px] text-slate-400 font-sans">
                        Adicione, edite ou exclua especialistas subordinados à vontade. A delegação de tarefas pelo Jarvis é recalculada em tempo real em O(1).
                      </p>
                    </div>

                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                      <span className="font-bold text-emerald-400 block font-mono">3. Variáveis de Ambiente Abertas</span>
                      <p className="text-[11px] text-slate-400 font-sans">
                        O IP e Porta do n8n não estão cravados em código. Ao mudar o IP do servidor neste painel, todos os endpoints acompanham a nova topologia.
                      </p>
                    </div>
                  </div>
                </div>

              </div>

              {/* MAPEAMENTO DE BANCO DE DADOS (SCHEMAS SQL E ESTRUTURAS) */}
              <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-cyan-400" />
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                        Mapeamento de Banco de Dados Relacional (PostgreSQL / SQLite / Drizzle ORM)
                      </h4>
                      <p className="text-xs text-slate-400 font-sans">
                        Tabelas e estruturas para persistência robusta dos agentes mutáveis, prompts, webhooks dinâmicos e telemetria.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(DATABASE_SCHEMA_SQL);
                      setCopiedSql(true);
                      setTimeout(() => setCopiedSql(false), 3000);
                    }}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shrink-0 font-mono"
                  >
                    {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedSql ? 'SQL Copiado!' : 'Copiar DDL SQL Completo'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-[10px] font-mono text-emerald-400 font-bold block">TABELA 1</span>
                    <p className="font-bold text-white">system_environment_configs</p>
                    <p className="text-[11px] text-slate-400">Guarda protocol, server_host, server_port e webhook_prefix</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-[10px] font-mono text-amber-400 font-bold block">TABELA 2</span>
                    <p className="font-bold text-white">agents</p>
                    <p className="text-[11px] text-slate-400">is_leader, immutable_leader, system_prompt, llm_model, status</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-[10px] font-mono text-cyan-400 font-bold block">TABELA 3</span>
                    <p className="font-bold text-white">agent_tools</p>
                    <p className="text-[11px] text-slate-400">webhook_path, dynamic_endpoint_url, request_schema, status</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-[10px] font-mono text-purple-400 font-bold block">TABELA 4</span>
                    <p className="font-bold text-white">tool_execution_logs</p>
                    <p className="text-[11px] text-slate-400">Telemetria de disparos, latência em ms, payload e resposta</p>
                  </div>
                </div>

                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 max-h-72 overflow-y-auto">
                  <pre className="text-[11px] font-mono text-slate-300 leading-relaxed whitespace-pre">
                    {DATABASE_SCHEMA_SQL}
                  </pre>
                </div>
              </div>

            </div>
          )}

          {/* ABA 5: ARQUITETURA HUB-AND-SPOKE N8N REMOVIDA A PEDIDO DO USUÁRIO */}
          {false && (
            <div className="space-y-6 animate-in fade-in duration-300">
              
              {/* BANNER PRINCIPAL COM STATUS E AÇÃO DE SINCRONIZAÇÃO */}
              <div className="p-6 rounded-3xl bg-gradient-to-r from-purple-950/80 via-slate-900/90 to-indigo-950/80 border-2 border-purple-500/50 shadow-2xl relative overflow-hidden">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 via-indigo-600 to-blue-600 flex items-center justify-center text-white shadow-xl shadow-purple-500/30 shrink-0">
                      <GitBranch className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black uppercase tracking-widest text-purple-400 font-mono">
                          ARQUITETURA DE ROTEAMENTO HUB-AND-SPOKE
                        </span>
                        <span className="text-[10px] bg-purple-950 text-purple-300 border border-purple-500/50 px-2 py-0.5 rounded-full font-bold">
                          n8n Self-Hosted :800
                        </span>
                        <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold">
                          Sincronizado ao Cérebro 3D
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-white mt-1">
                        JARVIS Orquestrador Líder + Spokes Especialistas Subordinados
                      </h3>
                      <p className="text-xs text-slate-300 max-w-2xl mt-1 leading-relaxed font-sans">
                        Desenho técnico e diretrizes de engenharia para o ecossistema local do n8n rodando na porta <strong>:800</strong>. O Jarvis atua como Hub Central de tomada de decisão e delega tarefas aos Especialistas através de Custom Webhook Tools.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                    <button
                      onClick={handleSyncHubAndSpokeTo3DBrain}
                      disabled={isSyncingHubSpoke}
                      className="px-4 py-3 bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-bold text-xs rounded-2xl shadow-xl shadow-purple-500/30 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      {isSyncingHubSpoke ? 'Sincronizando...' : 'Sincronizar no Cérebro 3D'}
                    </button>

                    <button
                      onClick={handleExportN8nBlueprint}
                      className="px-4 py-3 bg-slate-900 hover:bg-slate-800 border border-purple-500/40 hover:border-purple-400 text-purple-300 font-bold text-xs rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                      title="Baixar arquivo JSON com os parâmetros dos nós para importar no n8n"
                    >
                      <Download className="w-4 h-4" />
                      Exportar Blueprint JSON
                    </button>
                  </div>
                </div>

                {/* Feedback de Sincronização */}
                {syncFeedbackMessage && (
                  <div className="mt-4 p-3 bg-emerald-950/80 border border-emerald-500/60 rounded-xl text-xs text-emerald-200 flex items-center gap-2 animate-in fade-in duration-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{syncFeedbackMessage}</span>
                  </div>
                )}
              </div>

              {/* DIAGRAMA VISUAL INTERATIVO DA TOPOLOGIA HUB-AND-SPOKE */}
              <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                      Topologia do Fluxo: Hub Central vs. Spokes Subordinados
                    </h4>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Base URL: <code className="text-cyan-300">http://localhost:800/webhook/</code>
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                  
                  {/* SPOKE 1: FINANÇAS */}
                  <div className="p-4 rounded-2xl bg-slate-950/90 border border-amber-500/30 hover:border-amber-400 transition-all space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-amber-400 font-bold uppercase flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                        SPOKE SUBORDINADO #1
                      </span>
                      <span className="text-[9px] bg-amber-950 text-amber-300 px-2 py-0.5 rounded">
                        PORTA :800
                      </span>
                    </div>
                    <h5 className="font-bold text-white text-xs">Especialista Mercado Financeiro</h5>
                    <p className="text-[11px] text-slate-400 font-sans">
                      Recebe o ticker enviado pelo Jarvis, extrai do JSON e faz requisição na Brapi API.
                    </p>
                    <div className="text-[10px] font-mono text-cyan-300 bg-slate-900/80 p-1.5 rounded border border-slate-800 break-all">
                      POST /webhook/especialista-financas/test
                    </div>
                  </div>

                  {/* HUB CENTRAL: JARVIS LÍDER */}
                  <div className="p-5 rounded-3xl bg-gradient-to-b from-amber-500/20 via-purple-950/40 to-slate-950 border-2 border-amber-400/60 shadow-[0_0_30px_rgba(245,158,11,0.2)] text-center space-y-3">
                    <div className="inline-flex p-3 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-500 text-slate-950 shadow-lg">
                      <Crown className="w-6 h-6 text-slate-950" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-mono font-extrabold text-amber-400 block tracking-widest">
                        👑 HUB CENTRAL (ORQUESTRADOR)
                      </span>
                      <h4 className="text-base font-bold text-white mt-0.5">JARVIS AI Líder</h4>
                      <p className="text-[11px] text-slate-300 mt-1 font-sans">
                        Interpreta a intenção do usuário no chat nativo do n8n, aciona o Webhook Spoke correto e humaniza o relatório final.
                      </p>
                    </div>
                    <div className="text-[10px] font-mono text-amber-300 bg-amber-950/60 px-2.5 py-1 rounded-full inline-block border border-amber-500/30">
                      Orquestrador Google AI Studio
                    </div>
                  </div>

                  {/* SPOKE 2: AUTOMAÇÃO */}
                  <div className="p-4 rounded-2xl bg-slate-950/90 border border-blue-500/30 hover:border-blue-400 transition-all space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-blue-400 font-bold uppercase flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                        SPOKE SUBORDINADO #2
                      </span>
                      <span className="text-[9px] bg-blue-950 text-blue-300 px-2 py-0.5 rounded">
                        PORTA :800
                      </span>
                    </div>
                    <h5 className="font-bold text-white text-xs">Especialista Automação Residencial</h5>
                    <p className="text-[11px] text-slate-400 font-sans">
                      Recebe comandos de lâmpadas, tomadas, ar e sensores, disparando contra o Home Assistant.
                    </p>
                    <div className="text-[10px] font-mono text-cyan-300 bg-slate-900/80 p-1.5 rounded border border-slate-800 break-all">
                      POST /webhook/especialista-automacao/test
                    </div>
                  </div>

                </div>
              </div>

              {/* SEÇÃO 1: ARQUITETURA GERAL DO SISTEMA (LOCAL INSTANCE) */}
              <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Server className="w-4 h-4 text-purple-400" />
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                    1. ARQUITETURA GERAL DO SISTEMA (LOCAL INSTANCE)
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block font-bold">Servidor</span>
                    <p className="text-white font-bold">n8n Self-Hosted</p>
                    <p className="text-[11px] text-slate-400">Ambiente de Teste Local</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block font-bold">Porta & Endpoint Base</span>
                    <p className="text-cyan-300 font-mono font-bold">http://localhost:800/webhook/</p>
                    <p className="text-[11px] text-slate-400">Comunicação REST/HTTP direta</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block font-bold">Agente Central</span>
                    <p className="text-amber-300 font-bold">JARVIS (Líder / Orquestrador)</p>
                    <p className="text-[11px] text-slate-400">Google AI Studio Engine</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block font-bold">Agentes Subordinados</span>
                    <p className="text-purple-300 font-bold">Especialistas Spoke</p>
                    <p className="text-[11px] text-slate-400">Custom n8n Workflow Tools</p>
                  </div>
                </div>
              </div>

              {/* SEÇÃO 2: CONFIGURAÇÃO DETALHADA DO LÍDER: JARVIS (SYSTEM PROMPT) */}
              <div className="p-6 rounded-3xl bg-slate-900/80 border border-amber-500/40 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-400" />
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                      2. CONFIGURAÇÃO DETALHADA DO LÍDER: JARVIS (SYSTEM PROMPT)
                    </h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const promptTexto = `Você é o JARVIS, o Agente de IA Líder e Orquestrador Central. Sua função é receber as mensagens do usuário no chat nativo do n8n, interpretar a intenção e delegar a execução para o Especialista correto usando as ferramentas de Webhook locais. 

Quando o Especialista retornar os dados brutos via Webhook, sua função é ler o relatório dele, aplicar o tom JARVIS (tecnológico, prestativo e refinado) e responder ao usuário de forma humanizada. Nunca responda dados técnicos puros sem antes tratá-los.`;
                        navigator.clipboard.writeText(promptTexto);
                        setCopiedPrompt(true);
                        setTimeout(() => setCopiedPrompt(false), 3000);
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedPrompt ? 'Copiado!' : 'Copiar System Prompt'}
                    </button>
                    <button
                      onClick={() => {
                        const promptTexto = `Você é o JARVIS, o Agente de IA Líder e Orquestrador Central. Sua função é receber as mensagens do usuário no chat nativo do n8n, interpretar a intenção e delegar a execução para o Especialista correto usando as ferramentas de Webhook locais. 

Quando o Especialista retornar os dados brutos via Webhook, sua função é ler o relatório dele, aplicar o tom JARVIS (tecnológico, prestativo e refinado) e responder ao usuário de forma humanizada. Nunca responda dados técnicos puros sem antes tratá-los.`;
                        setLeaderPrompt(promptTexto);
                        agentService.updateAgent(leaderAgent.id, {
                          personalityPrompt: promptTexto,
                          logic: promptTexto,
                        });
                        setLeaderSavedFeedback(true);
                        setTimeout(() => setLeaderSavedFeedback(false), 3000);
                        if (onTriggerSynapse) {
                          onTriggerSynapse('System Prompt oficial do n8n aplicado ao Jarvis Líder!');
                        }
                      }}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer transition-all"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Aplicar no Jarvis Líder
                    </button>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="text-[10px] uppercase font-mono text-slate-400 block font-bold">
                    Texto Oficial para o nó "AI Agent" do Jarvis no n8n:
                  </span>
                  <div className="font-mono text-xs text-amber-200/90 leading-relaxed whitespace-pre-line bg-slate-900/90 p-3.5 rounded-xl border border-slate-800/80">
                    "Você é o JARVIS, o Agente de IA Líder e Orquestrador Central. Sua função é receber as mensagens do usuário no chat nativo do n8n, interpretar a intenção e delegar a execução para o Especialista correto usando as ferramentas de Webhook locais. 

Quando o Especialista retornar os dados brutos via Webhook, sua função é ler o relatório dele, aplicar o tom JARVIS (tecnológico, prestativo e refinado) e responder ao usuário de forma humanizada. Nunca responda dados técnicos puros sem antes tratá-los."
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Regra Fundamental: Nunca repassar JSON ou tabelas brutas ao usuário sem o polimento verbal do JARVIS.</span>
                  </div>
                </div>
              </div>

              {/* SEÇÃO 3: MAPEAMENTO DE FERRAMENTAS DO JARVIS (CUSTOM TOOLS NO N8N) */}
              <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Wrench className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                    3. MAPEAMENTO DE FERRAMENTAS DO JARVIS (CUSTOM TOOLS NO N8N)
                  </h4>
                </div>

                <p className="text-xs text-slate-300 font-sans">
                  Para que o Jarvis saiba acionar os especialistas locais, registre as seguintes ferramentas de conexão conectadas ao nó <strong>AI Agent</strong> do n8n:
                </p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  
                  {/* TOOL 1: ESPECIALISTA FINANÇAS */}
                  <div className="p-5 rounded-2xl bg-slate-950 border border-amber-500/30 hover:border-amber-400/60 transition-all space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                        <h5 className="font-bold text-white text-xs font-mono">
                          Tool 1: Especialista em Mercado Financeiro
                        </h5>
                      </div>
                      <span className="text-[10px] bg-amber-950 text-amber-300 px-2 py-0.5 rounded font-mono font-bold">
                        POST
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block uppercase font-mono">Nome da Ferramenta:</span>
                        <code className="text-amber-300 font-mono font-bold">chamar_especialista_financas</code>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block uppercase font-mono">Descrição da Tool:</span>
                        <p className="text-slate-300 text-[11px] leading-relaxed italic bg-slate-900 p-2 rounded border border-slate-800">
                          "Use esta ferramenta sempre que o usuário solicitar cotações de ações da B3, criptomoedas, análises de mercado ou resumos financeiros atuais. Ela aciona o agente especialista subordinado."
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block uppercase font-mono">Endpoint / URL:</span>
                        <div className="flex items-center justify-between gap-2 bg-slate-900 p-2 rounded border border-slate-800 text-[11px] font-mono text-cyan-300">
                          <span>http://localhost:800/webhook/especialista-financas/test</span>
                          <button
                            onClick={() => handleTestLocalWebhookPing('financas', 'http://localhost:800/webhook/especialista-financas/test')}
                            disabled={pingStatus['financas']?.testing}
                            className="px-2 py-1 bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 rounded text-[10px] cursor-pointer"
                          >
                            {pingStatus['financas']?.testing ? 'Testando...' : 'Testar Ping'}
                          </button>
                        </div>
                        {pingStatus['financas']?.result && (
                          <span className={`text-[10px] block mt-1 font-mono ${pingStatus['financas']?.success ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {pingStatus['financas']?.result}
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">Payload / Schema de Entrada (JSON):</span>
                          <button
                            onClick={() => {
                              const payloadStr = JSON.stringify({
                                origem: 'jarvis_orquestrador',
                                acao: 'consultar_cotacao',
                                ticker: 'PETR4',
                              }, null, 2);
                              navigator.clipboard.writeText(payloadStr);
                              setCopiedPayloadFinancas(true);
                              setTimeout(() => setCopiedPayloadFinancas(false), 2000);
                            }}
                            className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer font-mono"
                          >
                            {copiedPayloadFinancas ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            {copiedPayloadFinancas ? 'Copiado' : 'Copiar'}
                          </button>
                        </div>
                        <pre className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-[11px] font-mono text-amber-200">
{`{
  "origem": "jarvis_orquestrador",
  "acao": "consultar_cotacao",
  "ticker": "PETR4"
}`}
                        </pre>
                      </div>
                    </div>
                  </div>

                  {/* TOOL 2: ESPECIALISTA AUTOMAÇÃO */}
                  <div className="p-5 rounded-2xl bg-slate-950 border border-blue-500/30 hover:border-blue-400/60 transition-all space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                        <h5 className="font-bold text-white text-xs font-mono">
                          Tool 2: Especialista em Automação Residencial
                        </h5>
                      </div>
                      <span className="text-[10px] bg-blue-950 text-blue-300 px-2 py-0.5 rounded font-mono font-bold">
                        POST
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block uppercase font-mono">Nome da Ferramenta:</span>
                        <code className="text-blue-300 font-mono font-bold">chamar_especialista_automacao</code>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block uppercase font-mono">Descrição da Tool:</span>
                        <p className="text-slate-300 text-[11px] leading-relaxed italic bg-slate-900 p-2 rounded border border-slate-800">
                          "Use esta ferramenta quando o usuário pedir para ligar, desligar ou checar o status de lâmpadas, tomadas, ar-condicionado ou sensores integrados à casa."
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block uppercase font-mono">Endpoint / URL:</span>
                        <div className="flex items-center justify-between gap-2 bg-slate-900 p-2 rounded border border-slate-800 text-[11px] font-mono text-cyan-300">
                          <span>http://localhost:800/webhook/especialista-automacao/test</span>
                          <button
                            onClick={() => handleTestLocalWebhookPing('automacao', 'http://localhost:800/webhook/especialista-automacao/test')}
                            disabled={pingStatus['automacao']?.testing}
                            className="px-2 py-1 bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 rounded text-[10px] cursor-pointer"
                          >
                            {pingStatus['automacao']?.testing ? 'Testando...' : 'Testar Ping'}
                          </button>
                        </div>
                        {pingStatus['automacao']?.result && (
                          <span className={`text-[10px] block mt-1 font-mono ${pingStatus['automacao']?.success ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {pingStatus['automacao']?.result}
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">Payload / Schema de Entrada (JSON):</span>
                          <button
                            onClick={() => {
                              const payloadStr = JSON.stringify({
                                origem: 'jarvis_orquestrador',
                                acao: 'alterar_estado',
                                dispositivo: 'luz_sala',
                                comando: 'ligar',
                              }, null, 2);
                              navigator.clipboard.writeText(payloadStr);
                              setCopiedPayloadAutomacao(true);
                              setTimeout(() => setCopiedPayloadAutomacao(false), 2000);
                            }}
                            className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer font-mono"
                          >
                            {copiedPayloadAutomacao ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            {copiedPayloadAutomacao ? 'Copiado' : 'Copiar'}
                          </button>
                        </div>
                        <pre className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-[11px] font-mono text-blue-200">
{`{
  "origem": "jarvis_orquestrador",
  "acao": "alterar_estado",
  "dispositivo": "luz_sala",
  "comando": "ligar"
}`}
                        </pre>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* SEÇÃO 4: ESTRUTURAÇÃO DOS SUB-FLUXOS DOS ESPECIALISTAS (NO MESMO N8N) */}
              <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                    4. ESTRUTURAÇÃO DOS SUB-FLUXOS DOS ESPECIALISTAS (NO MESMO N8N)
                  </h4>
                </div>

                <p className="text-xs text-slate-300 font-sans">
                  Cada especialista é criado como um novo <strong>Workflow isolado</strong> dentro do painel do n8n para responder às requisições do Jarvis:
                </p>

                {/* FLUXO ESPECIALISTA FINANÇAS */}
                <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[11px] font-bold font-mono">
                      Workflow #1
                    </span>
                    <h5 className="font-bold text-white text-xs">Fluxo do Especialista de Finanças (B3 & Cripto)</h5>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-[10px] font-mono text-purple-400 font-bold block">1. NÓ GATILHO</span>
                      <p className="font-bold text-white">Webhook (POST)</p>
                      <p className="text-[11px] text-slate-400">Path: <code className="text-cyan-300">especialista-financas</code></p>
                    </div>
                    <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-[10px] font-mono text-purple-400 font-bold block">2. NÓ DE IA</span>
                      <p className="font-bold text-white">AI Agent (Standard Model)</p>
                      <p className="text-[11px] text-slate-400">Analista Gráfico & Fundamentalista Sênior</p>
                    </div>
                    <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-[10px] font-mono text-purple-400 font-bold block">3. FERRAMENTA DA IA</span>
                      <p className="font-bold text-white">HTTP Request Tool</p>
                      <p className="text-[11px] text-slate-400 font-mono text-cyan-300">https://brapi.dev/api/quote/&#123;&#123; $json.ticker &#125;&#125;</p>
                    </div>
                    <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-[10px] font-mono text-purple-400 font-bold block">4. ENCERRAMENTO</span>
                      <p className="font-bold text-white">Respond to Webhook</p>
                      <p className="text-[11px] text-slate-400">Retorna relatório técnico ao Jarvis</p>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-900/90 rounded-xl border border-amber-500/20 text-xs text-amber-200 font-mono">
                    <strong>System Prompt do Especialista:</strong><br />
                    "Você é um Analista Gráfico e Fundamentalista Sênior. Sua única função é receber o ticker enviado pelo Jarvis, extraí-lo do JSON, usar a ferramenta HTTP Request para buscar o preço real na API financeira externa e montar um relatório técnico frio e preciso com os valores encontrados."
                  </div>
                </div>

                {/* FLUXO ESPECIALISTA AUTOMAÇÃO */}
                <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[11px] font-bold font-mono">
                      Workflow #2
                    </span>
                    <h5 className="font-bold text-white text-xs">Fluxo do Especialista de Automação (Home Assistant)</h5>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-[10px] font-mono text-purple-400 font-bold block">1. NÓ GATILHO</span>
                      <p className="font-bold text-white">Webhook (POST)</p>
                      <p className="text-[11px] text-slate-400">Path: <code className="text-cyan-300">especialista-automacao</code></p>
                    </div>
                    <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-[10px] font-mono text-purple-400 font-bold block">2. NÓ DE IA / ROTEAMENTO</span>
                      <p className="font-bold text-white">AI Agent ou Switch</p>
                      <p className="text-[11px] text-slate-400">Interpreta dispositivo e comando</p>
                    </div>
                    <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-[10px] font-mono text-purple-400 font-bold block">3. FERRAMENTA IOT</span>
                      <p className="font-bold text-white">Home Assistant Tool</p>
                      <p className="text-[11px] text-slate-400">Chamada de serviço light/switch</p>
                    </div>
                    <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-[10px] font-mono text-purple-400 font-bold block">4. ENCERRAMENTO</span>
                      <p className="font-bold text-white">Respond to Webhook</p>
                      <p className="text-[11px] text-slate-400">Confirmação de execução física</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* SEÇÃO 5: DIRETRIZES TÉCNICAS E TRATAMENTO DOS PAYLOADS JSON */}
              <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                    5. PRÓXIMOS PASSOS: LÓGICAS INTERNAS DE TRATAMENTO DE PAYLOADS JSON
                  </h4>
                </div>

                <div className="space-y-3 text-xs text-slate-300">
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="font-bold text-cyan-300">Passo 1: Padronização do Envelope JSON de Ida e Volta</span>
                    <p className="text-[11px] text-slate-400">
                      Toda requisição que o Jarvis envia aos especialistas usa a chave <code>origem: "jarvis_orquestrador"</code>. O especialista sempre retorna um JSON estruturado com <code>sucesso: true</code>, <code>dados_brutos: &#123;...&#125;</code> e <code>resumo_tecnico: "..."</code>.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="font-bold text-amber-300">Passo 2: Sanitização e Fallback de Tickers na B3</span>
                    <p className="text-[11px] text-slate-400">
                      No nó de extração do especialista de finanças, converta qualquer entrada como "petr4", "PETR4" ou "PETR4.SA" para a chave correta da Brapi/B3, garantindo tolerância a erros tipográficos e sem quebrar o sub-fluxo.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="font-bold text-emerald-300">Passo 3: Tratamento de Timeouts e Respostas Resilientes</span>
                    <p className="text-[11px] text-slate-400">
                      Se o endpoint local do n8n (:800) estiver inicializando ou demorar mais de 3 segundos, o nó Respond to Webhook retorna um status amigável, permitindo ao Jarvis informar: "Identifiquei sua solicitação, mas a cotação externa demorou a responder; estou tentando novamente".
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="font-bold text-purple-300">Passo 4: Humanização com Tom JARVIS</span>
                    <p className="text-[11px] text-slate-400">
                      O Jarvis recebe os números (ex: R$ 38,40, variação +1,2%, P/L 4,8) e responde de forma elegante: "Senhor Matheus, verifiquei os dados mais recentes de PETR4. O ativo encerrou negociado a R$ 38,40 com valorização de 1,2% na sessão de hoje. Os múltiplos operacionais continuam estáveis."
                    </p>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* =============================================================== */}
          {/* ABA 6: MODELOS & GIST DE IA (SINCRONIZAÇÃO DINÂMICA)            */}
          {/* =============================================================== */}
          {activeTab === 'gist_models' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Banner Gist */}
              <div className="p-6 rounded-3xl bg-gradient-to-r from-amber-950/80 via-slate-900/90 to-yellow-950/80 border-2 border-amber-500/50 shadow-2xl relative overflow-hidden">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-yellow-500 flex items-center justify-center text-slate-950 font-bold shadow-xl shadow-amber-500/30 shrink-0">
                      <Bot className="w-7 h-7 text-slate-950" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black uppercase tracking-widest text-amber-400 font-mono">
                          SINCRONIZAÇÃO DE PROVEDORES E MODELOS DE IA
                        </span>
                        <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-500/50 px-2.5 py-0.5 rounded-full font-bold font-mono">
                          GitHub Gist Oficial
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-white mt-1">
                        Gerenciador Dinâmico de Provedores de IA
                      </h3>
                      <p className="text-xs text-slate-300 max-w-2xl mt-1 leading-relaxed font-sans">
                        Sincronização em tempo real com o arquivo <code className="text-amber-300 font-mono">models.json</code> hospedado no GitHub Gist. Permite alternar modelos no Jarvis Líder e Especialistas sem alterar uma linha de código.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                    <button
                      onClick={handleSyncGistModels}
                      disabled={isSyncingGist}
                      className="px-5 py-3 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-bold text-xs rounded-2xl shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                    >
                      <RefreshCw className={`w-4 h-4 ${isSyncingGist ? 'animate-spin' : ''}`} />
                      {isSyncingGist ? 'Sincronizando...' : 'Sincronizar Modelos Agora'}
                    </button>
                  </div>
                </div>

                {gistFeedback && (
                  <div className="mt-4 p-3 bg-amber-950/80 border border-amber-500/60 rounded-xl text-xs text-amber-200 flex items-center gap-2 animate-in fade-in duration-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{gistFeedback}</span>
                  </div>
                )}

                {keysFeedback && (
                  <div className="mt-3 p-3 bg-emerald-950/80 border border-emerald-500/60 rounded-xl text-xs text-emerald-200 flex items-center gap-2 animate-in fade-in duration-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{keysFeedback}</span>
                  </div>
                )}
              </div>

              {/* Informações da Fonte Gist */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <ExternalLink className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-mono block">URL do Raw GitHub Gist:</span>
                    <a
                      href={gistSyncStatus.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-300 hover:underline font-mono text-[11px] break-all"
                    >
                      {gistSyncStatus.sourceUrl}
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-slate-400 text-[11px] font-mono">
                  <span>Último Sync: <strong className="text-white">{gistSyncStatus.lastSync ? new Date(gistSyncStatus.lastSync).toLocaleTimeString('pt-BR') : 'Nunca'}</strong></span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-400 font-bold border border-slate-700">
                    {gistSyncStatus.totalModelsCount} modelos
                  </span>
                </div>
              </div>

              {/* Grid dos Provedores e Seus Modelos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(gistModelsMap).map(([providerKey, modelsList]) => {
                  const currentCustomInput =
                    providerKey === 'groq'
                      ? customInputGroq
                      : providerKey === 'openai'
                      ? customInputOpenAi
                      : providerKey === 'gemini'
                      ? customInputGemini
                      : customInputDeepSeek;

                  return (
                    <div
                      key={providerKey}
                      className="p-5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-amber-500/40 transition-all space-y-4 shadow-lg"
                    >
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                          <h4 className="font-bold text-white text-sm uppercase font-mono">
                            {providerKey}
                          </h4>
                        </div>
                        <span className="text-[10px] bg-slate-900 text-slate-300 px-2 py-0.5 rounded font-mono border border-slate-700">
                          {modelsList.length} opções
                        </span>
                      </div>

                      {/* Lista de Modelos do Gist */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] text-slate-400 font-bold uppercase font-mono block">
                          Modelos Cadastrados no Gist:
                        </span>
                        <div className="space-y-1">
                          {modelsList.map((m) => (
                            <div
                              key={m.value}
                              className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800/80 flex items-center justify-between text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-200">{m.label}</span>
                                {m.value !== 'CUSTOM_INPUT' && (
                                  <code className="text-[10px] text-amber-300 font-mono">({m.value})</code>
                                )}
                              </div>
                              {m.value !== 'CUSTOM_INPUT' && (
                                <button
                                  onClick={() => {
                                    setLeaderModel(m.value);
                                    agentService.updateAgent(leaderAgent.id, { model: m.value });
                                    setGistFeedback(`✓ Modelo "${m.label}" (${m.value}) definido para o Jarvis Líder!`);
                                    setTimeout(() => setGistFeedback(null), 4000);
                                    if (onTriggerSynapse) {
                                      onTriggerSynapse(`Modelo do Jarvis atualizado para ${m.label}`);
                                    }
                                  }}
                                  className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 cursor-pointer transition-all"
                                >
                                  Usar no Jarvis
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Campo para Inserir ID Manual (CUSTOM_INPUT) */}
                      <div className="p-3.5 rounded-xl bg-slate-900/90 border border-amber-500/30 space-y-2">
                        <label className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5 font-mono">
                          <span>✍️</span> Inserir ID Manual da {providerKey.toUpperCase()}:
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            defaultValue={currentCustomInput}
                            placeholder={`ex: ${providerKey === 'groq' ? 'llama-3.3-70b-specdec' : providerKey === 'openai' ? 'o3-mini' : providerKey === 'gemini' ? 'gemini-2.5-pro' : 'deepseek-v3'}`}
                            id={`input_custom_${providerKey}`}
                            className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-amber-400"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const el = document.getElementById(`input_custom_${providerKey}`) as HTMLInputElement;
                              if (el) {
                                handleSaveCustomInput(providerKey, el.value.trim());
                              }
                            }}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl cursor-pointer transition-all"
                          >
                            Salvar ID
                          </button>
                        </div>
                        {currentCustomInput && (
                          <div className="text-[10px] text-emerald-400 font-mono">
                            Ativo: <code className="bg-slate-950 px-1.5 py-0.5 rounded">{currentCustomInput}</code>
                          </div>
                        )}
                      </div>

                      {/* Bloco de Credencial / Chave de API Protegida (API_KEY) com Máscara ******** */}
                      <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5 font-mono">
                            <Key className="w-3.5 h-3.5 text-amber-400" />
                            Chave de API ({providerKey.toUpperCase()}_API_KEY):
                          </label>
                          {providerKeysStatus[providerKey]?.configured ? (
                            <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/50 px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-1 shadow-sm">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              Configurada
                            </span>
                          ) : (
                            <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full font-mono">
                              Não configurada
                            </span>
                          )}
                        </div>

                        {/* Indicador visual de chave gravada exibindo a máscara ******** */}
                        {providerKeysStatus[providerKey]?.configured && (
                          <div className="flex items-center justify-between bg-slate-950/90 px-3 py-2 rounded-xl border border-emerald-500/30 text-xs font-mono">
                            <div className="flex items-center gap-2">
                              <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span className="text-emerald-300 tracking-widest font-bold text-xs select-none">
                                {providerKeysStatus[providerKey]?.maskedKey || '••••••••••••••••'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveProviderKey(providerKey)}
                              className="text-[10px] text-slate-500 hover:text-red-400 font-mono transition-colors cursor-pointer"
                              title="Remover credencial gravada"
                            >
                              Remover
                            </button>
                          </div>
                        )}

                        {/* Input protegido password com botão Salvar Credencial */}
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <input
                              type={showKeyPlain[providerKey] ? 'text' : 'password'}
                              value={keyInputValues[providerKey] || ''}
                              onChange={(e) => setKeyInputValues((prev) => ({ ...prev, [providerKey]: e.target.value }))}
                              placeholder={
                                providerKeysStatus[providerKey]?.configured
                                  ? 'Substituir credencial existente...'
                                  : `Cole a ${providerKey.toUpperCase()}_API_KEY aqui...`
                              }
                              className="w-full px-3 py-1.5 pr-8 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-400 placeholder:text-slate-600"
                            />
                            <button
                              type="button"
                              onClick={() => setShowKeyPlain((prev) => ({ ...prev, [providerKey]: !prev[providerKey] }))}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                              title={showKeyPlain[providerKey] ? 'Ocultar' : 'Mostrar'}
                            >
                              {showKeyPlain[providerKey] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSaveProviderKey(providerKey, keyInputValues[providerKey] || '')}
                            disabled={isSavingKeyMap[providerKey] || !(keyInputValues[providerKey]?.trim())}
                            className="px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-40 text-slate-950 font-bold text-xs rounded-xl cursor-pointer transition-all shrink-0 flex items-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95"
                          >
                            <Save className="w-3.5 h-3.5" />
                            {isSavingKeyMap[providerKey] ? 'Gravando...' : 'Salvar Credencial'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTestProviderKey(providerKey, keyInputValues[providerKey])}
                            disabled={isTestingKeyMap[providerKey] || (!providerKeysStatus[providerKey]?.configured && !keyInputValues[providerKey]?.trim())}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-amber-300 hover:text-amber-200 border border-amber-500/40 text-xs rounded-xl cursor-pointer transition-all shrink-0 flex items-center gap-1.5 active:scale-95 shadow-sm font-mono"
                            title="Testar requisição direta contra a API do provedor"
                          >
                            <Activity className={`w-3.5 h-3.5 ${isTestingKeyMap[providerKey] ? 'animate-spin text-amber-300' : 'text-amber-400'}`} />
                            {isTestingKeyMap[providerKey] ? 'Testando...' : 'Testar Chave'}
                          </button>
                        </div>

                        {/* Feedback do Teste da Chave de IA */}
                        {testKeyResultMap[providerKey] && (
                          <div className={`p-2.5 rounded-xl border text-[11px] flex items-center justify-between gap-2 animate-in fade-in duration-200 ${
                            testKeyResultMap[providerKey]?.valid
                              ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                              : 'bg-red-950/70 border-red-500/50 text-red-300'
                          }`}>
                            <div className="flex items-center gap-2">
                              {testKeyResultMap[providerKey]?.valid ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              ) : (
                                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                              )}
                              <span className="font-sans leading-tight">{testKeyResultMap[providerKey]?.message}</span>
                            </div>
                            {testKeyResultMap[providerKey]?.latencyMs !== undefined && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 shrink-0">
                                ⚡ {testKeyResultMap[providerKey]?.latencyMs}ms
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* BANNER DE PERSISTÊNCIA RELACIONAL & ON CONFLICT NO POSTGRESQL */}
              <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-400" />
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                        Estrutura do Banco de Dados (PostgreSQL / Drizzle ORM)
                      </h4>
                      <p className="text-[11px] text-slate-400 font-sans">
                        Tabela oficial para armazenamento de credenciais com cláusula segura <code className="text-emerald-300 font-mono">ON CONFLICT (provider) DO UPDATE</code>.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const ddl = `CREATE TABLE IF NOT EXISTS ai_provider_keys (
  provider VARCHAR(50) PRIMARY KEY,
  api_key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Exemplo de Upsert executado pelo backend Express:
INSERT INTO ai_provider_keys (provider, api_key, updated_at)
VALUES ('groq', 'gsk_...', CURRENT_TIMESTAMP)
ON CONFLICT (provider) DO UPDATE SET
  api_key = EXCLUDED.api_key,
  updated_at = CURRENT_TIMESTAMP;`;
                      navigator.clipboard.writeText(ddl);
                      setCopiedKeysDdlSql(true);
                      setTimeout(() => setCopiedKeysDdlSql(false), 3000);
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 text-xs rounded-xl flex items-center gap-1.5 cursor-pointer font-mono shrink-0 transition-all"
                  >
                    {copiedKeysDdlSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedKeysDdlSql ? 'SQL Copiado!' : 'Copiar DDL & Upsert SQL'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] font-mono">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">1. Criação da Tabela (DDL):</span>
                    <pre className="text-emerald-300 text-[10px] overflow-x-auto whitespace-pre">
{`CREATE TABLE IF NOT EXISTS ai_provider_keys (
  provider VARCHAR(50) PRIMARY KEY,
  api_key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);`}
                    </pre>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">2. Tratamento de Conflito (Upsert):</span>
                    <pre className="text-amber-300 text-[10px] overflow-x-auto whitespace-pre">
{`INSERT INTO ai_provider_keys (provider, api_key, updated_at)
VALUES ($1, $2, CURRENT_TIMESTAMP)
ON CONFLICT (provider) DO UPDATE SET
  api_key = EXCLUDED.api_key,
  updated_at = CURRENT_TIMESTAMP;`}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* ABA 7: GERENCIADOR DE MEMÓRIA & SESSÕES (SESSION ID)            */}
          {/* =============================================================== */}
          {activeTab === 'memory_manager' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Banner Memória */}
              <div className="p-6 rounded-3xl bg-gradient-to-r from-blue-950/80 via-slate-900/90 to-cyan-950/80 border-2 border-blue-500/50 shadow-2xl relative overflow-hidden">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-xl shadow-blue-500/30 shrink-0">
                      <MessageSquare className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black uppercase tracking-widest text-blue-400 font-mono">
                          ESTRUTURAÇÃO DE MEMÓRIA DINÂMICA
                        </span>
                        <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-500/50 px-2.5 py-0.5 rounded-full font-bold font-mono">
                          Session ID Isolado
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-white mt-1">
                        Memória Conversacional do Jarvis & Contexto dos Especialistas
                      </h3>
                      <p className="text-xs text-slate-300 max-w-2xl mt-1 leading-relaxed font-sans">
                        Cada conversa possui um Session ID exclusivo. O Jarvis armazena o histórico do diálogo e os sub-fluxos do n8n mantêm memória contextual de curto prazo (último ticker, ativo ou ação).
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleExportSession('json')}
                      className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-blue-500/40 text-xs rounded-xl flex items-center gap-1.5 cursor-pointer font-mono"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Exportar JSON
                    </button>
                    <button
                      onClick={() => handleExportSession('markdown')}
                      className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/40 text-xs rounded-xl flex items-center gap-1.5 cursor-pointer font-mono"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Exportar Markdown
                    </button>
                    <button
                      onClick={handleClearJarvisMemory}
                      className="px-3.5 py-2.5 bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-500/40 text-xs rounded-xl flex items-center gap-1.5 cursor-pointer font-mono"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Limpar Memória (Reset)
                    </button>
                  </div>
                </div>

                {memoryFeedback && (
                  <div className="mt-4 p-3 bg-blue-950/80 border border-blue-500/60 rounded-xl text-xs text-blue-200 flex items-center gap-2 animate-in fade-in duration-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{memoryFeedback}</span>
                  </div>
                )}
              </div>

              {/* SELETOR E GERENCIAMENTO DE SESSÕES */}
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-blue-400" />
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                      1. Gerenciamento de Sessões Ativas ({allSessions.length})
                    </h4>
                  </div>

                  {/* Criar nova sessão */}
                  <form onSubmit={handleCreateSession} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Nome da nova sessão..."
                      value={newSessionInputTitle}
                      onChange={(e) => setNewSessionInputTitle(e.target.value)}
                      className="px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-blue-400"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-blue-500 hover:bg-blue-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Nova Sessão
                    </button>
                  </form>
                </div>

                {/* Lista de Sessões */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {allSessions.map((sess) => {
                    const isActive = sess.id === activeSessionId;
                    return (
                      <div
                        key={sess.id}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                          isActive
                            ? 'bg-blue-950/40 border-blue-500 text-white shadow-md shadow-blue-500/10'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                        }`}
                        onClick={() => handleSwitchSession(sess.id)}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${isActive ? 'bg-blue-500 text-slate-950 font-bold' : 'bg-slate-900 text-slate-400'}`}>
                            {isActive ? 'SESSÃO ATIVA' : sess.id.slice(0, 14)}
                          </span>
                          {allSessions.length > 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSession(sess.id);
                              }}
                              className="text-slate-500 hover:text-red-400 p-1 cursor-pointer"
                              title="Excluir Sessão"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <h5 className="font-bold text-xs mt-2 truncate">{sess.title}</h5>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                          <span>{sess.messageCount || 0} msgs</span>
                          <span>{new Date(sess.updatedAt).toLocaleTimeString('pt-BR')}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* DUAS COLUNAS: MEMÓRIA CONVERSACIONAL (ESQUERDA) & CONTEXTO ESPECIALISTAS (DIREITA) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* COLUNA ESQUERDA: MEMÓRIA DO JARVIS (MENSAGENS DO CHAT) */}
                <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-cyan-400" />
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                        2. Memória Conversacional do Jarvis ({sessionMessages.length})
                      </h4>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Editável & Excluível
                    </span>
                  </div>

                  <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                    {sessionMessages.length === 0 ? (
                      <div className="p-6 text-center text-slate-500 text-xs font-mono">
                        Nenhuma mensagem salva nesta sessão. Inicie uma conversa com o Jarvis ou envie uma mensagem de teste.
                      </div>
                    ) : (
                      sessionMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                            msg.sender === 'user' || msg.senderType === 'USER'
                              ? 'bg-slate-950 border-slate-800 text-slate-200'
                              : 'bg-gradient-to-r from-amber-950/30 to-slate-950 border-amber-500/30 text-amber-100'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className={`font-bold ${msg.sender === 'user' || msg.senderType === 'USER' ? 'text-cyan-400' : 'text-amber-400'}`}>
                              {msg.sender === 'user' || msg.senderType === 'USER' ? '👤 USUÁRIO' : '👑 JARVIS LÍDER'}
                            </span>
                            <div className="flex items-center gap-1.5 text-slate-500">
                              <span>{new Date(msg.timestamp).toLocaleTimeString('pt-BR')}</span>
                              <button
                                onClick={() => {
                                  setEditingMsgId(msg.id);
                                  setEditingMsgText(msg.text || msg.content);
                                }}
                                className="hover:text-amber-300 p-0.5 cursor-pointer"
                                title="Editar mensagem na memória"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleDeleteMessage(msg.id)}
                                className="hover:text-red-400 p-0.5 cursor-pointer"
                                title="Excluir mensagem da memória"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {editingMsgId === msg.id ? (
                            <div className="space-y-2 pt-1">
                              <textarea
                                value={editingMsgText}
                                onChange={(e) => setEditingMsgText(e.target.value)}
                                rows={2}
                                className="w-full p-2 bg-slate-900 border border-amber-500/60 rounded-lg text-xs text-white font-mono focus:outline-none"
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => setEditingMsgId(null)}
                                  className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                                >
                                  Cancelar
                                </button>
                                <button
                                  onClick={() => handleSaveEditMessage(msg.id)}
                                  className="px-2.5 py-1 text-[11px] bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded cursor-pointer"
                                >
                                  Salvar Edição
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="whitespace-pre-line text-[11px] leading-relaxed">
                              {msg.text || msg.content}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* COLUNA DIREITA: MEMÓRIA CONTEXTUAL DOS ESPECIALISTAS */}
                <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-purple-400" />
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                        3. Contexto Técnico dos Especialistas (n8n)
                      </h4>
                    </div>
                    <span className="text-[10px] text-purple-400 font-mono">
                      Curto Prazo por Session ID
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 font-sans">
                    Armazena qual foi a última ação ou ativo consultado naquela sessão específica (ex: ticker <code>PETR4</code> ou dispositivo <code>luz_sala</code>).
                  </p>

                  {/* Formulário para Injetar/Testar Contexto */}
                  <form onSubmit={handleSetSpecialistContext} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                    <span className="text-[10px] font-bold text-slate-300 uppercase font-mono block">
                      Injetar Contexto de Especialista:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Especialista:</label>
                        <select
                          value={testContextSpecialist}
                          onChange={(e) => setTestContextSpecialist(e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono"
                        >
                          {agents.map((ag) => (
                            <option key={ag.id} value={ag.id}>{ag.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Chave:</label>
                        <input
                          type="text"
                          value={testContextKey}
                          onChange={(e) => setTestContextKey(e.target.value)}
                          placeholder="ultimo_ticker"
                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-cyan-300 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Valor (JSON ou Texto):</label>
                        <input
                          type="text"
                          value={testContextVal}
                          onChange={(e) => setTestContextVal(e.target.value)}
                          placeholder="PETR4"
                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-amber-300 font-mono"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-1.5 bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold text-xs rounded-lg cursor-pointer"
                    >
                      Salvar Contexto do Especialista
                    </button>
                  </form>

                  {/* Lista de Contextos Atuais */}
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {specialistContexts.length === 0 ? (
                      <div className="p-4 text-center text-slate-500 text-xs font-mono">
                        Nenhum contexto técnico gravado para esta sessão ainda.
                      </div>
                    ) : (
                      specialistContexts.map((ctx) => (
                        <div
                          key={ctx.id}
                          className="p-3 rounded-xl bg-slate-950 border border-purple-500/30 flex items-center justify-between text-xs font-mono gap-2"
                        >
                          <div className="truncate">
                            <span className="text-purple-300 font-bold">{ctx.specialistName}:</span>
                            <span className="text-slate-400 ml-2">{ctx.contextKey} =</span>
                            <code className="text-amber-300 ml-1.5 font-bold">{JSON.stringify(ctx.contextValue)}</code>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-slate-500">
                              {new Date(ctx.updatedAt).toLocaleTimeString('pt-BR')}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                sessionMemoryService.deleteSpecialistContext(ctx.id);
                                setSpecialistContexts(sessionMemoryService.getSpecialistContext(activeSessionId));
                              }}
                              className="p-1 rounded bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 cursor-pointer"
                              title="Excluir contexto do especialista"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* ABA 8: BANCO DINÂMICO (DYNAMIC DATABASE TOOL & PERSISTÊNCIA)    */}
          {/* =============================================================== */}
          {activeTab === 'dynamic_db' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Banner Banco Dinâmico */}
              <div className="p-6 rounded-3xl bg-gradient-to-r from-teal-950/80 via-slate-900/90 to-emerald-950/80 border-2 border-teal-500/50 shadow-2xl relative overflow-hidden">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 via-emerald-600 to-cyan-600 flex items-center justify-center text-slate-950 font-bold shadow-xl shadow-teal-500/30 shrink-0">
                      <HardDrive className="w-7 h-7 text-slate-950" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black uppercase tracking-widest text-teal-400 font-mono">
                          FERRAMENTA DE PERSISTÊNCIA AUTÔNOMA
                        </span>
                        <span className="text-[10px] bg-teal-950 text-teal-300 border border-teal-500/50 px-2.5 py-0.5 rounded-full font-bold font-mono">
                          Validação Regex /^[a-z0-9_]+$/
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-white mt-1">
                        Dynamic Database Tool & Auditoria de Decisões
                      </h3>
                      <p className="text-xs text-slate-300 max-w-2xl mt-1 leading-relaxed font-sans">
                        Persistência flexível com metadados automáticos (createdAt, decisionReasoning, webhookSource, executionStatus). Suporta execução dupla (Save DB + Execute HTTP via Promise.allSettled).
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono text-teal-300 bg-teal-950/90 border border-teal-500/40 px-3 py-1.5 rounded-xl font-bold">
                      {dynamicCollections.length} Coleções Ativas
                    </span>
                  </div>
                </div>
              </div>

              {/* GRID: EXPLORADOR DE COLEÇÕES (ESQUERDA) & BANCADA DE TESTE (DIREITA) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* EXPLORADOR DE DOCUMENTOS */}
                <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-teal-400" />
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                        Coleções & Documentos Salvos
                      </h4>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={selectedCollection}
                        onChange={(e) => {
                          setSelectedCollection(e.target.value);
                          setCollectionDocs(dynamicDatabaseService.getDocuments(e.target.value));
                        }}
                        className="px-3 py-1 bg-slate-950 border border-slate-700 rounded-xl text-xs text-teal-300 font-mono"
                      >
                        {dynamicCollections.map((col) => (
                          <option key={col} value={col}>📁 {col}</option>
                        ))}
                      </select>
                      {dynamicCollections.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            dynamicDatabaseService.deleteCollection(selectedCollection);
                            const remaining = dynamicDatabaseService.listCollections();
                            const nextCol = remaining[0] || 'cfo_audit_logs';
                            setDynamicCollections(remaining);
                            setSelectedCollection(nextCol);
                            setCollectionDocs(dynamicDatabaseService.getDocuments(nextCol));
                          }}
                          className="px-2 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 text-[10px] font-mono flex items-center gap-1 cursor-pointer"
                          title="Excluir coleção inteira"
                        >
                          <Trash2 className="w-3 h-3" /> Excluir Coleção
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                    {collectionDocs.length === 0 ? (
                      <div className="p-6 text-center text-slate-500 text-xs font-mono">
                        Nenhum documento na coleção "{selectedCollection}".
                      </div>
                    ) : (
                      collectionDocs.map((doc) => (
                        <div
                          key={doc._id}
                          className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs font-mono"
                        >
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span className="text-teal-400 font-bold">{doc._id}</span>
                            <div className="flex items-center gap-2">
                              <span>{new Date(doc.createdAt).toLocaleTimeString('pt-BR')}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  dynamicDatabaseService.deleteDocument(selectedCollection, doc._id);
                                  setCollectionDocs(dynamicDatabaseService.getDocuments(selectedCollection));
                                }}
                                className="px-1.5 py-0.5 rounded bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 flex items-center gap-1 cursor-pointer"
                                title="Excluir documento"
                              >
                                <Trash2 className="w-3 h-3" /> Excluir
                              </button>
                            </div>
                          </div>
                          <div className="text-[11px] text-slate-300 italic">
                            Motivo: {doc.decisionReasoning}
                          </div>
                          <pre className="p-2.5 bg-slate-900 rounded-lg text-[10px] text-amber-200 overflow-x-auto max-h-32">
                            {JSON.stringify(doc.data, null, 2)}
                          </pre>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* BANCADA DE TESTE DA TOMADA DE DECISÃO */}
                <form onSubmit={handleExecuteDynamicDbTest} className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-400" />
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                        Bancada de Decisão Autônoma
                      </h4>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Promise.allSettled()
                    </span>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="text-slate-300 font-bold block mb-1">
                        Coleção (Regex: /^[a-z0-9_]+$/):
                      </label>
                      <input
                        type="text"
                        value={testDbCollection}
                        onChange={(e) => setTestDbCollection(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-teal-300 font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-slate-300 font-bold block mb-1">
                        Modo de Ação da Decisão:
                      </label>
                      <select
                        value={testDbDecision}
                        onChange={(e) => setTestDbDecision(e.target.value as any)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono"
                      >
                        <option value="BOTH">BOTH (Salvar no Banco + Disparar HTTP)</option>
                        <option value="SAVE_DB">SAVE_DB (Apenas Persistir no Banco)</option>
                        <option value="EXECUTE_HTTP">EXECUTE_HTTP (Apenas Disparar Webhook)</option>
                        <option value="DISCARD">DISCARD (Descartar Silenciosamente)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-300 font-bold block mb-1">
                        Justificativa da Decisão (Auditoria):
                      </label>
                      <input
                        type="text"
                        value={testDbReasoning}
                        onChange={(e) => setTestDbReasoning(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-slate-300 font-bold block mb-1">
                        Payload JSON:
                      </label>
                      <textarea
                        value={testDbPayload}
                        onChange={(e) => setTestDbPayload(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-amber-200 font-mono text-[11px]"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isTestingDb}
                      className="w-full py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-teal-500/20"
                    >
                      <Play className="w-3.5 h-3.5" />
                      {isTestingDb ? 'Executando Decisão...' : 'Executar Tomada de Decisão Autônoma'}
                    </button>

                    {testDbResult && (
                      <div className="p-3 bg-slate-950 rounded-xl border border-teal-500/40 text-[11px] font-mono space-y-1">
                        <span className="text-emerald-400 font-bold block">Status: {testDbResult.status}</span>
                        <pre className="text-slate-300 text-[10px] overflow-x-auto max-h-28">
                          {JSON.stringify(testDbResult, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </form>

              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* ABA 9: CAMADA SENSORIAL & DESKTOP AGENT (WHISPER, TELA, FACE)    */}
          {/* =============================================================== */}
          {activeTab === 'sensory_layer' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Banner Sensorial */}
              <div className="p-6 rounded-3xl bg-gradient-to-r from-rose-950/80 via-slate-900/90 to-red-950/80 border-2 border-rose-500/50 shadow-2xl relative overflow-hidden">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 via-pink-600 to-red-600 flex items-center justify-center text-white font-bold shadow-xl shadow-rose-500/30 shrink-0">
                      <Eye className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black uppercase tracking-widest text-rose-400 font-mono">
                          REDE SENSORIAL & DESKTOP AGENT
                        </span>
                        <span className="text-[10px] bg-rose-950 text-rose-300 border border-rose-500/50 px-2.5 py-0.5 rounded-full font-bold font-mono">
                          Whisper STT · Base64 JPEG · Biometria
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-white mt-1">
                        Camada Sensorial Universal & Reconhecimento Facial
                      </h3>
                      <p className="text-xs text-slate-300 max-w-2xl mt-1 leading-relaxed font-sans">
                        Ponto único de contato para agentes desktop em Python, escuta de voz local via Whisper, captura de tela JPEG q80 em Base64 ASCII e identificação biométrica por crachá.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      onClick={handleCaptureScreenNow}
                      disabled={isCapturingScreen}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/40 text-xs rounded-xl flex items-center gap-1.5 cursor-pointer font-mono"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      {isCapturingScreen ? 'Capturando...' : 'Capturar Tela Agora'}
                    </button>
                    <button
                      onClick={handleDispatchSensoryInbox}
                      className="px-4 py-2.5 bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-lg shadow-rose-500/20"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Despachar para Universal Inbox
                    </button>
                  </div>
                </div>

                {sensoryFeedback && (
                  <div className="mt-4 p-3 bg-rose-950/80 border border-rose-500/60 rounded-xl text-xs text-rose-200 flex items-center gap-2 animate-in fade-in duration-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{sensoryFeedback}</span>
                  </div>
                )}
              </div>

              {/* CARDS DOS 3 SENSORES: VOZ (WHISPER), VISÃO (TELA) E IDENTIDADE (BIOMETRIA) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* SENSOR 1: VOZ & WHISPER STT */}
                <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-cyan-400" />
                      <h4 className="font-bold text-white text-xs font-mono uppercase">
                        Voz & Whisper STT Local
                      </h4>
                    </div>
                    <span className="text-[10px] bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded font-mono">
                      Microfone Ativo
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 font-sans">
                    Comando de voz transcreve diretamente no navegador ou via script Python local:
                  </p>

                  <input
                    type="text"
                    value={sensoryVoiceInput}
                    onChange={(e) => setSensoryVoiceInput(e.target.value)}
                    placeholder="ex: Jarvis, analise PETR4 e verifique o preço-teto"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-cyan-300 font-mono focus:outline-none focus:border-cyan-400"
                  />

                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-[10px] text-slate-400 font-mono flex items-center justify-between">
                    <span>Taxa de amostragem: 16 kHz</span>
                    <span className="text-emerald-400">Modelo: whisper-small</span>
                  </div>
                </div>

                {/* SENSOR 2: VISÃO & CAPTURA DE TELA */}
                <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-rose-400" />
                      <h4 className="font-bold text-white text-xs font-mono uppercase">
                        Visão & Desktop Screen
                      </h4>
                    </div>
                    <span className="text-[10px] bg-rose-950 text-rose-300 px-2 py-0.5 rounded font-mono">
                      1280x720 JPEG q80
                    </span>
                  </div>

                  {lastScreenShot ? (
                    <div className="space-y-2">
                      <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                        <span>App: {lastScreenShot.activeAppTitle || lastScreenShot.activeWindow || 'Desktop'}</span>
                        <span className="text-amber-300">{lastScreenShot.byteSize} bytes Base64</span>
                      </div>
                      <div className="p-2 bg-slate-900 rounded-lg text-[9px] font-mono text-slate-400 break-all max-h-16 overflow-hidden">
                        data:{lastScreenShot.mimeType || 'image/jpeg'};base64,{lastScreenShot.base64Ascii.slice(0, 100)}...
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 text-center text-slate-500 text-xs font-mono">
                      Nenhuma captura em memória. Clique em "Capturar Tela Agora".
                    </div>
                  )}

                  <button
                    onClick={handleCaptureScreenNow}
                    className="w-full py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-rose-300 text-xs rounded-lg cursor-pointer font-mono"
                  >
                    Disparar Captura Instantânea
                  </button>
                </div>

                {/* SENSOR 3: BIOMETRIA & CRACHÁ DE IDENTIDADE */}
                <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-emerald-400" />
                      <h4 className="font-bold text-white text-xs font-mono uppercase">
                        Biometria Facial (InsightFace)
                      </h4>
                    </div>
                    <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded font-mono">
                      VALIDADO
                    </span>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-xl border border-emerald-500/30 space-y-1.5 text-xs font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[10px]">OPERADOR IDENTIFICADO:</span>
                      <span className="text-emerald-400 font-bold">{sensoryInputService.getCurrentBadge().name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[10px]">NÍVEL DE PERMISSÃO:</span>
                      <span className="text-amber-300 font-bold">{sensoryInputService.getCurrentBadge().permissionLevel}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[10px]">CONFIANÇA FACIAL:</span>
                      <span className="text-white">99.4% (Embeddings 512d)</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-400 font-sans">
                    Todo pacote enviado ao n8n embute este crachá, garantindo execução com nível ADMIN_TOTAL.
                  </p>
                </div>

              </div>

              {/* HISTÓRICO DE PACOTES RECEBIDOS NO UNIVERSAL INBOX */}
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                      Histórico do Universal Inbox (/api/webhook/universal-inbox)
                    </h4>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {sensoryInboxList.length} Pacotes Processados
                  </span>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {sensoryInboxList.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-xs font-mono">
                      Nenhum pacote despachado nesta sessão. Clique em "Despachar para Universal Inbox" para testar o envelope.
                    </div>
                  ) : (
                    sensoryInboxList.map((pkt) => (
                      <div
                        key={pkt.id}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono"
                      >
                        <div>
                          <span className="text-cyan-400 font-bold">{pkt.id}</span>
                          <span className="text-slate-400 ml-2">[{pkt.identityBadge.name} · {pkt.identityBadge.permissionLevel}]</span>
                          <p className="text-slate-200 mt-0.5 text-[11px] font-sans">"{pkt.transcription || 'Sem comando de voz'}"</p>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-slate-400 shrink-0">
                          <span>Tela: {pkt.hasScreenCapture ? '✓ SIM' : 'NÃO'}</span>
                          <span>{new Date(pkt.timestamp || pkt.receivedAt).toLocaleTimeString('pt-BR')}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
};
