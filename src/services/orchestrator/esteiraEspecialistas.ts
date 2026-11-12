// src/services/orchestrator/esteiraEspecialistas.ts
import { pool } from '../../config/database.js';
import OpenAI from 'openai';
import { emitBrainLinkEvent } from '../brainSocketService.js';
import { getEnvRegisteredPort } from '../../controllers/brainConfigController.js';
import { executeProtocolOrIntegration } from '../integrationAndProtocolService.js';
import { extractJsonActionBlocks } from '../jsonActionInterceptor.js';
import {
  SupportedProtocolOrPlatform,
  interpolateApiTemplate,
  resolveDynamicUrl,
  resolveProviderCredentials,
  sanitizeToolName
} from './brainConfigAndUtils.js';
import {
  chamarLLMCompativelOpenAI,
  limparMascaraChave,
  obterChaveContingenciaEnv
} from './motorInferencaLLM.js';
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
    executedTools?: string[];
  }> = [];

  const map = connectorsMap || new Map<string, any>();

  while (currentAgent && hopCount < MAX_HOPS) {
    hopCount++;

    try {
      emitBrainLinkEvent({
        axon_id: `axon_${currentAgent.slug}`,
        source_dendrite:
          hopCount === 1 ? 'jarvis_core' : cadeiaExecucao[cadeiaExecucao.length - 1].agentSlug,
        target_dendrite: currentAgent.slug,
        direction: 'FORWARD',
        neurotransmitter_type: 'ADRENALINA',
        intensity: 0.95,
        metadata: { agentName: currentAgent.name, hop: hopCount }
      } as any);
    } catch {}

    let stepOutput: any = null;
    const resultadosBrutosFerramentas: any[] = [];
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
          customBodyParams = JSON.parse(
            interpolateApiTemplate(String(bodyTemplate), userPrompt, currentPayload)
          );
        } catch {
          customBodyParams = { raw_payload: bodyTemplate };
        }
      }

      const rawApiResult = await executeProtocolOrIntegration(currentAgent, {
        protocol: 'rest_api' as SupportedProtocolOrPlatform,
        endpoint: targetUrl,
        method: currentAgent.http_method || 'GET',
        body: {
          ...(currentAgent.protocol_config || {}),
          ...currentPayload,
          ...customBodyParams
        },
        prompt: userPrompt
      });

      stepOutput = {
        extractionInstruction:
          currentAgent.system_prompt || 'Apresente os dados retornados de forma clara.',
        apiResponse: rawApiResult
      };
    }
    // Rota 3: Especialista Cognitivo LLM (Multi-turn Tool Calling com Contrato Universal)
    else {
      // 1. Busca memória técnica anterior deste especialista e contatos da agenda no banco
      const [specMemRes, agendaRes] = await Promise.all([
        pool
          .query(
            `SELECT context_data FROM specialist_context_memory 
             WHERE session_id = $1 AND specialist_slug = $2 
             ORDER BY id DESC LIMIT 5;`,
            [sessionId, currentAgent.slug]
          )
          .catch(() => ({ rows: [] as any[] })),
        pool
          .query(`SELECT nome, telefone, apelidos FROM contatos_agenda ORDER BY nome ASC;`)
          .catch(() => ({ rows: [] as any[] }))
      ]);

      const resumoContatosSubagente = agendaRes.rows
        .map((c: any) => `${c.nome}: ${c.telefone} (${(c.apelidos || []).join(', ')})`)
        .join(' | ');

      const resumoMemoriaTecnica = specMemRes.rows
        .reverse()
        .map((r: any) => JSON.stringify(r.context_data))
        .join('\n');

      const contextoEnriquecidoSubagente = [
        currentAgent.system_prompt || `Você é o especialista ${currentAgent.name}.`,
        resumoContatosSubagente ? `\n[CONTATOS SALVOS NO BANCO]: ${resumoContatosSubagente}` : '',
        resumoMemoriaTecnica ? `\n[SUAS ÚLTIMAS EXECUÇÕES NESTA SESSÃO]:\n${resumoMemoriaTecnica}` : ''
      ].join('\n');

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

      const specialistTools: OpenAI.Chat.Completions.ChatCompletionTool[] = enabledTools.map(
        (tId: string) => {
          const cleanId = sanitizeToolName(tId);
          const conn = buscarConectorResiliente(tId, map);
          return {
            type: 'function',
            function: {
              name: cleanId,
              description:
                conn?.description ||
                `Executa a ferramenta ou integração ${conn?.name || cleanId}.`,
              parameters: {
                type: 'object',
                properties: {
                  entity_id: {
                    type: 'string',
                    description:
                      'ID da entidade ou múltiplos IDs separados por vírgula (ex: "switch.luz_1_switch_1, switch.luz_2_switch_1" ou "climate.casal_ar_condicionado_do_quarto").'
                  },
                  domain: {
                    type: 'string',
                    description:
                      'Domínio Home Assistant quando aplicável (ex: "climate", "switch", "light", "homeassistant", "vacuum").'
                  },
                  service: {
                    type: 'string',
                    description:
                      'Serviço ou ação a executar (ex: "turn_on", "turn_off", "toggle", "set_temperature", "set_hvac_mode", "set_fan_mode", "set_swing_mode").'
                  },
                  temperature: {
                    type: 'number',
                    description: 'Temperatura alvo em graus Celsius (ex: 22, 23).'
                  },
                  hvac_mode: {
                    type: 'string',
                    description:
                      'Modo de climatização: "cool", "heat", "fan_only", "dry", "auto", "off".'
                  },
                  fan_mode: {
                    type: 'string',
                    description: 'Velocidade do ventilador: "low", "medium", "high", "auto", "quiet".'
                  },
                  swing_mode: {
                    type: 'string',
                    description:
                      'Direção/oscilação do vento: "on", "off", "vertical", "horizontal", "both".'
                  },
                  preset_mode: {
                    type: 'string',
                    description: 'Perfil pré-definido: "eco", "comfort", "boost", "sleep", "away".'
                  },
                  service_data: {
                    type: 'object',
                    description:
                      'Objeto JSON livre com parâmetros adicionais do serviço ou lista de entity_id.'
                  },
                  action: {
                    type: 'string',
                    description:
                      'Ação para conectores (ex: "read_inbox", "send_email", "trash_message", "list_events", "create_event", "list_files", "upload_file").'
                  },
                  query: {
                    type: 'string',
                    description: 'Filtro de busca, comando ou parâmetro textual.'
                  },
                  symbol: {
                    type: 'string',
                    description: 'Ticker de ativo financeiro quando aplicável (ex: PETR4, VALE3).'
                  },
                  endpointPath: {
                    type: 'string',
                    description: 'Caminho de endpoint da API quando aplicável.'
                  },
                  method: {
                    type: 'string',
                    description: 'Método HTTP (GET, POST, PUT, DELETE).'
                  },
                  params: {
                    type: 'object',
                    description: 'Objeto com parâmetros extras para envio de e-mail, agenda, WhatsApp ou API.'
                  },
                  number: {
                    type: 'string',
                    description: 'Número de telefone com DDI e DDD para envio de WhatsApp (ex: 556791289607).'
                  },
                  text: {
                    type: 'string',
                    description: 'Texto completo da mensagem a ser enviada via WhatsApp.'
                  },
                  endpoint: {
                    type: 'string',
                    description: 'URL completa customizada para rotas específicas de API (ex: Finnhub /stock/metric ou /company-news).'
                  },
                  collectionName: {
                    type: 'string',
                    description: 'Nome da coleção no PostgreSQL em minúsculas e underscore (ex: ativo_aapl, ativo_petr4).'
                  },
                  documentData: {
                    type: 'object',
                    description: 'Objeto JSON com os dados estruturados do ativo para salvar no banco.'
                  }
                }
              }
            }
          };
        }
      );

      // Resolução isolada de credenciais do Especialista com fallback para o Cérebro
      const provAgente = (
        currentAgent.provider ||
        brainConfig?.provider ||
        'groq'
      ).toLowerCase();
      const modeloAgente =
        currentAgent.model || brainConfig?.model || 'llama-3.3-70b-versatile';
      const chaveAgente =
        limparMascaraChave(currentAgent.api_key) ||
        limparMascaraChave(brainConfig?.saved_keys?.[provAgente]) ||
        limparMascaraChave(brainConfig?.api_key) ||
        obterChaveContingenciaEnv(provAgente);

      const credenciaisResolvidas = resolveProviderCredentials(
        provAgente,
        chaveAgente,
        currentAgent.base_url || brainConfig?.base_url || '',
        modeloAgente
      );

      const mensagensEspecialista: any[] = [
        {
          role: 'system',
          content: `${contextoEnriquecidoSubagente}

REGRAS TÉCNICAS DE EXECUÇÃO DE FERRAMENTAS:
1. Você possui acesso direto às ferramentas: [${enabledTools.join(', ')}].
2. Se a tarefa envolver envio de mensagens, ligações ou lembretes, consulte o bloco [CONTATOS SALVOS NO BANCO] acima para obter o número de telefone correto antes de acionar a ferramenta.
3. Para acionar mais de uma lâmpada ou dispositivo no mesmo cômodo, envie ambos os IDs separados por vírgula em "entity_id" ou realize chamadas separadas.
4. Para alterar temperatura do ar-condicionado, passe "entity_id" e "temperature" (número). Para modo, passe "hvac_mode". Para vento, passe "fan_mode" ou "swing_mode".
5. NUNCA exiba código JSON cru na resposta final ao usuário. Responda sempre em português natural, claro e direto.`
        },
        ...conversationThread.slice(-4),
        {
          role: 'user',
          content: `Solicitação do usuário: "${userPrompt}"\nDetalhes da tarefa: ${
            typeof promptText === 'string' ? promptText : JSON.stringify(promptText)
          }`
        }
      ];

      // Loop Multi-Turno (até 5 turnos) para permitir: Consultar Sensor -> Executar Ação -> Auditar Estado
      const MAX_TOOL_TURNS = 5;
      let turnoAtual = 0;
      let respostaTextualEspecialista = '';

      while (turnoAtual < MAX_TOOL_TURNS) {
        turnoAtual++;

        const specCompletion: any = await chamarLLMCompativelOpenAI({
          provider: credenciaisResolvidas.provider,
          model: credenciaisResolvidas.model,
          apiKey: credenciaisResolvidas.apiKey,
          baseUrl: credenciaisResolvidas.baseUrl,
          messages: mensagensEspecialista,
          tools: specialistTools.length > 0 ? specialistTools : undefined,
          temperature: Number(currentAgent.temperature ?? 0.2)
        });

        const specChoice = specCompletion?.choices?.[0]?.message;
        if (!specChoice) break;

        const toolCallsRecebidas = Array.isArray(specChoice.tool_calls)
          ? specChoice.tool_calls
          : [];

        // Se a IA gerou Tool Calls nativas
        if (toolCallsRecebidas.length > 0) {
          mensagensEspecialista.push({
            role: 'assistant',
            content: specChoice.content || '',
            tool_calls: toolCallsRecebidas
          });

          for (const tc of toolCallsRecebidas) {
            const fnName = sanitizeToolName(tc.function?.name || '');
            let fnArgs: Record<string, any> = {};
            try {
              fnArgs = JSON.parse(tc.function?.arguments || '{}');
            } catch {
              fnArgs = { query: tc.function?.arguments || userPrompt };
            }

            // Emite pulso direto do Subagente para a Tool ESPECÍFICA em execução
            try {
              emitBrainLinkEvent({
                axon_id: `axon_${currentAgent.slug}_${fnName}`,
                source_dendrite: currentAgent.slug,
                target_dendrite: fnName,
                source: currentAgent.slug,
                target: fnName,
                direction: 'FORWARD',
                neurotransmitter_type: 'ACETILCOLINA',
                intensity: 1.0,
                metadata: { agentSlug: currentAgent.slug, toolName: fnName, status: 'executing' }
              } as any);
            } catch {}

            const resultadoTool = await executarFerramentaVinculada(
              fnName,
              fnArgs,
              userPrompt,
              map,
              serverBaseUrl
            );

            resultadosBrutosFerramentas.push({
              tool: fnName,
              args: fnArgs,
              result: resultadoTool
            });

            mensagensEspecialista.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: fnName,
              content: JSON.stringify(resultadoTool)
            });
          }
          continue;
        }

        // Fallback: se o modelo escreveu um bloco JSON em texto tentando invocar uma tool
        const textoConteudo = String(specChoice.content || '').trim();
        const blocosJson = extractJsonActionBlocks(textoConteudo);
        if (blocosJson.length > 0 && enabledTools.length > 0 && turnoAtual === 1) {
          for (const bloco of blocosJson) {
            const toolAlvo = sanitizeToolName(
              bloco.slug || bloco.tool || bloco.name || enabledTools[0]
            );
            const argsBloco = bloco.payload || bloco.params || bloco.arguments || bloco;

            try {
              emitBrainLinkEvent({
                axon_id: `axon_${currentAgent.slug}_${toolAlvo}`,
                source_dendrite: currentAgent.slug,
                target_dendrite: toolAlvo,
                source: currentAgent.slug,
                target: toolAlvo,
                direction: 'FORWARD',
                neurotransmitter_type: 'ACETILCOLINA',
                intensity: 1.0,
                metadata: { agentSlug: currentAgent.slug, toolName: toolAlvo, status: 'executing' }
              } as any);
            } catch {}

            const resFallback = await executarFerramentaVinculada(
              toolAlvo,
              argsBloco,
              userPrompt,
              map,
              serverBaseUrl
            );
            resultadosBrutosFerramentas.push({
              tool: toolAlvo,
              args: argsBloco,
              result: resFallback
            });
          }

          mensagensEspecialista.push({
            role: 'assistant',
            content: textoConteudo
          });
          mensagensEspecialista.push({
            role: 'user',
            content: `[SISTEMA - RESULTADO REAL DAS FERRAMENTAS EXECUTADAS]:\n${JSON.stringify(
              resultadosBrutosFerramentas
            )}\n\nResponda agora ao usuário em linguagem natural e direta (sem JSON), confirmando o resultado.`
          });
          continue;
        }

        respostaTextualEspecialista = textoConteudo;
        break;
      }

      // Caso o limite de turnos tenha encerrado logo após uma tool call sem síntese final
      if (!respostaTextualEspecialista && resultadosBrutosFerramentas.length > 0) {
        const sinteseFinal: any = await chamarLLMCompativelOpenAI({
          provider: credenciaisResolvidas.provider,
          model: credenciaisResolvidas.model,
          apiKey: credenciaisResolvidas.apiKey,
          baseUrl: credenciaisResolvidas.baseUrl,
          messages: [
            ...mensagensEspecialista,
            {
              role: 'user',
              content:
                'Com base nos resultados das ferramentas acima, dê a resposta final curta e natural ao usuário.'
            }
          ],
          temperature: 0.2
        }).catch(() => null);

        respostaTextualEspecialista =
          sinteseFinal?.choices?.[0]?.message?.content?.trim() ||
          JSON.stringify(resultadosBrutosFerramentas);
      }

      stepOutput = respostaTextualEspecialista || resultadosBrutosFerramentas;
    }

    // Persistência de contexto técnico do especialista para continuidade nas próximas mensagens
    pool
      .query(
        `INSERT INTO specialist_context_memory (session_id, specialist_slug, context_data) VALUES ($1, $2, $3);`,
        [sessionId, currentAgent.slug, JSON.stringify({ lastInput: currentPayload, lastOutput: stepOutput })]
      )
      .catch(() => {});

    // [NOVO] Extrai a lista única das ferramentas que foram efetivamente executadas neste ciclo
    const executedTools = Array.from(new Set(resultadosBrutosFerramentas.map((r) => r.tool)));

    cadeiaExecucao.push({
      agentSlug: currentAgent.slug,
      agentName: currentAgent.name,
      agentType: currentAgent.agent_type || 'llm',
      responseInstruction: currentAgent.system_prompt,
      output: stepOutput,
      executedTools
    });

    try {
      emitBrainLinkEvent({
        axon_id: `axon_${currentAgent.slug}_return`,
        source_dendrite: currentAgent.slug,
        target_dendrite: 'jarvis_core',
        direction: 'BACKWARD',
        neurotransmitter_type: 'DOPAMINA',
        intensity: 0.9,
        metadata: { agentName: currentAgent.name, completed: true }
      } as any);
    } catch {}

    // Verifica se há encadeamento sequencial (next_agent_slug)
    const nextSlug = (currentAgent.next_agent_slug || '').trim();
    if (nextSlug && nextSlug.toLowerCase() !== currentAgent.slug.toLowerCase()) {
      const nextRes = await pool
        .query(`SELECT * FROM ai_agents WHERE LOWER(slug) = LOWER($1) AND is_active = true LIMIT 1;`, [
          nextSlug
        ])
        .catch(() => ({ rows: [] as any[] }));

      if (nextRes.rows.length > 0) {
        currentAgent = nextRes.rows[0];
        currentPayload = {
          previousAgent: cadeiaExecucao[cadeiaExecucao.length - 1].agentSlug,
          previousOutput: stepOutput,
          task_details: typeof stepOutput === 'string' ? stepOutput : JSON.stringify(stepOutput),
          userPrompt
        };
        continue;
      }
    }

    currentAgent = null;
  }

  return cadeiaExecucao;
}

export const executeSpecialistPipeline = executarEsteiraEspecialistas;
export const executeSpecialistNode = executarEsteiraEspecialistas;
export const executeAgentChain = executarEsteiraEspecialistas;

export default {
  executarEsteiraEspecialistas,
  executeSpecialistPipeline,
  executeSpecialistNode,
  executeAgentChain
};
