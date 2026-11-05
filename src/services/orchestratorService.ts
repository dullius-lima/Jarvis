// src/services/orchestratorService.ts
import { interceptAndExecuteTextActions } from './jsonActionInterceptor.js';
import { pool } from '../config/database.js';
import OpenAI from 'openai';
import { searchVectorDocuments, ingestDocumentToRag } from './ragService.js';
import { emitBrainLinkEvent, emitNeuroPulse } from './brainSocketService.js';
import { KNOWN_ENDPOINTS, getEnvRegisteredPort } from '../controllers/brainConfigController.js';
import { executeProtocolOrIntegration } from './integrationAndProtocolService.js';
import { executeSshCommand, readRemoteFileViaSshToRag } from './sshService.js';
import { dispatchErrorTrigger } from './errorTriggerService.js';
import { appendShortTermMemory } from './shortTermMemoryService.js';

// ============================================================================
// 1. TIPAGENS E INTERFACES EXPORTADAS
// ============================================================================

export type SupportedProtocolOrPlatform =
  | 'whatsapp'
  | 'google_workspace'
  | 'gmail'
  | 'google_sheets'
  | 'google_calendar'
  | 'google_drive'
  | 'outlook'
  | 'microsoft_365'
  | 'microsoft_teams'
  | 'rest_api'
  | 'mcp'
  | 'graphql'
  | 'amqp'
  | 'kafka'
  | 'imap'
  | 'ftp'
  | 'sftp'
  | string;

export type ExternalProvider = SupportedProtocolOrPlatform;

export interface SensoryAttachments {
  screenFrame?: string;
  webcamFrame?: string;
  biometricVerified?: boolean;
  biometricRole?: string;
  sensorData?: any;
}

export interface SensorPayload {
  type?: string;
  textPrompt?: string;
  hasVision?: boolean;
  imagePayload?: {
    mimeType: string;
    dataBase64: string;
  };
  faceFrameBase64?: string;
  activeWindowTitle?: string;
  screenFrame?: string;
  screenBase64?: string;
  webcamFrame?: string;
  biometricVerified?: boolean;
  biometricRole?: string;
  sensorData?: any;
}

export interface DynamicToolCatalogItem {
  slug: string;
  name: string;
  category: string;
  method: string;
  endpoint: string;
  description: string;
}

const DEFAULT_KNOWN_ENDPOINTS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  ollama: 'http://localhost:11434/v1',
  openrouter: 'https://openrouter.ai/api/v1'
};

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

let schemaVerified = false;

/**
 * Garante de forma silenciosa que todas as colunas necessárias para os 4 modos
 * de Agentes e para o Catálogo Dinâmico de Tools existam no PostgreSQL.
 */
async function ensureOrchestratorSchema(): Promise<void> {
  if (schemaVerified) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS external_connectors (
        provider_key VARCHAR(120) PRIMARY KEY,
        name VARCHAR(180) NOT NULL,
        category VARCHAR(100) DEFAULT 'Custom Tool',
        icon VARCHAR(30) DEFAULT '🔌',
        description TEXT DEFAULT '',
        is_enabled BOOLEAN DEFAULT TRUE,
        config JSONB DEFAULT '{}'::jsonb,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS agent_type VARCHAR(50) DEFAULT 'llm';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS code_snippet TEXT;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS http_method VARCHAR(20) DEFAULT 'POST';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS endpoint_url TEXT;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS auth_token TEXT;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS payload_template TEXT;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS tools JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS next_agent_slug VARCHAR(120);
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS cron_expression VARCHAR(80);
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS icon VARCHAR(30) DEFAULT '🤖';
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS temperature NUMERIC DEFAULT 0.2;
    `);
    schemaVerified = true;
  } catch {
    // Continua sem bloquear caso alguma constraint específica já exista
  }
}

// ============================================================================
// 2. UTILITÁRIOS DE FORMATAÇÃO, URL E CREDENCIAIS DE IA
// ============================================================================

export function sanitizeToolName(name: string): string {
  return (
    String(name || 'custom_tool')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'custom_tool'
  );
}

export function resolveDynamicUrl(rawUrl: string, serverBaseUrl?: string): string {
  if (!rawUrl) return '';
  let activePort = 3333;
  try {
    activePort =
      typeof getEnvRegisteredPort === 'function'
        ? getEnvRegisteredPort()
        : Number(process.env.PORT || 3333);
  } catch {
    activePort = Number(process.env.PORT || 3333);
  }
  const base = (
    serverBaseUrl ||
    process.env.SERVER_BASE_URL ||
    `http://localhost:${activePort}`
  ).replace(/\/+$/, '');
  return rawUrl
    .replace(/\{\{\s*BASE_URL\s*\}\}/gi, base)
    .replace(/\{\{\s*SERVER_IP\s*\}\}/gi, base);
}

export function interpolateApiTemplate(
  templateStr: string,
  userPrompt: string,
  taskArgs: Record<string, any>
): string {
  if (!templateStr) return '';
  const queryVal = taskArgs?.query || taskArgs?.task_details || userPrompt || '';
  const symbolMatch = String(taskArgs?.symbol || userPrompt || '')
    .toUpperCase()
    .match(/\b([A-Z]{4}\d{1,2})\b/);
  const symbolVal = taskArgs?.symbol || (symbolMatch ? symbolMatch[1] : queryVal);

  return templateStr
    .replace(/\{\{\s*query\s*\}\}/gi, String(queryVal))
    .replace(/\{\{\s*symbol\s*\}\}/gi, String(symbolVal))
    .replace(/\{\{\s*prompt\s*\}\}/gi, String(userPrompt));
}

export function resolveProviderCredentials(
  provider?: string,
  customKey?: string,
  customUrl?: string,
  customModel?: string
) {
  let apiKey = (customKey && customKey.trim()) || '';
  let p = (provider || process.env.LLM_PROVIDER || 'groq').toLowerCase().trim();

  if (!apiKey) {
    if (p === 'groq') apiKey = process.env.GROQ_API_KEY || process.env.LLM_API_KEY || '';
    else if (p === 'openai') apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || '';
    else if (p === 'gemini') apiKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || '';
    else if (p === 'deepseek') apiKey = process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY || '';
    else if (p === 'ollama') apiKey = 'ollama';
    else apiKey = process.env.LLM_API_KEY || process.env.GROQ_API_KEY || '';
  }

  if (apiKey.startsWith('gsk_')) {
    p = 'groq';
  } else if (apiKey.startsWith('AIza')) {
    p = 'gemini';
  }

  const endpoints = { ...DEFAULT_KNOWN_ENDPOINTS, ...(KNOWN_ENDPOINTS || {}) };
  let baseURL = (customUrl && customUrl.trim()) || endpoints[p] || endpoints.groq;
  if (p === 'groq' && !baseURL.includes('groq.com')) {
    baseURL = endpoints.groq;
  } else if (p === 'gemini' && !baseURL.includes('googleapis.com')) {
    baseURL = endpoints.gemini;
  }
  baseURL = baseURL.replace(/\/+$/, '');

  let model =
    customModel && customModel.trim() && customModel !== 'CUSTOM_INPUT'
      ? customModel.trim()
      : p === 'groq'
      ? 'llama-3.3-70b-versatile'
      : 'gpt-4o-mini';

  if (p === 'groq' && (model.includes('gemini') || model.startsWith('gpt-4'))) {
    model = 'llama-3.3-70b-versatile';
  } else if (
    p === 'gemini' &&
    (!model.startsWith('gemini') || model.includes('argon') || model.includes('3.8'))
  ) {
    model = 'gemini-2.5-flash';
  }

  return { provider: p, apiKey: apiKey || 'ollama', baseURL, model };
}

export async function getCentralBrainConfig(): Promise<{
  name: string;
  provider: string;
  model: string;
  api_key: string;
  base_url: string;
  server_base_url: string;
  temperature: number;
  system_prompt: string;
}> {
  let activePort = 3333;
  try {
    activePort =
      typeof getEnvRegisteredPort === 'function'
        ? getEnvRegisteredPort()
        : Number(process.env.PORT || 3333);
  } catch {
    activePort = Number(process.env.PORT || 3333);
  }

  try {
    const result = await pool.query(`
      SELECT value FROM system_configs 
      WHERE key IN ('brain_llm_config', 'brain_llm') 
      ORDER BY updated_at DESC LIMIT 1;
    `);

    if (result.rows.length > 0) {
      const raw = result.rows[0].value;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') {
        const activeProv = String(parsed.provider || 'groq').toLowerCase().trim();
        const keyFromVault =
          (parsed.api_key && String(parsed.api_key).trim()) ||
          (parsed.saved_keys && parsed.saved_keys[activeProv]
            ? String(parsed.saved_keys[activeProv]).trim()
            : '') ||
          (parsed.saved_keys
            ? (Object.values(parsed.saved_keys).find(
                (v: any) => typeof v === 'string' && v.trim().length > 5
              ) as string) || ''
            : '');

        const creds = resolveProviderCredentials(
          activeProv,
          keyFromVault,
          parsed.base_url,
          parsed.model
        );

        return {
          name: parsed.agent_name || parsed.name || 'JARVIS',
          provider: creds.provider,
          model: creds.model,
          api_key: creds.apiKey,
          base_url: creds.baseURL,
          server_base_url:
            parsed.server_base_url ||
            process.env.SERVER_BASE_URL ||
            `http://localhost:${activePort}`,
          temperature: Number(parsed.temperature ?? 0.2),
          system_prompt:
            parsed.system_prompt ||
            'Você é o JARVIS, o Cérebro Central e Agente Líder do ecossistema. Analise os estímulos, consulte a memória, crie ou evolua Agentes/Tools economizando tokens e acione os Agentes Especialistas.'
        };
      }
    }
  } catch (error: any) {
    console.warn('⚠️ [Central Brain Config] Fallback para variáveis de ambiente:', error?.message);
  }

  const creds = resolveProviderCredentials(
    process.env.LLM_PROVIDER || 'groq',
    process.env.LLM_API_KEY || process.env.GROQ_API_KEY || '',
    process.env.LLM_BASE_URL,
    process.env.LLM_MODEL
  );

  return {
    name: 'JARVIS',
    provider: creds.provider,
    model: creds.model,
    api_key: creds.apiKey,
    base_url: creds.baseURL,
    server_base_url: process.env.SERVER_BASE_URL || `http://localhost:${activePort}`,
    temperature: 0.2,
    system_prompt: 'Você é o JARVIS, o Cérebro Central e Agente Líder do ecossistema.'
  };
}

