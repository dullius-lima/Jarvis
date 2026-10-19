/**
 * MAPEAMENTO DE BANCO DE DADOS & DIRETRIZES ARQUITETURAIS
 * Sistema Dinâmico de Orquestração de IA (Gerenciador de Multi-Agentes)
 * 
 * Suporta:
 * 1. Núcleo Fixo Jarvis (Prompt e Modelo 100% mutáveis)
 * 2. Especialistas Modulares Dinâmicos (CRUD completo)
 * 3. Variáveis de Ambiente Locais (BASE_URL, SERVER_IP, PORTA :800, etc.)
 */

export const DATABASE_SCHEMA_SQL = `
-- ============================================================================
-- 1. TABELA DE VARIÁVEIS DE AMBIENTE & CONFIGURAÇÃO DE SERVIDOR DINÂMICO
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_environment_configs (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'default_instance',
    protocol VARCHAR(10) NOT NULL DEFAULT 'http',           -- 'http' ou 'https'
    server_host VARCHAR(255) NOT NULL DEFAULT 'localhost',  -- 'localhost', '192.168.1.100', 'dominio.com'
    server_port INT NOT NULL DEFAULT 800,                   -- Porta padrão :800
    webhook_prefix VARCHAR(100) NOT NULL DEFAULT '/webhook/', -- Prefixo de rota
    base_webhook_url TEXT GENERATED ALWAYS AS (
        protocol || '://' || server_host || ':' || server_port || webhook_prefix
    ) STORED,
    auth_token TEXT,                                       -- Bearer Token ou API Key opcional
    custom_headers JSONB DEFAULT '{}'::jsonb,              -- Headers globais (ex: User-Agent, Tenant-Id)
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. TABELA DE AGENTES DE IA (NÚCLEO FIXO JARVIS + ESPECIALISTAS DINÂMICOS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS agents (
    id VARCHAR(64) PRIMARY KEY,                             -- 'jarvis-leader', 'especialista-financas', uuid
    name VARCHAR(120) NOT NULL,                            -- Nome do agente (100% editável)
    role VARCHAR(255) NOT NULL,                            -- Especialidade ou cargo
    is_leader BOOLEAN NOT NULL DEFAULT FALSE,              -- TRUE apenas para o Jarvis Líder
    immutable_leader BOOLEAN NOT NULL DEFAULT FALSE,       -- Bloqueio de exclusão (apenas Jarvis Líder)
    subordinated_to_leader_id VARCHAR(64) REFERENCES agents(id) ON DELETE SET NULL,
    system_prompt TEXT NOT NULL,                           -- Prompt de personalidade e instruções (100% mutável)
    logic_prompt TEXT,                                     -- Diretrizes técnicas de execução
    llm_provider VARCHAR(50) NOT NULL DEFAULT 'gemini',    -- 'gemini', 'openai', 'anthropic', 'ollama', etc.
    llm_model VARCHAR(100) NOT NULL DEFAULT 'gemini-3.8-flash', -- Modelo de IA atribuído (100% mutável)
    temperature NUMERIC(3,2) DEFAULT 0.20,                 -- Criatividade / Precisão
    target_database VARCHAR(100) DEFAULT 'GLOBAL',         -- Silo de dados / partição
    status VARCHAR(30) DEFAULT 'ativo',                    -- 'ativo', 'pausado', 'manutencao'
    body_part VARCHAR(50) DEFAULT 'cranio_cerebro',        -- Posição neural no Cérebro 3D
    body_coords JSONB DEFAULT '[0, 2.7, 0.1]'::jsonb,      -- Vetor [x, y, z] no RealisticBrainCanvas
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 3. TABELA DE FERRAMENTAS / CONEXÕES (WEBHOOKS, APIS, HOMES ASSISTANT, SCRIPTS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_tools (
    id VARCHAR(64) PRIMARY KEY,
    agent_id VARCHAR(64) NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,                            -- Nome identificador (ex: chamar_especialista_financas)
    description TEXT NOT NULL,                             -- Descrição que a LLM usa para decidir o uso
    tool_type VARCHAR(50) NOT NULL DEFAULT 'WEBHOOK',      -- 'WEBHOOK', 'API', 'HOME_ASSISTANT', 'SQL', 'SCRIPT'
    http_method VARCHAR(10) DEFAULT 'POST',                -- 'GET', 'POST', 'PUT', 'DELETE'
    webhook_path VARCHAR(255),                             -- Path relativo (ex: 'especialista-financas/test')
    dynamic_endpoint_url TEXT NOT NULL,                    -- URL resolvida (http://localhost:800/webhook/...)
    request_schema_json TEXT,                              -- Exemplo de Payload / JSON Schema
    headers JSONB DEFAULT '{}'::jsonb,                     -- Cabeçalhos HTTP customizados
    script_code TEXT,                                      -- Código JS/Python se tool_type = SCRIPT
    status VARCHAR(30) DEFAULT 'INICIADA',                 -- 'INICIADA', 'PENDENTE', 'ERRO'
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_executed_at TIMESTAMP WITH TIME ZONE,
    last_execution_result TEXT
);

-- ============================================================================
-- 4. TABELA DE AUDITORIA & HISTÓRICO DE DISPAROS DE SINAPSES (TELEMETRIA O(1))
-- ============================================================================
CREATE TABLE IF NOT EXISTS tool_execution_logs (
    id BIGSERIAL PRIMARY KEY,
    tool_id VARCHAR(64) REFERENCES agent_tools(id) ON DELETE CASCADE,
    agent_id VARCHAR(64) REFERENCES agents(id) ON DELETE CASCADE,
    payload_sent JSONB NOT NULL,
    response_received JSONB,
    status_code INT DEFAULT 200,
    latency_ms INT NOT NULL,
    is_success BOOLEAN NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 5. TABELA DE SESSÕES EXCLUSIVAS (ISOLAMENTO DE CONTEXTO MULTI-AGENTE)
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_sessions (
    id VARCHAR(64) PRIMARY KEY,                             -- 'sess_20261018_xyz' (Session ID exclusiva)
    title VARCHAR(255) NOT NULL,                           -- Título da conversa (editável pelo usuário)
    agent_leader_id VARCHAR(64) NOT NULL DEFAULT 'jarvis-leader' REFERENCES agents(id),
    status VARCHAR(20) NOT NULL DEFAULT 'ativa',           -- 'ativa', 'arquivada', 'encerrada'
    message_count INT NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,                    -- Contexto extra (dispositivo, usuário, tags)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 6. TABELA DE MEMÓRIA CONVERSACIONAL DO JARVIS (HISTÓRICO EDITÁVEL & RESET)
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_messages (
    id VARCHAR(64) PRIMARY KEY,                             -- 'msg_1729270000_abc'
    session_id VARCHAR(64) NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    sender_type VARCHAR(30) NOT NULL,                      -- 'USER', 'JARVIS_LEADER', 'SPECIALIST'
    sender_id VARCHAR(64) NOT NULL,                        -- 'user', 'jarvis-leader', 'especialista-financas'
    sender_name VARCHAR(120) NOT NULL,                     -- Nome de exibição
    content TEXT NOT NULL,                                 -- Conteúdo verbal (100% editável no painel)
    technical_data JSONB,                                  -- Dados brutos recebidos via Webhook/JSON
    is_edited BOOLEAN NOT NULL DEFAULT FALSE,              -- Flag indicando alteração manual de contexto
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 7. TABELA DE MEMÓRIA CONTEXTUAL DOS ESPECIALISTAS (SUBORDINADOS N8N)
-- ============================================================================
CREATE TABLE IF NOT EXISTS specialist_context_memory (
    id VARCHAR(64) PRIMARY KEY,                             -- 'ctx_1729270000_xyz'
    session_id VARCHAR(64) NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    specialist_id VARCHAR(64) NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    specialist_name VARCHAR(120) NOT NULL,
    context_key VARCHAR(100) NOT NULL,                     -- 'ultimo_ticker', 'ultimo_dispositivo', etc.
    context_value JSONB NOT NULL,                          -- 'PETR4', 'luz_sala', cotação recente, estado
    ttl_seconds INT DEFAULT 86400,                         -- Retenção de curto prazo (padrão 24h)
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_session_specialist_key UNIQUE (session_id, specialist_id, context_key)
);

-- Índices de busca rápida em O(1)
CREATE INDEX IF NOT EXISTS idx_agents_is_leader ON agents(is_leader);
CREATE INDEX IF NOT EXISTS idx_agent_tools_agent_id ON agent_tools(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tools_name ON agent_tools(name);
CREATE INDEX IF NOT EXISTS idx_tool_logs_executed_at ON tool_execution_logs(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_specialist_context_session ON specialist_context_memory(session_id, specialist_id);
`;

