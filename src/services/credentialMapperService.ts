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
 * Utilitário interno para sanitizar chaves e descartar máscaras de senha
 */
function cleanKey(rawKey?: any): string {
  if (!rawKey || typeof rawKey !== 'string') return '';
  const k = rawKey.trim().replace(/^["']+|["']+$/g, '').replace(/^Bearer\s+/i, '').trim();
  if (k.length < 5 || /[•*]/.test(k) || k === 'undefined' || k === 'null') {
    return '';
  }
  return k;
}

/**
 * 1. Mapeamento das Conexões Externas (Credentials)
 * Retorna APENAS metadados e IDs seguros (nunca expõe chaves ou tokens para a LLM)
 */
export async function listAvailableCredentialsMetadata(): Promise<CredentialMetadata[]> {
  const credentials: CredentialMetadata[] = [];

  try {
    // A. Lê o cofre de chaves de IA em system_configs
    const brainRes = await pool.query(`
      SELECT value FROM system_configs 
      WHERE key IN ('brain_llm_config', 'brain_llm', 'brain_config') 
      ORDER BY updated_at DESC LIMIT 1;
    `).catch(() => ({ rows: [] }));

    const savedKeys: Record<string, string> = {};
    if (brainRes.rows.length > 0) {
      const parsed = typeof brainRes.rows[0].value === 'string'
        ? JSON.parse(brainRes.rows[0].value)
        : brainRes.rows[0].value;

      if (parsed?.provider && parsed?.api_key) {
        const k = cleanKey(parsed.api_key);
        if (k) savedKeys[String(parsed.provider).toLowerCase()] = k;
      }
      if (parsed?.saved_keys && typeof parsed.saved_keys === 'object') {
        for (const [prov, keyVal] of Object.entries(parsed.saved_keys)) {
          const k = cleanKey(keyVal);
          if (k) savedKeys[prov.toLowerCase()] = k;
        }
      }
    }

    const llmProviders = [
      { key: 'groq', name: 'Groq Cloud (Llama 3.3 / Fast Inference)', env: process.env.GROQ_API_KEY || process.env.LLM_API_KEY },
      { key: 'openai', name: 'OpenAI Official (GPT-4o / Mini)', env: process.env.OPENAI_API_KEY || process.env.LLM_API_KEY },
      { key: 'gemini', name: 'Google Gemini API', env: process.env.GEMINI_API_KEY || process.env.LLM_API_KEY },
      { key: 'deepseek', name: 'DeepSeek (V3 / R1 Reasoner)', env: process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY },
      { key: 'openrouter', name: 'OpenRouter Multi-Hub', env: process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY },
      { key: 'ollama', name: 'Ollama Local (Offline)', env: 'ollama_local' }
    ];

    for (const prov of llmProviders) {
      const hasKey = Boolean(
        (savedKeys[prov.key] && savedKeys[prov.key].length > 4) ||
        (cleanKey(prov.env) && cleanKey(prov.env).length > 4) ||
        prov.key === 'ollama'
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
    const connRes = await pool.query(
      'SELECT provider_key, name, category, config, api_key, is_enabled FROM external_connectors WHERE is_enabled = TRUE;'
    ).catch(() => ({ rows: [] }));

    for (const row of connRes.rows) {
      const cfg = typeof row.config === 'object' && row.config !== null ? row.config : {};
      const secret = cleanKey(row.api_key || cfg.api_key || cfg.access_token || cfg.bot_token || cfg.webhook_url || cfg.auth_token || cfg.token);
      const hasEndpoint = Boolean(cfg.endpoint_url || row.endpoint_url);

      // Considera pronto se tem credencial ou se é um endpoint REST configurado
      if (secret || hasEndpoint) {
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
 * 2. Resolve um credential_id internamente no Backend (Sem expor o segredo para a LLM)
 */
export async function resolveSecretByCredentialId(credentialId?: string): Promise<{
  provider?: string;
  api_key?: string;
  auth_token?: string;
  endpoint_url?: string;
}> {
  if (!credentialId || !credentialId.trim()) return {};
  const cleanId = credentialId.trim().toLowerCase();

  // Caso 1: Credencial de LLM (ex: "llm_cred:groq" ou "groq")
  if (cleanId.startsWith('llm_cred:') || ['groq', 'openai', 'gemini', 'deepseek', 'openrouter', 'ollama'].includes(cleanId)) {
    const llmProvider = cleanId.replace('llm_cred:', '');
    try {
      const brainRes = await pool.query(`
        SELECT value FROM system_configs 
        WHERE key IN ('brain_llm_config', 'brain_llm', 'brain_config') 
        ORDER BY updated_at DESC LIMIT 1;
      `);
      if (brainRes.rows.length > 0) {
        const parsed = typeof brainRes.rows[0].value === 'string'
          ? JSON.parse(brainRes.rows[0].value)
          : brainRes.rows[0].value;

        const vaultKey = cleanKey(
          parsed?.saved_keys?.[llmProvider] ||
          (String(parsed?.provider || '').toLowerCase() === llmProvider ? parsed?.api_key : '')
        );

        if (vaultKey) {
          return { provider: llmProvider, api_key: vaultKey };
        }
      }
    } catch {}

    // Fallback para variáveis de ambiente (.env)
    let envKey = '';
    if (llmProvider === 'groq') envKey = cleanKey(process.env.GROQ_API_KEY || process.env.LLM_API_KEY);
    else if (llmProvider === 'gemini') envKey = cleanKey(process.env.GEMINI_API_KEY || process.env.LLM_API_KEY);
    else if (llmProvider === 'openrouter') envKey = cleanKey(process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY);
    else if (llmProvider === 'deepseek') envKey = cleanKey(process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY);
    else if (llmProvider === 'openai') envKey = cleanKey(process.env.OPENAI_API_KEY || process.env.LLM_API_KEY);
    else if (llmProvider === 'ollama') envKey = 'ollama';

    if (envKey) {
      return { provider: llmProvider, api_key: envKey };
    }
  }

  // Caso 2: Credencial de Conector Externo (ex: "ext_cred:brapi" ou "brapi")
  const extKey = cleanId.startsWith('ext_cred:') ? cleanId.replace('ext_cred:', '') : cleanId;
  try {
    const connRes = await pool.query(
      'SELECT * FROM external_connectors WHERE LOWER(provider_key) = $1 LIMIT 1;',
      [extKey]
    );
    if (connRes.rows.length > 0) {
      const row = connRes.rows[0];
      const cfg = typeof row.config === 'object' && row.config !== null ? row.config : {};
      const secret = cleanKey(row.api_key || cfg.access_token || cfg.api_key || cfg.bot_token || cfg.auth_token || cfg.token);
      return {
        provider: row.provider_key,
        auth_token: secret,
        api_key: secret,
        endpoint_url: row.endpoint_url || cfg.endpoint_url || cfg.base_url || cfg.webhook_url || ''
      };
    }
  } catch {}

  // Fallback de ambiente para conectores conhecidos
  if (extKey.includes('brapi')) {
    const t = cleanKey(process.env.BRAPI_API_KEY || process.env.BRAPI_TOKEN);
    if (t) return { provider: 'brapi', api_key: t, auth_token: t };
  } else if (extKey.includes('telegram')) {
    const t = cleanKey(process.env.TELEGRAM_BOT_TOKEN);
    if (t) return { provider: 'telegram', api_key: t, auth_token: t };
  } else if (extKey.includes('whatsapp')) {
    const t = cleanKey(process.env.WHATSAPP_ACCESS_TOKEN);
    if (t) return { provider: 'whatsapp', api_key: t, auth_token: t };
  }

  return {};
}

/**
 * 3. Validação de Sintaxe (Sanity Check) + Proteção de Escopo do Orquestrador
 */
export const AutonomousAgentBlueprintSchema = z.object({
  name: z.string().min(2, 'O campo "name" deve ter pelo menos 2 caracteres.'),
  slug: z
    .string()
    .regex(/^[a-z0-9_]+$/, 'O "slug" deve conter apenas letras minúsculas, números e underscore (_).')
    .refine((val) => !RESERVED_CORE_SLUGS.has(val.toLowerCase()), {
      message: 'PROIBIDO: O Orquestrador não pode modificar o próprio fluxo central (JARVIS). Crie apenas sub-fluxos/especialistas filhos.'
    }),
  description: z.string().min(5, 'Forneça uma "description" clara de quando o Orquestrador deve acionar este agente.'),
  agent_type: z.enum(['llm', 'api', 'mcp', 'code']).default('llm'),
  system_prompt: z.string().default('Você é um agente especialista subordinado ao JARVIS.'),
  provider: z.string().default('groq'),
  model: z.string().default('llama-3.3-70b-versatile'),
  credential_id: z.string().optional(),
  tools: z.array(z.string()).default([]),
  endpoint_url: z.string().optional(),
  http_method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('POST'),
  payload_template: z.string().optional(),
  code_snippet: z.string().optional(),
  response_instruction: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.3).optional(),
  next_agent_slug: z.string().nullable().optional(),
  schedule_enabled: z.boolean().default(false).optional(),
  cron_expression: z.string().optional(),
  is_error_trigger: z.boolean().default(false).optional(),
  icon: z.string().default('🤖')
});

export function validateAutonomousAgentBlueprint(rawInput: any) {
  // Normaliza o array de tools se tiver vindo serializado em string JSON
  let rawTools = rawInput?.tools ?? rawInput?.parameters?.tools ?? [];
  if (typeof rawTools === 'string') {
    try {
      rawTools = JSON.parse(rawTools);
    } catch {
      rawTools = [];
    }
  }

  // Gera slug seguro caso venha ausente ou inválido
  let slug = String(rawInput?.slug || rawInput?.name || 'custom_agent')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');

  if (RESERVED_CORE_SLUGS.has(slug)) {
    slug = `${slug}_child_${Date.now().toString(36).slice(-4)}`;
  }

  const normalized = {
    name: String(rawInput?.name || rawInput?.parameters?.name || slug),
    slug,
    description: rawInput?.description || rawInput?.parameters?.description || `Agente especialista ${slug}`,
    agent_type: (rawInput?.agent_type || rawInput?.parameters?.agent_type || 'llm').toLowerCase(),
    system_prompt:
      rawInput?.system_prompt ||
      rawInput?.parameters?.prompt ||
      rawInput?.parameters?.system_prompt ||
      'Você é um agente especialista subordinado ao JARVIS.',
    provider: (rawInput?.provider || rawInput?.parameters?.provider || 'groq').toLowerCase(),
    model: rawInput?.model || rawInput?.parameters?.model || 'llama-3.3-70b-versatile',
    credential_id:
      rawInput?.credential_id ||
      rawInput?.credentials?.id ||
      rawInput?.credentials?.credential_id ||
      undefined,
    tools: Array.isArray(rawTools) ? rawTools.map((t) => String(t).trim()) : [],
    endpoint_url: rawInput?.endpoint_url || rawInput?.parameters?.endpoint_url || '',
    http_method: (rawInput?.http_method || rawInput?.parameters?.http_method || 'POST').toUpperCase(),
    payload_template: rawInput?.payload_template || rawInput?.parameters?.payload_template || '',
    code_snippet: rawInput?.code_snippet || rawInput?.parameters?.code_snippet || rawInput?.script_code || '',
    response_instruction: rawInput?.response_instruction || rawInput?.parameters?.response_instruction || '',
    temperature: Number(rawInput?.temperature ?? rawInput?.parameters?.temperature ?? 0.3),
    next_agent_slug: rawInput?.next_agent_slug || rawInput?.parameters?.next_agent_slug || null,
    schedule_enabled: Boolean(rawInput?.schedule_enabled ?? rawInput?.parameters?.schedule_enabled),
    cron_expression: rawInput?.cron_expression || rawInput?.parameters?.cron_expression || undefined,
    is_error_trigger: Boolean(rawInput?.is_error_trigger ?? rawInput?.parameters?.is_error_trigger),
    icon: rawInput?.icon || rawInput?.parameters?.icon || '🤖'
  };

  return AutonomousAgentBlueprintSchema.safeParse(normalized);
}