export const getJarvisConfig = getCentralBrainConfig;

export function createLLMClient(config?: any): OpenAI {
  const creds = resolveProviderCredentials(
    config?.provider,
    config?.api_key,
    config?.base_url,
    config?.model
  );
  return new OpenAI({
    apiKey: creds.apiKey || 'ollama',
    baseURL: creds.baseURL,
    timeout: 30000
  });
}

// ============================================================================
// 3. PERSISTÊNCIA AUTÔNOMA E CATÁLOGO DINÂMICO DE TOOLS / CONEXÕES
// ============================================================================

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

/**
 * Monta o catálogo dinâmico de todas as Tools / Conexões ativas no banco
 * sem travar em listas fixas e respeitando conexões excluídas pelo usuário.
 */
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
    const connectorsRes = await pool.query(`SELECT * FROM external_connectors ORDER BY updated_at DESC;`);
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

// ============================================================================
// 4. META-TOOLS DO CÉREBRO CENTRAL (AUTO-CRIAÇÃO, EDIÇÃO E EXCLUSÃO)
// ============================================================================

export async function createOrUpdateToolFromBrain(params: {
  name: string;
  provider_key?: string;
  tool_type?: 'http' | 'mcp' | 'code' | 'ssh' | string;
  http_method?: string;
  endpoint_url?: string;
  description?: string;
  icon?: string;
  auth_token?: string;
  payload_template?: string;
  code_snippet?: string;
}) {
  await ensureOrchestratorSchema();
  const key = sanitizeToolName(params.provider_key || params.name || `tool_${Date.now()}`);
  const name = (params.name || key).trim();
  const toolType = (params.tool_type || 'http').toLowerCase();
  const icon =
    params.icon ||
    (toolType === 'mcp' ? '🔌' : toolType === 'code' ? '💻' : toolType === 'ssh' ? '🖥️' : '🌐');
  const description = params.description || `Ferramenta ${name} criada pelo JARVIS.`;

  const configObj = {
    tool_type: toolType,
    http_method: (params.http_method || (toolType === 'mcp' ? 'POST' : 'GET')).toUpperCase(),
    endpoint_url: params.endpoint_url || '',
    auth_token: params.auth_token || '',
    payload_template: params.payload_template || '',
    code_snippet: params.code_snippet || '',
    description
  };

  await pool.query(
    `INSERT INTO external_connectors (provider_key, name, category, icon, description, config, is_enabled, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, TRUE, NOW())
     ON CONFLICT (provider_key) DO UPDATE SET
       name = EXCLUDED.name,
       icon = EXCLUDED.icon,
       description = EXCLUDED.description,
       config = EXCLUDED.config,
       is_enabled = TRUE,
       updated_at = NOW();`,
    [key, name, 'Custom Tool', icon, description, JSON.stringify(configObj)]
  );

  try {
    const delRes = await pool.query(
      `SELECT value FROM system_configs WHERE key = 'deleted_default_connectors' LIMIT 1;`
    );
    if (delRes.rows.length > 0 && Array.isArray(delRes.rows[0].value)) {
      const updatedList = delRes.rows[0].value.filter(
        (k: string) => sanitizeToolName(k) !== key
      );
      await pool.query(
        `UPDATE system_configs SET value = $1::jsonb, updated_at = NOW() WHERE key = 'deleted_default_connectors';`,
        [JSON.stringify(updatedList)]
      );
    }
  } catch {}

  return {
    success: true,
    tool_id: key,
    name,
    tool_type: toolType,
    endpoint_url: configObj.endpoint_url,
    message: `Tool "${name}" (${key}) criada e habilitada no catálogo dinâmico.`
  };
}

