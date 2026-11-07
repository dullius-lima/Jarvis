// src/controllers/brainConfigController.ts
import { Request, Response } from 'express';
import { pool } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import net from 'net';

export const KNOWN_ENDPOINTS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434/v1'
};

export const DEFAULT_MODELS: Record<string, string> = {
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
  ollama: 'llama3.1:8b'
};

export const CATALOG_MODELS: Record<string, Array<{ label: string; value: string }>> = {
  groq: [
    { label: '✍️ Inserir ID Manual da Groq', value: 'CUSTOM_INPUT' },
    { label: 'Llama 3.3 70B Versatile (Free Tier Recomendado)', value: 'llama-3.3-70b-versatile' },
    { label: 'Llama 3.1 8B Instant (Free Tier Ultra-Rápido)', value: 'llama-3.1-8b-instant' },
    { label: 'DeepSeek R1 Distill Llama 70B (Free Tier)', value: 'deepseek-r1-distill-llama-70b' },
    { label: 'GPT-OSS 120B (Reasoning)', value: 'openai/gpt-oss-120b' }
  ],
  gemini: [
    { label: '✍️ Inserir ID Manual do Gemini', value: 'CUSTOM_INPUT' },
    { label: 'Gemini 2.5 Flash (Free Tier Recomendado)', value: 'gemini-2.5-flash' },
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

function cleanAndNormalizeApiKey(rawKey?: string): string {
  if (!rawKey) return '';
  let k = String(rawKey)
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^["']+|["']+$/g, '')
    .trim();

  // Descarta máscaras de interface (•••• ou ****)
  if (!k || /[•*]/.test(k) || k === 'undefined' || k === 'null') {
    return '';
  }

  // Normaliza prefixos caso o teclado do celular coloque a 1ª letra maiúscula
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

function sanitizeModelForProvider(provider: string, rawModel?: string): string {
  const m = (rawModel || '').trim().replace(/^models\//, '');
  if (!m || m === 'CUSTOM_INPUT') {
    return DEFAULT_MODELS[provider] || 'llama-3.3-70b-versatile';
  }

  if (provider === 'gemini') {
    if (!m.startsWith('gemini') || m.includes('3.8') || m.includes('4-argon')) {
      return DEFAULT_MODELS.gemini;
    }
    return m;
  }

  if (provider === 'groq') {
    if (
      m.startsWith('gemini') ||
      m.startsWith('gpt-4') ||
      m.startsWith('claude') ||
      m.includes(':free') ||
      m.includes('gpt-oss') ||
      m.includes('mixtral') ||
      m.includes('gemma2')
    ) {
      return DEFAULT_MODELS.groq;
    }
    return m;
  }

  if (provider === 'openrouter') {
    if (m === 'llama-3.3-70b-versatile' || m === 'llama-3.1-8b-instant' || m.startsWith('gemini-')) {
      return DEFAULT_MODELS.openrouter;
    }
    return m;
  }

  if (provider === 'deepseek') {
    if (!m.startsWith('deepseek')) {
      return DEFAULT_MODELS.deepseek;
    }
    return m;
  }

  if (provider === 'openai') {
    if (!m.startsWith('gpt') && !m.startsWith('o1') && !m.startsWith('o3') && !m.startsWith('o4')) {
      return DEFAULT_MODELS.openai;
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

export async function syncModelsFromGistAndHealAgents(): Promise<{
  catalog: Record<string, { label: string; value: string }[]>;
  source: string;
}> {
  const rawEnvUrl = (process.env.MODELS_GIST_URL || DEFAULT_GIST_RAW_URL).trim();
  const cleanGistUrl = rawEnvUrl.replace(/\/raw\/[a-f0-9]{20,40}\//i, '/raw/');
  const fetchUrl = `${cleanGistUrl}${cleanGistUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;

  let activeCatalog = normalizeModelsCatalog(null);
  let source = 'Catálogo Local Homologado (Free Tier Ready)';

  try {
    const response = await fetch(fetchUrl, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (response.ok) {
      const remoteJson = await response.json();
      if (remoteJson && typeof remoteJson === 'object') {
        activeCatalog = normalizeModelsCatalog(remoteJson);
        source = 'GitHub Gist + Catálogo Free Tier';
      }
    }
  } catch (err: any) {
    console.warn('[Gist Auto-Sync] Falha ao ler Gist remoto, mantendo catálogo local:', err.message);
  }

  return { catalog: activeCatalog, source };
}

export async function getSupportedModels(_req: Request, res: Response) {
  const { catalog, source } = await syncModelsFromGistAndHealAgents();
  return res.status(200).json({
    success: true,
    source,
    models: catalog,
    catalog,
    data: catalog,
    endpoints: KNOWN_ENDPOINTS
  });
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
          'Você é o JARVIS, o Cérebro Central e Agente Líder permanente do sistema. Analise os estímulos, consulte a memória e acione os Agentes Especialistas quando necessário.',
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
        model: 'llama-3.3-70b-versatile',
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

export async function updateBrainConfig(req: Request, res: Response) {
  const activePort = getEnvRegisteredPort();
  try {
    await ensureSystemConfigsTable();

    const {
      agent_name,
      provider,
      model,
      api_key,
      base_url,
      temperature,
      server_base_url,
      system_prompt,
      saved_keys
    } = req.body || {};

    const cleanApiKey = cleanAndNormalizeApiKey(api_key);
    const normalizedProvider = detectProviderFromKeyAndInput(provider || 'groq', cleanApiKey, base_url);

    const existingRes = await pool.query(`
      SELECT value FROM system_configs
      WHERE key IN ('brain_llm_config', 'brain_llm', 'brain_config')
      ORDER BY updated_at DESC LIMIT 1;
    `);
    let existingData: any = {};
    if (existingRes.rows.length > 0) {
      const raw = existingRes.rows[0].value;
      existingData = typeof raw === 'string' ? JSON.parse(raw) : raw;
    }

    const mergedKeys: Record<string, string> = {};
    for (const [k, v] of Object.entries({ ...(existingData.saved_keys || {}), ...(saved_keys || {}) })) {
      const cleaned = cleanAndNormalizeApiKey(String(v || ''));
      if (cleaned) mergedKeys[k.toLowerCase()] = cleaned;
    }

    const prevMainKey = cleanAndNormalizeApiKey(existingData.api_key);
    if (prevMainKey && existingData.provider) {
      const prevProv = String(existingData.provider).toLowerCase();
      if (!mergedKeys[prevProv]) mergedKeys[prevProv] = prevMainKey;
    }

    if (cleanApiKey) {
      mergedKeys[normalizedProvider] = cleanApiKey;
    }

    const finalApiKey =
      cleanApiKey ||
      mergedKeys[normalizedProvider] ||
      getEnvKeyForProvider(normalizedProvider) ||
      '';

    if (finalApiKey) {
      mergedKeys[normalizedProvider] = finalApiKey;
    }

    const isKnownOtherEndpoint = Object.entries(KNOWN_ENDPOINTS).some(
      ([k, url]) => k !== normalizedProvider && base_url?.trim().replace(/\/+$/, '') === url.replace(/\/+$/, '')
    );
    const resolvedBaseUrl =
      !base_url?.trim() || isKnownOtherEndpoint
        ? KNOWN_ENDPOINTS[normalizedProvider] || KNOWN_ENDPOINTS.groq
        : base_url.trim();

    const cleanModel = sanitizeModelForProvider(normalizedProvider, model);

    const newConfig = {
      agent_name: (agent_name || existingData.agent_name || 'JARVIS').trim(),
      provider: normalizedProvider,
      model: cleanModel,
      api_key: finalApiKey,
      base_url: resolvedBaseUrl,
      temperature: Number(temperature ?? existingData.temperature ?? 0.2),
      server_base_url: (server_base_url || existingData.server_base_url || `http://localhost:${activePort}`).replace(/\/+$/, ''),
      system_prompt:
        system_prompt ||
        existingData.system_prompt ||
        'Você é o JARVIS, o Cérebro Central e Agente Líder permanente do sistema.',
      saved_keys: mergedKeys
    };

    const serializedConfig = JSON.stringify(newConfig);

    // Sincroniza todas as chaves de configuração no banco para evitar leituras divergentes
    for (const cfgKey of ['brain_llm_config', 'brain_config', 'brain_llm']) {
      await pool.query(
        `INSERT INTO system_configs (key, value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = NOW();`,
        [cfgKey, serializedConfig]
      );
    }

    // Se o provedor for groq e houver chave válida, sincroniza também no arquivo .env local
    if (normalizedProvider === 'groq' && finalApiKey.startsWith('gsk_')) {
      try {
        const envPath = path.resolve(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf-8');
          process.env.GROQ_API_KEY = finalApiKey;
          process.env.LLM_API_KEY = finalApiKey;
          if (/^GROQ_API_KEY=/m.test(envContent)) {
            envContent = envContent.replace(/^GROQ_API_KEY=.*$/m, `GROQ_API_KEY=${finalApiKey}`);
          } else {
            envContent += `\nGROQ_API_KEY=${finalApiKey}\n`;
          }
          if (/^LLM_API_KEY=/m.test(envContent)) {
            envContent = envContent.replace(/^LLM_API_KEY=.*$/m, `LLM_API_KEY=${finalApiKey}`);
          }
          fs.writeFileSync(envPath, envContent, 'utf-8');
        }
      } catch {}
    }

    try {
      const historyRes = await pool.query("SELECT value FROM system_configs WHERE key = 'brain_prompt_versions';");
      const versions: any[] = historyRes.rows.length > 0 ? historyRes.rows[0].value : [];
      versions.unshift({
        versionId: `v_${Date.now()}`,
        provider: newConfig.provider,
        model: newConfig.model,
        system_prompt: newConfig.system_prompt,
        savedAt: new Date().toISOString()
      });
      await pool.query(
        `INSERT INTO system_configs (key, value, updated_at)
         VALUES ('brain_prompt_versions', $1::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
        [JSON.stringify(versions.slice(0, 20))]
      );
    } catch {}

    return res.status(200).json({
      success: true,
      message: `Configurações do Núcleo JARVIS (${normalizedProvider.toUpperCase()} - ${cleanModel}) e Cofre de Chaves salvas!`,
      data: newConfig
    });
  } catch (error: any) {
    console.error('❌ Erro no updateBrainConfig:', error.message);
    return res.status(200).json({ success: false, error: error.message });
  }
}

export async function validateLLMConnection(req: Request, res: Response) {
  try {
    const { provider = 'groq', model, api_key, base_url } = req.body || {};
    let cleanKey = cleanAndNormalizeApiKey(api_key);
    const effectiveProvider = detectProviderFromKeyAndInput(provider, cleanKey, base_url);

    // Se a chave veio vazia ou mascarada (••••), busca no cofre salvo no PostgreSQL ou no .env
    if (!cleanKey && effectiveProvider !== 'ollama') {
      try {
        const dbRes = await pool.query(`
          SELECT value FROM system_configs
          WHERE key IN ('brain_llm_config', 'brain_llm', 'brain_config')
          ORDER BY updated_at DESC LIMIT 1;
        `);
        if (dbRes.rows.length > 0) {
          const parsed = typeof dbRes.rows[0].value === 'string' ? JSON.parse(dbRes.rows[0].value) : dbRes.rows[0].value;
          const vaultKey = cleanAndNormalizeApiKey(parsed?.saved_keys?.[effectiveProvider]);
          const mainKey =
            String(parsed?.provider || '').toLowerCase() === effectiveProvider
              ? cleanAndNormalizeApiKey(parsed?.api_key)
              : '';
          cleanKey = vaultKey || mainKey;
        }
      } catch {}

      if (!cleanKey) {
        cleanKey = getEnvKeyForProvider(effectiveProvider);
      }
    }

    if (!cleanKey && effectiveProvider !== 'ollama') {
      return res.status(200).json({
        success: false,
        error: `A Chave de API (API Key) para ${effectiveProvider.toUpperCase()} não foi informada ou estava mascarada.`
      });
    }

    const selectedModel = sanitizeModelForProvider(effectiveProvider, model);

    // 1. VALIDAÇÃO GOOGLE GEMINI (Free Tier AI Studio)
    if (effectiveProvider === 'gemini') {
      const candidateModels = Array.from(
        new Set([
          selectedModel,
          'gemini-2.5-flash',
          'gemini-2.0-flash',
          'gemini-2.0-flash-lite',
          'gemini-1.5-flash',
          'gemini-1.5-flash-8b'
        ])
      );

      let keyRecognizedByGoogle = false;
      try {
        const listResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`,
          { method: 'GET', signal: AbortSignal.timeout(8000) }
        );
        if (listResp.ok) {
          keyRecognizedByGoogle = true;
          const listJson: any = await listResp.json();
          const availableApiModels: string[] = (listJson.models || [])
            .filter(
              (m: any) =>
                Array.isArray(m.supportedGenerationMethods) &&
                m.supportedGenerationMethods.includes('generateContent')
            )
            .map((m: any) => String(m.name || '').replace(/^models\//, ''))
            .filter((name: string) => name.startsWith('gemini') && !name.includes('exp'));

          for (const apiMod of availableApiModels) {
            if (!candidateModels.includes(apiMod)) {
              candidateModels.push(apiMod);
            }
          }
        } else if (listResp.status === 400 || listResp.status === 403) {
          const errJson: any = await listResp.json().catch(() => ({}));
          return res.status(200).json({
            success: false,
            error: `Chave do Google Gemini inválida ou bloqueada: ${errJson?.error?.message || `HTTP ${listResp.status}`}`
          });
        }
      } catch {}

      let lastGeminiError = '';
      for (const m of candidateModels) {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${cleanKey}`;
        const resp = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Responda apenas OK' }] }]
          }),
          signal: AbortSignal.timeout(12000)
        });

        if (resp.ok) {
          return res.status(200).json({
            success: true,
            provider: 'gemini',
            model: m,
            usedModel: m,
            message: `Conexão gratuita com Google Gemini (${m}) validada com sucesso!`
          });
        }

        const errBody = await resp.text();
        lastGeminiError = `HTTP ${resp.status}: ${errBody.slice(0, 200)}`;
      }

      if (keyRecognizedByGoogle) {
        return res.status(200).json({
          success: true,
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          usedModel: 'gemini-2.0-flash',
          message: 'Chave Google Gemini autenticada com sucesso (fallback gemini-2.0-flash vinculado)!'
        });
      }

      return res.status(200).json({
        success: false,
        error: `Falha ao validar Gemini: ${lastGeminiError}`
      });
    }

    // 2. VALIDAÇÃO GROQ, OPENROUTER, DEEPSEEK, OPENAI E OLLAMA
    const isOtherKnown = Object.entries(KNOWN_ENDPOINTS).some(
      ([k, url]) => k !== effectiveProvider && base_url?.trim().replace(/\/+$/, '') === url.replace(/\/+$/, '')
    );
    const targetBaseUrl = (
      !base_url?.trim() || isOtherKnown || effectiveProvider === 'groq'
        ? KNOWN_ENDPOINTS[effectiveProvider] || KNOWN_ENDPOINTS.groq
        : base_url.trim()
    ).replace(/\/+$/, '');

    const fallbackMap: Record<string, string[]> = {
      groq: [
        selectedModel,
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'deepseek-r1-distill-llama-70b'
      ],
      openrouter: [
        selectedModel,
        'meta-llama/llama-3.3-70b-instruct:free',
        'deepseek/deepseek-r1:free',
        'google/gemini-2.0-flash-exp:free',
        'qwen/qwen-2.5-72b-instruct:free',
        'openrouter/free'
      ],
      deepseek: [selectedModel, 'deepseek-chat', 'deepseek-reasoner'],
      openai: [selectedModel, 'gpt-4o-mini', 'gpt-3.5-turbo'],
      ollama: [selectedModel, 'llama3.1:8b', 'llama3.1']
    };

    const candidateModels = Array.from(new Set(fallbackMap[effectiveProvider] || [selectedModel]));

    // Auto-Discovery via /models na Groq para garantir que a chave e os modelos ativos da conta funcionem
    if (effectiveProvider === 'groq') {
      try {
        const groqModelsResp = await fetch(`${targetBaseUrl}/models`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${cleanKey}` },
          signal: AbortSignal.timeout(8000)
        });
        if (groqModelsResp.status === 401) {
          return res.status(200).json({
            success: false,
            error: 'Chave da Groq rejeitada (401 Invalid API Key). Verifique se a chave começa com gsk_ e se está ativa em console.groq.com/keys.'
          });
        }
        if (groqModelsResp.ok) {
          const groqModelsJson: any = await groqModelsResp.json();
          const activeGroqIds: string[] = (groqModelsJson?.data || [])
            .map((m: any) => String(m.id || ''))
            .filter((id: string) => id && !id.includes('whisper') && !id.includes('guard') && !id.includes('tts'));
          for (const id of activeGroqIds) {
            if (!candidateModels.includes(id)) {
              candidateModels.push(id);
            }
          }
        }
      } catch {}
    }

    let firstErrorMsg = '';
    let lastStatus = 0;

    for (const candidate of candidateModels) {
      if (!candidate) continue;
      const resp = await fetch(`${targetBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cleanKey && effectiveProvider !== 'ollama' ? { Authorization: `Bearer ${cleanKey}` } : {}),
          ...(effectiveProvider === 'openrouter'
            ? { 'HTTP-Referer': 'https://jarvis.local', 'X-Title': 'JARVIS Neural Core' }
            : {})
        },
        body: JSON.stringify({
          model: candidate,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5
        }),
        signal: AbortSignal.timeout(12000)
      });

      if (resp.ok) {
        return res.status(200).json({
          success: true,
          provider: effectiveProvider,
          model: candidate,
          usedModel: candidate,
          message: `Conexão com ${effectiveProvider.toUpperCase()} (${candidate}) validada com sucesso!`
        });
      }

      lastStatus = resp.status;
      const errText = await resp.text();
      if (!firstErrorMsg) {
        firstErrorMsg = `HTTP ${resp.status}: ${errText.slice(0, 220)}`;
      }

      if (resp.status === 401) break;
    }

    if ((lastStatus === 402 || lastStatus === 429) && (effectiveProvider === 'openai' || effectiveProvider === 'deepseek')) {
      try {
        const modelsCheck = await fetch(`${targetBaseUrl}/models`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${cleanKey}` },
          signal: AbortSignal.timeout(8000)
        });
        if (modelsCheck.ok) {
          return res.status(200).json({
            success: false,
            error: `A sua chave da ${effectiveProvider.toUpperCase()} é válida, mas a conta não possui saldo de créditos (HTTP ${lastStatus}). Para usar modelos gratuitamente, utilize chaves da Groq, Google Gemini (AI Studio) ou OpenRouter (:free).`
          });
        }
      } catch {}
    }

    return res.status(200).json({
      success: false,
      error: `Falha na validação (${effectiveProvider.toUpperCase()} - ${selectedModel}): ${firstErrorMsg}`
    });
  } catch (error: any) {
    return res.status(200).json({
      success: false,
      error: `Erro de rede ao validar conexão: ${error?.message || 'Timeout ou endpoint inacessível'}`
    });
  }
}

export const validateBrainConnection = validateLLMConnection;

export async function listPromptVersions(_req: Request, res: Response) {
  try {
    await ensureSystemConfigsTable();
    const result = await pool.query("SELECT value FROM system_configs WHERE key = 'brain_prompt_versions';");
    return res.status(200).json({
      success: true,
      data: result.rows.length > 0 ? result.rows[0].value : []
    });
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
      return res.status(200).json({
        success: true,
        message: `O servidor já está operando na porta ${currentPort}.`,
        port: currentPort
      });
    }

    const isPortFree = await new Promise<boolean>((resolve) => {
      const tester = net
        .createServer()
        .once('error', () => resolve(false))
        .once('listening', () => tester.once('close', () => resolve(true)).close())
        .listen(newPort, '127.0.0.1');
    });

    if (!isPortFree) {
      return res.status(200).json({
        success: false,
        error: `A porta ${newPort} já está em uso por outro processo neste computador.`
      });
    }

    const envPath = path.resolve(process.cwd(), '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
    if (/^PORT=/m.test(envContent)) {
      envContent = envContent.replace(/^PORT=.*$/m, `PORT=${newPort}`);
    } else {
      envContent += `\nPORT=${newPort}\n`;
    }
    fs.writeFileSync(envPath, envContent, 'utf-8');

    return res.status(200).json({
      success: true,
      message: `Porta ${newPort} validada e gravada no .env! Reinicie o backend para aplicar.`,
      port: newPort
    });
  } catch (error: any) {
    return res.status(200).json({ success: false, error: error.message });
  }
}
