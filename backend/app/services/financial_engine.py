"""
Motor Analítico e Determinístico de Cálculo Financeiro (Décio Bazin & Graham Engine).
Executa 100% da matemática financeira sem nenhuma interferência de LLM.
Garante consistência e precisão aritmética de demonstrativos de 10 anos.
"""

import math
from typing import List, Dict, Any, Optional
import pandas as pd
from pydantic import BaseModel, Field


class SerieAnoContabil(BaseModel):
    ano: int
    dpa_bruto: float
    dpa_ajustado: float
    lpa: float
    vpa: float
    receita_liquida: Optional[float] = None
    ebitda: Optional[float] = None
    ebit: Optional[float] = None
    lucro_liquido: float
    fco: float
    divida_liquida: float
    patrimonio_liquido: float
    despesas_financeiras: Optional[float] = None
    dl_ebitda: Optional[float] = None
    cobertura_juros: Optional[float] = None
    roe_pct: Optional[float] = None
    divergencia_fco_lucro: Optional[float] = None


class MetricasBazin(BaseModel):
    dpa_medio_3_anos: float
    teto_bazin_3_anos: float
    margem_seguranca_3_anos_pct: float
    dpa_medio_5_anos: float
    teto_bazin_5_anos: float
    margem_seguranca_5_anos_pct: float
    cagr_dividendos_5_anos_pct: Optional[float]
    cagr_dividendos_10_anos_pct: Optional[float]
    dividend_yield_projetado_pct: float


class MetricasGraham(BaseModel):
    lpa_recente: float
    vpa_recente: float
    preco_justo_graham: Optional[float]
    desconto_graham_pct: Optional[float]
    status_graham: str


class MetricasSolvencia(BaseModel):
    divida_liquida_atual: float
    ebitda_atual: Optional[float]
    dl_ebitda_atual: Optional[float]
    dl_ebitda_medio_5_anos: Optional[float]
    alerta_alavancagem_critica: bool = Field(
        ..., description="True se DL/EBITDA > 3.5x em empresas não-financeiras"
    )
    cobertura_juros_atual: Optional[float]
    qualidade_lucro_divergencia_fco: str = Field(
        ..., description="Análise de consistência entre FCO e Lucro Líquido"
    )


class DossieConsolidado(BaseModel):
    ticker: str
    nome_empresa: str
    classe: str
    setor: Optional[str]
    cotacao_atual: float
    anos_historico_disponiveis: int
    bazin: MetricasBazin
    graham: MetricasGraham
    solvencia: MetricasSolvencia
    serie_historica_10_anos: List[SerieAnoContabil]
    alocacao_atual_pct: float
    alocacao_alvo_pct: float
    quantidade_custodia: float
    preco_medio_custodia: float