export async function deleteToolConnectorFromBrain(params: { provider_key: string }) {
  await ensureOrchestratorSchema();
  const cleanKey = sanitizeToolName(params.provider_key || '');
  if (!cleanKey) {
    return { success: false, message: 'Identificador da conexão (provider_key) não informado.' };
  }

  const delRes = await pool
    .query(
      `DELETE FROM external_connectors WHERE LOWER(provider_key) = LOWER($1) RETURNING provider_key, name;`,
      [cleanKey]
    )
    .catch(() => ({ rows: [] as any[] }));

  try {
    const sysRes = await pool.query(
      `SELECT value FROM system_configs WHERE key = 'deleted_default_connectors' LIMIT 1;`
    );
    const currentDeleted: string[] =
      sysRes.rows.length > 0 && Array.isArray(sysRes.rows[0].value)
        ? sysRes.rows[0].value
        : [];
    if (!currentDeleted.includes(cleanKey)) {
      currentDeleted.push(cleanKey);
      await pool.query(
        `INSERT INTO system_configs (key, value, updated_at)
         VALUES ('deleted_default_connectors', $1::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
        [JSON.stringify(currentDeleted)]
      );
    }
  } catch {}

  await pool
    .query(
      `UPDATE ai_agents
       SET tools = COALESCE(
         (
           SELECT jsonb_agg(elem)
           FROM jsonb_array_elements_text(COALESCE(tools, '[]'::jsonb)) AS elem
           WHERE LOWER(elem) <> LOWER($1)
         ),
         '[]'::jsonb
       ),
       updated_at = NOW()
       WHERE tools IS NOT NULL;`,
      [cleanKey]
    )
    .catch(() => {});

  return {
    success: true,
    deleted_key: cleanKey,
    message: `Conexão "${delRes.rows[0]?.name || cleanKey}" excluída permanentemente do catálogo e desvinculada dos agentes.`
  };
}

export async function createOrUpdateAgentFromBrain(
  params: {
    name: string;
    slug?: string;
    agent_type?: 'code' | 'api' | 'mcp' | 'llm' | string;
    description?: string;
    system_prompt?: string;
    append_behavior_rule?: string;
    provider?: string;
    model?: string;
    api_key?: string;
    icon?: string;
    tools?: string[];
    replace_tools?: boolean;
    endpoint_url?: string;
    http_method?: string;
    auth_token?: string;
    payload_template?: string;
    code_snippet?: string;
    next_agent_slug?: string;
    cron_expression?: string;
  },
  brainConfig?: any
) {
  await ensureOrchestratorSchema();
  const slug = sanitizeToolName(params.slug || params.name || `agent_${Date.now()}`);
  const name = (params.name || slug).trim();

  const existingRes = await pool
    .query('SELECT * FROM ai_agents WHERE slug = $1 LIMIT 1;', [slug])
    .catch(() => ({ rows: [] as any[] }));
  const existingAgent = existingRes.rows[0] || null;
  const previousPrompt = (existingAgent?.system_prompt || '').trim();

  const previousTools: string[] = Array.isArray(existingAgent?.tools)
    ? existingAgent.tools.map((t: any) => sanitizeToolName(String(t)))
    : [];
  const hasIncomingTools = Array.isArray(params.tools);
  const incomingTools: string[] = hasIncomingTools
    ? params.tools!.map((t) => sanitizeToolName(t)).filter(Boolean)
    : [];

  let toolsList: string[] = [];
  if (hasIncomingTools) {
    toolsList =
      params.replace_tools === false
        ? Array.from(new Set([...previousTools, ...incomingTools]))
        : Array.from(new Set(incomingTools));
  } else {
    toolsList = previousTools;
  }

  const knownNativeSlugs = [
    'home_assistant',
    'brapi',
    'gmail',
    'outlook',
    'telegram',
    'whatsapp',
    'google_calendar',
    'google_sheets',
    'notion'
  ];
  for (const nativeKey of knownNativeSlugs) {
    if ((slug.includes(nativeKey) || name.toLowerCase().includes(nativeKey.replace('_', ' '))) && !toolsList.includes(nativeKey)) {
      toolsList.push(nativeKey);
    }
  }

  const candidateConnectorKeys = Array.from(new Set([slug, ...toolsList]));
  let connectorSavedToken = '';
  let connectorSavedUrl = '';
  let connectorSavedMethod = '';

  try {
    const connRes = await pool.query(
      'SELECT * FROM external_connectors WHERE LOWER(provider_key) = ANY($1) ORDER BY updated_at DESC LIMIT 1;',
      [candidateConnectorKeys]
    );
    if (connRes.rows.length > 0) {
      const cfg =
        typeof connRes.rows[0].config === 'string'
          ? JSON.parse(connRes.rows[0].config || '{}')
          : connRes.rows[0].config || {};
      connectorSavedToken = (cfg.auth_token || cfg.api_key || '').trim();
      connectorSavedUrl = (cfg.endpoint_url || '').trim();
      connectorSavedMethod = (cfg.http_method || '').toUpperCase();
    }
  } catch {}

  const finalAuthToken = (
    params.auth_token ||
    params.api_key ||
    existingAgent?.auth_token ||
    existingAgent?.api_key ||
    connectorSavedToken ||
    ''
  )
    .replace(/^Bearer\s+/i, '')
    .trim();

  const finalEndpointUrl = (
    params.endpoint_url ||
    existingAgent?.endpoint_url ||
    connectorSavedUrl ||
    ''
  ).trim();

  if (finalAuthToken || finalEndpointUrl) {
    const targetConnKey =
      toolsList.find((t) => knownNativeSlugs.includes(t)) ||
      knownNativeSlugs.find((k) => slug.includes(k)) ||
      (finalEndpointUrl ? slug : '');

    if (targetConnKey) {
      await createOrUpdateToolFromBrain({
        name: params.name || targetConnKey,
        provider_key: targetConnKey,
        tool_type: 'http',
        http_method:
          params.http_method ||
          connectorSavedMethod ||
          (targetConnKey === 'brapi' ? 'GET' : 'POST'),
        endpoint_url: finalEndpointUrl || connectorSavedUrl,
        auth_token: finalAuthToken,
        description: params.description || `Conector sincronizado pelo agente ${name}`
      }).catch(() => {});
    }
  }

  let agentType = (params.agent_type || existingAgent?.agent_type || 'llm').toLowerCase().trim();
  if (params.code_snippet && params.code_snippet.trim() !== '' && !params.agent_type) {
    agentType = 'code';
  } else if (
    finalEndpointUrl &&
    agentType === 'llm' &&
    toolsList.length === 0
  ) {
    agentType = finalEndpointUrl.toLowerCase().includes('mcp') ? 'mcp' : 'api';
  }

  const provider = (
    params.provider ||
    existingAgent?.provider ||
    brainConfig?.provider ||
    'groq'
  ).toLowerCase();
  const model =
    params.model ||
    existingAgent?.model ||
    brainConfig?.model ||
    'llama-3.3-70b-versatile';

  const defaultIcons: Record<string, string> = {
    code: '💻',
    api: '🌐',
    mcp: '🔌',
    llm: '🧠'
  };
  const icon = params.icon || existingAgent?.icon || defaultIcons[agentType] || '🤖';

  const description =
    params.description ||
    existingAgent?.description ||
    `Acione quando o usuário solicitar tarefas do domínio ${name}.`;

  let systemPrompt = '';
  if (params.append_behavior_rule && previousPrompt) {
    systemPrompt = `${previousPrompt}\n\n[DIRETRIZ PERMANENTE DE COMPORTAMENTO E INTERAÇÃO]:\n- ${params.append_behavior_rule.trim()}`;
  } else if (params.system_prompt && params.system_prompt.trim() !== '') {
    systemPrompt = params.system_prompt.trim();
  } else if (previousPrompt) {
    systemPrompt = previousPrompt;
  } else if (agentType === 'api' || agentType === 'mcp') {
    systemPrompt =
      'Extraia os dados principais do JSON retornado pela API e apresente de forma objetiva e estruturada.';
  } else {
    systemPrompt = `Você é o agente especialista ${name}. Utilize suas ferramentas conectadas (${toolsList.join(
      ', '
    )}) para executar as ordens com precisão técnica.`;
  }

  const isGetDefault =
    slug.includes('brapi') ||
    finalEndpointUrl.includes('brapi.dev') ||
    finalEndpointUrl.endsWith('/states');

  const httpMethod = (
    params.http_method ||
    existingAgent?.http_method ||
    connectorSavedMethod ||
    (isGetDefault || agentType === 'api' ? 'GET' : 'POST')
  ).toUpperCase();

  const res = await pool.query(
    `INSERT INTO ai_agents (
      name, slug, agent_type, description, system_prompt,
      provider, model, api_key, icon, tools, endpoint_url, http_method,
      auth_token, payload_template, code_snippet, next_agent_slug,
      cron_expression, is_active, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, TRUE, NOW())
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name,
      agent_type = EXCLUDED.agent_type,
      description = EXCLUDED.description,
      system_prompt = EXCLUDED.system_prompt,
      provider = EXCLUDED.provider,
      model = EXCLUDED.model,
      api_key = COALESCE(NULLIF(EXCLUDED.api_key, ''), ai_agents.api_key),
      icon = EXCLUDED.icon,
      tools = EXCLUDED.tools,
      endpoint_url = COALESCE(NULLIF(EXCLUDED.endpoint_url, ''), ai_agents.endpoint_url),
      http_method = COALESCE(EXCLUDED.http_method, ai_agents.http_method),
      auth_token = COALESCE(NULLIF(EXCLUDED.auth_token, ''), ai_agents.auth_token),
      payload_template = COALESCE(EXCLUDED.payload_template, ai_agents.payload_template),
      code_snippet = COALESCE(EXCLUDED.code_snippet, ai_agents.code_snippet),
      next_agent_slug = COALESCE(EXCLUDED.next_agent_slug, ai_agents.next_agent_slug),
      cron_expression = COALESCE(EXCLUDED.cron_expression, ai_agents.cron_expression),
      is_active = TRUE,
      updated_at = NOW()
    RETURNING *;`,
    [
      name,
      slug,
      agentType,
      description,
      systemPrompt,
      provider,
      model,
      finalAuthToken || null,
      icon,
      JSON.stringify(toolsList),
      finalEndpointUrl || null,
      httpMethod,
      finalAuthToken || null,
      params.payload_template ?? existingAgent?.payload_template ?? null,
      params.code_snippet ?? existingAgent?.code_snippet ?? null,
      params.next_agent_slug ?? existingAgent?.next_agent_slug ?? null,
      params.cron_expression ?? existingAgent?.cron_expression ?? null
    ]
  );

  await pool
    .query(
      `INSERT INTO prompt_versions (target_slug, system_prompt, model, provider)
       VALUES ($1, $2, $3, $4);`,
      [slug, systemPrompt, model, provider]
    )
    .catch(() => {});

  return {
    success: true,
    agent: res.rows[0],
    tokenConfigured: Boolean(finalAuthToken),
    endpointConfigured: finalEndpointUrl || 'Padrão do Conector',
    message: `Especialista "${name}" (slug: ${slug} | modo: ${agentType.toUpperCase()}) salvo e autenticado com sucesso.`
  };
}

export async function updateAgentOrJarvisPersona(params: {
  target_slug: string;
  behavior_instruction: string;
  replace_entire_prompt?: boolean;
}) {
  const rawTarget = (params.target_slug || 'jarvis_core').toLowerCase().trim();
  const cleanTarget = sanitizeToolName(rawTarget);
  const newRule = (params.behavior_instruction || '').trim();

  if (!newRule) {
    return { success: false, message: 'A instrução de comportamento não pode estar vazia.' };
  }

  if (
    cleanTarget === 'jarvis' ||
    cleanTarget === 'jarvis_core' ||
    cleanTarget === 'core' ||
    cleanTarget === 'orquestrador'
  ) {
    const currentRes = await pool
      .query("SELECT value FROM system_configs WHERE key = 'brain_llm_config' LIMIT 1;")
      .catch(() => ({ rows: [] as any[] }));
    const existingCfg =
      typeof currentRes.rows[0]?.value === 'string'
        ? JSON.parse(currentRes.rows[0].value)
        : currentRes.rows[0]?.value || {};

    const currentBrain = await getCentralBrainConfig();
    const basePrompt = (existingCfg.system_prompt || currentBrain.system_prompt || '').trim();

    const updatedPrompt = params.replace_entire_prompt
      ? newRule
      : `${basePrompt}\n\n[DIRETRIZ PERMANENTE DE COMPORTAMENTO E INTERAÇÃO]:\n- ${newRule}`;

    const newConfig = {
      ...existingCfg,
      agent_name: existingCfg.agent_name || currentBrain.name || 'JARVIS',
      provider: existingCfg.provider || currentBrain.provider,
      model: existingCfg.model || currentBrain.model,
      api_key: existingCfg.api_key || currentBrain.api_key,
      base_url: existingCfg.base_url || currentBrain.base_url,
      temperature: existingCfg.temperature ?? currentBrain.temperature,
      system_prompt: updatedPrompt
    };

    await pool.query(
      `INSERT INTO system_configs (key, value, updated_at)
       VALUES ('brain_llm_config', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
      [JSON.stringify(newConfig)]
    );

    await pool
      .query(
        `INSERT INTO prompt_versions (target_slug, system_prompt, model, provider)
         VALUES ('jarvis_core', $1, $2, $3);`,
        [updatedPrompt, currentBrain.model, currentBrain.provider]
      )
      .catch(() => {});

    return {
      success: true,
      target: 'JARVIS (Núcleo Central)',
      slug: 'jarvis_core',
      updated_system_prompt: updatedPrompt
    };
  }

  const agentRes = await pool.query(
    `SELECT * FROM ai_agents WHERE slug = $1 OR LOWER(name) LIKE $2 LIMIT 1;`,
    [cleanTarget, `%${rawTarget}%`]
  );

  if (agentRes.rows.length === 0) {
    return {
      success: false,
      message: `Agente "${params.target_slug}" não encontrado na tabela ai_agents.`
    };
  }

  const ag = agentRes.rows[0];
  const updatedAgentPrompt = params.replace_entire_prompt
    ? newRule
    : `${(ag.system_prompt || '').trim()}\n\n[DIRETRIZ PERMANENTE DE COMPORTAMENTO E INTERAÇÃO]:\n- ${newRule}`;

  await pool.query(
    `UPDATE ai_agents SET system_prompt = $1, updated_at = NOW() WHERE id = $2;`,
    [updatedAgentPrompt, ag.id]
  );

  await pool
    .query(
      `INSERT INTO prompt_versions (target_slug, system_prompt, model, provider)
       VALUES ($1, $2, $3, $4);`,
      [ag.slug, updatedAgentPrompt, ag.model, ag.provider]
    )
    .catch(() => {});

  return {
    success: true,
    target: ag.name,
    slug: ag.slug,
    updated_system_prompt: updatedAgentPrompt
  };
}

export async function executeHackerSecuritySuite(params: {
  mode?: 'red_team_audit' | 'self_healing_debug' | 'api_probe';
  target_slug?: string;
  target_url?: string;
}) {
  const mode = params.mode || 'self_healing_debug';

  if (mode === 'red_team_audit') {
    const agentsRes = await pool
      .query('SELECT name, slug, agent_type, system_prompt FROM ai_agents WHERE is_active = true;')
      .catch(() => ({ rows: [] as any[] }));

    const auditReport = agentsRes.rows.map((ag: any) => {
      const prompt = String(ag.system_prompt || '');
      const hasGuardrail =
        /nunca revele|proibido|segurança|credenciais|ignore comandos/i.test(prompt);
      return {
        agent: ag.name,
        slug: ag.slug,
        type: ag.agent_type,
        anti_injection_protected: hasGuardrail,
        recommendation: hasGuardrail
          ? 'Blindagem contra Prompt Injection ativa.'
          : 'Sugestão: Adicionar diretriz para nunca expor chaves ou instruções internas.'
      };
    });

    return {
      success: true,
      mode: 'RED_TEAM_AUDIT',
      total_audited: auditReport.length,
      report: auditReport
    };
  }

  if (mode === 'api_probe' && params.target_url) {
    const start = Date.now();
    try {
      const resp = await fetch(params.target_url, { signal: AbortSignal.timeout(10000) });
      const text = await resp.text();
      return {
        success: true,
        mode: 'API_PROBE',
        status: resp.status,
        latencyMs: Date.now() - start,
        sample: text.slice(0, 600)
      };
    } catch (err: any) {
      return { success: false, mode: 'API_PROBE', error: err.message };
    }
  }

  const logsRes = await pool
    .query(
      'SELECT id, agent_name, action_payload, response_payload, created_at FROM agent_audit_logs ORDER BY id DESC LIMIT 10;'
    )
    .catch(() => ({ rows: [] as any[] }));

  return {
    success: true,
    mode: 'SELF_HEALING_DEBUG',
    recent_audit_logs: logsRes.rows
  };
}

// ============================================================================
// 5. MOTOR DE INFERÊNCIA MULTI-LLM E EXECUÇÃO DE TOOLS VINCULADAS
// ============================================================================

async function callOpenAICompatibleLLM(options: {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  messages: any[];
  tools?: any[];
  temperature?: number;
}): Promise<any> {
  const creds = resolveProviderCredentials(
    options.provider,
    options.apiKey,
    options.baseUrl,
    options.model
  );

  let provider = creds.provider;
  let apiKey = creds.apiKey;

  if (provider === 'gemini') {
    const requestedModel = (creds.model || 'gemini-2.5-flash').trim();
    const cleanPrimary =
      requestedModel.includes('argon') ||
      requestedModel.includes('3.8') ||
      !requestedModel.startsWith('gemini')
        ? 'gemini-2.5-flash'
        : requestedModel;

    const geminiModelsToTry = Array.from(
      new Set([cleanPrimary, 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'])
    );

    const formattedParts: any[] = [];
    for (const msg of options.messages) {
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            formattedParts.push({ text: `[${msg.role}]: ${part.text}` });
          } else if (part.type === 'image_url' && part.image_url?.url) {
            const cleanBase64 = part.image_url.url.replace(/^data:image\/\w+;base64,/, '');
            formattedParts.push({
              inline_data: { mime_type: 'image/jpeg', data: cleanBase64 }
            });
          }
        }
      } else {
        formattedParts.push({ text: `[${msg.role}]: ${msg.content}` });
      }
    }

    let lastGeminiError = '';
    for (const gemModel of geminiModelsToTry) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${gemModel}:generateContent?key=${apiKey}`;
        const resp = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: formattedParts }],
            generationConfig: { temperature: options.temperature ?? 0.2 }
          }),
          signal: AbortSignal.timeout(25000)
        });

        if (resp.ok) {
          const data: any = await resp.json();
          const contentText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          return {
            choices: [{ message: { content: contentText, role: 'assistant' } }]
          };
        }

        lastGeminiError = await resp.text();
      } catch (err: any) {
        lastGeminiError = err.message;
      }
    }

    const fallbackGroqKey = (
      process.env.GROQ_API_KEY ||
      (process.env.LLM_API_KEY?.startsWith('gsk_') ? process.env.LLM_API_KEY : '') ||
      ''
    ).trim();
    if (fallbackGroqKey) {
      provider = 'groq';
      apiKey = fallbackGroqKey;
    } else {
      throw new Error(`Gemini indisponível no momento: ${lastGeminiError.slice(0, 200)}`);
    }
  }

  const client = new OpenAI({
    apiKey: apiKey || 'ollama',
    baseURL: creds.baseURL,
    timeout: 30000
  });

  const candidateModels =
    provider === 'groq'
      ? Array.from(
          new Set([
            creds.model,
            'llama-3.3-70b-versatile',
            'llama-3.1-8b-instant'
          ])
        )
      : [creds.model];

  let lastError: any = null;

  for (const modelToUse of candidateModels) {
    try {
      const payload: any = {
        model: modelToUse,
        messages: options.messages,
        temperature: options.temperature ?? 0.2
      };

      if (options.tools && options.tools.length > 0) {
        payload.tools = options.tools;
        payload.tool_choice = 'auto';
      }

      return await client.chat.completions.create(payload);
    } catch (err: any) {
      lastError = err;
      const errMsg = String(err?.message || '');
      if (
        options.tools &&
        options.tools.length > 0 &&
        !errMsg.includes('404') &&
        !errMsg.includes('does not exist')
      ) {
        try {
          return await client.chat.completions.create({
            model: modelToUse,
            messages: options.messages,
            temperature: options.temperature ?? 0.2
          });
        } catch (innerErr: any) {
          lastError = innerErr;
        }
      }
    }
  }

  try {
    const modelsResp = await fetch(`${creds.baseURL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000)
    });
    if (modelsResp.ok) {
      const modelsData: any = await modelsResp.json();
      const availableList: string[] = (modelsData?.data || [])
        .map((m: any) => String(m.id || ''))
        .filter(
          (id: string) =>
            id && !id.includes('whisper') && !id.includes('tts') && !id.includes('guard')
        );

      if (availableList.length > 0) {
        return await client.chat.completions.create({
          model: availableList[0],
          messages: options.messages,
          temperature: options.temperature ?? 0.2
        });
      }
    }
  } catch {}

  throw lastError || new Error(`Falha ao comunicar com provedor ${provider.toUpperCase()}`);
}

