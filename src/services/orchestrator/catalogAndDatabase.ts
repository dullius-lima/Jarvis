//Catálogo Dinâmico de Tools e DynamicDatabaseTool
// src/services/orchestrator/catalogAndDatabase.ts

import { pool } from '../../config/database.js';
import { emitBrainLinkEvent } from '../brainSocketService.js';
import {
  DynamicToolCatalogItem,
  ensureOrchestratorSchema,
  sanitizeToolName
} from './brainConfigAndUtils.js';

const CORE_BUILT_IN_TOOLS: DynamicToolCatalogItem[] = [
  {
    slug: 'dynamicdatabasetool',
    name: 'DynamicDatabaseTool',
    category: 'SQL',
    method: 'SQL',
    endpoint: '',
    description: 'Grava registros e documentos JSON estruturados no PostgreSQL.'
  },
  {
    slug: 'consultar_base_rag',
    name: 'Consultar Base RAG',
    category: 'RAG',
    method: 'RAG',
    endpoint: '',
    description: 'Pesquisa semântica na base de conhecimento vetorial (RAG).'
  },
  {
    slug: 'executar_comando_ssh',
    name: 'Executar Comando SSH',
    category: 'SSH',
    method: 'SSH',
    endpoint: '',
    description: 'Executa comandos remotos via terminal SSH ou lê logs do servidor.'
  },
  {
    slug: 'http_request_universal',
    name: 'HTTP Request Universal',
    category: 'HTTP',
    method: 'HTTP',
    endpoint: '',
    description: 'Dispara requisições HTTP REST/Webhook para URLs externas.'
  }
];

export async function saveToDatabase(params: {
  collectionName: string;
  eventId?: string;
  documentData: Record<string, any>;
  decisionReasoning?: string;
  webhookSource?: string;
}) {
  const cleanCollection = sanitizeToolName(params.collectionName || 'general_events');
  const eventId =
    params.eventId || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  await pool
    .query(`
      CREATE TABLE IF NOT EXISTS dynamic_collections (
        id SERIAL PRIMARY KEY,
        collection_name VARCHAR(100) NOT NULL,
        event_id VARCHAR(150) UNIQUE NOT NULL,
        document_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        decision_reasoning TEXT,
        webhook_source VARCHAR(100) DEFAULT 'orchestrator',
        execution_status VARCHAR(50) DEFAULT 'persisted',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `)
    .catch(() => {});

  const result = await pool.query(
    `INSERT INTO dynamic_collections 
      (collection_name, event_id, document_data, decision_reasoning, webhook_source, execution_status)
     VALUES ($1, $2, $3, $4, $5, 'persisted')
     ON CONFLICT (event_id) DO UPDATE SET document_data = EXCLUDED.document_data
     RETURNING *;`,
    [
      cleanCollection,
      eventId,
      JSON.stringify(params.documentData || {}),
      params.decisionReasoning || 'Persistência autônoma acionada pelo Orquestrador JARVIS',
      params.webhookSource || 'orchestrator'
    ]
  );

  try {
    emitBrainLinkEvent({
      axon_id: `db_${cleanCollection}`,
      source_dendrite: 'jarvis_core',
      target_dendrite: 'hippocampus_rag',
      direction: 'FORWARD',
      neurotransmitter_type: 'DOPAMINA',
      intensity: 0.9,
      metadata: { collection: cleanCollection, eventId, duplicateIgnored: result.rowCount === 0 }
    } as any);
  } catch {}

  return {
    persisted: (result.rowCount ?? 0) > 0,
    eventId,
    collection: cleanCollection,
    record: result.rows[0] || null
  };
}

export async function getDynamicToolsCatalog(): Promise<{
  catalog: DynamicToolCatalogItem[];
  connectorsMap: Map<string, any>;
}> {
  await ensureOrchestratorSchema();
  const catalogMap = new Map<string, DynamicToolCatalogItem>();
  const connectorsMap = new Map<string, any>();

  let deletedKeys: string[] = [];
  try {
    const delRes = await pool.query(
      `SELECT value FROM system_configs WHERE key = 'deleted_default_connectors' LIMIT 1;`
    );
    if (delRes.rows.length > 0) {
      const rawVal = delRes.rows[0].value;
      const parsedVal = typeof rawVal === 'string' ? JSON.parse(rawVal) : rawVal;
      if (Array.isArray(parsedVal)) {
        deletedKeys = parsedVal.map((k: any) => sanitizeToolName(String(k)));
      }
    }
  } catch {}

  for (const coreTool of CORE_BUILT_IN_TOOLS) {
    if (!deletedKeys.includes(coreTool.slug)) {
      catalogMap.set(coreTool.slug, coreTool);
    }
  }

  try {
    const connectorsRes = await pool.query(
      `SELECT * FROM external_connectors ORDER BY updated_at DESC;`
    );
    for (const row of connectorsRes.rows) {
      const slug = sanitizeToolName(row.provider_key || row.name);
      if (row.is_enabled === false) continue;

      const cfg =
        typeof row.config === 'string'
          ? JSON.parse(row.config || '{}')
          : row.config || {};

      connectorsMap.set(slug, { ...row, config: cfg });
      catalogMap.set(slug, {
        slug,
        name: row.name || slug,
        category: row.category || cfg.tool_type || 'Custom Tool',
        method: String(cfg.http_method || cfg.method || cfg.tool_type || 'API').toUpperCase(),
        endpoint: cfg.endpoint_url || row.endpoint_url || '',
        description:
          row.description ||
          cfg.description ||
          `Conector externo ${row.name || slug}.`
      });
    }
  } catch (err: any) {
    console.warn('⚠️ [Catálogo Dinâmico] Aviso ao ler external_connectors:', err?.message);
  }

  try {
    const agRes = await pool.query(`SELECT tools FROM ai_agents WHERE tools IS NOT NULL;`);
    for (const row of agRes.rows) {
      const list = Array.isArray(row.tools)
        ? row.tools
        : typeof row.tools === 'string'
        ? JSON.parse(row.tools || '[]')
        : [];
      for (const item of list) {
        const slug = sanitizeToolName(String(item));
        if (slug && !catalogMap.has(slug) && !deletedKeys.includes(slug)) {
          catalogMap.set(slug, {
            slug,
            name: slug,
            category: 'Agent Tool',
            method: 'TOOL',
            endpoint: '',
            description: `Ferramenta ${slug} vinculada a especialista.`
          });
        }
      }
    }
  } catch {}

  return {
    catalog: Array.from(catalogMap.values()),
    connectorsMap
  };
}