import { AgentDefinition, AgentAuditResult, LLMProviderType } from '../types/neural';
import { MicroDatastoresService } from './microDatastores';

const STORAGE_KEY = 'jarvis_agent_registry_v1';

// Agentes de IA especialistas pré-configurados para a Holding Dullius e família
const INITIAL_AGENTS: AgentDefinition[] = [
  {
    id: 'cfo-bazin-auditor',
    name: 'CFO Chefe · Auditor Bazin & Solvência',
    role: 'Auditor Sênior de Alocação de Capital (Buy & Hold)',
    targetDatabase: 'GERAL',
    logic: `Postura fria, técnica e determinística.
1. Valuation (Bazin): O Preço-Teto (DY médio 3-5 anos a 6% a.a.) é soberano. Se cotação > teto, veredito = AGUARDAR.
2. Solvência: Dívida Líquida / EBITDA máximo tolerado de 3,5x. Acima disto, alerta crítico.
3. Qualidade Contábil: Lucro crescente sem FCO consistente é indício de risco.
4. Matriz de Veredito: COMPRAR, AGUARDAR ou QUARENTENA.`,
    llmProvider: 'global',
    model: 'padrão-sistema',
    status: 'ativo',
    lastAuditVerdict: 'COMPRAR',
    lastAuditDetails: 'Auditoria consolidada: Foco estrito em fluxo de proventos e solvência. Nenhuma anomalia de governança detectada.',
    lastAuditDate: 'Hoje, 21:00',
    triggers: ['Margem de Bazin < 0%', 'Dívida/EBITDA > 3.5x', 'FCO negativo com lucro'],
    isAutonomous: true,
    createdAt: '10/10/2026',
    author: 'Investimentos Dullius',
  },
  {
    id: 'sentinela-taee11',
    name: 'Sentinela Bazin TAEE11',
    role: 'Auditor Especialista em Transmissão Elétrica',
    targetDatabase: 'TAEE11',
    logic: `Auditar Taesa com Preço-Teto Bazin de R$ 38.83.
Se cotação < R$ 38.83 com margem de segurança > 10% e Dívida Líquida/EBITDA < 3.5x, emitir COMPRAR.
Acompanhar ciclo de reajuste da RAP e endividamento de debêntures de transmissão.`,
    llmProvider: 'global',
    model: 'padrão-sistema',
    status: 'alerta',
    lastAuditVerdict: 'COMPRAR',
    lastAuditDetails: 'Cotação a R$ 34.20 opera com margem de segurança de +13.5% frente ao teto Bazin de R$ 38.83. Alavancagem em 3.42x com geração previsível.',
    lastAuditDate: '14/10/2026 19:30',
    triggers: ['Cotação < R$ 38.83', 'Margem > 10%', 'Alavancagem > 3.5x'],
    isAutonomous: true,
    createdAt: '10/10/2026',
    author: 'Jarvis Auto',
  },
  {
    id: 'sentinela-bbas3',
    name: 'Sentinela Basileia & Agro BBAS3',
    role: 'Auditor Especialista em Sistema Bancário & Agronegócio',
    targetDatabase: 'BBAS3',
    logic: `Auditar Banco do Brasil através do Preço-Teto Bazin de R$ 32.50.
Monitorar Índice de Basileia, inadimplência da carteira de crédito rural e cumprimento do Payout mínimo de 40%.
Manter recomendação de COMPRAR enquanto P/VP < 0.9x e ROE > 18%.`,
    llmProvider: 'global',
    model: 'padrão-sistema',
    status: 'ativo',
    lastAuditVerdict: 'COMPRAR',
    lastAuditDetails: 'Cotação a R$ 27.80 com margem de +16.9% frente ao teto. P/VP atrativo e ROE de 21.4% com dividendo semestral assegurado.',
    lastAuditDate: '14/10/2026 19:15',
    triggers: ['Inadimplência Agro > 2.5%', 'Basileia < 12%', 'Cotação > Teto'],
    isAutonomous: true,
    createdAt: '10/10/2026',
    author: 'Jarvis Auto',
  },
  {
    id: 'sentinela-wege3',
    name: 'Sentinela ROIC & Valuation WEGE3',
    role: 'Auditor de Eficiência Industrial & Alocação Internacional',
    targetDatabase: 'WEGE3',
    logic: `Auditar WEG considerando crescimento secular e ROIC decenal > 25%.
Negociação com prêmio sobre o teto estrito de Bazin tolerada apenas pelo alto reinvestimento de capital.
Veredito de alocação conservador: AGUARDAR recuo para aproximação de múltiplos ou reinvestir frações via proventos.`,
    llmProvider: 'global',
    model: 'padrão-sistema',
    status: 'ativo',
    lastAuditVerdict: 'AGUARDAR',
    lastAuditDetails: 'ROIC excepcional de 31.8% e caixa líquido, porém cotação a R$ 54.10 está acima do teto Bazin puro. Sem margem de segurança para aportes pesados.',
    lastAuditDate: '14/10/2026 18:40',
    triggers: ['ROIC < 20%', 'Perda de margem EBITDA > 300bps'],
    isAutonomous: true,
    createdAt: '11/10/2026',
    author: 'Jarvis Auto',
  },
  {
    id: 'sentinela-btc-247',
    name: 'Sentinela Cripto 24/7 BTC',
    role: 'Monitor Autônomo de Redes Descentralizadas',
    targetDatabase: 'BTC',
    logic: `Silêncio operacional rigoroso no ruído diário.
Ignorar fluxo de caixa ou P/L.
Auditar exclusivamente: suporte técnico nos clusters institucionais, segurança por Hash Rate e volatilidade anormal (> 5% em 1h ou > 8% em 24h).`,
    llmProvider: 'global',
    model: 'padrão-sistema',
    status: 'ativo',
    lastAuditVerdict: 'ESTAVEL',
    lastAuditDetails: 'Bitcoin operando em regime de calmaria institucional a US$ 67.450. Hash rate nos máximos históricos. Silêncio mantido.',
    lastAuditDate: '14/10/2026 20:00',
    triggers: ['Variação 1h > 5%', 'Variação 24h > 8%', 'Queda de Hash Rate'],
    isAutonomous: true,
    createdAt: '09/10/2026',
    author: 'Jarvis Auto',
  },
  {
    id: 'sentinela-saude-familiar',
    name: 'Sentinela Preventiva de Saúde',
    role: 'Auditor Médico & Bem-Estar da Família Dullius',
    targetDatabase: 'SAUDE_FAMILIA',
    logic: `Acompanhar calendário de exames preventivos, receitas recorrentes e consultas de rotina.
Disparar aviso ao Jarvis 24 horas antes de consultas médicas e alertar sobre periodicidade de check-ups.`,
    llmProvider: 'global',
    model: 'padrão-sistema',
    status: 'ativo',
    lastAuditVerdict: 'OK',
    lastAuditDetails: 'Todos os exames periódicos em dia. Próxima consulta pediátrica agendada para terça-feira às 08:30.',
    lastAuditDate: '14/10/2026 16:30',
    triggers: ['Consulta em < 24h', 'Exame vencido há > 12 meses'],
    isAutonomous: true,
    createdAt: '08/10/2026',
    author: 'Jarvis Auto',
  },
  {
    id: 'sentinela-rotinas-domesticas',
    name: 'Sentinela de Rotinas & Segurança Doméstica',
    role: 'Coordenador Autônomo de Compromissos e Automação',
    targetDatabase: 'ROTINAS_CASA',
    logic: `Sincronizar rotinas da família, trancamento perimetral noturno às 22:30 e horário de aulas/esportes dos dependentes.
Emitir sinapse e alerta de voz ao Jarvis 30 minutos antes de deslocamentos e atividades escolares.`,
    llmProvider: 'global',
    model: 'padrão-sistema',
    status: 'ativo',
    lastAuditVerdict: 'OK',
    lastAuditDetails: 'Rotinas sincronizadas com perfeição. Dispositivos e acessos sem incidentes.',
    lastAuditDate: '14/10/2026 18:00',
    triggers: ['Conflito de horários', 'Alarme não armado após 23:00'],
    isAutonomous: true,
    createdAt: '08/10/2026',
    author: 'Jarvis Auto',
  },
];