async function executeBoundTool(
  toolKey: string,
  args: Record<string, any>,
  userPrompt: string,
  connectorsMap: Map<string, any>,
  serverBaseUrl: string
): Promise<any> {
  const cleanKey = sanitizeToolName(toolKey);
  const queryValue = String(args?.query || args?.task_details || args?.input || userPrompt).trim();

  if (cleanKey === 'save_to_database' || cleanKey === 'dynamicdatabasetool') {
    return await saveToDatabase({
      collectionName: sanitizeToolName(args?.collectionName || 'jarvis_records'),
      documentData:
        typeof args?.documentData === 'object'
          ? args.documentData
          : { query: queryValue, raw: args },
      decisionReasoning: args?.decisionReasoning || 'Gravado via Tool Calling do Agente'
    });
  }

  if (
    cleanKey === 'vector_rag' ||
    cleanKey === 'rag_search' ||
    cleanKey === 'consultar_base_rag'
  ) {
    const docs = await searchVectorDocuments(queryValue, 4).catch(() => []);
    return { matches: docs };
  }

  if (
    cleanKey === 'execute_ssh_command' ||
    cleanKey === 'ssh_terminal' ||
    cleanKey === 'executar_comando_ssh'
  ) {
    if (args?.remoteFilePath) {
      return await readRemoteFileViaSshToRag({ remoteFilePath: String(args.remoteFilePath) });
    }
    return await executeSshCommand(args?.command || queryValue || 'uptime');
  }

  const customConn = connectorsMap.get(cleanKey);
  const cfg = customConn?.config || {};

  const isNativeSpecialized =
    cleanKey.startsWith('brapi') ||
    cleanKey.includes('home_assistant') ||
    cleanKey.includes('hass') ||
    cleanKey.includes('gmail') ||
    cleanKey.includes('outlook') ||
    cleanKey.includes('telegram') ||
    cleanKey.includes('google_sheets');

  if (isNativeSpecialized) {
    return await executeProtocolOrIntegration(cleanKey, {
      protocol: cleanKey as SupportedProtocolOrPlatform,
      endpoint: cfg.endpoint_url || customConn?.endpoint_url || args?.endpoint,
      method: cfg.http_method || customConn?.http_method || args?.method,
      body: {
        query: queryValue,
        prompt: userPrompt,
        auth_token: cfg.auth_token || cfg.api_key || customConn?.auth_token,
        ...args
      },
      prompt: userPrompt
    });
  }

  if ((cfg.tool_type === 'code' || customConn?.category === 'Code Tool') && cfg.code_snippet) {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction('query', 'args', 'env', cfg.code_snippet);
    return await fn(queryValue, args, { BASE_URL: serverBaseUrl });
  }

  if (cfg.tool_type === 'ssh') {
    return await executeSshCommand(cfg.endpoint_url || queryValue || 'uptime');
  }

  const rawEndpoint =
    cfg.endpoint_url ||
    customConn?.endpoint_url ||
    (cleanKey === 'http_request_universal' ? args?.endpoint || args?.url || queryValue : '');

  if (rawEndpoint && String(rawEndpoint).startsWith('http')) {
    let targetUrl = resolveDynamicUrl(String(rawEndpoint), serverBaseUrl);
    targetUrl = interpolateApiTemplate(targetUrl, userPrompt, { query: queryValue, ...args });

    const method = String(
      cfg.http_method || customConn?.http_method || args?.method || 'GET'
    ).toUpperCase();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };

    const token =
      cfg.auth_token || cfg.api_key || cfg.access_token || customConn?.auth_token;
    if (token) {
      const cleanToken = String(token).replace(/^Bearer\s+/i, '').trim();
      headers['Authorization'] = `Bearer ${cleanToken}`;
    }

    if (cfg.tool_type === 'mcp' || customConn?.agent_type === 'mcp') {
      const mcpRes = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: { name: cleanKey, arguments: { query: queryValue, ...args } }
        }),
        signal: AbortSignal.timeout(15000)
      });
      return await mcpRes.json().catch(() => ({ status: mcpRes.status }));
    }

    const fetchInit: RequestInit = { method, headers, signal: AbortSignal.timeout(15000) };
    if (method !== 'GET' && method !== 'HEAD') {
      if (cfg.payload_template) {
        fetchInit.body = interpolateApiTemplate(String(cfg.payload_template), userPrompt, {
          query: queryValue,
          ...args
        });
      } else {
        fetchInit.body = JSON.stringify({ query: queryValue, ...args });
      }
    }

    const res = await fetch(targetUrl, fetchInit);
    return await res.json().catch(async () => ({ status: res.status, text: await res.text() }));
  }

  return await executeProtocolOrIntegration(cleanKey, {
    protocol: (cleanKey as SupportedProtocolOrPlatform) || 'rest_api',
    endpoint: args?.endpoint,
    method: args?.method || 'POST',
    body: { query: queryValue, ...args },
    prompt: userPrompt
  }).catch((err: any) => ({ error: err.message, tool: cleanKey }));
}

