export type MemoryCategory =
  | 'investimento'
  | 'rotina'
  | 'saude'
  | 'familia'
  | 'aprendizado'
  | 'cfo'
  | 'seguranca';

export type SentimentType =
  | 'analitico_racional' // Ciano Elétrico (Frio, matemático, dados Bazin)
  | 'urgente_alerta'     // Vermelho Escarlate (Risco, emergência, stop, alavancagem alta)
  | 'oportunidade_lucro' // Verde Esmeralda (Margem de segurança positiva, compra, proventos)
  | 'cautela_atencao'    // Âmbar Ouro (Aguardar, incerteza de mercado, teto superado)
  | 'afeto_familiar';    // Magenta / Violeta (Família, saúde, carinho, harmonia do lar)

export interface SentimentAnalysisResult {
  sentimento: SentimentType;
  intensidade: number; // 0.0 a 1.0
  rotulo: string;
  explicacao: string;
  corHex: string;
  corNumber: number;
}

export interface AgenteSentinela {
  id: string;
  nome: string;
  chaveParticao: string;
  tipo: 'ativo_b3' | 'cripto' | 'saude' | 'familia' | 'rotina';
  status: 'vigilante' | 'alerta_disparado' | 'standby';
  regraMonitoramento: string;
  dataUltimaAuditoria: string;
  alertaVigente?: string;
  dataAlerta?: string;
}

export type LLMProviderType =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'groq'
  | 'mistral'
  | 'ollama';

export interface LLMProviderConfig {
  provider: LLMProviderType;
  apiKey: string;
  model: string;
  customEndpoint?: string;
  temperature?: number;
  maxTokens?: number;
  // Mapa permanente de chaves salvas por provedor (salvo para sempre no storage, só altera se o usuário mudar)
  providerKeys?: Partial<Record<LLMProviderType, string>>;
  providerEndpoints?: Partial<Record<LLMProviderType, string>>;
}

export type BodyPartAnatomy =
  | 'cranio_cerebro'     // Cabeça / Córtex Craniano
  | 'pescoco_cervical'   // Pescoço / Cervical
  | 'ombro_esquerdo'     // Ombro Esquerdo
  | 'ombro_direito'      // Ombro Direito
  | 'braco_esquerdo'     // Braço Esquerdo
  | 'braco_direito'      // Braço Direito
  | 'mao_esquerda'       // Mão Esquerda
  | 'mao_direita'        // Mão Direita
  | 'torax_tronco'       // Tórax / Peito
  | 'coluna_vertebral'   // Coluna Vertebral / Eixo Central
  | 'quadril_pelve'      // Pelve / Quadril
  | 'perna_esquerda'     // Perna Esquerda / Joelho
  | 'perna_direita'      // Perna Direita / Joelho
  | 'pe_esquerdo'        // Pé Esquerdo
  | 'pe_direito'         // Pé Direito
  // Legados mantidos para compatibilidade
  | 'coracao'
  | 'pulmoes'
  | 'coluna'
  | 'estomago_plexo'
  | 'figado'
  | 'rins'
  | 'pes'
  | 'olhos_sentidos';

