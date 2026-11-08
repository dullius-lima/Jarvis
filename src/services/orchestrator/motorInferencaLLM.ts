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

  // 1. SUPORTE GOOGLE GEMINI
  if (provider === 'gemini') {
    const modeloDesejado = (creds.model || 'gemini-2.5-flash').trim();
    const modeloFinal =
      modeloDesejado.includes('argon') || modeloDesejado.includes('3.8') || !modeloDesejado.startsWith('gemini')
        ? 'gemini-2.5-flash'
        : modeloDesejado;

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

    const urlGemini = `https://generativelanguage.googleapis.com/v1beta/models/${modeloFinal}:generateContent?key=${apiKey}`;
    const payloadGemini: any = {
      contents: [{ parts: partesFormatadas }],
      generationConfig: { temperature: options.temperature ?? 0.2 }
    };

    const resp = await fetch(urlGemini, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadGemini),
      signal: AbortSignal.timeout(25000)
    });

    if (resp.ok) {
      const data: any = await resp.json();
      const contentText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { choices: [{ message: { content: contentText, role: 'assistant' } }] };
    }
    const erroTexto = await resp.text();
    throw new Error(`Gemini indisponível: ${erroTexto.slice(0, 180)}`);
  }

  // 2. SUPORTE GROQ, OPENROUTER, DEEPSEEK, OPENAI E OLLAMA
  const client = new OpenAI({
    apiKey: apiKey || 'ollama',
    baseURL: creds.baseURL,
    timeout: 30000
  });

  let modeloAlvo = creds.model;
  if (provider === 'groq') {
    if (!modeloAlvo || modeloAlvo.includes('8b-instant') || modeloAlvo.includes('deepseek-r1')) {
      modeloAlvo = 'llama-3.3-70b-versatile';
    }
  }

  const modelosCandidatos =
    provider === 'groq'
      ? Array.from(new Set([modeloAlvo, 'llama-3.3-70b-versatile']))
      : [modeloAlvo];

  let ultimoErro: any = null;

  for (const modelo of modelosCandidatos) {
    if (!modelo) continue;
    try {
      const payload: any = {
        model: modelo,
        messages: options.messages,
        temperature: options.temperature ?? 0.2
      };

      const ehModeloRaciocinio =
        modelo.includes('gpt-oss') || modelo.includes('reasoner') || modelo.includes('r1');

      if (options.tools && options.tools.length > 0 && !ehModeloRaciocinio) {
        payload.tools = options.tools;
        payload.tool_choice = 'auto';
      }

      return await client.chat.completions.create(payload);
    } catch (err: any) {
      ultimoErro = err;
      if (options.tools && options.tools.length > 0) {
        try {
          return await client.chat.completions.create({
            model: modelo,
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