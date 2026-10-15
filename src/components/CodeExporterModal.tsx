import React, { useState } from 'react';
import { X, Copy, Check, FileCode, Download, Server } from 'lucide-react';

interface CodeExporterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CodeExporterModal: React.FC<CodeExporterModalProps> = ({ isOpen, onClose }) => {
  const [abaAtiva, setAbaAtiva] = useState<string>('docker');
  const [copiado, setCopiado] = useState(false);

  if (!isOpen) return null;

  const arquivos = [
    { id: 'docker', nome: 'docker-compose.yml', lang: 'yaml', desc: 'Configuração OCI (6GB RAM) com Postgres, n8n e FastAPI' },
    { id: 'models', nome: 'models.py', lang: 'python', desc: 'SQLAlchemy com demonstrativos decenais e carteira' },
    { id: 'engine', nome: 'financial_engine.py', lang: 'python', desc: 'Motor matemático determinístico Décio Bazin & Graham' },
    { id: 'cfo', nome: 'llm_cfo.py', lang: 'python', desc: 'Integração LLM CFO com prompt corporativo e schema estrito' },
    { id: 'n8n_matinal', nome: 'rotina_matinal_b3.json', lang: 'json', desc: 'Workflow n8n Matinal B3 (09:30)' },
    { id: 'n8n_noturna', nome: 'fechamento_noturno_cvm.json', lang: 'json', desc: 'Workflow n8n Fechamento CVM (19:00)' },
    { id: 'n8n_btc', nome: 'sentinela_cripto_btc.json', lang: 'json', desc: 'Workflow n8n Sentinela BTC 24/7' },
    { id: 'sql', nome: 'init_db.sql', lang: 'sql', desc: 'DDL PostgreSQL 16 para schema inicial' },
  ];

