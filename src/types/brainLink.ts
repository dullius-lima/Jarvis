/**
 * BrainLink Neuro-Graph Specification
 * Mapeamento dos conceitos de Neurociência para a Arquitetura de Grafos do JARVIS:
 * - Dendritos (Input Interfaces): Portas receptoras de nós (Webhooks, Filas, Funções)
 * - Axônios (Transmission Edges): Linhas físicas de conexão (arestas do grafo)
 * - Sinapses (Data Payload Exchange): Momento de entrega da carga ao dendrito receptor
 */

export type NeurotransmitterType =
  | 'ADRENALINA'     // Pulsação vermelha ultrarrápida para alarmes e alertas críticos
  | 'DOPAMINA'       // Brilho dourado para comandos e tarefas concluídos com sucesso
  | 'SEROTONINA'     // Pulso azul cadenciado para rotinas e processamento de fundo
  | 'ACETILCOLINA'   // Pulso violeta indicando escuta ativa do microfone e transcrição
  | 'CORTISOL'       // Amarelo/laranja pulsante sinalizando erros, falhas e retentativas
  | 'GABA';          // Roxo inibitório para contenção de taxa (rate limiting) e barramentos bloqueados

export interface NeurotransmitterConfig {
  type: NeurotransmitterType;
  name: string;
  colorHex: string;
  colorThree: number;
  secondaryColorHex: string;
  pulseSpeed: number; // multiplicador de velocidade (1.0 = normal, 2.5 = adrenalina)
  frequency: number;  // oscilação
  glowIntensity: number;
  description: string;
  meaning: string;
}

export const NEUROTRANSMITTER_CONFIGS: Record<NeurotransmitterType, NeurotransmitterConfig> = {
  ADRENALINA: {
    type: 'ADRENALINA',
    name: 'Adrenalina',
    colorHex: '#ff1744',
    colorThree: 0xff1744,
    secondaryColorHex: '#d50000',
    pulseSpeed: 3.2,
    frequency: 18.0,
    glowIntensity: 2.5,
    description: 'Pulsação vermelha ultrarrápida para alarmes e alertas críticos.',
    meaning: 'Alerta Crítico / Sentinela Ativa',
  },
  DOPAMINA: {
    type: 'DOPAMINA',
    name: 'Dopamina',
    colorHex: '#ffd700',
    colorThree: 0xffd700,
    secondaryColorHex: '#ffab00',
    pulseSpeed: 1.6,
    frequency: 6.0,
    glowIntensity: 2.2,
    description: 'Brilho dourado para comandos e tarefas concluídos com sucesso.',
    meaning: 'Recompensa / Tarefa Concluída',
  },
  SEROTONINA: {
    type: 'SEROTONINA',
    name: 'Serotonina',
    colorHex: '#00e5ff',
    colorThree: 0x00e5ff,
    secondaryColorHex: '#00b0ff',
    pulseSpeed: 1.0,
    frequency: 3.5,
    glowIntensity: 1.5,
    description: 'Pulso azul cadenciado para rotinas e processamento de fundo.',
    meaning: 'Rotina Estável / Sincronização',
  },
  ACETILCOLINA: {
    type: 'ACETILCOLINA',
    name: 'Acetilcolina',
    colorHex: '#d500f9',
    colorThree: 0xd500f9,
    secondaryColorHex: '#aa00ff',
    pulseSpeed: 2.0,
    frequency: 9.0,
    glowIntensity: 2.0,
    description: 'Pulso violeta indicando escuta ativa do microfone e transcrição.',
    meaning: 'Atenção Focada / Escuta & STT',
  },
  CORTISOL: {
    type: 'CORTISOL',
    name: 'Cortisol',
    colorHex: '#ff6d00',
    colorThree: 0xff6d00,
    secondaryColorHex: '#ff3d00',
    pulseSpeed: 2.4,
    frequency: 14.0,
    glowIntensity: 2.3,
    description: 'Amarelo/laranja pulsante sinalizando erros, falhas e retentativas.',
    meaning: 'Estresse / Erro / Retentativa',
  },
  GABA: {
    type: 'GABA',
    name: 'GABA',
    colorHex: '#651fff',
    colorThree: 0x651fff,
    secondaryColorHex: '#3d5afe',
    pulseSpeed: 0.5,
    frequency: 2.0,
    glowIntensity: 1.2,
    description: 'Roxo inibitório para contenção de taxa (rate limiting) e barramentos bloqueados.',
    meaning: 'Inibição / Rate Limit / Bloqueio',
  },
};

export interface BrainLinkEvent {
  axon_id: string;
  source_dendrite: string;
  target_dendrite: string;
  direction: 'FORWARD' | 'BACKWARD';
  timestamp: number | string;
  sequence_id: number;
  intensity: number; // float 0.0 a 1.0
  neurotransmitter_type: NeurotransmitterType;
  status?: 'SUCCESS' | 'FAILED' | 'IN_TRANSIT'; // FAILED dispara animação de "Sinapse Quebrada" com faísca
  payload_summary?: string;
  ttl_ms?: number; // Tempo de vida do pulso antes do fade-out (default: 2500ms)
}

export interface BrainLinkEventBundle {
  type: 'BUNDLE';
  bundle_id: string;
  timestamp: number;
  events: BrainLinkEvent[];
  batch_size: number;
}

export interface DendriteNode {
  id: string;
  name: string;
  type: 'core' | 'webhook' | 'queue_reader' | 'function' | 'agent' | 'tool';
  label: string;
  position: [number, number, number];
  color: number;
  electrical_charge: number; // 0.0 a 1.0
  lastStimulus: number;
  metadata?: Record<string, any>;
}

