// src/services/orchestratorService.ts
import { pool } from '../config/database.js';
import OpenAI from 'openai';
import { searchVectorDocuments, ingestDocumentToRag } from './ragService.js';
import { emitBrainLinkEvent, emitNeuroPulse } from './brainSocketService.js';
import { KNOWN_ENDPOINTS, getEnvRegisteredPort } from '../controllers/brainConfigController.js';
import { executeProtocolOrIntegration } from './integrationAndProtocolService.js';
import { executeSshCommand, readRemoteFileViaSshToRag } from './sshService.js';
import { dispatchErrorTrigger } from './errorTriggerService.js';
import { appendShortTermMemory } from './shortTermMemoryService.js';

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

const DEFAULT_KNOWN_ENDPOINTS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  ollama: 'http://localhost:11434/v1',
  openrouter: 'https://openrouter.ai/api/v1'
};

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
  const symbolMatch = (taskArgs?.symbol || userPrompt || '')
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
      ? 'openai/gpt-oss-120b'
      : 'gpt-4o-mini';

  if (p === 'groq' && (model.includes('gemini') || model.startsWith('gpt-4'))) {
    model = 'openai/gpt-oss-120b';
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
            'Você é o JARVIS, o Cérebro Central e Agente Líder do ecossistema. Analise os estímulos, consulte a memória, crie ou evolua Agentes/Tools quando solicitado e acione os Agentes Especialistas.'
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
 * Meta-Tool 1: Permite que o próprio n8n (JARVIS) crie ou atualize uma Tool / Conector no banco
 */
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
  const key = sanitizeToolName(params.provider_key || params.name || `tool_${Date.now()}`);
  const name = (params.name || key).trim();
  const toolType = (params.tool_type || 'http').toLowerCase();
  const icon =
    params.icon || (toolType === 'mcp' ? '🔌' : toolType === 'code' ? '💻' : toolType === 'ssh' ? '🖥️' : '🌐');
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
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
     ON CONFLICT (provider_key) DO UPDATE SET
       name = EXCLUDED.name,
       icon = EXCLUDED.icon,
       description = EXCLUDED.description,
       config = EXCLUDED.config,
       is_enabled = TRUE,
       updated_at = NOW();`,
    [key, name, 'Custom Tool', icon, description, JSON.stringify(configObj)]
  );

  return {
    success: true,
    tool_id: key,
    name,
    tool_type: toolType,
    endpoint_url: configObj.endpoint_url,
    message: `Tool "${name}" (${key}) criada e habilitada no catálogo do n8n.`
  };
}

/**
 * Meta-Tool 2: Permite que o próprio n8n (JARVIS) crie ou atualize um Agente de IA completo,
 * preservando ou evoluindo o system_prompt existente e vinculando Tools
 */
export async function createOrUpdateAgentFromBrain(
  params: {
    name: string;
    slug?: string;
    agent_type?: 'llm' | 'api' | 'mcp' | 'code' | string;
    description?: string;
    system_prompt?: string;
    append_behavior_rule?: string;
    provider?: string;
    model?: string;
    icon?: string;
    tools?: string[];
    endpoint_url?: string;
    http_method?: string;
    code_snippet?: string;
    next_agent_slug?: string;
  },
  brainConfig?: any
) {
  const slug = sanitizeToolName(params.slug || params.name || `agent_${Date.now()}`);
  const name = (params.name || slug).trim();
  const agentType = (params.agent_type || 'llm').toLowerCase();
  const provider = (params.provider || brainConfig?.provider || 'groq').toLowerCase();
  const model = params.model || brainConfig?.model || 'openai/gpt-oss-120b';
  const icon = params.icon || '🤖';

  // Verifica se o agente já existe no banco para não perder instruções ou tools anteriores
  const existingRes = await pool
    .query('SELECT * FROM ai_agents WHERE slug = $1 LIMIT 1;', [slug])
    .catch(() => ({ rows: [] }));
  const existingAgent = existingRes.rows[0] || null;
  const previousPrompt = (existingAgent?.system_prompt || '').trim();

  const description =
    params.description ||
    existingAgent?.description ||
    `Especialista ${name} responsável por tarefas de ${name}.`;

  // Evolução inteligente do systemPrompt
  let systemPrompt = '';
  if (params.append_behavior_rule && previousPrompt) {
    systemPrompt = `${previousPrompt}\n\n[DIRETRIZ PERMANENTE DE COMPORTAMENTO E INTERAÇÃO]:\n- ${params.append_behavior_rule.trim()}`;
  } else if (params.system_prompt && params.system_prompt.trim() !== '') {
    systemPrompt = params.system_prompt.trim();
  } else if (previousPrompt) {
    systemPrompt = previousPrompt;
  } else {
    systemPrompt = `Você é o agente especialista ${name}. Execute as tarefas solicitadas com precisão técnica.`;
  }

  const previousTools: string[] = Array.isArray(existingAgent?.tools)
    ? existingAgent.tools
    : [];
  const incomingTools: string[] = Array.isArray(params.tools)
    ? params.tools.map((t) => sanitizeToolName(t))
    : [];
  const toolsList = Array.from(new Set([...previousTools, ...incomingTools]));

  const res = await pool.query(
    `INSERT INTO ai_agents (
       name, slug, agent_type, description, system_prompt,
       provider, model, icon, tools, endpoint_url, http_method,
       code_snippet, next_agent_slug, is_active, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, TRUE, NOW())
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       agent_type = EXCLUDED.agent_type,
       description = EXCLUDED.description,
       system_prompt = EXCLUDED.system_prompt,
       provider = EXCLUDED.provider,
       model = EXCLUDED.model,
       icon = EXCLUDED.icon,
       tools = EXCLUDED.tools,
       endpoint_url = COALESCE(EXCLUDED.endpoint_url, ai_agents.endpoint_url),
       http_method = COALESCE(EXCLUDED.http_method, ai_agents.http_method),
       code_snippet = COALESCE(EXCLUDED.code_snippet, ai_agents.code_snippet),
       next_agent_slug = COALESCE(EXCLUDED.next_agent_slug, ai_agents.next_agent_slug),
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
      icon,
      JSON.stringify(toolsList),
      params.endpoint_url || null,
      params.http_method || 'POST',
      params.code_snippet || null,
      params.next_agent_slug || null
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
    message: `Agente "${name}" (slug: ${slug}) criado/atualizado com sucesso com ${toolsList.length} tool(s) vinculada(s).`
  };
}

