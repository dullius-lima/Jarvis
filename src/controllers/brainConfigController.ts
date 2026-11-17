// src/controllers/brainConfigController.ts
import { Request, Response } from 'express';
import { pool } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import net from 'net';
import OpenAI from 'openai';
// src/controllers/agentController.ts (secção da rota hacker)
import { Request, Response } from 'express';
import { runHackerAgent, HackerTaskInput } from '../services/agents/hackerAgent.js';

/**
 * Invoca a LLM da Groq de forma direta e sem dependências externas
 */
async function callGroqDirectly(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY || '';
  if (!apiKey) {
    return 'Chave GROQ_API_KEY não configurada no ficheiro .env.';
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 1024
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      return `Erro na API da Groq (${res.status}): ${errText}`;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || 'Sem resposta da LLM.';
  } catch (err: any) {
    return `Falha de rede ao consultar a Groq: ${err.message}`;
  }
}

/**
 * POST /api/v1/agents/hacker/audit
 */
export async function runHackerAuditController(req: Request, res: Response) {
  try {
    const input: HackerTaskInput = req.body || { mode: 'self_healing_debug' };
    const resultado = await runHackerAgent(input, callGroqDirectly);
    return res.status(200).json({ success: true, data: resultado });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

export const KNOWN_ENDPOINTS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434/v1'
};

export const DEFAULT_MODELS: Record<string, string> = {
  groq: 'openai/gpt-oss-20b',
  gemini: 'gemini-3.8-flash',
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
  ollama: 'llama3.1:8b'
};

export const CATALOG_MODELS: Record<string, Array<{ label: string; value: string }>> = {
  groq: [
    { label: '✍️ Inserir ID Manual da Groq', value: 'CUSTOM_INPUT' },
    { label: 'Llama 3.3 70B Versatile (Free Tier Recomendado)', value: 'openai/gpt-oss-20b' },
    { label: 'Llama 3.1 8B Instant (Free Tier Ultra-Rápido)', value: 'llama-3.1-8b-instant' },
    { label: 'GPT-OSS 120B (Reasoning)', value: 'openai/gpt-oss-120b' }
  ],
  gemini: [
    { label: '✍️ Inserir ID Manual do Gemini', value: 'CUSTOM_INPUT' },
    { label: 'Gemini 2.5 Flash (Free Tier Recomendado)', value: 'gemini-3.8-flash' },
    { label: 'Gemini 2.0 Flash (Free Tier)', value: 'gemini-2.0-flash' },
    { label: 'Gemini 2.0 Flash-Lite (Free Tier)', value: 'gemini-2.0-flash-lite' },
    { label: 'Gemini 1.5 Flash (Free Tier Estável)', value: 'gemini-1.5-flash' },
    { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' }
  ],
  openrouter: [
    { label: '✍️ Inserir ID Manual do OpenRouter', value: 'CUSTOM_INPUT' },
    { label: 'Llama 3.3 70B Instruct (100% Gratuito :free)', value: 'meta-llama/llama-3.3-70b-instruct:free' },
    { label: 'DeepSeek R1 (100% Gratuito :free)', value: 'deepseek/deepseek-r1:free' },
    { label: 'DeepSeek V3 Chat (100% Gratuito :free)', value: 'deepseek/deepseek-chat:free' },
    { label: 'Google Gemini 2.0 Flash (100% Gratuito :free)', value: 'google/gemini-2.0-flash-exp:free' },
    { label: 'Qwen 2.5 72B Instruct (100% Gratuito :free)', value: 'qwen/qwen-2.5-72b-instruct:free' },
    { label: 'Auto-Router Gratuito OpenRouter', value: 'openrouter/free' },
    { label: 'Anthropic Claude 3.5 Sonnet (Pago)', value: 'anthropic/claude-3.5-sonnet' }
  ],
  openai: [
    { label: '✍️ Inserir ID Manual da OpenAI', value: 'CUSTOM_INPUT' },
    { label: 'GPT-4o Mini (Mais Econômico)', value: 'gpt-4o-mini' },
    { label: 'GPT-4o (Completo)', value: 'gpt-4o' },
    { label: 'o3-mini (Reasoning)', value: 'o3-mini' }
  ],
  deepseek: [
    { label: '✍️ Inserir ID Manual da DeepSeek', value: 'CUSTOM_INPUT' },
    { label: 'DeepSeek V3 (Chat)', value: 'deepseek-chat' },
    { label: 'DeepSeek R1 (Reasoner)', value: 'deepseek-reasoner' }
  ],
  ollama: [
    { label: '✍️ Inserir ID Manual do Ollama', value: 'CUSTOM_INPUT' },
    { label: 'Llama 3.1 8B (Local)', value: 'llama3.1:8b' },
    { label: 'Qwen 2.5 Coder (Local)', value: 'qwen2.5-coder' },
    { label: 'Mistral 7B (Local)', value: 'mistral' }
  ]
};

const DEFAULT_GIST_RAW_URL =
  process.env.MODELS_GIST_RAW_URL ||
  process.env.MODELS_GIST_URL ||
  'https://gist.githubusercontent.com/dullius-lima/f672db978789103941a45d2968e386e5/raw/models.json';

export function getEnvRegisteredPort(): number {
  const envPort = Number(process.env.PORT);
  return !isNaN(envPort) && envPort > 0 ? envPort : 3333;
}

async function ensureSystemConfigsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_configs (
      key VARCHAR(100) PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Higieniza a chave: remove resíduos de máscara ('•' e '*'), espaços invisíveis
 * e normaliza prefixos colocados com maiúsculas por teclados mobile.
 */
function cleanAndNormalizeApiKey(rawKey?: any): string {
  if (!rawKey) return '';
  let k = String(rawKey)
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^["']+|["']+$/g, '')
    .replace(/[•*]/g, '') // Remove caracteres de máscara colados por acidente
    .trim();

  if (!k || k === 'undefined' || k === 'null' || k.length < 5) {
    return '';
  }

  // Normalização de prefixos mobile
  if (/^gsk_/i.test(k)) k = 'gsk_' + k.slice(4);
  else if (/^aiza/i.test(k)) k = 'AIza' + k.slice(4);
  else if (/^sk-or-/i.test(k)) k = 'sk-or-' + k.slice(6);

  return k;
}

function getEnvKeyForProvider(provider: string): string {
  const p = (provider || 'groq').toLowerCase().trim();
  if (p === 'groq') return cleanAndNormalizeApiKey(process.env.GROQ_API_KEY || process.env.LLM_API_KEY);
  if (p === 'gemini') return cleanAndNormalizeApiKey(process.env.GEMINI_API_KEY || process.env.LLM_API_KEY);
  if (p === 'openrouter') return cleanAndNormalizeApiKey(process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY);
  if (p === 'deepseek') return cleanAndNormalizeApiKey(process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY);
  if (p === 'openai') return cleanAndNormalizeApiKey(process.env.OPENAI_API_KEY || process.env.LLM_API_KEY);
  return '';
}

function detectProviderFromKeyAndInput(rawProvider: string, apiKey: string, baseUrl?: string): string {
  const cleanKey = cleanAndNormalizeApiKey(apiKey);
  const cleanUrl = (baseUrl || '').toLowerCase().trim();

  if (cleanKey.startsWith('gsk_')) return 'groq';
  if (cleanKey.startsWith('AIza')) return 'gemini';
  if (cleanKey.startsWith('sk-or-')) return 'openrouter';

  if (rawProvider && rawProvider.trim()) {
    return rawProvider.toLowerCase().trim();
  }

  if (cleanUrl.includes('openrouter.ai')) return 'openrouter';
  if (cleanUrl.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (cleanUrl.includes('api.groq.com')) return 'groq';
  if (cleanUrl.includes('api.deepseek.com')) return 'deepseek';

  return 'groq';
}

/**
 * Valida o modelo sem bloquear modelos homologados válidos (como openai/gpt-oss-120b na Groq)
 */
function sanitizeModelForProvider(provider: string, rawModel?: string): string {
  const m = (rawModel || '').trim().replace(/^models\//, '');
  if (!m || m === 'CUSTOM_INPUT') {
    return DEFAULT_MODELS[provider] || 'openai/gpt-oss-20b';
  }

  if (provider === 'gemini') {
    if (m.includes('3.8') || m.includes('4-argon')) {
      return DEFAULT_MODELS.gemini;
    }
    return m;
  }

  if (provider === 'groq') {
    // Permite explicitamente gpt-oss-120b, llama, deepseek-r1 e modelos homologados da Groq
    if (
      m.startsWith('gemini') ||
      m.startsWith('claude') ||
      m.includes(':free') ||
      m.includes('mixtral') ||
      m.includes('gemma2')
    ) {
      return DEFAULT_MODELS.groq;
    }
    return m;
  }

  return m;
}

function normalizeModelsCatalog(rawCatalog: any): Record<string, Array<{ label: string; value: string }>> {
  const merged: Record<string, Array<{ label: string; value: string }>> = {};
  for (const [k, v] of Object.entries(CATALOG_MODELS)) {
    merged[k] = [...v];
  }

  if (!rawCatalog || typeof rawCatalog !== 'object') return merged;

  for (const [provider, list] of Object.entries(rawCatalog)) {
    if (Array.isArray(list)) {
      const provKey = provider.toLowerCase();
      const existingList = merged[provKey] || [
        { label: `✍️ Inserir ID Manual (${provider.toUpperCase()})`, value: 'CUSTOM_INPUT' }
      ];
      const existingValues = new Set(existingList.map((item) => item.value));

      for (const item of list) {
        if (!item || typeof item !== 'object' || !item.value) continue;
        const cleanVal = String(item.value).replace(/^models\//, '').trim();
        if (cleanVal === 'gemini-3.8-flash' || cleanVal === 'gemini-4-argon') continue;

        if (!existingValues.has(cleanVal)) {
          existingList.push({
            label: String(item.label || cleanVal),
            value: cleanVal
          });
          existingValues.add(cleanVal);
        }
      }
      merged[provKey] = existingList;
    }
  }
  return merged;
}

/**
 * Atualiza o arquivo .env em disco para garantir sincronização contra reinícios do PM2
 */
function syncKeyToEnvFile(provider: string, apiKey: string, model: string, baseUrl: string) {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath) || !apiKey) return;
    let envContent = fs.readFileSync(envPath, 'utf8');

    const upsertEnvVar = (key: string, val: string) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${val}`);
      } else {
        envContent += `\n${key}=${val}`;
      }
    };

    upsertEnvVar('LLM_PROVIDER', provider);
    upsertEnvVar('LLM_MODEL', model);
    upsertEnvVar('LLM_BASE_URL', baseUrl);
    upsertEnvVar('LLM_API_KEY', apiKey);

    const providerEnvMap: Record<string, string> = {
      groq: 'GROQ_API_KEY',
      openai: 'OPENAI_API_KEY',
      gemini: 'GEMINI_API_KEY',
      deepseek: 'DEEPSEEK_API_KEY',
      openrouter: 'OPENROUTER_API_KEY'
    };

    const envVarName = providerEnvMap[provider];
    if (envVarName) {
      upsertEnvVar(envVarName, apiKey);
      process.env[envVarName] = apiKey;
    }
    process.env.LLM_API_KEY = apiKey;
    process.env.LLM_PROVIDER = provider;
    process.env.LLM_MODEL = model;

    fs.writeFileSync(envPath, envContent, 'utf8');
  } catch (err: any) {
    console.warn('⚠️ [BrainConfig] Aviso ao sincronizar .env:', err.message);
  }
}

export async function syncModelsFromGistAndHealAgents(): Promise<{
  catalog: Record<string, { label: string; value: string }[]>;
  source: string;
}> {
  return { updated: 0, success: true } as any;
}

export async function getSupportedModels(_req: Request, res: Response) {
  const GIST_URL = 'https://gist.githubusercontent.com/dullius-lima/f672db978789103941a45d2968e386e5/raw/models.json';
  const fallbackCatalog: Record<string, { label: string; value: string }[]> = {
    groq: [
      { label: '✍️ Inserir ID Manual da Groq', value: 'CUSTOM_INPUT' },
      { label: 'GPT-OSS 120B (Ativo na Organização)', value: 'openai/gpt-oss-120b' },
      { label: 'Qwen 3.8 27B', value: 'qwen/qwen3.8-27b' },
      { label: 'GPT-OSS 20B (Ultra-Económico)', value: 'openai/gpt-oss-20b' },
      { label: 'Llama 3.3 70B Versatile', value: 'openai/gpt-oss-20b' }
    ],
    gemini: [
      { label: '✍️ Inserir ID Manual do Gemini', value: 'CUSTOM_INPUT' },
      { label: 'Gemini 3.8 Flash (Oficial Ativo)', value: 'gemini-3.8-flash' },
      { label: 'Gemini 3.8 Pro', value: 'gemini-3.8-pro' }
    ],
    openai: [
      { label: '✍️ Inserir ID Manual da OpenAI', value: 'CUSTOM_INPUT' },
      { label: 'GPT-4o Mini (Económico)', value: 'gpt-4o-mini' },
      { label: 'GPT-4o (Completo)', value: 'gpt-4o' }
    ],
    deepseek: [
      { label: '✍️ Inserir ID Manual da DeepSeek', value: 'CUSTOM_INPUT' },
      { label: 'DeepSeek V3 (Chat)', value: 'deepseek-chat' },
      { label: 'DeepSeek R1 (Reasoner)', value: 'deepseek-reasoner' }
    ],
    openrouter: [
      { label: '✍️ Inserir ID Manual do OpenRouter', value: 'CUSTOM_INPUT' },
      { label: 'DeepSeek Chat (Económico)', value: 'deepseek/deepseek-chat' },
      { label: 'Claude 3.5 Sonnet', value: 'anthropic/claude-3.5-sonnet' }
    ],
    ollama: [
      { label: '✍️ Inserir ID Manual Local (Ollama)', value: 'CUSTOM_INPUT' },
      { label: 'Llama 3.1 8B (Offline)', value: 'llama3.1:8b' }
    ]
  };

  try {
    const resp = await fetch(`${GIST_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(6000)
    });
    if (resp.ok) {
      const remote: any = await resp.json();
      if (remote && typeof remote === 'object') {
        const merged: Record<string, { label: string; value: string }[]> = { ...fallbackCatalog };
        for (const [prov, list] of Object.entries(remote)) {
          if (!Array.isArray(list)) continue;
          const key = prov.toLowerCase().trim();
          const cleaned = list
            .filter((item: any) => item && item.value)
            .map((item: any) => ({
              label: String(item.label || item.value),
              value: String(item.value).replace('gemini-2.5-flash', 'gemini-3.8-flash')
            }));
          let finalList = cleaned;
          if (key === 'groq') {
            const blocked = new Set(['openai/gpt-oss-20b', 'llama-3.1-8b-instant', 'qwen/qwen3.6-27b', 'mixtral-8x7b-32768', 'gemma2-9b-it']);
            finalList = cleaned.filter((m) => !blocked.has(m.value));
            for (const reqModel of fallbackCatalog.groq) {
              if (!finalList.some((m) => m.value === reqModel.value)) {
                finalList.push(reqModel);
              }
            }
          }
          if (!finalList.some((m) => m.value === 'CUSTOM_INPUT')) {
            finalList.unshift({ label: `✍️ Inserir ID Manual (${key.toUpperCase()})`, value: 'CUSTOM_INPUT' });
          }
          merged[key] = finalList;
        }
        return res.status(200).json({ success: true, catalog: merged, source: 'github-gist-live' });
      }
    }
  } catch {
    // Contingência offline mantém o catálogo local
  }

  return res.status(200).json({ success: true, catalog: fallbackCatalog, source: 'local-fallback' });
}

export const getHomologatedModels = getSupportedModels;

export async function getBrainConfig(_req: Request, res: Response) {
  const activePort = getEnvRegisteredPort();
  try {
    await ensureSystemConfigsTable();
    const result = await pool.query(`
      SELECT value FROM system_configs
      WHERE key IN ('brain_llm_config', 'brain_llm', 'brain_config')
      ORDER BY updated_at DESC LIMIT 1;
    `);

    if (result.rows.length === 0) {
      const defaultProvider = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
      const envKey = getEnvKeyForProvider(defaultProvider);
      const fallbackConfig = {
        agent_name: 'JARVIS',
        provider: defaultProvider,
        model: sanitizeModelForProvider(defaultProvider, process.env.LLM_MODEL),
        api_key: envKey,
        base_url: process.env.LLM_BASE_URL || KNOWN_ENDPOINTS[defaultProvider] || KNOWN_ENDPOINTS.groq,
        temperature: 0.2,
        server_base_url: process.env.SERVER_BASE_URL || `http://localhost:${activePort}`,
        system_prompt:
          'Você é o JARVIS, o Cérebro Central e Agente Líder permanente do sistema.',
        saved_keys: envKey ? { [defaultProvider]: envKey } : {}
      };

      await pool.query(
        `INSERT INTO system_configs (key, value) VALUES ('brain_llm_config', $1) ON CONFLICT (key) DO NOTHING;`,
        [JSON.stringify(fallbackConfig)]
      );

      return res.status(200).json({ success: true, data: fallbackConfig });
    }

    const raw = result.rows[0].value;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const rawSavedKeys = parsed.saved_keys && typeof parsed.saved_keys === 'object' ? parsed.saved_keys : {};
    const savedKeys: Record<string, string> = {};

    for (const [k, v] of Object.entries(rawSavedKeys)) {
      const cleaned = cleanAndNormalizeApiKey(String(v || ''));
      if (cleaned) savedKeys[k.toLowerCase()] = cleaned;
    }

    const cleanActiveKey = cleanAndNormalizeApiKey(parsed.api_key);
    const provider = detectProviderFromKeyAndInput(parsed.provider || 'groq', cleanActiveKey, parsed.base_url);

    if (cleanActiveKey && !savedKeys[provider]) {
      savedKeys[provider] = cleanActiveKey;
    }

    const effectiveKey =
      savedKeys[provider] ||
      cleanActiveKey ||
      getEnvKeyForProvider(provider) ||
      '';

    if (effectiveKey) {
      savedKeys[provider] = effectiveKey;
    }

    return res.status(200).json({
      success: true,
      data: {
        agent_name: parsed.agent_name || parsed.name || 'JARVIS',
        provider,
        model: sanitizeModelForProvider(provider, parsed.model),
        api_key: effectiveKey,
        base_url: KNOWN_ENDPOINTS[provider] || parsed.base_url || KNOWN_ENDPOINTS.groq,
        temperature: Number(parsed.temperature ?? 0.2),
        server_base_url: parsed.server_base_url || `http://localhost:${activePort}`,
        system_prompt:
          parsed.system_prompt ||
          'Você é o JARVIS, o Cérebro Central e Agente Líder permanente do sistema.',
        saved_keys: savedKeys
      }
    });
  } catch (error: any) {
    console.error('❌ Erro no getBrainConfig:', error.message);
    return res.status(200).json({
      success: true,
      data: {
        agent_name: 'JARVIS',
        provider: 'groq',
        model: 'openai/gpt-oss-20b',
        api_key: getEnvKeyForProvider('groq'),
        base_url: KNOWN_ENDPOINTS.groq,
        temperature: 0.2,
        server_base_url: `http://localhost:${activePort}`,
        system_prompt: 'Você é o JARVIS, o Cérebro Central e Agente Líder permanente do sistema.',
        saved_keys: {}
      }
    });
  }
}

// Em src/controllers/brainConfigController.ts

export async function updateBrainConfig(req: Request, res: Response) {
  try {
    const body = req.body || {};
    const prevRes = await pool.query("SELECT value FROM system_configs WHERE key = 'brain_llm_config' LIMIT 1;");
    const prevCfg = prevRes.rows[0]?.value || {};
    const endpoints: Record<string, string> = {
      groq: 'https://api.groq.com/openai/v1',
      gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      openai: 'https://api.openai.com/v1',
      deepseek: 'https://api.deepseek.com/v1',
      openrouter: 'https://openrouter.ai/api/v1',
      ollama: 'http://127.0.0.1:11434/v1'
    };
    const provider = String(body.provider || prevCfg.provider || 'groq').toLowerCase().trim();
    const chosenModel = sanitizeModelForProvider(provider, String(body.model || prevCfg.model || '').trim());
    if (!chosenModel || chosenModel === 'CUSTOM_INPUT') {
      return res.status(400).json({ success: false, error: 'Informe um ID de modelo válido antes de salvar.' });
    }
    const savedKeys: Record<string, string> = { ...(prevCfg.saved_keys || {}) };
    let effectiveKey =
      cleanAndNormalizeApiKey(savedKeys[provider]) ||
      (prevCfg.provider === provider ? cleanAndNormalizeApiKey(prevCfg.api_key) : '') ||
      getEnvKeyForProvider(provider);

    const rawKey = cleanAndNormalizeApiKey(body.api_key);
    if (rawKey) {
      effectiveKey = rawKey;
      savedKeys[provider] = effectiveKey;
      syncKeyToEnvFile(provider, effectiveKey, chosenModel, endpoints[provider] || '');
    }
    const rawUrl = String(body.base_url || '').trim();
    const wrongUrl =
      (provider === 'deepseek' && !rawUrl.includes('deepseek.com')) ||
      (provider === 'groq' && !rawUrl.includes('groq.com')) ||
      (provider === 'openai' && !rawUrl.includes('openai.com')) ||
      (provider === 'openrouter' && !rawUrl.includes('openrouter.ai')) ||
      (provider === 'gemini' && !rawUrl.includes('googleapis.com'));
    const resolvedBaseUrl = (!rawUrl || wrongUrl ? endpoints[provider] : rawUrl).replace(/\/+$/, '');

    const newConfig = {
      ...prevCfg,
      agent_name: body.agent_name || prevCfg.agent_name || 'JARVIS',
      provider,
      model: chosenModel,
      api_key: effectiveKey,
      base_url: resolvedBaseUrl,
      temperature: body.temperature ?? prevCfg.temperature ?? 0.2,
      system_prompt: body.system_prompt ?? prevCfg.system_prompt,
      saved_keys: savedKeys
    };
    await pool.query(
      `INSERT INTO system_configs (key, value, updated_at) VALUES ('brain_llm_config', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
      [JSON.stringify(newConfig)]
    );
    return res.status(200).json({ success: true, message: `Modelo [${chosenModel}] (${provider.toUpperCase()}) salvo!`, data: newConfig });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function validateLLMConnection(req: Request, res: Response) {
  try {
    const { provider = 'groq', model, api_key, base_url } = req.body || {};
    const normalizedProvider = String(provider).toLowerCase().trim();
    const targetModel = sanitizeModelForProvider(normalizedProvider, String(model || '').trim());
    if (!targetModel || targetModel === 'CUSTOM_INPUT') {
      return res.status(200).json({ success: false, error: 'Informe o ID do modelo que deseja testar.' });
    }
    const endpoints: Record<string, string> = {
      groq: 'https://api.groq.com/openai/v1',
      gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      openai: 'https://api.openai.com/v1',
      deepseek: 'https://api.deepseek.com/v1',
      openrouter: 'https://openrouter.ai/api/v1',
      ollama: 'http://127.0.0.1:11434/v1'
    };
    let apiKey = cleanAndNormalizeApiKey(api_key);
    if (!apiKey) {
      const dbRes = await pool.query("SELECT value FROM system_configs WHERE key = 'brain_llm_config' LIMIT 1;");
      const cfg = dbRes.rows[0]?.value || {};
      apiKey =
        cleanAndNormalizeApiKey(cfg?.saved_keys?.[normalizedProvider]) ||
        (cfg?.provider === normalizedProvider ? cleanAndNormalizeApiKey(cfg?.api_key) : '') ||
        getEnvKeyForProvider(normalizedProvider);
    }
    if (!apiKey && normalizedProvider !== 'ollama') {
      return res.status(200).json({ success: false, error: `Chave de API não informada para [${normalizedProvider.toUpperCase()}].` });
    }
    const rawUrl = String(base_url || '').trim();
    const wrongUrl =
      (normalizedProvider === 'deepseek' && !rawUrl.includes('deepseek.com')) ||
      (normalizedProvider === 'groq' && !rawUrl.includes('groq.com')) ||
      (normalizedProvider === 'openai' && !rawUrl.includes('openai.com')) ||
      (normalizedProvider === 'openrouter' && !rawUrl.includes('openrouter.ai')) ||
      (normalizedProvider === 'gemini' && !rawUrl.includes('googleapis.com'));
    const baseURL = (!rawUrl || wrongUrl ? endpoints[normalizedProvider] : rawUrl).replace(/\/+$/, '');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey && normalizedProvider !== 'ollama') headers['Authorization'] = `Bearer ${apiKey}`;

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: targetModel, messages: [{ role: 'user', content: 'Responda apenas: OK' }], max_tokens: 10, temperature: 0.1 }),
      signal: AbortSignal.timeout(15000)
    });
    const data: any = await response.json();
    if (!response.ok) {
      const hint = response.status === 402 && normalizedProvider === 'deepseek'
        ? ' (API oficial DeepSeek exige saldo. Para grátis use OpenRouter com deepseek/deepseek-chat:free).'
        : '';
      return res.status(200).json({ success: false, error: `[${normalizedProvider.toUpperCase()} (${response.status})]: ${data?.error?.message || JSON.stringify(data)}${hint}` });
    }
    return res.status(200).json({
      success: true,
      message: `🟢 Conexão validada! ${normalizedProvider.toUpperCase()} / [${targetModel}] respondeu: "${data?.choices?.[0]?.message?.content?.trim() || 'OK'}"`,
      provider: normalizedProvider,
      model: targetModel
    });
  } catch (error: any) {
    return res.status(200).json({ success: false, error: `Falha na requisição: ${error.message}` });
  }
}

export const validateBrainConnection = validateLLMConnection;

export async function listPromptVersions(_req: Request, res: Response) {
  try {
    await ensureSystemConfigsTable();
    const result = await pool.query("SELECT value FROM system_configs WHERE key = 'brain_prompt_versions';");
    return res.status(200).json({ success: true, data: result.rows.length > 0 ? result.rows[0].value : [] });
  } catch (error: any) {
    return res.status(200).json({ success: true, data: [], error: error.message });
  }
}

export async function manageServerPortAndEnv(req: Request, res: Response) {
  try {
    const newPort = Number(req.body?.port);
    if (!newPort || newPort < 1024 || newPort > 65535) {
      return res.status(200).json({ success: false, error: 'Informe uma porta TCP válida entre 1024 e 65535.' });
    }
    const currentPort = getEnvRegisteredPort();
    if (newPort === currentPort) {
      return res.status(200).json({ success: true, message: `O servidor já está operando na porta ${currentPort}.`, port: currentPort });
    }
    const isPortFree = await new Promise<boolean>((resolve) => {
      const tester = net.createServer().once('error', () => resolve(false)).once('listening', () => tester.once('close', () => resolve(true)).close()).listen(newPort, '127.0.0.1');
    });
    if (!isPortFree) return res.status(200).json({ success: false, error: `A porta ${newPort} já está em uso.` });
    const envPath = path.resolve(process.cwd(), '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
    envContent = /^PORT=/m.test(envContent) ? envContent.replace(/^PORT=.*$/m, `PORT=${newPort}`) : `${envContent}\nPORT=${newPort}\n`;
    fs.writeFileSync(envPath, envContent, 'utf-8');
    return res.status(200).json({ success: true, message: `Porta ${newPort} gravada no .env!`, port: newPort });
  } catch (error: any) {
    return res.status(200).json({ success: false, error: error.message });
  }
}
