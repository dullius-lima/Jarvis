// src/services/orchestratorService.ts
import { pool } from '../config/database.js';
import { searchVectorDocuments, ingestDocumentToRag } from './ragService.js';
import { emitBrainLinkEvent, emitNeuroPulse } from './brainSocketService.js';
import { executeProtocolOrIntegration } from './integrationAndProtocolService.js';
import { executeSshCommand, readRemoteFileViaSshToRag } from './sshService.js';
import { dispatchErrorTrigger } from './errorTriggerService.js';
import { appendShortTermMemory } from './shortTermMemoryService.js';
import { interceptAndExecuteTextActions } from './jsonActionInterceptor.js';

import {
  SupportedProtocolOrPlatform,
  ExternalProvider,
  SensoryAttachments,
  SensorPayload,
  DynamicToolCatalogItem,
  ensureOrchestratorSchema,
  sanitizeToolName,
  resolveDynamicUrl,
  interpolateApiTemplate,
  resolveProviderCredentials,
  getCentralBrainConfig,
  getJarvisConfig,
  createLLMClient
} from './orchestrator/brainConfigAndUtils.js';

import {
  saveToDatabase,
  getDynamicToolsCatalog
} from './orchestrator/catalogAndDatabase.js';

import {
  createOrUpdateToolFromBrain,
  deleteToolConnectorFromBrain,
  createOrUpdateAgentFromBrain,
  updateAgentOrJarvisPersona,
  executeHackerSecuritySuite
} from './orchestrator/brainMetaTools.js';

import {
  callOpenAICompatibleLLM,
  executeBoundTool,
  executeSpecialistPipeline,
  executeSpecialistNode,
  executeAgentChain
} from './orchestrator/llmAndPipelineRunner.js';

// Reexporta tudo para manter 100% de compatibilidade com os Controllers
export type {
  SupportedProtocolOrPlatform,
  ExternalProvider,
  SensoryAttachments,
  SensorPayload,
  DynamicToolCatalogItem
};

export {
  sanitizeToolName,
  resolveDynamicUrl,
  interpolateApiTemplate,
  resolveProviderCredentials,
  getCentralBrainConfig,
  getJarvisConfig,
  createLLMClient,
  saveToDatabase,
  getDynamicToolsCatalog,
  createOrUpdateToolFromBrain,
  deleteToolConnectorFromBrain,
  createOrUpdateAgentFromBrain,
  updateAgentOrJarvisPersona,
  executeHackerSecuritySuite,
  executeSpecialistPipeline,
  executeSpecialistNode,
  executeAgentChain
};

// ============================================================================
// FLUXO PRINCIPAL DO ORQUESTRADOR CENTRAL (JARVIS)
// ============================================================================

