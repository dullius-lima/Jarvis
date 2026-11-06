// src/services/jsonActionInterceptor.ts
import { pool } from '../config/database.js';
import { executeNodeIntegration } from './integrationService.js';
import { appendSpecialistContext } from './memoryService.js';
import {
  executeSpecialistPipeline,
  executeUniversalApiConnector,
  callOpenAICompatibleLLM
} from './orchestrator/llmAndPipelineRunner.js';
import {
  getCentralBrainConfig,
  sanitizeToolName
} from './orchestrator/brainConfigAndUtils.js';
import { getDynamicToolsCatalog } from './orchestrator/catalogAndDatabase.js';
import { createOrUpdateToolFromBrain } from './orchestrator/brainMetaTools.js';

export interface InterceptedActionResult {
  intercepted: boolean;
  finalText: string;
  agentName: string;
  agentSlug: string;
  nodeType: string;
  triggeredSuccess: boolean;
  executionData?: any;
}

/**
 * Extrai blocos ```json ... ``` ou objetos JSON com a chave "action" / "tool" / "slug" do texto da LLM
 */
export function extractJsonActionBlocks(text: string): Array<{ rawMatch: string; parsed: any }> {
  if (!text || typeof text !== 'string') return [];
  const results: Array<{ rawMatch: string; parsed: any }> = [];

  const fencedRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = fencedRegex.exec(text)) !== null) {
    const candidate = match[1]
      .replace(/\/\/.*$/gm, '')
      .trim();
    try {
      const parsed = JSON.parse(candidate);
      if (
        parsed &&
        typeof parsed === 'object' &&
        (parsed.action || parsed.tool || parsed.slug || parsed.parameters)
      ) {
        results.push({ rawMatch: match[0], parsed });
      }
    } catch {}
  }

  if (results.length === 0) {
    const trimmed = text.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const cleanJson = trimmed.replace(/\/\/.*$/gm, '');
        const parsed = JSON.parse(cleanJson);
        if (parsed && (parsed.action || parsed.tool || parsed.slug)) {
          results.push({ rawMatch: trimmed, parsed });
        }
      } catch {}
    }
  }

  return results;
}

/**
 * Intercepta e executa automaticamente qualquer ação JSON que a LLM tenha escrito em texto
 */