export class AgentRegistryService {
  private static instance: AgentRegistryService;
  private agents: Record<string, AgentDefinition> = {};

  private constructor() {
    this.carregarAgentes();
  }

  public static getInstance(): AgentRegistryService {
    if (!AgentRegistryService.instance) {
      AgentRegistryService.instance = new AgentRegistryService();
    }
    return AgentRegistryService.instance;
  }

  private carregarAgentes() {
    if (typeof window === 'undefined') {
      INITIAL_AGENTS.forEach((a) => {
        this.agents[a.id] = a;
      });
      return;
    }

    try {
      const salvo = localStorage.getItem(STORAGE_KEY);
      if (salvo) {
        const parsed: Record<string, AgentDefinition> = JSON.parse(salvo);
        this.agents = parsed;
        // Garantir que agentes padrão essenciais existam
        INITIAL_AGENTS.forEach((a) => {
          if (!this.agents[a.id]) {
            this.agents[a.id] = a;
          }
        });
      } else {
        INITIAL_AGENTS.forEach((a) => {
          this.agents[a.id] = a;
        });
        this.salvar();
      }
    } catch {
      INITIAL_AGENTS.forEach((a) => {
        this.agents[a.id] = a;
      });
    }
  }

  private salvar() {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.agents));
      } catch (e) {
        console.warn('Erro ao salvar AgentRegistry:', e);
      }
    }
  }

  public listAgents(): AgentDefinition[] {
    return Object.values(this.agents);
  }

  public getAgent(id: string): AgentDefinition | undefined {
    return this.agents[id];
  }

  public registerAgent(agent: AgentDefinition): void {
    this.agents[agent.id] = agent;
    this.salvar();
  }

  public updateAgent(id: string, updates: Partial<AgentDefinition>): void {
    if (!this.agents[id]) return;
    this.agents[id] = {
      ...this.agents[id],
      ...updates,
    };
    this.salvar();
  }

  public deleteAgent(id: string): boolean {
    if (this.agents[id]) {
      delete this.agents[id];
      this.salvar();
      return true;
    }
    return false;
  }

  /**
   * Autocria um novo agente especialista quando um novo banco de dados é criado.
   * Permite que o Jarvis delegue tarefas de auditoria para este especialista.
   */
  public createAgentForDatabase(
    dbKey: string,
    type: 'ativo_b3' | 'cripto' | 'saude' | 'familia' | 'rotina' | string,
    customLogic?: string
  ): AgentDefinition {
    const cleanKey = dbKey.toUpperCase().trim();
    const agentId = `agente-autocriado-${cleanKey.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    // Se já existir, retorna o existente
    if (this.agents[agentId]) {
      return this.agents[agentId];
    }

    let defaultRole = `Auditor Especialista em ${cleanKey}`;
    let defaultLogic = `Auditar ${cleanKey} sob diretrizes estritas da Holding Investimentos Dullius.`;
    let triggers = ['Variação anormal', 'Violação de parâmetros'];

    if (type === 'ativo_b3') {
      defaultRole = `Auditor Bazin & Solvência · ${cleanKey}`;
      defaultLogic = `Auditar cotação de ${cleanKey} contra Preço-Teto Décio Bazin (6% a.a.).
Auditar alavancagem com limite de Dívida Líquida/EBITDA de 3,5x.
Confirmar se Lucro Líquido possui lastro em Fluxo de Caixa Operacional (FCO).
Veredito: COMPRAR (abaixo do teto e solvência intacta), AGUARDAR (sem margem) ou QUARENTENA (deterioração contábil).`;
      triggers = ['Cotação > Preço-Teto', 'Dívida/EBITDA > 3.5x', 'FCO estagnado'];
    } else if (type === 'cripto') {
      defaultRole = `Sentinela de Suporte & Volatilidade · ${cleanKey}`;
      defaultLogic = `Monitorar ${cleanKey} 24/7 com silêncio operacional no ruído diário.
Auditar quebra de suportes institucionais e variações intradiárias superiores a 5%.`;
      triggers = ['Queda > 5% em 1h', 'Queda > 8% em 24h'];
    } else if (type === 'saude') {
      defaultRole = `Auditor de Saúde Preventiva · ${cleanKey}`;
      defaultLogic = `Monitorar calendário de consultas, medicações ativas e rotinas preventivas da família.`;
      triggers = ['Consulta em < 24h'];
    } else if (type === 'rotina') {
      defaultRole = `Sentinela de Rotinas & Automação · ${cleanKey}`;
      defaultLogic = `Auditar e sincronizar cronogramas da residência e deslocamentos familiares.`;
      triggers = ['Atraso em cronograma', 'Compromisso próximo'];
    }

    const novoAgente: AgentDefinition = {
      id: agentId,
      name: `Sentinela ${cleanKey}`,
      role: defaultRole,
      targetDatabase: cleanKey,
      logic: customLogic || defaultLogic,
      llmProvider: 'global',
      model: 'padrão-sistema',
      status: 'ativo',
      lastAuditVerdict: 'ESTAVEL',
      lastAuditDetails: `Agente autogerado e integrado ao banco isolado ${cleanKey}. Pronto para receber delegações de auditoria do Jarvis.`,
      lastAuditDate: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
      triggers,
      isAutonomous: true,
      createdAt: new Date().toLocaleDateString('pt-BR'),
      author: 'Jarvis Auto',
    };

    this.registerAgent(novoAgente);
    return novoAgente;
  }

  /**
   * Delega a tarefa de auditoria para o agente especialista de forma automatizada
   */
  public async delegateAudit(
    agentId: string,
    customInput?: string
  ): Promise<AgentAuditResult> {
    const agent = this.agents[agentId];
    if (!agent) {
      throw new Error(`Agente com ID ${agentId} não encontrado no registro.`);
    }

    this.updateAgent(agentId, { status: 'em_auditoria' });

    // Obter dados do banco isolado associado
    const microService = MicroDatastoresService.getInstance();
    const particao = microService.obterParticao(agent.targetDatabase);

    // Auditoria especializada
    let verdict: 'COMPRAR' | 'AGUARDAR' | 'QUARENTENA' | 'ESTAVEL' | 'ALERTA' | 'OK' = 'ESTAVEL';
    let details = '';
    let recommendations: string[] = [];
    let alertTriggered = false;

    if (particao && particao.tipo === 'ativo_b3') {
      const d = particao.dados || {};
      const cotacao = Number(d.cotacaoAtual || d.cotacao_atual || 30);
      const teto = Number(d.tetoBazin || d.teto_bazin || 35);
      const margem = Number(d.margemSegurancaPct || d.margem_bazin || 0);
      const dlEbitda = Number(d.dlEbitda || d.dl_ebitda || 2.5);

      if (dlEbitda > 3.5) {
        verdict = 'QUARENTENA';
        details = `Alavancagem crítica: Dívida Líquida/EBITDA de ${dlEbitda.toFixed(2)}x supera o teto de solvência de 3.5x.`;
        recommendations = ['Suspender novos aportes', 'Auditar ciclo de Capex', 'Aguardar desregulamentação'];
        alertTriggered = true;
      } else if (cotacao <= teto && margem >= 0) {
        verdict = 'COMPRAR';
        details = `Ativo operando com margem de segurança favorável (+${margem.toFixed(1)}%) abaixo do teto Bazin de R$ ${teto.toFixed(2)}. Solvência preservada em ${dlEbitda.toFixed(2)}x.`;
        recommendations = ['Aporte mensal autorizado', 'Reinvestir dividendos e JCP', 'Manter no core da carteira'];
      } else {
        verdict = 'AGUARDAR';
        details = `Cotação de R$ ${cotacao.toFixed(2)} opera acima do preço-teto Bazin de R$ ${teto.toFixed(2)} (Margem: ${margem.toFixed(1)}%). Sem margem para novas compras.`;
        recommendations = ['Aguardar correção de mercado', 'Reter caixa na Selic', 'Monitorar próximos proventos'];
      }
    } else if (particao && particao.tipo === 'cripto') {
      const d = particao.dados || {};
      const variacao = Math.abs(Number(d.variacao24hPct || 1.2));
      if (variacao > 7.0) {
        verdict = 'ALERTA';
        details = `Volatilidade fora do padrão detectada: Variação de 24h atingiu ${variacao.toFixed(1)}%. Suportes institucionais sob teste.`;
        recommendations = ['Acompanhar volume de liquidação', 'Não alterar posições de longo prazo'];
        alertTriggered = true;
      } else {
        verdict = 'ESTAVEL';
        details = `Regime de silêncio operacional mantido. Variação de ${variacao.toFixed(1)}% dentro da faixa de oscilação normal.`;
        recommendations = ['Manter tese de custódia fria'];
      }
    } else {
      verdict = 'OK';
      details = `Auditoria concluída pelo ${agent.name}. Parâmetros de monitoramento alinhados às diretrizes estipuladas.`;
      recommendations = ['Rotinas em conformidade'];
    }

    if (customInput) {
      details += ` [Nota de Execução: ${customInput}]`;
    }

    const agora = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

    // Atualizar agente com o resultado
    this.updateAgent(agentId, {
      status: alertTriggered ? 'alerta' : 'ativo',
      lastAuditVerdict: verdict,
      lastAuditDetails: details,
      lastAuditDate: agora,
    });

    return {
      agentId,
      agentName: agent.name,
      targetDatabase: agent.targetDatabase,
      verdict,
      details,
      recommendations,
      alertTriggered,
      timestamp: agora,
    };
  }
}
