// Credenciais Multi-IA, Schema SQL e Utilitários de URL
// src/services/orchestrator/brainConfigAndUtils.ts

import { pool } from '../../config/database.js';
import OpenAI from 'openai';
import { KNOWN_ENDPOINTS, getEnvRegisteredPort } from '../../controllers/brainConfigController.js';

export type SupportedProtocolOrPlatform =
  | 'whatsapp'
  | 'google_workspace'
  | 'gmail'
  | 'google_sheets'
  | 'google_calendar'
  | 'google_drive'
  | 'outlook'
  | 'microsoft_365'
  | 'microsoft_teams'
  | 'rest_api'
  | 'mcp'
  | 'graphql'
  | 'amqp'
  | 'kafka'
  | 'imap'
  | 'ftp'
  | 'sftp'
  | string;

export type ExternalProvider = SupportedProtocolOrPlatform;

export interface SensoryAttachments {
  screenFrame?: string;
  webcamFrame?: string;
  biometricVerified?: boolean;
  biometricRole?: string;
  sensorData?: any;
}

export interface SensorPayload {
  type?: string;
  textPrompt?: string;
  hasVision?: boolean;
  imagePayload?: {
    mimeType: string;
    dataBase64: string;
  };
  faceFrameBase64?: string;
  activeWindowTitle?: string;
  screenFrame?: string;
  screenBase64?: string;
  webcamFrame?: string;
  biometricVerified?: boolean;
  biometricRole?: string;
  sensorData?: any;
}

export interface DynamicToolCatalogItem {
  slug: string;
  name: string;
  category: string;
  method: string;
  endpoint: string;
  description: string;
}

const DEFAULT_KNOWN_ENDPOINTS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  ollama: 'http://localhost:11434/v1',
  openrouter: 'https://openrouter.ai/api/v1'
};

let schemaVerified = false;

export async function ensureOrchestratorSchema(): Promise<void> {
  if (schemaVerified) return;
  try {
    // 1. Tabela de conectores e ferramentas dinâmicas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS external_connectors (
        provider_key VARCHAR(120) PRIMARY KEY,
        name VARCHAR(180) NOT NULL,
        category VARCHAR(100) DEFAULT 'Custom Tool',
        icon VARCHAR(30) DEFAULT '🔌',
        description TEXT DEFAULT '',
        is_enabled BOOLEAN DEFAULT TRUE,
        config JSONB DEFAULT '{}'::jsonb,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Colunas complementares da tabela ai_agents
    await pool.query(`
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS agent_type VARCHAR(50) DEFAULT 'llm';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS code_snippet TEXT;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS http_method VARCHAR(20) DEFAULT 'POST';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS endpoint_url TEXT;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS auth_token TEXT;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS payload_template TEXT;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS tools JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS next_agent_slug VARCHAR(120);
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS cron_expression VARCHAR(80);
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS icon VARCHAR(30) DEFAULT '🤖';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS temperature NUMERIC DEFAULT 0.2;
    `);

    // 3. Registro persistente do Subagente Arquiteto (Fábrica de Agentes)
    await pool.query(`
      INSERT INTO ai_agents (
        name, 
        slug, 
        description, 
        system_prompt, 
        agent_type, 
        icon, 
        is_active
      )
      VALUES (
        'Arquiteto de Agentes',
        'fabrica_agentes',
        'Subagente especialista responsável por projetar, criar e ajustar novos nós e especialistas no ecossistema com travas de segurança.',
        'Você é o Arquiteto de Sistemas subordinado ao JARVIS. Analise as intenções, conectores disponíveis e projete novos agentes otimizados.',
        'code',
        '🏗️',
        true
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        icon = EXCLUDED.icon,
        is_active = true;
    `);

    schemaVerified = true;
  } catch (err: any) {
    console.warn('⚠️ [Orchestrator Schema] Aviso ao alinhar tabelas e subagente arquiteto:', err?.message);
  }
}

