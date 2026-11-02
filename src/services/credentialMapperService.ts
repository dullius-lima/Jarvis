// src/services/credentialMapperService.ts
import { z } from 'zod';
import { pool } from '../config/database.js';

export interface CredentialMetadata {
  credential_id: string;
  type: 'llm_provider' | 'external_connector';
  provider: string;
  name: string;
  category: string;
  is_ready: boolean;
}

const RESERVED_CORE_SLUGS = new Set(['jarvis', 'jarvis_core', 'core', 'orquestrador', 'snc']);

/**
 * 1. Mapeamento das Conexões Externas (Credentials)
 * Retorna APENAS metadados e IDs (nunca retorna chaves ou tokens secretos para a LLM)
 */
export async function listAvailableCredentialsMetadata(): Promise<CredentialMetadata[]> {
  const credentials: CredentialMetadata[] = [];

  try {
    // A. Lê o cofre de chaves de IA em system_configs (saved_keys)
    const brainRes = await pool.query(`
      SELECT value FROM system_configs 
      WHERE key IN ('brain_llm_config', 'brain_llm') 
      ORDER BY updated_at DESC LIMIT 1;
    `);

    const savedKeys: Record<string, string> = {};
    if (brainRes.rows.length > 0) {
      const parsed = typeof brainRes.rows[0].value === 'string'
        ? JSON.parse(brainRes.rows[0].value)
        : brainRes.rows[0].value;

      if (parsed?.provider && parsed?.api_key) {
        savedKeys[String(parsed.provider).toLowerCase()] = String(parsed.api_key);
      }
      if (parsed?.saved_keys && typeof parsed.saved_keys === 'object') {
        Object.assign(savedKeys, parsed.saved_keys);
      }
    }

    const llmProviders = [
      { key: 'groq', name: 'Groq Cloud (Llama 3.3 / Fast Inference)', env: process.env.GROQ_API_KEY },
      { key: 'openai', name: 'OpenAI Official (GPT-4o / Mini)', env: process.env.OPENAI_API_KEY },
      { key: 'gemini', name: 'Google Gemini API', env: process.env.GEMINI_API_KEY },
      { key: 'deepseek', name: 'DeepSeek (V3 / R1 Reasoner)', env: process.env.DEEPSEEK_API_KEY },
      { key: 'openrouter', name: 'OpenRouter Multi-Hub', env: process.env.OPENROUTER_API_KEY },
      { key: 'ollama', name: 'Ollama Local (Offline)', env: 'ollama_local' }
    ];

    for (const prov of llmProviders) {
      const hasKey = Boolean(
        (savedKeys[prov.key] && savedKeys[prov.key].trim().length > 3) ||
        (prov.env && prov.env.trim().length > 3)
      );
      if (hasKey) {
        credentials.push({
          credential_id: `llm_cred:${prov.key}`,
          type: 'llm_provider',
          provider: prov.key,
          name: prov.name,
          category: 'LLM Provider',
          is_ready: true
        });
      }
    }

    // B. Lê os conectores externos salvos na tabela external_connectors
    const connRes = await pool.query('SELECT provider_key, name, category, config, api_key, is_enabled FROM external_connectors;');
    for (const row of connRes.rows) {
      const cfg = typeof row.config === 'object' && row.config !== null ? row.config : {};
      const hasSecret = Boolean(
        row.api_key || cfg.api_key || cfg.access_token || cfg.bot_token || cfg.webhook_url || cfg.auth_token || row.is_enabled
      );
      if (hasSecret) {
        credentials.push({
          credential_id: `ext_cred:${row.provider_key}`,
          type: 'external_connector',
          provider: row.provider_key,
          name: row.name || row.provider_key,
          category: row.category || 'External API',
          is_ready: true
        });
      }
    }
  } catch (err: any) {
    console.warn('⚠️ [CredentialMapper] Aviso ao mapear credenciais:', err.message);
  }

  return credentials;
}

/**
 * Resolve um credential_id internamente no Backend (Sem expor o segredo para a LLM)
 */
