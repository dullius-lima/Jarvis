"""
Models SQLAlchemy para a Plataforma Buy & Hold.
Suporta persistência decenal de demonstrativos, posições de carteira,
cadastro dinâmico de ativos e registros históricos das deliberações do CFO.
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional
from sqlalchemy import (
    Column, Integer, String, Float, DateTime, ForeignKey, 
    Text, Boolean, Enum as SQLEnum, Index, UniqueConstraint
)
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
    """
    Tabela mestra de ativos cadastrados no escritório de investimentos.
    Permite inserção 100% dinâmica via banco sem alterar código.
    """
    __tablename__ = "ativos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String(16), unique=True, nullable=False, index=True)
    nome_empresa = Column(String(128), nullable=False)
    classe = Column(SQLEnum(ClasseAtivo), nullable=False, default=ClasseAtivo.ACOES_B3)
    setor = Column(String(64), nullable=True)
    subsetor = Column(String(64), nullable=True)
    
    # Parâmetros de Alocação Estratégica (Buy & Hold)
    alocacao_alvo_pct = Column(Float, nullable=False, default=0.0)  # Ex: 10.0 (%)
    nota_governanca = Column(Integer, nullable=False, default=10)    # 1 a 10 (Tag along, Novo Mercado, etc)
    em_quarentena = Column(Boolean, nullable=False, default=False)
    motivo_quarentena = Column(Text, nullable=True)

    # Cotação e Timestamp da última ingestão
    cotacao_atual = Column(Float, nullable=True)
    data_atualizacao_cotacao = Column(DateTime, nullable=True, default=datetime.utcnow)

    # Relacionamentos
    posicao = relationship("PosicaoCarteira", back_populates="ativo", uselist=False, cascade="all, delete-orphan")
    demonstrativos = relationship("DemonstrativoAnual", back_populates="ativo", order_by="desc(DemonstrativoAnual.ano)", cascade="all, delete-orphan")
    auditorias = relationship("AuditoriaCFO", back_populates="ativo", order_by="desc(AuditoriaCFO.data_auditoria)", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Ativo {self.ticker} - {self.nome_empresa}>"


class PosicaoCarteira(Base):
    """
    Estado da posição real mantida na custódia do investidor.
    """
    __tablename__ = "posicao_carteira"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ativo_id = Column(Integer, ForeignKey("ativos.id", ondelete="CASCADE"), nullable=False, unique=True)
    quantidade = Column(Float, nullable=False, default=0.0)
    preco_medio = Column(Float, nullable=False, default=0.0)
    total_investido = Column(Float, nullable=False, default=0.0)
    data_ultimo_aporte = Column(DateTime, nullable=True)

    # Relacionamento inverso
    ativo = relationship("Ativo", back_populates="posicao")

    def __repr__(self):
        return f"<PosicaoCarteira Ativo={self.ativo_id} Qtd={self.quantidade} PM={self.preco_medio}>"


class DemonstrativoAnual(Base):
    """
    Histórico decenal (10 anos) de demonstrativos contábeis (DFP/ITR CVM).
    Campos padronizados para alimentar o Bazin Engine e Solvência.
    """
    __tablename__ = "demonstrativos_anuais"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ativo_id = Column(Integer, ForeignKey("ativos.id", ondelete="CASCADE"), nullable=False, index=True)
    ano = Column(Integer, nullable=False)

    # Indicadores por Ação (Per Share)
    dpa_bruto = Column(Float, nullable=False, default=0.0)          # Dividendo por Ação
    dpa_ajustado = Column(Float, nullable=False, default=0.0)       # DPA expurgando eventos não-recorrentes
    lpa = Column(Float, nullable=False, default=0.0)                # Lucro por Ação
    vpa = Column(Float, nullable=False, default=0.0)                # Valor Patrimonial por Ação

    # Dados Contábeis Globais (em Milhões de R$)
    receita_liquida = Column(Float, nullable=True)
    ebitda = Column(Float, nullable=True)
    ebit = Column(Float, nullable=True)
    lucro_liquido = Column(Float, nullable=False, default=0.0)
    fco = Column(Float, nullable=False, default=0.0)                # Fluxo de Caixa Operacional
    fcl = Column(Float, nullable=True)                             # Fluxo de Caixa Livre
    caixa_equivalentes = Column(Float, nullable=True)
    divida_bruta = Column(Float, nullable=True)
    divida_liquida = Column(Float, nullable=False, default=0.0)
    patrimonio_liquido = Column(Float, nullable=False, default=0.0)
    despesas_financeiras = Column(Float, nullable=True)

    # Metadados e Flags de Consistência
    possui_nao_recorrente = Column(Boolean, nullable=False, default=False)
    detalhe_nao_recorrente = Column(String(255), nullable=True)
    data_importacao = Column(DateTime, default=datetime.utcnow)

    ativo = relationship("Ativo", back_populates="demonstrativos")

    __table_args__ = (
        UniqueConstraint("ativo_id", "ano", name="uq_ativo_ano"),
        Index("idx_ativo_ano", "ativo_id", "ano"),
    )

    def __repr__(self):
        return f"<Demonstrativo {self.ativo_id} Ano={self.ano} DPA={self.dpa_bruto} LL={self.lucro_liquido}>"


class AuditoriaCFO(Base):
    """
    Registro histórico irrevogável dos pareceres emitidos pela LLM CFO.
    Garante compliance, rastreabilidade e justificativa de alocação de capital.
    """
    __tablename__ = "auditorias_cfo"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ativo_id = Column(Integer, ForeignKey("ativos.id", ondelete="CASCADE"), nullable=False, index=True)
    data_auditoria = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    # Veredito Executivo Estrito
    veredito = Column(SQLEnum(VereditoCFO), nullable=False)
    
    # Dossiê Matemático de Entrada (Snapshot exato auditado pela IA)
    dossie_input_json = Column(Text, nullable=False)
    
    # Parecer Qualitativo Sintetizado
    diagnostico_executivo = Column(Text, nullable=False)
    parecer_alocacao = Column(Text, nullable=False)
    riscos_mapeados = Column(Text, nullable=True)
    acao_recomendada = Column(Text, nullable=True)
    
    # Metadados do Modelo
    modelo_llm = Column(String(64), nullable=False, default="gemini-3.8-flash")
    prompt_tokens = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)

    ativo = relationship("Ativo", back_populates="auditorias")

    def __repr__(self):
        return f"<AuditoriaCFO Ativo={self.ativo_id} Data={self.data_auditoria} Veredito={self.veredito}>"
