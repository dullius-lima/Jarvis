// Serviço de Integração com Home Assistant para o JARVIS
export interface HomeAssistantEntity {
  entity_id: string;
  state: string;
  attributes: {
    friendly_name?: string;
    icon?: string;
    unit_of_measurement?: string;
    device_class?: string;
    brightness?: number;
    current_temperature?: number;
    temperature?: number;
    [key: string]: any;
  };
  last_changed: string;
}

export interface HomeAssistantConfig {
  baseUrl: string; // Ex: 'http://homeassistant.local:8123' ou 'http://192.168.1.100:8123'
  accessToken: string; // Long-Lived Access Token
  isConnected: boolean;
  lastSync?: string;
  autoSync: boolean;
}

const STORAGE_KEY = 'jarvis_home_assistant_config_v1';
const ENTITIES_CACHE_KEY = 'jarvis_home_assistant_entities_v1';

export class HomeAssistantService {
  private static instance: HomeAssistantService;
  private config: HomeAssistantConfig;
  private entities: HomeAssistantEntity[] = [];
  private listeners: Array<() => void> = [];

  private constructor() {
    this.config = this.loadConfig();
    this.entities = this.loadCachedEntities();
  }

  public static getInstance(): HomeAssistantService {
    if (!HomeAssistantService.instance) {
      HomeAssistantService.instance = new HomeAssistantService();
    }
    return HomeAssistantService.instance;
  }

  private loadConfig(): HomeAssistantConfig {
    if (typeof window === 'undefined') {
      return { baseUrl: 'http://homeassistant.local:8123', accessToken: '', isConnected: false, autoSync: true };
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      // ignore
    }
    return { baseUrl: 'http://homeassistant.local:8123', accessToken: '', isConnected: false, autoSync: true };
  }

  private loadCachedEntities(): HomeAssistantEntity[] {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(ENTITIES_CACHE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      // ignore
    }
    // Entidades padrão simuladas caso o usuário ainda não tenha conectado
    return [
      {
        entity_id: 'light.sala_de_estar',
        state: 'on',
        attributes: { friendly_name: 'Luzes da Sala de Estar', brightness: 220, icon: 'mdi:lightbulb' },
        last_changed: new Date().toISOString(),
      },
      {
        entity_id: 'climate.ar_condicionado_escritorio',
        state: 'cool',
        attributes: { friendly_name: 'Climatização Escritório', temperature: 22, current_temperature: 23, icon: 'mdi:air-conditioner' },
        last_changed: new Date().toISOString(),
      },
      {
        entity_id: 'sensor.consumo_energia_holding',
        state: '1.45',
        attributes: { friendly_name: 'Consumo Elétrico Geral', unit_of_measurement: 'kW', icon: 'mdi:flash' },
        last_changed: new Date().toISOString(),
      },
      {
        entity_id: 'switch.servidor_ia_n8n',
        state: 'on',
        attributes: { friendly_name: 'Nó de Processamento IA Local', icon: 'mdi:server' },
        last_changed: new Date().toISOString(),
      },
      {
        entity_id: 'lock.porta_principal_biometria',
        state: 'locked',
        attributes: { friendly_name: 'Fechadura Biométrica Principal', icon: 'mdi:lock' },
        last_changed: new Date().toISOString(),
      },
    ];
  }

  public getConfig(): HomeAssistantConfig {
    return { ...this.config };
  }

  public saveConfig(newConfig: Partial<HomeAssistantConfig>): HomeAssistantConfig {
    this.config = { ...this.config, ...newConfig };
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    }
    this.notify();
    return this.config;
  }

  public getEntities(): HomeAssistantEntity[] {
    return this.entities;
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
        console.error(e);
      }
    });
  }

  /**
   * Testa a conexão real com a API REST do Home Assistant
   */
  public async testConnection(baseUrl?: string, token?: string): Promise<{ success: boolean; message: string; version?: string }> {
    const url = (baseUrl || this.config.baseUrl).replace(/\/+$/, '');
    const apiKey = token || this.config.accessToken;

    try {
      const res = await fetch('/api/integrations/homeassistant/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: url, accessToken: apiKey }),
      });

      const data = await res.json();
      if (data.success) {
        this.saveConfig({ isConnected: true, lastSync: new Date().toISOString() });
        await this.syncEntities(url, apiKey);
        return { success: true, message: data.message || 'Conectado ao Home Assistant!', version: data.version };
      } else {
        return { success: false, message: data.error || 'Falha ao autenticar com o Home Assistant.' };
      }
    } catch (err: any) {
      return { success: false, message: `Erro de rede: ${err.message || 'Verifique a URL e o Token'}` };
    }
  }

  /**
   * Sincroniza estados de todas as entidades
   */
  public async syncEntities(baseUrl?: string, token?: string): Promise<HomeAssistantEntity[]> {
    const url = (baseUrl || this.config.baseUrl).replace(/\/+$/, '');
    const apiKey = token || this.config.accessToken;

    try {
      const res = await fetch('/api/integrations/homeassistant/states', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: url, accessToken: apiKey }),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.states)) {
          this.entities = data.states;
          if (typeof window !== 'undefined') {
            localStorage.setItem(ENTITIES_CACHE_KEY, JSON.stringify(this.entities));
          }
          this.notify();
          return this.entities;
        }
      }
    } catch (e) {
      console.warn('Erro ao sincronizar estados com Home Assistant:', e);
    }
    return this.entities;
  }

  /**
   * Aciona um serviço no Home Assistant (ex: ligar luz, travar fechadura)
   */
  public async callService(domain: string, service: string, entityId: string, serviceData?: Record<string, any>): Promise<boolean> {
    try {
      const res = await fetch('/api/integrations/homeassistant/service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: this.config.baseUrl,
          accessToken: this.config.accessToken,
          domain,
          service,
          entityId,
          serviceData,
        }),
      });

      if (res.ok) {
        // Atualiza estado otimista localmente
        this.entities = this.entities.map((e) => {
          if (e.entity_id === entityId) {
            const nextState = service === 'turn_on' ? 'on' : service === 'turn_off' ? 'off' : service === 'lock' ? 'locked' : service === 'unlock' ? 'unlocked' : e.state;
            return { ...e, state: nextState };
          }
          return e;
        });
        this.notify();
        return true;
      }
    } catch (e) {
      console.warn('Erro ao acionar serviço do Home Assistant:', e);
    }
    return false;
  }
}