export async function resolveSecretByCredentialId(credentialId?: string): Promise<{
  provider?: string;
  api_key?: string;
  auth_token?: string;
  endpoint_url?: string;
}> {
  if (!credentialId || !credentialId.trim()) return {};
  const cleanId = credentialId.trim().toLowerCase();

  // Caso 1: Credencial de LLM (ex: "llm_cred:groq" ou apenas "groq")
  const llmProvider = cleanId.startsWith('llm_cred:') ? cleanId.replace('llm_cred:', '') : cleanId;
  try {
    const brainRes = await pool.query(`
      SELECT value FROM system_configs 
      WHERE key IN ('brain_llm_config', 'brain_llm') 
      ORDER BY updated_at DESC LIMIT 1;
    `);
    if (brainRes.rows.length > 0) {
      const parsed = typeof brainRes.rows[0].value === 'string'
        ? JSON.parse(brainRes.rows[0].value)
        : brainRes.rows[0].value;

      const vaultKey =
        parsed?.saved_keys?.[llmProvider] ||
        (parsed?.provider === llmProvider ? parsed?.api_key : '');

      if (vaultKey && String(vaultKey).trim()) {
        return { provider: llmProvider, api_key: String(vaultKey).trim() };
      }
    }
  } catch {}

  // Caso 2: Credencial de Conector Externo (ex: "ext_cred:brapi")
  const extKey = cleanId.startsWith('ext_cred:') ? cleanId.replace('ext_cred:', '') : cleanId;
  try {
    const connRes = await pool.query(
      'SELECT * FROM external_connectors WHERE LOWER(provider_key) = $1 LIMIT 1;',
      [extKey]
    );
    if (connRes.rows.length > 0) {
      const row = connRes.rows[0];
      const cfg = typeof row.config === 'object' && row.config !== null ? row.config : {};
      const secret =
        row.api_key || cfg.access_token || cfg.api_key || cfg.bot_token || cfg.auth_token || '';
      return {
        provider: row.provider_key,
        auth_token: secret,
        api_key: secret,
        endpoint_url: row.endpoint_url || cfg.endpoint_url || cfg.base_url || cfg.webhook_url || ''
      };
    }
  } catch {}

  return {};
}

/**
 * 3. Validação de Sintaxe (Sanity Check) + Proteção de Escopo do Orquestrador
 */
export const AutonomousAgentBlueprintSchema = z.object({
  name: z.string().min(3, 'O campo "name" deve ter pelo menos 3 caracteres.'),
  slug: z
    .string()
    .regex(/^[a-z0-9_]+$/, 'O "slug" deve conter apenas letras minúsculas, números e underscore (_).')
    .refine((val) => !RESERVED_CORE_SLUGS.has(val.toLowerCase()), {
      message: 'PROIBIDO: O Orquestrador não pode modificar o próprio fluxo central (JARVIS). Crie apenas sub-fluxos/especialistas filhos.'
    }),
  description: z.string().min(10, 'Forneça uma "description" clara de quando o Orquestrador deve acionar este agente.'),
  agent_type: z.enum(['llm', 'api', 'mcp', 'code']).default('llm'),
  system_prompt: z.string().min(5, 'O System Prompt (parameters.prompt) não pode ficar vazio.'),
  provider: z.string().default('groq'),
  model: z.string().default('llama-3.3-70b-versatile'),
  credential_id: z.string().optional(),
  tools: z.array(z.string()).default([]),
  endpoint_url: z.string().optional(),
  http_method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('POST'),
  payload_template: z.string().optional(),
  response_instruction: z.string().optional(),
  next_agent_slug: z.string().nullable().optional(),
  icon: z.string().default('🤖')
});

export function validateAutonomousAgentBlueprint(rawInput: any) {
  // Suporta tanto o formato direto quanto o formato aninhado n8n (parameters.prompt + credentials.id)
  const normalized = {
    name: rawInput?.name,
    slug: rawInput?.slug,
    description: rawInput?.description || rawInput?.parameters?.description,
    agent_type: rawInput?.agent_type || 'llm',
    system_prompt:
      rawInput?.system_prompt ||
      rawInput?.parameters?.prompt ||
      rawInput?.parameters?.system_prompt ||
      'Você é um agente especialista subordinado ao JARVIS.',
    provider: rawInput?.provider || rawInput?.parameters?.provider || 'groq',
    model: rawInput?.model || rawInput?.parameters?.model || 'llama-3.3-70b-versatile',
    credential_id:
      rawInput?.credential_id ||
      rawInput?.credentials?.id ||
      rawInput?.credentials?.credential_id ||
      undefined,
    tools: Array.isArray(rawInput?.tools)
      ? rawInput.tools
      : Array.isArray(rawInput?.parameters?.tools)
      ? rawInput.parameters.tools
      : [],
    endpoint_url: rawInput?.endpoint_url || rawInput?.parameters?.endpoint_url || '',
    http_method: (rawInput?.http_method || 'POST').toUpperCase(),
    payload_template: rawInput?.payload_template || rawInput?.parameters?.payload_template || '',
    response_instruction: rawInput?.response_instruction || rawInput?.parameters?.response_instruction || '',
    next_agent_slug: rawInput?.next_agent_slug || null,
    icon: rawInput?.icon || '🤖'
  };

  return AutonomousAgentBlueprintSchema.safeParse(normalized);
}