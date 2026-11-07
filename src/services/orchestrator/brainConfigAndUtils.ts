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
    schemaVerified = true;
  } catch {}
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

  // Ignora máscaras visuais de senha (bolinhas ou asteriscos)
  if (!cleaned || /[•*]/.test(cleaned) || cleaned === 'undefined' || cleaned === 'null') {
    return '';
  }

  // Corrige automaticamente erro de digitação mobile (Gsk_ -> gsk_)
  if (/^gsk_/i.test(cleaned)) {
    cleaned = 'gsk_' + cleaned.slice(4);
  } else if (/^aiza/i.test(cleaned)) {
    cleaned = 'AIza' + cleaned.slice(4);
  } else if (/^sk-or-/i.test(cleaned)) {
    cleaned = 'sk-or-' + cleaned.slice(6);
  }

  return cleaned;
}

export function resolveProviderCredentials(
  provider?: string,
  customKey?: string,
  customUrl?: string,
  customModel?: string
) {
  let apiKey = sanitizeRawApiKey(customKey);
  let p = (provider || process.env.LLM_PROVIDER || 'groq').toLowerCase().trim();

  // Detecta provedor pelo prefixo real da chave se presente
  if (apiKey.startsWith('gsk_')) p = 'groq';
  else if (apiKey.startsWith('AIza')) p = 'gemini';
  else if (apiKey.startsWith('sk-or-')) p = 'openrouter';

  // Fallback para variáveis de ambiente se a chave estiver vazia ou era máscara
  if (!apiKey) {
    if (p === 'groq') apiKey = sanitizeRawApiKey(process.env.GROQ_API_KEY || process.env.LLM_API_KEY);
    else if (p === 'openai') apiKey = sanitizeRawApiKey(process.env.OPENAI_API_KEY || process.env.LLM_API_KEY);
    else if (p === 'gemini') apiKey = sanitizeRawApiKey(process.env.GEMINI_API_KEY || process.env.LLM_API_KEY);
    else if (p === 'deepseek') apiKey = sanitizeRawApiKey(process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY);
    else if (p === 'openrouter') apiKey = sanitizeRawApiKey(process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY);
    else if (p === 'ollama') apiKey = 'ollama';
    else apiKey = sanitizeRawApiKey(process.env.GROQ_API_KEY || process.env.LLM_API_KEY);
  }

  if (apiKey.startsWith('gsk_')) p = 'groq';
  else if (apiKey.startsWith('AIza')) p = 'gemini';
  else if (apiKey.startsWith('sk-or-')) p = 'openrouter';

  const endpoints = { ...DEFAULT_KNOWN_ENDPOINTS, ...(KNOWN_ENDPOINTS || {}) };
  let baseURL = (customUrl && customUrl.trim()) || endpoints[p] || endpoints.groq;

  if (p === 'groq' && !baseURL.includes('groq.com')) baseURL = endpoints.groq;
  else if (p === 'gemini' && !baseURL.includes('googleapis.com')) baseURL = endpoints.gemini;
  else if (p === 'openrouter' && !baseURL.includes('openrouter.ai')) baseURL = endpoints.openrouter;
  else if (p === 'deepseek' && !baseURL.includes('deepseek.com')) baseURL = endpoints.deepseek;
  else if (p === 'openai' && !baseURL.includes('openai.com')) baseURL = endpoints.openai;

  baseURL = baseURL.replace(/\/+$/, '');

  const defaultModels: Record<string, string> = {
    groq: 'llama-3.3-70b-versatile',
    gemini: 'gemini-2.5-flash',
    openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
    deepseek: 'deepseek-chat',
    openai: 'gpt-4o-mini',
    ollama: 'llama3.1:8b'
  };

  let model =
    customModel && customModel.trim() && customModel !== 'CUSTOM_INPUT'
      ? customModel.trim()
      : defaultModels[p] || 'llama-3.3-70b-versatile';

  if (p === 'groq') {
    if (
      model.includes('gemini') ||
      model.startsWith('gpt-4') ||
      model.startsWith('claude') ||
      model.includes(':free') ||
      model.includes('gpt-oss')
    ) {
      model = 'llama-3.3-70b-versatile';
    }
  } else if (
    p === 'gemini' &&
    (!model.startsWith('gemini') || model.includes('argon') || model.includes('3.8'))
  ) {
    model = 'gemini-2.5-flash';
  } else if (p === 'openrouter' && (model === 'llama-3.3-70b-versatile' || model === 'llama-3.1-8b-instant')) {
    model = 'meta-llama/llama-3.3-70b-instruct:free';
  } else if (p === 'deepseek' && !model.startsWith('deepseek')) {
    model = 'deepseek-chat';
  } else if (p === 'openai' && !model.startsWith('gpt') && !model.startsWith('o1') && !model.startsWith('o3')) {
    model = 'gpt-4o-mini';
  }

  return { provider: p, apiKey: apiKey || 'ollama', baseURL, model };
}

export async function getCentralBrainConfig() {
  let activePort = 3333;
  try {
    activePort =
      typeof getEnvRegisteredPort === 'function'
        ? getEnvRegisteredPort()
        : Number(process.env.PORT || 3333);
  } catch {
    activePort = Number(process.env.PORT || 3333);
  }

  try {
    const result = await pool.query(`
      SELECT value FROM system_configs 
      WHERE key IN ('brain_llm_config', 'brain_llm', 'brain_config') 
      ORDER BY updated_at DESC LIMIT 1;
    `);

    if (result.rows.length > 0) {
      const raw = result.rows[0].value;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') {
        const activeProv = String(parsed.provider || 'groq').toLowerCase().trim();
        const savedKeysObj =
          parsed.saved_keys && typeof parsed.saved_keys === 'object' ? parsed.saved_keys : {};

        const cleanDirectKey = sanitizeRawApiKey(parsed.api_key);
        const cleanVaultProvKey = sanitizeRawApiKey(savedKeysObj[activeProv]);
        const cleanAnyVaultKey = Object.values(savedKeysObj)
          .map((v: any) => sanitizeRawApiKey(v))
          .find((v) => v.length > 8) || '';

        const keyFromVault = cleanDirectKey || cleanVaultProvKey || cleanAnyVaultKey;

        const creds = resolveProviderCredentials(
          activeProv,
          keyFromVault,
          parsed.base_url,
          parsed.model
        );

        return {
          name: parsed.agent_name || parsed.name || 'JARVIS',
          provider: creds.provider,
          model: creds.model,
          api_key: creds.apiKey,
          base_url: creds.baseURL,
          saved_keys: savedKeysObj,
          server_base_url:
            parsed.server_base_url ||
            process.env.SERVER_BASE_URL ||
            `http://localhost:${activePort}`,
          temperature: Number(parsed.temperature ?? 0.2),
          system_prompt:
            parsed.system_prompt ||
            'Você é o JARVIS, o Cérebro Central e Agente Líder do ecossistema. Analise os estímulos, consulte a memória, crie ou evolua Agentes/Tools economizando tokens e acione os Agentes Especialistas.'
        };
      }
    }
  } catch (error: any) {
    console.warn('⚠️ [Central Brain Config] Fallback para variáveis de ambiente:', error?.message);
  }

  const creds = resolveProviderCredentials(
    process.env.LLM_PROVIDER || 'groq',
    process.env.GROQ_API_KEY || process.env.LLM_API_KEY || '',
    process.env.LLM_BASE_URL,
    process.env.LLM_MODEL
  );

  return {
    name: 'JARVIS',
    provider: creds.provider,
    model: creds.model,
    api_key: creds.apiKey,
    base_url: creds.baseURL,
    saved_keys: {},
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