export async function interceptAndExecuteTextActions(params: {
  llmText: string;
  userPrompt: string;
  sessionId: string;
  serverBaseUrl?: string;
}): Promise<InterceptedActionResult | null> {
  const blocks = extractJsonActionBlocks(params.llmText);
  if (blocks.length === 0) return null;

  const firstBlock = blocks[0].parsed;
  const actionName = sanitizeToolName(firstBlock.action || firstBlock.tool || firstBlock.slug || '');
  const actionParams = firstBlock.parameters || firstBlock.payload || firstBlock;

  // CASO 0: Atualizar ou Criar Tool (update_tool / create_or_update_tool_connector)
  if (
    actionName === 'update_tool' ||
    actionName === 'create_or_update_tool_connector'
  ) {
    const slug = sanitizeToolName(actionParams.slug || actionParams.provider_key || 'custom_tool');
    const updated = await createOrUpdateToolFromBrain({
      name: actionParams.name || slug,
      provider_key: slug,
      http_method: actionParams.http_method || 'GET',
      endpoint_url: actionParams.endpoint_url || '',
      auth_token: actionParams.auth_token || actionParams.api_key || ''
    });

    return {
      intercepted: true,
      finalText: `✅ **[Auto-Executor]** A ferramenta **${updated.name}** (\`${updated.tool_id}\`) foi atualizada com sucesso.`,
      agentName: updated.name,
      agentSlug: updated.tool_id,
      nodeType: 'api',
      triggeredSuccess: true,
      executionData: updated
    };
  }

  // CASO 1: Criar ou Atualizar um Agente via JSON no texto (create_or_update_ai_agent)
  if (actionName === 'create_or_update_ai_agent') {
    const slug = sanitizeToolName(actionParams.slug || actionParams.name || 'custom_agent');
    const name = String(actionParams.name || slug);
    const agentType = String(actionParams.mode || actionParams.agent_type || 'llm').toLowerCase();
    const endpointUrl = String(actionParams.endpoint_url || '');
    const httpMethod = String(actionParams.http_method || 'GET').toUpperCase();
    const systemPrompt = String(actionParams.system_prompt || '');
    const tools = Array.isArray(actionParams.tools) ? actionParams.tools : [];

    await pool.query(
      `INSERT INTO ai_agents (name, slug, agent_type, description, system_prompt, endpoint_url, http_method, tools, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, TRUE)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         agent_type = EXCLUDED.agent_type,
         system_prompt = EXCLUDED.system_prompt,
         endpoint_url = EXCLUDED.endpoint_url,
         http_method = EXCLUDED.http_method,
         tools = EXCLUDED.tools,
         updated_at = NOW();`,
      [
        name,
        slug,
        agentType,
        actionParams.description || `Agente ${name}`,
        systemPrompt,
        endpointUrl,
        httpMethod,
        JSON.stringify(tools)
      ]
    );

    return {
      intercepted: true,
      finalText: `✅ **[Auto-Executor]** O agente **${name}** (\`${slug}\`) foi gravado e ativado com sucesso.`,
      agentName: name,
      agentSlug: slug,
      nodeType: agentType,
      triggeredSuccess: true,
      executionData: { createdOrUpdated: slug }
    };
  }

  // CASO 2: Invocar um Agente Especialista (invoke_ai_agent ou slug direto)
  const rawTargetSlug =
    actionName === 'invoke_ai_agent'
      ? String(actionParams.slug || actionParams.agent || '')
      : actionName;
  const targetSlug = sanitizeToolName(rawTargetSlug);
  const payloadObj = actionParams.payload || actionParams;

  // 2.1 Busca exata pelo slug ou nome sanitizado
  let agentQuery = await pool
    .query(
      `SELECT * FROM ai_agents 
       WHERE is_active = true 
         AND (LOWER(slug) = $1 OR LOWER(REPLACE(name, ' ', '_')) = $1)
       LIMIT 1;`,
      [targetSlug]
    )
    .catch(() => ({ rows: [] as any[] }));

  // 2.2 Fallback Inteligente: se a LLM chamou "monitor_mercado_financeiro" mas no banco é "agente_de_financas"
  if (agentQuery.rows.length === 0) {
    const isFinanceIntent =
      targetSlug.includes('financ') ||
      targetSlug.includes('mercado') ||
      targetSlug.includes('cotac') ||
      targetSlug.includes('brapi') ||
      Boolean(payloadObj?.symbol || payloadObj?.ticker);

    if (isFinanceIntent) {
      agentQuery = await pool
        .query(
          `SELECT * FROM ai_agents 
           WHERE is_active = true 
             AND (
               LOWER(slug) LIKE '%financ%' 
               OR LOWER(name) LIKE '%finan%' 
               OR LOWER(description) LIKE '%cotac%'
               OR tools::text ILIKE '%mercado%'
               OR tools::text ILIKE '%brapi%'
             )
           ORDER BY id ASC LIMIT 1;`
        )
        .catch(() => ({ rows: [] as any[] }));
    }
  }

  // 2.3 Se encontrou o Agente Especialista (seja ele LLM, API ou Code), executa o Pipeline Completo!
  if (agentQuery.rows.length > 0) {
    const agent = agentQuery.rows[0];
    const brainConfig = await getCentralBrainConfig();
    const { connectorsMap } = await getDynamicToolsCatalog();

    const chainResults = await executeSpecialistPipeline(
      agent,
      payloadObj,
      params.sessionId,
      'Matheus-Admin',
      [],
      params.serverBaseUrl || brainConfig.server_base_url,
      params.userPrompt,
      brainConfig,
      connectorsMap
    );

    const lastHop = chainResults[chainResults.length - 1]?.output;
    let readableReply =
      lastHop?.specialist_response ||
      (typeof lastHop === 'string' ? lastHop : '');

    if (!readableReply) {
      const synthRes: any = await callOpenAICompatibleLLM({
        provider: brainConfig.provider,
        model: brainConfig.model,
        apiKey: brainConfig.api_key,
        baseUrl: brainConfig.base_url,
        messages: [
          {
            role: 'system',
            content:
              agent.system_prompt ||
              'Você é um analista financeiro sênior. Apresente os dados retornados pela API de forma clara, estruturada e direta ao usuário, sem mostrar blocos JSON de código.'
          },
          {
            role: 'user',
            content: `Pedido do usuário: "${params.userPrompt}"\nDados em tempo real obtidos:\n${JSON.stringify(
              chainResults,
              null,
              2
            )}`
          }
        ],
        temperature: 0.2
      });
      readableReply =
        synthRes?.choices?.[0]?.message?.content ||
        JSON.stringify(lastHop, null, 2);
    }

    return {
      intercepted: true,
      finalText: readableReply,
      agentName: agent.name,
      agentSlug: agent.slug,
      nodeType: agent.agent_type || 'llm',
      triggeredSuccess: true,
      executionData: chainResults
    };
  }

  // 2.4 Se não for um Agente, verifica se o slug é diretamente uma Tool de API na tabela external_connectors
  const directApiRes = await executeUniversalApiConnector(
    targetSlug,
    payloadObj,
    params.userPrompt,
    params.serverBaseUrl || 'http://localhost:3333'
  );

  if (directApiRes && !directApiRes.error) {
    const brainConfig = await getCentralBrainConfig();
    const synthRes: any = await callOpenAICompatibleLLM({
      provider: brainConfig.provider,
      model: brainConfig.model,
      apiKey: brainConfig.api_key,
      baseUrl: brainConfig.base_url,
      messages: [
        {
          role: 'system',
          content:
            'Apresente os dados retornados pela API de forma executiva, clara e direta em português. Nunca responda com código JSON.'
        },
        {
          role: 'user',
          content: `Pergunta: "${params.userPrompt}"\nRetorno da API:\n${JSON.stringify(
            directApiRes,
            null,
            2
          )}`
        }
      ],
      temperature: 0.2
    });

    return {
      intercepted: true,
      finalText:
        synthRes?.choices?.[0]?.message?.content ||
        JSON.stringify(directApiRes.data, null, 2),
      agentName: directApiRes.connector || targetSlug,
      agentSlug: targetSlug,
      nodeType: 'api',
      triggeredSuccess: true,
      executionData: directApiRes
    };
  }

  // CASO 3: Acionamento de Dispositivos IoT / Home Assistant
  if (
    actionName.includes('home_assistant') ||
    actionName.includes('luz') ||
    actionName.includes('dispositivo') ||
    actionParams.entity_id
  ) {
    try {
      const haResult = await executeNodeIntegration({
        provider: 'home_assistant',
        action: actionParams.service || 'toggle',
        payload: {
          entity_id: actionParams.entity_id,
          ...actionParams
        }
      });

      await appendSpecialistContext(params.sessionId, 'home_assistant', {
        action: actionName,
        entity_id: actionParams.entity_id,
        result: haResult
      }).catch(() => {});

      return {
        intercepted: true,
        finalText: `🏠 **Comando Home Assistant Executado:** Dispositivo \`${
          actionParams.entity_id || actionName
        }\` acionado.`,
        agentName: 'Home Assistant IoT',
        agentSlug: 'home_assistant',
        nodeType: 'api',
        triggeredSuccess: true,
        executionData: haResult
      };
    } catch (err: any) {
      return {
        intercepted: true,
        finalText: `⚠️ **Tentativa de acionamento Home Assistant (\`${
          actionParams.entity_id || actionName
        }\`):** ${err.message}`,
        agentName: 'Home Assistant IoT',
        agentSlug: 'home_assistant',
        nodeType: 'api',
        triggeredSuccess: false
      };
    }
  }

  return null;
}
