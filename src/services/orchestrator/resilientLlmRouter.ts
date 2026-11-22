import OpenAI from 'openai';
import { pool } from '../../config/database.js';

export const PROVIDER_BASE_URLS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://127.0.0.1:11434/v1'
};

// Ordem de failover automático: do MAIS BARATO / GRATUITO para o MAIS CARO (modelos ativos)
export const ECONOMIC_FAILOVER_LADDER: Array<{
  provider: string;
  model: string;
  tier: string;
}> = [
  { provider: 'gemini', model: 'gemini-2.5-flash', tier: 'Cota Gratuita Google Gemini' },
  { provider: 'groq', model: 'openai/gpt-oss-20b', tier: 'Groq LPU Ultra-Econômico' },
  { provider: 'groq', model: 'openai/gpt-oss-120b', tier: 'Groq LPU Alta Capacidade' },
  { provider: 'deepseek', model: 'deepseek-chat', tier: 'Baixo Custo V3 (DeepSeek)' },
  { provider: 'openai', model: 'gpt-4o-mini', tier: 'Econômico Estável (OpenAI)' },
  { provider: 'gemini', model: 'gemini-2.5-pro', tier: 'Raciocínio Avançado (Google)' },
  { provider: 'openrouter', model: 'deepseek/deepseek-chat:free', tier: 'Multi-Hub Gratuito (OpenRouter)' },
  { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet', tier: 'Alta Precisão (Claude)' },
  { provider: 'openai', model: 'gpt-4o', tier: 'Reserva Premium (OpenAI)' },
  { provider: 'ollama', model: 'llama3.1:8b', tier: 'Contingência Local Offline' }
];

function cleanKey(raw?: string | null): string {
  const s = String(raw || '').trim();
  if (!s || s.includes('•') || s.includes('***') || s === 'placeholder_key') return '';
  return s;
}

export async function loadVaultKeys(): Promise<Record<string, string>> {
  const vault: Record<string, string> = {};

  const envMap: Record<string, string | undefined> = {
    groq: process.env.GROQ_API_KEY,
    gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY
  };

  for (const [prov, val] of Object.entries(envMap)) {
    const k = cleanKey(val);
    if (k) vault[prov] = k;
  }

  const globalKey = cleanKey(process.env.LLM_API_KEY);
  if (globalKey) {
    if (globalKey.startsWith('gsk_') && !vault.groq) vault.groq = globalKey;
    else if (globalKey.startsWith('AIza') && !vault.gemini) vault.gemini = globalKey;
    else if (globalKey.startsWith('sk-or-') && !vault.openrouter) vault.openrouter = globalKey;
    else if (globalKey.startsWith('sk-') && !vault.openai) vault.openai = globalKey;
  }

  try {
    const res = await pool.query("SELECT value FROM system_configs WHERE key = 'brain_llm_config' LIMIT 1;");
    const cfg = res.rows[0]?.value || {};
    if (cfg?.saved_keys && typeof cfg.saved_keys === 'object') {
      for (const [prov, val] of Object.entries(cfg.saved_keys)) {
        const k = cleanKey(String(val || ''));
        if (k) vault[prov.toLowerCase()] = k;
      }
    }
    const activeProv = String(cfg?.provider || '').toLowerCase();
    const activeKey = cleanKey(cfg?.api_key);
    if (activeProv && activeKey) {
      vault[activeProv] = activeKey;
    }
  } catch {
    // Segue com chaves do .env
  }

  return vault;
}

function isQuotaCreditOrModelError(err: any): boolean {
  const status = Number(err?.status || err?.statusCode || err?.response?.status || 0);
  const msg = String(err?.message || err?.error?.message || '').toLowerCase();
  if ([402, 403, 404, 429, 503].includes(status)) return true;
  return /credit|quota|billing|balance|insufficient|rate.?limit|exceeded|limit|not.?found|not exist|decommission|blocked|capacity|overloaded/.test(msg);
}

export async function executeWithEconomicFailover(options: {
  provider?: string;
  model: string;
  apiKey?: string;
  baseURL?: string;
  messages: any[];
  tools?: any[];
  temperature?: number;
}) {
  const vault = await loadVaultKeys();
  const primaryProvider = String(options.provider || 'groq').toLowerCase().trim();
  const primaryModel = String(options.model || '').trim();
  const explicitKey = cleanKey(options.apiKey);

  if (explicitKey && primaryProvider) {
    vault[primaryProvider] = explicitKey;
  }

  type Candidate = { provider: string; model: string; apiKey: string; baseURL: string; tier: string };
  const queue: Candidate[] = [];
  const seen = new Set<string>();

  const pushCandidate = (provider: string, model: string, tier: string, customBase?: string) => {
    const p = provider.toLowerCase().trim();
    const m = model.trim();
    if (!p || !m) return;
    const key = p === 'ollama' ? (vault.ollama || 'ollama') : (vault[p] || '');
    if (!key) return;
    const sig = `${p}::${m}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    queue.push({
      provider: p,
      model: m,
      apiKey: key,
      baseURL: (customBase || PROVIDER_BASE_URLS[p] || PROVIDER_BASE_URLS.groq).replace(/\/+$/, ''),
      tier
    });
  };

  // 1. Executa SEMPRE primeiro o modelo exato escolhido pelo utilizador
  if (primaryModel) {
    pushCandidate(primaryProvider, primaryModel, 'Modelo Configurado pelo Utilizador', options.baseURL);
  }

  // 2. Cascata automática do mais barato para o mais caro usando chaves do Cofre
  for (const step of ECONOMIC_FAILOVER_LADDER) {
    pushCandidate(step.provider, step.model, step.tier);
  }

  if (queue.length === 0) {
    throw new Error('Nenhuma chave de API válida encontrada no Cofre ou no .env.');
  }

  let lastError: any = null;

  for (let i = 0; i < queue.length; i++) {
    const candidate = queue[i];
    const client = new OpenAI({
      apiKey: candidate.apiKey,
      baseURL: candidate.baseURL,
      timeout: 30000
    });

    const payload: any = {
      model: candidate.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.2
    };

    if (options.tools && options.tools.length > 0) {
      payload.tools = options.tools;
      payload.tool_choice = 'auto';
      if (candidate.provider === 'groq') {
        payload.parallel_tool_calls = false;
      }
    }

    try {
      const response = await client.chat.completions.create(payload);
      if (i > 0) {
        console.log(`💸 [Auto-Failover Crédito/Cota] Executado via ${candidate.provider}/${candidate.model} (${candidate.tier})`);
      }
      return response;
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || err?.error?.message || '');

      if (payload.tools && Number(err?.status) === 400 && !/decommission|not exist|not found|blocked/i.test(msg)) {
        try {
          return await client.chat.completions.create({
            model: candidate.model,
            messages: options.messages,
            temperature: options.temperature ?? 0.2
          });
        } catch (retryErr: any) {
          lastError = retryErr;
        }
      }

      if (isQuotaCreditOrModelError(lastError) && i + 1 < queue.length) {
        const next = queue[i + 1];
        console.warn(
          `⚠️ [Auto-Failover Crédito/Cota] ${candidate.provider}/${candidate.model} falhou (${lastError?.status || 'erro'}) ➔ Trocando para ${next.provider}/${next.model} [${next.tier}]`
        );
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error('Todos os modelos da cascata falharam.');
}
