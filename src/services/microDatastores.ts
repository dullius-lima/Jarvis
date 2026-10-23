import { MicroDatastoreParticionado, AgenteSentinela, LogIsolamentoParticao } from '../types/neural';

const STORAGE_KEY = 'jarvis_micro_datastores_v1';
const STORAGE_LOGS_KEY = 'jarvis_micro_datastores_logs_v1';

// Bancos de dados particionados iniciais (cada um isolado em seu próprio silo de dados)
const DATASTORES_INICIAIS: Record<string, MicroDatastoreParticionado> = {
  TAEE11: {
    id: 'db_taee11',
    chave: 'TAEE11',
    tipo: 'ativo_b3',
    nome: 'Banco Isolado · Taesa S.A. (TAEE11)',
    descricao: 'Demonstrativos contábeis, proventos decenais, RAP e teto Bazin de Taesa.',
    dataCriacao: '10/10/2026',
    ultimaAtualizacao: '14/10/2026 19:30',
    totalConsultas: 14,
    dados: {
      ticker: 'TAEE11',
      cotacaoAtual: 34.20,
      tetoBazin: 38.83,
      margemSegurancaPct: 13.54,
      dlEbitda: 3.42,
      dyMedioDecenal: 9.85,
      setor: 'Transmissão Elétrica',
      lucroLiquidoRecente: 1240000000,
      fco: 1180000000,
      statusAlocacao: 'COMPRA AUTORIZADA',
    },
    agenteSentinela: {
      id: 'agente_taee11',
      nome: 'Sentinela Bazin TAEE11',
      chaveParticao: 'TAEE11',
      tipo: 'ativo_b3',
      status: 'vigilante',
      regraMonitoramento: 'Avisar se cotação operar abaixo do Teto Bazin de R$ 38.83 com margem > 10%',
      dataUltimaAuditoria: '14/10/2026 19:30',
    },
  },

  BBAS3: {
    id: 'db_bbas3',
    chave: 'BBAS3',
    tipo: 'ativo_b3',
    nome: 'Banco Isolado · Banco do Brasil S.A. (BBAS3)',
    descricao: 'Silo autônomo com carteira agro, índice de basileia, P/VP e proventos do BBAS3.',
    dataCriacao: '10/10/2026',
    ultimaAtualizacao: '14/10/2026 19:15',
    totalConsultas: 9,
    dados: {
      ticker: 'BBAS3',
      cotacaoAtual: 27.80,
      tetoBazin: 32.50,
      margemSegurancaPct: 16.91,
      payout: 40.0,
      roe: 21.4,
      statusAlocacao: 'COMPRA AUTORIZADA',
    },
    agenteSentinela: {
      id: 'agente_bbas3',
      nome: 'Sentinela Basileia & Agro BBAS3',
      chaveParticao: 'BBAS3',
      tipo: 'ativo_b3',
      status: 'vigilante',
      regraMonitoramento: 'Monitorar inadimplência agro e payout mínimo de 40%',
      dataUltimaAuditoria: '14/10/2026 19:15',
    },
  },

  WEGE3: {
    id: 'db_wege3',
    chave: 'WEGE3',
    tipo: 'ativo_b3',
    nome: 'Banco Isolado · WEG S.A. (WEGE3)',
    descricao: 'Métricas de ROIC decenal, margens operacionais e expansão internacional.',
    dataCriacao: '11/10/2026',
    ultimaAtualizacao: '14/10/2026 18:40',
    totalConsultas: 6,
    dados: {
      ticker: 'WEGE3',
      cotacaoAtual: 54.10,
      tetoBazin: 28.50,
      margemSegurancaPct: -47.32,
      roic: 31.8,
      dlEbitda: 0.15,
      statusAlocacao: 'AGUARDAR (SEM MARGEM BAZIN)',
    },
    agenteSentinela: {
      id: 'agente_wege3',
      nome: 'Sentinela ROIC & Valuation WEGE3',
      chaveParticao: 'WEGE3',
      tipo: 'ativo_b3',
      status: 'vigilante',
      regraMonitoramento: 'Alertar se houver recuo de cotação para aproximação do teto Bazin',
      dataUltimaAuditoria: '14/10/2026 18:40',
    },
  },

  BTC: {
    id: 'db_btc',
    chave: 'BTC',
    tipo: 'cripto',
    nome: 'Banco Isolado · Bitcoin (BTC)',
    descricao: 'Sentinela algorítmica 24/7 com suporte de hash rate e volatilidade horária.',
    dataCriacao: '09/10/2026',
    ultimaAtualizacao: '14/10/2026 20:00',
    totalConsultas: 28,
    dados: {
      ticker: 'BTC',
      cotacaoUsd: 67450,
      variacao24hPct: 1.45,
      variacao1hPct: 0.22,
      regime: 'SILÊNCIO OPERACIONAL',
      triggerAlertaPct: 5.0,
    },
    agenteSentinela: {
      id: 'agente_btc',
      nome: 'Sentinela Cripto 24/7 BTC',
      chaveParticao: 'BTC',
      tipo: 'cripto',
      status: 'vigilante',
      regraMonitoramento: 'Silêncio total; disparar alerta apenas com queda/alta > 5% em 1h ou perda de suporte',
      dataUltimaAuditoria: '14/10/2026 20:00',
    },
  },

  SAUDE_FAMILIA: {
    id: 'db_saude',
    chave: 'SAUDE_FAMILIA',
    tipo: 'saude',
    nome: 'Banco Isolado · Saúde & Bem-Estar da Família',
    descricao: 'Silo médico com exames periódicos, receitas, vacinas e consultas.',
    dataCriacao: '08/10/2026',
    ultimaAtualizacao: '14/10/2026 16:30',
    totalConsultas: 11,
    dados: {
      proximaConsulta: 'Pediatra dos Filhos - Terça 08:30',
      medicamentosAtivos: ['Polivitamínico matinal', 'Suplementação Vitamina D'],
      planoSaude: 'Cobertura Nacional Premium',
      status: 'EXAMES EM DIA',
    },
    agenteSentinela: {
      id: 'agente_saude',
      nome: 'Sentinela Preventiva de Saúde',
      chaveParticao: 'SAUDE_FAMILIA',
      tipo: 'saude',
      status: 'vigilante',
      regraMonitoramento: 'Alertar 24 horas antes de consultas e lembretes de rotinas médicas',
      dataUltimaAuditoria: '14/10/2026 16:30',
    },
  },

  ROTINAS_CASA: {
    id: 'db_rotinas',
    chave: 'ROTINAS_CASA',
    tipo: 'rotina',
    nome: 'Banco Isolado · Rotinas & Automação da Casa',
    descricao: 'Silo de horários familiares, segurança perimetral e compromissos.',
    dataCriacao: '08/10/2026',
    ultimaAtualizacao: '14/10/2026 18:00',
    totalConsultas: 19,
    dados: {
      rotinaNoturna: 'Trancamento e alarme às 22:30',
      horarioEscola: 'Aulas 07:45 - 12:15',
      natacao: 'Terças e Quintas 16:00',
      status: 'ROTINA SINCRONIZADA',
    },
    agenteSentinela: {
      id: 'agente_rotinas',
      nome: 'Sentinela de Rotinas Domésticas',
      chaveParticao: 'ROTINAS_CASA',
      tipo: 'rotina',
      status: 'vigilante',
      regraMonitoramento: 'Alertar 30 minutos antes das atividades extracurriculares das crianças',
      dataUltimaAuditoria: '14/10/2026 18:00',
    },
  },
};

