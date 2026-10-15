import { Ativo, DossieConsolidado, MetricasBazin, MetricasGraham, MetricasSolvencia } from '../types';

export class FinancialEngineClient {
  public static readonly TAXA_DESCONTO_BAZIN = 0.06; // 6% a.a.
  public static readonly LIMITE_CRITICO_DL_EBITDA = 3.5; // Alavancagem crítica

  public static calcularCAGR(valorInicial: number, valorFinal: number, periodos: number): number | null {
    if (valorInicial <= 0 || valorFinal <= 0 || periodos <= 0) return null;
    try {
      const cagr = (Math.pow(valorFinal / valorInicial, 1.0 / periodos) - 1.0) * 100;
      return Number(cagr.toFixed(2));
    } catch {
      return null;
    }
  }

  public static processarDossie(ativo: Ativo, cotacaoSobrescrita?: number): DossieConsolidado {
    const cotacao = cotacaoSobrescrita !== undefined ? cotacaoSobrescrita : ativo.cotacao_atual;
    const { demonstrativos, ticker, setor, nome_empresa, classe } = ativo;

    if (!demonstrativos || demonstrativos.length === 0) {
      throw new Error(`Ativo ${ticker} não possui demonstrativos cadastrados.`);
    }

    // Ordenar cronologicamente do ano mais antigo ao mais recente
    const sorted = [...demonstrativos].sort((a, b) => a.ano - b.ano);
    const nAnos = sorted.length;

    // 1. Décio Bazin: Médias de 3 e 5 anos utilizando DPA Ajustado
    const ultimos3 = sorted.slice(-Math.min(3, nAnos));
    const ultimos5 = sorted.slice(-Math.min(5, nAnos));

    const somaDpa3 = ultimos3.reduce((acc, d) => acc + (d.dpa_ajustado > 0 ? d.dpa_ajustado : d.dpa_bruto), 0);
    const dpaMedio3 = somaDpa3 / ultimos3.length;

    const somaDpa5 = ultimos5.reduce((acc, d) => acc + (d.dpa_ajustado > 0 ? d.dpa_ajustado : d.dpa_bruto), 0);
    const dpaMedio5 = somaDpa5 / ultimos5.length;

    const tetoBazin3 = dpaMedio3 > 0 ? Number((dpaMedio3 / this.TAXA_DESCONTO_BAZIN).toFixed(2)) : 0;
    const tetoBazin5 = dpaMedio5 > 0 ? Number((dpaMedio5 / this.TAXA_DESCONTO_BAZIN).toFixed(2)) : 0;

    const margemSeguranca3 = cotacao > 0 && tetoBazin3 > 0
      ? Number((((tetoBazin3 - cotacao) / cotacao) * 100).toFixed(2))
      : 0;

    const margemSeguranca5 = cotacao > 0 && tetoBazin5 > 0
      ? Number((((tetoBazin5 - cotacao) / cotacao) * 100).toFixed(2))
      : 0;

    const dyProjetado = cotacao > 0 ? Number(((dpaMedio3 / cotacao) * 100).toFixed(2)) : 0;

    // CAGR de dividendos
    let cagr5: number | null = null;
    if (nAnos >= 5) {
      const inicio5 = sorted[nAnos - 5].dpa_ajustado || sorted[nAnos - 5].dpa_bruto;
      const fim5 = sorted[nAnos - 1].dpa_ajustado || sorted[nAnos - 1].dpa_bruto;
      cagr5 = this.calcularCAGR(inicio5, fim5, 4);
    }

    let cagr10: number | null = null;
    if (nAnos >= 10) {
      const inicio10 = sorted[0].dpa_ajustado || sorted[0].dpa_bruto;
      const fim10 = sorted[nAnos - 1].dpa_ajustado || sorted[nAnos - 1].dpa_bruto;
      cagr10 = this.calcularCAGR(inicio10, fim10, nAnos - 1);
    }

    const bazin: MetricasBazin = {
      dpa_medio_3_anos: Number(dpaMedio3.toFixed(4)),
      teto_bazin_3_anos: tetoBazin3,
      margem_seguranca_3_anos_pct: margemSeguranca3,
      dpa_medio_5_anos: Number(dpaMedio5.toFixed(4)),
      teto_bazin_5_anos: tetoBazin5,
      margem_seguranca_5_anos_pct: margemSeguranca5,
      cagr_dividendos_5_anos_pct: cagr5,
      cagr_dividendos_10_anos_pct: cagr10,
      dividend_yield_projetado_pct: dyProjetado,
    };

    // 2. Fórmula de Graham: sqrt(22.5 * LPA * VPA)
    const maisRecente = sorted[nAnos - 1];
    const lpa = maisRecente.lpa;
    const vpa = maisRecente.vpa;

    let precoJustoGraham: number | null = null;
    let descontoGraham: number | null = null;
    let statusGraham = 'INAPLICAVEL';

    if (lpa > 0 && vpa > 0) {
      precoJustoGraham = Number(Math.sqrt(22.5 * lpa * vpa).toFixed(2));
      descontoGraham = cotacao > 0 ? Number((((precoJustoGraham - cotacao) / cotacao) * 100).toFixed(2)) : 0;
      statusGraham = precoJustoGraham >= cotacao ? 'DESCONTO_ATRATIVO' : 'ACIMA_DO_VALOR_JUSTO';
    } else {
      statusGraham = 'LPA_OU_VPA_NEGATIVO';
    }

    const graham: MetricasGraham = {
      lpa_recente: Number(lpa.toFixed(2)),
      vpa_recente: Number(vpa.toFixed(2)),
      preco_justo_graham: precoJustoGraham,
      desconto_graham_pct: descontoGraham,
      status_graham: statusGraham,
    };

    // 3. Solvência & Alavancagem
    const isBanco = setor.includes('Financeiro') || setor.includes('Banco') || setor.includes('Segur');
    const dlAtual = maisRecente.divida_liquida || 0;
    const ebitdaAtual = maisRecente.ebitda !== undefined ? maisRecente.ebitda : null;

    let dlEbitdaAtual: number | null = null;
    if (!isBanco && ebitdaAtual && ebitdaAtual > 0) {
      dlEbitdaAtual = Number((dlAtual / ebitdaAtual).toFixed(2));
    }

    let dlEbitda5y: number | null = null;
    if (!isBanco) {
      const ultimosComEbitda = ultimos5.filter(d => (d.ebitda || 0) > 0);
      if (ultimosComEbitda.length > 0) {
        const media = ultimosComEbitda.reduce((acc, d) => acc + (d.divida_liquida / (d.ebitda || 1)), 0) / ultimosComEbitda.length;
        dlEbitda5y = Number(media.toFixed(2));
      }
    }

    const alertaAlavancagem = !isBanco && dlEbitdaAtual !== null && dlEbitdaAtual > this.LIMITE_CRITICO_DL_EBITDA;

    // Cobertura de Juros
    let coberturaJuros: number | null = null;
    if (maisRecente.ebit && maisRecente.despesas_financeiras && maisRecente.despesas_financeiras > 0) {
      coberturaJuros = Number((maisRecente.ebit / maisRecente.despesas_financeiras).toFixed(2));
    }

    // Divergência FCO vs Lucro Líquido
    const fcoAtual = maisRecente.fco;
    const llAtual = maisRecente.lucro_liquido;

    let qualidadeLucro = 'NORMAL_ACOMPANHAR';
    const ultimos3FCO = ultimos3.filter(d => d.lucro_liquido > 0 && d.fco < 0);
    if (ultimos3FCO.length >= 2) {
      qualidadeLucro = 'ALERTA_CRITICO_FCO_PERSISTENTEMENTE_NEGATIVO';
    } else if (llAtual > 0 && fcoAtual < 0) {
      qualidadeLucro = 'ATENCAO_FCO_NEGATIVO_NO_ANO';
    } else if (llAtual > 0 && fcoAtual >= llAtual * 0.7) {
      qualidadeLucro = 'EXCELENTE_FORTE_CONVERSAO_DE_CAIXA';
    }

    const solvencia: MetricasSolvencia = {
      divida_liquida_atual: dlAtual,
      ebitda_atual: ebitdaAtual,
      dl_ebitda_atual: dlEbitdaAtual,
      dl_ebitda_medio_5_anos: dlEbitda5y,
      alerta_alavancagem_critica: alertaAlavancagem,
      cobertura_juros_atual: coberturaJuros,
      qualidade_lucro_divergencia_fco: qualidadeLucro,
    };

    return {
      ticker,
      nome_empresa,
      classe,
      setor,
      cotacao_atual: cotacao,
      anos_historico_disponiveis: nAnos,
      bazin,
      graham,
      solvencia,
      serie_historica: sorted,
      alocacao_atual_pct: ativo.alocacao_atual_pct,
      alocacao_alvo_pct: ativo.alocacao_alvo_pct,
      quantidade_custodia: ativo.quantidade,
      preco_medio_custodia: ativo.preco_medio,
    };
  }
}