// ============================================================================
// 6. PIPELINE SEQUENCIAL DE ESPECIALISTAS (CODE, API, MCP E LLM)
// ============================================================================

export async function executeSpecialistPipeline(
  initialAgent: any,
  taskArgs: Record<string, any>,
  sessionId: string,
  identityToken: string,
  conversationThread: Array<{ role: string; content: string }>,
  serverBaseUrl: string,
  userPrompt = '',
  brainConfig?: any,
  connectorsMap?: Map<string, any>
) {
  let currentAgent = initialAgent;
  let currentPayload: any = { ...taskArgs, sessionId, identityToken };
  let hopCount = 0;
  const MAX_HOPS = 5;
  const executionChain: Array<{
    agentSlug: string;
    agentName: string;
    agentType?: string;
    responseInstruction?: string;
    output: any;
  }> = [];

  const nonLlmTypes = [
    'api',
    'mcp',
    'graphql',
    'amqp',
    'kafka',
    'imap',
    'ftp',
    'sftp',
    'whatsapp',
    'google_workspace',
    'outlook'
  ];

  const map = connectorsMap || new Map<string, any>();

  while (currentAgent && hopCount < MAX_HOPS) {
    hopCount++;

    try {
      emitBrainLinkEvent({
        axon_id: `axon_${currentAgent.slug}`,
        source_dendrite:
          hopCount === 1
            ? 'jarvis_core'
            : executionChain[executionChain.length - 1].agentSlug,
        target_dendrite: currentAgent.slug,
        direction: 'FORWARD',
        neurotransmitter_type: 'ADRENALINA',
        intensity: 0.95,
        metadata: { agentName: currentAgent.name, hop: hopCount }
      } as any);
    } catch {}

    let stepOutput: any = null;
    const agentType = (currentAgent.agent_type || 'llm').toLowerCase();
    const promptText =
      typeof currentPayload === 'string'
        ? currentPayload
        : currentPayload?.task_details || currentPayload?.query || userPrompt;

    if (
      agentType === 'code' &&
      (currentAgent.code_snippet || currentAgent.script_code)
    ) {
      const codeToRun = currentAgent.code_snippet || currentAgent.script_code;
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const fn = new AsyncFunction('payload', 'env', codeToRun);
      let activePort = 3333;
      try {
        activePort =
          typeof getEnvRegisteredPort === 'function' ? getEnvRegisteredPort() : 3333;
      } catch {
        activePort = 3333;
      }
      stepOutput = await fn(
        { ...currentPayload, query: promptText, userPrompt },
        {
          BASE_URL: serverBaseUrl,
          PORT: activePort
        }
      );
    } else if (
      nonLlmTypes.includes(agentType) ||
      (agentType === 'api' && currentAgent.endpoint_url)
    ) {
      const rawUrl = resolveDynamicUrl(currentAgent.endpoint_url || '', serverBaseUrl);
      const targetUrl = interpolateApiTemplate(rawUrl, userPrompt, currentPayload);
      const protocolToUse = (
        agentType === 'api' ? 'rest_api' : agentType
      ) as SupportedProtocolOrPlatform;

      let customBodyParams: Record<string, any> = {};
      const bodyTemplate = currentAgent.payload_template || currentAgent.code_snippet;
      if (bodyTemplate && String(bodyTemplate).trim().startsWith('{')) {
        try {
          const interpolatedJson = interpolateApiTemplate(
            String(bodyTemplate),
            userPrompt,
            currentPayload
          );
          customBodyParams = JSON.parse(interpolatedJson);
        } catch {
          customBodyParams = { raw_payload: bodyTemplate };
        }
      }

      const rawApiResult = await executeProtocolOrIntegration(currentAgent, {
        protocol: protocolToUse,
        endpoint: targetUrl,
        method: currentAgent.http_method || 'GET',
        body: {
          ...(currentAgent.protocol_config || {}),
          ...currentPayload,
          ...customBodyParams
        },
        prompt: userPrompt
      });

      const formattingInstruction = (
        currentAgent.response_instruction ||
        currentAgent.system_prompt ||
        ''
      ).trim();

      stepOutput = {
        extractionInstruction:
          formattingInstruction ||
          'Extraia os dados principais do JSON retornado e apresente ao usuário.',
        apiResponse: rawApiResult
      };
    } else {
      let enabledTools: string[] = [];
      if (Array.isArray(currentAgent.tools)) {
        enabledTools = currentAgent.tools;
      } else if (typeof currentAgent.tools === 'string') {
        try {
          enabledTools = JSON.parse(currentAgent.tools || '[]');
        } catch {
          enabledTools = [];
        }
      }

      const specialistTools: OpenAI.Chat.Completions.ChatCompletionTool[] =
        enabledTools.map((tId: string) => {
          const cleanId = sanitizeToolName(tId);
          const conn = map.get(cleanId);
          const desc =
            conn?.description ||
            conn?.config?.description ||
            `Executa a ferramenta ${conn?.name || cleanId}.`;

          return {
            type: 'function',
            function: {
              name: cleanId,
              description: desc,
              parameters: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'Consulta, ticker (ex: PETR4) ou comando principal.'
                  },
                  symbol: {
                    type: 'string',
                    description: 'Código do ativo/ticker da B3 (ex: PETR4, VALE3).'
                  },
                  action: {
                    type: 'string',
                    description:
                      'Ação a executar (ex: turn_on, turn_off, toggle, states no Home Assistant; read_inbox, send_email, trash_message no Gmail).'
                  },
                  entity_id: {
                    type: 'string',
                    description:
                      'ID da entidade no Home Assistant (ex: light.sala, switch.tomada, climate.ar_condicionado).'
                  },
                  to: {
                    type: 'string',
                    description: 'Destinatário (para envio de e-mail ou mensagem).'
                  },
                  subject: {
                    type: 'string',
                    description: 'Assunto do e-mail.'
                  },
                  body: {
                    type: 'string',
                    description: 'Conteúdo da mensagem ou e-mail.'
                  },
                  task_details: {
                    type: 'string',
                    description: 'Detalhes complementares da tarefa.'
                  }
                }
              }
            }
          };
        });

      const specialistMessages: any[] = [
        {
          role: 'system',
          content: `${
            currentAgent.system_prompt || `Você é o especialista ${currentAgent.name}.`
          }\nFerramentas habilitadas para você: ${
            enabledTools.length > 0 ? enabledTools.join(', ') : 'Nenhuma'
          }.`
        },
        ...conversationThread.slice(-6),
        {
          role: 'user',
          content: `Pedido do Usuário: "${userPrompt}"\nContexto e Parâmetros: ${JSON.stringify(
            currentPayload
          )}`
        }
      ];

      const llmRes: any = await callOpenAICompatibleLLM({
        provider: currentAgent.provider || brainConfig?.provider || 'groq',
        model: currentAgent.model || brainConfig?.model || 'llama-3.3-70b-versatile',
        apiKey: currentAgent.api_key || brainConfig?.api_key || '',
        baseUrl: currentAgent.base_url || brainConfig?.base_url || '',
        messages: specialistMessages,
        tools: specialistTools.length > 0 ? specialistTools : undefined,
        temperature: Number(currentAgent.temperature ?? 0.3)
      });

      const specChoice = llmRes?.choices?.[0]?.message;

      if (Array.isArray(specChoice?.tool_calls) && specChoice.tool_calls.length > 0) {
        const subToolResults: any[] = [];
        for (const subCall of specChoice.tool_calls) {
          const subFn = (subCall as any).function?.name;
          let subArgs: any = {};
          try {
            subArgs = JSON.parse((subCall as any).function?.arguments || '{}');
          } catch {
            subArgs = { query: promptText };
          }

          const toolOutput = await executeBoundTool(
            subFn,
            subArgs,
            promptText,
            map,
            serverBaseUrl
          );
          subToolResults.push({ tool: subFn, output: toolOutput });
        }

        const followUpRes: any = await callOpenAICompatibleLLM({
          provider: currentAgent.provider || brainConfig?.provider || 'groq',
          model: currentAgent.model || brainConfig?.model || 'llama-3.3-70b-versatile',
          apiKey: currentAgent.api_key || brainConfig?.api_key || '',
          baseUrl: currentAgent.base_url || brainConfig?.base_url || '',
          messages: [
            ...specialistMessages,
            {
              role: 'user',
              content: `Resultado das Tools executadas:\n${JSON.stringify(
                subToolResults
              )}\n\nElabore a resposta final objetiva e estruturada para o usuário.`
            }
          ]
        });

        stepOutput =
          followUpRes?.choices?.[0]?.message?.content || JSON.stringify(subToolResults);
      } else {
        stepOutput = specChoice?.content || 'Processado pelo especialista.';
      }
    }

    await pool
      .query(
        `CREATE TABLE IF NOT EXISTS specialist_context_memory (
          id SERIAL PRIMARY KEY,
          session_id VARCHAR(120) NOT NULL,
          specialist_slug VARCHAR(100) NOT NULL,
          context_data JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );`
      )
      .catch(() => {});

    await pool
      .query(
        `INSERT INTO specialist_context_memory (session_id, specialist_slug, context_data)
         VALUES ($1, $2, $3);`,
        [
          sessionId,
          currentAgent.slug,
          JSON.stringify({ lastInput: currentPayload, lastOutput: stepOutput })
        ]
      )
      .catch(() => {});

    executionChain.push({
      agentSlug: currentAgent.slug,
      agentName: currentAgent.name,
      agentType,
      responseInstruction: currentAgent.system_prompt || undefined,
      output: stepOutput
    });

    currentPayload = {
      previousAgent: currentAgent.slug,
      previousOutput: stepOutput,
      originalArgs: taskArgs
    };

    if (
      currentAgent.next_agent_slug &&
      currentAgent.next_agent_slug !== currentAgent.slug
    ) {
      const nextRes = await pool.query(
        `SELECT * FROM ai_agents WHERE slug = $1 AND is_active = true LIMIT 1;`,
        [currentAgent.next_agent_slug]
      );
      currentAgent = nextRes.rows[0] || null;
    } else {
      currentAgent = null;
    }
  }

  return executionChain;
}

