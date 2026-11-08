// src/services/jsonActionInterceptor.ts
import { pool } from '../config/database.js';
import { executeProtocolOrIntegration } from './integrationAndProtocolService.js';
import { appendSpecialistContext } from './memoryService.js';
import {
  executeSpecialistPipeline,
  executeUniversalApiConnector,
  executeBoundTool,
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

function isActionJsonObject(parsed: any): boolean {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  return Boolean(
    parsed.toolName ||
      parsed.tool_name ||
      parsed.action ||
      parsed.tool ||
      parsed.slug ||
      parsed.function ||
      parsed.name ||
      parsed.parameters
  );
}

/**
 * Extrai blocos ```json ... ``` ou objetos JSON com "toolName" / "action" / "tool" / "slug" do texto da LLM
 */
export function extractJsonActionBlocks(text: string): Array<{ rawMatch: string; parsed: any }> {
  if (!text || typeof text !== 'string') return [];
  const results: Array<{ rawMatch: string; parsed: any }> = [];

  const fencedRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = fencedRegex.exec(text)) !== null) {
    const candidate = match[1].replace(/\/\/.*$/gm, '').trim();
    try {
      const parsed = JSON.parse(candidate);
      if (isActionJsonObject(parsed)) {
        results.push({ rawMatch: match[0], parsed });
      }
    } catch {}
  }

  if (results.length === 0) {
    const trimmed = text.trim();
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const candidate = trimmed.slice(firstBrace, lastBrace + 1).replace(/\/\/.*$/gm, '').trim();
      try {
        const parsed = JSON.parse(candidate);
        if (isActionJsonObject(parsed)) {
          results.push({ rawMatch: candidate, parsed });
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
  const rawActionIdentifier =
    firstBlock.toolName ||
    firstBlock.tool_name ||
    firstBlock.action ||
    firstBlock.tool ||
    firstBlock.slug ||
    firstBlock.function?.name ||
    firstBlock.function ||
    firstBlock.name ||
    '';

  const actionName = sanitizeToolName(rawActionIdentifier);
  const actionParams =
    firstBlock.parameters ||
    firstBlock.arguments ||
    firstBlock.payload ||
    firstBlock.params ||
    firstBlock;

  if (!actionName || actionName === 'custom_tool') return null;

  // CASO 0: Atualizar ou Criar Tool (update_tool / create_or_update_tool_connector)
  if (actionName === 'update_tool' || actionName === 'create_or_update_tool_connector') {
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
  const isAgentCreation =
    actionName === 'create_or_update_ai_agent' ||
    actionName === 'create_agent' ||
    actionName === 'delegar_criacao_ou_ajuste_de_subagente' ||
    firstBlock.tool === 'delegar_criacao_ou_ajuste_de_subagente';

  if (isAgentCreation) {
    const slug = sanitizeToolName(actionParams.slug || actionParams.name || 'custom_agent');
    const name = String(actionParams.nome || actionParams.name || slug);
    const agentType = String(actionParams.modo || actionParams.agent_type || 'llm').toLowerCase();
    const endpointUrl = String(actionParams.endpoint_url || '');
    const httpMethod = String(actionParams.http_method || 'GET').toUpperCase();
    const systemPrompt = String(actionParams.system_prompt || '');
    const tools = Array.isArray(actionParams.tools) ? actionParams.tools : [];
    const triggerDesc = actionParams.gatilho || actionParams.description || `Agente ${name}`;

    // 1.1 FILTRO DE DISCERNIMENTO: Valida se a ferramenta já existe no ecossistema
    const requestedTools = tools.map((t: string) => t.toLowerCase());
    const existingToolsCheck = await pool.query(
      `SELECT slug, name FROM external_connectors WHERE LOWER(slug) = ANY($1::text[]);`,
      [requestedTools]
    ).catch(() => ({ rows: [] as any[] }));

    // Se o usuário pediu apenas ações de e-mail e a ferramenta 'gmail' já existe, não cria agente redundante
    if (requestedTools.includes('gmail') && existingToolsCheck.rows.length > 0 && tools.length === 1) {
      return {
        interceptado: true,
        finalText: `ℹ️ O conector nativo do **Gmail** já está integrado e disponível no seu ecossistema. Não é necessário criar um subagente redundante para isso. Você já pode solicitar a leitura, envio ou organização de e-mails diretamente ao JARVIS.`,
        agentName: 'JARVIS (Orquestrador)',
        agentSlug: 'jarvis_core',
        nodeType: 'core',
        triggeredSuccess: true,
        executionData: { bypassedDueToExistingTool: 'gmail' }
      };
    }

    // 1.2 EXECUÇÃO OU PERSISTÊNCIA: Cria ou atualiza o agente se for realmente inédito
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
         description = EXCLUDED.description,
         updated_at = NOW();`,
      [
        name,
        slug,
        agentType,
        triggerDesc,
        systemPrompt,
        endpointUrl,
        httpMethod,
        JSON.stringify(tools)
      ]
    );

    return {
      interceptado: true,
      finalText: `✅ **Subagente Configurado com Sucesso!**\n- **Nome:** ${name}\n- **Identificador (slug):** \`${slug}\`\n- **Tipo:** ${agentType.toUpperCase()}\n- **Ferramentas Vinculadas:** ${tools.join(', ') || 'Nenhuma'}\n- **Gatilho:** ${triggerDesc}`,
      agentName: name,
      agentSlug: slug,
      nodeType: agentType,
      triggeredSuccess: true,
      executionData: { createdOrUpdated: slug }
    };
  }
  
  // CASO 2: Se o toolName é diretamente uma Tool do catálogo ou integração nativa (ex: consultar_mercado_de_valores, google_calendar, gmail, home_assistant)
  const isKnownToolOrIntegration =
    connectorsMap.has(actionName) ||
    actionName.includes('google_calendar') ||
    actionName.includes('calendar') ||
    actionName.includes('agenda') ||
    actionName.includes('gmail') ||
    actionName.includes('google_drive') ||
    actionName.includes('google_sheets') ||
    actionName.includes('outlook') ||
    actionName.includes('brapi') ||
    actionName.includes('mercado') ||
    actionName.includes('cotac') ||
    actionName.includes('home_assistant') ||
    actionName.includes('dispositivo') ||
    actionName.includes('sensor');

  if (isKnownToolOrIntegration && actionName !== 'invoke_ai_agent') {
    const toolResult = await executeBoundTool(
      actionName,
      actionParams,
      params.userPrompt,
      connectorsMap,
      serverBase
    );

    const synthRes: any = await callOpenAICompatibleLLM({
      provider: brainConfig.provider,
      model: brainConfig.model,
      apiKey: brainConfig.api_key,
      baseUrl: brainConfig.base_url,
      messages: [
        {
          role: 'system',
          content:
            'Você é o JARVIS. Apresente o resultado da ferramenta executada de forma direta, natural e completa em português. É ESTRITAMENTE PROIBIDO exibir blocos JSON ou mencionar nomes técnicos de variáveis.'
        },
        {
          role: 'user',
          content: `Pedido do usuário: "${params.userPrompt}"\nFerramenta executada: ${actionName}\nResultado obtido:\n${JSON.stringify(
            toolResult,
            null,
            2
          )}`
        }
      ],
      temperature: 0.2
    });

    const friendlyReply =
      synthRes?.choices?.[0]?.message?.content ||
      `Ação executada com sucesso na ferramenta ${actionName}.`;

    return {
      intercepted: true,
      finalText: friendlyReply,
      agentName: connectorsMap.get(actionName)?.name || actionName,
      agentSlug: actionName,
      nodeType: 'api',
      triggeredSuccess: true,
      executionData: toolResult
    };
  }

  // CASO 3: Invocar um Agente Especialista (invoke_ai_agent ou slug de agente)
  const rawTargetSlug =
    actionName === 'invoke_ai_agent'
      ? String(actionParams.slug || actionParams.agent || actionParams.toolName || '')
      : actionName;
  const targetSlug = sanitizeToolName(rawTargetSlug);
  const payloadObj = actionParams.payload || actionParams;

  let agentQuery = await pool
    .query(
      `SELECT * FROM ai_agents 
       WHERE is_active = true 
         AND (LOWER(slug) = $1 OR LOWER(REPLACE(name, ' ', '_')) = $1)
       LIMIT 1;`,
      [targetSlug]
    )
    .catch(() => ({ rows: [] as any[] }));

  if (agentQuery.rows.length === 0) {
    const isFinanceIntent =
      targetSlug.includes('financ') ||
      targetSlug.includes('mercado') ||
      targetSlug.includes('cotac') ||
      targetSlug.includes('brapi') ||
      Boolean(payloadObj?.symbol || payloadObj?.ticker || payloadObj?.query);

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

  if (agentQuery.rows.length > 0) {
    const agent = agentQuery.rows[0];
    const chainResults = await executeSpecialistPipeline(
      agent,
      payloadObj,
      params.sessionId,
      'Matheus-Admin',
      [],
      serverBase,
      params.userPrompt,
      brainConfig,
      connectorsMap
    );

    const lastHop = chainResults[chainResults.length - 1]?.output;
    let readableReply =
      lastHop?.specialist_response || (typeof lastHop === 'string' ? lastHop : '');

    if (!readableReply || extractJsonActionBlocks(readableReply).length > 0) {
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
              'Apresente os dados retornados de forma clara, estruturada e direta ao usuário em português, sem mostrar blocos JSON.'
          },
          {
            role: 'user',
            content: `Pedido do usuário: "${params.userPrompt}"\nDados obtidos:\n${JSON.stringify(
              chainResults,
              null,
              2
            )}`
          }
        ],
        temperature: 0.2
      });
      readableReply =
        synthRes?.choices?.[0]?.message?.content || JSON.stringify(lastHop, null, 2);
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

  // CASO 4: Fallback universal de conector HTTP/Protocolo
  const directApiRes = await executeUniversalApiConnector(
    targetSlug,
    payloadObj,
    params.userPrompt,
    serverBase
  );

  if (directApiRes && !directApiRes.error) {
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
        synthRes?.choices?.[0]?.message?.content || JSON.stringify(directApiRes.data, null, 2),
      agentName: directApiRes.connector || targetSlug,
      agentSlug: targetSlug,
      nodeType: 'api',
      triggeredSuccess: true,
      executionData: directApiRes
    };
  }

  return null;
}
