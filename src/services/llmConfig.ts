import { LLMProviderConfig, LLMProviderType } from '../types/neural';

const STORAGE_KEY = 'jarvis_universal_llm_config_v1';

export interface ProviderDefinition {
  id: LLMProviderType;
  name: string;
  company: string;
  description: string;
  defaultModel: string;
  models: string[];
  requiresApiKey: boolean;
  defaultEndpoint?: string;
  docsUrl: string;
}

export const SUPPORTED_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    company: 'Google DeepMind',
    description: 'Motor nativo de alta velocidade com raciocínio multimodal e grounding de dados.',
    defaultModel: 'gemini-2.5-flash',
    models: [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
    ],
    requiresApiKey: false, // Pode usar a chave já provida pelo ambiente ou uma personalizada
    docsUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'openai',
    name: 'OpenAI GPT',
    company: 'OpenAI',
    description: 'Modelos GPT-4o e de raciocínio lógico avançado com alta capacidade analítica.',
    defaultModel: 'gpt-4o',
    models: [
      'gpt-4o',
      'gpt-4o-mini',
      'o1-mini',
      'o3-mini',
      'gpt-4-turbo',
    ],
    requiresApiKey: true,
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    company: 'Anthropic',
    description: 'Modelos Claude 3.5 Sonnet com precisão executiva, segurança e síntese rigorosa.',
    defaultModel: 'claude-3-5-sonnet-20241022',
    models: [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
    ],
    requiresApiKey: true,
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    company: 'DeepSeek AI',
    description: 'Modelos V3 e R1 de altíssimo desempenho lógico, matemática e raciocínio profundo.',
    defaultModel: 'deepseek-chat',
    models: [
      'deepseek-chat',
      'deepseek-reasoner',
    ],
    requiresApiKey: true,
    defaultEndpoint: 'https://api.deepseek.com/v1',
    docsUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'groq',
    name: 'Groq LPU',
    company: 'Groq Cloud',
    description: 'Velocidade extrema de inferência em chips LPU rodando LLaMA 3.3 e Mixtral.',
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      'llama-3.3-70b-versatile',
      'mixtral-8x7b-32768',
      'llama-3.1-8b-instant',
    ],
    requiresApiKey: true,
    defaultEndpoint: 'https://api.groq.com/openai/v1',
    docsUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    company: 'Mistral AI',
    description: 'Modelos europeus de inteligência e código com arquitetura soberana e eficiente.',
    defaultModel: 'mistral-large-latest',
    models: [
      'mistral-large-latest',
      'codestral-latest',
      'mistral-small-latest',
    ],
    requiresApiKey: true,
    defaultEndpoint: 'https://api.mistral.ai/v1',
    docsUrl: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'ollama',
    name: 'Ollama / Local & Privado',
    company: 'Open Source / Self-Hosted',
    description: 'Servidor local privado rodando no seu computador sem enviar dados para a nuvem.',
    defaultModel: 'llama3',
    models: [
      'llama3',
      'mistral',
      'deepseek-r1',
      'qwen2.5',
      'phi3',
      'custom',
    ],
    requiresApiKey: false,
    defaultEndpoint: 'http://localhost:11434/v1',
    docsUrl: 'https://ollama.com',
  },
];

const DEFAULT_CONFIG: LLMProviderConfig = {
  provider: 'gemini',
  apiKey: '',
  model: 'gemini-2.5-flash',
  temperature: 0.2,
  maxTokens: 2048,
};

export class UniversalLLMService {
  private static instance: UniversalLLMService;
  private config: LLMProviderConfig = DEFAULT_CONFIG;

  private constructor() {
    this.carregarConfig();
  }

  public static getInstance(): UniversalLLMService {
    if (!UniversalLLMService.instance) {
      UniversalLLMService.instance = new UniversalLLMService();
    }
    return UniversalLLMService.instance;
  }

  private carregarConfig() {
    if (typeof window === 'undefined') return;
    try {
      const salvo = localStorage.getItem(STORAGE_KEY);
      if (salvo) {
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(salvo) };
      }
    } catch (e) {
      console.warn('Erro ao carregar LLM config:', e);
    }
  }

  public getConfig(): LLMProviderConfig {
    return { ...this.config };
  }

  public saveConfig(newConfig: Partial<LLMProviderConfig>): LLMProviderConfig {
    this.config = {
      ...this.config,
      ...newConfig,
    };
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
      } catch (e) {
        console.warn('Erro ao salvar LLM config:', e);
      }
    }
    return { ...this.config };
  }

  public getProviderDefinition(providerId: LLMProviderType): ProviderDefinition {
    const found = SUPPORTED_PROVIDERS.find((p) => p.id === providerId);
    return found || SUPPORTED_PROVIDERS[0];
  }
}