/**
 * Meta-Tool 3: Atualiza permanentemente o jeito de falar, interagir ou agir do próprio JARVIS ou de qualquer Especialista
 */
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

  // Caso 1: Atualizar o próprio JARVIS na tabela system_configs
  if (
    cleanTarget === 'jarvis' ||
    cleanTarget === 'jarvis_core' ||
    cleanTarget === 'core' ||
    cleanTarget === 'orquestrador'
  ) {
    const currentRes = await pool
      .query("SELECT value FROM system_configs WHERE key = 'brain_llm_config' LIMIT 1;")
      .catch(() => ({ rows: [] }));
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

  // Caso 2: Atualizar um Agente Especialista na tabela ai_agents
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

/**
 * Meta-Tool 4: Agente Hacker Integrado (Red Team Audit, Self-Healing Debug e Sandbox Probe)
 */
export async function executeHackerSecuritySuite(params: {
  mode?: 'red_team_audit' | 'self_healing_debug' | 'api_probe';
  target_slug?: string;
  target_url?: string;
}) {
  const mode = params.mode || 'self_healing_debug';

  if (mode === 'red_team_audit') {
    const agentsRes = await pool
      .query('SELECT name, slug, agent_type, system_prompt FROM ai_agents WHERE is_active = true;')
      .catch(() => ({ rows: [] }));

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
    .catch(() => ({ rows: [] }));

  return {
    success: true,
    mode: 'SELF_HEALING_DEBUG',
    recent_audit_logs: logsRes.rows
  };
}

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
            'openai/gpt-oss-120b',
            'openai/gpt-oss-20b',
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

/**
 * Executa uma Tool individual (Salva em external_connectors, DynamicDB, RAG, SSH, Code ou Integração Nativa)
 */
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

  if (cleanKey === 'vector_rag' || cleanKey === 'rag_search') {
    const docs = await searchVectorDocuments(queryValue, 4).catch(() => []);
    return { matches: docs };
  }

  if (cleanKey === 'execute_ssh_command' || cleanKey === 'ssh_terminal') {
    if (args?.remoteFilePath) {
      return await readRemoteFileViaSshToRag({ remoteFilePath: String(args.remoteFilePath) });
    }
    return await executeSshCommand(args?.command || queryValue || 'uptime');
  }

  const customConn = connectorsMap.get(cleanKey);
  const cfg = customConn?.config || {};

  if ((cfg.tool_type === 'code' || customConn?.category === 'Code Tool') && cfg.code_snippet) {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction('query', 'args', 'env', cfg.code_snippet);
    return await fn(queryValue, args, { BASE_URL: serverBaseUrl });
  }

  if (cfg.tool_type === 'ssh') {
    return await executeSshCommand(cfg.endpoint_url || queryValue || 'uptime');
  }

  if (cfg.endpoint_url || customConn?.endpoint_url) {
    const rawEndpoint = cfg.endpoint_url || customConn.endpoint_url;
    let targetUrl = resolveDynamicUrl(rawEndpoint, serverBaseUrl);
    targetUrl = interpolateApiTemplate(targetUrl, userPrompt, { query: queryValue, ...args });

    const method = String(cfg.http_method || customConn.http_method || 'GET').toUpperCase();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    const token = cfg.auth_token || cfg.access_token || cfg.api_key || customConn.auth_token;
    if (token) {
      const cleanToken = String(token).trim();
      headers['Authorization'] = cleanToken.startsWith('Bearer ')
        ? cleanToken
        : `Bearer ${cleanToken}`;
    }

    if (cfg.tool_type === 'mcp' || customConn.agent_type === 'mcp') {
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

/**
 * Pipeline Sequencial de Especialistas com Suporte a Sub-Tools, APIs e Encadeamento (next_agent_slug)
 */
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
      nonLlmTypes.includes(agentType) ||
      (agentType === 'api' && currentAgent.endpoint_url)
    ) {
      const rawUrl = resolveDynamicUrl(currentAgent.endpoint_url, serverBaseUrl);
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
        body: { ...(currentAgent.protocol_config || {}), ...currentPayload, ...customBodyParams },
        prompt: userPrompt
      });

      const formattingInstruction = (
        currentAgent.response_instruction ||
        currentAgent.system_prompt ||
        ''
      ).trim();
      if (formattingInstruction && brainConfig) {
        try {
          const formatRes = await callOpenAICompatibleLLM({
            provider: brainConfig.provider,
            model: brainConfig.model,
            apiKey: brainConfig.api_key,
            baseUrl: brainConfig.base_url,
            messages: [
              { role: 'system', content: formattingInstruction },
              {
                role: 'user',
                content: `Pergunta do usuário: "${promptText}"\nDados retornados da API:\n${JSON.stringify(
                  rawApiResult
                )}`
              }
            ]
          });
          stepOutput = formatRes?.choices?.[0]?.message?.content || rawApiResult;
        } catch {
          stepOutput = rawApiResult;
        }
      } else {
        stepOutput = rawApiResult;
      }
    } else if (
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
      stepOutput = await fn(currentPayload, {
        BASE_URL: serverBaseUrl,
        PORT: activePort
      });
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
                    description: 'Parâmetro, ticker, comando ou texto para a ferramenta.'
                  },
                  task_details: {
                    type: 'string',
                    description: 'Instrução para processamento.'
                  }
                },
                required: ['query']
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
        model: currentAgent.model || brainConfig?.model || 'openai/gpt-oss-120b',
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
          model: currentAgent.model || brainConfig?.model || 'openai/gpt-oss-120b',
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

