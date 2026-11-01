import OpenAI from 'openai';

export interface ModelProviderConfig {
  provider: 'openai' | 'groq' | 'deepseek' | 'gemini' | 'anthropic' | 'xai' | 'mistral' | 'openrouter' | 'ollama' | 'custom';
  apiKey?: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
}

// Endpoints padronizados dos provedores mundiais de IA
export const KNOWN_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/', // Endpoint compatível oficial do Google
  openrouter: 'https://openrouter.ai/api/v1',
  xai: 'https://api.x.ai/v1',
  mistral: 'https://api.mistral.ai/v1',
  ollama: 'http://localhost:11434/v1',
  custom: 'http://localhost:11434/v1'
};

// Modelos de referência padrão por provedor
export const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  groq: 'llama-3.3-70b-versatile',
  deepseek: 'deepseek-chat',
  gemini: 'gemini-1.5-flash',
  openrouter: 'anthropic/claude-3.5-sonnet',
  xai: 'grok-2',
  mistral: 'mistral-large-latest',
  ollama: 'llama3.1:8b'
};

export function createUniversalLLMClient(config: Partial<ModelProviderConfig>): { client: OpenAI; model: string; temperature: number } {
  const provider = (config.provider || 'openai').toLowerCase();
  
  // Resolução da Base URL
  const baseURL = config.baseUrl?.trim() || KNOWN_ENDPOINTS[provider] || KNOWN_ENDPOINTS.openai;

  // Resolução da Chave da API
  let apiKey = config.apiKey?.trim();

  // Se não foi informada chave localmente, busca nas variáveis de ambiente correspondentes
  if (!apiKey) {
    switch (provider) {
      case 'groq': apiKey = process.env.GROQ_API_KEY; break;
      case 'deepseek': apiKey = process.env.DEEPSEEK_API_KEY; break;
      case 'gemini': apiKey = process.env.GEMINI_API_KEY; break;
      case 'openrouter': apiKey = process.env.OPENROUTER_API_KEY; break;
      case 'xai': apiKey = process.env.XAI_API_KEY; break;
      case 'mistral': apiKey = process.env.MISTRAL_API_KEY; break;
      case 'ollama': apiKey = 'ollama'; break; // Servidores locais não exigem chave
      default: apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
    }
  }

  // Fallback para modelos locais e offline
  if (!apiKey && (provider === 'ollama' || baseURL.includes('localhost') || baseURL.includes('127.0.0.1'))) {
    apiKey = 'ollama';
  }

  const client = new OpenAI({
    apiKey: apiKey || 'unconfigured_key',
    baseURL,
    dangerouslyAllowBrowser: false
  });

  const selectedModel = config.model?.trim() || DEFAULT_MODELS[provider] || 'gpt-4o-mini';
  const temperature = config.temperature ?? 0.2;

  return { client, model: selectedModel, temperature };
}