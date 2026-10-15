"""
Roteador FastAPI para Deliberação do 5º Andar (Mesa da Diretoria & LLM CFO).
"""

from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from app.services.llm_cfo import LLMCFOService, VereditoExecutivoCFO

router = APIRouter(prefix="/cfo", tags=["5º Andar - Diretoria & CFO"])


class DeliberacaoInput(BaseModel):
    dossie: Dict[str, Any] = Field(..., description="Dossiê matemático consolidado gerado pelo financial_engine")


class MensagemChat(BaseModel):
    role: str = Field(..., example="user")
    content: str = Field(..., example="Qual o teto recomendado para aporte em TAEE11 considerando o ciclo de juros?")


class ChatInput(BaseModel):
    historico: List[MensagemChat]
    ticker_contexto: Optional[str] = None
    dossie_contexto: Optional[Dict[str, Any]] = None


@router.post("/deliberar", response_model=VereditoExecutivoCFO)
async def deliberar_sobre_ativo(payload: DeliberacaoInput):
    """
    Aciona o Chief Financial Officer (CFO) para auditar o dossiê de 10 anos
    e emitir o veredito oficial irrevogável (COMPRAR, AGUARDAR, QUARENTENA).
    """
    try:
        service = LLMCFOService()
        veredito = service.auditar_dossie(payload.dossie)
        return veredito
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Falha na deliberação do CFO: {str(e)}"
        )


@router.post("/chat")
async def conversar_com_cfo(payload: ChatInput):
    """
    Canal de diálogo executivo direto no 5º andar com a LLM CFO.
    Permite tirar dúvidas estratégicas de alocação e riscos.
    """
    try:
        service = LLMCFOService()
        resposta = service.dialogar_com_cfo(
            historico_chat=[msg.dict() for msg in payload.historico],
            dossie_ativo=payload.dossie_contexto
        )
        return {"resposta": resposta}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro na comunicação com a Diretoria: {str(e)}"
        )
