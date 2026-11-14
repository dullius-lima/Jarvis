// src/services/orchestrator/motorInferencaLLM.ts
import OpenAI from 'openai';
import { resolveProviderCredentials } from './brainConfigAndUtils.js';

export function normalizarTexto(str: string): string {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim();
}

/**
 * Higieniza chaves de API removendo máscaras e garantindo que 'ollama' não vaze para APIs em nuvem
 */
export function limparMascaraChave(rawKey?: any, provider?: string): string {
  if (!rawKey) return '';
  let k = String(rawKey)
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^["']+|["']+$/g, '')
    .replace(/[•*]/g, '')
    .trim();

  const prov = (provider || '').toLowerCase().trim();
  if (
    !k ||
    k === 'undefined' ||
    k === 'null' ||
    k.length < 5 ||
    (k.toLowerCase() === 'ollama' && prov !== 'ollama')
  ) {
    return '';
  }

  if (/^gsk_/i.test(k)) k = 'gsk_' + k.slice(4);
  else if (/^aiza/i.test(k)) k = 'AIza' + k.slice(4);
  else if (/^sk-or-/i.test(k)) k = 'sk-or-' + k.slice(6);

  return k;
}

export function obterChaveContingenciaEnv(provider: string): string {
  const p = (provider || 'groq').toLowerCase().trim();
  if (p === 'groq') return limparMascaraChave(process.env.GROQ_API_KEY || process.env.LLM_API_KEY, p);
  if (p === 'gemini') return limparMascaraChave(process.env.GEMINI_API_KEY || process.env.LLM_API_KEY, p);
  if (p === 'openrouter') return limparMascaraChave(process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY, p);
  if (p === 'deepseek') return limparMascaraChave(process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY, p);
  if (p === 'openai') return limparMascaraChave(process.env.OPENAI_API_KEY || process.env.LLM_API_KEY, p);
  return '';
}

/**
 * Executa chamadas à LLM com suporte nativo a Function Calling e tratamento estrito de credenciais
 */
export async function chamarLLMCompativelOpenAI(options: {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  messages: any[];
  tools?: any[];
  temperature?: number;
}): Promise<any> {
  const creds = resolveProviderCredentials(
    options.provider,
    options.apiKey,
    options.baseUrl,
    options.model
  );

  const provider = creds.provider.toLowerCase().trim();
  const apiKey =
    limparMascaraChave(creds.apiKey, provider) ||
    limparMascaraChave(options.apiKey, provider) ||
    obterChaveContingenciaEnv(provider);

  if (!apiKey && provider !== 'ollama') {
    throw new Error(
      `Chave de API ausente para o provedor ${provider.toUpperCase()}. Cole sua chave no painel de configurações ou declare no arquivo .env.`
    );
  }

  const temTools = Array.isArray(options.tools) && options.tools.length > 0;

  // 1. SUPORTE GOOGLE GEMINI NATIVO
  if (provider === 'gemini') {
    const rawGemModel = (creds.model || options.model || 'gemini-2.5-flash').trim();
    const modeloPrimario =
      !rawGemModel.startsWith('gemini') ||
      rawGemModel.includes('argon') ||
      rawGemModel.includes('3.8') ||
      rawGemModel.includes('2.0-flash')
        ? 'gemini-2.5-flash'
        : rawGemModel;

    const partesFormatadas: any[] = [];
    for (const msg of options.messages) {
      if (Array.isArray(msg.content)) {
        for (const p of msg.content) {
          if (p.type === 'text') {
            partesFormatadas.push({ text: `[${msg.role}]: ${p.text}` });
          } else if (p.type === 'image_url' && p.image_url?.url) {
            const base64Limpo = p.image_url.url.replace(/^data:image\/\w+;base64,/, '');
            partesFormatadas.push({ inline_data: { mime_type: 'image/jpeg', data: base64Limpo } });
          }
        }
      } else {
        partesFormatadas.push({ text: `[${msg.role}]: ${msg.content}` });
      }
    }

    const geminiToolsPayload = temTools
      ? [
          {
            functionDeclarations: options.tools!
              .filter((t: any) => t?.function?.name)
              .map((t: any) => ({
                name: t.function.name,
                description: t.function.description || `Ferramenta ${t.function.name}`,
                parameters: (() => {
              const p = JSON.parse(JSON.stringify(t.function.parameters || { type: 'object', properties: {} }));
              delete p.additionalProperties;
              delete p.$schema;
              return p;
            })()
              }))
          }
        ]
      : undefined;

    const urlGemini = `https://generativelanguage.googleapis.com/v1beta/models/${modeloPrimario}:generateContent?key=${apiKey}`;
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
      const fnCallPart = candidateParts.find((p: any) => p.functionCall);

      if (fnCallPart && fnCallPart.functionCall) {
        return {
          choices: [
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: `call_${Date.now()}`,
                    type: 'function',
                    function: {
                      name: fnCallPart.functionCall.name,
                      arguments: JSON.stringify(fnCallPart.functionCall.args || {})
                    }
                  }
                ]
              }
            }
          ]
        };
      }

      const contentText = candidateParts.map((p: any) => p.text || '').join('\n').trim();
      return { choices: [{ message: { content: contentText, role: 'assistant' } }] };
    }

    const erroTxt = await resp.text();
    throw new Error(`Gemini indisponível: ${erroTxt.slice(0, 180)}`);
  }

  // 2. SUPORTE GROQ, OPENROUTER, DEEPSEEK, OPENAI E OLLAMA
  const client = new OpenAI({
    apiKey: apiKey || 'ollama',
    baseURL: creds.baseURL,
    timeout: 30000,
    defaultHeaders: provider === 'openrouter' ? { 'HTTP-Referer': 'https://jarvis.local', 'X-Title': 'JARVIS Neural Core' } : undefined
  });

  const modeloInicial = creds.model || options.model;

  const limparParaTexto = (msgs: any[]) => [
    ...msgs
      .filter((msg: any) => msg.role !== 'tool')
      .map((msg: any) => {
        if (msg.role === 'system' && typeof msg.content === 'string') {
          return {
            role: 'system',
            content: msg.content
              .replace(/REGRA CRÍTICA DE EXECUÇÃO:[\s\S]*?\n\n/g, '')
              .replace(/\[REGRA IMPERATIVA[\s\S]*?\n\n/g, '')
          };
        }
        if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
          return { role: 'assistant', content: msg.content || 'A processar...' };
        }
        return { role: msg.role, content: msg.content };
      }),
    { role: 'system', content: 'Responda apenas em texto natural em português, sem chamar funções ou emitir tags <function>.' }
  ];

  const descobrirModeloAtivoNaConta = async (modeloAtual: string): Promise<string | null> => {
    try {
      const resp = await fetch(creds.baseURL.replace(/\/+$/, '') + '/models', {
        headers: apiKey && provider !== 'ollama' ? { Authorization: 'Bearer ' + apiKey } : {}
      });
      if (!resp.ok) return null;
      const json: any = await resp.json();
      const ids: string[] = (Array.isArray(json?.data) ? json.data : [])
        .map((item: any) => String(item?.id || ''))
        .filter((id: string) =>
          id &&
          id !== modeloAtual &&
          !/whisper|tts|guard|embed|orpheus|moderation|vision-preview/i.test(id)
        );
      if (ids.length === 0) return null;
      const preferidos = [
        'llama-3.3-70b-versatile',
        'meta-llama/llama-4-scout-17b-16e-instruct',
        'qwen/qwen3-32b',
        'llama-3.1-8b-instant',
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b'
      ];
      for (const pref of preferidos) {
        if (ids.includes(pref)) return pref;
      }
      return ids[0];
    } catch {
      return null;
    }
  };

  const executarComModelo = async (modeloAlvo: string, usarTools: boolean): Promise<any> => {
    const payload: any = {
      model: modeloAlvo,
      messages: usarTools ? options.messages : limparParaTexto(options.messages),
      temperature: options.temperature ?? 0.2
    };
    if (usarTools) {
      payload.tools = options.tools;
      payload.tool_choice = 'auto';
      if (provider === 'groq') payload.parallel_tool_calls = false;
    }
    return await client.chat.completions.create(payload);
  };

  try {
    return await executarComModelo(modeloInicial, temTools);
  } catch (err: any) {
    const errMsg = String(err?.error?.message || err?.message || '');
    const failedGen = String(err?.error?.failed_generation || errMsg);

    if (temTools && failedGen.includes('<function=')) {
      const fnMatch = failedGen.match(/<function=([a-zA-Z0-9_.-]+)[>\s]*([\s\S]*?)<\/function>/);
      if (fnMatch) {
        const rawArgs = (fnMatch[2] || '{}').trim();
        return {
          choices: [{
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [{
                id: 'call_' + Date.now(),
                type: 'function',
                function: { name: fnMatch[1].trim(), arguments: rawArgs.startsWith('{') ? rawArgs : '{}' }
              }]
            }
          }]
        };
      }
    }

    if (/404|does not exist|do not have access|decommissioned|model_not_found/i.test(errMsg)) {
      const modeloDescoberto = await descobrirModeloAtivoNaConta(modeloInicial);
      if (modeloDescoberto) {
        console.log('🔄 [Auto-Discovery LLM] Alternando para modelo ativo da chave: ' + modeloDescoberto);
        try {
          return await executarComModelo(modeloDescoberto, temTools);
        } catch {
          return await executarComModelo(modeloDescoberto, false);
        }
      }
    }

    return await executarComModelo(modeloInicial, false);
  }
}

export const callOpenAICompatibleLLM = chamarLLMCompativelOpenAI;