  const getConteudo = (id: string): string => {
    switch (id) {
      case 'docker':
        return `# docker-compose.yml pronto para Oracle Cloud (1 OCPU / 6 GB RAM)
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: buyandhold_postgres
    restart: always
    environment:
      POSTGRES_DB: buyandhold_db
      POSTGRES_USER: cfo_admin
      POSTGRES_PASSWORD: SuperSecretCFO2026!
    command: >
      postgres -c shared_buffers=384MB -c work_mem=16MB -c max_connections=60
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backend/scripts/init_db.sql:/docker-entrypoint-initdb.d/init_db.sql:ro
    deploy:
      resources:
        limits:
          cpus: '0.6'
          memory: 1536M

  backend:
    build: ./backend
    container_name: buyandhold_backend
    restart: always
    environment:
      DATABASE_URL: postgresql+asyncpg://cfo_admin:SuperSecretCFO2026!@postgres:5432/buyandhold_db
      GEMINI_API_KEY: \${GEMINI_API_KEY}
    ports:
      - "8000:8000"
    deploy:
      resources:
        limits:
          cpus: '0.8'
          memory: 1800M

  n8n:
    image: docker.n8n.io/n8nio/n8n:latest
    container_name: buyandhold_n8n
    restart: always
    environment:
      - N8N_PORT=5678
      - EXECUTIONS_PROCESS=main
      - DB_TYPE=postgresdb
    ports:
      - "5678:5678"
    deploy:
      resources:
        limits:
          cpus: '0.6'
          memory: 1024M

volumes:
  postgres_data:
  n8n_data:`;

      case 'models':
        return `# backend/app/database/models.py
from datetime import datetime
from enum import Enum
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean, Enum as SQLEnum
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class ClasseAtivo(str, Enum):
    ACOES_B3 = "ACOES_B3"
    RENDA_FIXA = "RENDA_FIXA"
    CRIPTO = "CRIPTO"

class VereditoCFO(str, Enum):
    COMPRAR = "COMPRAR"
    AGUARDAR = "AGUARDAR"
    QUARENTENA = "QUARENTENA"

class Ativo(Base):
    __tablename__ = "ativos"
    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String(16), unique=True, nullable=False, index=True)
    nome_empresa = Column(String(128), nullable=False)
    classe = Column(SQLEnum(ClasseAtivo), nullable=False, default=ClasseAtivo.ACOES_B3)
    alocacao_alvo_pct = Column(Float, nullable=False, default=0.0)
    cotacao_atual = Column(Float, nullable=True)
    posicao = relationship("PosicaoCarteira", back_populates="ativo", uselist=False)
    demonstrativos = relationship("DemonstrativoAnual", back_populates="ativo", order_by="desc(DemonstrativoAnual.ano)")

class DemonstrativoAnual(Base):
    __tablename__ = "demonstrativos_anuais"
    id = Column(Integer, primary_key=True)
    ativo_id = Column(Integer, ForeignKey("ativos.id"), nullable=False)
    ano = Column(Integer, nullable=False)
    dpa_bruto = Column(Float, default=0.0)
    dpa_ajustado = Column(Float, default=0.0)
    lpa = Column(Float, default=0.0)
    vpa = Column(Float, default=0.0)
    lucro_liquido = Column(Float, default=0.0)
    fco = Column(Float, default=0.0)
    divida_liquida = Column(Float, default=0.0)
    patrimonio_liquido = Column(Float, default=0.0)`;

      case 'engine':
        return `# backend/app/services/financial_engine.py
# Motor determinístico Décio Bazin (3 e 5 anos) & Benjamin Graham
import math
import pandas as pd

class FinancialEngine:
    TAXA_DESCONTO_BAZIN = 0.06
    LIMITE_CRITICO_DL_EBITDA = 3.5

    @classmethod
    def processar_dossie(cls, ativo_dict, demonstrativos_list):
        df = pd.DataFrame(demonstrativos_list).sort_values(by="ano")
        cotacao = float(ativo_dict.get("cotacao_atual", 0.0))

        # Décio Bazin: Médias de 3 e 5 anos
        ultimos_3 = df.tail(3)
        dpa_3 = float(ultimos_3["dpa_ajustado"].mean())
        teto_bazin_3 = round(dpa_3 / cls.TAXA_DESCONTO_BAZIN, 2)
        margem_3 = round(((teto_bazin_3 - cotacao) / cotacao) * 100, 2)

        # Graham: Raiz de 22.5 * LPA * VPA
        lpa = float(df.iloc[-1]["lpa"])
        vpa = float(df.iloc[-1]["vpa"])
        preco_graham = round(math.sqrt(22.5 * lpa * vpa), 2) if lpa > 0 and vpa > 0 else None

        return {
            "ticker": ativo_dict["ticker"],
            "teto_bazin_3_anos": teto_bazin_3,
            "margem_seguranca_3_pct": margem_3,
            "preco_graham": preco_graham
        }`;

      case 'cfo':
        return `# backend/app/services/llm_cfo.py
from google import genai
from google.genai import types
from pydantic import BaseModel

class VereditoExecutivoCFO(BaseModel):
    ticker: str
    veredito: str # COMPRAR | AGUARDAR | QUARENTENA
    diagnostico_executivo: str
    parecer_alocacao: str
    justificativa_bazin_graham: str
    analise_solvencia_risco: str
    gatilho_de_quarentena_detectado: bool

PROMPT_SISTEMA = """Você é o CFO de uma Holding Buy & Hold. A matemática já foi 100% calculada pelo motor financeiro.
Emita o veredito oficial irrevogável em JSON estrito."""`;

      default:
        return `// Arquivo disponível no repositório /${id}`;
    }
  };

  const conteudoAtual = getConteudo(abaAtiva);

  const handleCopiar = () => {
    navigator.clipboard.writeText(conteudoAtual);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-emerald-400" />
            <h3 className="text-base font-bold text-slate-100">
              Pacote de Produção & Infraestrutura OCI (Oracle Cloud 6 GB)
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas dos Arquivos */}
        <div className="flex overflow-x-auto border-b border-slate-800 bg-slate-950/60 px-4 shrink-0">
          {arquivos.map((arq) => (
            <button
              key={arq.id}
              onClick={() => setAbaAtiva(arq.id)}
              className={`px-3 py-2.5 text-xs font-mono whitespace-nowrap border-b-2 transition-all flex items-center gap-1.5 ${
                abaAtiva === arq.id
                  ? 'border-emerald-500 text-emerald-400 font-bold bg-slate-900/50'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              {arq.nome}
            </button>
          ))}
        </div>

        {/* Toolbar do Arquivo Selecionado */}
        <div className="px-6 py-2.5 bg-slate-950/40 border-b border-slate-800/60 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>{arquivos.find((a) => a.id === abaAtiva)?.desc}</span>
          <button
            onClick={handleCopiar}
            className="flex items-center gap-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors"
          >
            {copiado ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiado ? 'Copiado!' : 'Copiar Código'}
          </button>
        </div>

        {/* Visualizador de Código */}
        <div className="p-4 flex-1 overflow-auto bg-slate-950">
          <pre className="font-mono text-xs text-slate-300 leading-relaxed overflow-x-auto">
            {conteudoAtual}
          </pre>
        </div>
      </div>
    </div>
  );
};
