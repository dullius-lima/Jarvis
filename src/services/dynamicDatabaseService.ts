/**
 * DynamicDatabaseTool & Persistence Service
 * Concede autonomia à LLM para criar coleções e salvar registros com total flexibilidade.
 * Atende às especificações:
 * - Regex obrigatória: /^[a-z0-9_]+$/
 * - Interface DynamicDatabaseSaveInput
 * - Metadados de auditoria: createdAt, decisionReasoning, webhookSource, executionStatus
 * - Execução Dual e Promise.allSettled() com retentativas
 */

export interface DynamicDatabaseSaveInput {
  collectionName: string; // Validado estritamente por /^[a-z0-9_]+$/
  documentData: Record<string, unknown>; // Payload JSON filtrado e limpo
  eventId?: string; // Idempotency key única para evitar duplicações
  idempotencyKey?: string;
  decisionReasoning?: string;
  webhookSource?: string;
  executionStatus?: 'SALVO' | 'EXECUTADO_HTTP' | 'DUAL_COMMIT' | 'DESCARTADO';
}

export interface StoredDynamicDocument {
  _id: string;
  collectionName: string;
  data: Record<string, unknown>;
  eventId: string;
  createdAt: string;
  decisionReasoning: string;
  webhookSource: string;
  executionStatus: 'SALVO' | 'EXECUTADO_HTTP' | 'DUAL_COMMIT' | 'DESCARTADO';
  httpResult?: any;
}

export interface DynamicDecisionResult {
  decision: 'DESCARTAR' | 'EXECUTAR_HTTP' | 'SALVAR_BANCO' | 'EXECUTAR_AMBOS';
  collectionSaved?: string;
  documentId?: string;
  httpEndpoint?: string;
  httpSuccess?: boolean;
  status: 'SUCESSO' | 'FALHA_PARCIAL' | 'FALHA_TOTAL';
  details: string;
}

const STORAGE_DYNAMIC_DB_KEY = 'jarvis_dynamic_database_v2';
const COLLECTION_NAME_REGEX = /^[a-z0-9_]+$/;

export class DynamicDatabaseService {
  private static instance: DynamicDatabaseService;
  private collections: Record<string, StoredDynamicDocument[]> = {};
  private processedEventIds: Set<string> = new Set();
  private listeners: Array<() => void> = [];

  private constructor() {
    this.carregar();
  }

  public static getInstance(): DynamicDatabaseService {
    if (!DynamicDatabaseService.instance) {
      DynamicDatabaseService.instance = new DynamicDatabaseService();
    }
    return DynamicDatabaseService.instance;
  }

  private carregar(): void {
    if (typeof window === 'undefined') return;
    try {
      const salvo = localStorage.getItem(STORAGE_DYNAMIC_DB_KEY);
      if (salvo) {
        this.collections = JSON.parse(salvo);
        Object.values(this.collections).forEach((docs) => {
          docs.forEach((d) => {
            if (d.eventId) this.processedEventIds.add(d.eventId);
          });
        });
      } else {
        this.inicializarColecoesIniciais();
      }
    } catch (e) {
      console.warn('Erro ao carregar DynamicDatabaseService:', e);
      this.inicializarColecoesIniciais();
    }
  }

  private inicializarColecoesIniciais(): void {
    this.collections = {
      cotacoes_b3_historico: [
        {
          _id: 'doc_init_1',
          collectionName: 'cotacoes_b3_historico',
          data: { ticker: 'PETR4', preco: 38.45, dy_anual: 14.2, data_hora: '2026-10-18T19:00:00Z' },
          eventId: 'evt_init_petr4',
          createdAt: new Date().toISOString(),
          decisionReasoning: 'Registro inicial de cotação via Webhook Especialista de Finanças.',
          webhookSource: 'http://localhost:800/webhook/especialista-financas/test',
          executionStatus: 'DUAL_COMMIT',
        },
      ],
      automacao_home_eventos: [
        {
          _id: 'doc_init_2',
          collectionName: 'automacao_home_eventos',
          data: { dispositivo: 'luz_sala', comando: 'ligar', ambiente: 'Sala de Estar', autor: 'Matheus Dullius' },
          eventId: 'evt_init_luz_sala',
          createdAt: new Date().toISOString(),
          decisionReasoning: 'Registro de acionamento de iluminação via Home Assistant.',
          webhookSource: 'http://localhost:800/webhook/especialista-automacao/test',
          executionStatus: 'DUAL_COMMIT',
        },
      ],
    };
    this.salvar();
  }