export interface AgentDefinition {
  id: string;
  name: string;
  role: string;
  targetDatabase: string; // Ex: 'TAEE11', 'BTC', 'SAUDE_FAMILIA', 'GERAL'
  logic: string; // Instruções sistêmicas e diretrizes de auditoria
  llmProvider: LLMProviderType | 'global';
  model: string;
  status: 'ativo' | 'em_auditoria' | 'pausado' | 'alerta';
  lastAuditVerdict?: 'COMPRAR' | 'AGUARDAR' | 'QUARENTENA' | 'ESTAVEL' | 'ALERTA' | 'OK';
  lastAuditDetails?: string;
  lastAuditDate?: string;
  triggers: string[];
  isAutonomous: boolean;
  createdAt: string;
  author: string; // 'Jarvis Auto' | 'LLM Autônoma (Avaliação Cognitiva)' | 'Matheus Dullius'
  // Mapeamento Anatômico: cada parte do corpo representa um agente de IA no cérebro
  bodyPart?: BodyPartAnatomy;
  bodyCoordinates?: [number, number, number];
  cognitiveEvaluation?: {
    objective: string; // Objetivo avaliado pela LLM
    requiredInformation: string[]; // Que tipo de informação a LLM avaliou como indispensável
    whatToRequest: string[]; // O que pedir para o agente criar e auditar
    evaluationRationale: string; // Justificativa da LLM para criar o agente e proteger tokens
    targetAssetClass?: string; // 'Ações B3' | 'Fundos Imobiliários' | 'Cripto' | 'Tesouro Direto' | 'Títulos Estrangeiros' | 'Commodities'
  };
  // Suporte a protocolo de dados de API / MCP fornecidos pelo usuário via chat
  transcribedMcpData?: {
    lastTranscriptionDate: string;
    protocol: 'API' | 'MCP' | 'JSON_FEED';
    rawSummary: string;
    parsedMetrics: Record<string, any>;
    tokensEstimatedBefore: number;
    tokensPreservedAfter: number;
  };
  pendingDataRequest?: {
    protocol: string;
    requestedFields: string[];
    requestReason: string;
    requestedAt: string;
  };
  // Ferramentas & Funções integradas do Agente (API, MCP, Webhook, Funções de Código)
  tools?: AgentTool[];
  // Processo Tradicional do n8n: Motor de Memória do Agente (Window Buffer / Datastore)
  // O agente criado guarda suas memórias para que a LLM acesse e interprete
  n8nMemoryStore?: AgentMemoryRecord[];
  // Espaço para Prompt Customizado de Comportamento da IA
  customPromptBehavior?: string;
  // IA Opcional / Dedicada configurada para este agente
  hasDedicatedLLM?: boolean;
  dedicatedLLMConfig?: Partial<LLMProviderConfig>;
  // Estado de Execução em Tempo Real (Aciona Sinapse no Córtex e Medula)
  isExecuting?: boolean;
  activeSynapseIntensity?: number; // 0.0 a 1.0 (intensidade dos dados que dita a cor da sinapse)
}

export interface AgentMemoryRecord {
  id: string;
  agentId: string;
  agentName: string;
  bodyPart?: BodyPartAnatomy;
  timestamp: string;
  sourceEvent: string; // 'webhook_trigger' | 'audit_run' | 'user_interaction' | 'sensor_sync' | 'mcp_feed'
  rawPayload?: Record<string, any> | string;
  storedSummary: string; // Memória gravada pelo próprio agente (processo tradicional n8n)
  importance: 'critica' | 'alta' | 'media';
  interpretedByLLM?: boolean; // Se a LLM já acessou e interpretou essa memória
  interpretation?: string; // Interpretação cognitiva e diretrizes emitidas pela LLM
  interpretedAt?: string;
  synapseId?: string; // ID da sinapse gravada no cérebro 3D
}

export interface AgentTool {
  id: string;
  name: string;
  description: string;
  type: 'API' | 'MCP' | 'WEBHOOK' | 'FUNCTION' | 'WORKSPACE' | 'SQL';
  endpointOrMethod?: string;
  parametersSchema?: string;
  codeSnippet?: string;
  headersOrAuth?: string;
  enabled: boolean;
  author: 'IA_AUTONOMA' | 'USUARIO';
  createdAt: string;
  lastExecutedAt?: string;
  lastExecutionResult?: string;
}

export interface AgentAuditResult {
  agentId: string;
  agentName: string;
  targetDatabase: string;
  verdict: 'COMPRAR' | 'AGUARDAR' | 'QUARENTENA' | 'ESTAVEL' | 'ALERTA' | 'OK';
  score?: number;
  details: string;
  recommendations: string[];
  alertTriggered: boolean;
  timestamp: string;
}

export interface LogIsolamentoParticao {
  id: string;
  timestamp: string;
  chaveParticao: string;
  evento: string;
  detalhes: string;
  latenciaMs: number;
  tipo: 'acesso_isolado' | 'bloqueio_cruzado' | 'sentinela_disparo' | 'criacao_silo' | 'auditoria';
}

export interface MicroDatastoreParticionado {
  id: string; // Ex: 'TAEE11', 'BBAS3', 'BTC', 'SAUDE_FAMILIA'
  chave: string;
  tipo: 'ativo_b3' | 'cripto' | 'saude' | 'familia' | 'rotina';
  nome: string;
  descricao: string;
  dataCriacao: string;
  ultimaAtualizacao: string;
  totalConsultas: number;
  dados: Record<string, any>;
  agenteSentinela: AgenteSentinela;
}

