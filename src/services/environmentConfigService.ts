/**
 * Environment & Network Configuration Service
 * Permite configuração dinâmica de IP, Domínio, Porta e Prefixo do n8n local (:800) ou remoto.
 * Garante que a rota dos Webhooks seja montada dinamicamente sem dependência de URLs fixas.
 */

export interface SystemEnvironmentConfig {
  protocol: 'http' | 'https';
  serverHost: string; // ex: 'localhost', '127.0.0.1', '192.168.1.100', 'meun8n.cloud.com'
  serverPort: string; // ex: '800'
  webhookPrefix: string; // ex: '/webhook/'
  authToken?: string; // Token Bearer opcional
  customHeaders?: Record<string, string>;
  lastUpdated: string;
}

const STORAGE_KEY = 'jarvis_system_environment_v1';

export class EnvironmentConfigService {
  private static instance: EnvironmentConfigService;
  private config: SystemEnvironmentConfig;
  private listeners: Array<() => void> = [];

  private constructor() {
    this.config = this.carregar();
  }

  public static getInstance(): EnvironmentConfigService {
    if (!EnvironmentConfigService.instance) {
      EnvironmentConfigService.instance = new EnvironmentConfigService();
    }
    return EnvironmentConfigService.instance;
  }

  private carregar(): SystemEnvironmentConfig {
    const padrao: SystemEnvironmentConfig = {
      protocol: 'http',
      serverHost: 'localhost',
      serverPort: '800',
      webhookPrefix: '/webhook/',
      authToken: '',
      customHeaders: {
        'Content-Type': 'application/json',
      },
      lastUpdated: new Date().toISOString(),
    };

    if (typeof window === 'undefined') return padrao;

    try {
      const salvo = localStorage.getItem(STORAGE_KEY);
      if (salvo) {
        return { ...padrao, ...JSON.parse(salvo) };
      }
    } catch (e) {
      console.warn('Erro ao carregar SystemEnvironmentConfig:', e);
    }
    return padrao;
  }

  private salvar(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
      this.notificar();

      // Sincroniza variáveis de ambiente de rede e porta do n8n com o backend Node.js
      fetch('/api/config/environment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.config),
      }).catch(() => {});

      fetch('/api/config/n8n-neural', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customHost: this.config.serverHost,
          customPort: this.config.serverPort,
          webhookUrl: `${this.getBaseWebhookUrl()}jarvis-voice`,
        }),
      }).catch(() => {});
    } catch (e) {
      console.warn('Erro ao salvar SystemEnvironmentConfig:', e);
    }
  }

  public getConfig(): SystemEnvironmentConfig {
    return { ...this.config };
  }

  public updateConfig(updates: Partial<SystemEnvironmentConfig>): SystemEnvironmentConfig {
    this.config = {
      ...this.config,
      ...updates,
      lastUpdated: new Date().toISOString(),
    };
    this.salvar();
    return this.config;
  }

  /**
   * Retorna a URL base montada dinamicamente:
   * Ex: http://localhost:800/webhook/ ou https://meu-ip:800/webhook/
   */
  public getBaseWebhookUrl(): string {
    const proto = this.config.protocol || 'http';
    const host = (this.config.serverHost || 'localhost').trim().replace(/\/+$/, '');
    const port = (this.config.serverPort || '').trim();
    let prefix = (this.config.webhookPrefix || '/webhook/').trim();
    if (!prefix.startsWith('/')) prefix = '/' + prefix;
    if (!prefix.endsWith('/')) prefix = prefix + '/';

    // Se o host já tiver protocolo embutido, tratar
    let cleanHost = host;
    let actualProto = proto;
    if (cleanHost.startsWith('http://')) {
      actualProto = 'http';
      cleanHost = cleanHost.replace('http://', '');
    } else if (cleanHost.startsWith('https://')) {
      actualProto = 'https';
      cleanHost = cleanHost.replace('https://', '');
    }

    // Se tiver porta e o host ainda não incluir porta
    const portSuffix = port && !cleanHost.includes(':') ? `:${port}` : '';

    return `${actualProto}://${cleanHost}${portSuffix}${prefix}`;
  }

  /**
   * Converte um endpoint ou path relativo em URL absoluta completa com base nas variáveis dinâmicas.
   * Suporta:
   * - 'especialista-financas' -> 'http://localhost:800/webhook/especialista-financas'
   * - '/especialista-financas/test' -> 'http://localhost:800/webhook/especialista-financas/test'
   * - '{{BASE_URL}}especialista-financas' -> substitui pelo getBaseWebhookUrl()
   * - 'http://localhost:800/webhook/xyz' -> se o host mudar, permite remapear
   */
  public resolveDynamicUrl(pathOrUrl: string): string {
    if (!pathOrUrl) return this.getBaseWebhookUrl();

    const baseUrl = this.getBaseWebhookUrl();

    // Substituição de template de variável
    if (pathOrUrl.includes('{{BASE_URL}}')) {
      return pathOrUrl.replace('{{BASE_URL}}', baseUrl);
    }

    // Se for URL absoluta
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      return pathOrUrl;
    }

    // Path relativo
    const cleanPath = pathOrUrl.replace(/^\/+/, '');
    return `${baseUrl}${cleanPath}`;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notificar(): void {
    this.listeners.forEach((l) => {
      try {
        l();
      } catch (err) {
        console.error('Erro em listener do EnvironmentConfigService:', err);
      }
    });
  }
}

export const envConfigService = EnvironmentConfigService.getInstance();