export async function processWorkflowExecution(
  identityToken: string,
  userPrompt: string,
  sessionId = `sess_${Date.now()}`,
  sensoryInput?: SensorPayload | SensoryAttachments | any
) {
  const startTime = Date.now();
  let brainConfig: any;

  try {
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
      .catch(() => ({ rows: [] }));

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
      .catch(() => ({ rows: [] }));
    const activeAgents = agentsRes.rows;

    await pool
      .query(`
        CREATE TABLE IF NOT EXISTS external_connectors (
          provider_key VARCHAR(80) PRIMARY KEY,
          name VARCHAR(120) NOT NULL,
          category VARCHAR(60) DEFAULT 'Custom Tool',
          icon VARCHAR(20) DEFAULT '🔌',
          description TEXT DEFAULT '',
          is_enabled BOOLEAN DEFAULT TRUE,
          config JSONB DEFAULT '{}'::jsonb,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `)
      .catch(() => {});

    const connectorsRes = await pool
      .query(`SELECT * FROM external_connectors;`)
      .catch(() => ({ rows: [] }));
    const connectorsMap = new Map<string, any>();
    for (const row of connectorsRes.rows) {
      connectorsMap.set(sanitizeToolName(row.provider_key), row);
    }

    // Resumo dos Agentes e Conectores existentes para o JARVIS saber quando editar vs criar
    const existingAgentsSummary =
      activeAgents.length > 0
        ? activeAgents
            .map(
              (a: any) =>
                `- Nome: "${a.name}" | Slug: "${sanitizeToolName(a.slug)}" | Tools: ${JSON.stringify(
                  a.tools || []
                )} | Escopo: ${a.description || ''}`
            )
            .join('\n')
        : 'Nenhum especialista cadastrado.';

    // Monta as Tools para o Orquestrador Central (Especialistas + Meta-Tools de Auto-Criação e Persona)
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
                description: 'Ticker ou código da ação/ativo caso seja uma consulta financeira (ex: PETR4, WEGE3).'
              },
              query: {
                type: 'string',
                description: 'Parâmetro de pesquisa ou filtro.'
              }
            },
            required: ['task_details']
          }
        }
      };
    });

    // Meta-Tool 1: Criar ou atualizar uma Tool funcional pelo próprio JARVIS
    tools.push({
      type: 'function',
      function: {
        name: 'create_or_update_tool_connector',
        description:
          'Cria ou atualiza uma Tool / Conector (API HTTP, Webhook, Servidor MCP, Script JS ou SSH) no catálogo do n8n.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nome amigável da Tool (ex: API CoinGecko)' },
            provider_key: { type: 'string', description: 'ID único em snake_case (ex: coingecko_api)' },
            tool_type: {
              type: 'string',
              enum: ['http', 'mcp', 'code', 'ssh'],
              description: 'Tipo funcional da Tool'
            },
            http_method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
            endpoint_url: {
              type: 'string',
              description: 'URL do Endpoint ou servidor MCP (aceita {{query}}, {{symbol}}, {{BASE_URL}})'
            },
            description: { type: 'string', description: 'Quando a IA deve usar esta Tool' },
            icon: { type: 'string', description: 'Emoji representativo (ex: 📈, 🔌, 🌐)' },
            payload_template: { type: 'string', description: 'Template JSON opcional para POST/PUT' },
            code_snippet: { type: 'string', description: 'Código JavaScript caso tool_type seja code' }
          },
          required: ['name']
        }
      }
    });

    // Meta-Tool 2: Criar ou atualizar um Agente de IA pelo próprio JARVIS
    tools.push({
      type: 'function',
      function: {
        name: 'create_or_update_ai_agent',
        description:
          'Cria um novo Agente de IA ou EDITA/ATUALIZA um agente existente (usando o mesmo slug) e vincula Tools a ele automaticamente.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nome do Agente (ex: Analista de Cripto)' },
            slug: { type: 'string', description: 'Identificador único em snake_case (use o mesmo slug se quiser editar um agente atual)' },
            agent_type: { type: 'string', enum: ['llm', 'api', 'mcp', 'code'] },
            description: {
              type: 'string',
              description: 'Descrição clara de quando o Orquestrador deve acionar este agente'
            },
            system_prompt: {
              type: 'string',
              description: 'Instruções completas de comportamento e regras do especialista'
            },
            append_behavior_rule: {
              type: 'string',
              description: 'Opcional: Nova regra de fala/comportamento para adicionar ao system_prompt atual sem apagá-lo'
            },
            icon: { type: 'string', description: 'Emoji do agente (ex: 🤖, 📈, 🛡️)' },
            tools: {
              type: 'array',
              items: { type: 'string' },
              description: 'Lista de IDs das Tools conectadas a este agente (ex: ["brapi", "save_to_database"])'
            },
            endpoint_url: { type: 'string', description: 'URL caso seja um agente do tipo api ou mcp' },
            next_agent_slug: { type: 'string', description: 'Slug do próximo agente se houver pipeline' },
            execute_immediately: {
              type: 'boolean',
              description: 'Se true, após criar ou editar o agente, já executa o pedido do usuário nele imediatamente!'
            }
          },
          required: ['name', 'description']
        }
      }
    });

    // Meta-Tool 3: Guardar permanentemente o jeito de falar, agir ou interagir (no JARVIS ou em qualquer Especialista)
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
                'Use "jarvis_core" para atualizar o próprio JARVIS, ou informe o slug do agente especialista (ex: "finance_agent").'
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

    // Meta-Tool 4: Suíte do Agente Hacker (Red Team Audit, Self-Healing Debug e API Probe)
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
            target_url: { type: 'string', description: 'URL opcional para testar no modo api_probe' }
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

    let userMessageContent: any = userPrompt;
    if (frameToUse) {
      const formattedUrl = frameToUse.startsWith('data:')
        ? frameToUse
        : `data:image/jpeg;base64,${frameToUse.replace(/^data:image\/\w+;base64,/, '')}`;

      userMessageContent = [
        { type: 'text', text: userPrompt },
        { type: 'image_url', image_url: { url: formattedUrl } }
      ];
    }

    const messages: any[] = [
      {
        role: 'system',
        content: `${brainConfig.system_prompt}
Identidade Autenticada: ${identityToken}
URL Base do Servidor: ${dynamicServerBaseUrl}

--- AGENTES ESPECIALISTAS ATIVOS ---
${existingAgentsSummary}

--- REGRAS DE AUTO-EVOLUÇÃO E PERSONALIDADE ---
1. Quando o usuário pedir para você ou qualquer agente guardar/lembrar um novo jeito de falar, interagir ou formatar respostas, acione 'update_persona_and_behavior' para gravar isso no system_prompt permanentemente.
2. Quando o usuário pedir um relatório de uma ação/ativo e já existir um agente do mesmo domínio (ex: Finanças), acione a tool desse agente passando o ticker. Se faltar alguma instrução ou tool nesse agente existente, edite-o chamando 'create_or_update_ai_agent' com o MESMO slug e execute_immediately: true. Só crie um novo slug se for um domínio totalmente inexistente.
${ragContextText ? `\n--- MEMÓRIA VETORIAL (RAG) ---\n${ragContextText}` : ''}`
      },
      ...conversationThread,
      { role: 'user', content: userMessageContent }
    ];

    const firstPass: any = await callOpenAICompatibleLLM({
      provider: brainConfig.provider,
      model: brainConfig.model,
      apiKey: brainConfig.api_key,
      baseUrl: brainConfig.base_url,
      messages,
      tools: tools.length > 0 ? tools : undefined,
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

        if (fnName === 'create_or_update_ai_agent') {
          const createdAg = await createOrUpdateAgentFromBrain(parsedArgs as any, brainConfig);
          triggeredAgentName = createdAg.agent?.name || triggeredAgentName;
          triggeredAgentId = createdAg.agent?.slug || null;

          // Se execute_immediately for true (ou se o usuário pediu um relatório junto), já executa o agente atualizado!
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
          )}\n\nElabore a resposta final de forma clara, completa e direta ao usuário.`
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
      ingestDocumentToRag(
        `Pergunta (${identityToken}): ${userPrompt} | Resposta (${triggeredAgentName}): ${finalResponseText}`,
        { sessionId, agent: triggeredAgentName }
      )
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

export async function processOrchestratorWorkflow(params: {
  identityToken?: string;
  sensorData?: any;
  sessionId?: string;
}) {
  const token = params?.identityToken || params?.sensorData?.faceBadge || 'Admin-Node';
  const prompt =
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