export const ARCHITECTURE_DIRECTIVES = {
  corePhilosophy: 'Sistema Dinâmico de Orquestração Multi-Agente Orientado a Eventos e Roteamento Hub-and-Spoke',
  rules: [
    {
      title: '1. Núcleo Fixo do JARVIS (Líder Permanente)',
      description: 'O Jarvis é a âncora perpétua da cognição. Seu registro na tabela agents possui immutable_leader = TRUE (impedindo que seja deletado acidentalmente). Entretanto, seus campos name, system_prompt, llm_provider e llm_model são 100% abertos e mutáveis em tempo de execução sem reinicialização.',
    },
    {
      title: '2. Módulos de Especialistas Dinâmicos (CRUD Completo)',
      description: 'Qualquer especialista pode ser inserido, modificado ou removido via operações CRUD normais. Ao deletar um especialista, a foreign key em cascade limpa automaticamente suas ferramentas e conexões, e o Cérebro 3D desfaz a sinapse imediatamente.',
    },
    {
      title: '3. Resolução Dinâmica de Variáveis de Ambiente (BASE_URL & SERVER_IP)',
      description: 'Nenhuma URL de webhook é gravada de forma estática pura no código. As tools armazenam o webhook_path relativo (ex: "especialista-financas/test") e resolvem dinamicamente a URL final interpolando as variáveis de system_environment_configs (protocol + server_host + server_port + webhook_prefix). Mudar de localhost para 192.168.1.100 ou um domínio público reflete instantaneamente em todas as ferramentas.',
    },
  ],
};
