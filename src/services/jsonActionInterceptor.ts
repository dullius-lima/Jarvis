// Intercepta JSONs no texto e executa o Agente/Home Assistant-API

import { pool } from '../config/database.js';
import { executeNodeIntegration } from './integrationService.js';
import { appendSpecialistContext } from './memoryService.js';

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
 * Extrai blocos ```json ... ``` ou objetos JSON com a chave "action" do texto da LLM
 */
export function extractJsonActionBlocks(text: string): Array<{ rawMatch: string; parsed: any }> {
  if (!text || typeof text !== 'string') return [];
  const results: Array<{ rawMatch: string; parsed: any }> = [];

  // 1. Procura blocos demarcados com ```json ... ```
  const fencedRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = fencedRegex.exec(text)) !== null) {
    const candidate = match[1]
      .replace(/\/\/.*$/gm, '') // Remove comentários "// ..." que a LLM às vezes coloca no JSON
      .trim();
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && (parsed.action || parsed.tool || parsed.slug)) {
        results.push({ rawMatch: match[0], parsed });
      }
    } catch {
      // Ignora blocos que não são JSON válido
    }
  }

  // 2. Fallback: Se a resposta inteira for um JSON puro começando com { e contendo "action"
  if (results.length === 0) {
    const trimmed = text.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const cleanJson = trimmed.replace(/\/\/.*$/gm, '');
        const parsed = JSON.parse(cleanJson);
        if (parsed && (parsed.action || parsed.tool)) {
          results.push({ rawMatch: trimmed, parsed });
        }
      } catch {}
    }
  }

  return results;
}

/**
 * Intercepta e executa automaticamente ações que a LLM escreveu em texto JSON
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
  const actionName = String(firstBlock.action || firstBlock.tool || '').toLowerCase().trim();
  const actionParams = firstBlock.parameters || firstBlock.payload || firstBlock;

  // CASO 1: Criar ou Atualizar um Agente via JSON no texto (create_or_update_ai_agent)
  if (actionName === 'create_or_update_ai_agent') {
    const slug = String(actionParams.slug || 'custom_agent').toLowerCase().trim();
    const name = String(actionParams.name || slug);
    const agentType = String(actionParams.mode || actionParams.agent_type || 'api').toLowerCase();
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
      finalText: `${params.llmText}\n\n✅ **[Auto-Executor]** O agente **${name}** (\`${slug}\`) foi gravado e ativado no banco de dados com sucesso.`,
      agentName: name,
      agentSlug: slug,
      nodeType: agentType,
      triggeredSuccess: true,
      executionData: { createdOrUpdated: slug }
    };
  }

  // CASO 2: Invocar um Agente Especialista (invoke_ai_agent ou slug direto de agente no banco)
  const targetSlug =
    actionName === 'invoke_ai_agent'
      ? String(actionParams.slug || '').toLowerCase().trim()
      : actionName;

  const agentQuery = await pool.query(
    `SELECT * FROM ai_agents WHERE LOWER(slug) = $1 LIMIT 1;`,
    [targetSlug]
  );

  if (agentQuery.rows.length > 0) {
    const agent = agentQuery.rows[0];
    const payloadObj = actionParams.payload || actionParams;
    const symbolVal = payloadObj.symbol || payloadObj.ticker || payloadObj.query || '';

    if (agent.endpoint_url) {
      const cleanBase = (params.serverBaseUrl || 'http://localhost:3333').replace(/\/+$/, '');
      const finalUrl = String(agent.endpoint_url)
        .replace(/\{\{\s*BASE_URL\s*\}\}/gi, cleanBase)
        .replace(/\{\{\s*symbol\s*\}\}/gi, encodeURIComponent(symbolVal))
        .replace(/\{\{\s*query\s*\}\}/gi, encodeURIComponent(params.userPrompt));

      const res = await fetch(finalUrl, { method: agent.http_method || 'GET' });
      const data = await res.json().catch(async () => ({ raw: await res.text() }));

      await appendSpecialistContext(params.sessionId, agent.slug, {
        input: payloadObj,
        output: data
      }).catch(() => {});

      return {
        intercepted: true,
        finalText: `✅ **Agente ${agent.name} acionado com sucesso!**\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
        agentName: agent.name,
        agentSlug: agent.slug,
        nodeType: agent.agent_type || 'api',
        triggeredSuccess: res.ok,
        executionData: data
      };
    }
  }

  // CASO 3: Acionamento de Dispositivos IoT / Home Assistant / Conectores Externos
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
        finalText: `🏠 **Comando Home Assistant Executado:** Dispositivo \`${actionParams.entity_id || actionName}\` acionado.`,
        agentName: 'Home Assistant IoT',
        agentSlug: 'home_assistant',
        nodeType: 'api',
        triggeredSuccess: true,
        executionData: haResult
      };
    } catch (err: any) {
      return {
        intercepted: true,
        finalText: `⚠️ **Tentativa de acionamento Home Assistant (\`${actionParams.entity_id || actionName}\`):** ${err.message}`,
        agentName: 'Home Assistant IoT',
        agentSlug: 'home_assistant',
        nodeType: 'api',
        triggeredSuccess: false
      };
    }
  }

  return null;
}