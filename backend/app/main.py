"""
Ponto de Entrada Principal da API FastAPI (Escritório de Investimentos Buy & Hold).
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import ativos, auditoria, cfo, rotinas_n8n

app = FastAPI(
    title="Escritório de Investimentos Buy & Hold — Backend API",
    description="Motor analítico determinístico Bazin/Graham e deliberação corporativa com LLM CFO.",
    version="1.0.0"
)

# Configuração CORS para integração com o PWA frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registro dos Roteadores
app.include_router(ativos.router)
app.include_router(auditoria.router)
app.include_router(cfo.router)
app.include_router(rotinas_n8n.router)


@app.get("/health", tags=["Healthcheck"])
async def health_check():
    return {
        "status": "online",
        "service": "buyandhold-backend",
        "andar_ativo": "Todos os 5 andares operacionais"
    }


@app.get("/", tags=["Root"])
async def root():
    return {
        "sistema": "Escritório de Investimentos Buy & Hold",
        "andares": [
            {"andar": 5, "setor": "Mesa da Diretoria & CFO", "papel": "Deliberação e Veredito"},
            {"andar": 4, "setor": "Auditoria Fundamentalista & Proventos", "papel": "Décio Bazin & Graham"},
            {"andar": 3, "setor": "Solvência & Crédito", "papel": "Dívida Líquida/EBITDA e Juros"},
            {"andar": 2, "setor": "Radar Exógeno & Notícias", "papel": "Fatos Relevantes CVM"},
            {"andar": 1, "setor": "Térreo / Subsolo Data Engine", "papel": "Ingestão Bacen, B3 e Sentinela BTC"}
        ]
    }
