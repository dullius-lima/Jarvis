// src/models/databaseSetup.ts
import { pool } from '../config/database.js';

export async function initializeDatabaseSchema() {
  const client = await pool.connect();
  try {
    console.log('🔄 Inicializando e alinhando esquema unificado JARVIS & n8n no PostgreSQL...');

    // 1. Extensão pgvector com fallback seguro para Windows/Linux
    let hasVectorExtension = false;
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
      hasVectorExtension = true;
    } catch {
      console.info('ℹ️ [Modo Compatibilidade] pgvector não detetado localmente. A utilizar TEXT para vetores.');
    }

    // 2. Configurações Globais do Sistema (Cérebro Central)
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_configs (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL DEFAULT '{}'::jsonb,
        provider VARCHAR(60) DEFAULT 'groq',
        model VARCHAR(100) DEFAULT 'llama-3.3-70b-versatile',
        api_key TEXT DEFAULT '',
        base_url TEXT DEFAULT 'https://api.groq.com/openai/v1',
        temperature NUMERIC(3, 2) DEFAULT 0.30,
        system_prompt TEXT DEFAULT '',
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migração segura para colunas em system_configs
    await client.query(`
      ALTER TABLE system_configs ADD COLUMN IF NOT EXISTS value JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE system_configs ADD COLUMN IF NOT EXISTS provider VARCHAR(60) DEFAULT 'groq';
      ALTER TABLE system_configs ADD COLUMN IF NOT EXISTS model VARCHAR(100) DEFAULT 'llama-3.3-70b-versatile';
      ALTER TABLE system_configs ADD COLUMN IF NOT EXISTS api_key TEXT DEFAULT '';
      ALTER TABLE system_configs ADD COLUMN IF NOT EXISTS base_url TEXT DEFAULT 'https://api.groq.com/openai/v1';
      ALTER TABLE system_configs ADD COLUMN IF NOT EXISTS temperature NUMERIC(3, 2) DEFAULT 0.30;
      ALTER TABLE system_configs ADD COLUMN IF NOT EXISTS system_prompt TEXT DEFAULT '';
    `);

    // Limpeza profilática de chaves concorrentes legadas para manter unificado em 'brain_llm_config'
    await client.query(`
      DELETE FROM system_configs WHERE key IN ('brain_config', 'brain_llm');
    `);

    // Insere a configuração inicial apenas se a tabela estiver 100% vazia
    await client.query(`
      INSERT INTO system_configs (key, provider, model, base_url, temperature, value)
      VALUES (
        'brain_llm_config',
        'groq',
        'llama-3.3-70b-versatile',
        'https://api.groq.com/openai/v1',
        0.2,
        '{
          "agent_name": "JARVIS",
          "provider": "groq",
          "model": "llama-3.3-70b-versatile",
          "api_key": "",
          "base_url": "https://api.groq.com/openai/v1",
          "temperature": 0.2,
          "server_base_url": "http://localhost:3333",
          "system_prompt": "Você é o JARVIS, o Agente Líder permanente e Orquestrador Central deste ecossistema.",
          "saved_keys": {}
        }'::jsonb
      )
      ON CONFLICT (key) DO NOTHING;
    `);

    // Limpa eventuais resíduos de máscara ('•' ou '*') gravados no JSONB do cérebro
    await client.query(`
      UPDATE system_configs
      SET value = jsonb_set(value, '{api_key}', '""'::jsonb)
      WHERE key = 'brain_llm_config'
        AND (value->>'api_key' LIKE '%•%' OR value->>'api_key' LIKE '%*%');
    `);

    // 3. Tabela Unificada de Identidades e Acesso
    await client.query(`
      CREATE TABLE IF NOT EXISTS identities (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'admin',
        biometric_hash VARCHAR(255) UNIQUE,
        permissions JSONB DEFAULT '{"full_access": true}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      INSERT INTO identities (name, email, password, role, permissions)
      VALUES ('Matheus Dulius', 'matheus_dulius@hotmail.com', '123456', 'admin', '{"full_access": true}')
      ON CONFLICT (email) DO NOTHING;
    `);

    // 4. Tabela de Agentes Especialistas (Multi-LLM, Code, API, MCP, Sequência)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_agents (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        agent_type VARCHAR(50) DEFAULT 'llm',
        status VARCHAR(20) DEFAULT 'active',
        description TEXT DEFAULT '',
        system_prompt TEXT DEFAULT '',
        provider VARCHAR(60) NOT NULL DEFAULT 'groq',
        model VARCHAR(100) NOT NULL DEFAULT 'llama-3.3-70b-versatile',
        api_key TEXT,
        base_url TEXT,
        temperature NUMERIC(3, 2) DEFAULT 0.30,
        icon VARCHAR(30) DEFAULT '🤖',
        tools JSONB DEFAULT '[]'::jsonb,
        script_handler VARCHAR(100),
        code_snippet TEXT,
        http_method VARCHAR(20) DEFAULT 'POST',
        endpoint_url TEXT,
        auth_token TEXT,
        payload_template TEXT,
        next_agent_slug VARCHAR(100) DEFAULT NULL,
        next_agent_slugs JSONB DEFAULT '[]'::jsonb,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS agent_type VARCHAR(50) DEFAULT 'llm';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS system_prompt TEXT DEFAULT '';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS provider VARCHAR(60) DEFAULT 'groq';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS model VARCHAR(100) DEFAULT 'llama-3.3-70b-versatile';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS api_key TEXT;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS base_url TEXT;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS temperature NUMERIC(3, 2) DEFAULT 0.30;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS icon VARCHAR(30) DEFAULT '🤖';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS tools JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS script_handler VARCHAR(100);
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS code_snippet TEXT;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS http_method VARCHAR(20) DEFAULT 'POST';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS endpoint_url TEXT;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS auth_token TEXT;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS payload_template TEXT;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS next_agent_slug VARCHAR(100) DEFAULT NULL;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS next_agent_slugs JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS response_instruction TEXT DEFAULT '';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN DEFAULT FALSE;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS cron_expression VARCHAR(100) DEFAULT '*/5 * * * *';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS schedule_prompt TEXT DEFAULT '';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS is_error_trigger BOOLEAN DEFAULT FALSE;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS error_notify_channel VARCHAR(50) DEFAULT 'telegram';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS approval_message TEXT DEFAULT '';
    `);

    // Limpeza de eventuais máscaras residuais na api_key dos agentes
    await client.query(`
      UPDATE ai_agents
      SET api_key = NULL
      WHERE api_key LIKE '%•%' OR api_key LIKE '%*%';
    `);

    // 5. Tabelas de Memória: Curto Prazo (Sessões) e Médio Prazo (Episódica / Projetos)
    await client.query(`
      -- Curto Prazo: Histórico de Conversação da Sessão
      CREATE TABLE IF NOT EXISTS jarvis_chat_memory (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(120) NOT NULL,
        role VARCHAR(30) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_jarvis_memory_session ON jarvis_chat_memory(session_id);

      -- Curto Prazo: Contexto Técnico dos Especialistas
      CREATE TABLE IF NOT EXISTS specialist_context_memory (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(120) NOT NULL,
        specialist_slug VARCHAR(100) NOT NULL,
        context_data JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_spec_context_session ON specialist_context_memory(session_id);

      -- Médio Prazo: Memória Episódica com Expiração Configurável (TTL)
      CREATE TABLE IF NOT EXISTS jarvis_episodic_memory (
        id SERIAL PRIMARY KEY,
        identity_token VARCHAR(100) DEFAULT 'Matheus-Admin',
        categoria VARCHAR(60) NOT NULL DEFAULT 'tarefa_ativa', -- 'projeto', 'tarefa_ativa', 'habito', 'contexto_semanal'
        titulo VARCHAR(150) NOT NULL,
        conteudo TEXT NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days')
      );
      CREATE INDEX IF NOT EXISTS idx_episodic_expires ON jarvis_episodic_memory(expires_at);
      CREATE INDEX IF NOT EXISTS idx_episodic_categoria ON jarvis_episodic_memory(categoria);
    `);

    // 6. Cofre de Conectores Externos & Ferramentas Nativas
    await client.query(`
      CREATE TABLE IF NOT EXISTS external_connectors (
        provider_key VARCHAR(80) PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        category VARCHAR(60) NOT NULL DEFAULT 'Custom Tool',
        icon VARCHAR(20) DEFAULT '🔌',
        description TEXT DEFAULT '',
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_enabled BOOLEAN DEFAULT TRUE,
        api_key TEXT DEFAULT '',
        endpoint_url TEXT DEFAULT '',
        last_tested_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      ALTER TABLE external_connectors ADD COLUMN IF NOT EXISTS provider_key VARCHAR(80);
      ALTER TABLE external_connectors ADD COLUMN IF NOT EXISTS category VARCHAR(60) DEFAULT 'Custom Tool';
      ALTER TABLE external_connectors ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT TRUE;
      ALTER TABLE external_connectors ADD COLUMN IF NOT EXISTS api_key TEXT DEFAULT '';
      ALTER TABLE external_connectors ADD COLUMN IF NOT EXISTS endpoint_url TEXT DEFAULT '';
    `);

    // Registo de fábrica do conector de Banco de Dados para seleção na interface
    await client.query(`
      INSERT INTO external_connectors (provider_key, name, category, icon, description, is_enabled)
      VALUES (
        'dynamicdatabasetool',
        'Banco de Dados (Dynamic Collections)',
        'Banco de Dados',
        '🗄️',
        'Grava e consulta contactos e tabelas dinâmicas no PostgreSQL',
        true
      )
      ON CONFLICT (provider_key) DO UPDATE 
      SET is_enabled = true,
          name = EXCLUDED.name,
          description = EXCLUDED.description;
    `);

    // 7. Tabela Dedicada da Agenda de Contactos (Integrada ao WhatsApp e PBX)
    await client.query(`
      CREATE TABLE IF NOT EXISTS contatos_agenda (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) UNIQUE NOT NULL,
        telefone VARCHAR(25) NOT NULL,
        apelidos TEXT[],
        criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Semente inicial de contactos garantindo que nunca é reiniciada ou perdida
    await client.query(`
      INSERT INTO contatos_agenda (nome, telefone, apelidos) VALUES
        ('mae', '5567991153233', ARRAY['mãe', 'mainha']),
        ('matheus', '5567991289607', ARRAY['eu', 'meu', 'mim', 'meu numero']),
        ('amor', '5567992537089', ARRAY['este', 'ester', 'esposa'])
      ON CONFLICT (nome) DO UPDATE 
      SET telefone = EXCLUDED.telefone, atualizado_em = NOW();
    `);

    // 8. Memória Vetorial de Longo Prazo (RAG) e Auditoria de Execução
    const embeddingColumnType = hasVectorExtension ? 'VECTOR(1536)' : 'TEXT';
    await client.query(`
      CREATE TABLE IF NOT EXISTS vector_documents (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        embedding ${embeddingColumnType},
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS agent_audit_logs (
        id SERIAL PRIMARY KEY,
        identity_id INTEGER REFERENCES identities(id) ON DELETE SET NULL,
        session_id VARCHAR(120),
        agent_name VARCHAR(100) NOT NULL,
        action_payload JSONB,
        response_payload JSONB,
        execution_time_ms INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 9. Versionamento de Prompts, Coleções Dinâmicas e Estado Wait
    await client.query(`
      CREATE TABLE IF NOT EXISTS prompt_versions (
        id SERIAL PRIMARY KEY,
        target_slug VARCHAR(100) NOT NULL,
        system_prompt TEXT NOT NULL,
        model VARCHAR(100),
        provider VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS dynamic_collections (
        id SERIAL PRIMARY KEY,
        collection_name VARCHAR(100) NOT NULL,
        event_id VARCHAR(150) UNIQUE NOT NULL,
        document_data JSONB NOT NULL,
        decision_reasoning TEXT,
        webhook_source VARCHAR(120),
        execution_status VARCHAR(40) DEFAULT 'SAVED',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS workflow_wait_states (
        id SERIAL PRIMARY KEY,
        execution_id VARCHAR(100) UNIQUE NOT NULL,
        resume_token VARCHAR(100) UNIQUE NOT NULL,
        agent_slug VARCHAR(100) NOT NULL,
        agent_name VARCHAR(150) NOT NULL,
        environment VARCHAR(30) DEFAULT 'production',
        trigger_source VARCHAR(100),
        input_payload JSONB DEFAULT '{}'::jsonb,
        proposed_output JSONB DEFAULT '{}'::jsonb,
        next_agent_slug VARCHAR(100),
        approval_prompt TEXT,
        status VARCHAR(30) DEFAULT 'WAITING',
        decided_by VARCHAR(100),
        decision_notes TEXT,
        decided_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Complementos finais de compatibilidade
    await client.query(`
      ALTER TABLE identities ADD COLUMN IF NOT EXISTS full_name VARCHAR(150);
      ALTER TABLE identities ADD COLUMN IF NOT EXISTS access_level INTEGER DEFAULT 10;
    `);

    console.log('✅ [Database Setup] Esquema e tabelas unificadas alinhados com sucesso!');
  } catch (error: any) {
    console.error('❌ [Database Setup] Falha ao alinhar esquema:', error.message);
    throw error;
  } finally {
    client.release();
  }
}