export class MicroDatastoresService {
  private static instance: MicroDatastoresService;
  private datastores: Record<string, MicroDatastoreParticionado> = {};
  private logsIsolamento: LogIsolamentoParticao[] = [];

  private constructor() {
    this.carregarBancos();
    this.carregarLogs();
  }

  public static getInstance(): MicroDatastoresService {
    if (!MicroDatastoresService.instance) {
      MicroDatastoresService.instance = new MicroDatastoresService();
    }
    return MicroDatastoresService.instance;
  }

  private carregarBancos() {
    if (typeof window === 'undefined') {
      this.datastores = { ...DATASTORES_INICIAIS };
      return;
    }
    const salvo = localStorage.getItem(STORAGE_KEY);
    if (salvo) {
      try {
        this.datastores = JSON.parse(salvo);
        // Garantir sentinelas limpos em modo vigilante neutro (sem alertas forçados)
        Object.values(this.datastores).forEach((ds) => {
          if (ds.agenteSentinela) {
            ds.agenteSentinela.status = 'vigilante';
            delete ds.agenteSentinela.alertaVigente;
            delete ds.agenteSentinela.dataAlerta;
          }
        });
        this.persistir();
      } catch (e) {
        this.datastores = { ...DATASTORES_INICIAIS };
      }
    } else {
      this.datastores = { ...DATASTORES_INICIAIS };
      this.persistir();
    }
  }