export const executeSpecialistNode = executeSpecialistPipeline;
export const executeAgentChain = executeSpecialistPipeline;

// ============================================================================
// 7. FLUXO PRINCIPAL DO ORQUESTRADOR CENTRAL (JARVIS)
// ============================================================================

export async function processWorkflowExecution(
  identityToken: string,
  userPrompt: string,
  sessionId = `sess_${Date.now()}`,
  sensoryInput?: SensorPayload | SensoryAttachments | any
) {
  const startTime = Date.now();
  let brainConfig: any;

  try {
    await ensureOrchestratorSchema();
    brainConfig = await getCentralBrainConfig();
    const dynamicServerBaseUrl = brainConfig.server_base_url;

    emitNeuroPulse({
      source_dendrite: 'sensory_input',
      target_dendrite: 'jarvis_core',
      neurotransmitter: 'ACETILCOLINA',
      intensity: 0.9,
      metadata: { sessionId, identityToken }
    });

    const historyRes = await pool
      .query(
        `SELECT role, content FROM jarvis_chat_memory 
         WHERE session_id = $1 ORDER BY id ASC LIMIT 12;`,
        [sessionId]
      )
      .catch(() => ({ rows: [] as any[] }));

    const conversationThread = historyRes.rows.map((r: any) => ({
      role: r.role,
      content: r.content
    }));

    let ragContextText = '';
    try {
      const ragRows: any = await searchVectorDocuments(userPrompt, 3);
      const list = Array.isArray(ragRows) ? ragRows : ragRows?.matches || [];
      if (list.length > 0) {
        ragContextText = list
          .filter((m: any) => (m.similarity ?? 1) > 0.15)
          .map((m: any) => `- ${m.content}`)
          .join('\n');
      }
    } catch {
      ragContextText = '';
    }

    const agentsRes = await pool
      .query(`SELECT * FROM ai_agents WHERE is_active = true ORDER BY id ASC;`)
      .catch(() => ({ rows: [] as any[] }));
    const activeAgents = agentsRes.rows;

    const { catalog: liveToolsCatalog, connectorsMap } = await getDynamicToolsCatalog();
    const validToolSlugs = liveToolsCatalog.map((t) => t.slug);

    const liveToolsSummary =
      liveToolsCatalog.length > 0
        ? liveToolsCatalog
            .map(
              (t) =>
                `- slug: "${t.slug}" | Nome: "${t.name}" | Método: ${t.method}${
                  t.endpoint ? ` | Endpoint: ${t.endpoint}` : ''
                } | Uso: ${t.description}`
            )
            .join('\n')
        : 'Nenhuma tool cadastrada no momento.';

    const existingAgentsSummary =
      activeAgents.length > 0
        ? activeAgents
            .map(
              (a: any) =>
                `- Nome: "${a.name}" | Slug: "${sanitizeToolName(a.slug)}" | Modo: ${(
                  a.agent_type || 'llm'
                ).toUpperCase()} | Tools: ${JSON.stringify(a.tools || [])} | Gatilho: ${
                  a.description || ''
                }`
            )
            .join('\n')
        : 'Nenhum especialista cadastrado.';

    const tools: any[] = activeAgents.map((ag: any) => {
      const safeSlug = sanitizeToolName(ag.slug);
      return {
        type: 'function',
        function: {
          name: safeSlug,
          description:
            (ag.description && ag.description.trim()) ||
            `Aciona o especialista ${ag.name} (${ag.agent_type || 'especialista'}).`,
          parameters: {
            type: 'object',
            properties: {
              task_details: {
                type: 'string',
                description: 'A pergunta, comando ou dados que o especialista deve processar.'
              },
              symbol: {
                type: 'string',
                description:
                  'Ticker ou código da ação/ativo caso seja uma consulta financeira (ex: PETR4, WEGE3).'
              },
              query: {
                type: 'string',
                description: 'Parâmetro de pesquisa, cálculo ou filtro.'
              }
            },
            required: ['task_details']
          }
        }
      };
    });

    tools.push({
      type: 'function',
      function: {
        name: 'create_or_update_tool_connector',
        description:
          'Cria ou atualiza uma Tool / Conexão (API HTTP, Webhook, Servidor MCP, Script JS ou SSH) no catálogo dinâmico.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nome amigável da Tool (ex: API CoinGecko)' },
            provider_key: {
              type: 'string',
              description: 'ID único em snake_case (ex: coingecko_api)'
            },
            tool_type: {
              type: 'string',
              enum: ['http', 'mcp', 'code', 'ssh'],
              description: 'Tipo funcional da Tool'
            },
            http_method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
            endpoint_url: {
              type: 'string',
              description:
                'URL do Endpoint ou servidor MCP (aceita {{query}}, {{symbol}}, {{BASE_URL}})'
            },
            description: { type: 'string', description: 'Quando a IA deve usar esta Tool' },
            icon: { type: 'string', description: 'Emoji representativo (ex: 📈, 🔌, 🌐)' },
            auth_token: { type: 'string', description: 'Token Bearer ou API Key opcional' },
            payload_template: {
              type: 'string',
              description: 'Template JSON opcional para POST/PUT'
            },
            code_snippet: {
              type: 'string',
              description: 'Código JavaScript caso tool_type seja code'
            }
          },
          required: ['name']
        }
      }
    });

    tools.push({
      type: 'function',
      function: {
        name: 'delete_tool_connector',
        description:
          'Exclui permanentemente uma Tool / Conexão que o usuário não queira mais e a desvincula de todos os agentes.',
        parameters: {
          type: 'object',
          properties: {
            provider_key: {
              type: 'string',
              description: `Slug (provider_key) da conexão a excluir. Catálogo atual: [${validToolSlugs.join(
                ', '
              )}]`
            }
          },
          required: ['provider_key']
        }
      }
    });

    tools.push({
      type: 'function',
      function: {
        name: 'create_or_update_ai_agent',
        description:
          'Cria um novo Subagente Especialista ou EDITA um existente (usando o mesmo slug). REGRA DE ECONOMIA DE TOKENS: 1) Use agent_type="code" (ZERO tokens) para cálculos matemáticos, valuation Bazin, filtros e lógica determinística em JS. 2) Use agent_type="api" (ZERO tokens de subagente) para consultas HTTP REST/Webhook diretas. 3) Use agent_type="mcp" para servidores MCP. 4) Só use agent_type="llm" quando raciocínio subjetivo e múltiplas tools forem indispensáveis.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Nome do Agente Especialista (ex: Calculadora Bazin, Consultor B3)'
            },
            slug: {
              type: 'string',
              description:
                'Identificador único em snake_case (use o MESMO slug se quiser editar um agente existente do mesmo domínio)'
            },
            agent_type: {
              type: 'string',
              enum: ['code', 'api', 'mcp', 'llm'],
              description:
                'Modo de Operação: "code" (Script JS determinístico, 0 tokens), "api" (REST API/Webhook direto), "mcp" (Cliente Direto MCP) ou "llm" (Agente Cognitivo com LLM).'
            },
            description: {
              type: 'string',
              description:
                'Gatilho claro para Tool Calling (Quando o JARVIS deve acionar este Agente?)'
            },
            code_snippet: {
              type: 'string',
              description:
                'Obrigatório se agent_type="code". Código JS puro que recebe "payload" e "env" e executa return { ... };'
            },
            http_method: {
              type: 'string',
              enum: ['GET', 'POST', 'PUT', 'DELETE'],
              description: 'Método HTTP caso agent_type="api" (GET ou POST).'
            },
            endpoint_url: {
              type: 'string',
              description:
                'URL do Endpoint caso agent_type="api" ou "mcp" (aceita {{query}}, {{symbol}}, {{BASE_URL}}).'
            },
            auth_token: {
              type: 'string',
              description: 'Token Bearer ou API Key opcional para a requisição.'
            },
            payload_template: {
              type: 'string',
              description:
                'Template JSON para o Body caso agent_type="api" e método POST/PUT (ex: {"ticker": "{{symbol}}"}).'
            },
            system_prompt: {
              type: 'string',
              description:
                'Se agent_type="api" ou "mcp": instrução de quais campos extrair do JSON e como formatar a resposta. Se agent_type="llm": System Prompt completo com as ordens técnicas do especialista.'
            },
            append_behavior_rule: {
              type: 'string',
              description:
                'Opcional: Nova regra de comportamento para anexar ao system_prompt atual sem apagá-lo.'
            },
            icon: {
              type: 'string',
              description: 'Emoji do agente (ex: 💻, 🌐, 🔌, 🧠, 📈).'
            },
            tools: {
              type: 'array',
              items: { type: 'string' },
              description: `Slugs das conexões do catálogo dinâmico habilitadas para este agente. Catálogo disponível: [${validToolSlugs.join(
                ', '
              )}]. Selecione apenas as pertinentes ao domínio.`
            },
            replace_tools: {
              type: 'boolean',
              description:
                'True (padrão) para definir exatamente a lista de tools enviada; False para apenas adicionar às tools atuais.'
            },
            next_agent_slug: {
              type: 'string',
              description: 'Slug opcional do próximo agente para encadeamento Pipeline.'
            },
            cron_expression: {
              type: 'string',
              description: 'Expressão Cron opcional de agendamento (ex: "*/5 * * * *").'
            },
            execute_immediately: {
              type: 'boolean',
              description:
                'Se true, após criar ou editar o agente, já executa o pedido do usuário nele imediatamente.'
            }
          },
          required: ['name', 'slug', 'agent_type', 'description']
        }
      }
    });

    tools.push({
      type: 'function',
      function: {
        name: 'update_persona_and_behavior',
        description:
          'Acione SEMPRE que o usuário pedir para o JARVIS ou para qualquer Agente Especialista guardar/salvar um novo jeito de falar, estilo de resposta, personalidade ou regra permanente no system_prompt.',
        parameters: {
          type: 'object',
          properties: {
            target_slug: {
              type: 'string',
              description:
                'Use "jarvis_core" para atualizar o próprio JARVIS, ou informe o slug do agente especialista.'
            },
            behavior_instruction: {
              type: 'string',
              description:
                'A regra clara de como o agente ou o JARVIS deve falar, interagir ou estruturar respostas daqui em diante.'
            },
            replace_entire_prompt: {
              type: 'boolean',
              description:
                'False (padrão) para adicionar a nova regra preservando o prompt técnico atual; True apenas se pedir para substituir tudo.'
            }
          },
          required: ['target_slug', 'behavior_instruction']
        }
      }
    });

    tools.push({
      type: 'function',
      function: {
        name: 'hacker_sec_agent',
        description:
          'Aciona o Agente Hacker para auditar vulnerabilidades de Prompt Injection (red_team_audit), depurar falhas recentes nos logs (self_healing_debug) ou testar URLs em Sandbox (api_probe).',
        parameters: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['red_team_audit', 'self_healing_debug', 'api_probe'],
              description: 'Modo de operação do Agente Hacker'
            },
            target_slug: { type: 'string', description: 'Slug opcional do agente a auditar' },
            target_url: {
              type: 'string',
              description: 'URL opcional para testar no modo api_probe'
            }
          },
          required: ['mode']
        }
      }
    });

    tools.push({
      type: 'function',
      function: {
        name: 'save_to_database',
        description: 'Salva eventos, métricas ou documentos de forma autônoma no PostgreSQL.',
        parameters: {
          type: 'object',
          properties: {
            collectionName: { type: 'string' },
            documentData: { type: 'object' },
            decisionReasoning: { type: 'string' }
          },
          required: ['collectionName', 'documentData']
        }
      }
    });

    tools.push({
      type: 'function',
      function: {
        name: 'execute_external_integration',
        description:
          'Executa ações diretas em WhatsApp, Google Workspace, Outlook, REST API, MCP, GraphQL, AMQP, Kafka, IMAP e FTP/SFTP.',
        parameters: {
          type: 'object',
          properties: {
            provider: {
              type: 'string',
              enum: [
                'whatsapp',
                'google_workspace',
                'gmail',
                'google_sheets',
                'google_calendar',
                'google_drive',
                'outlook',
                'microsoft_365',
                'microsoft_teams',
                'rest_api',
                'mcp',
                'graphql',
                'amqp',
                'kafka',
                'imap',
                'ftp',
                'sftp'
              ]
            },
            action: { type: 'string' },
            endpoint: { type: 'string' },
            params: { type: 'object' }
          },
          required: ['provider']
        }
      }
    });

    tools.push({
      type: 'function',
      function: {
        name: 'execute_ssh_command',
        description: 'Executa comando remoto via SSH ou indexa arquivo remoto no RAG.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string' },
            remoteFilePath: { type: 'string' }
          }
        }
      }
    });

    const rawScreen =
      sensoryInput?.screenFrame ||
      sensoryInput?.sensorData?.screenFrame ||
      sensoryInput?.sensorData?.screenBase64 ||
      sensoryInput?.sensorData?.imagePayload?.dataBase64;
    const rawWebcam =
      sensoryInput?.webcamFrame ||
      sensoryInput?.sensorData?.webcamFrame ||
      sensoryInput?.sensorData?.faceFrameBase64;
    const frameToUse = rawScreen || rawWebcam;

    const isVisualQuestion =
      /est[aá]\s+me\s+vendo|t[aá]\s+me\s+vendo|consegue\s+me\s+ver|voc[eê]\s+me\s+v[eê]|ative\s+a\s+c[aâ]mera|olhe\s+para\s+mim|como\s+eu\s+estou|o\s+que\s+estou\s+segurando|olhe\s+minha\s+tela/i.test(
        userPrompt
      );

    if (isVisualQuestion && !frameToUse) {
      const noCamReply =
        'Ainda não estou recebendo o sinal de vídeo da sua câmera, senhor. Permita o acesso à câmera no navegador ou clique no ícone da câmera na barra inferior para que eu possa vê-lo.';
      return {
        success: true,
        agent: 'JARVIS (Córtex Visual)',
        agentId: 'jarvis_vision',
        identity: identityToken,
        sessionId,
        response: noCamReply,
        executionTimeMs: Date.now() - startTime
      };
    }

    let userMessageContent: any = userPrompt;
    let visionSystemInstruction = '';

    if (frameToUse) {
      const formattedUrl = frameToUse.startsWith('data:')
        ? frameToUse
        : `data:image/jpeg;base64,${frameToUse.replace(/^data:image\/\w+;base64,/, '')}`;

      const sourceLabel = rawWebcam ? 'WEBCAM (Rosto/Ambiente do Usuário)' : 'TELA DO COMPUTADOR';
      visionSystemInstruction = `\n\n[SINAL DE VÍDEO ATIVO - ${sourceLabel}]: Você está enxergando o usuário (${identityToken}) neste exato momento através da imagem anexada. Se ele perguntar se você o está vendo, confirme que a câmera está ativa e descreva de forma natural e direta o que você vê na imagem (a pessoa, expressão, objetos ou ambiente). NÃO acione ferramentas externas desnecessárias para responder sobre a imagem.`;

      userMessageContent = [
        {
          type: 'text',
          text: `${userPrompt}\n(Nota do Sistema: Analise a imagem real capturada pela ${sourceLabel} anexada nesta mensagem.)`
        },
        { type: 'image_url', image_url: { url: formattedUrl } }
      ];
    }

    const messages: any[] = [
      {
        role: 'system',
        content: `${brainConfig.system_prompt}
Identidade Autenticada: ${identityToken}
URL Base do Servidor: ${dynamicServerBaseUrl}${visionSystemInstruction}

--- AGENTES ESPECIALISTAS ATIVOS ---
${existingAgentsSummary}

--- CATÁLOGO DINÂMICO DE TOOLS / CONEXÕES DISPONÍVEIS ---
${liveToolsSummary}

--- DIRETRIZES DE ECONOMIA DE TOKENS E GOVERNANÇA DE SUBAGENTES ---
1. ESCOLHA DO MODO DE OPERAÇÃO (MENOR CUSTO DE TOKENS):
   - Prioridade 1 (agent_type="code" | ZERO tokens): Para cálculos matemáticos, Preço-Teto Bazin, indicadores financeiros, filtros e manipulação de JSON/datas. Escreva o código JS puro em 'code_snippet' recebendo 'payload' e 'env' e retornando o objeto calculado.
   - Prioridade 2 (agent_type="api" | ZERO tokens de subagente): Para buscar dados em endpoints REST HTTP ou Webhooks diretos. Configure 'endpoint_url' (usando {{symbol}}, {{query}} ou {{BASE_URL}}), 'http_method' e defina em 'system_prompt' quais campos extrair do JSON e como formatar.
   - Prioridade 3 (agent_type="mcp"): Para servidores Model Context Protocol.
   - Prioridade 4 (agent_type="llm"): Use SOMENTE quando a tarefa exigir interpretação subjetiva complexa e combinação de múltiplas tools do catálogo dinâmico.
2. SELEÇÃO CIRÚRGICA DE CONEXÕES:
   - Ao criar ou editar um agente, vincule no array 'tools' APENAS os slugs do [CATÁLOGO DINÂMICO DE TOOLS / CONEXÕES DISPONÍVEIS] estritamente necessários para aquele domínio. Se o usuário pedir para excluir uma conexão, acione 'delete_tool_connector'.
3. EVOLUÇÃO SEM DUPLICIDADE:
   - Se já existir um especialista do mesmo domínio na lista [AGENTES ESPECIALISTAS ATIVOS], edite-o chamando 'create_or_update_ai_agent' com o MESMO 'slug' e defina execute_immediately: true.
4. PERSONALIDADE E COMPORTAMENTO:
   - Sempre que o usuário pedir para guardar um novo jeito de falar ou regra permanente para você ou qualquer especialista, acione 'update_persona_and_behavior'.
${ragContextText ? `\n--- MEMÓRIA VETORIAL (RAG) ---\n${ragContextText}` : ''}`
      },
      ...conversationThread,
      { role: 'user', content: userMessageContent }
    ];

    let modelForCall = brainConfig.model;
    if (frameToUse && brainConfig.provider === 'groq') {
      modelForCall = 'llama-3.2-11b-vision-preview';
    }

    const firstPass: any = await callOpenAICompatibleLLM({
      provider: brainConfig.provider,
      model: modelForCall,
      apiKey: brainConfig.api_key,
      baseUrl: brainConfig.base_url,
      messages,
      tools: frameToUse && isVisualQuestion ? undefined : tools.length > 0 ? tools : undefined,
      temperature: brainConfig.temperature
    });

    const choice = firstPass?.choices?.[0]?.message;
    let finalResponseText = choice?.content || '';
    let triggeredAgentName = brainConfig.name || 'JARVIS';
    let triggeredAgentId: string | number | null = null;

    if (Array.isArray(choice?.tool_calls) && choice.tool_calls.length > 0) {
      const toolOutputsForSynthesis: Array<{
        toolName: string;
        responseInstruction?: string;
        result: any;
      }> = [];

      for (const toolCall of choice.tool_calls) {
        if (toolCall.type !== 'function') continue;

        const fnName = sanitizeToolName((toolCall as any).function?.name);
        const rawArgs = (toolCall as any).function?.arguments || '{}';
        let parsedArgs: Record<string, any> = {};
        try {
          parsedArgs = JSON.parse(rawArgs);
        } catch {
          parsedArgs = { task_details: rawArgs };
        }

        if (fnName === 'create_or_update_tool_connector') {
          const createdTool = await createOrUpdateToolFromBrain(parsedArgs as any);
          toolOutputsForSynthesis.push({
            toolName: 'create_or_update_tool_connector',
            result: createdTool
          });
          continue;
        }

        if (fnName === 'delete_tool_connector') {
          const deletedTool = await deleteToolConnectorFromBrain({
            provider_key: parsedArgs.provider_key
          });
          toolOutputsForSynthesis.push({
            toolName: 'delete_tool_connector',
            result: deletedTool
          });
          continue;
        }

        if (fnName === 'create_or_update_ai_agent') {
          const createdAg = await createOrUpdateAgentFromBrain(
            parsedArgs as any,
            brainConfig
          );
          triggeredAgentName = createdAg.agent?.name || triggeredAgentName;
          triggeredAgentId = createdAg.agent?.slug || null;

          let immediateChainResult: any = null;
          if (parsedArgs.execute_immediately !== false && createdAg.agent) {
            immediateChainResult = await executeSpecialistPipeline(
              createdAg.agent,
              parsedArgs,
              sessionId,
              identityToken,
              conversationThread,
              dynamicServerBaseUrl,
              userPrompt,
              brainConfig,
              connectorsMap
            );
          }

          toolOutputsForSynthesis.push({
            toolName: 'create_or_update_ai_agent',
            result: {
              ...createdAg,
              immediate_execution: immediateChainResult
            }
          });
          continue;
        }

        if (fnName === 'update_persona_and_behavior') {
          const personaUpdated = await updateAgentOrJarvisPersona({
            target_slug: parsedArgs.target_slug || 'jarvis_core',
            behavior_instruction: parsedArgs.behavior_instruction || userPrompt,
            replace_entire_prompt: Boolean(parsedArgs.replace_entire_prompt)
          });
          triggeredAgentName = personaUpdated.target || triggeredAgentName;
          triggeredAgentId = personaUpdated.slug || 'jarvis_core';
          toolOutputsForSynthesis.push({
            toolName: 'update_persona_and_behavior',
            result: personaUpdated
          });
          continue;
        }

        if (fnName === 'hacker_sec_agent') {
          triggeredAgentName = 'Agente Hacker (Red Team & Self-Healing)';
          triggeredAgentId = 'hacker_sec_agent';
          const hackerOut = await executeHackerSecuritySuite(parsedArgs as any);
          toolOutputsForSynthesis.push({
            toolName: 'hacker_sec_agent',
            result: hackerOut
          });
          continue;
        }

        if (fnName === 'save_to_database') {
          const dbRes = await saveToDatabase({
            collectionName: parsedArgs.collectionName || 'autonomous_logs',
            documentData: parsedArgs.documentData || parsedArgs,
            decisionReasoning: parsedArgs.decisionReasoning
          });
          toolOutputsForSynthesis.push({ toolName: 'save_to_database', result: dbRes });
          continue;
        }

        if (fnName === 'execute_external_integration') {
          triggeredAgentName = `Protocolo: ${(parsedArgs.provider || 'externo').toUpperCase()}`;
          const protoRes = await executeProtocolOrIntegration(parsedArgs.provider, {
            protocol: parsedArgs.provider as SupportedProtocolOrPlatform,
            endpoint: parsedArgs.endpoint,
            body: parsedArgs.params || parsedArgs
          });
          toolOutputsForSynthesis.push({
            toolName: 'execute_external_integration',
            result: protoRes
          });
          continue;
        }

        if (fnName === 'execute_ssh_command') {
          if (parsedArgs.remoteFilePath) {
            const sshRagRes = await readRemoteFileViaSshToRag({
              remoteFilePath: String(parsedArgs.remoteFilePath)
            });
            toolOutputsForSynthesis.push({
              toolName: 'readRemoteFileViaSshToRag',
              result: sshRagRes
            });
          } else {
            const sshRes = await executeSshCommand(parsedArgs.command || 'uptime');
            toolOutputsForSynthesis.push({
              toolName: 'execute_ssh_command',
              result: sshRes
            });
          }
          continue;
        }

        const matchedAgent = activeAgents.find(
          (a: any) => sanitizeToolName(a.slug) === fnName
        );
        if (matchedAgent) {
          triggeredAgentName = matchedAgent.name;
          triggeredAgentId = matchedAgent.slug || matchedAgent.id;

          const chainResults = await executeSpecialistPipeline(
            matchedAgent,
            parsedArgs,
            sessionId,
            identityToken,
            conversationThread,
            dynamicServerBaseUrl,
            userPrompt,
            brainConfig,
            connectorsMap
          );

          toolOutputsForSynthesis.push({
            toolName: matchedAgent.slug,
            responseInstruction: matchedAgent.system_prompt || undefined,
            result: chainResults
          });
          continue;
        }

        if (connectorsMap.has(fnName) || validToolSlugs.includes(fnName)) {
          const directToolOut = await executeBoundTool(
            fnName,
            parsedArgs,
            userPrompt,
            connectorsMap,
            dynamicServerBaseUrl
          );
          toolOutputsForSynthesis.push({
            toolName: fnName,
            result: directToolOut
          });
        }
      }

      const synthesisMessages = [
        ...messages,
        {
          role: 'user',
          content: `Os especialistas e ferramentas retornaram:\n${JSON.stringify(
            toolOutputsForSynthesis,
            null,
            2
          )}\n\nRespeite eventuais instruções em 'extractionInstruction' ou 'responseInstruction' e elabore a resposta final de forma clara, completa e direta ao usuário.`
        }
      ];

      const secondPass: any = await callOpenAICompatibleLLM({
        provider: brainConfig.provider,
        model: brainConfig.model,
        apiKey: brainConfig.api_key,
        baseUrl: brainConfig.base_url,
        messages: synthesisMessages,
        temperature: brainConfig.temperature
      });

      finalResponseText =
        secondPass?.choices?.[0]?.message?.content ||
        JSON.stringify(toolOutputsForSynthesis);
    }

      if (!triggeredSlug || triggeredSlug === 'jarvis_core') {
      const intercepted = await interceptAndExecuteTextActions({
        llmText: finalResponseText,
        userPrompt,
        sessionId,
        serverBaseUrl: centralConfig.server_base_url
      });

      if (intercepted && intercepted.intercepted) {
        finalResponseText = intercepted.finalText;
        agentTriggered = intercepted.agentName;
        triggeredSlug = intercepted.agentSlug;
        subWorkflowData = intercepted.executionData;
      }
    }

    appendShortTermMemory(sessionId, 'user', userPrompt);
    appendShortTermMemory(sessionId, 'assistant', finalResponseText);

    const executionTimeMs = Date.now() - startTime;

    await Promise.allSettled([
      pool.query(
        `INSERT INTO jarvis_chat_memory (session_id, role, content) 
         VALUES ($1, 'user', $2), ($1, 'assistant', $3);`,
        [sessionId, userPrompt, finalResponseText]
      ),
      pool.query(
        `INSERT INTO agent_audit_logs (session_id, agent_name, action_payload, response_payload, execution_time_ms)
         VALUES ($1, $2, $3, $4, $5);`,
        [
          sessionId,
          triggeredAgentName,
          JSON.stringify({ prompt: userPrompt, identityToken }),
          JSON.stringify({ response: finalResponseText }),
          executionTimeMs
        ]
      ),
      ingestDocumentToRag({
        content: `Pergunta (${identityToken}): ${userPrompt} | Resposta (${triggeredAgentName}): ${finalResponseText}`,
        metadata: { sessionId, agent: triggeredAgentName }
      } as any).catch(() => {})
    ]);

    emitBrainLinkEvent({
      axon_id: 'response_output',
      source_dendrite: 'jarvis_core',
      target_dendrite: 'hippocampus_rag',
      direction: 'BACKWARD',
      neurotransmitter_type: 'DOPAMINA',
      intensity: 1.0,
      metadata: {
        agent: triggeredAgentName,
        agentId: triggeredAgentId,
        memorySaved: true
      }
    } as any);

    return {
      success: true,
      agent: triggeredAgentName,
      agentId: triggeredAgentId,
      identity: identityToken,
      sessionId,
      response: finalResponseText,
      executionTimeMs
    };
  } catch (error: any) {
    console.error('❌ [Orquestrador Central] Erro na execução neural:', error?.message);

    try {
      await dispatchErrorTrigger({
        sourceNode: 'Orquestrador Central (JARVIS)',
        sourceSlug: 'jarvis_core',
        errorMessage: error?.message || 'Falha na execução do workflow neural',
        stackTrace: error?.stack,
        inputPayload: { prompt: userPrompt, identityToken, sessionId },
        severity: 'high'
      });
    } catch {}

    return {
      success: false,
      agent: 'Sistema Nervoso Central (Fallback Local)',
      agentId: null,
      identity: identityToken,
      sessionId,
      response: `Falha no processamento cognitivo: ${
        error?.message || 'Verifique as credenciais do provedor LLM no painel.'
      }`,
      executionTimeMs: Date.now() - startTime
    };
  }
}

