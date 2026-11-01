// src/models/databaseSetup.ts
import { pool } from '../config/database.js';

export async function initializeDatabaseSchema() {
  const client = await pool.connect();
  try {
    console.log('🔄 Inicializando e alinhando esquema unificado JARVIS & n8n no PostgreSQL...');

    // 1. Extensão pgvector com fallback seguro para Windows
    let hasVectorExtension = false;
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
      hasVectorExtension = true;
    } catch {
      console.info('ℹ️ [Modo Compatibilidade] pgvector não detectado localmente. Usando TEXT para vetores.');
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

    await client.query(`
      INSERT INTO system_configs (key, provider, model, base_url, temperature, value)
      VALUES (
        'brain_llm_config',
        'groq',
        'llama-3.3-70b-versatile',
        'https://api.groq.com/openai/v1',
        0.3,
        '{
          "agent_name": "JARVIS",
          "provider": "groq",
          "model": "llama-3.3-70b-versatile",
          "api_key": "",
          "base_url": "https://api.groq.com/openai/v1",
          "temperature": 0.3,
          "server_base_url": "http://localhost:3333",
          "system_prompt": "Você é o JARVIS, o Agente Líder permanente e Orquestrador Central deste ecossistema."
        }'::jsonb
      )
      ON CONFLICT (key) DO NOTHING;
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
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
    `);

    // 5. Tabelas de Memória de Chat e Contexto
    await client.query(`
      CREATE TABLE IF NOT EXISTS jarvis_chat_memory (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(120) NOT NULL,
        role VARCHAR(30) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_jarvis_memory_session ON jarvis_chat_memory(session_id);

      CREATE TABLE IF NOT EXISTS specialist_context_memory (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(120) NOT NULL,
        specialist_slug VARCHAR(100) NOT NULL,
        context_data JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 6. Cofre de Conectores Externos & IoT (Gmail, Outlook, WhatsApp, Telegram, Home Assistant)
    await client.query(`
      CREATE TABLE IF NOT EXISTS external_connectors (
        provider_key VARCHAR(80) PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        category VARCHAR(60) NOT NULL DEFAULT 'Custom Tool',
        icon VARCHAR(20) DEFAULT '🔌',
        description TEXT DEFAULT '',
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_enabled BOOLEAN DEFAULT TRUE,
        last_tested_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 7. Memória Vetorial (RAG) e Auditoria
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

    // Complemento de colunas para Biometria (identities) e Agentes (ai_agents)
    await client.query(`
      ALTER TABLE identities ADD COLUMN IF NOT EXISTS full_name VARCHAR(150);
      ALTER TABLE identities ADD COLUMN IF NOT EXISTS access_level INTEGER DEFAULT 10;

      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS response_instruction TEXT DEFAULT '';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN DEFAULT FALSE;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS cron_expression VARCHAR(100) DEFAULT '*/5 * * * *';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS schedule_prompt TEXT DEFAULT '';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS is_error_trigger BOOLEAN DEFAULT FALSE;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS error_notify_channel VARCHAR(50) DEFAULT 'telegram';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS approval_message TEXT DEFAULT '';

      ALTER TABLE external_connectors ADD COLUMN IF NOT EXISTS provider_key VARCHAR(80);
      ALTER TABLE external_connectors ADD COLUMN IF NOT EXISTS category VARCHAR(60) DEFAULT 'Custom Tool';
      ALTER TABLE external_connectors ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT TRUE;
      ALTER TABLE external_connectors ADD COLUMN IF NOT EXISTS api_key TEXT DEFAULT '';
      ALTER TABLE external_connectors ADD COLUMN IF NOT EXISTS endpoint_url TEXT DEFAULT '';
    `);

    // Tabelas de Versionamento de Prompts, Coleções Dinâmicas e Estado Wait (Human-in-the-Loop)
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

    console.log('✅ [Database Setup] Esquema e tabelas unificadas alinhados com sucesso!');
  } catch (error: any) {
    console.error('❌ [Database Setup] Falha ao alinhar esquema:', error.message);
    throw error;
  } finally {
    client.release();
  }
}