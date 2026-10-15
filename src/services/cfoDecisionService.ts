/**
 * CFO Decision Service - Auditoria e Histórico de Decisões Autônomas por IA
 * Registra com precisão cirúrgica cada criação e exclusão de agentes e memórias,
 * além de pareceres de alocação e quarentena decenal com justificativas lógicas completas.
 */

export type TipoAcaoCFO =
  | 'CRIACAO_AGENTE'
  | 'EXCLUSAO_AGENTE'
  | 'CRIACAO_MEMORIA'
  | 'EXCLUSAO_MEMORIA'
  | 'DELIBERACAO_QUARENTENA'
  | 'PARECER_ALOCACAO'
  | 'REBALANCEAMENTO_ESTRATEGICO'
  | 'PEDIDO_DADOS_API_MCP'
  | 'TRANSCRICAO_DADOS_API_MCP';

export type CategoriaAtivo =
  | 'AÇÕES B3'
  | 'FUNDOS IMOBILIÁRIOS'
  | 'CRIPTOATIVOS'
  | 'TÍTULOS PÚBLICOS'
  | 'TESOURO DIRETO'
  | 'TÍTULOS ESTRANGEIROS'
  | 'COMMODITIES'
  | 'SISTEMA_NEURAL';

export type ImpactoNivel = 'CRITICO' | 'ALTO' | 'MEDIO' | 'INFO';

export interface DecisaoAutonomaCFO {
  id: string;
  dataHora: string; // ISO String
  dataFormatada: string;
  tipoAcao: TipoAcaoCFO;
  titulo: string;
  ativoOuAlvo: string;
  categoria: CategoriaAtivo;
  impacto: ImpactoNivel;
  justificativaLogica: string;
  detalhesExecutivos: string;
  parametros?: {
    dlEbitda?: number;
    tetoBazin?: number;
    cotacao?: number;
    margemSeguranca?: string;
    horizonte?: string;
    criterio?: string;
    motivo?: string;
    tokensEconomizados?: number;
    informacoesNecessarias?: string[];
    oquePedirParaAgente?: string[];
  };
  targetNodeId: string | null; // ID de nó para acionamento visual no cérebro 3D
  autor: string;
  status: 'EXECUTADO' | 'REVERTIDO' | 'EM_VIGOR';
  reversivel: boolean;
}

const STORAGE_KEY = 'jarvis_cfo_decisions_v1';

