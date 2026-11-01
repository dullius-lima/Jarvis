// src/controllers/brainConfigController.ts
import { Request, Response } from 'express';
import { pool } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import net from 'net';

// Endpoints oficiais exportados para uso no orchestratorService.ts
export const KNOWN_ENDPOINTS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  ollama: 'http://localhost:11434/v1',
  openrouter: 'https://openrouter.ai/api/v1'
};

export const DEFAULT_MODELS: Record<string, string> = {
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  ollama: 'llama3.1',
  openrouter: 'anthropic/claude-3.5-sonnet'
};

// Catálogo local de contingência (mesma estrutura do seu GitHub Gist)
export const CATALOG_MODELS: Record<string, Array<{ label: string; value: string }>> = {
  groq: [
    { label: '✍️ Inserir ID Manual da Groq', value: 'CUSTOM_INPUT' },
    { label: 'Llama 3.3 70B Versatile', value: 'llama-3.3-70b-versatile' },
    { label: 'Llama 3.1 8B Instant', value: 'llama-3.1-8b-instant' },
    { label: 'GPT-OSS 120B (Reasoning)', value: 'openai/gpt-oss-120b' },
    { label: 'Mixtral 8x7B 32k', value: 'mixtral-8x7b-32768' }
  ],
  openai: [
    { label: '✍️ Inserir ID Manual da OpenAI', value: 'CUSTOM_INPUT' },
    { label: 'GPT-4o Mini (Dia a Dia)', value: 'gpt-4o-mini' },
    { label: 'GPT-4o (Completo)', value: 'gpt-4o' },
    { label: 'o3-mini (Reasoning)', value: 'o3-mini' }
  ],
  gemini: [
    { label: '✍️ Inserir ID Manual do Gemini', value: 'CUSTOM_INPUT' },
    { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
    { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
    { label: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash' }
  ],
  deepseek: [
    { label: '✍️ Inserir ID Manual da DeepSeek', value: 'CUSTOM_INPUT' },
    { label: 'DeepSeek V3 (Chat)', value: 'deepseek-chat' },
    { label: 'DeepSeek R1 (Reasoner)', value: 'deepseek-reasoner' }
  ],
  openrouter: [
    { label: '✍️ Inserir ID Manual do OpenRouter', value: 'CUSTOM_INPUT' },
    { label: 'Anthropic Claude 3.5 Sonnet', value: 'anthropic/claude-3.5-sonnet' },
    { label: 'Meta Llama 3.3 70B Instruct', value: 'meta-llama/llama-3.3-70b-instruct' }
  ],
  ollama: [
    { label: '✍️ Inserir ID Manual do Ollama', value: 'CUSTOM_INPUT' },
    { label: 'Llama 3.1 8B (Local)', value: 'llama3.1' },
    { label: 'Qwen 2.5 Coder', value: 'qwen2.5-coder' },
    { label: 'Mistral 7B', value: 'mistral' }
  ]
};

// URL sem o hash de commit para buscar sempre a revisão mais recente do seu GitHub Gist
const GITHUB_MODELS_GIST_URL =
  process.env.MODELS_GIST_RAW_URL ||
  'https://gist.githubusercontent.com/dullius-lima/f672db978789103941a45d2968e386e5/raw/models.json';

let cachedGistModels: Record<string, Array<{ label: string; value: string }>> | null = null;
let lastGistSync: string | null = null;

/**
 * Exportado para uso no orchestratorService.ts
 */
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
 * Normaliza a lista vinda do Gist para garantir que todos os provedores tenham a opção CUSTOM_INPUT
 */
function normalizeModelsCatalog(rawCatalog: any): Record<string, Array<{ label: string; value: string }>> {
  const merged: Record<string, Array<{ label: string; value: string }>> = { ...CATALOG_MODELS };
  if (!rawCatalog || typeof rawCatalog !== 'object') return merged;

  for (const [provider, list] of Object.entries(rawCatalog)) {
    if (Array.isArray(list)) {
      const normalizedList = list
        .filter((item: any) => item && typeof item === 'object' && item.value)
        .map((item: any) => ({
          label: String(item.label || item.value),
          value: String(item.value)
        }));

      const hasCustom = normalizedList.some((m) => m.value === 'CUSTOM_INPUT');
      if (!hasCustom) {
        normalizedList.unshift({
          label: `✍️ Inserir ID Manual (${provider.toUpperCase()})`,
          value: 'CUSTOM_INPUT'
        });
      }
      merged[provider.toLowerCase()] = normalizedList;
    }
  }
  return merged;
}

/**
 * GET /api/v1/brain-config/models
 * Busca automaticamente os modelos do seu GitHub Gist (ou força atualização com ?refresh=true)
 */
export async function getSupportedModels(req: Request, res: Response) {
  const forceRefresh = req.query.refresh === 'true';

  try {
    if (!cachedGistModels || forceRefresh) {
      const fetchUrl = `${GITHUB_MODELS_GIST_URL}${GITHUB_MODELS_GIST_URL.includes('?') ? '&' : '?'}t=${Date.now()}`;
      const response = await fetch(fetchUrl, {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000)
      });

      if (response.ok) {
        const rawJson = await response.json();
        cachedGistModels = normalizeModelsCatalog(rawJson);
        lastGistSync = new Date().toISOString();

        return res.status(200).json({
          success: true,
          source: 'github_gist',
          gistUrl: GITHUB_MODELS_GIST_URL,
          syncedAt: lastGistSync,
          models: cachedGistModels,
          catalog: cachedGistModels,
          endpoints: KNOWN_ENDPOINTS
        });
      }
    } else {
      return res.status(200).json({
        success: true,
        source: 'github_gist_cache',
        gistUrl: GITHUB_MODELS_GIST_URL,
        syncedAt: lastGistSync,
        models: cachedGistModels,
        catalog: cachedGistModels,
        endpoints: KNOWN_ENDPOINTS
      });
    }
  } catch (error: any) {
    console.warn('⚠️ [GitHub Gist Models] Usando fallback local:', error?.message);
  }

  return res.status(200).json({
    success: true,
    source: 'local_fallback',
    gistUrl: GITHUB_MODELS_GIST_URL,
    syncedAt: new Date().toISOString(),
    models: CATALOG_MODELS,
    catalog: CATALOG_MODELS,
    endpoints: KNOWN_ENDPOINTS
  });
}

/**
 * GET /api/v1/brain-config
 * Carrega a configuração do Cérebro Central (JARVIS) e o cofre saved_keys
 */
export async function getBrainConfig(_req: Request, res: Response) {
  const activePort = getEnvRegisteredPort();
  try {
    await ensureSystemConfigsTable();
    const result = await pool.query(`
      SELECT value FROM system_configs 
      WHERE key IN ('brain_llm_config', 'brain_llm') 
      ORDER BY updated_at DESC LIMIT 1;
    `);

    if (result.rows.length === 0) {
      const defaultProvider = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
      const fallbackConfig = {
        agent_name: 'JARVIS',
        provider: defaultProvider,
        model: process.env.LLM_MODEL || DEFAULT_MODELS[defaultProvider] || 'llama-3.3-70b-versatile',
        api_key: process.env.LLM_API_KEY || '',
        base_url: process.env.LLM_BASE_URL || KNOWN_ENDPOINTS[defaultProvider] || KNOWN_ENDPOINTS.groq,
        temperature: 0.2,
        server_base_url: process.env.SERVER_BASE_URL || `http://localhost:${activePort}`,
        system_prompt:
          'Você é o JARVIS, o Cérebro Central e Agente Líder permanente do sistema. Analise os estímulos, consulte a memória e acione os Agentes Especialistas quando necessário.',
        saved_keys: {}
      };

      await pool.query(
        `INSERT INTO system_configs (key, value) VALUES ('brain_llm_config', $1) ON CONFLICT (key) DO NOTHING;`,
        [JSON.stringify(fallbackConfig)]
      );

      return res.status(200).json({ success: true, data: fallbackConfig });
    }

    const raw = result.rows[0].value;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const provider = (parsed.provider || 'groq').toLowerCase();
    const savedKeys = parsed.saved_keys && typeof parsed.saved_keys === 'object' ? parsed.saved_keys : {};

    if (parsed.api_key && !savedKeys[provider]) {
      savedKeys[provider] = parsed.api_key;
    }

    return res.status(200).json({
      success: true,
      data: {
        agent_name: parsed.agent_name || parsed.name || 'JARVIS',
        provider,
        model: parsed.model || DEFAULT_MODELS[provider] || 'llama-3.3-70b-versatile',
        api_key: parsed.api_key || savedKeys[provider] || '',
        base_url: parsed.base_url || KNOWN_ENDPOINTS[provider] || KNOWN_ENDPOINTS.groq,
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
        api_key: '',
        base_url: KNOWN_ENDPOINTS.groq,
        temperature: 0.2,
        server_base_url: `http://localhost:${activePort}`,
        system_prompt: 'Você é o JARVIS, o Cérebro Central e Agente Líder permanente do sistema.',
        saved_keys: {}
      }
    });
  }
}

/**
 * PUT /api/v1/brain-config
 * Salva as configurações do JARVIS preservando o cofre saved_keys de cada provedor
 */
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

    const normalizedProvider = (provider || 'groq').toLowerCase().trim();

    // Carrega configuração anterior para preservar chaves salvas de outros provedores
    const existingRes = await pool.query("SELECT value FROM system_configs WHERE key = 'brain_llm_config';");
    let existingData: any = {};
    if (existingRes.rows.length > 0) {
      const raw = existingRes.rows[0].value;
      existingData = typeof raw === 'string' ? JSON.parse(raw) : raw;
    }

    const mergedKeys: Record<string, string> = {
      ...(existingData.saved_keys || {}),
      ...(saved_keys || {})
    };

    const cleanApiKey = (api_key ?? '').trim();
    if (cleanApiKey) {
      mergedKeys[normalizedProvider] = cleanApiKey;
    }

    const finalApiKey = cleanApiKey || mergedKeys[normalizedProvider] || '';

    // Evita que a Base URL de um provedor antigo fique presa ao trocar de provedor
    const isKnownOtherEndpoint = Object.entries(KNOWN_ENDPOINTS).some(
      ([k, url]) => k !== normalizedProvider && base_url?.trim() === url
    );
    const resolvedBaseUrl =
      !base_url?.trim() || isKnownOtherEndpoint
        ? KNOWN_ENDPOINTS[normalizedProvider] || KNOWN_ENDPOINTS.groq
        : base_url.trim();

    const newConfig = {
      agent_name: (agent_name || existingData.agent_name || 'JARVIS').trim(),
      provider: normalizedProvider,
      model: (model || DEFAULT_MODELS[normalizedProvider] || 'llama-3.3-70b-versatile').trim(),
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

    await pool.query(
      `INSERT INTO system_configs (key, value, updated_at)
       VALUES ('brain_llm_config', $1, NOW())
       ON CONFLICT (key) DO UPDATE 
       SET value = EXCLUDED.value, updated_at = NOW();`,
      [JSON.stringify(newConfig)]
    );

    // Salva histórico de versão de prompt se houver mudança
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
         VALUES ('brain_prompt_versions', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
        [JSON.stringify(versions.slice(0, 20))]
      );
    } catch {}

    return res.status(200).json({
      success: true,
      message: 'Configurações do Núcleo JARVIS e Cofre de Chaves atualizadas com sucesso!',
      data: newConfig
    });
  } catch (error: any) {
    console.error('❌ Erro no updateBrainConfig:', error.message);
    return res.status(200).json({ success: false, error: error.message });
  }
}