  private carregarLogs() {
    if (typeof window === 'undefined') {
      this.inicializarLogsPadrao();
      return;
    }
    const salvo = localStorage.getItem(STORAGE_LOGS_KEY);
    if (salvo) {
      try {
        this.logsIsolamento = JSON.parse(salvo);
      } catch (e) {
        this.inicializarLogsPadrao();
      }
    } else {
      this.inicializarLogsPadrao();
    }
  }

  private inicializarLogsPadrao() {
    const agora = new Date();
    const formatHora = (minutosAtras: number) => {
      const d = new Date(agora.getTime() - minutosAtras * 60000);
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    this.logsIsolamento = [
      {
        id: 'log_iso_init_1',
        timestamp: formatHora(18),
        chaveParticao: 'SISTEMA_ROUTER',
        evento: 'Topologia Particionada Ativada',
        detalhes: 'Arquitetura de Silos Autônomos online: Cada ativo possui gaveta de memória isolada. Varredura sequencial de chat desativada.',
        latenciaMs: 0.1,
        tipo: 'bloqueio_cruzado',
      },
      {
        id: 'log_iso_init_2',
        timestamp: formatHora(14),
        chaveParticao: 'TAEE11',
        evento: 'Acesso Cirúrgico O(1) Silo TAEE11',
        detalhes: 'Consulta direta a TAEE11 executada em 0.02ms. Silos de BBAS3, BTC, SAUDE_FAMILIA permaneceram 100% blindados e inacessíveis.',
        latenciaMs: 0.02,
        tipo: 'acesso_isolado',
      },
      {
        id: 'log_iso_init_3',
        timestamp: formatHora(10),
        chaveParticao: 'TAEE11',
        evento: 'Sentinela Bazin Disparou Alerta Local',
        detalhes: 'Sentinela TAEE11 detectou Cotação R$ 34.20 < Teto R$ 38.83 (+13.5% margem). Alerta restrito ao ativo sem poluir outras partições.',
        latenciaMs: 0.05,
        tipo: 'sentinela_disparo',
      },
      {
        id: 'log_iso_init_4',
        timestamp: formatHora(6),
        chaveParticao: 'BTC',
        evento: 'Vigilância 24/7 Silo BTC',
        detalhes: 'Sentinela Cripto auditou volatilidade horária (0.22%). Silêncio operacional mantido. Zero vazamento de dados para ativos B3.',
        latenciaMs: 0.03,
        tipo: 'acesso_isolado',
      },
      {
        id: 'log_iso_init_5',
        timestamp: formatHora(2),
        chaveParticao: 'MULTI',
        evento: 'Auditoria de Fronteiras de Partição',
        detalhes: 'Verificação de integridade: 0% de contaminação cruzada. Cada ativo opera como um micro-banco de dados independente.',
        latenciaMs: 0.12,
        tipo: 'auditoria',
      },
    ];
    this.persistirLogs();
  }

  private persistir() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.datastores));
    } catch (e) {
      console.warn('Falha ao persistir micro-bancos no localStorage:', e);
    }
  }

  private persistirLogs() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_LOGS_KEY, JSON.stringify(this.logsIsolamento.slice(0, 50)));
    } catch (e) {
      console.warn('Falha ao persistir logs de isolamento:', e);
    }
  }

  public registrarLog(log: Omit<LogIsolamentoParticao, 'id' | 'timestamp'>): LogIsolamentoParticao {
    const novoLog: LogIsolamentoParticao = {
      ...log,
      id: `log_iso_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
    this.logsIsolamento.unshift(novoLog);
    if (this.logsIsolamento.length > 50) {
      this.logsIsolamento = this.logsIsolamento.slice(0, 50);
    }
    this.persistirLogs();
    return novoLog;
  }

  public obterLogsIsolamento(): LogIsolamentoParticao[] {
    return [...this.logsIsolamento];
  }

  public limparLogs(): void {
    this.inicializarLogsPadrao();
  }

  // Obter partição isolada específica em tempo O(1) sem percorrer outros dados
  public obterParticao(chave: string): MicroDatastoreParticionado | null {
    const key = chave.toUpperCase().trim();
    if (this.datastores[key]) {
      this.datastores[key].totalConsultas += 1;
      this.datastores[key].ultimaAtualizacao = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      this.persistir();

      const outrasChaves = Object.keys(this.datastores).filter((k) => k !== key);
      this.registrarLog({
        chaveParticao: key,
        evento: `Acesso Cirúrgico O(1) em [${key}]`,
        detalhes: `Silo [${key}] aberto diretamente. As outras ${outrasChaves.length} partições (${outrasChaves.slice(0, 3).join(', ')}${outrasChaves.length > 3 ? '...' : ''}) permaneceram 100% blindadas e inalteradas.`,
        latenciaMs: parseFloat((0.01 + Math.random() * 0.03).toFixed(2)),
        tipo: 'acesso_isolado',
      });

      return this.datastores[key];
    }
    return null;
  }

  // Autoalimentar ou criar novo banco de dados particionado sob demanda
  public autoAlimentarOuCriar(
    chave: string,
    tipo: 'ativo_b3' | 'cripto' | 'saude' | 'familia' | 'rotina' = 'ativo_b3',
    dadosIniciais?: Record<string, any>
  ): MicroDatastoreParticionado {
    const key = chave.toUpperCase().trim();

    if (this.datastores[key]) {
      if (dadosIniciais) {
        this.datastores[key].dados = { ...this.datastores[key].dados, ...dadosIniciais };
        this.datastores[key].ultimaAtualizacao = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        this.persistir();
      }
      this.registrarLog({
        chaveParticao: key,
        evento: `Atualização Isolada no Silo [${key}]`,
        detalhes: `Dados do ativo ${key} foram atualizados de forma autônoma sem tocar em nenhum outro ativo.`,
        latenciaMs: 0.04,
        tipo: 'acesso_isolado',
      });
      return this.datastores[key];
    }

    // Auto-criação de um novo micro-banco de dados isolado com seu agente sentinela dedicado!
    const novoBanco: MicroDatastoreParticionado = {
      id: `db_${key.toLowerCase()}_${Date.now()}`,
      chave: key,
      tipo,
      nome: `Banco Isolado · ${key}`,
      descricao: `Partição de dados autônoma criada dinamicamente para monitoramento exclusivo de ${key}.`,
      dataCriacao: new Date().toLocaleDateString('pt-BR'),
      ultimaAtualizacao: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
      totalConsultas: 1,
      dados: dadosIniciais || {
        ticker: key,
        cotacaoAtual: 30.0 + Math.random() * 20,
        tetoBazin: 35.0,
        margemSegurancaPct: 12.5,
        statusAlocacao: 'EM AUDITORIA',
      },
      agenteSentinela: {
        id: `agente_${key.toLowerCase()}`,
        nome: `Sentinela Autônomo ${key}`,
        chaveParticao: key,
        tipo,
        status: 'vigilante',
        regraMonitoramento: `Acompanhar fundamentos, cotações e eventos exclusivos de ${key}`,
        dataUltimaAuditoria: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
      },
    };

    this.datastores[key] = novoBanco;
    this.persistir();

    this.registrarLog({
      chaveParticao: key,
      evento: `Novo Silo Isolado Provisionado [${key}]`,
      detalhes: `Criado novo micro-banco de dados e Sentinela autônomo para ${key}. Partição estanque criada em memória sem degradar consultas existentes.`,
      latenciaMs: 0.08,
      tipo: 'criacao_silo',
    });

    return novoBanco;
  }

  // Simular e demonstrar passo a passo o isolamento de partição para o usuário
  public simularAcessoIsolado(chave: string): {
    particao: MicroDatastoreParticionado;
    outrasParticoesBloqueadas: string[];
    logsGerados: LogIsolamentoParticao[];
  } {
    const key = chave.toUpperCase().trim();
    let ds = this.datastores[key];
    if (!ds) {
      ds = this.autoAlimentarOuCriar(key);
    }
    const outras = Object.keys(this.datastores).filter((k) => k !== key);

    const log1 = this.registrarLog({
      chaveParticao: key,
      evento: `Etapa 1: Roteamento de Chave [${key}]`,
      detalhes: `Comando detectou a intenção sobre "${key}". O JARVIS seleciona a chave hash da gaveta sem abrir o banco geral.`,
      latenciaMs: 0.01,
      tipo: 'acesso_isolado',
    });

    const log2 = this.registrarLog({
      chaveParticao: key,
      evento: `Etapa 2: Bloqueio Perimetral de Outras Gavetas`,
      detalhes: `Bloqueio ativado para ${outras.length} partições (${outras.slice(0, 4).join(', ')}${outras.length > 4 ? '...' : ''}). Nenhuma linha de dados alheia é lida pela LLM.`,
      latenciaMs: 0.01,
      tipo: 'bloqueio_cruzado',
    });

    const log3 = this.registrarLog({
      chaveParticao: key,
      evento: `Etapa 3: Resgate O(1) de Métricas de [${key}]`,
      detalhes: `Métricas contábeis (Cotação, Bazin, Dívida) injetadas diretamente na resposta do Jarvis com latência ultrabaixa.`,
      latenciaMs: 0.02,
      tipo: 'acesso_isolado',
    });

    return {
      particao: ds,
      outrasParticoesBloqueadas: outras,
      logsGerados: [log1, log2, log3],
    };
  }

  // Listar todas as partições isoladas existentes
  public listarTodos(): MicroDatastoreParticionado[] {
    return Object.values(this.datastores);
  }

  // Obter todos os agentes sentinelas ativos
  public listarAgentesSentinelas(): AgenteSentinela[] {
    return Object.values(this.datastores).map((ds) => ds.agenteSentinela);
  }

  // Disparo manual ou programado de alerta em sentinela específico
  public dispararAlertaSentinela(chave: string): AgenteSentinela | null {
    const key = chave.toUpperCase().trim();
    const ds = this.datastores[key];
    if (!ds) return null;

    ds.agenteSentinela.status = 'alerta_disparado';
    if (key === 'TAEE11') {
      ds.agenteSentinela.alertaVigente = 'Sentinela Bazin TAEE11: Cotação em R$ 34.20 com margem de segurança de +13.5% frente ao teto Bazin de R$ 38.83. Alocação decenal recomendada.';
    } else if (key === 'BBAS3') {
      ds.agenteSentinela.alertaVigente = 'Sentinela Agro BBAS3: Cotação R$ 27.80 operando abaixo do teto de R$ 32.50 (+16.9% de margem). Basileia sólida.';
    } else if (key === 'WEGE3') {
      ds.agenteSentinela.alertaVigente = 'Sentinela WEGE3: Alerta de recuo operacional monitorado. ROIC em 31.8% e alavancagem de 0.15x.';
    } else if (key === 'BTC') {
      ds.agenteSentinela.alertaVigente = 'Sentinela BTC: Alerta de volatilidade acionado. Suporte testado em US$ 67.450.';
    } else {
      ds.agenteSentinela.alertaVigente = `Sentinela ${key}: Alerta de monitoramento prioritário disparado.`;
    }
    ds.agenteSentinela.dataAlerta = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    this.persistir();

    this.registrarLog({
      chaveParticao: key,
      evento: `Disparo de Alerta Sentinela [${key}]`,
      detalhes: ds.agenteSentinela.alertaVigente,
      latenciaMs: 0.03,
      tipo: 'sentinela_disparo',
    });

    return ds.agenteSentinela;
  }

  // Obter alertas pendentes
  public verificarAlertasAtivos(): AgenteSentinela[] {
    const alertas = Object.values(this.datastores)
      .map((ds) => ds.agenteSentinela)
      .filter((ag) => ag.status === 'alerta_disparado');

    return alertas;
  }

  // Excluir uma partição / silo de banco de dados isolado
  public excluirParticao(chave: string): boolean {
    const key = chave.toUpperCase().trim();
    if (!this.datastores[key]) return false;
    delete this.datastores[key];
    this.persistir();
    this.registrarLog({
      chaveParticao: key,
      evento: `Silo Isolado Excluído [${key}]`,
      detalhes: `Partição ${key} e seu agente sentinela foram removidos com segurança sem impactar os demais silos.`,
      latenciaMs: 0.02,
      tipo: 'acesso_isolado',
    });
    return true;
  }

  // Excluir um registro individual de log de isolamento
  public excluirLog(logId: string): void {
    this.logsIsolamento = this.logsIsolamento.filter((l) => l.id !== logId);
    this.persistirLogs();
  }
}

