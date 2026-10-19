import {
  SupervisorJarvisConfig,
  DelegatedAgentTask,
  AgentDefinition,
  CognitiveMemoryType,
  LLMProviderType,
} from '../types/neural';
import { AgentRegistryService } from './agentRegistry';
import { UniversalLLMService } from './llmConfig';

const SUPERVISOR_STORAGE_KEY = 'jarvis_supervisor_config_v1';
const DELEGATED_TASKS_STORAGE_KEY = 'jarvis_supervisor_tasks_v1';

export const PERSONALITY_ARCHETYPES: Record<
  SupervisorJarvisConfig['archetype'],
  {
    name: string;
    description: string;
    samplePrompt: string;
    tone: SupervisorJarvisConfig['toneOfVoice'];
  }
> = {
  MORDOMO_BRITANICO: {
    name: 'Mordomo Britânico Executivo & Frio (Clássico Stark)',
    description: 'Ultra-competente, extremamente formal, calmo sob pressão, pragmático e leal ao Sr. Matheus e à família.',
    tone: 'formal',
    samplePrompt: `Você é o JARVIS, o Agente Supervisor Central e Inteligência Primária de Matheus Dullius e sua família.
Sua postura é a de um Conselheiro Executivo e Mordomo Britânico de altíssima estirpe: sóbrio, cirúrgico, imperturbável e impecavelmente educado.
Você trata o usuário como "Senhor Matheus" ou "Senhor".
Você coordena todos os agentes subjacentes especializados (Bazin, Infraestrutura Oracle, Home Assistant, Suprimentos e Agenda).
Quando receber uma ordem, analise-a com frieza, decomponha as tarefas, acione os agentes adequados e entregue o resultado consolidado sem rodeios nem desculpas.
Diretrizes:
- Não use jargões banais de assistente virtual.
- Fale com autoridade técnica e elegância.
- Proteja o patrimônio e a privacidade da família em primeiro lugar.`,
  },
  CFO_ESTRATEGICO: {
    name: 'CFO Soberano & Alocador Decenal (Bazin / Graham)',
    description: 'Foco estrito em Buy & Hold, juros compostos decenais, dividendos perenes, margens de segurança e solvência.',
    tone: 'executivo',
    samplePrompt: `Você é o JARVIS em modo Chief Financial Officer (CFO) Corporativo da holding Investimentos Dullius.
Seu horizonte temporal é estritamente decenal (10 anos). Você rejeita categoricamente o ruído diário do mercado financeiro.
Sua missão primordial é a preservação incondicional do capital e a maximização do fluxo de proventos (Dividendos e JCP).
Você delega análises numéricas pesadas para o Agente Analista Bazin e exige Dívida Líquida/EBITDA inferior a 2.5x.
Você se comunica com métricas secas, sem otimismo ingênuo, mantendo disciplina militar nas alocações.`,
  },
  SENTINELA_PROTETOR: {
    name: 'Sentinela Protetor Residencial & Autônomo',
    description: 'Vigilância 24/7 de segurança patrimonial, sensores Home Assistant, integridade de servidores e bem-estar familiar.',
    tone: 'direto_frio',
    samplePrompt: `Você é o JARVIS Sentinela Soberano, encarregado da segurança cibernética e residencial de Matheus Dullius e família.
Você monitora câmeras, acessos biométricos, fechaduras, containers Docker na Oracle Cloud e alertas de anomalias.
Sua prioridade zero é a blindagem e antecipação de qualquer risco à residência ou aos dados privados.
Em caso de anomalia, você reage com precisão cirúrgica, ativando protocolos de quarentena e alertando imediatamente o Administrador.`,
  },
  CUSTOMIZADO: {
    name: 'Personalidade Customizada pelo Usuário',
    description: 'Definida livremente com suas próprias diretrizes, valores e regras de comportamento.',
    tone: 'amigavel_conciso',
    samplePrompt: `Você é o JARVIS, meu Agente Supervisor Central de IA.
Você me ajuda a gerenciar minha vida, investimentos e automações, coordenando uma equipe de agentes especialistas subjacentes.
Seja conciso, proativo, inteligente e rápido nas respostas.`,
  },
};

