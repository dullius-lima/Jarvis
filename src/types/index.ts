export type ClasseAtivo = 'ACOES_B3' | 'RENDA_FIXA' | 'CRIPTO';

export type VereditoCFOType = 'COMPRAR' | 'AGUARDAR' | 'QUARENTENA';

export interface DemonstrativoAnual {
  ano: number;
  dpa_bruto: number;
  dpa_ajustado: number;
  lpa: number;
  vpa: number;
  receita_liquida?: number;
  ebitda?: number;
  ebit?: number;
  lucro_liquido: number;
  fco: number; // Fluxo de Caixa Operacional
  fcl?: number; // Fluxo de Caixa Livre
  divida_liquida: number;
  patrimonio_liquido: number;
  despesas_financeiras?: number;
  possui_nao_recorrente?: boolean;
  detalhe_nao_recorrente?: string;
}

export interface Ativo {
  id: string;
  ticker: string;
  nome_empresa: string;
  classe: ClasseAtivo;
  setor: string;
  subsetor: string;
  cotacao_atual: number;
  alocacao_alvo_pct: number;
  alocacao_atual_pct: number;
  quantidade: number;
  preco_medio: number;
  nota_governanca: number; // 1-10
  em_quarentena: boolean;
  motivo_quarentena?: string;
  demonstrativos: DemonstrativoAnual[];
}

export interface MetricasBazin {
  dpa_medio_3_anos: number;
  teto_bazin_3_anos: number;
  margem_seguranca_3_anos_pct: number;
  dpa_medio_5_anos: number;
  teto_bazin_5_anos: number;
  margem_seguranca_5_anos_pct: number;
  cagr_dividendos_5_anos_pct: number | null;
  cagr_dividendos_10_anos_pct: number | null;
  dividend_yield_projetado_pct: number;
}

export interface MetricasGraham {
  lpa_recente: number;
  vpa_recente: number;
  preco_justo_graham: number | null;
  desconto_graham_pct: number | null;
  status_graham: string;
}

export interface MetricasSolvencia {
  divida_liquida_atual: number;
  ebitda_atual: number | null;
  dl_ebitda_atual: number | null;
  dl_ebitda_medio_5_anos: number | null;
  alerta_alavancagem_critica: boolean;
  cobertura_juros_atual: number | null;
  qualidade_lucro_divergencia_fco: string;
}

export interface DossieConsolidado {
  ticker: string;
  nome_empresa: string;
  classe: ClasseAtivo;
  setor: string;
  cotacao_atual: number;
  anos_historico_disponiveis: number;
  bazin: MetricasBazin;
  graham: MetricasGraham;
  solvencia: MetricasSolvencia;
  serie_historica: DemonstrativoAnual[];
  alocacao_atual_pct: number;
  alocacao_alvo_pct: number;
  quantidade_custodia: number;
  preco_medio_custodia: number;
}

export interface VereditoCFO {
  ticker: string;
  veredito: VereditoCFOType;
  diagnostico_executivo: string;
  parecer_alocacao: string;
  justificativa_bazin_graham: string;
  analise_solvencia_risco: string;
  gatilho_de_quarentena_detectado: boolean;
  data_auditoria?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
}

export interface AndarPredio {
  numero: number;
  nome: string;
  titulo_curto: string;
  descricao: string;
  responsavel: string;
  cor_tema: string;
  icone: string;
  indicadores_chave: string[];
}
