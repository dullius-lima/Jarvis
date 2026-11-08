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
  resolveProviderCredentials,
  sanitizeToolName
} from './brainConfigAndUtils.js';
import { chamarLLMCompativelOpenAI, limparMascaraChave, obterChaveContingenciaEnv } from './motorInferencaLLM.js';
import { executarFerramentaVinculada } from './executorFerramentasFixas.js';

/**
 * Localiza um conector no mapa de forma tolerante a hífens, underlines e caixa alta/baixa
 */
function buscarConectorResiliente(toolId: string, map: Map<string, any>): any | undefined {
  if (!toolId || !map) return undefined;
  const cleanId = sanitizeToolName(toolId);
  if (map.has(cleanId)) return map.get(cleanId);
  if (map.has(toolId)) return map.get(toolId);

  const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const alvo = norm(toolId);
  for (const [k, v] of map.entries()) {
    if (norm(k) === alvo || norm(v?.name) === alvo) {
      return v;
    }
  }
  return undefined;
}

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

    // Rota 1: Script de Código Determinístico (Zero Tokens)
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
      if (Array.isArray(currentAgent.tools)) {
        enabledTools = currentAgent.tools;
      } else if (typeof currentAgent.tools === 'string') {
        try {
          enabledTools = JSON.parse(currentAgent.tools || '[]');
        } catch {
          enabledTools = [];
        }
      }

      const specialistTools: OpenAI.Chat.Completions.ChatCompletionTool[] = enabledTools
        .filter((tId: string) => Boolean(tId && String(tId).trim()))
        .map((tId: string) => {
          const cleanId = sanitizeToolName(tId);
          const conn = buscarConectorResiliente(tId, map);
          return {
            type: 'function',
            function: {
              name: cleanId,
              description: conn?.description || `Executa a ferramenta ${conn?.name || cleanId}.`,
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Comando principal, termo de busca ou ticker.' },
                  symbol: { type: 'string', description: 'Código do ativo financeiro (ex: PETR4, VALE3).' },
                  task_details: { type: 'string', description: 'Detalhes ou parâmetros adicionais da tarefa.' }
                }
              }
            }
          };
        });

      const specialistMessages: any[] = [
        {
          role: 'system',
          content: `${
            currentAgent.system_prompt || `Você é o agente especialista ${currentAgent.name}.`
          }\nTools vinculadas a você: ${
            enabledTools.join(', ') || 'Nenhuma'
          }.\nDIRETRIZ TÉCNICA: Se precisar de dados externos e houver uma Tool vinculada, acione-a imediatamente. Ao responder ao usuário, seja claro, preciso, natural e fale em português, sem expor estruturas internas de JSON.`
        },
        ...conversationThread.slice(-6),
        {
          role: 'user',
          content: `Pedido do Usuário: "${userPrompt}"\nParâmetros Recebidos do Orquestrador: ${JSON.stringify(
            currentPayload
          )}`
        }
      ];

      // Provedor, Modelo e Chave PRÓPRIOS do subagente (com fallback para o cofre do cérebro)
      const specProvider = (currentAgent.provider || brainConfig?.provider || 'groq').toLowerCase().trim();
      const specAgentKey = limparMascaraChave(currentAgent.api_key);
      const specVaultKey = brainConfig?.saved_keys?.[specProvider]
        ? limparMascaraChave(brainConfig.saved_keys[specProvider])
        : '';
      const fallbackBrainKey =
        specProvider === (brainConfig?.provider || '').toLowerCase().trim()
          ? limparMascaraChave(brainConfig?.api_key)
          : '';
      const effectiveKey =
        specAgentKey || specVaultKey || fallbackBrainKey || obterChaveContingenciaEnv(specProvider);

      const credsSubagente = resolveProviderCredentials(
        specProvider,
        effectiveKey,
        currentAgent.base_url,
        currentAgent.model
      );

      try {
        const llmRes: any = await chamarLLMCompativelOpenAI({
          provider: credsSubagente.provider,
          model: credsSubagente.model,
          apiKey: credsSubagente.apiKey,
          baseUrl: credsSubagente.baseURL,
          messages: specialistMessages,
          tools: specialistTools.length > 0 ? specialistTools : undefined,
          temperature: Number(currentAgent.temperature ?? 0.2)
        });

        const specChoice = llmRes?.choices?.[0]?.message;

        if (Array.isArray(specChoice?.tool_calls) && specChoice.tool_calls.length > 0) {
          const subToolResults: any[] = [];
          for (const subCall of specChoice.tool_calls) {
            const subFn = sanitizeToolName(subCall.function?.name);
            let subArgs: any = {};
            try {
              subArgs = JSON.parse(subCall.function?.arguments || '{}');
            } catch {
              subArgs = { query: promptText };
            }

            // Preserva ticker/query extraído pelo JARVIS caso a subchamada venha incompleta
            const mergedSubArgs = {
              ...taskArgs,
              ...subArgs,
              query: subArgs.query || subArgs.symbol || taskArgs?.query || taskArgs?.symbol || promptText,
              symbol: subArgs.symbol || taskArgs?.symbol || subArgs.query
            };

            const out = await executarFerramentaVinculada(
              subFn,
              mergedSubArgs,
              userPrompt || promptText,
              map,
              serverBaseUrl
            );
            subToolResults.push({ tool: subFn, output: out });
          }

          const followUpRes: any = await chamarLLMCompativelOpenAI({
            provider: credsSubagente.provider,
            model: credsSubagente.model,
            apiKey: credsSubagente.apiKey,
            baseUrl: credsSubagente.baseURL,
            messages: [
              ...specialistMessages,
              {
                role: 'system',
                content:
                  'ETAPA DE SÍNTESE DO ESPECIALISTA: Os dados reais das ferramentas já foram coletados abaixo. Formule a resposta final completa em português, de forma clara, humana e bem estruturada, sem blocos JSON soltos.'
              },
              {
                role: 'user',
                content: `Resultados reais retornados pelas ferramentas:\n${JSON.stringify(
                  subToolResults,
                  null,
                  2
                )}\n\nCom base nesses dados, responda ao pedido original: "${userPrompt}"`
              }
            ],
            temperature: Number(currentAgent.temperature ?? 0.2)
          });

          stepOutput =
            followUpRes?.choices?.[0]?.message?.content?.trim() || JSON.stringify(subToolResults);
        } else {
          stepOutput = specChoice?.content?.trim() || 'Análise concluída pelo especialista.';
        }
      } catch (llmErr: any) {
        console.error(`❌ [Esteira Especialistas] Erro no subagente ${currentAgent.slug}:`, llmErr?.message);
        stepOutput = {
          error: `Falha na execução cognitiva do especialista ${currentAgent.name}: ${llmErr?.message}`
        };
      }
    }

    // Persistência assíncrona de memória do especialista
    pool
      .query(
        `INSERT INTO specialist_context_memory (session_id, specialist_slug, context_data) VALUES ($1, $2, $3);`,
        [sessionId, currentAgent.slug, JSON.stringify({ lastInput: currentPayload, lastOutput: stepOutput })]
      )
      .catch(() => {});

    cadeiaExecucao.push({
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

    if (currentAgent.next_agent_slug && currentAgent.next_agent_slug !== currentAgent.slug) {
      const nextRes = await pool
        .query(`SELECT * FROM ai_agents WHERE slug = $1 AND is_active = true LIMIT 1;`, [
          currentAgent.next_agent_slug
        ])
        .catch(() => ({ rows: [] as any[] }));
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
