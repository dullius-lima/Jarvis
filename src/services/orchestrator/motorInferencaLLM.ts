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
 * Executa chamadas à LLM compatível com a API da OpenAI, com suporte nativo a Groq e Gemini
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

  // --------------------------------------------------------------------------
  // 1. SUPORTE GOOGLE GEMINI NATIVO (COM FUNCTION CALLING / TOOLS)
  // --------------------------------------------------------------------------
  if (provider === 'gemini') {
    const modeloAlvo = (creds.model || options.model || 'gemini-2.5-flash').trim();

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

    // Mapeamento de Tools para a especificação do Google Gemini
    const geminiToolsPayload =
      options.tools && options.tools.length > 0
        ? [
            {
              functionDeclarations: options.tools
                .filter((t: any) => t?.function?.name)
                .map((t: any) => ({
                  name: t.function.name,
                  description: t.function.description || `Executa a ferramenta ${t.function.name}`,
                  parameters: t.function.parameters || { type: 'OBJECT', properties: {} }
                }))
            }
          ]
        : undefined;

    const urlGemini = `https://generativelanguage.googleapis.com/v1beta/models/${modeloAlvo}:generateContent?key=${apiKey}`;
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

    // Se o modelo rejeitar a declaração de ferramentas, tenta uma vez sem tools
    if (!resp.ok && geminiToolsPayload) {
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

      // Converte chamada de função do Gemini para o formato universal OpenAI esperado pelo orquestrador
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

    const erroTexto = await resp.text();
    throw new Error(`Gemini indisponível (${modeloAlvo}): ${erroTexto.slice(0, 200)}`);
  }

  // --------------------------------------------------------------------------
  // 2. SUPORTE OPENAI, GROQ, OPENROUTER, DEEPSEEK E OLLAMA
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

  // Preserva estritamente o modelo escolhido pelo usuário
  const modeloFinal = creds.model || options.model;

  const isReasoningModel =
    modeloFinal.includes('gpt-oss') ||
    modeloFinal.includes('reasoner') ||
    modeloFinal.includes('r1') ||
    modeloFinal.includes('o1') ||
    modeloFinal.includes('o3');

  const payload: any = {
    model: modeloFinal,
    messages: options.messages,
    temperature: options.temperature ?? 0.2
  };

  if (options.tools && options.tools.length > 0 && !isReasoningModel) {
    payload.tools = options.tools;
    payload.tool_choice = 'auto';
  }

  try {
    return await client.chat.completions.create(payload);
  } catch (err: any) {
    // Caso o endpoint recuse o parâmetro de ferramentas, executa o mesmo modelo sem tools como contingência
    if (payload.tools) {
      return await client.chat.completions.create({
        model: modeloFinal,
        messages: options.messages,
        temperature: options.temperature ?? 0.2
      });
    }
    throw err;
  }
}

export const callOpenAICompatibleLLM = chamarLLMCompativelOpenAI;