  private salvar(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_DYNAMIC_DB_KEY, JSON.stringify(this.collections));
    } catch (e) {
      console.warn('Erro ao salvar coleções dinâmicas:', e);
    }
    this.notify();
  }

  /**
   * Salva documento de forma autônoma na coleção desejada pela IA
   */
  public async saveToDatabase(input: DynamicDatabaseSaveInput): Promise<StoredDynamicDocument> {
    const rawName = (input.collectionName || '').trim().toLowerCase();

    // 1. Validação estrita de regex /^[a-z0-9_]+$/
    if (!COLLECTION_NAME_REGEX.test(rawName)) {
      throw new Error(
        `Nome da coleção inválido: "${rawName}". Deve seguir obrigatoriamente a regex /^[a-z0-9_]+$/ (apenas letras minúsculas, números e sublinhados).`
      );
    }

    const eventKey = input.eventId || input.idempotencyKey || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // 2. Proteção contra duplicidade de webhooks (Idempotência)
    if (this.processedEventIds.has(eventKey)) {
      const existing = (this.collections[rawName] || []).find((d) => d.eventId === eventKey);
      if (existing) {
        return existing;
      }
    }

    const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newDoc: StoredDynamicDocument = {
      _id: docId,
      collectionName: rawName,
      data: input.documentData || {},
      eventId: eventKey,
      createdAt: new Date().toISOString(),
      decisionReasoning: input.decisionReasoning || 'Persistência autônoma autorizada pelo orquestrador JARVIS.',
      webhookSource: input.webhookSource || 'universal_inbox',
      executionStatus: 'SALVO',
    };

    if (!this.collections[rawName]) {
      this.collections[rawName] = [];
    }

    this.collections[rawName].unshift(newDoc);
    this.processedEventIds.add(eventKey);
    this.salvar();

    if (typeof window !== 'undefined') {
      fetch('/api/db/dynamic-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionName: rawName,
          documentData: newDoc.data,
          eventId: eventKey,
          decisionReasoning: newDoc.decisionReasoning,
          webhookSource: newDoc.webhookSource,
        }),
      }).catch(() => {});
    }

    return newDoc;
  }

  /**
   * Tomada de Decisão Autônoma do Jarvis (Dual Commit com Promise.allSettled)
   */
  public async executeAutonomousDecision(params: {
    decision: 'DESCARTAR' | 'EXECUTAR_HTTP' | 'SALVAR_BANCO' | 'EXECUTAR_AMBOS';
    databaseInput?: DynamicDatabaseSaveInput;
    httpPayload?: { url: string; method?: string; body?: any; headers?: any };
  }): Promise<DynamicDecisionResult> {
    const { decision, databaseInput, httpPayload } = params;

    if (decision === 'DESCARTAR') {
      return {
        decision: 'DESCARTAR',
        status: 'SUCESSO',
        details: 'Evento descartado com sucesso sem efeitos colaterais.',
      };
    }

    // Se for apenas salvar banco
    if (decision === 'SALVAR_BANCO' && databaseInput) {
      const doc = await this.saveToDatabase(databaseInput);
      return {
        decision: 'SALVAR_BANCO',
        collectionSaved: doc.collectionName,
        documentId: doc._id,
        status: 'SUCESSO',
        details: `Documento persistido na coleção "${doc.collectionName}".`,
      };
    }

    // Se for apenas HTTP
    if (decision === 'EXECUTAR_HTTP' && httpPayload) {
      try {
        const res = await this.executeHttpWithRetry(httpPayload.url, httpPayload.method || 'POST', httpPayload.body, httpPayload.headers);
        return {
          decision: 'EXECUTAR_HTTP',
          httpEndpoint: httpPayload.url,
          httpSuccess: true,
          status: 'SUCESSO',
          details: `Requisição HTTP executada com sucesso para ${httpPayload.url}.`,
        };
      } catch (err: any) {
        return {
          decision: 'EXECUTAR_HTTP',
          httpEndpoint: httpPayload.url,
          httpSuccess: false,
          status: 'FALHA_TOTAL',
          details: `Falha na requisição HTTP: ${err.message}`,
        };
      }
    }

    // EXECUÇÃO DUAL (EXECUTAR_AMBOS) VIA Promise.allSettled()
    const tasks: [Promise<StoredDynamicDocument | null>, Promise<any>] = [
      databaseInput ? this.saveToDatabase({ ...databaseInput, executionStatus: 'DUAL_COMMIT' as any }) : Promise.resolve(null),
      httpPayload ? this.executeHttpWithRetry(httpPayload.url, httpPayload.method || 'POST', httpPayload.body, httpPayload.headers) : Promise.resolve(null),
    ];

    const results = await Promise.allSettled(tasks);
    const dbResult = results[0];
    const httpResult = results[1];

    const dbSuccess = dbResult.status === 'fulfilled' && dbResult.value !== null;
    const httpSuccess = httpResult.status === 'fulfilled';

    let finalStatus: 'SUCESSO' | 'FALHA_PARCIAL' | 'FALHA_TOTAL' = 'SUCESSO';
    if (!dbSuccess && !httpSuccess) finalStatus = 'FALHA_TOTAL';
    else if (!dbSuccess || !httpSuccess) finalStatus = 'FALHA_PARCIAL';

    return {
      decision: 'EXECUTAR_AMBOS',
      collectionSaved: dbSuccess ? (dbResult.value as StoredDynamicDocument).collectionName : undefined,
      documentId: dbSuccess ? (dbResult.value as StoredDynamicDocument)._id : undefined,
      httpEndpoint: httpPayload?.url,
      httpSuccess,
      status: finalStatus,
      details: `Execução Dual completada com status ${finalStatus}. DB: ${dbSuccess ? 'OK' : 'Falha'}. HTTP: ${httpSuccess ? 'OK' : 'Falha'}.`,
    };
  }

  private async executeHttpWithRetry(url: string, method: string, body: any, headers: any, maxRetries = 2): Promise<any> {
    const isExternalUrl = url.startsWith('http://') || url.startsWith('https://');
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4500);

        if (isExternalUrl) {
          const proxyRes = await fetch('/api/n8n/forward-decision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              webhookUrl: url,
              payload: body || {},
              origem: 'DYNAMIC_DATABASE_DUAL_COMMIT',
            }),
            signal: controller.signal,
          }).finally(() => clearTimeout(timeout));

          if (!proxyRes.ok && proxyRes.status >= 500 && attempt < maxRetries) {
            throw new Error(`HTTP ${proxyRes.status}`);
          }
          return await proxyRes.json().catch(() => ({ status: proxyRes.status }));
        }

        const res = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Jarvis-Dynamic-Executor/2.0',
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        if (!res.ok && res.status >= 500 && attempt < maxRetries) {
          throw new Error(`HTTP ${res.status}`);
        }
        return await res.json().catch(() => ({ status: res.status }));
      } catch (err) {
        attempt++;
        if (attempt > maxRetries) throw err;
        await new Promise((r) => setTimeout(r, 300 * Math.pow(2, attempt))); // exponential backoff
      }
    }
  }

  public listCollections(): string[] {
    return Object.keys(this.collections).sort();
  }

  public getDocuments(collectionName: string): StoredDynamicDocument[] {
    return this.collections[collectionName] || [];
  }

  public deleteDocument(collectionName: string, docId: string): boolean {
    if (!this.collections[collectionName]) return false;
    this.collections[collectionName] = this.collections[collectionName].filter((d) => d._id !== docId);
    this.salvar();
    return true;
  }

  public deleteCollection(collectionName: string): boolean {
    if (!this.collections[collectionName]) return false;
    delete this.collections[collectionName];
    this.salvar();
    return true;
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
        console.error('Erro em listener do DynamicDatabaseService:', e);
      }
    });
  }
}

export const dynamicDatabaseService = DynamicDatabaseService.getInstance();
