import fs from 'fs';
import { execSync } from 'child_process';

const bkpDir = '.backup_multi_llm';
if (!fs.existsSync(bkpDir)) fs.mkdirSync(bkpDir, { recursive: true });

for (const f of [
  'src/services/orchestrator/brainConfigAndUtils.ts',
  'src/services/orchestrator/motorInferencaLLM.ts',
  'src/services/orchestrator/despachanteFerramentas.ts'
]) {
  if (fs.existsSync(f)) {
    fs.copyFileSync(f, `${bkpDir}/${f.split('/').pop()}`);
  }
}

// 1. brainConfigAndUtils.ts -> Isola chaves por provedor (sem sequestrar para Groq) e valida modelos por provedor
const utilsPath = 'src/services/orchestrator/brainConfigAndUtils.ts';
if (fs.existsSync(utilsPath)) {
  let u = fs.readFileSync(utilsPath, 'utf8');

  u = u.replace(
    /\/\/ Identificação automática por prefixo de chave caso o provedor esteja inconsistente[\s\S]*?baseURL = baseURL\.replace\(\/\\\/\+\$\/, ''\);/,
    `// Identificação automática por prefixo apenas se a chave enviada realmente pertencer a outro provedor
  if (apiKey) {
    if (apiKey.startsWith('gsk_')) p = 'groq';
    else if (apiKey.startsWith('AIza')) p = 'gemini';
    else if (apiKey.startsWith('sk-or-')) p = 'openrouter';
  }

  const endpoints = { ...DEFAULT_KNOWN_ENDPOINTS, ...(KNOWN_ENDPOINTS || {}) };
  let baseURL = (customUrl && customUrl.trim()) || endpoints[p] || endpoints.groq;
  if (p === 'groq' && !baseURL.includes('groq.com')) baseURL = DEFAULT_KNOWN_ENDPOINTS.groq;
  else if (p === 'gemini' && !baseURL.includes('googleapis.com')) baseURL = DEFAULT_KNOWN_ENDPOINTS.gemini;
  else if (p === 'openrouter' && !baseURL.includes('openrouter.ai')) baseURL = DEFAULT_KNOWN_ENDPOINTS.openrouter;
  else if (p === 'deepseek' && !baseURL.includes('deepseek.com')) baseURL = DEFAULT_KNOWN_ENDPOINTS.deepseek;
  else if (p === 'openai' && !baseURL.includes('openai.com')) baseURL = DEFAULT_KNOWN_ENDPOINTS.openai;
  baseURL = baseURL.replace(/\\/+$/, '');`
  );

  u = u.replace(
    /\/\/ Preserva estritamente o modelo escolhido pelo usuário[\s\S]*?return \{ provider: p, apiKey: apiKey \|\| \(p === 'ollama' \? 'ollama' : ''\), baseURL, model \};/,
    `const defaultByProvider: Record<string, string> = {
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

  // Impede que um modelo de outro provedor (ex: gpt-oss-120b ou llama) quebre Gemini, DeepSeek, OpenAI ou OpenRouter
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

  return { provider: p, apiKey: apiKey || (p === 'ollama' ? 'ollama' : ''), baseURL, model };`
  );

  u = u.replace(
    /const vaultKey = savedKeys\[activeProv\] \|\| '';[\s\S]*?const effectiveKey = vaultKey \|\| mainKey \|\| envKey;/,
    `const vaultKey = savedKeys[activeProv] || '';
      const rawMainKey = cleanKey(parsed.api_key);
      // Só usa mainKey se ela não for de outro provedor (evita que gsk_ antiga sequestre Gemini/OpenRouter/DeepSeek)
      const isMainKeyFromOtherProvider =
        (activeProv !== 'groq' && rawMainKey.startsWith('gsk_')) ||
        (activeProv !== 'gemini' && rawMainKey.startsWith('AIza')) ||
        (activeProv !== 'openrouter' && rawMainKey.startsWith('sk-or-'));
      const mainKey = isMainKeyFromOtherProvider ? '' : rawMainKey;

      const envByProvider: Record<string, string> = {
        groq: cleanKey(process.env.GROQ_API_KEY),
        gemini: cleanKey(process.env.GEMINI_API_KEY),
        openrouter: cleanKey(process.env.OPENROUTER_API_KEY),
        deepseek: cleanKey(process.env.DEEPSEEK_API_KEY),
        openai: cleanKey(process.env.OPENAI_API_KEY),
        ollama: 'ollama'
      };
      const genericEnv = cleanKey(process.env.LLM_API_KEY);
      const isGenericFromOther =
        (activeProv !== 'groq' && genericEnv.startsWith('gsk_')) ||
        (activeProv !== 'gemini' && genericEnv.startsWith('AIza')) ||
        (activeProv !== 'openrouter' && genericEnv.startsWith('sk-or-'));

      const envKey = envByProvider[activeProv] || (!isGenericFromOther ? genericEnv : '');
      const effectiveKey = vaultKey || mainKey || envKey;`
  );

  fs.writeFileSync(utilsPath, u, 'utf8');
  console.log('✅ Atualizado: brainConfigAndUtils.ts (isolamento multi-chave e modelos por provedor)');
}

