/**
 * Serviço de Sincronização Dinâmica de Provedores e Modelos de IA via GitHub Gist
 * Gist Oficial do Usuário:
 * https://gist.githubusercontent.com/dullius-lima/f672db978789103941a45d2968e386e5/raw/eb792d5188df30bc34d2de06382b54f584e06543/models.json
 */

export interface GistModelOption {
  label: string;
  value: string;
}

export type GistModelsMap = Record<string, GistModelOption[]>;

export interface GistSyncStatus {
  lastSync: string | null;
  sourceUrl: string;
  isSyncing: boolean;
  success: boolean;
  error?: string;
  providersCount: number;
  totalModelsCount: number;
}

const DEFAULT_GIST_URL =
  'https://gist.githubusercontent.com/dullius-lima/f672db978789103941a45d2968e386e5/raw/eb792d5188df30bc34d2de06382b54f584e06543/models.json';

const STORAGE_GIST_MODELS_KEY = 'jarvis_gist_models_cache_v2';
const STORAGE_GIST_STATUS_KEY = 'jarvis_gist_sync_status_v2';
const STORAGE_GIST_CUSTOM_INPUTS_KEY = 'jarvis_gist_custom_inputs_v2';

// Fallback pré-configurado idêntico ao Gist para inicialização instantânea
const DEFAULT_FALLBACK_MODELS: GistModelsMap = {
  groq: [
    { label: '✍️ Inserir ID Manual da Groq', value: 'CUSTOM_INPUT' },
    { label: 'Llama 3.3 70B Versatile', value: 'llama-3.3-70b-versatile' },
    { label: 'GPT-OSS 120B (Reasoning)', value: 'openai/gpt-oss-120b' },
  ],
  openai: [
    { label: '✍️ Inserir ID Manual da OpenAI', value: 'CUSTOM_INPUT' },
    { label: 'GPT-4o Mini (Dia a Dia)', value: 'gpt-4o-mini' },
    { label: 'GPT-4o (Completo)', value: 'gpt-4o' },
  ],
  gemini: [
    { label: '✍️ Inserir ID Manual do Gemini', value: 'CUSTOM_INPUT' },
    { label: 'Gemini 4 Argon (Reasoning)', value: 'gemini-4-argon' },
    { label: 'Gemini 3.8 Flash', value: 'gemini-3.8-flash' },
  ],
  deepseek: [
    { label: '✍️ Inserir ID Manual da DeepSeek', value: 'CUSTOM_INPUT' },
    { label: 'DeepSeek V3 (Chat)', value: 'deepseek-chat' },
    { label: 'DeepSeek R1 (Reasoner)', value: 'deepseek-reasoner' },
  ],
};

export class AiProvidersGistService {
  private static instance: AiProvidersGistService;
  private modelsMap: GistModelsMap;
  private customInputs: Record<string, string> = {}; // provider -> customModelId
  private syncStatus: GistSyncStatus;
  private listeners: Array<() => void> = [];

