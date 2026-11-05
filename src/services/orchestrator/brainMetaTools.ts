// Auto-criação/edição/exclusão de Agentes, Tools e Persona

// src/services/orchestrator/brainMetaTools.ts
import { pool } from '../../config/database.js';
import {
  ensureOrchestratorSchema,
  getCentralBrainConfig,
  sanitizeToolName
} from './brainConfigAndUtils.js';

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
    if (
      (slug.includes(nativeKey) || name.toLowerCase().includes(nativeKey.replace('_', ' '))) &&
      !toolsList.includes(nativeKey)
    ) {
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
  } else if (finalEndpointUrl && agentType === 'llm' && toolsList.length === 0) {
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