/**
 * POST /api/v1/brain-config/validate
 * Valida a conexão e a chave de API com qualquer provedor (com fallback inteligente de modelo)
 */
export async function validateLLMConnection(req: Request, res: Response) {
  try {
    const { provider, model, api_key, base_url } = req.body || {};
    const normalizedProvider = (provider || 'groq').toLowerCase().trim();
    const cleanKey = (api_key || '').trim();
    const selectedModel = (model && model !== 'CUSTOM_INPUT' ? model : DEFAULT_MODELS[normalizedProvider]).trim();

    if (normalizedProvider !== 'ollama' && !cleanKey) {
      return res.status(200).json({
        success: false,
        error: `A Chave de API (API Key) para ${normalizedProvider.toUpperCase()} está vazia.`
      });
    }

    // 1. Validação direta na API do Google Gemini (suporta chave Google AI Studio)
    if (normalizedProvider === 'gemini') {
      const testModels = Array.from(new Set([selectedModel, 'gemini-2.5-flash', 'gemini-1.5-flash']));
      let lastErr = '';

      for (const m of testModels) {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${cleanKey}`;
        const resp = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Responda apenas OK.' }] }]
          }),
          signal: AbortSignal.timeout(12000)
        });

        if (resp.ok) {
          return res.status(200).json({
            success: true,
            usedModel: m,
            message:
              m !== selectedModel
                ? `Chave Gemini validada! (O modelo '${selectedModel}' não estava habilitado na sua conta; conectado via '${m}').`
                : `Conexão com Google Gemini (${m}) validada com sucesso!`
          });
        }
        const errBody = await resp.text();
        lastErr = `HTTP ${resp.status}: ${errBody.slice(0, 180)}`;
      }

      return res.status(200).json({
        success: false,
        error: `Falha ao validar Gemini (${selectedModel}): ${lastErr}`
      });
    }

    // 2. Demais provedores compatíveis com OpenAI (Groq, OpenAI, DeepSeek, OpenRouter, Ollama)
    const isOtherKnown = Object.entries(KNOWN_ENDPOINTS).some(
      ([k, url]) => k !== normalizedProvider && base_url?.trim() === url
    );
    const targetBaseUrl = (
      !base_url?.trim() || isOtherKnown
        ? KNOWN_ENDPOINTS[normalizedProvider] || KNOWN_ENDPOINTS.groq
        : base_url.trim()
    ).replace(/\/+$/, '');

    const candidateModels =
      normalizedProvider === 'groq'
        ? Array.from(new Set([selectedModel, 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant']))
        : [selectedModel];

    let lastErrorMsg = '';
    for (const candidate of candidateModels) {
      const resp = await fetch(`${targetBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cleanKey || 'ollama'}`
        },
        body: JSON.stringify({
          model: candidate,
          messages: [{ role: 'user', content: 'Responda apenas OK.' }],
          max_tokens: 10
        }),
        signal: AbortSignal.timeout(12000)
      });

      if (resp.ok) {
        return res.status(200).json({
          success: true,
          usedModel: candidate,
          message:
            candidate !== selectedModel
              ? `Chave ${normalizedProvider.toUpperCase()} validada! (Modelo ajustado automaticamente para '${candidate}').`
              : `Conexão com ${normalizedProvider.toUpperCase()} (${candidate}) validada com sucesso!`
        });
      }
      const errText = await resp.text();
      lastErrorMsg = `HTTP ${resp.status}: ${errText.slice(0, 180)}`;
    }

    return res.status(200).json({
      success: false,
      error: `Falha na validação (${normalizedProvider.toUpperCase()} - ${selectedModel}): ${lastErrorMsg}`
    });
  } catch (error: any) {
    return res.status(200).json({
      success: false,
      error: `Erro de rede ao validar conexão: ${error?.message || 'Timeout ou endpoint inacessível'}`
    });
  }
}

// Alias para compatibilidade com server.ts
export const validateBrainConnection = validateLLMConnection;

/**
 * GET /api/v1/brain-config/prompt-versions
 */
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

/**
 * POST /api/v1/brain-config/port
 * Gerenciador de Porta TCP e atualização segura do .env
 */
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

    // Verifica se a porta está livre via socket TCP
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