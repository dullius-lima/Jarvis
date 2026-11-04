import { Request, Response } from 'express';
import { pool } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import net from 'net';

export const KNOWN_ENDPOINTS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434/v1'
};

export const DEFAULT_MODELS: Record<string, string> = {
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-3.8-flash',
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  openrouter: 'anthropic/claude-3.5-sonnet',
  ollama: 'llama3.1:8b'
};

export const CATALOG_MODELS: Record<string, Array<{ label: string; value: string }>> = {
  groq: [
    { label: '✍️ Inserir ID Manual da Groq', value: 'CUSTOM_INPUT' },
    { label: 'Llama 3.3 70B Versatile', value: 'llama-3.3-70b-versatile' },
    { label: 'Llama 3.1 8B Instant', value: 'llama-3.1-8b-instant' },
    { label: 'GPT-OSS 120B (Reasoning)', value: 'openai/gpt-oss-120b' }
  ],
  openai: [
    { label: '✍️ Inserir ID Manual da OpenAI', value: 'CUSTOM_INPUT' },
    { label: 'GPT-4o Mini (Dia a Dia)', value: 'gpt-4o-mini' },
    { label: 'GPT-4o (Completo)', value: 'gpt-4o' },
    { label: 'o3-mini (Reasoning)', value: 'o3-mini' }
  ],
  gemini: [
    { label: '✍️ Inserir ID Manual do Gemini', value: 'CUSTOM_INPUT' },
    { label: 'Gemini 3.8 Flash', value: 'gemini-3.8-flash' },
    { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
    { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' }
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

function normalizeModelsCatalog(rawCatalog: any): Record<string, Array<{ label: string; value: string }>> {
  const merged: Record<string, Array<{ label: string; value: string }>> = { ...CATALOG_MODELS };
  if (!rawCatalog || typeof rawCatalog !== 'object') return merged;

  for (const [provider, list] of Object.entries(rawCatalog)) {
    if (Array.isArray(list)) {
      const normalizedList = list
        .filter((item: any) => item && typeof item === 'object' && item.value)
        .map((item: any) => ({
          label: String(item.label || item.value),
          value: String(item.value).replace(/^models\//, '')
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

export async function syncModelsFromGistAndHealAgents(): Promise<{
  catalog: Record<string, { label: string; value: string }[]>;
  source: string;
}> {
  const rawEnvUrl = (process.env.MODELS_GIST_URL || DEFAULT_GIST_RAW_URL).trim();
  const cleanGistUrl = rawEnvUrl.replace(/\/raw\/[a-f0-9]{20,40}\//i, '/raw/');
  const fetchUrl = `${cleanGistUrl}${cleanGistUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;

  let activeCatalog = CATALOG_MODELS;
  let source = 'Catálogo Local (Fallback)';

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
        source = 'GitHub Gist (Tempo Real)';
      }
    }
  } catch (err: any) {
    console.warn('[Gist Auto-Sync] Falha ao ler Gist remoto, mantendo fallback:', err.message);
  }

  try {
    for (const [providerKey, modelsList] of Object.entries(activeCatalog)) {
      if (!Array.isArray(modelsList)) continue;

      const validModels = modelsList
        .map((m) => m.value)
        .filter((val) => val && val !== 'CUSTOM_INPUT');

      if (validModels.length === 0) continue;
      const primaryRecommendedModel = validModels[0];

      await pool.query(
        `UPDATE ai_agents
         SET model = $1, updated_at = NOW()
         WHERE LOWER(provider) = LOWER($2)
           AND (model IS NULL OR model = '' OR NOT (model = ANY($3::text[])));`,
        [primaryRecommendedModel, providerKey, validModels]
      );
    }

    const brainRes = await pool.query(
      `SELECT value FROM system_configs WHERE key = 'brain_llm_config' LIMIT 1;`
    );
    if (brainRes.rows.length > 0 && brainRes.rows[0].value) {
      const cfg =
        typeof brainRes.rows[0].value === 'string'
          ? JSON.parse(brainRes.rows[0].value)
          : brainRes.rows[0].value;
      const prov = (cfg.provider || 'groq').toLowerCase();
      const provModels = (activeCatalog[prov] || [])
        .map((m) => m.value)
        .filter((v) => v && v !== 'CUSTOM_INPUT');

      if (provModels.length > 0 && !provModels.includes(cfg.model)) {
        cfg.model = provModels[0];
        await pool.query(
          `UPDATE system_configs SET value = $1::jsonb, updated_at = NOW() WHERE key = 'brain_llm_config';`,
          [JSON.stringify(cfg)]
        );
      }
    }
  } catch (dbErr: any) {
    console.warn('[Auto-Heal Models] Aviso ao alinhar modelos no banco:', dbErr.message);
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

    const isKnownOtherEndpoint = Object.entries(KNOWN_ENDPOINTS).some(
      ([k, url]) => k !== normalizedProvider && base_url?.trim() === url
    );
    const resolvedBaseUrl =
      !base_url?.trim() || isKnownOtherEndpoint
        ? KNOWN_ENDPOINTS[normalizedProvider] || KNOWN_ENDPOINTS.groq
        : base_url.trim();

    const cleanModel = (model || DEFAULT_MODELS[normalizedProvider] || 'llama-3.3-70b-versatile')
      .trim()
      .replace(/^models\//, '');

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

    await pool.query(
      `INSERT INTO system_configs (key, value, updated_at)
       VALUES ('brain_llm_config', $1, NOW())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = NOW();`,
      [JSON.stringify(newConfig)]
    );

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

export async function validateLLMConnection(req: Request, res: Response) {
  try {
    const { provider = 'groq', model, api_key, base_url } = req.body || {};
    const cleanKey = api_key ? String(api_key).trim() : '';

    let effectiveProvider = String(provider).toLowerCase().trim();
    if (cleanKey.startsWith('gsk_')) effectiveProvider = 'groq';
    else if (cleanKey.startsWith('AIza')) effectiveProvider = 'gemini';

    if (!cleanKey && effectiveProvider !== 'ollama') {
      return res.status(200).json({
        success: false,
        error: `A Chave de API (API Key) para ${effectiveProvider.toUpperCase()} não foi informada.`
      });
    }

    const rawSelectedModel =
      model && model !== 'CUSTOM_INPUT'
        ? String(model).trim().replace(/^models\//, '')
        : DEFAULT_MODELS[effectiveProvider];

    if (effectiveProvider === 'gemini') {
      const requestedModel = rawSelectedModel.startsWith('gemini')
        ? rawSelectedModel
        : 'gemini-3.8-flash';

      // 1. Monta a lista priorizando exatamente o modelo escolhido pelo usuário (sem bloquear 3.8!)
      const candidateModels = Array.from(
        new Set([requestedModel, 'gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'])
      );

      // 2. Consulta dinâmica na Google API (ListModels) para descobrir os modelos reais da chave caso necessário
      try {
        const listResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`,
          { method: 'GET', signal: AbortSignal.timeout(8000) }
        );
        if (listResp.ok) {
          const listJson: any = await listResp.json();
          const availableApiModels: string[] = (listJson.models || [])
            .filter(
              (m: any) =>
                Array.isArray(m.supportedGenerationMethods) &&
                m.supportedGenerationMethods.includes('generateContent')
            )
            .map((m: any) => String(m.name || '').replace(/^models\//, ''))
            .filter((name: string) => name.startsWith('gemini'));

          for (const apiMod of availableApiModels) {
            if (!candidateModels.includes(apiMod)) {
              candidateModels.push(apiMod);
            }
          }
        }
      } catch {}

      let firstModelError = '';

      for (const m of candidateModels) {
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
            provider: 'gemini',
            model: m,
            usedModel: m,
            message: `Conexão com Google Gemini (${m}) validada com sucesso!`
          });
        }

        const errBody = await resp.text();
        if (!firstModelError) {
          firstModelError = `HTTP ${resp.status}: ${errBody.slice(0, 220)}`;
        }
      }

      return res.status(200).json({
        success: false,
        error: `Falha ao validar Gemini (${requestedModel}): ${firstModelError}`
      });
    }

    let selectedModel = rawSelectedModel;
    if (effectiveProvider === 'groq' && (!selectedModel || selectedModel.startsWith('gemini') || selectedModel.startsWith('gpt'))) {
      selectedModel = 'llama-3.3-70b-versatile';
    } else if (effectiveProvider === 'openai' && !selectedModel.startsWith('gpt') && !selectedModel.startsWith('o')) {
      selectedModel = 'gpt-4o-mini';
    }

    const isOtherKnown = Object.entries(KNOWN_ENDPOINTS).some(
      ([k, url]) => k !== effectiveProvider && base_url?.trim() === url
    );
    const targetBaseUrl = (
      !base_url?.trim() || isOtherKnown
        ? KNOWN_ENDPOINTS[effectiveProvider] || KNOWN_ENDPOINTS.groq
        : base_url.trim()
    ).replace(/\/+$/, '');

    const candidateModels =
      effectiveProvider === 'groq'
        ? Array.from(new Set([selectedModel, 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant']))
        : [selectedModel];

    let firstErrorMsg = '';
    for (const candidate of candidateModels) {
      const resp = await fetch(`${targetBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cleanKey && effectiveProvider !== 'ollama' ? { Authorization: `Bearer ${cleanKey}` } : {})
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
        firstErrorMsg = `HTTP ${resp.status}: ${errText.slice(0, 220)}`;
      }
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
