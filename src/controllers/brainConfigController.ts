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
    { label: 'Llama 3.3 70B Versatile (Recomendado / Tool Calling)', value: 'llama-3.3-70b-versatile' },
    { label: 'GPT-OSS 120B (Reasoning)', value: 'openai/gpt-oss-120b' },
    { label: 'DeepSeek R1 Distill Llama 70B', value: 'deepseek-r1-distill-llama-70b' },
    { label: 'Mixtral 8x7B 32k', value: 'mixtral-8x7b-32768' }
  ],
  gemini: [
    { label: '✍️ Inserir ID Manual do Gemini', value: 'CUSTOM_INPUT' },
    { label: 'Gemini 2.5 Flash (Free Tier Recomendado)', value: 'gemini-2.5-flash' },
    { label: 'Gemini 2.0 Flash (Free Tier)', value: 'gemini-2.0-flash' },
    { label: 'Gemini 1.5 Flash (Free Tier Estável)', value: 'gemini-1.5-flash' },
    { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' }
  ],
  openrouter: [
    { label: '✍️ Inserir ID Manual do OpenRouter', value: 'CUSTOM_INPUT' },
    { label: 'Llama 3.3 70B Instruct (Gratuito :free)', value: 'meta-llama/llama-3.3-70b-instruct:free' },
    { label: 'DeepSeek R1 (Gratuito :free)', value: 'deepseek/deepseek-r1:free' },
    { label: 'DeepSeek V3 Chat (Gratuito :free)', value: 'deepseek/deepseek-chat:free' },
    { label: 'Google Gemini 2.0 Flash (Gratuito :free)', value: 'google/gemini-2.0-flash-exp:free' },
    { label: 'Anthropic Claude 3.5 Sonnet', value: 'anthropic/claude-3.5-sonnet' }
  ],
  openai: [
    { label: '✍️ Inserir ID Manual da OpenAI', value: 'CUSTOM_INPUT' },
    { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
    { label: 'GPT-4o', value: 'gpt-4o' },
    { label: 'o3-mini', value: 'o3-mini' }
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

let cachedGistModels: Record<string, Array<{ label: string; value: string }>> | null = null;
let lastGistSync: string | null = null;

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

function isMaskedOrInvalidKey(rawKey?: string): boolean {
  if (!rawKey) return true;
  const k = rawKey.trim();
  if (!k || k.length < 6) return true;
  if (/^[•*]+$/.test(k) || k.includes('••••') || k.includes('****')) return true;
  return false;
}

export function detectProviderFromKeyAndInput(rawProvider: string, apiKey: string, baseUrl?: string): string {
  const cleanKey = isMaskedOrInvalidKey(apiKey) ? '' : (apiKey || '').trim();
  const prov = (rawProvider || '').toLowerCase().trim();

  // 1. O prefixo real da chave sempre tem prioridade absoluta
  if (cleanKey.startsWith('gsk_')) return 'groq';
  if (cleanKey.startsWith('AIza')) return 'gemini';
  if (cleanKey.startsWith('sk-or-')) return 'openrouter';
  if (cleanKey.startsWith('sk-')) {
    if (prov === 'deepseek') return 'deepseek';
    return 'openai';
  }

  // 2. Se não houver chave nova digitada, respeita o provedor selecionado no dropdown
  if (prov && KNOWN_ENDPOINTS[prov]) {
    return prov;
  }

  const cleanUrl = (baseUrl || '').toLowerCase().trim();
  if (cleanUrl.includes('openrouter.ai')) return 'openrouter';
  if (cleanUrl.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (cleanUrl.includes('api.groq.com')) return 'groq';
  if (cleanUrl.includes('api.deepseek.com')) return 'deepseek';

  return prov || 'groq';
}

export function sanitizeModelForProvider(provider: string, rawModel?: string): string {
  const m = (rawModel || '').trim().replace(/^models\//, '');
  if (!m || m === 'CUSTOM_INPUT' || m === 'llama-3.1-8b-instant') {
    return DEFAULT_MODELS[provider] || 'llama-3.3-70b-versatile';
  }

  if (provider === 'gemini') {
    if (!m.startsWith('gemini') || m.includes('3.8') || m.includes('4-argon')) {
      return DEFAULT_MODELS.gemini;
    }
    return m;
  }

  if (provider === 'groq') {
    if (m.startsWith('gemini') || m.startsWith('gpt-4') || m.startsWith('claude') || m.includes(':free')) {
      return DEFAULT_MODELS.groq;
    }
    return m;
  }

  if (provider === 'openrouter') {
    if (m === 'llama-3.3-70b-versatile' || m.startsWith('gemini-')) {
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
    if ((!m.startsWith('gpt') && !m.startsWith('o1') && !m.startsWith('o3') && !m.startsWith('o4')) || m === 'openai/gpt-oss-120b') {
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
      const normalizedList: Array<{ label: string; value: string }> = [
        { label: `✍️ Inserir ID Manual (${provKey.toUpperCase()})`, value: 'CUSTOM_INPUT' } ]; const seenValues = new Set<string>(['CUSTOM_INPUT']);  for (const item of list) { if (!item \vert{}\vert{} typeof item !== 'object' \vert{}\vert{} !item.value) continue; const cleanVal = String(item.value).replace(/^models\//, '').trim(); if (cleanVal === 'gemini-3.8-flash' \vert{}\vert{} cleanVal === 'gemini-4-argon') continue;  if (!seenValues.has(cleanVal)) { normalizedList.push({ label: String(item.label \vert{}\vert{} cleanVal), value: cleanVal }); seenValues.add(cleanVal); } }  for (const fallbackItem of CATALOG_MODELS[provKey] \vert{}\vert{} []) { if (!seenValues.has(fallbackItem.value)) { normalizedList.push(fallbackItem); seenValues.add(fallbackItem.value); } }  merged[provKey] = normalizedList; } } return merged; }  export async function syncModelsFromGistAndHealAgents(forceRefresh = false): Promise<{ catalog: Record<string, { label: string; value: string }[]>; source: string; syncedAt: string; gistUrl: string; }> { const rawEnvUrl = (process.env.MODELS_GIST_RAW_URL \vert{}\vert{} process.env.MODELS_GIST_URL \vert{}\vert{} DEFAULT_GIST_RAW_URL).trim(); const cleanGistUrl = rawEnvUrl.replace(/\/raw\/[a-f0-9]{20,40}\//i, '/raw/');  if (cachedGistModels && !forceRefresh && lastGistSync) { return { catalog: cachedGistModels, source: 'github_gist', syncedAt: lastGistSync, gistUrl: cleanGistUrl }; }  const fetchUrl = `${cleanGistUrl}${cleanGistUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;

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
        cachedGistModels = normalizeModelsCatalog(remoteJson);
        lastGistSync = new Date().toISOString();
        return {
          catalog: cachedGistModels,
          source: 'github_gist',
          syncedAt: lastGistSync,
          gistUrl: cleanGistUrl
        };
      }
    }
  } catch (err: any) {
    console.warn('⚠️ [GitHub Gist Models] Usando fallback local:', err?.message);
  }

  const fallbackCatalog = normalizeModelsCatalog(null);
  return {
    catalog: fallbackCatalog,
    source: 'local_fallback',
    syncedAt: new Date().toISOString(),
    gistUrl: cleanGistUrl
  };
}

export async function getSupportedModels(req: Request, res: Response) {
  const forceRefresh = req.query.refresh === 'true';
  const { catalog, source, syncedAt, gistUrl } = await syncModelsFromGistAndHealAgents(forceRefresh);
  return res.status(200).json({
    success: true,
    source,
    gistUrl,
    syncedAt,
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
      WHERE key = 'brain_llm_config'
      LIMIT 1;
    `);

    if (result.rows.length === 0) {
      const defaultProvider = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
      const envKey = process.env.GROQ_API_KEY || process.env.LLM_API_KEY || '';
      const fallbackConfig = {
        agent_name: 'JARVIS',
        provider: defaultProvider,
        model: sanitizeModelForProvider(defaultProvider, process.env.LLM_MODEL),
        api_key: envKey,
        base_url: KNOWN_ENDPOINTS[defaultProvider] || KNOWN_ENDPOINTS.groq,
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
    const savedKeys: Record<string, string> =
      parsed.saved_keys && typeof parsed.saved_keys === 'object' ? { ...parsed.saved_keys } : {};

    const provider = (parsed.provider || 'groq').toLowerCase().trim();
    const rawDirectKey = isMaskedOrInvalidKey(parsed.api_key) ? '' : String(parsed.api_key).trim();

    if (rawDirectKey) {
      const keyOwner = detectProviderFromKeyAndInput(provider, rawDirectKey);
      savedKeys[keyOwner] = rawDirectKey;
    }

    let resolvedKey = savedKeys[provider] || rawDirectKey || '';
    if (provider === 'groq' && (!resolvedKey || !resolvedKey.startsWith('gsk_'))) {
      const envGroq = process.env.GROQ_API_KEY || (process.env.LLM_API_KEY?.startsWith('gsk_') ? process.env.LLM_API_KEY : '');
      if (envGroq) {
        resolvedKey = envGroq;
        savedKeys.groq = envGroq;
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        agent_name: parsed.agent_name || parsed.name || 'JARVIS',
        provider,
        model: parsed.model && parsed.model !== 'CUSTOM_INPUT' ? parsed.model : DEFAULT_MODELS[provider] || 'llama-3.3-70b-versatile',
        api_key: resolvedKey,
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
        api_key: process.env.GROQ_API_KEY || process.env.LLM_API_KEY || '',
        base_url: KNOWN_ENDPOINTS.groq,
        temperature: 0.2,
        server_base_url: `http://localhost:${activePort}`, system_prompt: 'Você é o JARVIS, o Cérebro Central e Agente Líder permanente do sistema.', saved_keys: {} } }); } }  export async function updateBrainConfig(req: Request, res: Response) { const activePort = getEnvRegisteredPort(); try { await ensureSystemConfigsTable();  const { agent_name, provider, model, api_key, base_url, temperature, server_base_url, system_prompt, saved_keys } = req.body \vert{}\vert{} {};  const existingRes = await pool.query("SELECT value FROM system_configs WHERE key = 'brain_llm_config';"); let existingData: any = {}; if (existingRes.rows.length > 0) { const raw = existingRes.rows[0].value; existingData = typeof raw === 'string' ? JSON.parse(raw) : raw; }  const mergedKeys: Record<string, string> = {}; for (const [k, v] of Object.entries({ ...(existingData.saved_keys \vert{}\vert{} {}), ...(saved_keys \vert{}\vert{} {}) })) { if (typeof v === 'string' && !isMaskedOrInvalidKey(v)) { mergedKeys[k.toLowerCase()] = v.trim(); } }  const cleanApiKey = isMaskedOrInvalidKey(api_key) ? '' : String(api_key).trim(); const normalizedProvider = detectProviderFromKeyAndInput(provider \vert{}\vert{} existingData.provider \vert{}\vert{} 'groq', cleanApiKey, base_url);  if (cleanApiKey) { mergedKeys[normalizedProvider] = cleanApiKey; }  let finalApiKey = cleanApiKey \vert{}\vert{} mergedKeys[normalizedProvider] \vert{}\vert{} ''; if (!finalApiKey && !isMaskedOrInvalidKey(existingData.api_key)) { finalApiKey = String(existingData.api_key).trim(); } if (normalizedProvider === 'groq' && (!finalApiKey \vert{}\vert{} !finalApiKey.startsWith('gsk_'))) { const envGroq = process.env.GROQ_API_KEY \vert{}\vert{} (process.env.LLM_API_KEY?.startsWith('gsk_') ? process.env.LLM_API_KEY : ''); if (envGroq) { finalApiKey = envGroq.trim(); mergedKeys.groq = finalApiKey; } }  const isKnownOtherEndpoint = Object.entries(KNOWN_ENDPOINTS).some( ([k, url]) => k !== normalizedProvider && base_url?.trim().replace(/\/+$/, '') === url.replace(/\/+$/, '') ); const resolvedBaseUrl = !base_url?.trim() \vert{}\vert{} isKnownOtherEndpoint ? KNOWN_ENDPOINTS[normalizedProvider] \vert{}\vert{} KNOWN_ENDPOINTS.groq : base_url.trim();  const cleanModel = model && String(model).trim() && model !== 'CUSTOM_INPUT' ? String(model).trim() : DEFAULT_MODELS[normalizedProvider] \vert{}\vert{} 'llama-3.3-70b-versatile';  const newConfig = { agent_name: (agent_name \vert{}\vert{} existingData.agent_name \vert{}\vert{} 'JARVIS').trim(), provider: normalizedProvider, model: cleanModel, api_key: finalApiKey, base_url: resolvedBaseUrl, temperature: Number(temperature ?? existingData.temperature ?? 0.2), server_base_url: (server_base_url \vert{}\vert{} existingData.server_base_url \vert{}\vert{} `http://localhost:${activePort}`).replace(/\/+$/, ''),
      system_prompt:
        system_prompt ||
        existingData.system_prompt ||
        'Você é o JARVIS, o Cérebro Central e Agente Líder permanente do sistema.',
      saved_keys: mergedKeys
    };

    // Grava nas duas chaves para garantir 100% de sincronia com qualquer módulo do Orquestrador
    await pool.query(
      `INSERT INTO system_configs (key, value, updated_at)
       VALUES ('brain_llm_config', $1, NOW()), ('brain_config', $1, NOW())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = NOW();`,
      [JSON.stringify(newConfig)]
    );

    return res.status(200).json({
      success: true,
      message: `Configurações do Núcleo JARVIS (${normalizedProvider.toUpperCase()} -${cleanModel}) e Cofre de Chaves salvas!`,
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
    let cleanKey = isMaskedOrInvalidKey(api_key) ? '' : String(api_key).trim();

    // Se a chave veio mascarada da tela, recupera a chave real salva no cofre do banco
    if (!cleanKey) {
      const dbRes = await pool
        .query("SELECT value FROM system_configs WHERE key = 'brain_llm_config' LIMIT 1;")
        .catch(() => ({ rows: [] as any[] }));
      if (dbRes.rows.length > 0) {
        const parsed = typeof dbRes.rows[0].value === 'string' ? JSON.parse(dbRes.rows[0].value) : dbRes.rows[0].value;
        const provKey = String(provider || parsed?.provider || 'groq').toLowerCase().trim();
        cleanKey = parsed?.saved_keys?.[provKey] || (!isMaskedOrInvalidKey(parsed?.api_key) ? parsed.api_key : '') || '';
      }
    }

    const effectiveProvider = detectProviderFromKeyAndInput(provider, cleanKey, base_url);

    if (!cleanKey && effectiveProvider === 'groq') {
      cleanKey = process.env.GROQ_API_KEY || (process.env.LLM_API_KEY?.startsWith('gsk_') ? process.env.LLM_API_KEY : '') || '';
    }

    if (!cleanKey && effectiveProvider !== 'ollama') {
      return res.status(200).json({
        success: false,
        error: `A Chave de API (API Key) para ${effectiveProvider.toUpperCase()} não foi informada.`
      });
    }

    const selectedModel =
      model && String(model).trim() && model !== 'CUSTOM_INPUT'
        ? String(model).trim()
        : DEFAULT_MODELS[effectiveProvider] || 'llama-3.3-70b-versatile';

    if (effectiveProvider === 'gemini') {
      const candidateModels = Array.from(
        new Set([selectedModel, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'])
      );

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
            message: `Conexão com Google Gemini (${m}) validada com sucesso!`
          });
        }
        const errBody = await resp.text();
        lastGeminiError = `HTTP ${resp.status}:${errBody.slice(0, 200)}`;
      }

      return res.status(200).json({
        success: false,
        error: `Falha ao validar Gemini: ${lastGeminiError}`
      });
    }

    const isOtherKnown = Object.entries(KNOWN_ENDPOINTS).some(
      ([k, url]) => k !== effectiveProvider && base_url?.trim().replace(/\/+$/, '') === url.replace(/\/+$/, '')
    );
    const targetBaseUrl = (
      !base_url?.trim() || isOtherKnown
        ? KNOWN_ENDPOINTS[effectiveProvider] || KNOWN_ENDPOINTS.groq
        : base_url.trim()
    ).replace(/\/+$/, '');

    const candidateModels =
      effectiveProvider === 'groq'
        ? Array.from(new Set([selectedModel, 'llama-3.3-70b-versatile']))
        : [selectedModel];

    let firstErrorMsg = '';
    for (const candidate of candidateModels) {
      const resp = await fetch(`${targetBaseUrl}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cleanKey && effectiveProvider !== 'ollama' ? { Authorization: `Bearer ${cleanKey}` } : {}),
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

      const errText = await resp.text();
      if (!firstErrorMsg) {
        firstErrorMsg = `HTTP ${resp.status}:${errText.slice(0, 220)}`;
      }
      if (resp.status === 401) break;
    }

    return res.status(200).json({
      success: false,
      error: `Falha na validação (${effectiveProvider.toUpperCase()} - ${selectedModel}):${firstErrorMsg}`
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
    return res.status(200).json({ success: false, data: [], error: error.message });
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
      envContent += `\nPORT=${newPort}\n`; } fs.writeFileSync(envPath, envContent, 'utf-8');  return res.status(200).json({ success: true, message: `Porta ${newPort} validada e gravada no .env! Reinicie o backend para aplicar.`,
      port: newPort
    });
  } catch (error: any) {
    return res.status(200).json({ success: false, error: error.message });
  }
}