export interface AxonEdge {
  id: string;
  source_dendrite: string;
  target_dendrite: string;
  name: string;
  description: string;
  active: boolean;
  lastTransmission?: number;
  brokenState?: boolean;
}

// Nós Dendritos Fixos do Cérebro Neural (Ancorados estritamente na superfície dos lobos anatômicos)
export const DEFAULT_DENDRITES: DendriteNode[] = [
  {
    id: 'dendrite-core-jarvis',
    name: 'Jarvis Neural Core',
    label: 'CÉREBRO CENTRAL',
    type: 'core',
    position: [0, 0, 0], // Núcleo Central Tálamo-Límbico
    color: 0x22d3ee,
    electrical_charge: 1.0,
    lastStimulus: Date.now(),
  },
  {
    id: 'dendrite-webhook-voice',
    name: 'Webhook de Voz & STT',
    label: 'ENTRADA MICROFONE',
    type: 'webhook',
    position: [-1.05, -0.10, 0.40], // Lobo Temporal Esquerdo (Área Auditiva de Wernicke)
    color: 0xd500f9,
    electrical_charge: 0.0,
    lastStimulus: 0,
  },
  {
    id: 'dendrite-webhook-universal',
    name: 'Universal Inbox / API',
    label: 'PORTA HTTP INGRESS',
    type: 'webhook',
    position: [0.0, -0.85, -0.45], // Tronco Encefálico (Eixo Ingress Neural)
    color: 0x00e5ff,
    electrical_charge: 0.0,
    lastStimulus: 0,
  },
  {
    id: 'dendrite-agent-cfo',
    name: 'Agente CFO Dullius',
    label: 'FINANÇAS & CAPITAL',
    type: 'agent',
    position: [0.35, 0.65, 0.90], // Lobo Frontal Dorsolateral (Córtex Executivo)
    color: 0xffd700,
    electrical_charge: 0.0,
    lastStimulus: 0,
  },
  {
    id: 'dendrite-agent-sentinel',
    name: 'Sentinela & Firewall 24/7',
    label: 'SEGURANÇA & ALARME',
    type: 'agent',
    position: [0.0, 0.25, -1.25], // Lobo Occipital (Córtex Visual & Sentinela)
    color: 0xff1744,
    electrical_charge: 0.0,
    lastStimulus: 0,
  },
  {
    id: 'dendrite-tool-whisper',
    name: 'Local Whisper Engine',
    label: 'TRANSCRIÇÃO LOCAL',
    type: 'tool',
    position: [-0.95, -0.35, 0.25], // Lobo Temporal Esquerdo Inferior
    color: 0xa855f7,
    electrical_charge: 0.0,
    lastStimulus: 0,
  },
  {
    id: 'dendrite-tool-edge-tts',
    name: 'Edge-TTS Voice Synth',
    label: 'SÍNTESE DE ÁUDIO',
    type: 'tool',
    position: [1.05, -0.10, 0.40], // Lobo Temporal Direito
    color: 0x38bdf8,
    electrical_charge: 0.0,
    lastStimulus: 0,
  },
  {
    id: 'dendrite-queue-n8n',
    name: 'n8n Workflow Queue',
    label: 'BARRAMENTO N8N',
    type: 'queue_reader',
    position: [0.42, -0.65, -0.95], // Cerebelo Posterior Direito
    color: 0x651fff,
    electrical_charge: 0.0,
    lastStimulus: 0,
  },
];

// Axônios de Transmissão Pré-mapeados
export const DEFAULT_AXONS: AxonEdge[] = [
  {
    id: 'axon-core-voice',
    source_dendrite: 'dendrite-core-jarvis',
    target_dendrite: 'dendrite-webhook-voice',
    name: 'Axônio Acústico (STT)',
    description: 'Transporte de transcrição de comandos de voz',
    active: true,
  },
  {
    id: 'axon-core-universal',
    source_dendrite: 'dendrite-core-jarvis',
    target_dendrite: 'dendrite-webhook-universal',
    name: 'Axônio Universal HTTP',
    description: 'Transmissão assíncrona de requisições de agentes externos',
    active: true,
  },
  {
    id: 'axon-core-cfo',
    source_dendrite: 'dendrite-core-jarvis',
    target_dendrite: 'dendrite-agent-cfo',
    name: 'Axônio Estratégico CFO',
    description: 'Decisões e alocação de capital',
    active: true,
  },
  {
    id: 'axon-core-sentinel',
    source_dendrite: 'dendrite-core-jarvis',
    target_dendrite: 'dendrite-agent-sentinel',
    name: 'Axônio Sentinela de Alarme',
    description: 'Alertas críticos de segurança e integridade',
    active: true,
  },
  {
    id: 'axon-voice-whisper',
    source_dendrite: 'dendrite-webhook-voice',
    target_dendrite: 'dendrite-tool-whisper',
    name: 'Axônio de VAD/Whisper',
    description: 'Pipeline de áudio PCM para texto',
    active: true,
  },
  {
    id: 'axon-core-tts',
    source_dendrite: 'dendrite-core-jarvis',
    target_dendrite: 'dendrite-tool-edge-tts',
    name: 'Axônio Eferente Vocal',
    description: 'Disparo de fala nos alto-falantes',
    active: true,
  },
  {
    id: 'axon-core-n8n',
    source_dendrite: 'dendrite-core-jarvis',
    target_dendrite: 'dendrite-queue-n8n',
    name: 'Axônio de Integração n8n',
    description: 'Comunicação neural com a nuvem e orquestração de nós',
    active: true,
  },
];
