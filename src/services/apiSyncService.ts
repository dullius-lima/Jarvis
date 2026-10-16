import { AgentRegistryService } from './agentRegistry';
import { UniversalLLMService } from './llmConfig';
import { MicroDatastoresService } from './microDatastores';

export interface ApiEndpointStatus {
  id: string;
  name: string;
  type: 'AGENT_WEBHOOK' | 'LLM_PROVIDER' | 'DATASTORE' | 'BACKEND_CORE';
  url: string;
  status: 'ONLINE' | 'OFFLINE' | 'SYNCED' | 'WARNING';
  statusCode?: number;
  latencyMs: number;
  lastSync: string;
  details?: string;
}

export interface MultiApiSyncReport {
  timestamp: string;
  totalEndpoints: number;
  syncedEndpoints: number;
  averageLatencyMs: number;
  endpoints: ApiEndpointStatus[];
}

export class ApiSyncService {
  private static instance: ApiSyncService;
  private syncListeners: Array<(report: MultiApiSyncReport) => void> = [];
  private lastReport: MultiApiSyncReport | null = null;
  private isSyncing = false;

  private constructor() {
    // Sincronização automática em segundo plano a cada 90 segundos
    if (typeof window !== 'undefined') {
      setTimeout(() => this.syncAllEndpoints(), 3000);
      setInterval(() => this.syncAllEndpoints(), 90000);
    }
  }

  public static getInstance(): ApiSyncService {
    if (!ApiSyncService.instance) {
      ApiSyncService.instance = new ApiSyncService();
    }
    return ApiSyncService.instance;
  }

  public subscribe(listener: (report: MultiApiSyncReport) => void): () => void {
    this.syncListeners.push(listener);
    if (this.lastReport) listener(this.lastReport);
    return () => {
      this.syncListeners = this.syncListeners.filter((l) => l !== listener);
    };
  }

  public getLastReport(): MultiApiSyncReport | null {
    return this.lastReport;
  }

  public async syncAllEndpoints(): Promise<MultiApiSyncReport> {
    if (this.isSyncing && this.lastReport) return this.lastReport;
    this.isSyncing = true;

    const agentService = AgentRegistryService.getInstance();
    const llmService = UniversalLLMService.getInstance();
    const microService = MicroDatastoresService.getInstance();

    const agents = agentService.listAgents();
    const llmConfig = llmService.getConfig();
    const endpointsToTest: Array<{ id: string; name: string; type: ApiEndpointStatus['type']; url: string }> = [];

    // 1. Backend Core do Jarvis
    endpointsToTest.push({
      id: 'core-backend',
      name: 'Jarvis Neural Core API',
      type: 'BACKEND_CORE',
      url: '/api/cfo/deliberar',
    });

    // 2. Provedor de LLM Universal Ativo
    if (llmConfig.customEndpoint) {
      endpointsToTest.push({
        id: `llm-${llmConfig.provider}`,
        name: `Motor LLM (${llmConfig.provider})`,
        type: 'LLM_PROVIDER',
        url: llmConfig.customEndpoint,
      });
    }

    // 3. Webhooks & APIs de todos os Agentes de IA
    agents.forEach((ag) => {
      if (ag.tools && ag.tools.length > 0) {
        ag.tools.forEach((tool) => {
          if (tool.endpointOrMethod && tool.endpointOrMethod.startsWith('http')) {
            endpointsToTest.push({
              id: `tool-${tool.id}`,
              name: `${ag.name} · ${tool.name}`,
              type: 'AGENT_WEBHOOK',
              url: tool.endpointOrMethod,
            });
          }
        });
      }
    });

    // 4. Testar todos em paralelo com timeout seguro
    const results: ApiEndpointStatus[] = await Promise.all(
      endpointsToTest.map(async (ep): Promise<ApiEndpointStatus> => {
        const start = performance.now();
        try {
          if (ep.url.startsWith('/api/')) {
            // Rota interna do app
            const res = await fetch(ep.url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ping: true }),
            });
            const lat = Math.round(performance.now() - start);
            return {
              id: ep.id,
              name: ep.name,
              type: ep.type,
              url: ep.url,
              status: res.status < 500 ? 'SYNCED' : 'WARNING',
              statusCode: res.status,
              latencyMs: lat,
              lastSync: new Date().toLocaleTimeString('pt-BR'),
              details: 'Endpoint do servidor interno online',
            };
          } else {
            // Rota externa via proxy de ping
            const res = await fetch('/api/test-webhook-ping', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: ep.url }),
            });
            const data = await res.json();
            const lat = data.latencyMs || Math.round(performance.now() - start);
            return {
              id: ep.id,
              name: ep.name,
              type: ep.type,
              url: ep.url,
              status: data.ok ? 'SYNCED' : 'WARNING',
              statusCode: data.status || 200,
              latencyMs: lat,
              lastSync: new Date().toLocaleTimeString('pt-BR'),
              details: data.ok ? 'Sincronizado com sucesso' : (data.error || 'Aviso de conexão'),
            };
          }
        } catch (err: any) {
          const lat = Math.round(performance.now() - start);
          return {
            id: ep.id,
            name: ep.name,
            type: ep.type,
            url: ep.url,
            status: 'OFFLINE',
            statusCode: 504,
            latencyMs: lat,
            lastSync: new Date().toLocaleTimeString('pt-BR'),
            details: err.message || 'Falha de rede',
          };
        }
      })
    );

    const totalEndpoints = results.length;
    const syncedEndpoints = results.filter((r) => r.status === 'SYNCED').length;
    const totalLatency = results.reduce((acc, r) => acc + r.latencyMs, 0);
    const averageLatencyMs = totalEndpoints > 0 ? Math.round(totalLatency / totalEndpoints) : 0;

    const report: MultiApiSyncReport = {
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      totalEndpoints,
      syncedEndpoints,
      averageLatencyMs,
      endpoints: results,
    };

    this.lastReport = report;
    this.isSyncing = false;

    this.syncListeners.forEach((l) => {
      try {
        l(report);
      } catch (e) {
        console.warn('Erro no listener de sincronização de API:', e);
      }
    });

    return report;
  }
}
