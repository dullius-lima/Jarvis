import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BACKUP_DIR = '.backup_frente12';
const TARGET_FILES = [
  'vite.config.ts',
  'src/models/databaseSetup.ts',
  'src/controllers/brainConfigController.ts',
  'src/services/orchestrator/brainConfigAndUtils.ts',
  'src/services/orchestrator/motorInferencaLLM.ts',
  'src/services/orchestrator/executorConectorApi.ts',
  'src/services/orchestrator/esteiraEspecialistas.ts',
  'src/services/orchestrator/resilientLlmRouter.ts'
];

const DUPLICATES_TO_REMOVE = [
  'src/controllers/orchestratorService.ts',
  'src/controllers/motorInferencaLLM.ts',
  'src/services/orchestrator/orchestratorService.ts',
  'src/services/orchestrator/brainConfigController.ts',
  'src/services/orchestratorService.ts.bkp_react',
  'src/services/integrationService.ts.save',
  'src/services/integrationService.ts.save.1',
  'src/services/orchestrator/despachanteFerramentas.ts.bkp_react',
  'src/services/orchestrator/esteiraEspecialistas.ts.bkp_react',
  'src/main/AndroidManifest.xml'
];

fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });
for (const rel of TARGET_FILES) {
  if (fs.existsSync(rel)) {
    const dest = path.join(BACKUP_DIR, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(rel, dest);
  }
}
console.log('📦 Backup de segurança criado em ' + BACKUP_DIR);

function rollback() {
  for (const rel of TARGET_FILES) {
    const src = path.join(BACKUP_DIR, rel);
    if (fs.existsSync(src)) fs.copyFileSync(src, rel);
  }
  console.error('↩️ Rollback automático executado. Arquivos restaurados.');
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
  // 0. Proteger .env e blindar .gitignore
  if (fs.existsSync('.env')) {
    fs.copyFileSync('.env', path.join(process.env.HOME || '/tmp', 'env_backup_jarvis'));
  }
  const gitignoreContent = [
    'node_modules/',
    'dist/',
    'whisper-env/',
    '.env',
    '.env.local',
    'backups/',
    '.backup_*',
    'models/',
    '__pycache__/',
    '*.pyc',
    '*.bak',
    '*.enc',
    '*.log',
    '.DS_Store',
    'Thumbs.db',
    'android/.gradle/',
    'android/app/build/',
    'android/build/'
  ].join('\n') + '\n';
  fs.writeFileSync('.gitignore', gitignoreContent, 'utf8');

  // 1. Remover arquivos duplicados e backups órfãos
  for (const dup of DUPLICATES_TO_REMOVE) {
    if (fs.existsSync(dup)) {
      try {
        execSync('git rm -f "' + dup + '"', { stdio: 'ignore' });
      } catch {
        fs.unlinkSync(dup);
      }
      console.log('🗑️ Removido duplicado/backup: ' + dup);
    }
  }
  if (fs.existsSync('src/main') && fs.readdirSync('src/main').length === 0) {
    fs.rmdirSync('src/main');
  }

  // 2. vite.config.ts -> emptyOutDir: false (preserva dist/server.js)
  if (fs.existsSync('vite.config.ts')) {
    let viteCode = fs.readFileSync('vite.config.ts', 'utf8');
    viteCode = viteCode.replace(/emptyOutDir:\s*true/g, 'emptyOutDir: false');
    fs.writeFileSync('vite.config.ts', viteCode, 'utf8');
    console.log('✅ vite.config.ts atualizado (emptyOutDir: false)');
  }

  // 3. brainConfigController.ts -> limpa duplicatas e corrige modelos Groq/Gemini
  {
    const p = 'src/controllers/brainConfigController.ts';
    let code = fs.readFileSync(p, 'utf8');

    const newTop = `// src/controllers/brainConfigController.ts
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
    { label: 'Llama 3.3 70B Versatile (Recomendado / Tools)', value: 'llama-3.3-70b-versatile' },
    { label: 'GPT-OSS 120B (Reasoning / Tools)', value: 'openai/gpt-oss-120b' },
    { label: 'GPT-OSS 20B (Ultra-Rápido)', value: 'openai/gpt-oss-20b' },
    { label: 'Qwen 3 32B (Tool Calling)', value: 'qwen/qwen3-32b' },
    { label: 'Llama 3.1 8B Instant (Ultra-Rápido)', value: 'llama-3.1-8b-instant' }
  ],
  gemini: [
    { label: '✍️ Inserir ID Manual do Gemini', value: 'CUSTOM_INPUT' },
    { label: 'Gemini 2.5 Flash (Free Tier Recomendado)', value: 'gemini-2.5-flash' },
    { label: 'Gemini 2.5 Flash-Lite (Ultra-Leve)', value: 'gemini-2.5-flash-lite' },
    { label: 'Gemini 2.5 Pro (Análise Profunda)', value: 'gemini-2.5-pro' },
    { label: 'Gemini 2.0 Flash (Free Tier)', value: 'gemini-2.0-flash' }
  ],
  openrouter: [
    { label: '✍️ Inserir ID Manual do OpenRouter', value: 'CUSTOM_INPUT' },
    { label: 'Llama 3.3 70B Instruct (100% Gratuito :free)', value: 'meta-llama/llama-3.3-70b-instruct:free' },
    { label: 'DeepSeek R1 (100% Gratuito :free)', value: 'deepseek/deepseek-r1:free' },
    { label: 'DeepSeek V3 Chat (100% Gratuito :free)', value: 'deepseek/deepseek-chat:free' },
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

`;
    const gistIdx = code.indexOf('const DEFAULT_GIST_RAW_URL =');
    if (gistIdx === -1) throw new Error('DEFAULT_GIST_RAW_URL não encontrado em brainConfigController.ts');
    code = newTop + code.slice(gistIdx);

    const newSanitize = `function sanitizeModelForProvider(provider: string, rawModel?: string): string {
  const m = (rawModel || '').trim().replace(/^models\\//, '');
  if (!m || m === 'CUSTOM_INPUT') {
    return DEFAULT_MODELS[provider] || 'llama-3.3-70b-versatile';
  }
  if (provider === 'gemini') {
    if (m.includes('3.8') || m.includes('4-argon') || !m.startsWith('gemini')) {
      return DEFAULT_MODELS.gemini;
    }
    return m;
  }
  if (provider === 'groq') {
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

`;
    code = replaceBetween(code, 'function sanitizeModelForProvider(', 'function normalizeModelsCatalog(', newSanitize, false);

    const newGetSupported = `export async function getSupportedModels(_req: Request, res: Response) {
  const fallbackCatalog: Record<string, { label: string; value: string }[]> = { ...CATALOG_MODELS };
  try {
    const resp = await fetch(DEFAULT_GIST_RAW_URL + '?t=' + Date.now(), {
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
              value: String(item.value)
                .replace(/^models\\//, '')
                .replace('gemini-3.8-flash', 'gemini-2.5-flash')
                .replace('gemini-3.8-pro', 'gemini-2.5-pro')
                .trim()
            }))
            .filter((item) => item.value !== 'gemini-4-argon');

          const finalList = [...cleaned];
          if (fallbackCatalog[key]) {
            for (const reqModel of fallbackCatalog[key]) {
              if (!finalList.some((m) => m.value === reqModel.value)) {
                finalList.push(reqModel);
              }
            }
          }
          if (!finalList.some((m) => m.value === 'CUSTOM_INPUT')) {
            finalList.unshift({ label: '✍️ Inserir ID Manual (' + key.toUpperCase() + ')', value: 'CUSTOM_INPUT' });
          }
          merged[key] = finalList;
        }
        return res.status(200).json({ success: true, catalog: merged, source: 'github-gist-live' });
      }
    }
  } catch {}
  return res.status(200).json({ success: true, catalog: fallbackCatalog, source: 'local-fallback' });
}

`;
    code = replaceBetween(code, 'export async function getSupportedModels(', 'export const getHomologatedModels = getSupportedModels;', newGetSupported, false);

    code = code.replace(
      "if (apiKey && normalizedProvider !== 'ollama') headers['Authorization'] = `Bearer ${apiKey}`;",
      "if (apiKey && normalizedProvider !== 'ollama') headers['Authorization'] = 'Bearer ' + apiKey;\n  if (normalizedProvider === 'openrouter') { headers['HTTP-Referer'] = 'https://jarvis.local'; headers['X-Title'] = 'JARVIS Neural Core'; }"
    );

    fs.writeFileSync(p, code, 'utf8');
    console.log('✅ brainConfigController.ts atualizado');
  }

  // 4. brainConfigAndUtils.ts -> defaults Groq/Gemini atualizados
  {
    const p = 'src/services/orchestrator/brainConfigAndUtils.ts';
    let code = fs.readFileSync(p, 'utf8');
    const newDefaultsBlock = `const defaultByProvider: Record<string, string> = {
    groq: 'llama-3.3-70b-versatile',
    gemini: 'gemini-2.5-flash',
    openrouter: 'openrouter/free',
    deepseek: 'deepseek-chat',
    openai: 'gpt-4o-mini',
    ollama: 'llama3.1:8b'
  };

  let model =
    customModel && customModel.trim() && customModel !== 'CUSTOM_INPUT'
      ? customModel.trim()
      : defaultByProvider[p] || 'llama-3.3-70b-versatile';

  if (p === 'gemini' && (!model.startsWith('gemini') || model.includes('argon') || model.includes('3.8'))) {
    model = 'gemini-2.5-flash';
  } else if (p === 'deepseek' && !model.startsWith('deepseek')) {
    model = 'deepseek-chat';
  } else if (p === 'openrouter' && !model.includes('/') && model !== 'openrouter/free') {
    model = 'openrouter/free';
  } else if (p === 'openai' && (model.includes('llama') || model.includes('gpt-oss') || model.includes('gemini') || model.includes('deepseek'))) {
    model = 'gpt-4o-mini';
  } else if (p === 'groq' && (model.startsWith('gemini') || model.startsWith('gpt-4') || model.startsWith('claude'))) {
    model = 'llama-3.3-70b-versatile';
  }

  `;
    code = replaceBetween(
      code,
      'const defaultByProvider: Record<string, string> = {',
      'return { provider: p, apiKey:',
      newDefaultsBlock,
      false
    );
    fs.writeFileSync(p, code, 'utf8');
    console.log('✅ brainConfigAndUtils.ts atualizado');
  }

  // 5. motorInferencaLLM.ts -> Gemini 2.5 Flash + Tools na Groq (gpt-oss / llama) + remove respLLM morto
  {
    const p = 'src/services/orchestrator/motorInferencaLLM.ts';
    let code = fs.readFileSync(p, 'utf8');
    const newDrivers = `// 1. SUPORTE GOOGLE GEMINI NATIVO
  if (provider === 'gemini') {
    const rawGemModel = (creds.model || options.model || 'gemini-2.5-flash').trim();
    const modeloPrimario =
      !rawGemModel.startsWith('gemini') ||
      rawGemModel.includes('argon') ||
      rawGemModel.includes('3.8')
        ? 'gemini-2.5-flash'
        : rawGemModel;

    const partesFormatadas: any[] = [];
    for (const msg of options.messages) {
      if (Array.isArray(msg.content)) {
        for (const pt of msg.content) {
          if (pt.type === 'text') {
            partesFormatadas.push({ text: '[' + msg.role + ']: ' + pt.text });
          } else if (pt.type === 'image_url' && pt.image_url?.url) {
            const base64Limpo = pt.image_url.url.replace(/^data:image\\/\\w+;base64,/, '');
            partesFormatadas.push({ inline_data: { mime_type: 'image/jpeg', data: base64Limpo } });
          }
        }
      } else {
        partesFormatadas.push({ text: '[' + msg.role + ']: ' + msg.content });
      }
    }

    const geminiToolsPayload = temTools
      ? [
          {
            functionDeclarations: options.tools!
              .filter((t: any) => t?.function?.name)
              .map((t: any) => ({
                name: t.function.name,
                description: t.function.description || 'Ferramenta ' + t.function.name,
                parameters: (() => {
                  const pr = JSON.parse(JSON.stringify(t.function.parameters || { type: 'object', properties: {} }));
                  delete pr.additionalProperties;
                  delete pr.$schema;
                  if (!pr.properties || Object.keys(pr.properties).length === 0) {
                    pr.properties = { confirmar: { type: 'boolean' } };
                  }
                  return pr;
                })()
              }))
          }
        ]
      : undefined;

    const urlGemini = 'https://generativelanguage.googleapis.com/v1beta/models/' + modeloPrimario + ':generateContent?key=' + apiKey;
    const payloadGemini: any = {
      contents: [{ parts: partesFormatadas }],
      generationConfig: { temperature: options.temperature ?? 0.2 }
    };

    if (geminiToolsPayload) payloadGemini.tools = geminiToolsPayload;

    const resp = await fetch(urlGemini, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadGemini),
      signal: AbortSignal.timeout(25000)
    });

    if (resp.ok) {
      const data: any = await resp.json();
      const candidateParts = data?.candidates?.[0]?.content?.parts || [];
      const fnCallParts = candidateParts.filter((pt: any) => pt.functionCall);

      if (fnCallParts.length > 0) {
        return {
          choices: [
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: fnCallParts.map((pt: any, idx: number) => ({
                  id: 'call_' + Date.now() + '_' + idx,
                  type: 'function',
                  function: {
                    name: pt.functionCall.name,
                    arguments: JSON.stringify(pt.functionCall.args || {})
                  }
                }))
              }
            }
          ]
        };
      }

      const contentText = candidateParts.map((pt: any) => pt.text || '').join('\\n').trim();
      return { choices: [{ message: { content: contentText, role: 'assistant' } }] };
    }

    const erroTxt = await resp.text();
    throw new Error('Gemini (' + modeloPrimario + ') indisponível: ' + erroTxt.slice(0, 180));
  }

  // 2. SUPORTE GROQ, OPENROUTER, DEEPSEEK, OPENAI E OLLAMA
  const resolvedBaseURL =
    provider === 'deepseek' && !creds.baseURL.includes('deepseek.com')
      ? 'https://api.deepseek.com/v1'
      : creds.baseURL || 'https://api.groq.com/openai/v1';

  const defaultHeaders: Record<string, string> =
    provider === 'openrouter'
      ? { 'HTTP-Referer': 'https://jarvis.local', 'X-Title': 'JARVIS Neural Core' }
      : {};

  const client = new OpenAI({
    apiKey: apiKey || 'ollama',
    baseURL: resolvedBaseURL,
    defaultHeaders,
    timeout: 35000
  });

  let modeloAlvo = creds.model;
  if (provider === 'groq' && (!modeloAlvo || modeloAlvo.includes('deepseek-r1'))) {
    modeloAlvo = 'llama-3.3-70b-versatile';
  } else if (provider === 'deepseek' && (!modeloAlvo || !modeloAlvo.startsWith('deepseek'))) {
    modeloAlvo = 'deepseek-chat';
  }

  const modelosCandidatos =
    provider === 'groq'
      ? Array.from(new Set([modeloAlvo, 'llama-3.3-70b-versatile', 'openai/gpt-oss-120b']))
      : provider === 'deepseek'
      ? Array.from(new Set([modeloAlvo, 'deepseek-chat']))
      : [modeloAlvo];

  let ultimoErro: any = null;
  for (const modelo of modelosCandidatos) {
    if (!modelo) continue;
    try {
      const payload: any = { model: modelo, messages: options.messages };
      const semTemperatura = modelo === 'deepseek-reasoner' || modelo.includes('o3-mini');
      const semTools = modelo === 'deepseek-reasoner';

      if (!semTemperatura) payload.temperature = options.temperature ?? 0.2;
      if (options.tools && options.tools.length > 0 && !semTools) {
        payload.tools = options.tools;
        payload.tool_choice = 'auto';
        if (provider === 'groq') {
          payload.parallel_tool_calls = false;
        }
      }

      const rawResp = await client.chat.completions.create(payload);
      const respLLM = _converterXmlToolCallsParaNativo(
        rawResp,
        Boolean(temTools || payload?.tools?.length)
      );
      console.log('🧠 [LLM Real] Provedor: ' + provider.toUpperCase() + ' | Solicitado: ' + modelo + ' | Respondido: ' + (respLLM?.model || modelo));
      return respLLM;
    } catch (err: any) {
      ultimoErro = err;
      console.warn('[LLM Tools Falhou]', modelo, err?.status || '', String(err?.message || err).slice(0, 220));
      if (options.tools && options.tools.length > 0) {
        try {
          return await client.chat.completions.create({ model: modelo, messages: options.messages });
        } catch (innerErr: any) {
          ultimoErro = innerErr;
        }
      }
    }
  }

  `;
    code = replaceBetween(code, '// 1. SUPORTE GOOGLE GEMINI NATIVO', "if (provider !== 'groq') {", newDrivers, false);
    fs.writeFileSync(p, code, 'utf8');
    console.log('✅ motorInferencaLLM.ts atualizado');
  }

  // 6. executorConectorApi.ts -> elimina recursão infinita em normalizarChamadaMcp
  {
    const p = 'src/services/orchestrator/executorConectorApi.ts';
    let code = fs.readFileSync(p, 'utf8');
    const newMcpNorm = `// [MCP_ARGS_NORMALIZER_START]
function normalizarChamadaMcp(
  slugStr: string,
  urlStr: string,
  argsObj: Record<string, any>,
  currentToolName: string,
  currentToolArgs: Record<string, any>
) {
  let toolName = currentToolName;
  let toolArgs = currentToolArgs || {};
  const isFetch = String(slugStr || '').toLowerCase().includes('fetch') || String(urlStr || '').includes(':8013');
  if (isFetch) {
    toolName = 'fetch';
    const candidatoUrl = String(toolArgs?.url || argsObj?.url || argsObj?.endpoint || argsObj?.query || '').trim();
    const termo = String(argsObj?.symbol || argsObj?.ticker || (!candidatoUrl.startsWith('http') ? candidatoUrl : '') || 'CMIN3').trim();
    const rawUrl = candidatoUrl.startsWith('http')
      ? candidatoUrl
      : 'https://news.google.com/rss/search?q=' + encodeURIComponent(termo + ' B3') + '&hl=pt-BR&gl=BR&ceid=BR:pt-419';
    toolArgs = {
      url: rawUrl,
      max_length: Number(toolArgs?.max_length || argsObj?.max_length || 4500),
      raw: true
    };
  }
  return { toolName, toolArgs };
}
// [MCP_ARGS_NORMALIZER_END]`;
    code = replaceBetween(code, '// [MCP_ARGS_NORMALIZER_START]', '// [MCP_ARGS_NORMALIZER_END]', newMcpNorm, true);

    if (!code.includes('const normMcp = normalizarChamadaMcp(')) {
      code = code.replace(
        'const mcpRes = await fetch(targetUrl, {',
        'const normMcp = normalizarChamadaMcp(_slug, targetUrl, argsObj, toolName, toolArgs || {});\n      toolName = normMcp.toolName;\n      toolArgs = normMcp.toolArgs;\n\n      const mcpRes = await fetch(targetUrl, {'
      );
    }
    fs.writeFileSync(p, code, 'utf8');
    console.log('✅ executorConectorApi.ts atualizado');
  }

  // 7. esteiraEspecialistas.ts -> baseURL correto + anti-loop ativo
  {
    const p = 'src/services/orchestrator/esteiraEspecialistas.ts';
    let code = fs.readFileSync(p, 'utf8');
    code = code.replace(/baseUrl:\s*credenciaisResolvidas\.baseUrl/g, 'baseUrl: credenciaisResolvidas.baseURL');

    const anchor = 'if (currentPayload?.symbol && !fnArgs.symbol) fnArgs.symbol = currentPayload.symbol;';
    if (code.includes(anchor) && !code.includes('const sigChamada =')) {
      const antiLoop = anchor + `

          const sigChamada = currentAgent.slug + '::' + fnName + '::' + JSON.stringify(fnArgs);
          if (__chamadasExecutadasNoTurno.has(sigChamada)) {
            mensagensEspecialista.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: fnName,
              content: JSON.stringify({
                status: 'skipped_duplicate',
                message: 'A ferramenta ' + fnName + ' já foi executada com os mesmos parâmetros neste turno. Use o resultado anterior.'
              })
            });
            continue;
          }
          __chamadasExecutadasNoTurno.add(sigChamada);`;
      code = code.replace(anchor, antiLoop);
    }
    fs.writeFileSync(p, code, 'utf8');
    console.log('✅ esteiraEspecialistas.ts atualizado');
  }

  // 8. resilientLlmRouter.ts -> cascata com modelos reais ativos
  {
    const p = 'src/services/orchestrator/resilientLlmRouter.ts';
    let code = fs.readFileSync(p, 'utf8');
    const newLadder = `export const ECONOMIC_FAILOVER_LADDER: Array<{
  provider: string;
  model: string;
  tier: string;
}> = [
  { provider: 'gemini', model: 'gemini-2.5-flash', tier: 'Cota Gratuita Google Gemini (Ativo)' },
  { provider: 'groq', model: 'llama-3.3-70b-versatile', tier: 'Groq LPU Principal (Tool Calling)' },
  { provider: 'groq', model: 'openai/gpt-oss-120b', tier: 'Groq LPU Reasoning (Organização Liberada)' },
  { provider: 'groq', model: 'qwen/qwen3-32b', tier: 'Groq Alternativo (Tool Calling)' },
  { provider: 'groq', model: 'openai/gpt-oss-20b', tier: 'Groq Ultra-Econômico' },
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

  // 9. Migrar eventuais registros legados gemini-3.8-flash no PostgreSQL
  const sqlFix = `
UPDATE system_configs
SET value = jsonb_set(value, '{model}', '"gemini-2.5-flash"')
WHERE key = 'brain_llm_config' AND value->>'model' LIKE '%3.8%';

UPDATE ai_agents
SET model = 'gemini-2.5-flash', updated_at = NOW()
WHERE LOWER(provider) = 'gemini' AND model LIKE '%3.8%';
`;
  try {
    execSync('sudo -u postgres psql -d postgres', { input: sqlFix, stdio: ['pipe', 'inherit', 'inherit'] });
    console.log('✅ PostgreSQL alinhado com gemini-2.5-flash');
  } catch (dbErr) {
    console.warn('⚠️ Aviso PostgreSQL (não bloqueante):', dbErr.message);
  }

  // 10. Compilar Backend e Frontend
  console.log('🔨 Compilando backend e frontend...');
  execSync('npm run build && npm run build:frontend', { stdio: 'inherit' });
  if (!fs.existsSync('dist/server.js')) {
    throw new Error('dist/server.js não foi gerado após o build!');
  }

  // 11. Reiniciar PM2
  console.log('🚀 Reiniciando processos no PM2...');
  execSync('pm2 flush && pm2 restart all --update-env && pm2 save', { stdio: 'inherit' });

  // 12. Enviar commit limpo para o GitHub
  console.log('📤 Sincronizando com GitHub (origin/main)...');
  execSync('git config user.name "Matheus Dulius" && git config user.email "matheusdullius@gmail.com"', { stdio: 'inherit' });
  execSync('git add -A', { stdio: 'inherit' });
  try {
    execSync('git commit -m "fix(llm,build): remove duplicados, ativa tools na Groq e corrige Gemini 2.5 Flash"', { stdio: 'inherit' });
  } catch {
    console.log('ℹ️ Nenhuma alteração pendente para novo commit.');
  }
  execSync('git push origin main', { stdio: 'inherit' });

  fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  console.log('\n🎉 FRENTES 1 + 2 CONCLUÍDAS, COMPILADAS E ENVIADAS AO GITHUB!');
} catch (err) {
  console.error('\n❌ ERRO NA APLICAÇÃO:', err.message);
  rollback();
  process.exit(1);
}