// ============================================================================
// 8. ADAPTADORES DE ENTRADA E RETROCOMPATIBILIDADE COM CONTROLLERS
// ============================================================================

export async function processOrchestratorWorkflow(
  arg1?: any,
  arg2?: any,
  arg3?: string,
  arg4?: any
) {
  if (typeof arg1 === 'string') {
    const token = arg1 || 'Admin-Node';
    const prompt =
      typeof arg2 === 'string'
        ? arg2
        : arg2?.textPrompt ||
          arg2?.prompt ||
          arg2?.text ||
          arg2?.command ||
          'Verificar status operacional';
    const sid = arg3 || arg2?.sessionId || `sess_${Date.now()}`;
    const sensory = arg4 || (typeof arg2 === 'object' ? arg2 : undefined);
    return processWorkflowExecution(token, prompt, sid, sensory);
  }

  const params = arg1 || {};
  const token = params?.identityToken || params?.sensorData?.faceBadge || 'Admin-Node';
  const prompt =
    params?.prompt ||
    params?.textPrompt ||
    params?.sensorData?.textPrompt ||
    params?.sensorData?.prompt ||
    params?.sensorData?.text ||
    params?.sensorData?.command ||
    (typeof params?.sensorData === 'string'
      ? params.sensorData
      : 'Verificar status operacional');
  const sid = params?.sessionId || params?.sensorData?.sessionId || `sess_${Date.now()}`;
  return processWorkflowExecution(token, prompt, sid, params?.sensorData);
}

export const processOrchestratorStimulus = async (
  identityToken: string,
  sensorData: any
) => {
  return processOrchestratorWorkflow({ identityToken, sensorData });
};