export async function processWorkflowExecution(
  identityToken: string,
  userPrompt: string,
  sessionId = `sess_${Date.now()}`,
  sensoryInput?: SensorPayload | SensoryAttachments | any
) {
  const startTime = Date.now();
  let brainConfig: any;
  let historyRowsCount = 0;

  try {
    await ensureOrchestratorSchema();
    brainConfig = await getCentralBrainConfig();
    const dynamicServerBaseUrl = brainConfig.server_base_url;

    // Geração do contexto temporal em tempo real com fuso horário local
    const now = new Date();
    const currentTimestampContext = `\n[CONTEXTO TEMPORAL ACTUAL DO SISTEMA]:
- Data e Hora Actual do Servidor: ${now.toLocaleString('pt-BR', { timeZone: 'America/Campo_Grande' })}
- ISO 8601: ${now.toISOString()}
- Fuso Horário Local: America/Campo_Grande (UTC-4)`;

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
      .catch(() => ({ rows: [] as any[] }));

    historyRowsCount = historyRes.rows.length;
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
      .catch(() => ({ rows: [] as any[] }));
    const activeAgents = agentsRes.rows;

    const { catalog: liveToolsCatalog, connectorsMap } = await getDynamicToolsCatalog();
    const validToolSlugs = liveToolsCatalog.map((t) => t.slug);

    const liveToolsSummary =
      liveToolsCatalog.length > 0
        ? liveToolsCatalog
            .map(
              (t) =>
                `- slug: "${t.slug}" | Nome: "${t.name}" | Método: ${t.method}${
                  t.endpoint ? ` | Endpoint: ${t.endpoint}` : ''
                } | Uso: ${t.description}`
            )
            .join('\n')
        : 'Nenhuma tool cadastrada no momento.';

    const existingAgentsSummary =
      activeAgents.length > 0
        ? activeAgents
            .map(
              (a: any) =>
                `- Nome: "${a.name}" | Slug: "${sanitizeToolName(a.slug)}" | Modo: ${(
                  a.agent_type || 'llm'
                ).toUpperCase()} | Tools: ${JSON.stringify(a.tools || [])} | Gatilho: ${
                  a.description || ''
                }`
            )
            .join('\n')
        : 'Nenhum especialista cadastrado.';

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
                description: 'Ticker ou código da ação/ativo (ex: PETR4, WEGE3).'
              },
              query: {
                type: 'string',
                description: 'Parâmetro de pesquisa, cálculo ou filtro.'
              }
            },
            required: ['task_details']
          }
        }
      };
    });

    tools.push(
      {
        type: 'function',
        function: {
          name: 'create_or_update_tool_connector',
          description:
            'Cria ou atualiza uma Tool / Conexão (API HTTP, Webhook, Servidor MCP, Script JS ou SSH) no catálogo dinâmico.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              provider_key: { type: 'string' },
              tool_type: { type: 'string', enum: ['http', 'mcp', 'code', 'ssh'] },
              http_method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
              endpoint_url: { type: 'string' },
              description: { type: 'string' },
              icon: { type: 'string' },
              auth_token: { type: 'string' },
              payload_template: { type: 'string' },
              code_snippet: { type: 'string' }
            },
            required: ['name']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'delete_tool_connector',
          description: 'Exclui permanentemente uma Tool / Conexão e a desvincula dos agentes.',
          parameters: {
            type: 'object',
            properties: {
              provider_key: {
                type: 'string',
                description: `Slug da conexão. Catálogo: [${validToolSlugs.join(', ')}]`
              }
            },
            required: ['provider_key']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'create_or_update_ai_agent',
          description:
            'Cria um novo Subagente Especialista ou EDITA um existente (mesmo slug). Prefira agent_type="code" ou "api" para economizar tokens.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              slug: { type: 'string' },
              agent_type: { type: 'string', enum: ['code', 'api', 'mcp', 'llm'] },
              description: { type: 'string' },
              code_snippet: { type: 'string' },
              http_method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
              endpoint_url: { type: 'string' },
              auth_token: { type: 'string' },
              payload_template: { type: 'string' },
              system_prompt: { type: 'string' },
              append_behavior_rule: { type: 'string' },
              icon: { type: 'string' },
              tools: { type: 'array', items: { type: 'string' } },
              replace_tools: { type: 'boolean' },
              next_agent_slug: { type: 'string' },
              cron_expression: { type: 'string' },
              execute_immediately: { type: 'boolean' }
            },
            required: ['name', 'slug', 'agent_type', 'description']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'update_persona_and_behavior',
          description:
            'Atualiza o jeito de falar, personalidade ou regra permanente no system_prompt do JARVIS ou de um Especialista.',
          parameters: {
            type: 'object',
            properties: {
              target_slug: { type: 'string' },
              behavior_instruction: { type: 'string' },
              replace_entire_prompt: { type: 'boolean' }
            },
            required: ['target_slug', 'behavior_instruction']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'hacker_sec_agent',
          description: 'Audita vulnerabilidades (red_team_audit), logs (self_healing_debug) ou URLs (api_probe).',
          parameters: {
            type: 'object',
            properties: {
              mode: { type: 'string', enum: ['red_team_audit', 'self_healing_debug', 'api_probe'] },
              target_slug: { type: 'string' },
              target_url: { type: 'string' }
            },
            required: ['mode']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'save_to_database',
          description: 'Salva eventos ou documentos no PostgreSQL.',
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
      },
      {
        type: 'function',
        function: {
          name: 'execute_external_integration',
          description: 'Executa ações em WhatsApp, Google Workspace, Outlook, REST API, MCP, etc.',
          parameters: {
            type: 'object',
            properties: {
              provider: { type: 'string' },
              action: { type: 'string' },
              endpoint: { type: 'string' },
              params: { type: 'object' }
            },
            required: ['provider']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'execute_ssh_command',
          description: 'Executa comando remoto via SSH ou indexa arquivo no RAG.',
          parameters: {
            type: 'object',
            properties: {
              command: { type: 'string' },
              remoteFilePath: { type: 'string' }
            }
          }
        }
      }
    );

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

    const isVisualQuestion =
      /est[aá]\s+me\s+vendo|t[aá]\s+me\s+vendo|consegue\s+me\s+ver|voc[eê]\s+me\s+v[eê]|ative\s+a\s+c[aâ]mera|olhe\s+para\s+mim|como\s+eu\s+estou|o\s+que\s+estou\s+segurando|olhe\s+minha\s+tela/i.test(
        userPrompt
      );

    if (isVisualQuestion && !frameToUse) {
      const noCamReply =
        'Ainda não estou recebendo o sinal de vídeo da sua câmera, senhor. Permita o acesso à câmera no navegador ou clique no ícone da câmera na barra inferior para que eu possa vê-lo.';
      return {
        success: true,
        triggeredSuccess: true,
        agent: 'JARVIS (Córtex Visual)',
        agentId: 'jarvis_vision',
        nodeType: 'core',
        memoryStored: false,
        memoryCount: historyRowsCount,
        identity: identityToken,
        sessionId,
        response: noCamReply,
        executionTimeMs: Date.now() - startTime
      };
    }

    let userMessageContent: any = userPrompt;
    let visionSystemInstruction = '';

    if (frameToUse) {
      const formattedUrl = frameToUse.startsWith('data:')
        ? frameToUse
        : `data:image/jpeg;base64,${frameToUse.replace(/^data:image\/\w+;base64,/, '')}`;

      const sourceLabel = rawWebcam ? 'WEBCAM (Rosto/Ambiente do Usuário)' : 'TELA DO COMPUTADOR';
      visionSystemInstruction = `\n\n[SINAL DE VÍDEO ATIVO - ${sourceLabel}]: Você está enxergando o usuário (${identityToken}) neste exato momento através da imagem anexada. Descreva de forma natural e direta o que você vê na imagem.`;

      userMessageContent = [
        {
          type: 'text',
          text: `${userPrompt}\n(Nota do Sistema: Analise a imagem real capturada pela ${sourceLabel} anexada nesta mensagem.)`
        },
        { type: 'image_url', image_url: { url: formattedUrl } }
      ];
    }

    const messages: any[] = [
      {
        role: 'system',
        content: `${brainConfig.system_prompt}
${currentTimestampContext}
Identidade Autenticada: ${identityToken}
URL Base do Servidor: ${dynamicServerBaseUrl}${visionSystemInstruction}

--- CATÁLOGO DINÂMICO DE TOOLS / CONEXÕES DISPONÍVEIS ---
${liveToolsSummary}

REGRAS OBRIGATÓRIAS DE EXECUÇÃO:
1. NUNCA escreva blocos de código JSON (como {"action": "invoke_ai_agent"}) na resposta de texto para o usuário.
2. Sempre que precisar consultar cotações, APIs ou especialistas, acione obrigatoriamente a Tool Call nativa correspondente na lista de tools usando exatamente o Slug listado em AGENTES ESPECIALISTAS ATIVOS.

--- AGENTES ESPECIALISTAS ATIVOS ---

${existingAgentsSummary}

--- CATÁLOGO DINÂMICO DE TOOLS / CONEXÕES DISPONÍVEIS ---
${liveToolsSummary}
${ragContextText ? `\n--- MEMÓRIA VETORIAL (RAG) ---\n${ragContextText}` : ''}`
      },
      ...conversationThread,
      { role: 'user', content: userMessageContent }
    ];

    let modelForCall = brainConfig.model;
    if (frameToUse && brainConfig.provider === 'groq') {
      modelForCall = 'llama-3.2-11b-vision-preview';
    }

    const firstPass: any = await callOpenAICompatibleLLM({
      provider: brainConfig.provider,
      model: modelForCall,
      apiKey: brainConfig.api_key,
      baseUrl: brainConfig.base_url,
      messages,
      tools: frameToUse && isVisualQuestion ? undefined : tools.length > 0 ? tools : undefined,
      temperature: brainConfig.temperature
    });

    const choice = firstPass?.choices?.[0]?.message;
    let finalResponseText = choice?.content || '';
    let triggeredAgentName = brainConfig.name || 'JARVIS';
    let triggeredAgentId: string = 'jarvis_core';
    let triggeredNodeType = 'core';

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
          toolOutputsForSynthesis.push({ toolName: fnName, result: createdTool });
          continue;
        }

        if (fnName === 'delete_tool_connector') {
          const deletedTool = await deleteToolConnectorFromBrain({
            provider_key: parsedArgs.provider_key
          });
          toolOutputsForSynthesis.push({ toolName: fnName, result: deletedTool });
          continue;
        }

        if (fnName === 'create_or_update_ai_agent') {
          const createdAg = await createOrUpdateAgentFromBrain(parsedArgs as any, brainConfig);
          triggeredAgentName = createdAg.agent?.name || triggeredAgentName;
          triggeredAgentId = createdAg.agent?.slug || 'jarvis_core';
          triggeredNodeType = createdAg.agent?.agent_type || 'api';

          let immediateChainResult: any = null;
          if (parsedArgs.execute_immediately !== false && createdAg.agent) {
            const immediateAgentWithTime = {
              ...createdAg.agent,
              system_prompt: `${createdAg.agent.system_prompt || ''}\n${currentTimestampContext}`
            };
            immediateChainResult = await executeSpecialistPipeline(
              immediateAgentWithTime,
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
            toolName: fnName,
            result: { ...createdAg, immediate_execution: immediateChainResult }
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
          toolOutputsForSynthesis.push({ toolName: fnName, result: personaUpdated });
          continue;
        }

        if (fnName === 'hacker_sec_agent') {
          triggeredAgentName = 'Agente Hacker (Red Team & Self-Healing)';
          triggeredAgentId = 'hacker_sec_agent';
          triggeredNodeType = 'code';
          const hackerOut = await executeHackerSecuritySuite(parsedArgs as any);
          toolOutputsForSynthesis.push({ toolName: fnName, result: hackerOut });
          continue;
        }

        if (fnName === 'save_to_database') {
          const dbRes = await saveToDatabase({
            collectionName: parsedArgs.collectionName || 'autonomous_logs',
            documentData: parsedArgs.documentData || parsedArgs,
            decisionReasoning: parsedArgs.decisionReasoning
          });
          toolOutputsForSynthesis.push({ toolName: fnName, result: dbRes });
          continue;
        }

        if (fnName === 'execute_external_integration') {
          triggeredAgentName = `Protocolo: ${(parsedArgs.provider || 'externo').toUpperCase()}`;
          triggeredAgentId = sanitizeToolName(parsedArgs.provider || 'external_api');
          triggeredNodeType = 'api';
          const protoRes = await executeProtocolOrIntegration(parsedArgs.provider, {
            protocol: parsedArgs.provider as SupportedProtocolOrPlatform,
            endpoint: parsedArgs.endpoint,
            body: parsedArgs.params || parsedArgs
          });
          toolOutputsForSynthesis.push({ toolName: fnName, result: protoRes });
          continue;
        }

        if (fnName === 'execute_ssh_command') {
          triggeredAgentId = 'executar_comando_ssh';
          triggeredNodeType = 'ssh';
          const sshRes = parsedArgs.remoteFilePath
            ? await readRemoteFileViaSshToRag({ remoteFilePath: String(parsedArgs.remoteFilePath) })
            : await executeSshCommand(parsedArgs.command || 'uptime');
          toolOutputsForSynthesis.push({ toolName: fnName, result: sshRes });
          continue;
        }

        const matchedAgent = activeAgents.find(
          (a: any) => sanitizeToolName(a.slug) === fnName
        );
        if (matchedAgent) {
          triggeredAgentName = matchedAgent.name;
          triggeredAgentId = matchedAgent.slug;
          triggeredNodeType = matchedAgent.agent_type || 'llm';

          // Anexa o carimbo de data/hora atual no system prompt do especialista chamado
          const agentWithTime = {
            ...matchedAgent,
            system_prompt: `${matchedAgent.system_prompt || ''}\n${currentTimestampContext}`
          };

          const chainResults = await executeSpecialistPipeline(
            agentWithTime,
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
            responseInstruction: agentWithTime.system_prompt || undefined,
            result: chainResults
          });
          continue;
        }

        if (connectorsMap.has(fnName) || validToolSlugs.includes(fnName)) {
          triggeredAgentId = fnName;
          triggeredNodeType = 'api';
          const directToolOut = await executeBoundTool(
            fnName,
            parsedArgs,
            userPrompt,
            connectorsMap,
            dynamicServerBaseUrl
          );
          toolOutputsForSynthesis.push({ toolName: fnName, result: directToolOut });
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
          )}\n\n[CONTEXTO TEMPORAL ACTUAL]: ${now.toLocaleString('pt-BR', { timeZone: 'America/Campo_Grande' })}\nRespeite eventuais instruções em 'extractionInstruction' ou 'responseInstruction' e elabore a resposta final de forma clara, completa e direta ao usuário.`
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

    // Intercepta e executa automaticamente blocos JSON escritos no texto pela LLM
    const isJsonText = finalResponseText.includes('"action"') || finalResponseText.includes('invoke_tool');
    if (!triggeredAgentId || triggeredAgentId === 'jarvis_core' || isJsonText) {
      const intercepted = await interceptAndExecuteTextActions({
        llmText: finalResponseText,
        userPrompt,
        sessionId,
        serverBaseUrl: brainConfig.server_base_url
      });

      if (intercepted && intercepted.intercepted) {
        finalResponseText = intercepted.finalText;
        triggeredAgentName = intercepted.agentName;
        triggeredAgentId = intercepted.agentSlug;
        triggeredNodeType = intercepted.nodeType || 'api';
      }
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
      ingestDocumentToRag({
        content: `Pergunta (${identityToken}): ${userPrompt} | Resposta (${triggeredAgentName}): ${finalResponseText}`,
        metadata: { sessionId, agent: triggeredAgentName }
      } as any).catch(() => {})
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
      triggeredSuccess: true,
      agent: triggeredAgentName,
      agentId: triggeredAgentId,
      nodeType: triggeredNodeType,
      memoryStored: true,
      memoryCount: historyRowsCount + 2,
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
      triggeredSuccess: false,
      agent: 'Sistema Nervoso Central (Fallback Local)',
      agentId: 'jarvis_core',
      nodeType: 'core',
      memoryStored: false,
      memoryCount: historyRowsCount,
      identity: identityToken,
      sessionId,
      response: `Falha no processamento cognitivo: ${
        error?.message || 'Verifique as credenciais do provedor LLM no painel.'
      }`,
      executionTimeMs: Date.now() - startTime
    };
  }
}

export async function processOrchestratorWorkflow(
  arg1?: any,
  arg2?: any,
  arg3?: string,
  arg4?: any
) {
  if (typeof arg1 === 'string') {
    const token = arg1 || 'Admin-Node';
    const prompt =
      typeof arg2 === 'string'
        ? arg2
        : arg2?.textPrompt ||
          arg2?.prompt ||
          arg2?.text ||
          arg2?.command ||
          'Verificar status operacional';
    const sid = arg3 || arg2?.sessionId || `sess_${Date.now()}`;
    const sensory = arg4 || (typeof arg2 === 'object' ? arg2 : undefined);
    return processWorkflowExecution(token, prompt, sid, sensory);
  }

  const params = arg1 || {};
  const token = params?.identityToken || params?.sensorData?.faceBadge || 'Admin-Node';
  const prompt =
    params?.prompt ||
    params?.textPrompt ||
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