// Histórico de semente demonstrativo pré-carregado com decisões autônomas corporativas de alto rigor
const HISTORICO_INICIAL: DecisaoAutonomaCFO[] = [
  {
    id: 'cfo-dec-001',
    dataHora: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    dataFormatada: new Date(Date.now() - 1000 * 60 * 18).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }),
    tipoAcao: 'DELIBERACAO_QUARENTENA',
    titulo: 'Aplicação de Quarentena em Ativo B3 Alavancado',
    ativoOuAlvo: 'PETR4',
    categoria: 'AÇÕES B3',
    impacto: 'CRITICO',
    justificativaLogica:
      'A alavancagem financeira consolidada e a relação Dívida Líquida / EBITDA atingiu 3.82x em projeção de estresse no fluxo de caixa operacional, ultrapassando o limite estatutário irrevogável de 3.50x. Pela política decenal da holding, o Preço-Teto de Bazin torna-se nulo até desalavancagem comprovada.',
    detalhesExecutivos:
      'Gatilho de quarentena ativado. Compras suspensas e criação de sentinela neural exclusiva para monitorar amortizações de debêntures.',
    parametros: {
      dlEbitda: 3.82,
      tetoBazin: 38.5,
      cotacao: 36.4,
      margemSeguranca: '-8.5%',
      horizonte: '10 anos',
      criterio: 'Dívida Líquida/EBITDA > 3.5x (Veto Soberano)',
    },
    targetNodeId: 'mem-petr4',
    autor: 'CFO IA (Motor Decenal Bazin/Graham)',
    status: 'EM_VIGOR',
    reversivel: false,
  },
  {
    id: 'cfo-dec-002',
    dataHora: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    dataFormatada: new Date(Date.now() - 1000 * 60 * 42).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }),
    tipoAcao: 'CRIACAO_AGENTE',
    titulo: 'Criação Autônoma de Agente Sentinela de Títulos Públicos e Selic',
    ativoOuAlvo: 'Sentinela Tesouro IPCA+ e DI',
    categoria: 'TESOURO DIRETO',
    impacto: 'ALTO',
    justificativaLogica:
      'Identificada inversão da curva de juros longa norte-americana e prêmio de risco real do Tesouro IPCA+ 2035 superior a IPCA + 6.25% a.a. O CFO deliberou autonomia para um agente dedicado a auditar leilões do Tesouro Nacional semanalmente.',
    detalhesExecutivos:
      'Instanciado novo agente especialista no Ficheiro Neural com papel de vigilância quantitativa e salvaguarda de liquidez soberana.',
    parametros: {
      horizonte: '10 anos',
      criterio: 'Taxa Real > IPCA + 6.00% a.a.',
    },
    targetNodeId: 'mem-geral',
    autor: 'CFO IA (Alocador Autônomo Macro)',
    status: 'EXECUTADO',
    reversivel: true,
  },
  {
    id: 'cfo-dec-003',
    dataHora: new Date(Date.now() - 1000 * 60 * 85).toISOString(),
    dataFormatada: new Date(Date.now() - 1000 * 60 * 85).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }),
    tipoAcao: 'CRIACAO_MEMORIA',
    titulo: 'Registro de Memória Neural: Teto Bazin BBAS3 R$ 34,80',
    ativoOuAlvo: 'BBAS3',
    categoria: 'AÇÕES B3',
    impacto: 'MEDIO',
    justificativaLogica:
      'Auditoria dos dividendos dos últimos 10 anos indicou DPA médio regular de R$ 2,088 por ação. Aplicando taxa mínima de retorno esperada de 6,0% a.a. (Método Décio Bazin: 2,088 / 0,06 = R$ 34,80). Cotação de R$ 27,90 oferece margem de segurança de +24,7%.',
    detalhesExecutivos:
      'Nó sináptico gravado no cérebro 3D azul com coragem de alocação programada e vínculo ao silo de ativo_b3.',
    parametros: {
      tetoBazin: 34.8,
      cotacao: 27.9,
      dlEbitda: 1.15,
      margemSeguranca: '+24.7%',
      horizonte: '10 anos',
      criterio: 'Dividend Yield Histórico Decenal >= 6%',
    },
    targetNodeId: 'mem-bbas3',
    autor: 'CFO IA (Motor Decenal Bazin/Graham)',
    status: 'EM_VIGOR',
    reversivel: true,
  },
  {
    id: 'cfo-dec-004',
    dataHora: new Date(Date.now() - 1000 * 60 * 130).toISOString(),
    dataFormatada: new Date(Date.now() - 1000 * 60 * 130).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }),
    tipoAcao: 'EXCLUSAO_MEMORIA',
    titulo: 'Purga Autônoma de Memória Obsoleta de Day-Trade',
    ativoOuAlvo: 'Registro Especulativo Curto Prazo',
    categoria: 'SISTEMA_NEURAL',
    impacto: 'MEDIO',
    justificativaLogica:
      'A memória continha anotações operacionais de curto prazo (scalping/oscilação intradiária) incompatíveis com a diretriz estatutária de investimentos decenais em valor (Value Investing de 10 anos). O CFO determinou a purga neural para preservar a integridade cognitiva do cérebro.',
    detalhesExecutivos:
      'Nó residual removido permanentemente do cluster sináptico para desobstruir caminhos neurais de solvência.',
    parametros: {
      motivo: 'Diretriz de Longo Prazo 10 Anos: Veto a Ruído Intradiário',
    },
    targetNodeId: null,
    autor: 'CFO IA (Purga Neural Autônoma)',
    status: 'EXECUTADO',
    reversivel: false,
  },
  {
    id: 'cfo-dec-005',
    dataHora: new Date(Date.now() - 1000 * 60 * 210).toISOString(),
    dataFormatada: new Date(Date.now() - 1000 * 60 * 210).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }),
    tipoAcao: 'EXCLUSAO_AGENTE',
    titulo: 'Desativação e Exclusão de Agente Especulativo Obsoleto',
    ativoOuAlvo: 'Agente Alavancagem Futuros',
    categoria: 'SISTEMA_NEURAL',
    impacto: 'ALTO',
    justificativaLogica:
      'Agente com lógica que contemplava operações em derivativos a termo e futuros alavancados sem cobertura. O CFO desativou e excluiu o agente do ficheiro para mitigar risco de cauda e exposição a chamadas de margem.',
    detalhesExecutivos:
      'Remoção definitiva do registro de execução e liberação de memória de sentinela.',
    parametros: {
      motivo: 'Incompatibilidade com Política de Preservação de Capital',
    },
    targetNodeId: null,
    autor: 'CFO IA (Auditoria de Governança)',
    status: 'EXECUTADO',
    reversivel: false,
  },
  {
    id: 'cfo-dec-006',
    dataHora: new Date(Date.now() - 1000 * 60 * 340).toISOString(),
    dataFormatada: new Date(Date.now() - 1000 * 60 * 340).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }),
    tipoAcao: 'PARECER_ALOCACAO',
    titulo: 'Parecer Executivo de Aporte: TAEE11 Abaixo do Teto',
    ativoOuAlvo: 'TAEE11',
    categoria: 'AÇÕES B3',
    impacto: 'ALTO',
    justificativaLogica:
      'Concessões transmissoras de energia com reajuste por IGP-M/IPCA e receitas anuais permitidas (RAP) protegidas até 2032. Margem EBITDA de 82,4% e histórico ininterrupto de proventos há mais de 10 anos. Cotação de R$ 34,10 operando abaixo do Teto Bazin de R$ 39,20.',
    detalhesExecutivos:
      'Aporte ordinário liberado. Ordem de direcionamento de proventos recebidos para reinvestimento composto.',
    parametros: {
      tetoBazin: 39.2,
      cotacao: 34.1,
      dlEbitda: 2.8,
      margemSeguranca: '+14.9%',
      horizonte: '10 anos',
    },
    targetNodeId: 'mem-taee11',
    autor: 'CFO IA (Motor Decenal Bazin/Graham)',
    status: 'EM_VIGOR',
    reversivel: true,
  },
];

