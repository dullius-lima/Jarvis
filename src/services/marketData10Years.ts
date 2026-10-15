/**
 * Serviço Universal de Dados do Mercado Financeiro (Histórico Decenal de 10 Anos)
 * Holding Investimentos Dullius
 * 
 * Cobertura Completa de Classes de Ativos:
 * 1. Ações (B3 & Globais)
 * 2. Fundos de Investimento (FIIs & ETFs)
 * 3. Criptoativos (Bitcoin, Ethereum, Solana)
 * 4. Títulos Públicos / Tesouro Direto (Selic, IPCA+, Prefixados)
 * 5. Títulos Estrangeiros (US Treasuries, T-Bills, Global Bonds)
 * 6. Commodities (Ouro, Petróleo Brent, Soja, Milho, Café, Prata)
 */

export type ClasseAtivoFinanceiro =
  | 'acoes'
  | 'fundos'
  | 'cripto'
  | 'tesouro'
  | 'estrangeiros'
  | 'commodities';

export interface DadosAnoHistorico {
  ano: number;
  cotacaoMedia: number;       // Preço, Cotação, Taxa % ou Índice
  rendimentoOuProvento: number; // Dividendos, Cupom, Rendimento ou Variação Anual
  fcoOuFluxo?: number;        // Fluxo de Caixa / Volume financeiro
  metricaPrincipal: string;   // Ex: 'DL/EBITDA: 3.2x', 'P/VP: 0.95', 'Yield: 6.2% a.a.', 'Hash: 650EH/s'
  rentabilidadeAnualPct: number;
}

export interface AtivoMercadoFinanceiro {
  ticker: string;
  nome: string;
  classe: ClasseAtivoFinanceiro;
  setor: string;
  cotacaoAtual: number;
  moeda: 'BRL' | 'USD';
  descricao: string;
  indicadoresChave: {
    indicador1: { label: string; valor: string };
    indicador2: { label: string; valor: string };
    indicador3: { label: string; valor: string };
    indicador4: { label: string; valor: string };
  };
  solvencia?: {
    dlEbitdaAtual?: number;
    ratingCredito?: string;
    riscoSoberano?: string;
    alertaAlavancagem?: boolean;
  };
  historico10Anos: DadosAnoHistorico[];
  resumoDecenal: {
    tetoBazin10a?: number;
    margemSeguranca10aPct?: number;
    tetoBazin5a?: number;
    margemSeguranca5aPct?: number;
    rendimentoMedio10aPct: number;
    conversaoCaixaPct?: number;
    dlEbitdaMedio10a?: number;
    volatilidadeDecenalPct?: number;
    teseAlocacao: string;
    diretrizDullius: string;
  };
}

