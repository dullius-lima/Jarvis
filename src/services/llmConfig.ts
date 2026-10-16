import { LLMProviderConfig, LLMProviderType } from '../types/neural';

const STORAGE_KEY = 'jarvis_universal_llm_config_v1';
const PERMANENT_KEYS_STORAGE = 'jarvis_permanent_llm_keys_v1';

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
  providerKeys: {},
  providerEndpoints: {},
};

export class UniversalLLMService {
  private static instance: UniversalLLMService;
  private config: LLMProviderConfig = DEFAULT_CONFIG;
  private providerKeys: Partial<Record<LLMProviderType, string>> = {};
  private providerEndpoints: Partial<Record<LLMProviderType, string>> = {};

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
      // 1. Carrega chaves permanentes de todas as IAs salvas
      const chavesSalvas = localStorage.getItem(PERMANENT_KEYS_STORAGE);
      if (chavesSalvas) {
        const parsed = JSON.parse(chavesSalvas);
        this.providerKeys = parsed.keys || {};
        this.providerEndpoints = parsed.endpoints || {};
      }

      // 2. Carrega configuração geral
      const salvo = localStorage.getItem(STORAGE_KEY);
      if (salvo) {
        const parsedConfig: LLMProviderConfig = JSON.parse(salvo);
        this.config = {
          ...DEFAULT_CONFIG,
          ...parsedConfig,
          providerKeys: { ...this.providerKeys, ...(parsedConfig.providerKeys || {}) },
          providerEndpoints: { ...this.providerEndpoints, ...(parsedConfig.providerEndpoints || {}) },
        };
      } else {
        this.config = {
          ...DEFAULT_CONFIG,
          providerKeys: this.providerKeys,
          providerEndpoints: this.providerEndpoints,
        };
      }

      // 3. Garante que a apiKey ativa corresponda à chave salva desse provedor
      if (this.config.provider && this.providerKeys[this.config.provider]) {
        this.config.apiKey = this.providerKeys[this.config.provider]!;
      }
    } catch (e) {
      console.warn('Erro ao carregar LLM config:', e);
    }
  }

  public getConfig(): LLMProviderConfig {
    return {
      ...this.config,
      providerKeys: { ...this.providerKeys },
      providerEndpoints: { ...this.providerEndpoints },
    };
  }

  public getKeyForProvider(providerId: LLMProviderType): string {
    return this.providerKeys[providerId] || '';
  }

  public getEndpointForProvider(providerId: LLMProviderType): string {
    const def = this.getProviderDefinition(providerId);
    return this.providerEndpoints[providerId] || def.defaultEndpoint || '';
  }

  public saveConfig(newConfig: Partial<LLMProviderConfig>): LLMProviderConfig {
    const targetProvider = newConfig.provider || this.config.provider;

    // Atualiza o mapa permanente da chave se informada
    if (newConfig.apiKey !== undefined && targetProvider) {
      this.providerKeys[targetProvider] = newConfig.apiKey;
    }

    // Atualiza endpoint se informado
    if (newConfig.customEndpoint !== undefined && targetProvider) {
      this.providerEndpoints[targetProvider] = newConfig.customEndpoint;
    }

    // Se mudou de provedor sem passar apiKey explícita, resgata a chave permanente salva para ele
    const activeKey = newConfig.apiKey !== undefined
      ? newConfig.apiKey
      : (this.providerKeys[targetProvider] || '');

    const activeEndpoint = newConfig.customEndpoint !== undefined
      ? newConfig.customEndpoint
      : (this.providerEndpoints[targetProvider] || this.getProviderDefinition(targetProvider).defaultEndpoint || '');

    this.config = {
      ...this.config,
      ...newConfig,
      provider: targetProvider,
      apiKey: activeKey,
      customEndpoint: activeEndpoint,
      providerKeys: { ...this.providerKeys },
      providerEndpoints: { ...this.providerEndpoints },
    };

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
        localStorage.setItem(
          PERMANENT_KEYS_STORAGE,
          JSON.stringify({
            keys: this.providerKeys,
            endpoints: this.providerEndpoints,
          })
        );
      } catch (e) {
        console.warn('Erro ao salvar LLM config permanente:', e);
      }
    }
    return { ...this.config };
  }

  public getProviderDefinition(providerId: LLMProviderType): ProviderDefinition {
    const found = SUPPORTED_PROVIDERS.find((p) => p.id === providerId);
    return found || SUPPORTED_PROVIDERS[0];
  }

  // Relatório do status de todas as IAs disponíveis e chaves salvas
  public getAllProvidersKeyStatus(): Array<{
    id: LLMProviderType;
    name: string;
    hasKey: boolean;
    isCurrent: boolean;
    endpoint?: string;
  }> {
    return SUPPORTED_PROVIDERS.map((p) => {
      const hasKey = Boolean(this.providerKeys[p.id]?.trim() || (p.id === 'gemini'));
      return {
        id: p.id,
        name: p.name,
        hasKey,
        isCurrent: p.id === this.config.provider,
        endpoint: this.providerEndpoints[p.id] || p.defaultEndpoint,
      };
    });
  }
}