  private constructor() {
    this.modelsMap = this.carregarModelos();
    this.customInputs = this.carregarCustomInputs();
    this.syncStatus = this.carregarStatus();

    // Auto-sincronizar suavemente se nunca foi sincronizado
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        if (!this.syncStatus.lastSync) {
          this.syncFromGist().catch(() => {});
        }
      }, 1000);
    }
  }

  public static getInstance(): AiProvidersGistService {
    if (!AiProvidersGistService.instance) {
      AiProvidersGistService.instance = new AiProvidersGistService();
    }
    return AiProvidersGistService.instance;
  }

  private carregarModelos(): GistModelsMap {
    if (typeof window === 'undefined') return DEFAULT_FALLBACK_MODELS;
    try {
      const salvo = localStorage.getItem(STORAGE_GIST_MODELS_KEY);
      if (salvo) {
        return JSON.parse(salvo);
      }
    } catch (e) {
      console.warn('Erro ao carregar modelos do cache Gist:', e);
    }
    return DEFAULT_FALLBACK_MODELS;
  }

  private carregarCustomInputs(): Record<string, string> {
    if (typeof window === 'undefined') return {};
    try {
      const salvo = localStorage.getItem(STORAGE_GIST_CUSTOM_INPUTS_KEY);
      if (salvo) return JSON.parse(salvo);
    } catch {}
    return {};
  }

  private carregarStatus(): GistSyncStatus {
    const padrao: GistSyncStatus = {
      lastSync: null,
      sourceUrl: DEFAULT_GIST_URL,
      isSyncing: false,
      success: true,
      providersCount: Object.keys(DEFAULT_FALLBACK_MODELS).length,
      totalModelsCount: this.contarTotalModelos(DEFAULT_FALLBACK_MODELS),
    };
    if (typeof window === 'undefined') return padrao;
    try {
      const salvo = localStorage.getItem(STORAGE_GIST_STATUS_KEY);
      if (salvo) return { ...padrao, ...JSON.parse(salvo) };
    } catch {}
    return padrao;
  }

  private contarTotalModelos(map: GistModelsMap): number {
    return Object.values(map).reduce((acc, list) => acc + (list?.length || 0), 0);
  }

  private salvar(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_GIST_MODELS_KEY, JSON.stringify(this.modelsMap));
      localStorage.setItem(STORAGE_GIST_STATUS_KEY, JSON.stringify(this.syncStatus));
      localStorage.setItem(STORAGE_GIST_CUSTOM_INPUTS_KEY, JSON.stringify(this.customInputs));
    } catch (e) {
      console.warn('Erro ao salvar Gist models no localStorage:', e);
    }
    this.notify();
  }

  /**
   * Sincroniza os modelos em tempo real buscando o JSON bruto no Gist do GitHub
   */
  public async syncFromGist(customUrl?: string): Promise<GistModelsMap> {
    const url = customUrl || this.syncStatus.sourceUrl || DEFAULT_GIST_URL;
    this.syncStatus.isSyncing = true;
    this.notify();

    try {
      // 1. Tentar via backend proxy se disponível para evitar CORS ou direto
      let json: GistModelsMap | null = null;
      try {
        const res = await fetch(`/api/ai/models/sync-gist?url=${encodeURIComponent(url)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.models) {
            json = data.models;
          }
        }
      } catch {
        // Fallback para fetch direto
      }

      if (!json) {
        const directRes = await fetch(url, { cache: 'no-store' });
        if (!directRes.ok) {
          throw new Error(`HTTP ${directRes.status}: ${directRes.statusText}`);
        }
        json = await directRes.json();
      }

      if (json && typeof json === 'object') {
        this.modelsMap = { ...DEFAULT_FALLBACK_MODELS, ...json };
        this.syncStatus = {
          lastSync: new Date().toLocaleTimeString('pt-BR') + ' · ' + new Date().toLocaleDateString('pt-BR'),
          sourceUrl: url,
          isSyncing: false,
          success: true,
          providersCount: Object.keys(this.modelsMap).length,
          totalModelsCount: this.contarTotalModelos(this.modelsMap),
        };
        this.salvar();
        return this.modelsMap;
      }
      throw new Error('Formato inválido retornado pelo Gist.');
    } catch (err: any) {
      this.syncStatus = {
        ...this.syncStatus,
        isSyncing: false,
        success: false,
        error: err.message || 'Falha ao conectar ao GitHub Gist.',
      };
      this.salvar();
      return this.modelsMap;
    }
  }

  public getModelsMap(): GistModelsMap {
    return { ...this.modelsMap };
  }

  public getModelsForProvider(provider: string): GistModelOption[] {
    const key = provider.toLowerCase();
    return this.modelsMap[key] || [];
  }

  public getSyncStatus(): GistSyncStatus {
    return { ...this.syncStatus };
  }

  public setCustomInput(provider: string, modelId: string): void {
    this.customInputs[provider.toLowerCase()] = modelId.trim();
    this.salvar();
  }

  public getCustomInput(provider: string): string {
    return this.customInputs[provider.toLowerCase()] || '';
  }

  /**
   * Retorna lista unificada de todos os modelos disponíveis para selects do Jarvis e Especialistas
   */
  public getUnifiedSelectableModels(): Array<{
    id: string;
    name: string;
    provider: string;
    isCustom?: boolean;
  }> {
    const list: Array<{ id: string; name: string; provider: string; isCustom?: boolean }> = [];

    Object.entries(this.modelsMap).forEach(([provider, options]) => {
      options.forEach((opt) => {
        if (opt.value === 'CUSTOM_INPUT') {
          const customVal = this.getCustomInput(provider);
          list.push({
            id: customVal ? customVal : `custom_${provider}`,
            name: `${opt.label}${customVal ? ` (${customVal})` : ''}`,
            provider,
            isCustom: true,
          });
        } else {
          list.push({
            id: opt.value,
            name: `${opt.label} [${provider.toUpperCase()}]`,
            provider,
            isCustom: false,
          });
        }
      });
    });

    return list;
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify(): void {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.error('Erro em listener do AiProvidersGistService:', e);
      }
    });
  }
}

export const aiProvidersGistService = AiProvidersGistService.getInstance();