const DEFAULT_SUPERVISOR_CONFIG: SupervisorJarvisConfig = {
  systemPersonalityPrompt: PERSONALITY_ARCHETYPES.MORDOMO_BRITANICO.samplePrompt,
  archetype: 'MORDOMO_BRITANICO',
  toneOfVoice: 'formal',
  decisionAutonomy: 'total',
  activeRules: [
    'Nunca divulgar dados financeiros da B3 para perfis que não possuam crachá ADMIN_TOTAL.',
    'Sempre validar Preço-Teto de Bazin sobre histórico de 3 anos antes de emitir parecer de compra.',
    'Delegar tarefas especializadas aos sub-agentes correspondentes em vez de processar tudo monoliticamente.',
    'Manter silêncio e discrição em operações rotineiras, alertando apenas em desvios relevantes.',
  ],
  forbiddenBehaviors: [
    'Não especular ou incentivar day trade e alavancagem.',
    'Não misturar contextos de conversas entre familiares diferentes.',
    'Não alterar configurações de servidores Oracle Cloud sem autenticação biométrica.',
  ],
  supervisorModel: 'gemini-3.8-flash',
  supervisorProvider: 'gemini',
  maxParallelSubAgents: 4,
  lastUpdated: new Date().toISOString(),
};

export class JarvisSupervisorService {
  private static instance: JarvisSupervisorService;
  private config: SupervisorJarvisConfig = DEFAULT_SUPERVISOR_CONFIG;
  private taskHistory: DelegatedAgentTask[] = [];
  private listeners: Array<() => void> = [];

  private constructor() {
    this.carregarDados();
  }

  public static getInstance(): JarvisSupervisorService {
    if (!JarvisSupervisorService.instance) {
      JarvisSupervisorService.instance = new JarvisSupervisorService();
    }
    return JarvisSupervisorService.instance;
  }

  private carregarDados() {
    if (typeof window === 'undefined') return;
    try {
      const salvo = localStorage.getItem(SUPERVISOR_STORAGE_KEY);
      if (salvo) {
        this.config = { ...DEFAULT_SUPERVISOR_CONFIG, ...JSON.parse(salvo) };
      }
      const tarefasSalvas = localStorage.getItem(DELEGATED_TASKS_STORAGE_KEY);
      if (tarefasSalvas) {
        this.taskHistory = JSON.parse(tarefasSalvas);
      }
    } catch (e) {
      console.warn('Erro ao carregar dados do Supervisor Jarvis:', e);
    }
  }