export const UNIVERSO_MERCADO_FINANCEIRO: Record<string, AtivoMercadoFinanceiro> = {
  // =========================================================================
  // 1. AÇÕES (EQUITIES - B3 & INTERNACIONAIS)
  // =========================================================================
  TAEE11: {
    ticker: 'TAEE11',
    nome: 'Taesa S.A.',
    classe: 'acoes',
    setor: 'Transmissão Elétrica (Concessões Reguladas)',
    cotacaoAtual: 34.20,
    moeda: 'BRL',
    descricao: 'Concessionária pura de transmissão com receitas protegidas por IGP-M e IPCA até 2030-2045.',
    indicadoresChave: {
      indicador1: { label: 'Preço-Teto Bazin (10a)', valor: 'R$ 37.17' },
      indicador2: { label: 'Margem de Segurança (10a)', valor: '+8.7%' },
      indicador3: { label: 'Dívida Líquida / EBITDA', valor: '3.42x' },
      indicador4: { label: 'DY Médio Decenal', valor: '9.8% a.a.' },
    },
    solvencia: {
      dlEbitdaAtual: 3.42,
      ratingCredito: 'AAA (br)',
      alertaAlavancagem: false,
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 19.50, rendimentoOuProvento: 1.72, metricaPrincipal: 'DL/EBITDA: 2.8x', rentabilidadeAnualPct: 24.5 },
      { ano: 2017, cotacaoMedia: 22.10, rendimentoOuProvento: 1.95, metricaPrincipal: 'DL/EBITDA: 2.6x', rentabilidadeAnualPct: 18.2 },
      { ano: 2018, cotacaoMedia: 21.80, rendimentoOuProvento: 2.05, metricaPrincipal: 'DL/EBITDA: 2.9x', rentabilidadeAnualPct: 12.1 },
      { ano: 2019, cotacaoMedia: 27.40, rendimentoOuProvento: 2.15, metricaPrincipal: 'DL/EBITDA: 3.1x', rentabilidadeAnualPct: 35.4 },
      { ano: 2020, cotacaoMedia: 30.20, rendimentoOuProvento: 2.30, metricaPrincipal: 'DL/EBITDA: 3.2x', rentabilidadeAnualPct: 16.8 },
      { ano: 2021, cotacaoMedia: 36.80, rendimentoOuProvento: 2.80, metricaPrincipal: 'DL/EBITDA: 3.4x', rentabilidadeAnualPct: 28.9 },
      { ano: 2022, cotacaoMedia: 39.50, rendimentoOuProvento: 2.45, metricaPrincipal: 'DL/EBITDA: 3.6x', rentabilidadeAnualPct: 14.2 },
      { ano: 2023, cotacaoMedia: 35.80, rendimentoOuProvento: 2.20, metricaPrincipal: 'DL/EBITDA: 3.5x', rentabilidadeAnualPct: 6.8 },
      { ano: 2024, cotacaoMedia: 34.60, rendimentoOuProvento: 2.35, metricaPrincipal: 'DL/EBITDA: 3.45x', rentabilidadeAnualPct: 5.4 },
      { ano: 2025, cotacaoMedia: 34.20, rendimentoOuProvento: 2.33, metricaPrincipal: 'DL/EBITDA: 3.42x', rentabilidadeAnualPct: 6.1 },
    ],
    resumoDecenal: {
      tetoBazin10a: 37.17,
      margemSeguranca10aPct: 8.68,
      tetoBazin5a: 40.50,
      margemSeguranca5aPct: 18.42,
      rendimentoMedio10aPct: 9.8,
      conversaoCaixaPct: 78.5,
      dlEbitdaMedio10a: 3.20,
      teseAlocacao: 'Fluxo de caixa perene e previsível de RAP (Receita Anual Permitida) com correção inflacionária.',
      diretrizDullius: 'Comprar abaixo de R$ 37.17. Limite estrito de Dívida Líquida/EBITDA de 3,5x.',
    },
  },

  BBAS3: {
    ticker: 'BBAS3',
    nome: 'Banco do Brasil S.A.',
    classe: 'acoes',
    setor: 'Bancário / Agronegócio Líder',
    cotacaoAtual: 27.80,
    moeda: 'BRL',
    descricao: 'Maior financiador do agronegócio global com ROE acima de 21% e P/VP com desconto estrutural.',
    indicadoresChave: {
      indicador1: { label: 'Preço-Teto Bazin (10a)', valor: 'R$ 34.17' },
      indicador2: { label: 'Margem de Segurança (10a)', valor: '+22.9%' },
      indicador3: { label: 'P/L Histórico Decenal', valor: '4.8x' },
      indicador4: { label: 'ROE Médio Decenal', valor: '17.2%' },
    },
    solvencia: {
      dlEbitdaAtual: 0.0,
      ratingCredito: 'AAA (br) / Basileia 16.2%',
      alertaAlavancagem: false,
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 14.20, rendimentoOuProvento: 0.85, metricaPrincipal: 'ROE: 11.2%', rentabilidadeAnualPct: 82.5 },
      { ano: 2017, cotacaoMedia: 17.50, rendimentoOuProvento: 1.10, metricaPrincipal: 'ROE: 13.5%', rentabilidadeAnualPct: 29.4 },
      { ano: 2018, cotacaoMedia: 20.80, rendimentoOuProvento: 1.35, metricaPrincipal: 'ROE: 14.8%', rentabilidadeAnualPct: 24.1 },
      { ano: 2019, cotacaoMedia: 24.50, rendimentoOuProvento: 1.80, metricaPrincipal: 'ROE: 17.3%', rentabilidadeAnualPct: 26.8 },
      { ano: 2020, cotacaoMedia: 18.90, rendimentoOuProvento: 1.45, metricaPrincipal: 'ROE: 13.0%', rentabilidadeAnualPct: -21.4 },
      { ano: 2021, cotacaoMedia: 16.20, rendimentoOuProvento: 1.95, metricaPrincipal: 'ROE: 16.8%', rentabilidadeAnualPct: -11.2 },
      { ano: 2022, cotacaoMedia: 21.40, rendimentoOuProvento: 2.85, metricaPrincipal: 'ROE: 20.5%', rentabilidadeAnualPct: 42.5 },
      { ano: 2023, cotacaoMedia: 26.20, rendimentoOuProvento: 2.95, metricaPrincipal: 'ROE: 21.6%', rentabilidadeAnualPct: 38.0 },
      { ano: 2024, cotacaoMedia: 28.10, rendimentoOuProvento: 3.10, metricaPrincipal: 'ROE: 21.8%', rentabilidadeAnualPct: 15.2 },
      { ano: 2025, cotacaoMedia: 27.80, rendimentoOuProvento: 3.05, metricaPrincipal: 'ROE: 21.4%', rentabilidadeAnualPct: 11.8 },
    ],
    resumoDecenal: {
      tetoBazin10a: 34.17,
      margemSeguranca10aPct: 22.91,
      tetoBazin5a: 46.33,
      margemSeguranca5aPct: 66.65,
      rendimentoMedio10aPct: 9.4,
      conversaoCaixaPct: 95.4,
      dlEbitdaMedio10a: 0.0,
      teseAlocacao: 'Liderança incontestável no crédito agropecuário brasileiro, carteira defensiva e payout robusto.',
      diretrizDullius: 'Comprar abaixo do teto de R$ 34.17. Reinvestir 100% dos dividendos no ativo.',
    },
  },

  WEGE3: {
    ticker: 'WEGE3',
    nome: 'WEG S.A.',
    classe: 'acoes',
    setor: 'Bens de Capital & Motores Globais',
    cotacaoAtual: 54.10,
    moeda: 'BRL',
    descricao: 'Multinacional de excelência operacional com ROIC superior a 30% e presença em mais de 130 países.',
    indicadoresChave: {
      indicador1: { label: 'Preço-Teto Bazin (10a)', valor: 'R$ 12.17' },
      indicador2: { label: 'Margem Bazin', valor: '-77.5%' },
      indicador3: { label: 'ROIC Decenal Médio', valor: '25.8%' },
      indicador4: { label: 'Dívida Líquida / EBITDA', valor: '0.15x' },
    },
    solvencia: {
      dlEbitdaAtual: 0.15,
      ratingCredito: 'AAA (br)',
      alertaAlavancagem: false,
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 8.50, rendimentoOuProvento: 0.22, metricaPrincipal: 'ROIC: 18.5%', rentabilidadeAnualPct: 22.0 },
      { ano: 2017, cotacaoMedia: 11.20, rendimentoOuProvento: 0.28, metricaPrincipal: 'ROIC: 19.8%', rentabilidadeAnualPct: 35.8 },
      { ano: 2018, cotacaoMedia: 14.80, rendimentoOuProvento: 0.35, metricaPrincipal: 'ROIC: 20.4%', rentabilidadeAnualPct: 34.5 },
      { ano: 2019, cotacaoMedia: 22.50, rendimentoOuProvento: 0.42, metricaPrincipal: 'ROIC: 23.1%', rentabilidadeAnualPct: 56.2 },
      { ano: 2020, cotacaoMedia: 38.40, rendimentoOuProvento: 0.58, metricaPrincipal: 'ROIC: 28.5%', rentabilidadeAnualPct: 120.4 },
      { ano: 2021, cotacaoMedia: 39.80, rendimentoOuProvento: 0.75, metricaPrincipal: 'ROIC: 30.2%', rentabilidadeAnualPct: 5.8 },
      { ano: 2022, cotacaoMedia: 42.10, rendimentoOuProvento: 0.90, metricaPrincipal: 'ROIC: 31.4%', rentabilidadeAnualPct: 9.8 },
      { ano: 2023, cotacaoMedia: 48.50, rendimentoOuProvento: 1.15, metricaPrincipal: 'ROIC: 32.8%', rentabilidadeAnualPct: 17.5 },
      { ano: 2024, cotacaoMedia: 52.80, rendimentoOuProvento: 1.30, metricaPrincipal: 'ROIC: 32.0%', rentabilidadeAnualPct: 10.4 },
      { ano: 2025, cotacaoMedia: 54.10, rendimentoOuProvento: 1.35, metricaPrincipal: 'ROIC: 31.8%', rentabilidadeAnualPct: 4.8 },
    ],
    resumoDecenal: {
      tetoBazin10a: 12.17,
      margemSeguranca10aPct: -77.50,
      tetoBazin5a: 18.17,
      margemSeguranca5aPct: -66.41,
      rendimentoMedio10aPct: 2.1,
      conversaoCaixaPct: 106.0,
      dlEbitdaMedio10a: 0.28,
      teseAlocacao: 'Empresa compounder de alto crescimento e reinvestimento de lucros a taxas elevadas de ROIC.',
      diretrizDullius: 'Aguardar correção severa de mercado para aportes. Não comprar acima do teto estrito.',
    },
  },

  PETR4: {
    ticker: 'PETR4',
    nome: 'Petrobras S.A.',
    classe: 'acoes',
    setor: 'Petróleo & Energia Primária',
    cotacaoAtual: 37.50,
    moeda: 'BRL',
    descricao: 'Produtora de petróleo com custo de extração (lifting cost) do Pré-Sal entre os mais baixos do mundo.',
    indicadoresChave: {
      indicador1: { label: 'Preço-Teto Bazin (10a)', valor: 'R$ 73.08' },
      indicador2: { label: 'Margem Bazin (10a)', valor: '+94.8%' },
      indicador3: { label: 'Dívida Líquida / EBITDA', valor: '0.85x' },
      indicador4: { label: 'FCO Decenal Acumulado', valor: 'R$ 450 Bi' },
    },
    solvencia: {
      dlEbitdaAtual: 0.85,
      ratingCredito: 'BB / Ba2 (Soberano)',
      alertaAlavancagem: false,
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 11.80, rendimentoOuProvento: 0.00, metricaPrincipal: 'DL/EBITDA: 4.8x', rentabilidadeAnualPct: 121.9 },
      { ano: 2017, cotacaoMedia: 13.50, rendimentoOuProvento: 0.00, metricaPrincipal: 'DL/EBITDA: 3.6x', rentabilidadeAnualPct: 14.5 },
      { ano: 2018, cotacaoMedia: 19.80, rendimentoOuProvento: 0.92, metricaPrincipal: 'DL/EBITDA: 2.3x', rentabilidadeAnualPct: 48.0 },
      { ano: 2019, cotacaoMedia: 24.20, rendimentoOuProvento: 0.73, metricaPrincipal: 'DL/EBITDA: 1.8x', rentabilidadeAnualPct: 27.5 },
      { ano: 2020, cotacaoMedia: 22.10, rendimentoOuProvento: 0.25, metricaPrincipal: 'DL/EBITDA: 2.1x', rentabilidadeAnualPct: -6.4 },
      { ano: 2021, cotacaoMedia: 26.50, rendimentoOuProvento: 5.65, metricaPrincipal: 'DL/EBITDA: 1.1x', rentabilidadeAnualPct: 35.8 },
      { ano: 2022, cotacaoMedia: 31.40, rendimentoOuProvento: 16.80, metricaPrincipal: 'DL/EBITDA: 0.6x', rentabilidadeAnualPct: 74.2 },
      { ano: 2023, cotacaoMedia: 33.20, rendimentoOuProvento: 7.20, metricaPrincipal: 'DL/EBITDA: 0.8x', rentabilidadeAnualPct: 42.0 },
      { ano: 2024, cotacaoMedia: 36.80, rendimentoOuProvento: 6.40, metricaPrincipal: 'DL/EBITDA: 0.82x', rentabilidadeAnualPct: 22.5 },
      { ano: 2025, cotacaoMedia: 37.50, rendimentoOuProvento: 5.90, metricaPrincipal: 'DL/EBITDA: 0.85x', rentabilidadeAnualPct: 18.0 },
    ],
    resumoDecenal: {
      tetoBazin10a: 73.08,
      margemSeguranca10aPct: 94.88,
      tetoBazin5a: 139.83,
      margemSeguranca5aPct: 272.88,
      rendimentoMedio10aPct: 14.2,
      conversaoCaixaPct: 63.4,
      dlEbitdaMedio10a: 1.87,
      teseAlocacao: 'Fluxo massivo de dividendos suportado pelo Pré-Sal com desalavancagem consolidada.',
      diretrizDullius: 'Comprar com disciplina mantendo alocação máxima de 12% da carteira pelo risco estatal.',
    },
  },

  // =========================================================================
  // 2. FUNDOS DE INVESTIMENTO (FIIs & ETFs)
  // =========================================================================
  HGLG11: {
    ticker: 'HGLG11',
    nome: 'CSHG Logística FII',
    classe: 'fundos',
    setor: 'Fundos Imobiliários · Galpões Logísticos AAA',
    cotacaoAtual: 162.50,
    moeda: 'BRL',
    descricao: 'Maior FII de logística do Brasil com galpões refrigerados e secos próximos a grandes centros urbanos.',
    indicadoresChave: {
      indicador1: { label: 'P/VP Atual', valor: '0.98' },
      indicador2: { label: 'Dividend Yield (12m)', valor: '8.4% a.a.' },
      indicador3: { label: 'Vacância Física', valor: '4.8%' },
      indicador4: { label: 'Spread vs IPCA+', valor: '+2.1% a.a.' },
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 110.00, rendimentoOuProvento: 8.80, metricaPrincipal: 'P/VP: 0.95', rentabilidadeAnualPct: 15.2 },
      { ano: 2017, cotacaoMedia: 122.50, rendimentoOuProvento: 9.20, metricaPrincipal: 'P/VP: 1.02', rentabilidadeAnualPct: 19.8 },
      { ano: 2018, cotacaoMedia: 135.00, rendimentoOuProvento: 9.80, metricaPrincipal: 'P/VP: 1.05', rentabilidadeAnualPct: 18.4 },
      { ano: 2019, cotacaoMedia: 178.00, rendimentoOuProvento: 10.40, metricaPrincipal: 'P/VP: 1.18', rentabilidadeAnualPct: 39.5 },
      { ano: 2020, cotacaoMedia: 168.00, rendimentoOuProvento: 10.80, metricaPrincipal: 'P/VP: 1.12', rentabilidadeAnualPct: 0.8 },
      { ano: 2021, cotacaoMedia: 164.00, rendimentoOuProvento: 11.20, metricaPrincipal: 'P/VP: 1.06', rentabilidadeAnualPct: 4.2 },
      { ano: 2022, cotacaoMedia: 162.00, rendimentoOuProvento: 13.20, metricaPrincipal: 'P/VP: 1.03', rentabilidadeAnualPct: 6.8 },
      { ano: 2023, cotacaoMedia: 165.00, rendimentoOuProvento: 13.80, metricaPrincipal: 'P/VP: 1.04', rentabilidadeAnualPct: 10.2 },
      { ano: 2024, cotacaoMedia: 163.50, rendimentoOuProvento: 13.50, metricaPrincipal: 'P/VP: 1.01', rentabilidadeAnualPct: 7.5 },
      { ano: 2025, cotacaoMedia: 162.50, rendimentoOuProvento: 13.65, metricaPrincipal: 'P/VP: 0.98', rentabilidadeAnualPct: 8.2 },
    ],
    resumoDecenal: {
      rendimentoMedio10aPct: 8.1,
      tetoBazin10a: 192.30,
      margemSeguranca10aPct: 18.3,
      volatilidadeDecenalPct: 8.5,
      teseAlocacao: 'Imóveis logísticos essenciais para e-commerce e supply chain farmacêutico.',
      diretrizDullius: 'Comprar sempre com P/VP menor ou igual a 1.00 e Yield superior ao IPCA+ da NTN-B.',
    },
  },

  IVVB11: {
    ticker: 'IVVB11',
    nome: 'iShares S&P 500 Fundo de Índice (ETF)',
    classe: 'fundos',
    setor: 'Índice de Ações Americanas em Reais',
    cotacaoAtual: 334.80,
    moeda: 'BRL',
    descricao: 'ETF que replica o desempenho das 500 maiores corporações dos EUA dolarizado com reinvestimento automático.',
    indicadoresChave: {
      indicador1: { label: 'Taxa de Adm', valor: '0.23% a.a.' },
      indicador2: { label: 'Retorno 10a (BRL)', valor: '+380%' },
      indicador3: { label: 'Moeda Subjacente', valor: 'Dólar (USD)' },
      indicador4: { label: 'PL do Fundo', valor: 'R$ 7.8 Bi' },
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 68.50, rendimentoOuProvento: 0, metricaPrincipal: 'S&P 500: 2.238', rentabilidadeAnualPct: 12.5 },
      { ano: 2017, cotacaoMedia: 84.00, rendimentoOuProvento: 0, metricaPrincipal: 'S&P 500: 2.673', rentabilidadeAnualPct: 22.8 },
      { ano: 2018, cotacaoMedia: 105.00, rendimentoOuProvento: 0, metricaPrincipal: 'S&P 500: 2.506', rentabilidadeAnualPct: 25.0 },
      { ano: 2019, cotacaoMedia: 142.00, rendimentoOuProvento: 0, metricaPrincipal: 'S&P 500: 3.230', rentabilidadeAnualPct: 35.2 },
      { ano: 2020, cotacaoMedia: 215.00, rendimentoOuProvento: 0, metricaPrincipal: 'S&P 500: 3.756', rentabilidadeAnualPct: 51.4 },
      { ano: 2021, cotacaoMedia: 275.00, rendimentoOuProvento: 0, metricaPrincipal: 'S&P 500: 4.766', rentabilidadeAnualPct: 27.9 },
      { ano: 2022, cotacaoMedia: 242.00, rendimentoOuProvento: 0, metricaPrincipal: 'S&P 500: 3.839', rentabilidadeAnualPct: -12.0 },
      { ano: 2023, cotacaoMedia: 278.00, rendimentoOuProvento: 0, metricaPrincipal: 'S&P 500: 4.769', rentabilidadeAnualPct: 14.8 },
      { ano: 2024, cotacaoMedia: 320.00, rendimentoOuProvento: 0, metricaPrincipal: 'S&P 500: 5.860', rentabilidadeAnualPct: 15.1 },
      { ano: 2025, cotacaoMedia: 334.80, rendimentoOuProvento: 0, metricaPrincipal: 'S&P 500: 6.050', rentabilidadeAnualPct: 4.6 },
    ],
    resumoDecenal: {
      rendimentoMedio10aPct: 19.8,
      volatilidadeDecenalPct: 17.2,
      teseAlocacao: 'Exposição cambial passiva e participação no crescimento do capitalismo global.',
      diretrizDullius: 'Alocar de 15% a 25% da carteira como hedge institucional de patrimônio em moeda forte.',
    },
  },

  // =========================================================================
  // 3. CRIPTOATIVOS
  // =========================================================================
  BTC: {
    ticker: 'BTC',
    nome: 'Bitcoin (BTC)',
    classe: 'cripto',
    setor: 'Ativo de Reserva Descentralizada / Criptoativo',
    cotacaoAtual: 68450.00,
    moeda: 'USD',
    descricao: 'Rede monetária neutra, descentralizada e imutável com oferta programada limitada a 21 milhões.',
    indicadoresChave: {
      indicador1: { label: 'Hash Rate Global', valor: '680 EH/s (Recorde)' },
      indicador2: { label: 'Oferta Circulante', valor: '19.78M BTC' },
      indicador3: { label: 'Próximo Halving', valor: '2028' },
      indicador4: { label: 'Retorno Decenal', valor: '+10.400%' },
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 650.00, rendimentoOuProvento: 0, metricaPrincipal: 'Hash: 2.5 EH/s', rentabilidadeAnualPct: 125.0 },
      { ano: 2017, cotacaoMedia: 4800.00, rendimentoOuProvento: 0, metricaPrincipal: 'Hash: 14 EH/s', rentabilidadeAnualPct: 1338.0 },
      { ano: 2018, cotacaoMedia: 6200.00, rendimentoOuProvento: 0, metricaPrincipal: 'Hash: 42 EH/s', rentabilidadeAnualPct: -73.0 },
      { ano: 2019, cotacaoMedia: 7200.00, rendimentoOuProvento: 0, metricaPrincipal: 'Hash: 95 EH/s', rentabilidadeAnualPct: 87.0 },
      { ano: 2020, cotacaoMedia: 11200.00, rendimentoOuProvento: 0, metricaPrincipal: 'Hash: 135 EH/s', rentabilidadeAnualPct: 302.0 },
      { ano: 2021, cotacaoMedia: 47500.00, rendimentoOuProvento: 0, metricaPrincipal: 'Hash: 175 EH/s', rentabilidadeAnualPct: 59.8 },
      { ano: 2022, cotacaoMedia: 28200.00, rendimentoOuProvento: 0, metricaPrincipal: 'Hash: 245 EH/s', rentabilidadeAnualPct: -64.2 },
      { ano: 2023, cotacaoMedia: 29800.00, rendimentoOuProvento: 0, metricaPrincipal: 'Hash: 460 EH/s', rentabilidadeAnualPct: 155.0 },
      { ano: 2024, cotacaoMedia: 63500.00, rendimentoOuProvento: 0, metricaPrincipal: 'Hash: 620 EH/s', rentabilidadeAnualPct: 113.0 },
      { ano: 2025, cotacaoMedia: 68450.00, rendimentoOuProvento: 0, metricaPrincipal: 'Hash: 680 EH/s', rentabilidadeAnualPct: 7.8 },
    ],
    resumoDecenal: {
      rendimentoMedio10aPct: 72.5,
      volatilidadeDecenalPct: 62.0,
      teseAlocacao: 'Ouro digital soberano sem risco de contraparte estatal nem diluição inflacionária.',
      diretrizDullius: 'Aportes mensais (DCA) com custódia fria (hardware wallet). Limite de 5% a 8% do patrimônio.',
    },
  },

  ETH: {
    ticker: 'ETH',
    nome: 'Ethereum (ETH)',
    classe: 'cripto',
    setor: 'Infraestrutura de Smart Contracts & DeFi',
    cotacaoAtual: 3450.00,
    moeda: 'USD',
    descricao: 'Camada de liquidação descentralizada para finanças programáveis, stablecoins e tokenização de ativos.',
    indicadoresChave: {
      indicador1: { label: 'Staking Yield', valor: '3.4% a.a.' },
      indicador2: { label: 'ETH Bloqueado', valor: '34.2M ETH' },
      indicador3: { label: 'Taxa de Queima (EIP-1559)', valor: 'Deflacionário' },
      indicador4: { label: 'TVL Total', valor: '$58 Bi' },
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 9.80, rendimentoOuProvento: 0, metricaPrincipal: 'TVL: $10M', rentabilidadeAnualPct: 750.0 },
      { ano: 2017, cotacaoMedia: 280.00, rendimentoOuProvento: 0, metricaPrincipal: 'TVL: $1.2B', rentabilidadeAnualPct: 9100.0 },
      { ano: 2018, cotacaoMedia: 350.00, rendimentoOuProvento: 0, metricaPrincipal: 'TVL: $800M', rentabilidadeAnualPct: -82.0 },
      { ano: 2019, cotacaoMedia: 180.00, rendimentoOuProvento: 0, metricaPrincipal: 'TVL: $1.1B', rentabilidadeAnualPct: -2.0 },
      { ano: 2020, cotacaoMedia: 320.00, rendimentoOuProvento: 0, metricaPrincipal: 'TVL: $15B', rentabilidadeAnualPct: 470.0 },
      { ano: 2021, cotacaoMedia: 2750.00, rendimentoOuProvento: 0, metricaPrincipal: 'TVL: $98B', rentabilidadeAnualPct: 399.0 },
      { ano: 2022, cotacaoMedia: 1850.00, rendimentoOuProvento: 0, metricaPrincipal: 'The Merge PoS', rentabilidadeAnualPct: -67.5 },
      { ano: 2023, cotacaoMedia: 1920.00, rendimentoOuProvento: 0, metricaPrincipal: 'Staking: 24%', rentabilidadeAnualPct: 90.5 },
      { ano: 2024, cotacaoMedia: 3100.00, rendimentoOuProvento: 0, metricaPrincipal: 'ETF Aprovado', rentabilidadeAnualPct: 61.4 },
      { ano: 2025, cotacaoMedia: 3450.00, rendimentoOuProvento: 0, metricaPrincipal: 'Staking: 3.4% a.a.', rentabilidadeAnualPct: 11.2 },
    ],
    resumoDecenal: {
      rendimentoMedio10aPct: 58.0,
      volatilidadeDecenalPct: 70.0,
      teseAlocacao: 'Gas da economia de contratos inteligentes e ativos tokenizados do sistema financeiro.',
      diretrizDullius: 'Manter até 3% do portfólio em staking líquido auditado.',
    },
  },

  // =========================================================================
  // 4. TÍTULOS PÚBLICOS / TESOURO DIRETO
  // =========================================================================
  TESOURO_IPCA_2035: {
    ticker: 'NTNB_2035',
    nome: 'Tesouro IPCA+ 2035 (NTN-B Principal)',
    classe: 'tesouro',
    setor: 'Títulos Públicos Federais · Indexado à Inflação',
    cotacaoAtual: 2450.80,
    moeda: 'BRL',
    descricao: 'Título soberano emitido pela Secretaria do Tesouro Nacional pagando IPCA + taxa real no vencimento.',
    indicadoresChave: {
      indicador1: { label: 'Taxa Indicativa', valor: 'IPCA + 6.35% a.a.' },
      indicador2: { label: 'Vencimento', valor: '15/05/2035' },
      indicador3: { label: 'Duration Modificada', valor: '8.4 anos' },
      indicador4: { label: 'Risco de Crédito', valor: 'Soberano Brasil (Zero)' },
    },
    solvencia: {
      ratingCredito: 'Soberano Brasil / Tesouro Nacional',
      alertaAlavancagem: false,
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 980.00, rendimentoOuProvento: 6.8, metricaPrincipal: 'Taxa: IPCA + 6.8%', rentabilidadeAnualPct: 32.5 },
      { ano: 2017, cotacaoMedia: 1220.00, rendimentoOuProvento: 5.2, metricaPrincipal: 'Taxa: IPCA + 5.2%', rentabilidadeAnualPct: 24.5 },
      { ano: 2018, cotacaoMedia: 1380.00, rendimentoOuProvento: 5.5, metricaPrincipal: 'Taxa: IPCA + 5.5%', rentabilidadeAnualPct: 13.1 },
      { ano: 2019, cotacaoMedia: 1820.00, rendimentoOuProvento: 3.9, metricaPrincipal: 'Taxa: IPCA + 3.9%', rentabilidadeAnualPct: 31.8 },
      { ano: 2020, cotacaoMedia: 1980.00, rendimentoOuProvento: 4.1, metricaPrincipal: 'Taxa: IPCA + 4.1%', rentabilidadeAnualPct: 8.8 },
      { ano: 2021, cotacaoMedia: 1860.00, rendimentoOuProvento: 5.4, metricaPrincipal: 'Taxa: IPCA + 5.4%', rentabilidadeAnualPct: -6.0 },
      { ano: 2022, cotacaoMedia: 1920.00, rendimentoOuProvento: 5.9, metricaPrincipal: 'Taxa: IPCA + 5.9%', rentabilidadeAnualPct: 3.2 },
      { ano: 2023, cotacaoMedia: 2240.00, rendimentoOuProvento: 5.5, metricaPrincipal: 'Taxa: IPCA + 5.5%', rentabilidadeAnualPct: 16.6 },
      { ano: 2024, cotacaoMedia: 2380.00, rendimentoOuProvento: 6.2, metricaPrincipal: 'Taxa: IPCA + 6.2%', rentabilidadeAnualPct: 6.2 },
      { ano: 2025, cotacaoMedia: 2450.80, rendimentoOuProvento: 6.35, metricaPrincipal: 'Taxa: IPCA + 6.35%', rentabilidadeAnualPct: 2.9 },
    ],
    resumoDecenal: {
      rendimentoMedio10aPct: 11.2,
      volatilidadeDecenalPct: 10.4,
      teseAlocacao: 'Preservação de poder de compra no longo prazo com juro real garantido pelo emissor soberano.',
      diretrizDullius: 'Aportar sempre que a taxa real superar IPCA + 6.00% a.a. Carregar até o vencimento.',
    },
  },

  TESOURO_SELIC_2029: {
    ticker: 'LFT_2029',
    nome: 'Tesouro Selic 2029 (LFT)',
    classe: 'tesouro',
    setor: 'Títulos Públicos Federais · Pós-fixado Reserva de Caixa',
    cotacaoAtual: 14850.20,
    moeda: 'BRL',
    descricao: 'Título público com rentabilidade diária atrelada à taxa Selic meta. Isento de marcação a mercado negativa.',
    indicadoresChave: {
      indicador1: { label: 'Taxa Indicativa', valor: 'Selic + 0.12% a.a.' },
      indicador2: { label: 'Selic Vigente', valor: '11.25% a.a.' },
      indicador3: { label: 'Liquidez', valor: 'D+0 (Resgate Imediato)' },
      indicador4: { label: 'Volatilidade', valor: 'Zero (Pós-Fixado Puro)' },
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 8400.00, rendimentoOuProvento: 14.0, metricaPrincipal: 'Selic: 14.15%', rentabilidadeAnualPct: 14.0 },
      { ano: 2017, cotacaoMedia: 9240.00, rendimentoOuProvento: 10.0, metricaPrincipal: 'Selic: 7.00%', rentabilidadeAnualPct: 10.0 },
      { ano: 2018, cotacaoMedia: 9840.00, rendimentoOuProvento: 6.5, metricaPrincipal: 'Selic: 6.50%', rentabilidadeAnualPct: 6.5 },
      { ano: 2019, cotacaoMedia: 10430.00, rendimentoOuProvento: 6.0, metricaPrincipal: 'Selic: 4.50%', rentabilidadeAnualPct: 6.0 },
      { ano: 2020, cotacaoMedia: 10720.00, rendimentoOuProvento: 2.8, metricaPrincipal: 'Selic: 2.00%', rentabilidadeAnualPct: 2.8 },
      { ano: 2021, cotacaoMedia: 11200.00, rendimentoOuProvento: 4.5, metricaPrincipal: 'Selic: 9.25%', rentabilidadeAnualPct: 4.5 },
      { ano: 2022, cotacaoMedia: 12600.00, rendimentoOuProvento: 12.5, metricaPrincipal: 'Selic: 13.75%', rentabilidadeAnualPct: 12.5 },
      { ano: 2023, cotacaoMedia: 14240.00, rendimentoOuProvento: 13.0, metricaPrincipal: 'Selic: 11.75%', rentabilidadeAnualPct: 13.0 },
      { ano: 2024, cotacaoMedia: 14650.00, rendimentoOuProvento: 11.0, metricaPrincipal: 'Selic: 10.75%', rentabilidadeAnualPct: 11.0 },
      { ano: 2025, cotacaoMedia: 14850.20, rendimentoOuProvento: 11.25, metricaPrincipal: 'Selic: 11.25%', rentabilidadeAnualPct: 11.3 },
    ],
    resumoDecenal: {
      rendimentoMedio10aPct: 9.2,
      volatilidadeDecenalPct: 0.1,
      teseAlocacao: 'Armazenamento seguro de caixa de oportunidade para comprar ativos com margem Bazin.',
      diretrizDullius: 'Manter reserva de contingência e caixa estratégico integralmente aplicados nesta linha.',
    },
  },

  // =========================================================================
  // 5. TÍTULOS ESTRANGEIROS (US TREASURIES & GLOBAL BONDS)
  // =========================================================================
  US_TREASURY_10Y: {
    ticker: 'US10Y',
    nome: 'US 10-Year Treasury Benchmark Note',
    classe: 'estrangeiros',
    setor: 'Soberano Estados Unidos · Referência Global de Juro Livre de Risco',
    cotacaoAtual: 4.28,
    moeda: 'USD',
    descricao: 'Título de dívida soberana de 10 anos emitido pelo Tesouro dos Estados Unidos.',
    indicadoresChave: {
      indicador1: { label: 'Yield Atual', valor: '4.28% a.a. em Dólar' },
      indicador2: { label: 'Fed Funds Rate', valor: '4.75% - 5.00%' },
      indicador3: { label: 'Rating Soberano', valor: 'AAA / AA+ (Moody\'s / S&P)' },
      indicador4: { label: 'Moeda', valor: 'Dólar Americano (USD)' },
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 1.84, rendimentoOuProvento: 1.84, metricaPrincipal: 'Yield 10Y: 1.84%', rentabilidadeAnualPct: 1.8 },
      { ano: 2017, cotacaoMedia: 2.33, rendimentoOuProvento: 2.33, metricaPrincipal: 'Yield 10Y: 2.33%', rentabilidadeAnualPct: 2.3 },
      { ano: 2018, cotacaoMedia: 2.91, rendimentoOuProvento: 2.91, metricaPrincipal: 'Yield 10Y: 2.91%', rentabilidadeAnualPct: 2.9 },
      { ano: 2019, cotacaoMedia: 2.14, rendimentoOuProvento: 2.14, metricaPrincipal: 'Yield 10Y: 2.14%', rentabilidadeAnualPct: 7.8 },
      { ano: 2020, cotacaoMedia: 0.89, rendimentoOuProvento: 0.89, metricaPrincipal: 'Yield 10Y: 0.89%', rentabilidadeAnualPct: 11.2 },
      { ano: 2021, cotacaoMedia: 1.45, rendimentoOuProvento: 1.45, metricaPrincipal: 'Yield 10Y: 1.45%', rentabilidadeAnualPct: -4.4 },
      { ano: 2022, cotacaoMedia: 2.95, rendimentoOuProvento: 2.95, metricaPrincipal: 'Yield 10Y: 3.88%', rentabilidadeAnualPct: -16.8 },
      { ano: 2023, cotacaoMedia: 3.96, rendimentoOuProvento: 3.96, metricaPrincipal: 'Yield 10Y: 4.25%', rentabilidadeAnualPct: 3.4 },
      { ano: 2024, cotacaoMedia: 4.20, rendimentoOuProvento: 4.20, metricaPrincipal: 'Yield 10Y: 4.30%', rentabilidadeAnualPct: 4.2 },
      { ano: 2025, cotacaoMedia: 4.28, rendimentoOuProvento: 4.28, metricaPrincipal: 'Yield 10Y: 4.28%', rentabilidadeAnualPct: 4.3 },
    ],
    resumoDecenal: {
      rendimentoMedio10aPct: 2.9,
      volatilidadeDecenalPct: 7.8,
      teseAlocacao: 'Ativo livre de risco global em moeda de reserva mundial (USD) com proteção em cenários de estresse sistêmico.',
      diretrizDullius: 'Comprar com yield acima de 4.0% para ancorar capital internacional da holding.',
    },
  },

  TLT: {
    ticker: 'TLT',
    nome: 'iShares 20+ Year Treasury Bond ETF',
    classe: 'estrangeiros',
    setor: 'Títulos Longos dos EUA em Dólar',
    cotacaoAtual: 92.40,
    moeda: 'USD',
    descricao: 'ETF líquido com carteira de US Treasuries com prazo residual superior a 20 anos, pagando cupons mensais em dólar.',
    indicadoresChave: {
      indicador1: { label: '30-Day SEC Yield', valor: '4.55% a.a.' },
      indicador2: { label: 'Duration Efetiva', valor: '16.8 anos' },
      indicador3: { label: 'Distribuição', valor: 'Mensal em USD' },
      indicador4: { label: 'Patrimônio', valor: '$52 Bi' },
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 128.00, rendimentoOuProvento: 3.20, metricaPrincipal: 'Duration: 17.5a', rentabilidadeAnualPct: 1.2 },
      { ano: 2017, cotacaoMedia: 125.00, rendimentoOuProvento: 3.10, metricaPrincipal: 'Duration: 17.2a', rentabilidadeAnualPct: 8.8 },
      { ano: 2018, cotacaoMedia: 118.00, rendimentoOuProvento: 3.35, metricaPrincipal: 'Duration: 17.1a', rentabilidadeAnualPct: -1.8 },
      { ano: 2019, cotacaoMedia: 136.00, rendimentoOuProvento: 3.05, metricaPrincipal: 'Duration: 18.0a', rentabilidadeAnualPct: 14.2 },
      { ano: 2020, cotacaoMedia: 162.00, rendimentoOuProvento: 2.45, metricaPrincipal: 'Duration: 18.8a', rentabilidadeAnualPct: 18.1 },
      { ano: 2021, cotacaoMedia: 148.00, rendimentoOuProvento: 2.25, metricaPrincipal: 'Duration: 18.5a', rentabilidadeAnualPct: -4.6 },
      { ano: 2022, cotacaoMedia: 104.00, rendimentoOuProvento: 3.40, metricaPrincipal: 'Duration: 17.4a', rentabilidadeAnualPct: -31.4 },
      { ano: 2023, cotacaoMedia: 94.00, rendimentoOuProvento: 3.85, metricaPrincipal: 'Duration: 16.9a', rentabilidadeAnualPct: 2.8 },
      { ano: 2024, cotacaoMedia: 91.50, rendimentoOuProvento: 4.10, metricaPrincipal: 'Duration: 16.8a', rentabilidadeAnualPct: 1.5 },
      { ano: 2025, cotacaoMedia: 92.40, rendimentoOuProvento: 4.20, metricaPrincipal: 'Duration: 16.8a', rentabilidadeAnualPct: 4.5 },
    ],
    resumoDecenal: {
      rendimentoMedio10aPct: 3.2,
      volatilidadeDecenalPct: 15.2,
      teseAlocacao: 'Potencial assimétrico de valorização de capital (convexidade) no início de ciclos de corte de juros pelo Fed.',
      diretrizDullius: 'Alocar de 4% a 8% nos fundos de ciclo de juros americanos.',
    },
  },

  // =========================================================================
  // 6. COMMODITIES
  // =========================================================================
  OURO: {
    ticker: 'OURO',
    nome: 'Ouro Físico / Spot (XAU/USD - OZ1D B3)',
    classe: 'commodities',
    setor: 'Metais Preciosos / Reserva de Valor Milenar',
    cotacaoAtual: 2720.00,
    moeda: 'USD',
    descricao: 'Metal nobre monetário físico sem risco de emissor, com 5.000 anos de histórico como reserva de valor global.',
    indicadoresChave: {
      indicador1: { label: 'Cotação por Onça-Troy', valor: 'US$ 2.720,00' },
      indicador2: { label: 'Gramas B3 (OZ1D)', valor: 'R$ 498,50/g' },
      indicador3: { label: 'Compras Bancos Centrais', valor: '1.050 Ton/ano' },
      indicador4: { label: 'Retorno Decenal', valor: '+135% em USD / +340% em BRL' },
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 1250.00, rendimentoOuProvento: 0, metricaPrincipal: 'USD: 1.250/oz', rentabilidadeAnualPct: 8.5 },
      { ano: 2017, cotacaoMedia: 1260.00, rendimentoOuProvento: 0, metricaPrincipal: 'USD: 1.260/oz', rentabilidadeAnualPct: 13.2 },
      { ano: 2018, cotacaoMedia: 1270.00, rendimentoOuProvento: 0, metricaPrincipal: 'USD: 1.270/oz', rentabilidadeAnualPct: -1.5 },
      { ano: 2019, cotacaoMedia: 1390.00, rendimentoOuProvento: 0, metricaPrincipal: 'USD: 1.390/oz', rentabilidadeAnualPct: 18.9 },
      { ano: 2020, cotacaoMedia: 1770.00, rendimentoOuProvento: 0, metricaPrincipal: 'USD: 1.770/oz', rentabilidadeAnualPct: 25.1 },
      { ano: 2021, cotacaoMedia: 1800.00, rendimentoOuProvento: 0, metricaPrincipal: 'USD: 1.800/oz', rentabilidadeAnualPct: -3.5 },
      { ano: 2022, cotacaoMedia: 1800.00, rendimentoOuProvento: 0, metricaPrincipal: 'USD: 1.800/oz', rentabilidadeAnualPct: -0.3 },
      { ano: 2023, cotacaoMedia: 1940.00, rendimentoOuProvento: 0, metricaPrincipal: 'USD: 1.940/oz', rentabilidadeAnualPct: 13.1 },
      { ano: 2024, cotacaoMedia: 2450.00, rendimentoOuProvento: 0, metricaPrincipal: 'USD: 2.450/oz', rentabilidadeAnualPct: 31.8 },
      { ano: 2025, cotacaoMedia: 2720.00, rendimentoOuProvento: 0, metricaPrincipal: 'USD: 2.720/oz', rentabilidadeAnualPct: 11.0 },
    ],
    resumoDecenal: {
      rendimentoMedio10aPct: 11.5,
      volatilidadeDecenalPct: 12.4,
      teseAlocacao: 'Blindagem definitiva contra degradação de moedas fiduciárias, risco geopolítico e inflação global.',
      diretrizDullius: 'Manter cota de 5% a 10% da holding permanentemente alocada em ouro físico.',
    },
  },

  BRENT: {
    ticker: 'BRENT',
    nome: 'Petróleo Brent Spot (ICE Futures)',
    classe: 'commodities',
    setor: 'Commodities Energéticas Globais',
    cotacaoAtual: 78.50,
    moeda: 'USD',
    descricao: 'Referência internacional para precificação do petróleo bruto leve do Mar do Norte e contratos B3.',
    indicadoresChave: {
      indicador1: { label: 'Preço por Barril', valor: 'US$ 78.50' },
      indicador2: { label: 'Consumo Global', valor: '103.5M barris/dia' },
      indicador3: { label: 'Curva Futura', valor: 'Backwardation Moderado' },
      indicador4: { label: 'Capacidade OPEP+', valor: '4.5M bpd spare' },
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 45.10, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 45/bbl', rentabilidadeAnualPct: 52.4 },
      { ano: 2017, cotacaoMedia: 54.80, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 55/bbl', rentabilidadeAnualPct: 17.7 },
      { ano: 2018, cotacaoMedia: 71.30, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 71/bbl', rentabilidadeAnualPct: -19.5 },
      { ano: 2019, cotacaoMedia: 64.20, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 64/bbl', rentabilidadeAnualPct: 22.7 },
      { ano: 2020, cotacaoMedia: 43.20, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 43/bbl', rentabilidadeAnualPct: -21.5 },
      { ano: 2021, cotacaoMedia: 70.90, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 71/bbl', rentabilidadeAnualPct: 50.2 },
      { ano: 2022, cotacaoMedia: 99.00, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 99/bbl', rentabilidadeAnualPct: 10.5 },
      { ano: 2023, cotacaoMedia: 82.50, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 82/bbl', rentabilidadeAnualPct: -10.3 },
      { ano: 2024, cotacaoMedia: 80.20, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 80/bbl', rentabilidadeAnualPct: -2.8 },
      { ano: 2025, cotacaoMedia: 78.50, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 78.50/bbl', rentabilidadeAnualPct: -2.1 },
    ],
    resumoDecenal: {
      rendimentoMedio10aPct: 7.8,
      volatilidadeDecenalPct: 32.5,
      teseAlocacao: 'Fonte primordial de energia mundial com forte sensibilidade a gargalos geopolíticos.',
      diretrizDullius: 'Auditar custos de insumos na cadeia produtiva e aproveitar choques de preço via produtoras integradas.',
    },
  },

  SOJA: {
    ticker: 'SOJA',
    nome: 'Soja em Grãos Futuro (B3 / CBOT)',
    classe: 'commodities',
    setor: 'Commodities Agrícolas / Alimentos',
    cotacaoAtual: 134.20,
    moeda: 'BRL',
    descricao: 'Saca de 60kg de soja base Paranaguá / B3, principal produto da pauta de exportação do agronegócio.',
    indicadoresChave: {
      indicador1: { label: 'Saca 60kg (BRL)', valor: 'R$ 134.20' },
      indicador2: { label: 'Contrato CBOT (USD)', valor: 'US$ 10.25 / bushel' },
      indicador3: { label: 'Safra Brasileira', valor: '168M Toneladas' },
      indicador4: { label: 'Demanda Asiática', valor: 'Importações Recordes' },
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 74.00, rendimentoOuProvento: 0, metricaPrincipal: 'R$ 74/sc', rentabilidadeAnualPct: 12.0 },
      { ano: 2017, cotacaoMedia: 68.50, rendimentoOuProvento: 0, metricaPrincipal: 'R$ 68/sc', rentabilidadeAnualPct: -7.5 },
      { ano: 2018, cotacaoMedia: 79.20, rendimentoOuProvento: 0, metricaPrincipal: 'R$ 79/sc', rentabilidadeAnualPct: 15.6 },
      { ano: 2019, cotacaoMedia: 84.50, rendimentoOuProvento: 0, metricaPrincipal: 'R$ 84/sc', rentabilidadeAnualPct: 6.7 },
      { ano: 2020, cotacaoMedia: 132.00, rendimentoOuProvento: 0, metricaPrincipal: 'R$ 132/sc', rentabilidadeAnualPct: 56.2 },
      { ano: 2021, cotacaoMedia: 168.00, rendimentoOuProvento: 0, metricaPrincipal: 'R$ 168/sc', rentabilidadeAnualPct: 27.2 },
      { ano: 2022, cotacaoMedia: 184.00, rendimentoOuProvento: 0, metricaPrincipal: 'R$ 184/sc', rentabilidadeAnualPct: 9.5 },
      { ano: 2023, cotacaoMedia: 145.00, rendimentoOuProvento: 0, metricaPrincipal: 'R$ 145/sc', rentabilidadeAnualPct: -21.2 },
      { ano: 2024, cotacaoMedia: 132.00, rendimentoOuProvento: 0, metricaPrincipal: 'R$ 132/sc', rentabilidadeAnualPct: -8.9 },
      { ano: 2025, cotacaoMedia: 134.20, rendimentoOuProvento: 0, metricaPrincipal: 'R$ 134.20/sc', rentabilidadeAnualPct: 1.6 },
    ],
    resumoDecenal: {
      rendimentoMedio10aPct: 8.5,
      volatilidadeDecenalPct: 19.4,
      teseAlocacao: 'Demanda inelástica global de proteína animal e biocombustíveis com vantagem competitiva estrutural do solo brasileiro.',
      diretrizDullius: 'Acompanhar ciclos de preços para calibrar alocações no Banco do Brasil e fornecedoras de insumos agro.',
    },
  },

  VALE3: {
    ticker: 'VALE3',
    nome: 'Vale S.A.',
    classe: 'acoes',
    setor: 'Mineração & Minério de Ferro Global',
    cotacaoAtual: 61.20,
    moeda: 'BRL',
    descricao: 'Maior produtora mundial de minério de ferro de alto teor e níquel, geradora de fluxo de caixa em dólar.',
    indicadoresChave: {
      indicador1: { label: 'Preço-Teto Bazin (10a)', valor: 'R$ 78.40' },
      indicador2: { label: 'Margem de Segurança (10a)', valor: '+28.1%' },
      indicador3: { label: 'Dívida Líquida / EBITDA', valor: '0.92x' },
      indicador4: { label: 'DY Médio Decenal', valor: '8.9% a.a.' },
    },
    solvencia: {
      dlEbitdaAtual: 0.92,
      ratingCredito: 'BBB / Baa3 (Grau de Investimento Global)',
      alertaAlavancagem: false,
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 16.50, rendimentoOuProvento: 0.25, metricaPrincipal: 'DL/EBITDA: 2.1x', rentabilidadeAnualPct: 98.4 },
      { ano: 2017, cotacaoMedia: 28.40, rendimentoOuProvento: 1.45, metricaPrincipal: 'DL/EBITDA: 1.6x', rentabilidadeAnualPct: 72.1 },
      { ano: 2018, cotacaoMedia: 42.10, rendimentoOuProvento: 1.95, metricaPrincipal: 'DL/EBITDA: 1.2x', rentabilidadeAnualPct: 48.2 },
      { ano: 2019, cotacaoMedia: 46.80, rendimentoOuProvento: 1.40, metricaPrincipal: 'DL/EBITDA: 1.4x', rentabilidadeAnualPct: 11.2 },
      { ano: 2020, cotacaoMedia: 58.20, rendimentoOuProvento: 4.20, metricaPrincipal: 'DL/EBITDA: 0.7x', rentabilidadeAnualPct: 70.5 },
      { ano: 2021, cotacaoMedia: 84.50, rendimentoOuProvento: 18.40, metricaPrincipal: 'DL/EBITDA: 0.4x', rentabilidadeAnualPct: 32.8 },
      { ano: 2022, cotacaoMedia: 76.20, rendimentoOuProvento: 6.80, metricaPrincipal: 'DL/EBITDA: 0.6x', rentabilidadeAnualPct: 4.8 },
      { ano: 2023, cotacaoMedia: 68.40, rendimentoOuProvento: 5.90, metricaPrincipal: 'DL/EBITDA: 0.8x', rentabilidadeAnualPct: -4.5 },
      { ano: 2024, cotacaoMedia: 63.80, rendimentoOuProvento: 4.80, metricaPrincipal: 'DL/EBITDA: 0.88x', rentabilidadeAnualPct: -6.8 },
      { ano: 2025, cotacaoMedia: 61.20, rendimentoOuProvento: 4.70, metricaPrincipal: 'DL/EBITDA: 0.92x', rentabilidadeAnualPct: -4.1 },
    ],
    resumoDecenal: {
      tetoBazin10a: 78.40,
      margemSeguranca10aPct: 28.10,
      tetoBazin5a: 135.30,
      margemSeguranca5aPct: 121.08,
      rendimentoMedio10aPct: 8.9,
      conversaoCaixaPct: 88.5,
      dlEbitdaMedio10a: 1.05,
      teseAlocacao: 'Empresa exportadora com geração de caixa em dólar e baixo custo de extração (All-in C1).',
      diretrizDullius: 'Comprar abaixo do teto de R$ 78.40 aproveitando baixas do ciclo do minério de ferro.',
    },
  },

  ITUB4: {
    ticker: 'ITUB4',
    nome: 'Itaú Unibanco Holding S.A.',
    classe: 'acoes',
    setor: 'Bancário / Maior Banco Privado da América Latina',
    cotacaoAtual: 35.80,
    moeda: 'BRL',
    descricao: 'Líder em rentabilidade bancária no Brasil com ROE consistente acima de 20% e histórico impecável de crédito.',
    indicadoresChave: {
      indicador1: { label: 'Preço-Teto Bazin (10a)', valor: 'R$ 38.50' },
      indicador2: { label: 'Margem de Segurança', valor: '+7.5%' },
      indicador3: { label: 'ROE Médio Decenal', valor: '19.8%' },
      indicador4: { label: 'Índice de Basileia', valor: '16.8%' },
    },
    solvencia: {
      dlEbitdaAtual: 0.0,
      ratingCredito: 'AAA (br) / Basileia 16.8%',
      alertaAlavancagem: false,
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 18.20, rendimentoOuProvento: 1.15, metricaPrincipal: 'ROE: 19.5%', rentabilidadeAnualPct: 62.4 },
      { ano: 2017, cotacaoMedia: 22.80, rendimentoOuProvento: 1.40, metricaPrincipal: 'ROE: 21.0%', rentabilidadeAnualPct: 29.5 },
      { ano: 2018, cotacaoMedia: 28.50, rendimentoOuProvento: 2.10, metricaPrincipal: 'ROE: 21.2%', rentabilidadeAnualPct: 28.0 },
      { ano: 2019, cotacaoMedia: 34.20, rendimentoOuProvento: 2.90, metricaPrincipal: 'ROE: 22.8%', rentabilidadeAnualPct: 22.5 },
      { ano: 2020, cotacaoMedia: 24.80, rendimentoOuProvento: 0.95, metricaPrincipal: 'ROE: 14.5%', rentabilidadeAnualPct: -27.5 },
      { ano: 2021, cotacaoMedia: 23.50, rendimentoOuProvento: 1.10, metricaPrincipal: 'ROE: 17.3%', rentabilidadeAnualPct: -5.2 },
      { ano: 2022, cotacaoMedia: 25.80, rendimentoOuProvento: 1.80, metricaPrincipal: 'ROE: 19.8%', rentabilidadeAnualPct: 18.2 },
      { ano: 2023, cotacaoMedia: 31.40, rendimentoOuProvento: 2.40, metricaPrincipal: 'ROE: 21.0%', rentabilidadeAnualPct: 31.4 },
      { ano: 2024, cotacaoMedia: 34.50, rendimentoOuProvento: 2.85, metricaPrincipal: 'ROE: 21.4%', rentabilidadeAnualPct: 15.6 },
      { ano: 2025, cotacaoMedia: 35.80, rendimentoOuProvento: 2.95, metricaPrincipal: 'ROE: 21.8%', rentabilidadeAnualPct: 9.8 },
    ],
    resumoDecenal: {
      tetoBazin10a: 38.50,
      margemSeguranca10aPct: 7.54,
      tetoBazin5a: 43.60,
      margemSeguranca5aPct: 21.79,
      rendimentoMedio10aPct: 7.6,
      conversaoCaixaPct: 98.0,
      dlEbitdaMedio10a: 0.0,
      teseAlocacao: 'Maior e mais resiliente franquia de crédito e serviços financeiros do Brasil.',
      diretrizDullius: 'Comprar abaixo do teto de R$ 38.50 com foco em dividendos semestrais crescentes.',
    },
  },

  KNIP11: {
    ticker: 'KNIP11',
    nome: 'Kinea Rendimentos Imobiliários FII (CRI)',
    classe: 'fundos',
    setor: 'Fundos de Títulos & Valores Mobiliários (CRI IPCA+)',
    cotacaoAtual: 91.80,
    moeda: 'BRL',
    descricao: 'Maior FII de papel de crédito imobiliário do país gerido pela Kinea/Itaú, focado em CRIs com rating corporativo AAA.',
    indicadoresChave: {
      indicador1: { label: 'Taxa Média da Carteira', valor: 'IPCA + 7.85% a.a.' },
      indicador2: { label: 'P/VP Atual', valor: '0.96' },
      indicador3: { label: 'Dividend Yield (12m)', valor: '11.8% a.a.' },
      indicador4: { label: 'Patrimônio Líquido', valor: 'R$ 7.5 Bi' },
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 98.00, rendimentoOuProvento: 11.20, metricaPrincipal: 'P/VP: 0.99', rentabilidadeAnualPct: 14.5 },
      { ano: 2017, cotacaoMedia: 104.00, rendimentoOuProvento: 9.80, metricaPrincipal: 'P/VP: 1.04', rentabilidadeAnualPct: 16.0 },
      { ano: 2018, cotacaoMedia: 102.00, rendimentoOuProvento: 8.90, metricaPrincipal: 'P/VP: 1.01', rentabilidadeAnualPct: 8.5 },
      { ano: 2019, cotacaoMedia: 112.00, rendimentoOuProvento: 7.50, metricaPrincipal: 'P/VP: 1.10', rentabilidadeAnualPct: 17.5 },
      { ano: 2020, cotacaoMedia: 105.00, rendimentoOuProvento: 8.40, metricaPrincipal: 'P/VP: 1.03', rentabilidadeAnualPct: -1.2 },
      { ano: 2021, cotacaoMedia: 98.00, rendimentoOuProvento: 13.50, metricaPrincipal: 'P/VP: 0.98', rentabilidadeAnualPct: 6.8 },
      { ano: 2022, cotacaoMedia: 95.00, rendimentoOuProvento: 15.20, metricaPrincipal: 'P/VP: 0.96', rentabilidadeAnualPct: 12.4 },
      { ano: 2023, cotacaoMedia: 92.50, rendimentoOuProvento: 10.40, metricaPrincipal: 'P/VP: 0.97', rentabilidadeAnualPct: 8.5 },
      { ano: 2024, cotacaoMedia: 93.00, rendimentoOuProvento: 11.20, metricaPrincipal: 'P/VP: 0.98', rentabilidadeAnualPct: 11.8 },
      { ano: 2025, cotacaoMedia: 91.80, rendimentoOuProvento: 11.50, metricaPrincipal: 'P/VP: 0.96', rentabilidadeAnualPct: 10.5 },
    ],
    resumoDecenal: {
      tetoBazin10a: 179.30,
      margemSeguranca10aPct: 95.3,
      rendimentoMedio10aPct: 10.8,
      volatilidadeDecenalPct: 6.8,
      teseAlocacao: 'Fluxo mensal isento de imposto de renda corrigido diretamente pelo IPCA através de dívida imobiliária sênior.',
      diretrizDullius: 'Comprar sempre com P/VP menor que 1.00 para travar juro real de IPCA + 7% a 8% a.a.',
    },
  },

  MXRF11: {
    ticker: 'MXRF11',
    nome: 'Maxi Renda FII',
    classe: 'fundos',
    setor: 'Fundo Híbrido Imobiliário / Crédito e Permutas',
    cotacaoAtual: 10.15,
    moeda: 'BRL',
    descricao: 'Maior FII em número de cotistas no Brasil com carteira diversificada em CRIs de infraestrutura e permutas financeiras.',
    indicadoresChave: {
      indicador1: { label: 'P/VP Atual', valor: '1.01' },
      indicador2: { label: 'Dividend Yield (12m)', valor: '12.4% a.a.' },
      indicador3: { label: 'Cotistas Ativos', valor: '1.1 Milhão' },
      indicador4: { label: 'Liquidez Diária', valor: 'R$ 12M/dia' },
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 9.80, rendimentoOuProvento: 1.05, metricaPrincipal: 'P/VP: 0.98', rentabilidadeAnualPct: 12.0 },
      { ano: 2017, cotacaoMedia: 10.20, rendimentoOuProvento: 1.08, metricaPrincipal: 'P/VP: 1.02', rentabilidadeAnualPct: 15.0 },
      { ano: 2018, cotacaoMedia: 10.40, rendimentoOuProvento: 1.10, metricaPrincipal: 'P/VP: 1.03', rentabilidadeAnualPct: 12.5 },
      { ano: 2019, cotacaoMedia: 12.80, rendimentoOuProvento: 1.15, metricaPrincipal: 'P/VP: 1.25', rentabilidadeAnualPct: 34.0 },
      { ano: 2020, cotacaoMedia: 10.60, rendimentoOuProvento: 0.95, metricaPrincipal: 'P/VP: 1.04', rentabilidadeAnualPct: -8.0 },
      { ano: 2021, cotacaoMedia: 10.20, rendimentoOuProvento: 1.12, metricaPrincipal: 'P/VP: 1.01', rentabilidadeAnualPct: 6.5 },
      { ano: 2022, cotacaoMedia: 10.10, rendimentoOuProvento: 1.25, metricaPrincipal: 'P/VP: 1.00', rentabilidadeAnualPct: 11.4 },
      { ano: 2023, cotacaoMedia: 10.60, rendimentoOuProvento: 1.32, metricaPrincipal: 'P/VP: 1.05', rentabilidadeAnualPct: 17.8 },
      { ano: 2024, cotacaoMedia: 10.30, rendimentoOuProvento: 1.26, metricaPrincipal: 'P/VP: 1.02', rentabilidadeAnualPct: 9.5 },
      { ano: 2025, cotacaoMedia: 10.15, rendimentoOuProvento: 1.24, metricaPrincipal: 'P/VP: 1.01', rentabilidadeAnualPct: 10.8 },
    ],
    resumoDecenal: {
      tetoBazin10a: 19.10,
      margemSeguranca10aPct: 88.2,
      rendimentoMedio10aPct: 11.4,
      volatilidadeDecenalPct: 5.2,
      teseAlocacao: 'Fluxo constante de proventos mensais com ultra-liquidez de mercado.',
      diretrizDullius: 'Comprar exclusivamente próximo ou abaixo do valor patrimonial de R$ 10,00.',
    },
  },

  SOL: {
    ticker: 'SOL',
    nome: 'Solana (SOL)',
    classe: 'cripto',
    setor: 'Blockchain Monolítica de Alta Velocidade & Finanças Descentralizadas',
    cotacaoAtual: 175.40,
    moeda: 'USD',
    descricao: 'Rede de primeira camada orientada a altíssimo throughput (> 3.000 TPS) com taxas quase nulas e grande adoção de pagamentos.',
    indicadoresChave: {
      indicador1: { label: 'Transações/Segundo', valor: '3.200 TPS' },
      indicador2: { label: 'Staking Yield', valor: '6.8% a.a.' },
      indicador3: { label: 'TVL Total', valor: '$6.5 Bi' },
      indicador4: { label: 'Volume DEX 24h', valor: '$2.8 Bi (Top 2 Global)' },
    },
    historico10Anos: [
      { ano: 2020, cotacaoMedia: 1.50, rendimentoOuProvento: 0, metricaPrincipal: 'Lançamento Mainnet', rentabilidadeAnualPct: 200.0 },
      { ano: 2021, cotacaoMedia: 125.00, rendimentoOuProvento: 0, metricaPrincipal: 'All-Time High $260', rentabilidadeAnualPct: 8200.0 },
      { ano: 2022, cotacaoMedia: 35.00, rendimentoOuProvento: 0, metricaPrincipal: 'Crise FTX / Suporte $8', rentabilidadeAnualPct: -94.0 },
      { ano: 2023, cotacaoMedia: 45.00, rendimentoOuProvento: 0, metricaPrincipal: 'Recuperação Institucional', rentabilidadeAnualPct: 915.0 },
      { ano: 2024, cotacaoMedia: 152.00, rendimentoOuProvento: 0, metricaPrincipal: 'Boom de Memes & DEX', rentabilidadeAnualPct: 145.0 },
      { ano: 2025, cotacaoMedia: 175.40, rendimentoOuProvento: 0, metricaPrincipal: 'Firedancer Testnet', rentabilidadeAnualPct: 15.4 },
    ],
    resumoDecenal: {
      rendimentoMedio10aPct: 185.0,
      volatilidadeDecenalPct: 82.0,
      teseAlocacao: 'Infraestrutura de alta frequência para o sistema financeiro moderno e pagamentos tokenizados.',
      diretrizDullius: 'Alocação máxima de 2% do portfólio em posições com staking automático ativado.',
    },
  },

  TESOURO_PREFIXADO_2031: {
    ticker: 'LTN_2031',
    nome: 'Tesouro Prefixado 2031 (LTN)',
    classe: 'tesouro',
    setor: 'Títulos Públicos Federais · Taxa Pré-fixada Fechada',
    cotacaoAtual: 485.60,
    moeda: 'BRL',
    descricao: 'Título público soberano com rentabilidade nominal previamente acordada até o resgate em 01/01/2031.',
    indicadoresChave: {
      indicador1: { label: 'Taxa Anual Contratada', valor: '12.45% a.a.' },
      indicador2: { label: 'Valor Nominal no Vencimento', valor: 'R$ 1.000,00' },
      indicador3: { label: 'Vencimento', valor: '01/01/2031' },
      indicador4: { label: 'Risco de Crédito', valor: 'Soberano Federal' },
    },
    solvencia: {
      ratingCredito: 'Tesouro Nacional Brasil',
      alertaAlavancagem: false,
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 320.00, rendimentoOuProvento: 16.5, metricaPrincipal: 'Taxa Pré: 16.5%', rentabilidadeAnualPct: 38.0 },
      { ano: 2017, cotacaoMedia: 380.00, rendimentoOuProvento: 10.5, metricaPrincipal: 'Taxa Pré: 10.5%', rentabilidadeAnualPct: 22.0 },
      { ano: 2018, cotacaoMedia: 410.00, rendimentoOuProvento: 9.8, metricaPrincipal: 'Taxa Pré: 9.8%', rentabilidadeAnualPct: 11.5 },
      { ano: 2019, cotacaoMedia: 490.00, rendimentoOuProvento: 6.8, metricaPrincipal: 'Taxa Pré: 6.8%', rentabilidadeAnualPct: 24.5 },
      { ano: 2020, cotacaoMedia: 470.00, rendimentoOuProvento: 7.2, metricaPrincipal: 'Taxa Pré: 7.2%', rentabilidadeAnualPct: -4.0 },
      { ano: 2021, cotacaoMedia: 420.00, rendimentoOuProvento: 11.5, metricaPrincipal: 'Taxa Pré: 11.5%', rentabilidadeAnualPct: -10.5 },
      { ano: 2022, cotacaoMedia: 410.00, rendimentoOuProvento: 13.2, metricaPrincipal: 'Taxa Pré: 13.2%', rentabilidadeAnualPct: 1.0 },
      { ano: 2023, cotacaoMedia: 460.00, rendimentoOuProvento: 11.8, metricaPrincipal: 'Taxa Pré: 11.8%', rentabilidadeAnualPct: 18.5 },
      { ano: 2024, cotacaoMedia: 475.00, rendimentoOuProvento: 12.2, metricaPrincipal: 'Taxa Pré: 12.2%', rentabilidadeAnualPct: 8.5 },
      { ano: 2025, cotacaoMedia: 485.60, rendimentoOuProvento: 12.45, metricaPrincipal: 'Taxa Pré: 12.45%', rentabilidadeAnualPct: 7.8 },
    ],
    resumoDecenal: {
      rendimentoMedio10aPct: 11.6,
      volatilidadeDecenalPct: 13.5,
      teseAlocacao: 'Travar taxa nominal de dois dígitos no pico de juros para valorização de marcação a mercado ou retorno contratado.',
      diretrizDullius: 'Comprar sempre que a taxa prefixada superar 12.0% a.a., carregando até o vencimento.',
    },
  },

  TBILL_3M: {
    ticker: 'TBILL_3M',
    nome: 'US Treasury Bills 3-Month (T-Bills)',
    classe: 'estrangeiros',
    setor: 'Títulos de Curto Prazo do Governo dos EUA em Dólar',
    cotacaoAtual: 4.62,
    moeda: 'USD',
    descricao: 'Títulos de dívida do governo norte-americano com vencimento de 90 dias, padrão global de taxa livre de risco em moeda forte.',
    indicadoresChave: {
      indicador1: { label: 'Yield Anualizado', valor: '4.62% a.a. em Dólar' },
      indicador2: { label: 'Vencimento Médio', valor: '90 dias' },
      indicador3: { label: 'Moeda', valor: 'USD' },
      indicador4: { label: 'Risco de Volatilidade', valor: 'Praticamente Zero' },
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 0.32, rendimentoOuProvento: 0.32, metricaPrincipal: 'Yield: 0.32%', rentabilidadeAnualPct: 0.3 },
      { ano: 2017, cotacaoMedia: 0.95, rendimentoOuProvento: 0.95, metricaPrincipal: 'Yield: 0.95%', rentabilidadeAnualPct: 1.0 },
      { ano: 2018, cotacaoMedia: 1.94, rendimentoOuProvento: 1.94, metricaPrincipal: 'Yield: 1.94%', rentabilidadeAnualPct: 1.9 },
      { ano: 2019, cotacaoMedia: 2.06, rendimentoOuProvento: 2.06, metricaPrincipal: 'Yield: 2.06%', rentabilidadeAnualPct: 2.1 },
      { ano: 2020, cotacaoMedia: 0.38, rendimentoOuProvento: 0.38, metricaPrincipal: 'Yield: 0.38%', rentabilidadeAnualPct: 0.4 },
      { ano: 2021, cotacaoMedia: 0.05, rendimentoOuProvento: 0.05, metricaPrincipal: 'Yield: 0.05%', rentabilidadeAnualPct: 0.1 },
      { ano: 2022, cotacaoMedia: 2.05, rendimentoOuProvento: 2.05, metricaPrincipal: 'Yield: 2.05%', rentabilidadeAnualPct: 2.1 },
      { ano: 2023, cotacaoMedia: 5.25, rendimentoOuProvento: 5.25, metricaPrincipal: 'Yield: 5.25%', rentabilidadeAnualPct: 5.3 },
      { ano: 2024, cotacaoMedia: 5.10, rendimentoOuProvento: 5.10, metricaPrincipal: 'Yield: 5.10%', rentabilidadeAnualPct: 5.1 },
      { ano: 2025, cotacaoMedia: 4.62, rendimentoOuProvento: 4.62, metricaPrincipal: 'Yield: 4.62%', rentabilidadeAnualPct: 4.6 },
    ],
    resumoDecenal: {
      rendimentoMedio10aPct: 2.3,
      volatilidadeDecenalPct: 0.2,
      teseAlocacao: 'Liquidez pura em moeda de reserva global para resguardar a holding contra choques cambiais.',
      diretrizDullius: 'Manter caixa internacional em T-Bills rendendo juros compostos diários.',
    },
  },

  PRATA: {
    ticker: 'PRATA',
    nome: 'Prata Físico / Spot (XAG/USD)',
    classe: 'commodities',
    setor: 'Metais Preciosos & Aplicação Industrial Verde',
    cotacaoAtual: 31.80,
    moeda: 'USD',
    descricao: 'Metal nobre com dupla vocação: reserva monetária histórica e insumo industrial indispensável para painéis solares e baterias.',
    indicadoresChave: {
      indicador1: { label: 'Preço por Onça-Troy', valor: 'US$ 31.80' },
      indicador2: { label: 'Demanda Fotovoltaica', valor: '35% da Produção Global' },
      indicador3: { label: 'Relação Ouro/Prata', valor: '85x (Desconto Histórico)' },
      indicador4: { label: 'Déficit Físico Anual', valor: '4º Ano Consecutivo' },
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 17.10, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 17/oz', rentabilidadeAnualPct: 15.2 },
      { ano: 2017, cotacaoMedia: 17.00, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 17/oz', rentabilidadeAnualPct: 6.8 },
      { ano: 2018, cotacaoMedia: 15.70, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 15.7/oz', rentabilidadeAnualPct: -8.5 },
      { ano: 2019, cotacaoMedia: 16.20, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 16.2/oz', rentabilidadeAnualPct: 15.2 },
      { ano: 2020, cotacaoMedia: 20.50, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 20.5/oz', rentabilidadeAnualPct: 47.8 },
      { ano: 2021, cotacaoMedia: 25.10, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 25.1/oz', rentabilidadeAnualPct: -11.5 },
      { ano: 2022, cotacaoMedia: 21.70, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 21.7/oz', rentabilidadeAnualPct: 2.8 },
      { ano: 2023, cotacaoMedia: 23.40, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 23.4/oz', rentabilidadeAnualPct: -0.8 },
      { ano: 2024, cotacaoMedia: 28.50, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 28.5/oz', rentabilidadeAnualPct: 34.5 },
      { ano: 2025, cotacaoMedia: 31.80, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 31.80/oz', rentabilidadeAnualPct: 14.8 },
    ],
    resumoDecenal: {
      rendimentoMedio10aPct: 11.6,
      volatilidadeDecenalPct: 24.5,
      teseAlocacao: 'Ativo real de proteção inflacionária turbinado pela transição energética global.',
      diretrizDullius: 'Comprar quando a relação Ouro/Prata superar 80x.',
    },
  },

  CAFE: {
    ticker: 'CAFE',
    nome: 'Café Arábica Futuro (B3 / ICE)',
    classe: 'commodities',
    setor: 'Commodities Agrícolas / Softs',
    cotacaoAtual: 242.00,
    moeda: 'USD',
    descricao: 'Contrato de café arábica tipo 6, referência mundial na Bolsa de Nova York (ICE) e B3, liderado pela produção brasileira.',
    indicadoresChave: {
      indicador1: { label: 'Preço (Cents/lb)', valor: 'US$ 242.00' },
      indicador2: { label: 'Safra Brasil', valor: '64M Sacas' },
      indicador3: { label: 'Estoques Globais', valor: 'Mínimas de 20 Anos' },
      indicador4: { label: 'Consumo Mundial', valor: '172M Sacas/ano' },
    },
    historico10Anos: [
      { ano: 2016, cotacaoMedia: 135.00, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 135', rentabilidadeAnualPct: 16.5 },
      { ano: 2017, cotacaoMedia: 128.00, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 128', rentabilidadeAnualPct: -11.0 },
      { ano: 2018, cotacaoMedia: 112.00, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 112', rentabilidadeAnualPct: -20.5 },
      { ano: 2019, cotacaoMedia: 105.00, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 105', rentabilidadeAnualPct: 27.0 },
      { ano: 2020, cotacaoMedia: 118.00, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 118', rentabilidadeAnualPct: -1.2 },
      { ano: 2021, cotacaoMedia: 175.00, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 175 (Geada)', rentabilidadeAnualPct: 76.5 },
      { ano: 2022, cotacaoMedia: 215.00, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 215', rentabilidadeAnualPct: -26.0 },
      { ano: 2023, cotacaoMedia: 168.00, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 168', rentabilidadeAnualPct: 12.5 },
      { ano: 2024, cotacaoMedia: 220.00, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 220', rentabilidadeAnualPct: 40.0 },
      { ano: 2025, cotacaoMedia: 242.00, rendimentoOuProvento: 0, metricaPrincipal: 'US$ 242', rentabilidadeAnualPct: 10.5 },
    ],
    resumoDecenal: {
      rendimentoMedio10aPct: 12.4,
      volatilidadeDecenalPct: 35.8,
      teseAlocacao: 'Hedge agrícola contra anomalias climáticas no cinturão cafeeiro brasileiro.',
      diretrizDullius: 'Monitorar para operações de financiamento rural da carteira de crédito do BBAS3.',
    },
  },
};

// Aliases de compatibilidade para o estúdio e painéis
export const EMPRESAS_MERCADO_10_ANOS = UNIVERSO_MERCADO_FINANCEIRO;
export type EmpresaHistorico10Anos = AtivoMercadoFinanceiro;

export class MarketData10YearsService {
  private static instance: MarketData10YearsService;

  public static getInstance(): MarketData10YearsService {
    if (!MarketData10YearsService.instance) {
      MarketData10YearsService.instance = new MarketData10YearsService();
    }
    return MarketData10YearsService.instance;
  }

  public listarTickers(): string[] {
    return Object.keys(UNIVERSO_MERCADO_FINANCEIRO);
  }

  public listarPorClasse(classe?: ClasseAtivoFinanceiro | 'todos'): AtivoMercadoFinanceiro[] {
    const todos = Object.values(UNIVERSO_MERCADO_FINANCEIRO);
    if (!classe || classe === 'todos') return todos;
    return todos.filter((a) => a.classe === classe);
  }

  public obterAtivo(ticker: string): AtivoMercadoFinanceiro | undefined {
    if (!ticker) return undefined;
    const clean = ticker.toUpperCase().trim();
    return UNIVERSO_MERCADO_FINANCEIRO[clean] || Object.values(UNIVERSO_MERCADO_FINANCEIRO).find(
      (a) => a.ticker.toUpperCase() === clean || clean.includes(a.ticker.toUpperCase())
    );
  }

  // Compatibilidade com método anterior
  public obterEmpresa(ticker: string): any {
    return this.obterAtivo(ticker);
  }

  public obterTodas(): AtivoMercadoFinanceiro[] {
    return Object.values(UNIVERSO_MERCADO_FINANCEIRO);
  }
}