class CfoDecisionService {
  private listeners: Array<() => void> = [];

  constructor() {
    this.garantirInicializacao();
  }

  private garantirInicializacao(): void {
    if (typeof window === 'undefined') return;
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(HISTORICO_INICIAL));
      }
    } catch (e) {
      console.warn('Erro ao acessar localStorage para CFO decisions:', e);
    }
  }

  public listarDecisoes(): DecisaoAutonomaCFO[] {
    if (typeof window === 'undefined') return HISTORICO_INICIAL;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return HISTORICO_INICIAL;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : HISTORICO_INICIAL;
    } catch {
      return HISTORICO_INICIAL;
    }
  }

  public registrarDecisao(nova: Omit<DecisaoAutonomaCFO, 'id' | 'dataHora' | 'dataFormatada'> & { id?: string }): DecisaoAutonomaCFO {
    const agora = new Date();
    const decisaoCompleta: DecisaoAutonomaCFO = {
      ...nova,
      id: nova.id || `cfo-dec-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      dataHora: agora.toISOString(),
      dataFormatada: agora.toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'medium',
      }),
    };

    const existentes = this.listarDecisoes();
    const atualizadas = [decisaoCompleta, ...existentes];

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(atualizadas));
    } catch (e) {
      console.warn('Falha ao persistir decisão do CFO:', e);
    }

    // Disparo autônomo assíncrono para o Webhook do n8n (se configurado)
    this.enviarParaN8nWebhook(decisaoCompleta).catch((err) => {
      console.warn('Falha silenciosa no envio ao Webhook n8n:', err);
    });

    this.notificarListeners();
    return decisaoCompleta;
  }

  // =========================================================================
  // INTEGRAÇÃO COM N8N WEBHOOK
  // =========================================================================
  private readonly N8N_STORAGE_KEY = 'jarvis_n8n_webhook_url';

  public getN8nWebhookUrl(): string {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(this.N8N_STORAGE_KEY) || '';
  }

  public setN8nWebhookUrl(url: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.N8N_STORAGE_KEY, url.trim());
    this.notificarListeners();
  }

  public async enviarParaN8nWebhook(decisao: DecisaoAutonomaCFO): Promise<{ success: boolean; status?: number; error?: string }> {
    const webhookUrl = this.getN8nWebhookUrl();
    if (!webhookUrl) return { success: false, error: 'URL do n8n não configurada' };

    const payload = {
      event: 'CFO_DECISION_EVENT',
      source: 'JARVIS_NEURAL_BRAIN_CFO',
      timestamp: decisao.dataHora,
      decisionId: decisao.id,
      actionType: decisao.tipoAcao,
      title: decisao.titulo,
      targetAsset: decisao.ativoOuAlvo,
      category: decisao.categoria,
      impact: decisao.impacto,
      rationale: decisao.justificativaLogica,
      executiveDetails: decisao.detalhesExecutivos,
      parameters: decisao.parametros,
      author: decisao.autor,
      status: decisao.status,
      neuralMetadata: {
        targetNodeId: decisao.targetNodeId,
        reversible: decisao.reversivel,
      },
    };

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Jarvis-Event': 'CFO_DECISION',
        },
        body: JSON.stringify(payload),
      });

      return {
        success: response.ok,
        status: response.status,
      };
    } catch (err: any) {
      console.warn('Erro ao disparar webhook para n8n:', err);
      return {
        success: false,
        error: err?.message || 'Falha de rede ao conectar com o n8n',
      };
    }
  }

  public async testarDisparoN8n(): Promise<{ success: boolean; message: string; payload: any }> {
    const webhookUrl = this.getN8nWebhookUrl();
    if (!webhookUrl) {
      return {
        success: false,
        message: 'Por favor, informe a URL do Webhook do n8n antes de testar.',
        payload: null,
      };
    }

    const payloadTeste = {
      event: 'CFO_DECISION_EVENT',
      source: 'JARVIS_NEURAL_BRAIN_CFO',
      timestamp: new Date().toISOString(),
      decisionId: `test-n8n-${Date.now()}`,
      actionType: 'PARECER_ALOCACAO',
      title: 'Teste de Integração: Webhook n8n CFO Jarvis',
      targetAsset: 'TAEE11',
      category: 'AÇÕES B3',
      impact: 'INFO',
      rationale: 'Validação de conectividade entre o Cérebro Neural do Jarvis e o fluxo de automação externa do n8n.',
      executiveDetails: 'Disparo de teste estruturado para acionamento de alertas no Telegram, Slack, Notion ou Sheets via n8n.',
      parameters: {
        tetoBazin: 39.20,
        cotacao: 34.10,
        margemSeguranca: '+14.9%',
      },
      author: 'Matheus Dullius (Teste de Integração)',
      status: 'EXECUTADO',
    };

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Jarvis-Event': 'CFO_DECISION_TEST',
        },
        body: JSON.stringify(payloadTeste),
      });

      if (res.ok) {
        return {
          success: true,
          message: `Webhook recebido com sucesso pelo n8n (Status ${res.status})!`,
          payload: payloadTeste,
        };
      } else {
        return {
          success: false,
          message: `O n8n respondeu com status ${res.status}: ${res.statusText}`,
          payload: payloadTeste,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: `Falha na requisição: ${err?.message || 'Erro de rede ou CORS no n8n'}`,
        payload: payloadTeste,
      };
    }
  }

  public limparHistorico(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    } catch (e) {
      console.warn('Falha ao limpar histórico de CFO:', e);
    }
    this.notificarListeners();
  }

  public restaurarPadroes(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(HISTORICO_INICIAL));
    } catch (e) {
      console.warn('Falha ao restaurar decisões do CFO:', e);
    }
    this.notificarListeners();
  }

  public subscribe(callback: () => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notificarListeners(): void {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error('Erro em listener do CFO Decision Service:', err);
      }
    });
  }

  public exportarJson(): string {
    const decisoes = this.listarDecisoes();
    return JSON.stringify(
      {
        sistema: 'JARVIS AI CFO - AUDITORIA EXECUTIVA DE DECISÕES AUTÔNOMAS',
        geradoEm: new Date().toISOString(),
        totalDecisoes: decisoes.length,
        decisoes,
      },
      null,
      2
    );
  }
}

export const cfoDecisionService = new CfoDecisionService();
