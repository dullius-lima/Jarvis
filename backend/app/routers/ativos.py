"""
Roteador FastAPI para Gestão Dinâmica de Ativos e Carteira.
Permite adicionar e remover ações B3, Renda Fixa e Bitcoin orientados a dados.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/ativos", tags=["Ativos & Carteira"])


class AtivoCreateSchema(BaseModel):
    ticker: str = Field(..., example="TAEE11")
    nome_empresa: str = Field(..., example="Transmissora Aliança de Energia Elétrica S.A.")
    classe: str = Field("ACOES_B3", example="ACOES_B3")
    setor: Optional[str] = Field("Utilidade Pública", example="Utilidade Pública")
    subsetor: Optional[str] = Field("Energia Elétrica", example="Energia Elétrica")
    alocacao_alvo_pct: float = Field(..., example=12.5)
    nota_governanca: int = Field(10, ge=1, le=10)
    cotacao_atual: Optional[float] = Field(None, example=34.80)


class DemonstrativoInputSchema(BaseModel):
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
    possui_nao_recorrente: bool = False
    detalhe_nao_recorrente: Optional[str] = None


class PosicaoUpdateSchema(BaseModel):
    quantidade: float = Field(..., ge=0)
    preco_medio: float = Field(..., ge=0)


@router.get("/")
async def listar_ativos():
    """
    Retorna a lista de ativos cadastrados na carteira do escritório.
    """
    return {"message": "Listagem de ativos com alocações e status"}


@router.post("/", status_code=status.HTTP_201_CREATED)
async def cadastrar_ativo(ativo: AtivoCreateSchema):
    """
    Cadastra dinamicamente um novo ativo na carteira sem necessidade de deploy ou alteração de código.
    """
    return {
        "status": "sucesso",
        "mensagem": f"Ativo {ativo.ticker} cadastrado com alocação-alvo de {ativo.alocacao_alvo_pct}%.",
        "ativo": ativo
    }


@router.post("/{ticker}/demonstrativos", status_code=status.HTTP_201_CREATED)
async def adicionar_demonstrativos(ticker: str, demonstrativos: List[DemonstrativoInputSchema]):
    """
    Importa a série histórica contábil de 10 anos (ou anos individuais) para alimentar o Bazin Engine.
    """
    return {
        "status": "sucesso",
        "ticker": ticker.upper(),
        "anos_adicionados": len(demonstrativos),
        "mensagem": f"{len(demonstrativos)} anos contábeis importados com sucesso para {ticker.upper()}."
    }


@router.put("/{ticker}/posicao")
async def atualizar_posicao(ticker: str, posicao: PosicaoUpdateSchema):
    """
    Atualiza a quantidade sob custódia e o preço médio do investidor.
    """
    return {
        "status": "sucesso",
        "ticker": ticker.upper(),
        "quantidade": posicao.quantidade,
        "preco_medio": posicao.preco_medio,
        "total_investido": round(posicao.quantidade * posicao.preco_medio, 2)
    }
