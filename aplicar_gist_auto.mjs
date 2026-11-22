import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BACKUP_DIR = '.backup_gist_auto';
const FILES = [
  'src/controllers/brainConfigController.ts',
  'src/services/orchestrator/brainConfigAndUtils.ts',
  'src/services/orchestrator/motorInferencaLLM.ts',
  'src/services/orchestrator/resilientLlmRouter.ts',
  'src/server.ts'
];

fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });
for (const rel of FILES) {
  if (fs.existsSync(rel)) {
    const dest = path.join(BACKUP_DIR, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(rel, dest);
  }
}

function rollback() {
  for (const rel of FILES) {
    const src = path.join(BACKUP_DIR, rel);
    if (fs.existsSync(src)) fs.copyFileSync(src, rel);
  }
  console.error('↩️ Rollback automático executado.');
}

function replaceBetween(code, startMarker, endMarker, replacement, includeEnd = false) {
  const sIdx = code.indexOf(startMarker);
  if (sIdx === -1) throw new Error('Marcador inicial não encontrado: ' + startMarker);
  const eIdx = code.indexOf(endMarker, sIdx + startMarker.length);
  if (eIdx === -1) throw new Error('Marcador final não encontrado: ' + endMarker);
  const cutEnd = includeEnd ? eIdx + endMarker.length : eIdx;
  return code.slice(0, sIdx) + replacement + code.slice(cutEnd);
}

try {
  // 1. src/controllers/brainConfigController.ts -> Gist ao vivo + Auto-Heal automático no PostgreSQL
  {
    const p = 'src/controllers/brainConfigController.ts';
    let code = fs.readFileSync(p, 'utf8');

    const newCatalogBlock = `export const KNOWN_ENDPOINTS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434/v1'
};

export const DEFAULT_MODELS: Record<string, string> = {
  groq: 'openai/gpt-oss-20b',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
  ollama: 'llama3.1:8b'
};

export let CATALOG_MODELS: Record<string, Array<{ label: string; value: string }>> = {
  groq: [
    { label: '✍️ Inserir ID Manual da Groq', value: 'CUSTOM_INPUT' },
    { label: 'GPT-OSS 20B (Ultra-Rápido / Liberado)', value: 'openai/gpt-oss-20b' },
    { label: 'GPT-OSS 120B (Reasoning & Agentes)', value: 'openai/gpt-oss-120b' },
    { label: 'Qwen 3.8 27B', value: 'qwen/qwen3.8-27b' }
  ],
  gemini: [
    { label: '✍️ Inserir ID Manual do Gemini', value: 'CUSTOM_INPUT' },
    { label: 'Gemini 2.5 Flash (Recomendado)', value: 'gemini-2.5-flash' },
    { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' }
  ],
  openrouter: [
    { label: '✍️ Inserir ID Manual do OpenRouter', value: 'CUSTOM_INPUT' },
    { label: 'DeepSeek V3 Chat (:free)', value: 'deepseek/deepseek-chat:free' },
    { label: 'DeepSeek R1 (:free)', value: 'deepseek/deepseek-r1:free' },
    { label: 'Auto-Router Gratuito OpenRouter', value: 'openrouter/free' }
  ],
  openai: [
    { label: '✍️ Inserir ID Manual da OpenAI', value: 'CUSTOM_INPUT' },
    { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
    { label: 'GPT-4o', value: 'gpt-4o' }
  ],
  deepseek: [
    { label: '✍️ Inserir ID Manual da DeepSeek', value: 'CUSTOM_INPUT' },
    { label: 'DeepSeek V3 (Chat)', value: 'deepseek-chat' },
    { label: 'DeepSeek R1 (Reasoner)', value: 'deepseek-reasoner' }
  ],
  ollama: [
    { label: '✍️ Inserir ID Manual do Ollama', value: 'CUSTOM_INPUT' },
    { label: 'Llama 3.1 8B (Local)', value: 'llama3.1:8b' }
  ]
};

`;
    code = replaceBetween(code, 'export const KNOWN_ENDPOINTS:', 'const DEFAULT_GIST_RAW_URL =', newCatalogBlock, false);

    // Evita que LLM_API_KEY (ex: gsk_...) vaze para outro provedor (ex: gemini)
    const newEnvKeyFn = `function getEnvKeyForProvider(provider: string): string {
  const p = (provider || 'groq').toLowerCase().trim();
  const generic = cleanAndNormalizeApiKey(process.env.LLM_API_KEY);
  const belongsToOther =
    (p !== 'groq' && generic.startsWith('gsk_')) ||
    (p !== 'gemini' && generic.startsWith('AIza')) ||
    (p !== 'openrouter' && generic.startsWith('sk-or-'));
  const safeGeneric = belongsToOther ? '' : generic;

  if (p === 'groq') return cleanAndNormalizeApiKey(process.env.GROQ_API_KEY) || safeGeneric;
  if (p === 'gemini') return cleanAndNormalizeApiKey(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) || safeGeneric;
  if (p === 'openrouter') return cleanAndNormalizeApiKey(process.env.OPENROUTER_API_KEY) || safeGeneric;
  if (p === 'deepseek') return cleanAndNormalizeApiKey(process.env.DEEPSEEK_API_KEY) || safeGeneric;
  if (p === 'openai') return cleanAndNormalizeApiKey(process.env.OPENAI_API_KEY) || safeGeneric;
  return '';
}

`;
    code = replaceBetween(code, 'function getEnvKeyForProvider(', 'function detectProviderFromKeyAndInput(', newEnvKeyFn, false);

    // Validação que aceita qualquer modelo do Gist sem travas manuais
    const newSanitizeFn = `function sanitizeModelForProvider(provider: string, rawModel?: string): string {
  const p = (provider || 'groq').toLowerCase().trim();
  const m = (rawModel || '').trim().replace(/^models\\//, '');
  const listFromGist = (CATALOG_MODELS[p] || [])
    .map((item) => item.value)
    .filter((v) => v && v !== 'CUSTOM_INPUT');

  if (!m || m === 'CUSTOM_INPUT') {
    return listFromGist[0] || DEFAULT_MODELS[p] || 'openai/gpt-oss-20b';
  }

  // Bloqueia apenas mistura óbvia entre provedores diferentes
  if (p === 'gemini' && !m.startsWith('gemini')) {
    return listFromGist[0] || DEFAULT_MODELS.gemini;
  }
  if (p === 'groq' && (m.startsWith('gemini') || m.startsWith('claude') || m.startsWith('gpt-4'))) {
    return listFromGist[0] || DEFAULT_MODELS.groq;
  }

  return m;
}

`;
    code = replaceBetween(code, 'function sanitizeModelForProvider(', 'function normalizeModelsCatalog(', newSanitizeFn, false);

    // Sincronizador automático real com o GitHub Gist + Auto-Heal dos Agentes e Cérebro no PostgreSQL
    const newGistSyncBlock = `export async function syncModelsFromGistAndHealAgents(): Promise<{
  catalog: Record<string, { label: string; value: string }[]>;
  models: Record<string, { label: string; value: string }[]>;
  source: string;
  syncedAt: string;
  updatedAgents: number;
}> {
  const rawEnvUrl = (
    process.env.MODELS_GIST_RAW_URL ||
    process.env.MODELS_GIST_URL ||
    DEFAULT_GIST_RAW_URL
  ).trim();
  // Remove qualquer hash de commit fixo para pegar sempre a versão mais recente do Gist
  const cleanGistUrl = rawEnvUrl.replace(/\\/raw\\/[a-f0-9]{20,40}\\//i, '/raw/');
  const fetchUrl = cleanGistUrl + (cleanGistUrl.includes('?') ? '&' : '?') + 't=' + Date.now();

  let activeCatalog: Record<string, { label: string; value: string }[]> = { ...CATALOG_MODELS };
  let source = 'local-fallback';
  const syncedAt = new Date().toISOString();

  try {
    const resp = await fetch(fetchUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache'
      },
      signal: AbortSignal.timeout(7000)
    });

    if (resp.ok) {
      const remote: any = await resp.json();
      if (remote && typeof remote === 'object') {
        const merged: Record<string, { label: string; value: string }[]> = { ...CATALOG_MODELS };
        for (const [prov, list] of Object.entries(remote)) {
          if (!Array.isArray(list)) continue;
          const key = prov.toLowerCase().trim();
          const cleaned = list
            .filter((item: any) => item && item.value)
            .map((item: any) => ({
              label: String(item.label || item.value),
              value: String(item.value).replace(/^models\\//, '').trim()
            }));

          if (!cleaned.some((m) => m.value === 'CUSTOM_INPUT')) {
            cleaned.unshift({ label: '✍️ Inserir ID Manual (' + key.toUpperCase() + ')', value: 'CUSTOM_INPUT' });
          }
          merged[key] = cleaned;

          const firstReal = cleaned.find((m) => m.value !== 'CUSTOM_INPUT');
          if (firstReal) {
            DEFAULT_MODELS[key] = firstReal.value;
          }
        }
        CATALOG_MODELS = merged;
        activeCatalog = merged;
        source = 'github-gist-live';
      }
    }
  } catch (err: any) {
    console.warn('⚠️ [Gist Auto-Sync] Falha ao consultar Gist remoto, mantendo cache/fallback:', err?.message || err);
  }

  // AUTO-HEAL: Atualiza automaticamente no PostgreSQL os Agentes e o Cérebro caso estejam com modelo fora do Gist
  let updatedAgents = 0;
  try {
    for (const [providerKey, modelsList] of Object.entries(activeCatalog)) {
      if (!Array.isArray(modelsList)) continue;
      const validModels = modelsList
        .map((m) => m.value)
        .filter((v) => v && v !== 'CUSTOM_INPUT');

      if (validModels.length === 0) continue;
      const primaryModel = validModels[0];

      const updRes = await pool.query(
        \`UPDATE ai_agents
         SET model = $1, updated_at = NOW()
         WHERE LOWER(provider) = LOWER($2)
           AND (model IS NULL OR model = '' OR NOT (model = ANY($3::text[])));\`,
        [primaryModel, providerKey, validModels]
      );
      updatedAgents += updRes.rowCount || 0;
    }

    const brainRes = await pool.query(
      "SELECT value FROM system_configs WHERE key = 'brain_llm_config' LIMIT 1;"
    );
    if (brainRes.rows.length > 0 && brainRes.rows[0].value) {
      const cfg =
        typeof brainRes.rows[0].value === 'string'
          ? JSON.parse(brainRes.rows[0].value)
          : brainRes.rows[0].value;
      const prov = String(cfg.provider || 'groq').toLowerCase().trim();
      const provModels = (activeCatalog[prov] || [])
        .map((m) => m.value)
        .filter((v) => v && v !== 'CUSTOM_INPUT');

      if (provModels.length > 0 && !provModels.includes(cfg.model)) {
        cfg.model = provModels[0];
        await pool.query(
          "UPDATE system_configs SET value = $1::jsonb, updated_at = NOW() WHERE key = 'brain_llm_config';",
          [JSON.stringify(cfg)]
        );
      }
    }
  } catch (dbErr: any) {
    console.warn('⚠️ [Gist Auto-Heal] Aviso ao alinhar modelos no banco:', dbErr?.message || dbErr);
  }

  return {
    catalog: activeCatalog,
    models: activeCatalog,
    source,
    syncedAt,
    updatedAgents
  };
}

export async function getSupportedModels(_req: Request, res: Response) {
  const result = await syncModelsFromGistAndHealAgents();
  return res.status(200).json({
    success: true,
    source: result.source,
    syncedAt: result.syncedAt,
    updatedAgents: result.updatedAgents,
    catalog: result.catalog,
    models: result.models,
    data: result.catalog,
    endpoints: KNOWN_ENDPOINTS
  });
}

`;
    code = replaceBetween(
      code,
      'export async function syncModelsFromGistAndHealAgents(',
      'export const getHomologatedModels = getSupportedModels;',
      newGistSyncBlock,
      false
    );

    fs.writeFileSync(p, code, 'utf8');
    console.log('✅ brainConfigController.ts atualizado (Gist ao vivo + Auto-Heal automático)');
  }

  // 2. src/services/orchestrator/brainConfigAndUtils.ts -> respeita modelos do Gist sem forçar llama-3.3-70b-versatile
  {
    const p = 'src/services/orchestrator/brainConfigAndUtils.ts';
    let code = fs.readFileSync(p, 'utf8');

    const newCredsBlock = `const defaultByProvider: Record<string, string> = {
    groq: 'openai/gpt-oss-20b',
    gemini: 'gemini-2.5-flash',
    openrouter: 'openrouter/free',
    deepseek: 'deepseek-chat',
    openai: 'gpt-4o-mini',
    ollama: 'llama3.1:8b'
  };

  let model =
    customModel && customModel.trim() && customModel !== 'CUSTOM_INPUT'
      ? customModel.trim()
      : defaultByProvider[p] || 'openai/gpt-oss-20b';

  if (p === 'gemini' && !model.startsWith('gemini')) {
    model = 'gemini-2.5-flash';
  } else if (p === 'deepseek' && !model.startsWith('deepseek')) {
    model = 'deepseek-chat';
  } else if (p === 'openrouter' && !model.includes('/') && model !== 'openrouter/free') {
    model = 'openrouter/free';
  } else if (p === 'openai' && (model.includes('llama') || model.includes('gpt-oss') || model.includes('gemini') || model.includes('deepseek'))) {
    model = 'gpt-4o-mini';
  } else if (p === 'groq' && (model.startsWith('gemini') || model.startsWith('gpt-4') || model.startsWith('claude'))) {
    model = 'openai/gpt-oss-20b';
  }

  `;
    code = replaceBetween(
      code,
      'const defaultByProvider: Record<string, string> = {',
      'return { provider: p, apiKey:',
      newCredsBlock,
      false
    );
    fs.writeFileSync(p, code, 'utf8');
    console.log('✅ brainConfigAndUtils.ts alinhado com os modelos do Gist');
  }

  // 3. src/services/orchestrator/motorInferencaLLM.ts -> usa o modelo ativo do Gist/banco sem chamar llama-3.3-70b-versatile
  {
    const p = 'src/services/orchestrator/motorInferencaLLM.ts';
    let code = fs.readFileSync(p, 'utf8');

    const newEnvHelper = `export function obterChaveContingenciaEnv(provider: string): string {
  const p = (provider || 'groq').toLowerCase().trim();
  const generic = limparMascaraChave(process.env.LLM_API_KEY, p);
  const belongsToOther =
    (p !== 'groq' && generic.startsWith('gsk_')) ||
    (p !== 'gemini' && generic.startsWith('AIza')) ||
    (p !== 'openrouter' && generic.startsWith('sk-or-'));
  const safeGeneric = belongsToOther ? '' : generic;

  if (p === 'groq') return limparMascaraChave(process.env.GROQ_API_KEY, p) || safeGeneric;
  if (p === 'gemini') return limparMascaraChave(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY, p) || safeGeneric;
  if (p === 'openrouter') return limparMascaraChave(process.env.OPENROUTER_API_KEY, p) || safeGeneric;
  if (p === 'deepseek') return limparMascaraChave(process.env.DEEPSEEK_API_KEY, p) || safeGeneric;
  if (p === 'openai') return limparMascaraChave(process.env.OPENAI_API_KEY, p) || safeGeneric;
  return '';
}

`;
    code = replaceBetween(code, 'export function obterChaveContingenciaEnv(', 'export async function chamarLLMCompativelOpenAI(', newEnvHelper, false);

    // No driver Gemini, usa diretamente o modelo selecionado/Gist (fallback gemini-2.5-flash)
    code = code.replace(
      /const modeloPrimario =\s*!rawGemModel\.startsWith\('gemini'\)[\s\S]*?:\s*rawGemModel;/,
      "const modeloPrimario = !rawGemModel.startsWith('gemini') ? 'gemini-2.5-flash' : rawGemModel;"
    );

    // Na Groq, remove llama-3.3-70b-versatile e usa o modelo configurado + openai/gpt-oss-20b / 120b
    const newGroqCandidates = `let modeloAlvo = creds.model;
  if (provider === 'groq' && !modeloAlvo) {
    modeloAlvo = 'openai/gpt-oss-20b';
  } else if (provider === 'deepseek' && (!modeloAlvo || !modeloAlvo.startsWith('deepseek'))) {
    modeloAlvo = 'deepseek-chat';
  }

  const modelosCandidatos =
    provider === 'groq'
      ? Array.from(new Set([modeloAlvo, 'openai/gpt-oss-20b', 'openai/gpt-oss-120b']))
      : provider === 'deepseek'
      ? Array.from(new Set([modeloAlvo, 'deepseek-chat']))
      : [modeloAlvo];`;

    code = replaceBetween(
      code,
      'let modeloAlvo = creds.model;',
      'let ultimoErro: any = null;',
      newGroqCandidates + '\n\n  ',
      false
    );

    fs.writeFileSync(p, code, 'utf8');
    console.log('✅ motorInferencaLLM.ts atualizado (sem 404 da Groq e respeitando Gist)');
  }

  // 4. src/services/orchestrator/resilientLlmRouter.ts -> remove llama-3.3-70b-versatile da escada
  {
    const p = 'src/services/orchestrator/resilientLlmRouter.ts';
    let code = fs.readFileSync(p, 'utf8');
    const newLadder = `export const ECONOMIC_FAILOVER_LADDER: Array<{
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

`;
    code = replaceBetween(code, 'export const ECONOMIC_FAILOVER_LADDER:', 'function cleanKey(', newLadder, false);
    fs.writeFileSync(p, code, 'utf8');
    console.log('✅ resilientLlmRouter.ts atualizado');
  }

  // 5. Garante que não ficou nenhuma referência perdida a llama-3.3-70b-versatile nos controllers/services
  for (const rel of FILES) {
    let c = fs.readFileSync(rel, 'utf8');
    if (c.includes('llama-3.3-70b-versatile')) {
      c = c.replace(/llama-3\.3-70b-versatile/g, 'openai/gpt-oss-20b');
      fs.writeFileSync(rel, c, 'utf8');
    }
  }

  // 6. Alinha PostgreSQL com os modelos ativos da Groq caso algum tenha ficado com 70b-versatile
  const sqlFix = `
UPDATE system_configs
SET value = jsonb_set(value, '{model}', '"openai/gpt-oss-120b"'), updated_at = NOW()
WHERE key = 'brain_llm_config' AND value->>'model' = 'llama-3.3-70b-versatile';

UPDATE ai_agents
SET model = 'openai/gpt-oss-20b', updated_at = NOW()
WHERE model = 'llama-3.3-70b-versatile';
`;
  try {
    execSync('sudo -u postgres psql -d postgres', { input: sqlFix, stdio: ['pipe', 'inherit', 'inherit'] });
    console.log('✅ PostgreSQL alinhado');
  } catch (e) {
    console.warn('⚠️ Aviso PostgreSQL:', e.message);
  }

  // 7. Compila Backend + Frontend e reinicia PM2
  console.log('🔨 Compilando backend e frontend...');
  execSync('npm run build && npm run build:frontend', { stdio: 'inherit' });
  console.log('🚀 Reiniciando PM2...');
  execSync('pm2 flush && pm2 restart all --update-env && pm2 save', { stdio: 'inherit' });

  // 8. Sincroniza com GitHub (origin/main)
  console.log('📤 Enviando para GitHub (origin/main)...');
  execSync('git add -A', { stdio: 'inherit' });
  try {
    execSync('git commit -m "feat(gist): sincronizacao automatica ao vivo do GitHub Gist e auto-heal dos agentes"', { stdio: 'inherit' });
  } catch {
    console.log('ℹ️ Sem alterações adicionais para commit.');
  }
  execSync('git push origin main', { stdio: 'inherit' });

  fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  console.log('\n🎉 SINCRONIZAÇÃO AUTOMÁTICA VIA GIST ATIVA E ENVIADA AO GITHUB!');
} catch (err) {
  console.error('\n❌ ERRO:', err.message);
  rollback();
  process.exit(1);
}