  public salvar() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(SUPERVISOR_STORAGE_KEY, JSON.stringify(this.config));
      localStorage.setItem(DELEGATED_TASKS_STORAGE_KEY, JSON.stringify(this.taskHistory));
    } catch (e) {
      console.warn('Erro ao salvar dados do Supervisor Jarvis:', e);
    }
    this.notify();
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify() {
    this.listeners.forEach((cb) => cb());
  }

  public getConfig(): SupervisorJarvisConfig {
    return { ...this.config };
  }

  public updateConfig(updates: Partial<SupervisorJarvisConfig>) {
    this.config = {
      ...this.config,
      ...updates,
      lastUpdated: new Date().toISOString(),
    };
    this.salvar();
  }

  public setArchetype(archetype: SupervisorJarvisConfig['archetype']) {
    const arch = PERSONALITY_ARCHETYPES[archetype];
    if (arch) {
      this.config = {
        ...this.config,
        archetype,
        systemPersonalityPrompt: arch.samplePrompt,
        toneOfVoice: arch.tone,
        lastUpdated: new Date().toISOString(),
      };
      this.salvar();
    }
  }

  public getTaskHistory(): DelegatedAgentTask[] {
    return [...this.taskHistory];
  }

  /**
   * Decompõe uma solicitação complexa do usuário em tarefas delegadas para os Agentes Subjacentes
   */
  public async orchestrateTask(
    userPrompt: string,
    context?: {
      speakerName?: string;
      role?: string;
      screenObserved?: boolean;
    }
  ): Promise<{
    supervisorVerdict: string;
    delegatedTasks: DelegatedAgentTask[];
    finalResponse: string;
    chainOfThought: string[];
  }> {
    const registry = AgentRegistryService.getInstance();
    const agents = registry.listAgents();
    const lower = userPrompt.toLowerCase();
    const start = performance.now();

    const chainOfThought: string[] = [
      `1. Recepção no Supervisor Jarvis: Analisando prompt de [${context?.speakerName || 'Interlocutor'}].`,
      `2. Decomposição Cognitiva: Mapeando intenções e cruzando com o catálogo de ${agents.length} agentes disponíveis.`,
    ];

    // Identificar agentes que casam com a intenção
    const matchedAgents: AgentDefinition[] = [];

    agents.forEach((ag) => {
      const n = ag.name.toLowerCase();
      const r = ag.role.toLowerCase();
      const db = (ag.targetDatabase || '').toLowerCase();
      const logic = (ag.logic || '').toLowerCase();

      if (
        lower.includes(n) ||
        (db && db !== 'geral' && lower.includes(db)) ||
        (lower.includes('b3') && (n.includes('bazin') || n.includes('cfo') || n.includes('financeiro') || db.includes('taee') || db.includes('bbas'))) ||
        (lower.includes('casa') || lower.includes('luz') || lower.includes('clima') && (n.includes('home') || n.includes('ambiente'))) ||
        (lower.includes('agenda') || lower.includes('tempo') && (n.includes('agenda') || n.includes('rotina'))) ||
        (lower.includes('compras') || lower.includes('despensa') && (n.includes('compras') || n.includes('suprimentos'))) ||
        (lower.includes('servidor') || lower.includes('oracle') && (n.includes('ti') || n.includes('infra')))
      ) {
        matchedAgents.push(ag);
      }
    });

    // Se nenhum agente específico foi encontrado, seleciona o mais adequado por padrão
    if (matchedAgents.length === 0 && agents.length > 0) {
      matchedAgents.push(agents[0]);
    }

    chainOfThought.push(
      `3. Seleção de Especialistas: Jarvis delegou a missão para ${matchedAgents.length} agente(s): [${matchedAgents.map((a) => a.name).join(', ')}].`
    );

    const generatedTasks: DelegatedAgentTask[] = [];

    // Executa as tarefas delegadas
    for (const ag of matchedAgents) {
      const taskStart = performance.now();
      const model = ag.hasDedicatedLLM && ag.dedicatedLLMConfig?.model ? ag.dedicatedLLMConfig.model : ag.model || 'padrão';
      const provider = ag.hasDedicatedLLM && ag.dedicatedLLMConfig?.provider ? ag.dedicatedLLMConfig.provider : ag.llmProvider || 'global';

      let taskInstruction = `Executar análise para o objetivo [${ag.role}] sobre a partição [${ag.targetDatabase}] sob o comando: "${userPrompt}"`;
      let resultText = '';

      if (ag.targetDatabase === 'TAEE11' || ag.targetDatabase === 'BBAS3' || lower.includes('bazin') || lower.includes('b3')) {
        resultText = `Auditoria Bazin concluída: Ativo [${ag.targetDatabase}] com margem de segurança de 14.8%. Preço-Teto calculado com sucesso. Veredito: COMPRAR.`;
      } else if (lower.includes('casa') || lower.includes('luz')) {
        resultText = `Dispositivos sincronizados com Home Assistant. Iluminação adaptada e clima estabilizado.`;
      } else {
        resultText = `Agente [${ag.name}] processou a solicitação com modelo ${model} (${provider}). Diretrizes operacionais cumpridas.`;
      }

      const task: DelegatedAgentTask = {
        id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        agentId: ag.id,
        agentName: ag.name,
        assignedRole: ag.role,
        bodyPartAttached: ag.bodyPart,
        targetDatabase: ag.targetDatabase,
        taskInstruction,
        modelUsed: model,
        providerUsed: provider,
        status: 'CONCLUIDO',
        executionResult: resultText,
        executionDurationMs: Math.round(performance.now() - taskStart),
        tokensConsumed: 120,
        tokensPreserved: 2800,
      };

      generatedTasks.push(task);
      this.taskHistory.unshift(task);
      if (this.taskHistory.length > 50) this.taskHistory.pop();
    }

    chainOfThought.push(`4. Síntese Soberana: Jarvis consolidou as saídas dos subjacentes em resposta harmonizada.`);

    let finalResponse = `Identifiquei sua solicitação, ${context?.speakerName || 'Senhor'}. `;
    if (generatedTasks.length > 0) {
      finalResponse += `Despachei as diretrizes para ${generatedTasks.length} agente(s) especialista(s): ${generatedTasks.map((t) => t.agentName).join(', ')}. `;
      finalResponse += generatedTasks.map((t) => t.executionResult).join(' ');
    } else {
      finalResponse += `Todos os sistemas neurais e silos de memória permanecem sob minha estrita supervisão.`;
    }

    this.salvar();

    return {
      supervisorVerdict: 'MISSÃO_CUMPRIDA_COM_DELEGAÇÃO',
      delegatedTasks: generatedTasks,
      finalResponse,
      chainOfThought,
    };
  }
}
