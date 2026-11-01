interface FinanceAnalysisInput {
  ticker?: string;
  currentPrice?: number;
  averageDPA?: number;
  debtToEbitda?: number;
}

export async function runFinanceAgent({ ticker, currentPrice, averageDPA, debtToEbitda }: FinanceAnalysisInput) {
  console.log(`📈 [Agente Analista Financeiro] Executando auditoria técnica para o ativo: ${ticker || 'Carteira Geral'}`);

  // Cálculo de Preço-Teto Bazin (Retorno mínimo de 6% a.a. -> DPA / 0.06)
  const dpa = averageDPA || 1.50;
  const targetPriceBazin = dpa / 0.06;
  const price = currentPrice || targetPriceBazin * 0.9; // Simulação de cotação se não informada
  
  const marginOfSafety = ((targetPriceBazin - price) / targetPriceBazin) * 100;
  const leverage = debtToEbitda || 2.1;

  // Auditoria de Semáforo de Saúde Financeira
  let operationalVerdict = 'AGUARDAR';
  if (marginOfSafety > 15 && leverage <= 3.5) {
    operationalVerdict = 'COMPRAR (Prioridade)';
  } else if (leverage > 3.5) {
    operationalVerdict = 'QUARENTENA / MANTER (Alavancagem Elevada)';
  }

  const analysisReport = {
    ativo: ticker || 'ATIVO_GENÉRICO',
    diagnosticoExecutivo: `Análise pragmática concluída para ${ticker || 'o ativo'}. Alavancagem Dívida Líq/EBITDA em ${leverage}x.`,
    precoTetoBazin: Number(targetPriceBazin.toFixed(2)),
    cotacaoAtual: price,
    margemSegurancaPercentual: Number(marginOfSafety.toFixed(2)),
    vereditoOperacional: operationalVerdict,
    timestamp: new Date().toISOString()
  };

  return analysisReport;
}