// 2. motorInferencaLLM.ts -> Corrige erro 400 Tool choice is none + limpeza de schema Gemini
const motorPath = 'src/services/orchestrator/motorInferencaLLM.ts';
if (fs.existsSync(motorPath)) {
  let m = fs.readFileSync(motorPath, 'utf8');

  m = m.replace(
    /parameters:\s*t\.function\.parameters\s*\|\|\s*\{\s*type:\s*'OBJECT',\s*properties:\s*\{\}\s*\}/,
    `parameters: (() => {
              const p = JSON.parse(JSON.stringify(t.function.parameters || { type: 'object', properties: {} }));
              delete p.additionalProperties;
              delete p.$schema;
              return p;
            })()`
  );

  m = m.replace(
    /if\s*\(\s*temTools\s*\)\s*\{\s*payload\.tools\s*=\s*options\.tools;\s*payload\.tool_choice\s*=\s*'auto';\s*\}/,
    `if (temTools) {
    payload.tools = options.tools;
    payload.tool_choice = 'auto';
  } else {
    payload.messages = [
      ...options.messages.map((msg: any) =>
        msg.role === 'system' && typeof msg.content === 'string'
          ? { ...msg, content: msg.content.replace(/REGRA CRÍTICA DE EXECUÇÃO:[\\s\\S]*?\\n\\n/, '') }
          : msg
      ),
      {
        role: 'system',
        content: 'Responda exclusivamente em texto natural em português, sem chamar funções ou ferramentas.'
      }
    ];
  }`
  );

  const oldCatch = /try\s*\{\s*return await client\.chat\.completions\.create\(payload\);\s*\}\s*catch\s*\(err:\s*any\)\s*\{[\s\S]*?throw err;\s*\}/;
  const newCatch = `try {
    return await client.chat.completions.create(payload);
  } catch (err: any) {
    const errMsg = String(err?.message || '');
    const failedGen = String(err?.error?.failed_generation || errMsg);

    if (temTools && failedGen.includes('<function=')) {
      const fnMatch = failedGen.match(/<function=([a-zA-Z0-9_-]+)>([\\s\\S]*?)<\\/function>/);
      if (fnMatch) {
        return {
          choices: [{
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [{
                id: \`call_\${Date.now()}\`,
                type: 'function',
                function: { name: fnMatch[1], arguments: fnMatch[2].trim() || '{}' }
              }]
            }
          }]
        };
      }
    }

    delete payload.tools;
    delete payload.tool_choice;
    payload.messages = [
      ...options.messages.map((msg: any) =>
        msg.role === 'system' && typeof msg.content === 'string'
          ? { ...msg, content: msg.content.replace(/REGRA CRÍTICA DE EXECUÇÃO:[\\s\\S]*?\\n\\n/, '') }
          : msg
      ),
      {
        role: 'system',
        content: 'Responda exclusivamente em texto natural em português, sem chamar funções ou ferramentas.'
      }
    ];
    return await client.chat.completions.create(payload);
  }`;

  if (oldCatch.test(m)) {
    m = m.replace(oldCatch, newCatch);
  }

  fs.writeFileSync(motorPath, m, 'utf8');
  console.log('✅ Atualizado: motorInferencaLLM.ts (proteção 400 tool_choice + Gemini)');
}

// 3. despachanteFerramentas.ts -> Remove diretriz de chamar ferramentas na 2ª passada de síntese
const despPath = 'src/services/orchestrator/despachanteFerramentas.ts';
if (fs.existsSync(despPath)) {
  let d = fs.readFileSync(despPath, 'utf8');
  d = d.replace(
    /\$\{configuracaoCerebro\.system_prompt \|\| 'Você é o JARVIS\.'\}/g,
    `\${String(configuracaoCerebro.system_prompt || 'Você é o JARVIS.').replace(/REGRA CRÍTICA DE EXECUÇÃO:[\\s\\S]*?\\n\\n/, '')}`
  );
  fs.writeFileSync(despPath, d, 'utf8');
  console.log('✅ Atualizado: despachanteFerramentas.ts');
}

console.log('🔨 Compilando backend...');
execSync('npm run build', { stdio: 'inherit' });

console.log('🚀 Reiniciando PM2...');
execSync('pm2 restart jarvis --update-env', { stdio: 'inherit' });
