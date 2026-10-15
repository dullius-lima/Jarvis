-- ============================================================================
-- Banco de Dados Escritório de Investimentos Buy & Hold — PostgreSQL 16
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema dedicado para o n8n
CREATE SCHEMA IF NOT EXISTS n8n_schema;

-- Tipos enumerados
DO $$ BEGIN
    CREATE TYPE classe_ativo_enum AS ENUM ('ACOES_B3', 'RENDA_FIXA', 'CRIPTO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE veredito_cfo_enum AS ENUM ('COMPRAR', 'AGUARDAR', 'QUARENTENA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Tabela de Ativos
CREATE TABLE IF NOT EXISTS ativos (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(16) UNIQUE NOT NULL,
    nome_empresa VARCHAR(128) NOT NULL,
    classe classe_ativo_enum NOT NULL DEFAULT 'ACOES_B3',
    setor VARCHAR(64),
    subsetor VARCHAR(64),
    alocacao_alvo_pct FLOAT NOT NULL DEFAULT 0.0,
    nota_governanca INT NOT NULL DEFAULT 10,
    em_quarentena BOOLEAN NOT NULL DEFAULT FALSE,
    motivo_quarentena TEXT,
    cotacao_atual FLOAT,
    data_atualizacao_cotacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabela de Posição Real em Carteira
CREATE TABLE IF NOT EXISTS posicao_carteira (
    id SERIAL PRIMARY KEY,
    ativo_id INT NOT NULL UNIQUE REFERENCES ativos(id) ON DELETE CASCADE,
    quantidade FLOAT NOT NULL DEFAULT 0.0,
    preco_medio FLOAT NOT NULL DEFAULT 0.0,
    total_investido FLOAT NOT NULL DEFAULT 0.0,
    data_ultimo_aporte TIMESTAMP
);

-- 3. Tabela de Demonstrativos Decenais (10 Anos)
CREATE TABLE IF NOT EXISTS demonstrativos_anuais (
    id SERIAL PRIMARY KEY,
    ativo_id INT NOT NULL REFERENCES ativos(id) ON DELETE CASCADE,
    ano INT NOT NULL,
    dpa_bruto FLOAT NOT NULL DEFAULT 0.0,
    dpa_ajustado FLOAT NOT NULL DEFAULT 0.0,
    lpa FLOAT NOT NULL DEFAULT 0.0,
    vpa FLOAT NOT NULL DEFAULT 0.0,
    receita_liquida FLOAT,
    ebitda FLOAT,
    ebit FLOAT,
    lucro_liquido FLOAT NOT NULL DEFAULT 0.0,
    fco FLOAT NOT NULL DEFAULT 0.0,
    fcl FLOAT,
    caixa_equivalentes FLOAT,
    divida_bruta FLOAT,
    divida_liquida FLOAT NOT NULL DEFAULT 0.0,
    patrimonio_liquido FLOAT NOT NULL DEFAULT 0.0,
    despesas_financeiras FLOAT,
    possui_nao_recorrente BOOLEAN NOT NULL DEFAULT FALSE,
    detalhe_nao_recorrente VARCHAR(255),
    data_importacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_ativo_ano UNIQUE (ativo_id, ano)
);

CREATE INDEX IF NOT EXISTS idx_demonstrativo_ativo_ano ON demonstrativos_anuais(ativo_id, ano);

-- 4. Tabela de Auditorias e Pareceres do CFO
CREATE TABLE IF NOT EXISTS auditorias_cfo (
    id SERIAL PRIMARY KEY,
    ativo_id INT NOT NULL REFERENCES ativos(id) ON DELETE CASCADE,
    data_auditoria TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    veredito veredito_cfo_enum NOT NULL,
    dossie_input_json TEXT NOT NULL,
    diagnostico_executivo TEXT NOT NULL,
    parecer_alocacao TEXT NOT NULL,
    riscos_mapeados TEXT,
    acao_recomendada TEXT,
    modelo_llm VARCHAR(64) NOT NULL DEFAULT 'gemini-3.8-flash',
    prompt_tokens INT,
    completion_tokens INT
);

CREATE INDEX IF NOT EXISTS idx_auditorias_ativo_data ON auditorias_cfo(ativo_id, data_auditoria);