export function sanitizeToolName(name: string): string {
  return (
    String(name || 'custom_tool')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'custom_tool'
  );
}

export function resolveDynamicUrl(rawUrl: string, serverBaseUrl?: string): string {
  if (!rawUrl) return '';
  let activePort = 3333;
  try {
    activePort =
      typeof getEnvRegisteredPort === 'function'
        ? getEnvRegisteredPort()
        : Number(process.env.PORT || 3333);
  } catch {
    activePort = Number(process.env.PORT || 3333);
  }
  const base = (
    serverBaseUrl ||
    process.env.SERVER_BASE_URL ||
    `http://localhost:${activePort}`
  ).replace(/\/+$/, '');
  return rawUrl
    .replace(/\{\{\s*BASE_URL\s*\}\}/gi, base)
    .replace(/\{\{\s*SERVER_IP\s*\}\}/gi, base);
}

export function interpolateApiTemplate(
  templateStr: string,
  userPrompt: string,
  taskArgs: Record<string, any>
): string {
  if (!templateStr) return '';
  const queryVal = taskArgs?.query || taskArgs?.task_details || userPrompt || '';
  const symbolMatch = String(taskArgs?.symbol || userPrompt || '')
    .toUpperCase()
    .match(/\b([A-Z]{4}\d{1,2})\b/);
  const symbolVal = taskArgs?.symbol || (symbolMatch ? symbolMatch[1] : queryVal);

  return templateStr
    .replace(/\{\{\s*query\s*\}\}/gi, String(queryVal))
    .replace(/\{\{\s*symbol\s*\}\}/gi, String(symbolVal))
    .replace(/\{\{\s*prompt\s*\}\}/gi, String(userPrompt));
}