export interface FamilyProfile {
  id: string;
  name: string;
  role: string;
  avatarColor: string;
  badge: string;
  voiceKeywords: string[];
}

export interface SynapseMemory {
  id: string;
  title: string;
  content: string;
  category: MemoryCategory;
  user: string;
  timestamp: string;
  importance: 'critica' | 'alta' | 'media';
  coords: [number, number, number];
  color: number;
  firing: boolean;
  connectionsCount: number;
  sentiment?: SentimentType;
  particaoId?: string;
  // Campos de Criação Autônoma da LLM & Preservação de Tokens (Zero Interferência Humana)
  isAutonomousLLM?: boolean;
  tokenPreservation?: {
    originalTokensEstimated: number; // Tokens de dados brutos / históricos
    preservedTokensEstimated: number; // Tokens da memória sintetizada
    compressionRatio: string; // Ex: '97.8% de preservação de tokens'
    rationale: string; // Justificativa da LLM de por que criou a memória para poupar contexto
  };
  autonomousNeedReason?: string;
}

export interface VoiceConfig {
  persona: 'jarvis_classic' | 'jarvis_executive' | 'jarvis_cyber' | 'jarvis_warm';
  voiceURI?: string;
  lang: string;
  pitch: number;
  rate: number;
  wakeWord: string;
  wakeWordEnabled: boolean;
  soundEffectsEnabled: boolean;
}

export interface SynapticPulseEvent {
  id: string;
  source: string;
  target?: string;
  color: number;
  label: string;
  timestamp: string;
  sentiment?: SentimentType;
}

export const FAMILY_PROFILES: FamilyProfile[] = [
  {
    id: 'matheus',
    name: 'Matheus Dullius',
    role: 'Administrador · Holding Investimentos Dullius',
    avatarColor: '#06b6d4',
    badge: 'Líder / CFO',
    voiceKeywords: ['matheus', 'eu', 'dullius', 'papai'],
  },
  {
    id: 'esposa',
    name: 'Cônjuge / Família',
    role: 'Gestão da Casa, Saúde & Rotinas',
    avatarColor: '#ec4899',
    badge: 'Coordenadora Familiar',
    voiceKeywords: ['mamãe', 'esposa', 'amor', 'mãe'],
  },
  {
    id: 'filhos',
    name: 'Filhos & Dependentes',
    role: 'Educação, Lazer & Atividades',
    avatarColor: '#10b981',
    badge: 'Jovem Aprendiz',
    voiceKeywords: ['filho', 'filha', 'criança', 'escola'],
  },
  {
    id: 'tv_sala',
    name: 'Dispositivo Central (TV da Sala)',
    role: 'Reconhecimento Multiusuário Autônomo',
    avatarColor: '#f59e0b',
    badge: 'Hub da Casa',
    voiceKeywords: ['casa', 'sala', 'tv', 'família'],
  },
];

export interface AgentNerveSignal {
  id: string;
  agentId: string;
  agentName: string;
  bodyPart: BodyPartAnatomy;
  direction: 'BRAIN_TO_AGENT' | 'AGENT_TO_BRAIN';
  colorHex: number; // Cor do sinal (dinâmica com base na intensidade dos dados)
  message?: string;
  timestamp: number;
  intensity?: number; // 0.0 a 1.0 (intensidade dos dados que flui na sinapse)
  intensityColorHex?: number; // Cor espectral Three.js baseada na intensidade
  dataVolume?: string; // Ex: '18.4 KB', '3.8k tokens', 'Payload MCP'
  isContinuousExecuting?: boolean; // Se o agente está em execução contínua
}

export interface CognitiveClusterNode {
  id: string;
  label: string;
  category: MemoryCategory;
  bodyPartTarget: BodyPartAnatomy;
  centerCoords: [number, number, number];
  colorHex: number;
  memoryCount: number;
  agentCount: number;
  description: string;
}

export type BodyViewPerspective = 'FULL_BODY' | 'BRAIN_FOCUS' | 'AGENT_ORGAN_FOCUS';
