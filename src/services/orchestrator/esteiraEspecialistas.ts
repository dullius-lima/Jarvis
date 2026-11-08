// src/services/orchestrator/esteiraEspecialistas.ts
import { pool } from '../../config/database.js';
import OpenAI from 'openai';
import { emitBrainLinkEvent } from '../brainSocketService.js';
import { getEnvRegisteredPort } from '../../controllers/brainConfigController.js';
import { executeProtocolOrIntegration } from '../integrationAndProtocolService.js';
import {
  SupportedProtocolOrPlatform,
  interpolateApiTemplate,
  resolveDynamicUrl,
  sanitizeToolName
} from './brainConfigAndUtils.js';
import { chamarLLMCompativelOpenAI, limparMascaraChave, obterChaveContingenciaEnv } from './motorInferencaLLM.js';
import { executarFerramentaVinculada } from './executorFerramentasFixas.js';

export async function executarEsteiraEspecialistas(
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
  const cadeiaExecucao: Array<{
    agentSlug: string;
    agentName: string;
    agentType?: string;
    responseInstruction?: string;
    output: any;
  }> = [];

  const map = connectorsMap || new Map<string, any>();

  while (currentAgent && hopCount < MAX_HOPS) {
    hopCount++;

    try {
      emitBrainLinkEvent({
        axon_id: `axon_${currentAgent.slug}`,
        source_dendrite: hopCount === 1 ? 'jarvis_core' : cadeiaExecucao[cadeiaExecucao.length - 1].agentSlug,
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

    // Rota 1: Script de Código Deterministico (Zero Tokens)
    if (agentType === 'code' && (currentAgent.code_snippet || currentAgent.script_code)) {
      try {
        const codeToRun = currentAgent.code_snippet || currentAgent.script_code;
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const fn = new AsyncFunction('payload', 'env', codeToRun);
        let portaAtiva = 3333;
        try {
          portaAtiva = typeof getEnvRegisteredPort === 'function' ? getEnvRegisteredPort() : 3333;
        } catch {
          portaAtiva = 3333;
        }
        stepOutput = await fn(
          { ...currentPayload, query: promptText, userPrompt },
          { BASE_URL: serverBaseUrl, PORT: portaAtiva }
        );
      } catch (err: any) {
        stepOutput = { error: `Falha no nó code (${currentAgent.name}): ${err.message}` };
      }
    }
    // Rota 2: Endpoint API / Webhook Direto
    else if (agentType === 'api' && currentAgent.endpoint_url) {
      const rawUrl = resolveDynamicUrl(currentAgent.endpoint_url || '', serverBaseUrl);
      const targetUrl = interpolateApiTemplate(rawUrl, userPrompt, currentPayload);

      let customBodyParams: Record<string, any> = {};
      const bodyTemplate = currentAgent.payload_template || currentAgent.code_snippet;
      if (bodyTemplate && String(bodyTemplate).trim().startsWith('{')) {
        try {
          customBodyParams = JSON.parse(interpolateApiTemplate(String(bodyTemplate), userPrompt, currentPayload));
        } catch {
          customBodyParams = { raw_payload: bodyTemplate };
        }
      }

      const rawApiResult = await executeProtocolOrIntegration(currentAgent, {
        protocol: 'rest_api' as SupportedProtocolOrPlatform,
        endpoint: targetUrl,
        method: currentAgent.http_method || 'GET',
        body: { ...(currentAgent.protocol_config || {}), ...currentPayload, ...customBodyParams },
        prompt: userPrompt
      });

      stepOutput = {
        extractionInstruction: currentAgent.system_prompt || 'Apresente os dados retornados de forma clara.',
        apiResponse: rawApiResult
      };
    }
    // Rota 3: Especialista Cognitivo LLM
    else {
      let enabledTools: string[] = [];
      if (Array.isArray(currentAgent.tools)) enabledTools = currentAgent.tools;
      else if (typeof currentAgent.tools === 'string') {
        try {
          enabledTools = JSON.parse(currentAgent.tools || '[]');
        } catch {
          enabledTools = [];
        }
      }

      const specialistTools: OpenAI.Chat.Completions.ChatCompletionTool[] = enabledTools.map((tId: string) => {
        const cleanId = sanitizeToolName(tId);
        const conn = map.get(cleanId);
        return {
          type: 'function',
          function: {
            name: cleanId,
            description: conn?.description || `Executa a ferramenta ${conn?.name || cleanId}.`,
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Comando principal ou ticker.' },
                symbol: { type: 'string', description: 'Código do ativo.' },
                task_details: { type: 'string', description: 'Detalhes da tarefa.' }
              }
            }
          }
        };
      });

      const specialistMessages: any[] = [
        {
          role: 'system',
          content: `${currentAgent.system_prompt || `Você é o especialista ${currentAgent.name}.`}\nTools disponíveis: ${enabledTools.join(', ') || 'Nenhuma'}. Responda em linguagem natural.`
        },
        ...conversationThread.slice(-4),
        { role: 'user', content: `Pedido do Usuário: "${userPrompt}"\nContexto: ${JSON.stringify(currentPayload)}` }
      ];

      const specProvider = (currentAgent.provider || brainConfig?.provider || 'groq').toLowerCase().trim();
      const specAgentKey = limparMascaraChave(currentAgent.api_key);
      const specVaultKey = brainConfig?.saved_keys?.[specProvider] ? limparMascaraChave(brainConfig.saved_keys[specProvider]) : '';
      const effectiveKey = specAgentKey || specVaultKey || limparMascaraChave(brainConfig?.api_key) || obterChaveContingenciaEnv(specProvider);

      const llmRes: any = await chamarLLMCompativelOpenAI({
        provider: specProvider,
        model: currentAgent.model || brainConfig?.model || 'llama-3.3-70b-versatile',
        apiKey: effectiveKey,
        baseUrl: currentAgent.base_url || brainConfig?.base_url || '',
        messages: specialistMessages,
        tools: specialistTools.length > 0 ? specialistTools : undefined,
        temperature: Number(currentAgent.temperature ?? 0.2)
      });

      const specChoice = llmRes?.choices?.[0]?.message;

      if (Array.isArray(specChoice?.tool_calls) && specChoice.tool_calls.length > 0) {
        const subToolResults: any[] = [];
        for (const subCall of specChoice.tool_calls) {
          const subFn = subCall.function?.name;
          let subArgs: any = {};
          try {
            subArgs = JSON.parse(subCall.function?.arguments || '{}');
          } catch {
            subArgs = { query: promptText };
          }
          const out = await executarFerramentaVinculada(subFn, subArgs, promptText, map, serverBaseUrl);
          subToolResults.push({ tool: subFn, output: out });
        }

        const followUpRes: any = await chamarLLMCompativelOpenAI({
          provider: specProvider,
          model: currentAgent.model || brainConfig?.model || 'llama-3.3-70b-versatile',
          apiKey: effectiveKey,
          baseUrl: currentAgent.base_url || brainConfig?.base_url || '',
          messages: [
            ...specialistMessages,
            { role: 'user', content: `Resultados obtidos:\n${JSON.stringify(subToolResults)}\n\nFormule a resposta final ao usuário.` }
          ]
        });

        stepOutput = followUpRes?.choices?.[0]?.message?.content || JSON.stringify(subToolResults);
      } else {
        stepOutput = specChoice?.content || 'Processado pelo especialista.';
      }
    }

    // Persistência assíncrona de memória
    pool.query(
      `INSERT INTO specialist_context_memory (session_id, specialist_slug, context_data) VALUES ($1, $2, $3);`,
      [sessionId, currentAgent.slug, JSON.stringify({ lastInput: currentPayload, lastOutput: stepOutput })]
    ).catch(() => {});

    cadeiaExecucao.push({
      agentSlug: currentAgent.slug,
      agentName: currentAgent.name,
      agentType,
      responseInstruction: currentAgent.system_prompt || undefined,
      output: stepOutput
    });

    currentPayload = { previousAgent: currentAgent.slug, previousOutput: stepOutput, originalArgs: taskArgs };

    if (currentAgent.next_agent_slug && currentAgent.next_agent_slug !== currentAgent.slug) {
      const nextRes = await pool.query(`SELECT * FROM ai_agents WHERE slug = $1 AND is_active = true LIMIT 1;`, [currentAgent.next_agent_slug]);
      currentAgent = nextRes.rows[0] || null;
    } else {
      currentAgent = null;
    }
  }

  return cadeiaExecucao;
}

export const executeSpecialistPipeline = executarEsteiraEspecialistas;
export const executeSpecialistNode = executarEsteiraEspecialistas;
export const executeAgentChain = executarEsteiraEspecialistas;