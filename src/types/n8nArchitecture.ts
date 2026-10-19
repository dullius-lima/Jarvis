/**
 * Arquitetura Neural N8N - Sistema Operacional Autônomo Multi-Agente
 * Desenvolvido para implantação em Oracle Cloud VM & VSCode
 */

export type BiometricRole = 'ADMIN_TOTAL' | 'FAMILIA_RESTRITO' | 'CONVIDADO_LEITURA';

export interface BiometricIdentityBadge {
  personId: string;
  name: string;
  role: BiometricRole;
  relation: 'DESENVOLVEDOR_ADMIN' | 'PROPRIETARIO_CFO' | 'ESPOSA' | 'FILHA' | 'PARENTES' | 'DESCONHECIDO';
  confidence: number; // 0 a 1
  avatarUrl?: string;
  permissions: {
    canAccessFinancial: boolean;
    canAccessOracleServers: boolean;
    canModifySystemSettings: boolean;
    canAccessHomeAssistant: boolean;
    canAccessDailyRoutines: boolean;
    canTriggerHighCostLLM: boolean;
  };
  lastSeen: string;
}

export interface SensoryInputPayload {
  // Canal 1: Voz
  voiceAudioTranscription?: string;
  voiceAudioDurationSec?: number;
  // Canal 2: Visão Computacional
  screenCaptureBase64?: string;
  screenCaptureActiveWindow?: string;
  cameraFaceDetected?: BiometricIdentityBadge;
  cameraSnapshotBase64?: string;
  // Metadados
  timestamp: string;
  environmentMode: 'TESTING' | 'PRODUCTION';
}

export type LLMEngineType = 'PROPRIETARY_INTEGRATED' | 'COMMERCIAL_FRONTIER';

export interface AIOrchestrationDecision {
  engineType: LLMEngineType;
  modelChosen: string;
  provider: string;
  reasoning: string;
  chainOfThought: string[];
  privacyClassification: 'STRICT_PRIVATE_INTERNAL' | 'COMMERCIAL_PERMITTED';
  estimatedCostTokens: number;
  estimatedTokensPreserved: number;
  delegatedSubWorkflows: string[];
}

export interface MemoryContextLayer {
  // 1. Memória de Curto Prazo (Por Crachá)
  shortTermHistory: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
    personName: string;
  }>;
  // 2. Memória Semântica & RAG (Vetorial)
  ragDocumentsMatched: Array<{
    id: string;
    title: string;
    category: 'CONTRATOS' | 'MANUAIS' | 'REGRAS_CASA' | 'INVESTIMENTOS_BAZIN' | 'ORACLE_TI';
    snippet: string;
    similarityScore: number;
  }>;
  // 3. Memória Biográfica & Evolução
  evolutionHistory: Array<{
    id: string;
    epoch: number;
    feedbackType: 'ACERTO' | 'CORRECAO_DECENAL' | 'NOVO_PADRAO';
    description: string;
    deltaWeightsApplied: string;
    timestamp: string;
  }>;
}

export type SubWorkflowModuleId =
  | 'MOD_1_NOTAS'
  | 'MOD_1_PESQUISADOR'
  | 'MOD_2_AGENDA'
  | 'MOD_2_COMPRAS'
  | 'MOD_3_FINANCEIRO'
  | 'MOD_3_INFRA_TI'
  | 'MOD_4_HOME_ASSISTANT';

export interface SubWorkflowDefinition {
  id: SubWorkflowModuleId;
  name: string;
  moduleGroup: 'MOD_1_DADOS' | 'MOD_2_ROTINAS' | 'MOD_3_COMPLEXIDADE' | 'MOD_4_RESIDENCIAL';
  moduleGroupName: string;
  description: string;
  iconName: string;
  bodyPartAttached: string;
  codeLanguage: 'TypeScript' | 'Python' | 'JavaScript';
  triggerWebhookPath: string;
  requiredPermission: keyof BiometricIdentityBadge['permissions'];
  status: 'IDLE' | 'EXECUTING' | 'COMPLETED' | 'BLOCKED_RBAC';
  lastExecutionMs?: number;
  lastOutputSummary?: string;
  activeDataTraffic?: {
    inputTokens: number;
    outputTokens: number;
    recordsProcessed: number;
  };
}

export interface N8nVisualNode {
  id: string;
  label: string;
  layer: 'SENSORIAL' | 'ROTEAMENTO' | 'MEMORIA' | 'EXECUCAO' | 'GOVERNANCA';
  nodeType: 'webhook' | 'llm' | 'rag' | 'subworkflow' | 'rbac' | 'tts' | 'stt' | 'code';
  x: number;
  y: number;
  status: 'idle' | 'active' | 'success' | 'warning' | 'denied';
  highlightPulseColor?: string;
  metrics?: {
    latencyMs: number;
    payloadSizeKb: number;
    statusText: string;
  };
}

export interface N8nVisualEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  activePulse: boolean;
  pulseColor: string;
  label?: string;
}

export interface CompleteN8nOrchestrationResult {
  success: boolean;
  requestId: string;
  badgeUsed: BiometricIdentityBadge;
  sensoryEcho: {
    voiceHeard: string;
    screenObserved: boolean;
    faceRecognized: string;
  };
  orchestratorDecision: AIOrchestrationDecision;
  subWorkflowsExecuted: Array<{
    id: SubWorkflowModuleId;
    name: string;
    status: 'SUCCESS' | 'DENIED_BY_RBAC' | 'ERROR';
    output: any;
    durationMs: number;
  }>;
  finalSpeechSynthesisText: string;
  audioOutputUrl?: string;
  evolutionUpdated: boolean;
  rbacSummary: {
    authenticated: boolean;
    clearanceLevel: BiometricRole;
    blockedAttemptsCount: number;
  };
  timestamp: string;
}
