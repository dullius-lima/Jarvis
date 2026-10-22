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
    description: 'Motor nativo de alta velocidade com raciocínio multimodal, transcrição e grounding.',
    defaultModel: 'gemini-3.8-flash',
    models: [
      'gemini-3.8-flash',
      'gemini-3.1-flash-lite',
      'gemini-4-argon',
      'gemini-flash-latest',
    ],
    requiresApiKey: true,
    docsUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'openai',
    name: 'OpenAI GPT',
    company: 'OpenAI',
    description: 'Modelos GPT-4o e de raciocínio lógico profundo o1 e o3-mini.',
    defaultModel: 'gpt-4o',
    models: [
      'gpt-4o',
      'gpt-4o-mini',
      'o3-mini',
      'o1',
      'o1-mini',
      'gpt-4.5-preview',
      'gpt-4-turbo',
    ],
    requiresApiKey: true,
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    company: 'Anthropic',
    description: 'Modelos Claude 3.7 Sonnet (híbrido com raciocínio estendido) e Claude 3.5.',
    defaultModel: 'claude-3-7-sonnet-20250219',
    models: [
      'claude-3-7-sonnet-20250219',
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
    description: 'Velocidade extrema de inferência em chips LPU rodando LLaMA 3.3 e DeepSeek-R1.',
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      'llama-3.3-70b-versatile',
      'deepseek-r1-distill-llama-70b',
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
      'pixtral-large-latest',
      'mistral-small-latest',
    ],
    requiresApiKey: true,
    defaultEndpoint: 'https://api.mistral.ai/v1',
    docsUrl: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'xai',
    name: 'xAI Grok',
    company: 'xAI',
    description: 'Modelos Grok com visão computacional, conhecimento em tempo real e raciocínio rápido.',
    defaultModel: 'grok-2-latest',
    models: [
      'grok-2-latest',
      'grok-2-vision-latest',
      'grok-beta',
    ],
    requiresApiKey: true,
    defaultEndpoint: 'https://api.x.ai/v1',
    docsUrl: 'https://console.x.ai',
  },
  {
    id: 'ollama',
    name: 'Ollama / Local & Privado',
    company: 'Open Source / Self-Hosted',
    description: 'Servidor local privado rodando na máquina Oracle ou computador sem nuvem.',
    defaultModel: 'llama3.3',
    models: [
      'llama3.3',
      'deepseek-r1:70b',
      'deepseek-r1:8b',
      'qwen2.5-coder',
      'mistral',
      'phi4',
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
  model: 'gemini-3.8-flash',
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

  private serverConfiguredProviders: Set<string> = new Set();

  private constructor() {
    this.carregarConfig();
    this.syncWithServerVault();
  }

  public static getInstance(): UniversalLLMService {
    if (!UniversalLLMService.instance) {
      UniversalLLMService.instance = new UniversalLLMService();
    }
    return UniversalLLMService.instance;
  }

  public async syncWithServerVault(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      // 1. Envia quaisquer chaves locais salvas no cliente para o cofre do servidor
      const entries = Object.entries(this.providerKeys);
      for (const [prov, key] of entries) {
        if (key && key.trim().length > 0 && !key.includes('****')) {
          fetch('/api/config/keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: prov, apiKey: key.trim() }),
          }).catch(() => {});
        }
      }

      // 2. Consulta o cofre do servidor para saber quais provedores já possuem chave configurada no backend
      const res = await fetch('/api/config/keys');
      if (res.ok) {
        const data = await res.json();
        if (data?.providers) {
          Object.entries(data.providers).forEach(([prov, info]: [string, any]) => {
            if (info?.configured) {
              this.serverConfiguredProviders.add(prov);
            }
          });
        }
      }
    } catch {
      // Silencioso caso offline na inicialização
    }
  }

  public setProviderKeyFromStudio(providerId: string, rawKey: string): void {
    const prov = providerId.toLowerCase().trim() as LLMProviderType;
    if (!rawKey || !rawKey.trim()) return;
    this.providerKeys[prov] = rawKey.trim();
    this.serverConfiguredProviders.add(prov);
    if (this.config.provider === prov) {
      this.config.apiKey = rawKey.trim();
    }
    this.persistToStorage();
  }

  private persistToStorage(): void {
    if (typeof window === 'undefined') return;
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

        // Migração suave de modelos descontinuados ou incorretos
        if (this.config.provider === 'gemini') {
          if (!this.config.model || this.config.model.includes('1.5') || this.config.model.includes('2.5') || this.config.model.includes('2.0')) {
            this.config.model = 'gemini-3.8-flash';
          }
        }
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
      if (typeof window !== 'undefined' && newConfig.apiKey.trim().length > 0 && !newConfig.apiKey.includes('****')) {
        this.serverConfiguredProviders.add(targetProvider);
        fetch('/api/config/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: targetProvider,
            apiKey: newConfig.apiKey.trim(),
          }),
        }).catch(() => {});
      }
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

    this.persistToStorage();
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
      const hasKey = Boolean(
        this.providerKeys[p.id]?.trim() ||
        this.serverConfiguredProviders.has(p.id) ||
        p.id === 'gemini' ||
        p.id === 'ollama'
      );
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
