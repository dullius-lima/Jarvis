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

export function limparMascaraChave(rawKey?: any): string {
  if (!rawKey) return '';
  let k = String(rawKey)
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^["']+|["']+$/g, '')
    .replace(/[•*]/g, '')
    .trim();

  if (!k || k === 'undefined' || k === 'null' || k.length < 5) {
    return '';
  }

  if (/^gsk_/i.test(k)) k = 'gsk_' + k.slice(4);
  else if (/^aiza/i.test(k)) k = 'AIza' + k.slice(4);
  else if (/^sk-or-/i.test(k)) k = 'sk-or-' + k.slice(6);

  return k;
}

export function obterChaveContingenciaEnv(provider: string): string {
  const p = (provider || 'groq').toLowerCase().trim();
  if (p === 'groq') return limparMascaraChave(process.env.GROQ_API_KEY || process.env.LLM_API_KEY);
  if (p === 'gemini') return limparMascaraChave(process.env.GEMINI_API_KEY || process.env.LLM_API_KEY);
  if (p === 'openrouter') return limparMascaraChave(process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY);
  if (p === 'deepseek') return limparMascaraChave(process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY);
  if (p === 'openai') return limparMascaraChave(process.env.OPENAI_API_KEY || process.env.LLM_API_KEY);
  return '';
}

/**
 * Executa chamadas à LLM compatível com a API da OpenAI, com suporte nativo a Function Calling na Groq e no Gemini
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
    limparMascaraChave(creds.apiKey) ||
    limparMascaraChave(options.apiKey) ||
    obterChaveContingenciaEnv(provider);

  const temTools = Array.isArray(options.tools) && options.tools.length > 0;

  // --------------------------------------------------------------------------
  // 1. SUPORTE GOOGLE GEMINI NATIVO (COM FUNCTION CALLING / TOOLS)
  // --------------------------------------------------------------------------
  if (provider === 'gemini') {
    const rawGemModel = (creds.model || options.model || 'gemini-2.5-flash').trim();
    const modeloPrimario =
      !rawGemModel.startsWith('gemini') ||
      rawGemModel.includes('argon') ||
      rawGemModel.includes('3.8') ||
      rawGemModel.includes('2.0-flash')
        ? 'gemini-2.5-flash'
        : rawGemModel;

    const modelosGeminiCandidatos = Array.from(
      new Set([modeloPrimario, 'gemini-2.5-flash', 'gemini-1.5-flash'])
    );

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
                description: t.function.description || `Aciona o especialista ou ferramenta ${t.function.name}`,
                parameters: t.function.parameters || { type: 'OBJECT', properties: {} }
              }))
          }
        ]
      : undefined;

    let ultimoErroGemini = '';

    for (const modGem of modelosGeminiCandidatos) {
      try {
        const urlGemini = `https://generativelanguage.googleapis.com/v1beta/models/${modGem}:generateContent?key=${apiKey}`;
        const payloadGemini: any = {
          contents: [{ parts: partesFormatadas }],
          generationConfig: { temperature: options.temperature ?? 0.2 }
        };

        if (geminiToolsPayload) {
          payloadGemini.tools = geminiToolsPayload;
        }

        let resp = await fetch(urlGemini, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadGemini),
          signal: AbortSignal.timeout(25000)
        });

        // Se o modelo específico rejeitar a declaração de tools, tenta sem tools apenas como último recurso
        if (!resp.ok && geminiToolsPayload && modGem === modelosGeminiCandidatos[modelosGeminiCandidatos.length - 1]) {
          delete payloadGemini.tools;
          resp = await fetch(urlGemini, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadGemini),
            signal: AbortSignal.timeout(25000)
          });
        }

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

        ultimoErroGemini = await resp.text();
      } catch (err: any) {
        ultimoErroGemini = err.message;
      }
    }

    throw new Error(`Gemini indisponível: ${ultimoErroGemini.slice(0, 200)}`);
  }

  // --------------------------------------------------------------------------
  // 2. SUPORTE GROQ, OPENAI, OPENROUTER, DEEPSEEK E OLLAMA
  // --------------------------------------------------------------------------
  const client = new OpenAI({
    apiKey: apiKey || 'ollama',
    baseURL: creds.baseURL,
    timeout: 30000,
    defaultHeaders:
      provider === 'openrouter'
        ? { 'HTTP-Referer': 'https://jarvis.local', 'X-Title': 'JARVIS Neural Core' }
        : undefined
  });

  let modeloEscolhido = (creds.model || options.model || 'llama-3.3-70b-versatile').trim();

  const ehModeloRaciocinioSemTools =
    modeloEscolhido.includes('gpt-oss') ||
    modeloEscolhido.includes('reasoner') ||
    modeloEscolhido.includes('r1') ||
    modeloEscolhido.includes('o1') ||
    modeloEscolhido.includes('o3');

  // Na Groq, se houver tools (subagentes) ou modelo descontinuado, garante o llama-3.3-70b-versatile
  if (provider === 'groq') {
    const ehModeloDescontinuado =
      modeloEscolhido.includes('8b-instant') ||
      modeloEscolhido.includes('gemma') ||
      modeloEscolhido.includes('mixtral') ||
      modeloEscolhido.includes('deepseek-r1') ||
      modeloEscolhido.includes('gemini');

    if (ehModeloDescontinuado || (temTools && ehModeloRaciocinioSemTools)) {
      modeloEscolhido = 'llama-3.3-70b-versatile';
    }
  }

  const candidatos =
    provider === 'groq'
      ? Array.from(new Set([modeloEscolhido, 'llama-3.3-70b-versatile']))
      : [modeloEscolhido];

  let ultimoErro: any = null;

  for (const mod of candidatos) {
    if (!mod) continue;

    const modBloqueiaTools =
      mod.includes('gpt-oss') ||
      mod.includes('reasoner') ||
      mod.includes('r1') ||
      mod.includes('o1') ||
      mod.includes('o3');

    const payload: any = {
      model: mod,
      messages: options.messages,
      temperature: options.temperature ?? 0.2
    };

    if (temTools && !modBloqueiaTools) {
      payload.tools = options.tools;
      payload.tool_choice = 'auto';
    }

    try {
      return await client.chat.completions.create(payload);
    } catch (err: any) {
      ultimoErro = err;
      // Se for o último candidato da fila e falhou por causa de tools, tenta responder em texto puro
      if (payload.tools && mod === candidatos[candidatos.length - 1]) {
        try {
          return await client.chat.completions.create({
            model: mod,
            messages: options.messages,
            temperature: options.temperature ?? 0.2
          });
        } catch (innerErr: any) {
          ultimoErro = innerErr;
        }
      }
    }
  }

  throw ultimoErro || new Error(`Falha na comunicação com o provedor ${provider.toUpperCase()}`);
}

export const callOpenAICompatibleLLM = chamarLLMCompativelOpenAI;
