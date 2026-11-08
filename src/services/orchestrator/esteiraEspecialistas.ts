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
    // Rota 3: Especialista Cognitivo LLM (Multi-turn Tool Calling)
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

      // Parâmetros estruturados para permitir ações completas em Gmail, Calendar, Home Assistant e APIs
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
                  action: {
                    type: 'string',
                    description: 'Ação técnica (ex: read_inbox, trash_message, send_email, list_events, create_event, turn_on, turn_off).'
                  },
                  id: {
                    type: 'string',
                    description: 'ID exato da mensagem de e-mail, compromisso ou dispositivo que deve ser manipulado/excluído.'
                  },
                  query: { type: 'string', description: 'Termo de busca, ticker ou filtro (ex: is:unread, PETR4).' },
                  symbol: { type: 'string', description: 'Código do ativo financeiro (ex: PETR4, VALE3).' },
                  to: { type: 'string', description: 'Destinatário de e-mail quando aplicável.' },
                  subject: { type: 'string', description: 'Assunto de e-mail ou compromisso.' },
                  body: { type: 'string', description: 'Corpo da mensagem ou detalhes da tarefa.' },
                  task_details: { type: 'string', description: 'Parâmetros ou detalhes adicionais da instrução.' }
                }
              }
            }
          };
        });

      const mensagensTrabalho: any[] = [
        {
          role: 'system',
          content: `${
            currentAgent.system_prompt || `Você é o agente especialista ${currentAgent.name}.`
          }\nTools autorizadas: ${
            enabledTools.join(', ') || 'Nenhuma'
          }.\nDIRETRIZ OBRIGATÓRIA: Dispare a tool call necessária para obter ou alterar dados. Ao concluir todas as ações com sucesso, responda em linguagem natural, clara e em português.`
        },
        ...conversationThread.slice(-6),
        {
          role: 'user',
          content: `Pedido do Usuário: "${userPrompt}"\nContexto: ${JSON.stringify(currentPayload)}`
        }
      ];

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
        let toolIteration = 0;
        const MAX_TOOL_ITERATIONS = 3;
        let respostaConcluida = false;

        while (toolIteration < MAX_TOOL_ITERATIONS && !respostaConcluida) {
          toolIteration++;

          const llmRes: any = await chamarLLMCompativelOpenAI({
            provider: credsSubagente.provider,
            model: credsSubagente.model,
            apiKey: credsSubagente.apiKey,
            baseUrl: credsSubagente.baseURL,
            messages: mensagensTrabalho,
            tools: specialistTools.length > 0 ? specialistTools : undefined,
            temperature: Number(currentAgent.temperature ?? 0.2)
          });

          const escolha = llmRes?.choices?.[0]?.message;

          // Se a IA gerou chamadas de ferramenta
          if (Array.isArray(escolha?.tool_calls) && escolha.tool_calls.length > 0) {
            // Anexa a decisão do assistente com os tool_calls
            mensagensTrabalho.push({
              role: 'assistant',
              content: escolha.content || '',
              tool_calls: escolha.tool_calls
            });

            for (const subCall of escolha.tool_calls) {
              const subFn = sanitizeToolName(subCall.function?.name);
              let subArgs: any = {};
              try {
                subArgs = JSON.parse(subCall.function?.arguments || '{}');
              } catch {
                subArgs = { query: promptText };
              }

              const mergedArgs = {
                ...taskArgs,
                ...subArgs,
                action: subArgs.action || taskArgs?.action,
                id: subArgs.id || subArgs.messageId || taskArgs?.id || taskArgs?.messageId,
                query: subArgs.query || subArgs.symbol || taskArgs?.query || taskArgs?.symbol || promptText,
                symbol: subArgs.symbol || taskArgs?.symbol || subArgs.query,
                to: subArgs.to || taskArgs?.to,
                subject: subArgs.subject || taskArgs?.subject,
                body: subArgs.body || taskArgs?.body
              };

              let saida: any;
              try {
                saida = await executarFerramentaVinculada(
                  subFn,
                  mergedArgs,
                  userPrompt || promptText,
                  map,
                  serverBaseUrl
                );
              } catch (err: any) {
                saida = { error: err.message, tool: subFn };
              }

              // Padrão universal OpenAI/Groq: cada tool_call deve ser respondida com role: 'tool'
              mensagensTrabalho.push({
                role: 'tool',
                tool_call_id: subCall.id || `call_${Date.now()}`,
                content: typeof saida === 'string' ? saida : JSON.stringify(saida)
              });
            }
          } else {
            // A IA respondeu em texto final
            stepOutput = escolha?.content?.trim() || 'Ação concluída com sucesso pelo especialista.';
            respostaConcluida = true;
          }
        }

        // Se o loop esgotou as iterações sem texto, realiza uma última síntese
        if (!stepOutput) {
          const finalSynth: any = await chamarLLMCompativelOpenAI({
            provider: credsSubagente.provider,
            model: credsSubagente.model,
            apiKey: credsSubagente.apiKey,
            baseUrl: credsSubagente.baseURL,
            messages: [
              ...mensagensTrabalho,
              {
                role: 'user',
                content: 'Formule agora a resposta final ao usuário em português com base nas ações já executadas.'
              }
            ],
            temperature: 0.2
          });
          stepOutput = finalSynth?.choices?.[0]?.message?.content?.trim() || 'Operação concluída com sucesso pelo especialista.';
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