class FinancialEngine:
    """
    Motor financeiro estrito Buy & Hold.
    Carrega histórico do Postgres (ou lista de demonstrativos) e sintetiza o Dossiê.
    """

    TAXA_DESCONTO_BAZIN = 0.06  # 6% ao ano estipulado por Décio Bazin
    LIMITE_CRITICO_DL_EBITDA = 3.5  # Alavancagem crítica para empresas convencionais

    @classmethod
    def calcular_cagr(cls, valor_inicial: float, valor_final: float, periodos: int) -> Optional[float]:
        if valor_inicial <= 0 or valor_final <= 0 or periodos <= 0:
            return None
        try:
            return round(((valor_final / valor_inicial) ** (1.0 / periodos) - 1.0) * 100, 2)
        except Exception:
            return None

    @classmethod
    def processar_dossie(
        cls,
        ativo_dict: Dict[str, Any],
        demonstrativos_list: List[Dict[str, Any]],
        posicao_dict: Optional[Dict[str, Any]] = None
    ) -> DossieConsolidado:
        """
        Recebe os registros brutos do banco e consolida o Dossiê para a Diretoria / CFO.
        """
        cotacao = float(ativo_dict.get("cotacao_atual") or 0.0)
        ticker = ativo_dict.get("ticker", "N/A")
        setor = ativo_dict.get("setor", "Geral")

        if not demonstrativos_list:
            raise ValueError(f"Ativo {ticker} não possui demonstrativos cadastrados.")

        # Ordenar cronologicamente do ano mais antigo ao mais recente
        df = pd.DataFrame(demonstrativos_list)
        df["ano"] = df["ano"].astype(int)
        df = df.sort_values(by="ano", ascending=True).reset_index(drop=True)

        # 1. Ajuste e médias de DPA Bazin (usando DPA ajustado que expurga não-recorrentes)
        # Se dpa_ajustado não estiver preenchido, usa dpa_bruto
        df["dpa_calc"] = df.apply(
            lambda r: r["dpa_ajustado"] if r.get("dpa_ajustado") and r["dpa_ajustado"] > 0 else r.get("dpa_bruto", 0.0),
            axis=1
        )

        n_anos = len(df)
        ultimos_3_anos = df.tail(min(3, n_anos))
        ultimos_5_anos = df.tail(min(5, n_anos))

        dpa_medio_3 = float(ultimos_3_anos["dpa_calc"].mean())
        dpa_medio_5 = float(ultimos_5_anos["dpa_calc"].mean())

        teto_bazin_3 = round(dpa_medio_3 / cls.TAXA_DESCONTO_BAZIN, 2) if dpa_medio_3 > 0 else 0.0
        teto_bazin_5 = round(dpa_medio_5 / cls.TAXA_DESCONTO_BAZIN, 2) if dpa_medio_5 > 0 else 0.0

        margem_seguranca_3 = round(((teto_bazin_3 - cotacao) / cotacao) * 100, 2) if cotacao > 0 and teto_bazin_3 > 0 else 0.0
        margem_seguranca_5 = round(((teto_bazin_5 - cotacao) / cotacao) * 100, 2) if cotacao > 0 and teto_bazin_5 > 0 else 0.0

        dy_projetado = round((dpa_medio_3 / cotacao) * 100, 2) if cotacao > 0 else 0.0

        # CAGRs de dividendos
        cagr_5 = None
        if n_anos >= 5:
            dpa_inicio_5 = float(df.iloc[-5]["dpa_calc"])
            dpa_fim_5 = float(df.iloc[-1]["dpa_calc"])
            cagr_5 = cls.calcular_cagr(dpa_inicio_5, dpa_fim_5, 4)

        cagr_10 = None
        if n_anos >= 10:
            dpa_inicio_10 = float(df.iloc[0]["dpa_calc"])
            dpa_fim_10 = float(df.iloc[-1]["dpa_calc"])
            cagr_10 = cls.calcular_cagr(dpa_inicio_10, dpa_fim_10, n_anos - 1)

        bazin = MetricasBazin(
            dpa_medio_3_anos=round(dpa_medio_3, 4),
            teto_bazin_3_anos=teto_bazin_3,
            margem_seguranca_3_anos_pct=margem_seguranca_3,
            dpa_medio_5_anos=round(dpa_medio_5, 4),
            teto_bazin_5_anos=teto_bazin_5,
            margem_seguranca_5_anos_pct=margem_seguranca_5,
            cagr_dividendos_5_anos_pct=cagr_5,
            cagr_dividendos_10_anos_pct=cagr_10,
            dividend_yield_projetado_pct=dy_projetado,
        )

        # 2. Fórmula de Graham (Benjamin Graham: Raiz de 22.5 * LPA * VPA)
        ano_mais_recente = df.iloc[-1]
        lpa_rec = float(ano_mais_recente.get("lpa", 0.0))
        vpa_rec = float(ano_mais_recente.get("vpa", 0.0))

        if lpa_rec > 0 and vpa_rec > 0:
            preco_graham = round(math.sqrt(22.5 * lpa_rec * vpa_rec), 2)
            desconto_graham = round(((preco_graham - cotacao) / cotacao) * 100, 2) if cotacao > 0 else 0.0
            status_graham = "DESCONTO_ATRATIVO" if preco_graham >= cotacao else "ACIMA_DO_VALOR_JUSTO"
        else:
            preco_graham = None
            desconto_graham = None
            status_graham = "INAPLICAVEL_LPA_OU_VPA_NEGATIVO"

        graham = MetricasGraham(
            lpa_recente=round(lpa_rec, 2),
            vpa_recente=round(vpa_rec, 2),
            preco_justo_graham=preco_graham,
            desconto_graham_pct=desconto_graham,
            status_graham=status_graham,
        )

        # 3. Solvência & Crédito
        div_liq_atual = float(ano_mais_recente.get("divida_liquida", 0.0))
        ebitda_atual = float(ano_mais_recente.get("ebitda", 0.0)) if ano_mais_recente.get("ebitda") is not None else None
        
        is_banco = setor and ("Financeiro" in setor or "Banco" in setor or "Segur" in setor)
        
        dl_ebitda_atual = None
        if not is_banco and ebitda_atual and ebitda_atual > 0:
            dl_ebitda_atual = round(div_liq_atual / ebitda_atual, 2)

        # DL/EBITDA Médio 5 anos
        dl_ebitda_5y = None
        if not is_banco and "ebitda" in df.columns:
            valid_5y = ultimos_5_anos[ultimos_5_anos["ebitda"] > 0]
            if len(valid_5y) > 0:
                dl_ebitda_5y = round(float((valid_5y["divida_liquida"] / valid_5y["ebitda"]).mean()), 2)

        alerta_alavancagem = False
        if not is_banco and dl_ebitda_atual is not None:
            alerta_alavancagem = dl_ebitda_atual > cls.LIMITE_CRITICO_DL_EBITDA

        # Cobertura de Juros (EBIT / Despesas Financeiras)
        ebit_atual = float(ano_mais_recente.get("ebit", 0.0)) if ano_mais_recente.get("ebit") is not None else None
        desp_fin = float(ano_mais_recente.get("despesas_financeiras", 0.0)) if ano_mais_recente.get("despesas_financeiras") is not None else None
        cobertura_juros = None
        if ebit_atual and desp_fin and desp_fin > 0:
            cobertura_juros = round(ebit_atual / desp_fin, 2)

        # Divergência FCO vs Lucro Líquido
        fco_atual = float(ano_mais_recente.get("fco", 0.0))
        ll_atual = float(ano_mais_recente.get("lucro_liquido", 0.0))
        
        # Teste de 3 anos de consistência FCO vs LL
        anos_divergentes = 0
        for _, row in ultimos_3_anos.iterrows():
            if row["lucro_liquido"] > 0 and row["fco"] < 0:
                anos_divergentes += 1

        if anos_divergentes >= 2:
            qualidade_lucro = "ALERTA_CRITICO_FCO_PERSISTENTEMENTE_MENOR_QUE_LUCRO"
        elif ll_atual > 0 and fco_atual < 0:
            qualidade_lucro = "ATENCAO_FCO_NEGATIVO_NO_ANO"
        elif ll_atual > 0 and fco_atual >= (ll_atual * 0.7):
            qualidade_lucro = "EXCELENTE_FORTE_CONVERSAO_DE_LUCRO_EM_CAIXA"
        else:
            qualidade_lucro = "NORMAL_ACOMPANHAR_CICLO_OPERACIONAL"

        solvencia = MetricasSolvencia(
            divida_liquida_atual=round(div_liq_atual, 2),
            ebitda_atual=round(ebitda_atual, 2) if ebitda_atual else None,
            dl_ebitda_atual=dl_ebitda_atual,
            dl_ebitda_medio_5_anos=dl_ebitda_5y,
            alerta_alavancagem_critica=alerta_alavancagem,
            cobertura_juros_atual=cobertura_juros,
            qualidade_lucro_divergencia_fco=qualidade_lucro,
        )

        # 4. Série histórica decenal completa calculada
        serie_anos: List[SerieAnoContabil] = []
        for _, row in df.iterrows():
            ebitda_val = float(row.get("ebitda")) if pd.notnull(row.get("ebitda")) else None
            div_liq = float(row.get("divida_liquida", 0.0))
            ebit_val = float(row.get("ebit")) if pd.notnull(row.get("ebit")) else None
            desp_val = float(row.get("despesas_financeiras")) if pd.notnull(row.get("despesas_financeiras")) else None
            ll_val = float(row.get("lucro_liquido", 0.0))
            fco_val = float(row.get("fco", 0.0))
            pl_val = float(row.get("patrimonio_liquido", 0.0))

            dl_ebitda_row = round(div_liq / ebitda_val, 2) if ebitda_val and ebitda_val > 0 and not is_banco else None
            cobjuros_row = round(ebit_val / desp_val, 2) if ebit_val and desp_val and desp_val > 0 else None
            roe_row = round((ll_val / pl_val) * 100, 2) if pl_val > 0 else None
            div_fco_ll = round((fco_val - ll_val) / abs(ll_val) * 100, 2) if ll_val != 0 else None

            serie_anos.append(
                SerieAnoContabil(
                    ano=int(row["ano"]),
                    dpa_bruto=round(float(row.get("dpa_bruto", 0.0)), 4),
                    dpa_ajustado=round(float(row.get("dpa_ajustado", 0.0)), 4),
                    lpa=round(float(row.get("lpa", 0.0)), 2),
                    vpa=round(float(row.get("vpa", 0.0)), 2),
                    receita_liquida=float(row.get("receita_liquida")) if pd.notnull(row.get("receita_liquida")) else None,
                    ebitda=ebitda_val,
                    ebit=ebit_val,
                    lucro_liquido=round(ll_val, 2),
                    fco=round(fco_val, 2),
                    divida_liquida=round(div_liq, 2),
                    patrimonio_liquido=round(pl_val, 2),
                    despesas_financeiras=desp_val,
                    dl_ebitda=dl_ebitda_row,
                    cobertura_juros=cobjuros_row,
                    roe_pct=roe_row,
                    divergencia_fco_lucro=div_fco_ll,
                )
            )

        # Dados da carteira
        pos = posicao_dict or {}
        qtd = float(pos.get("quantidade", 0.0))
        pm = float(pos.get("preco_medio", 0.0))
        aloc_alvo = float(ativo_dict.get("alocacao_alvo_pct", 0.0))
        aloc_atual = float(ativo_dict.get("alocacao_atual_pct", 0.0))

        return DossieConsolidado(
            ticker=ticker,
            nome_empresa=ativo_dict.get("nome_empresa", ticker),
            classe=str(ativo_dict.get("classe", "ACOES_B3")),
            setor=setor,
            cotacao_atual=cotacao,
            anos_historico_disponiveis=n_anos,
            bazin=bazin,
            graham=graham,
            solvencia=solvencia,
            serie_historica_10_anos=serie_anos,
            alocacao_atual_pct=aloc_atual,
            alocacao_alvo_pct=aloc_alvo,
            quantidade_custodia=qtd,
            preco_medio_custodia=pm,
        )