export function sanitizeRawApiKey(rawKey?: string): string {
  if (!rawKey) return '';
  let cleaned = String(rawKey)
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^["']+|["']+$/g, '')
    .trim();

  if (!cleaned || /[•*]/.test(cleaned) || cleaned === 'undefined' || cleaned === 'null') {
    return '';
  }

  if (/^gsk_/i.test(cleaned)) {
    cleaned = 'gsk_' + cleaned.slice(4);
  } else if (/^aiza/i.test(cleaned)) {
    cleaned = 'AIza' + cleaned.slice(4);
  } else if (/^sk-or-/i.test(cleaned)) {
    cleaned = 'sk-or-' + cleaned.slice(6);
  }

  return cleaned;
}

function cleanKey(rawKey?: any): string {
  if (!rawKey) return '';
  let k = String(rawKey)
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^["']+|["']+$/g, '')
    .replace(/[•*]/g, '')
    .trim();

  if (!k || k === 'undefined' || k === 'null' || k.length < 5) {
    return '';
  }

  if (/^gsk_/i.test(k)) k = 'gsk_' + k.slice(4);
  else if (/^aiza/i.test(k)) k = 'AIza' + k.slice(4);
  else if (/^sk-or-/i.test(k)) k = 'sk-or-' + k.slice(6);

  return k;
}

export function resolveProviderCredentials(
  provider?: string,
  customKey?: string,
  customUrl?: string,
  customModel?: string
) {
  let p = (provider || process.env.LLM_PROVIDER || 'groq').toLowerCase().trim();
  let apiKey = cleanKey(customKey);

  if (!apiKey) {
    if (p === 'groq') apiKey = cleanKey(process.env.GROQ_API_KEY || process.env.LLM_API_KEY);
    else if (p === 'openai') apiKey = cleanKey(process.env.OPENAI_API_KEY || process.env.LLM_API_KEY);
    else if (p === 'gemini') apiKey = cleanKey(process.env.GEMINI_API_KEY || process.env.LLM_API_KEY);
    else if (p === 'deepseek') apiKey = cleanKey(process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY);
    else if (p === 'openrouter') apiKey = cleanKey(process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY);
    else if (p === 'ollama') apiKey = 'ollama';
    else apiKey = cleanKey(process.env.LLM_API_KEY || process.env.GROQ_API_KEY);
  }

  if (apiKey.startsWith('gsk_')) p = 'groq';
  else if (apiKey.startsWith('AIza')) p = 'gemini';
  else if (apiKey.startsWith('sk-or-')) p = 'openrouter';

  const endpoints = { ...DEFAULT_KNOWN_ENDPOINTS, ...(KNOWN_ENDPOINTS || {}) };
  let baseURL = (customUrl && customUrl.trim()) || endpoints[p] || endpoints.groq;
  baseURL = baseURL.replace(/\/+$/, '');

  let model = customModel && customModel.trim() && customModel !== 'CUSTOM_INPUT'
    ? customModel.trim()
    : p === 'groq'
    ? 'llama-3.3-70b-versatile'
    : 'gpt-4o-mini';

  if (p === 'groq') {
    if (!model || model.includes('8b-instant') || model.includes('deepseek-r1')) {
      model = 'llama-3.3-70b-versatile';
    }
  }

  return { provider: p, apiKey: apiKey || 'ollama', baseURL, model };
}

export async function getCentralBrainConfig() {
  let activePort = 3333;
  try {
    activePort = typeof getEnvRegisteredPort === 'function' ? getEnvRegisteredPort() : Number(process.env.PORT || 3333);
  } catch {
    activePort = Number(process.env.PORT || 3333);
  }

  try {
    const result = await pool.query(`
      SELECT value FROM system_configs 
      WHERE key IN ('brain_llm_config', 'brain_llm') 
      ORDER BY updated_at DESC LIMIT 1;
    `);

    if (result.rows.length > 0) {
      const raw = result.rows[0].value;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') {
        const activeProv = String(parsed.provider || 'groq').toLowerCase().trim();

        const vaultKey = cleanKey(parsed.saved_keys?.[activeProv]);
        const mainKey = cleanKey(parsed.api_key);
        const anyVaultKey = parsed.saved_keys
          ? (Object.values(parsed.saved_keys).map(cleanKey).find((v) => v.length > 5) || '')
          : '';

        const effectiveKey = vaultKey || mainKey || anyVaultKey || '';

        const creds = resolveProviderCredentials(
          activeProv,
          effectiveKey,
          parsed.base_url,
          parsed.model
        );

        return {
          name: parsed.agent_name || parsed.name || 'JARVIS',
          provider: creds.provider,
          model: creds.model,
          api_key: creds.apiKey,
          base_url: creds.baseURL,
          server_base_url: parsed.server_base_url || process.env.SERVER_BASE_URL || `http://localhost:${activePort}`,
          temperature: Number(parsed.temperature ?? 0.2),
          system_prompt:
            parsed.system_prompt ||
            'Você é o JARVIS, o Cérebro Central e Agente Líder do ecossistema.'
        };
      }
    }
  } catch (error: any) {
    console.warn('⚠️ [Central Brain Config] Fallback para variáveis de ambiente:', error?.message);
  }

  const creds = resolveProviderCredentials(
    process.env.LLM_PROVIDER || 'groq',
    process.env.LLM_API_KEY || process.env.GROQ_API_KEY || '',
    process.env.LLM_BASE_URL,
    process.env.LLM_MODEL
  );

  return {
    name: 'JARVIS',
    provider: creds.provider,
    model: creds.model,
    api_key: creds.apiKey,
    base_url: creds.baseURL,
    server_base_url: process.env.SERVER_BASE_URL || `http://localhost:${activePort}`,
    temperature: 0.2,
    system_prompt: 'Você é o JARVIS, o Cérebro Central e Agente Líder do ecossistema.'
  };
}

export const getJarvisConfig = getCentralBrainConfig;

export function createLLMClient(config?: any): OpenAI {
  const creds = resolveProviderCredentials(
    config?.provider,
    config?.api_key,
    config?.base_url,
    config?.model
  );
  return new OpenAI({
    apiKey: creds.apiKey || 'ollama',
    baseURL: creds.baseURL,
    timeout: 30000
  });
}