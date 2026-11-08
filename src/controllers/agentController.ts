// src/controllers/agentController.ts
import { Request, Response } from 'express';
import { pool } from '../config/database.js';
import { emitBrainLinkEvent } from '../services/brainSocketService.js';
import {
  listAvailableCredentialsMetadata,
  resolveSecretByCredentialId
} from '../services/credentialMapperService.js';
import {
  createWorkflowWaitState,
  listWaitStates,
  markWaitStateDecision
} from '../services/waitApprovalService.js';
import {
  getCentralBrainConfig,
  resolveProviderCredentials,
  resolveDynamicUrl,
  interpolateApiTemplate
} from '../services/orchestratorService.js';
import { executeMcpToolCall } from '../services/mcpHfService.js';

import { runHackerAgent, HackerTaskInput } from '../services/agents/hackerAgent.js';
import { callOpenAICompatibleLLM } from '../services/orchestrator/brainConfigAndUtils.js';

export async function runHackerAuditController(req: any, res: any) {
  try {
    const input: HackerTaskInput = req.body || { mode: 'self_healing_debug' };

    // Helper cognitivo para a LLM gerar diagnósticos e patches
    const llmHelper = async (sys: string, usr: string) => {
      const response = await callOpenAICompatibleLLM({
        systemPrompt: sys,
        userPrompt: usr,
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1
      });
      return response.text;
    };

    const resultado = await runHackerAgent(input, llmHelper);
    return res.status(200).json({ success: true, data: resultado });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Remove resíduos de máscara ('•' e '*') e espaços invisíveis
 */
function sanitizeApiKey(rawKey?: any): string {
  if (!rawKey) return '';
  let k = String(rawKey)
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^["']+|["']+$/g, '')
    .replace(/[•*]/g, '')
    .trim();

  if (!k || k === 'undefined' || k === 'null' || k.length < 5) {
    return '';
  }

  if (/^gsk_/i.test(k)) k = 'gsk_' + k.slice(4);
  else if (/^aiza/i.test(k)) k = 'AIza' + k.slice(4);
  else if (/^sk-or-/i.test(k)) k = 'sk-or-' + k.slice(6);

  return k;
}

function buildAgentWebhookUrls(req: Request, slug: string) {
  const protocol = req.protocol || 'http';
  const host = req.get('host') || `localhost:${process.env.PORT || 3333}`;
  const baseUrl = process.env.SERVER_BASE_URL || `${protocol}://${host}`;

  return {
    webhook_prod_url: `${baseUrl}/api/v1/webhook/agents/${slug}`,
    webhook_test_url: `${baseUrl}/api/v1/webhook-test/agents/${slug}`,
    webhook_url: `${baseUrl}/api/v1/webhook/agents/${slug}`
  };
}

function safeEmitBrainEvent(payload: any) {
  try {
    if (typeof emitBrainLinkEvent === 'function') {
      emitBrainLinkEvent({
        axon_id: `axon_${payload.targetNode || 'agent'}`,
        source_dendrite: payload.sourceNode || 'webhook_ingress',
        target_dendrite: payload.targetNode || 'jarvis_core',
        direction: 'FORWARD',
        neurotransmitter_type: payload.neurotransmitter || 'DOPAMINA',
        intensity: payload.intensity ?? 0.9,
        metadata: payload.metadata || {}
      } as any);
    }
  } catch {}
}

export async function executeSingleAgentLogic(
  agent: any,
  inputPayload: any,
  environment: 'test' | 'production'
) {
  const startTime = Date.now();
  let outputResult: any = null;

  const brainConfig: any = await getCentralBrainConfig();
  const serializedInput =
    typeof inputPayload === 'string' ? inputPayload : JSON.stringify(inputPayload, null, 2);
  const userPromptText =
    typeof inputPayload === 'string'
      ? inputPayload
      : inputPayload?.prompt || inputPayload?.textPrompt || inputPayload?.query || serializedInput;

  const codeToRun = agent.code_snippet || agent.script_code;

  if (agent.agent_type === 'code' && codeToRun) {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const runner = new AsyncFunction('payload', 'env', codeToRun);
    outputResult = await runner(inputPayload, environment);
  } else if (agent.agent_type === 'mcp' && agent.endpoint_url) {
    const resolvedUrl = resolveDynamicUrl(agent.endpoint_url, brainConfig.server_base_url);
    outputResult = await executeMcpToolCall({
      serverUrl: resolvedUrl,
      toolName: agent.script_handler || agent.slug,
      params: typeof inputPayload === 'object' ? inputPayload : { query: userPromptText }
    });
  } else if (agent.agent_type === 'api' && agent.endpoint_url) {
    const method = (agent.http_method || 'POST').toUpperCase();
    const resolvedUrl = resolveDynamicUrl(
      interpolateApiTemplate(
        agent.endpoint_url,
        userPromptText,
        typeof inputPayload === 'object' ? inputPayload : {}
      ),
      brainConfig.server_base_url
    );

    const customHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(typeof agent.headers_json === 'object' ? agent.headers_json : {})
    };
    const token = sanitizeApiKey(agent.auth_token || agent.api_key);
    if (token) {
      customHeaders['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }

    const fetchOptions: RequestInit = {
      method,
      headers: customHeaders
    };

    if (method !== 'GET' && method !== 'HEAD') {
      if (agent.payload_template && String(agent.payload_template).trim()) {
        fetchOptions.body = interpolateApiTemplate(
          agent.payload_template,
          userPromptText,
          typeof inputPayload === 'object' ? inputPayload : {}
        );
      } else {
        fetchOptions.body = JSON.stringify(inputPayload);
      }
    }

    const resp = await fetch(resolvedUrl, fetchOptions);
    const textData = await resp.text();
    try {
      outputResult = JSON.parse(textData);
    } catch {
      outputResult = { status: resp.status, raw: textData };
    }
  } else {
    // 🧠 ROTA COGNITIVA (LLM): Resolução Limpa de Credenciais e Cofre Central
    const targetProvider = (agent.provider || brainConfig.provider || 'groq').toLowerCase().trim();
    const cleanAgentKey = sanitizeApiKey(agent.api_key);

    // Busca chave no cofre salvo do Cérebro para o provedor deste agente
    const vaultKey =
      brainConfig.saved_keys && brainConfig.saved_keys[targetProvider]
        ? sanitizeApiKey(brainConfig.saved_keys[targetProvider])
        : '';

    // Se o agente tiver chave própria válida e limpa, utiliza.
    // Caso contrário, herda do cofre específico do provedor ou da chave mestre do Cérebro.
    const effectiveKey =
      cleanAgentKey ||
      vaultKey ||
      (targetProvider === (brainConfig.provider || '').toLowerCase() ? sanitizeApiKey(brainConfig.api_key) : '') ||
      '';

    const creds = resolveProviderCredentials(
      targetProvider,
      effectiveKey,
      agent.base_url || brainConfig.base_url,
      agent.model || brainConfig.model
    );

    const targetUrl = `${creds.baseURL.replace(/\/+$/, '')}/chat/completions`;

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (creds.apiKey && targetProvider !== 'ollama') {
      requestHeaders['Authorization'] = `Bearer ${creds.apiKey}`;
    }

    if (targetProvider === 'openrouter') {
      requestHeaders['HTTP-Referer'] = 'https://jarvis.local';
      requestHeaders['X-Title'] = 'JARVIS Neural Core';
    }

    const llmRes = await fetch(targetUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({
        model: creds.model,
        temperature: Number(agent.temperature) || 0.2,
        messages: [
          {
            role: 'system',
            content: `${agent.system_prompt || 'Você é um especialista.'}\n${
              agent.response_instruction ? `Instrução de resposta: ${agent.response_instruction}\n` : ''
            }[Ambiente de Execução: ${environment.toUpperCase()}]`
          },
          {
            role: 'user',
            content: `Dados recebidos (${environment}):\n${serializedInput}`
          }
        ]
      })
    });

    if (!llmRes.ok) {
      const errText = await llmRes.text();
      throw new Error(`Erro na LLM do agente [${agent.slug}]: HTTP ${llmRes.status} - ${errText}`);
    }

    const completion: any = await llmRes.json();
    outputResult = completion.choices?.[0]?.message?.content || 'Sem resposta da LLM.';
  }

  const executionTimeMs = Date.now() - startTime;

  await pool
    .query(
      `INSERT INTO agent_audit_logs (agent_name, action_payload, response_payload, execution_time_ms)
       VALUES ($1, $2, $3, $4);`,
      [
        agent.name,
        JSON.stringify({ environment, input: inputPayload }),
        JSON.stringify({ output: outputResult }),
        executionTimeMs
      ]
    )
    .catch(() => {});

  return {
    output: outputResult,
    executionTimeMs
  };
}

export async function runAgentPipelineWithWaitSupport(
  initialAgent: any,
  initialPayload: any,
  environment: 'test' | 'production',
  triggerSource: string = 'webhook',
  bypassApprovalForFirstNode: boolean = false
) {
  const pipelineHistory: any[] = [];
  let currentAgent = initialAgent;
  let currentPayload = initialPayload;
  let hop = 0;
  const MAX_HOPS = 5;

  while (currentAgent && hop < MAX_HOPS) {
    const isFirstHop = hop === 0;

    if (currentAgent.requires_approval && !(isFirstHop && bypassApprovalForFirstNode)) {
      const waitRecord = await createWorkflowWaitState({
        agentSlug: currentAgent.slug,
        agentName: currentAgent.name,
        environment,
        triggerSource,
        inputPayload: currentPayload,
        nextAgentSlug: currentAgent.next_agent_slug,
        approvalPrompt:
          currentAgent.approval_message ||
          `O agente "${currentAgent.name}" recebeu um gatilho (${environment}) e aguarda aprovação humana para prosseguir.`
      });

      return {
        status: 'WAITING_APPROVAL',
        environment,
        waitState: {
          executionId: waitRecord.execution_id,
          resumeToken: waitRecord.resume_token,
          agentSlug: currentAgent.slug,
          agentName: currentAgent.name,
          approvalPrompt: waitRecord.approval_prompt,
          resumeApproveUrl: `/api/v1/agents/wait/${waitRecord.resume_token}/decision?action=approve`,
          resumeRejectUrl: `/api/v1/agents/wait/${waitRecord.resume_token}/decision?action=reject`
        },
        pipelineHistory
      };
    }

    safeEmitBrainEvent({
      neurotransmitter: environment === 'test' ? 'ACETILCOLINA' : 'DOPAMINA',
      sourceNode: 'webhook_ingress',
      targetNode: currentAgent.slug,
      intensity: 0.9,
      metadata: {
        agent: currentAgent.name,
        slug: currentAgent.slug,
        environment,
        hop: hop + 1
      }
    });

    const stepExecution = await executeSingleAgentLogic(currentAgent, currentPayload, environment);

    pipelineHistory.push({
      hop: hop + 1,
      agent: currentAgent.name,
      slug: currentAgent.slug,
      environment,
      output: stepExecution.output,
      executionTimeMs: stepExecution.executionTimeMs
    });

    if (currentAgent.next_agent_slug) {
      const nextRes = await pool.query(
        'SELECT * FROM ai_agents WHERE slug = $1 AND is_active = TRUE LIMIT 1;',
        [currentAgent.next_agent_slug]
      );
      if (nextRes.rows.length > 0) {
        currentPayload = {
          previous_agent: currentAgent.slug,
          previous_output: stepExecution.output,
          original_input: initialPayload
        };
        currentAgent = nextRes.rows[0];
        hop++;
        continue;
      }
    }

    break;
  }

  return {
    status: 'COMPLETED',
    environment,
    finalOutput: pipelineHistory[pipelineHistory.length - 1]?.output ?? null,
    pipelineHistory
  };
}

export async function listAgents(req: Request, res: Response) {
  try {
    const result = await pool.query('SELECT * FROM ai_agents ORDER BY id ASC;');
    const agents = result.rows.map((agent) => ({
      ...agent,
      ...buildAgentWebhookUrls(req, agent.slug)
    }));
    return res.status(200).json({ success: true, data: agents });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function createAgent(req: Request, res: Response) {
  try {
    const {
      name,
      slug,
      agent_type = 'llm',
      description = '',
      system_prompt = '',
      provider = 'groq',
      model = 'llama-3.3-70b-versatile',
      api_key = '',
      base_url = '',
      temperature = 0.3,
      icon,
      script_handler = null,
      code_snippet = null,
      script_code = null,
      http_method = 'POST',
      endpoint_url = '',
      auth_token = '',
      payload_template = '',
      response_instruction = '',
      tools = [],
      next_agent_slug = null,
      schedule_enabled = false,
      cron_expression = '*/5 * * * *',
      schedule_prompt = '',
      is_error_trigger = false,
      error_notify_channel = 'telegram',
      is_active = true
    } = req.body || {};

    if (!name) {
      return res.status(400).json({ success: false, error: 'O nome do agente é obrigatório.' });
    }

    const finalSlug = slug?.trim()
      ? slugify(slug)
      : `${slugify(name)}_${Date.now().toString(36).slice(-4)}`;
    const defaultIcon = agent_type === 'mcp' ? '🔌' : agent_type === 'api' ? '🌐' : '🤖';

    const resolvedCred = await resolveSecretByCredentialId(
      req.body?.credential_id || req.body?.credentials?.id
    );
    const finalProvider = (resolvedCred.provider || provider || 'groq').toLowerCase().trim();

    // Sanitiza e descarta máscaras: se vazio, grava NULL para herdar do Cérebro
    const cleanApiKey = sanitizeApiKey(api_key || resolvedCred.api_key) || null;
    const cleanAuthToken = sanitizeApiKey(auth_token || resolvedCred.auth_token) || null;
    const finalEndpointUrl = (endpoint_url || resolvedCred.endpoint_url || '').trim() || null;

    const values = [
      name,
      finalSlug,
      agent_type,
      description,
      system_prompt,
      finalProvider,
      model,
      cleanApiKey,
      base_url || null,
      Number(temperature) || 0.3,
      icon || defaultIcon,
      script_handler,
      code_snippet ?? script_code,
      http_method,
      finalEndpointUrl,
      cleanAuthToken,
      payload_template,
      response_instruction,
      JSON.stringify(Array.isArray(tools) ? tools : []),
      next_agent_slug || null,
      Boolean(schedule_enabled),
      cron_expression,
      schedule_prompt,
      Boolean(is_error_trigger),
      error_notify_channel,
      Boolean(is_active)
    ];

    const result = await pool.query(
      `INSERT INTO ai_agents (
        name, slug, agent_type, description, system_prompt, provider, model,
        api_key, base_url, temperature, icon, script_handler, code_snippet,
        http_method, endpoint_url, auth_token, payload_template, response_instruction,
        tools, next_agent_slug, schedule_enabled, cron_expression, schedule_prompt,
        is_error_trigger, error_notify_channel, is_active, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23,
        $24, $25, $26, CURRENT_TIMESTAMP
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        agent_type = EXCLUDED.agent_type,
        description = EXCLUDED.description,
        system_prompt = EXCLUDED.system_prompt,
        provider = EXCLUDED.provider,
        model = EXCLUDED.model,
        api_key = EXCLUDED.api_key,
        base_url = EXCLUDED.base_url,
        temperature = EXCLUDED.temperature,
        icon = EXCLUDED.icon,
        script_handler = EXCLUDED.script_handler,
        code_snippet = EXCLUDED.code_snippet,
        http_method = EXCLUDED.http_method,
        endpoint_url = EXCLUDED.endpoint_url,
        auth_token = EXCLUDED.auth_token,
        payload_template = EXCLUDED.payload_template,
        response_instruction = EXCLUDED.response_instruction,
        tools = EXCLUDED.tools,
        next_agent_slug = EXCLUDED.next_agent_slug,
        schedule_enabled = EXCLUDED.schedule_enabled,
        cron_expression = EXCLUDED.cron_expression,
        schedule_prompt = EXCLUDED.schedule_prompt,
        is_error_trigger = EXCLUDED.is_error_trigger,
        error_notify_channel = EXCLUDED.error_notify_channel,
        is_active = EXCLUDED.is_active,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;`,
      values
    );

    const saved = result.rows[0];
    safeEmitBrainEvent({
      sourceNode: 'admin_panel',
      targetNode: finalSlug,
      neurotransmitter: 'DOPAMINA',
      intensity: 0.9,
      metadata: { action: 'AGENT_CREATED', name }
    });

    return res.status(201).json({
      success: true,
      data: {
        ...saved,
        ...buildAgentWebhookUrls(req, saved.slug)
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export const saveAgent = createAgent;

export async function updateAgent(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const existing = await pool.query(
      `SELECT * FROM ai_agents WHERE id::text = $1 OR slug = $1 LIMIT 1;`,
      [String(id)]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agente não encontrado.' });
    }
    const curr = existing.rows[0];

    // Trata a chave de API na edição:
    // Se o usuário digitou uma nova chave limpa, grava; se veio vazia ou com máscara, preserva ou seta NULL se explicitamente limpa
    let updatedApiKey = curr.api_key;
    if (body.api_key !== undefined) {
      const cleanedInputKey = sanitizeApiKey(body.api_key);
      updatedApiKey = cleanedInputKey || (body.api_key === '' ? null : curr.api_key);
    }

    let updatedAuthToken = curr.auth_token;
    if (body.auth_token !== undefined) {
      const cleanedInputToken = sanitizeApiKey(body.auth_token);
      updatedAuthToken = cleanedInputToken || (body.auth_token === '' ? null : curr.auth_token);
    }

    const updated = await pool.query(
      `UPDATE ai_agents SET
        name = $1,
        slug = $2,
        agent_type = $3,
        description = $4,
        system_prompt = $5,
        provider = $6,
        model = $7,
        api_key = $8,
        base_url = $9,
        temperature = $10,
        icon = $11,
        script_handler = $12,
        code_snippet = $13,
        http_method = $14,
        endpoint_url = $15,
        auth_token = $16,
        payload_template = $17,
        response_instruction = $18,
        tools = $19,
        next_agent_slug = $20,
        schedule_enabled = $21,
        cron_expression = $22,
        schedule_prompt = $23,
        is_error_trigger = $24,
        error_notify_channel = $25,
        is_active = $26,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $27 RETURNING *;`,
      [
        body.name ?? curr.name,
        body.slug ?? curr.slug,
        body.agent_type ?? curr.agent_type,
        body.description ?? curr.description,
        body.system_prompt ?? curr.system_prompt,
        body.provider ? String(body.provider).toLowerCase().trim() : curr.provider,
        body.model ?? curr.model,
        updatedApiKey,
        body.base_url !== undefined ? body.base_url : curr.base_url,
        body.temperature ?? curr.temperature,
        body.icon ?? curr.icon,
        body.script_handler !== undefined ? body.script_handler : curr.script_handler,
        body.code_snippet !== undefined ? body.code_snippet : curr.code_snippet,
        body.http_method ?? curr.http_method,
        body.endpoint_url !== undefined ? body.endpoint_url : curr.endpoint_url,
        updatedAuthToken,
        body.payload_template !== undefined ? body.payload_template : curr.payload_template,
        body.response_instruction !== undefined ? body.response_instruction : curr.response_instruction,
        JSON.stringify(body.tools !== undefined ? body.tools : curr.tools || []),
        body.next_agent_slug !== undefined ? body.next_agent_slug : curr.next_agent_slug,
        body.schedule_enabled !== undefined ? Boolean(body.schedule_enabled) : curr.schedule_enabled,
        body.cron_expression ?? curr.cron_expression,
        body.schedule_prompt !== undefined ? body.schedule_prompt : curr.schedule_prompt,
        body.is_error_trigger !== undefined ? Boolean(body.is_error_trigger) : curr.is_error_trigger,
        body.error_notify_channel ?? curr.error_notify_channel,
        body.is_active !== undefined ? Boolean(body.is_active) : curr.is_active,
        curr.id
      ]
    );

    if (body.system_prompt && body.system_prompt !== curr.system_prompt) {
      await pool
        .query(
          `INSERT INTO prompt_versions (target_slug, system_prompt, model, provider) VALUES ($1, $2, $3, $4);`,
          [updated.rows[0].slug, body.system_prompt, updated.rows[0].model, updated.rows[0].provider]
        )
        .catch(() => {});
    }

    return res.status(200).json({
      success: true,
      data: {
        ...updated.rows[0],
        ...buildAgentWebhookUrls(req, updated.rows[0].slug)
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function deleteAgent(req: Request, res: Response) {
  try {
    const identifier = req.params.id || req.params.slug;
    await pool.query(
      `DELETE FROM ai_agents WHERE id::text = $1 OR slug = $1;`,
      [String(identifier)]
    );
    return res.status(200).json({ success: true, message: 'Agente removido com sucesso.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function deleteAllAgents(_req: Request, res: Response) {
  try {
    await pool.query('DELETE FROM ai_agents;');
    return res.status(200).json({ success: true, message: 'Todos os agentes foram removidos com sucesso.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function sandboxAgent(req: Request, res: Response) {
  const startTime = Date.now();
  try {
    const { agent, testInput } = req.body || {};
    if (!agent) {
      return res.status(400).json({ success: false, error: 'Objeto agent é obrigatório.' });
    }
    const result = await executeSingleAgentLogic(agent, testInput || 'Teste de Sandbox', 'test');
    return res.status(200).json({
      success: true,
      output: result.output,
      latencyMs: Date.now() - startTime
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
      latencyMs: Date.now() - startTime
    });
  }
}

export const testAgentSandbox = sandboxAgent;

export async function handleAgentProductionWebhook(req: Request, res: Response) {
  const { slug } = req.params;
  const payload = req.method === 'GET' ? req.query : req.body;

  try {
    const agentRes = await pool.query(
      'SELECT * FROM ai_agents WHERE slug = $1 AND is_active = TRUE LIMIT 1;',
      [slug]
    );

    if (agentRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Agente de produção "${slug}" não encontrado ou está inativo.`
      });
    }

    const agent = agentRes.rows[0];
    const result = await runAgentPipelineWithWaitSupport(agent, payload, 'production', 'webhook_prod');

    const httpCode = result.status === 'WAITING_APPROVAL' ? 202 : 200;
    return res.status(httpCode).json({
      success: true,
      agent: agent.name,
      slug: agent.slug,
      ...result
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function handleAgentTestWebhook(req: Request, res: Response) {
  const { slug } = req.params;
  const capturedEnvelope = {
    method: req.method,
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent']
    },
    query: req.query,
    body: req.body,
    receivedAt: new Date().toISOString()
  };

  try {
    const agentRes = await pool.query('SELECT * FROM ai_agents WHERE slug = $1 LIMIT 1;', [slug]);

    if (agentRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Agente "${slug}" não encontrado para escuta de Webhook de Teste.`
      });
    }

    const agent = agentRes.rows[0];
    const payloadToProcess = req.method === 'GET' ? req.query : req.body;
    const result = await runAgentPipelineWithWaitSupport(agent, payloadToProcess, 'test', 'webhook_test');

    const httpCode = result.status === 'WAITING_APPROVAL' ? 202 : 200;
    return res.status(httpCode).json({
      success: true,
      agent: agent.name,
      slug: agent.slug,
      capturedWebhookData: capturedEnvelope,
      ...result
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function getWaitStatesQueue(req: Request, res: Response) {
  try {
    const status = req.query.status as string | undefined;
    const list = await listWaitStates(status);
    return res.status(200).json({ success: true, data: list });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function resolveWaitStateDecision(req: Request, res: Response) {
  try {
    const { identifier } = req.params;
    const rawAction = (req.body?.action || req.query?.action || '').toString().toLowerCase();
    const decidedBy = (req.body?.decidedBy || req.query?.decidedBy || 'Matheus-Admin').toString();
    const notes = (req.body?.notes || req.query?.notes || '').toString();

    if (rawAction !== 'approve' && rawAction !== 'reject') {
      return res.status(400).json({
        success: false,
        error: 'Parâmetro "action" inválido. Use "approve" ou "reject".'
      });
    }

    const decision = rawAction === 'approve' ? 'APPROVED' : 'REJECTED';
    const updatedWait = await markWaitStateDecision(identifier, decision, decidedBy, notes);

    if (!updatedWait) {
      return res.status(404).json({
        success: false,
        error: 'Execução em Estado Wait não encontrada ou já processada.'
      });
    }

    if (decision === 'REJECTED') {
      return res.status(200).json({
        success: true,
        status: 'REJECTED_BY_HUMAN',
        message: `Execução do agente [${updatedWait.agent_name}] abortada por decisão humana.`,
        waitState: updatedWait
      });
    }

    const agentRes = await pool.query('SELECT * FROM ai_agents WHERE slug = $1 LIMIT 1;', [
      updatedWait.agent_slug
    ]);

    if (agentRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Agente [${updatedWait.agent_slug}] não encontrado para retomar o fluxo.`
      });
    }

    const agent = agentRes.rows[0];
    const resumedResult = await runAgentPipelineWithWaitSupport(
      agent,
      updatedWait.input_payload,
      updatedWait.environment as 'test' | 'production',
      'wait_resumed',
      true
    );

    return res.status(200).json({
      success: true,
      status: 'APPROVED_AND_RESUMED',
      message: `Aprovação confirmada! Fluxo do agente [${agent.name}] retomado com sucesso.`,
      waitState: updatedWait,
      executionResult: resumedResult
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function listAvailableCredentials(_req: Request, res: Response) {
  try {
    const credentials = await listAvailableCredentialsMetadata();
    return res.status(200).json({
      success: true,
      total: credentials.length,
      data: credentials
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
