// src/services/orchestratorService.ts
/**
 * ============================================================================
 * ORQUESTRADOR CENTRAL NEURAL - JARVIS ECOSYSTEM
 * ============================================================================
 * Núcleo cognitivo responsável por:
 * 1. Biometria Vocal & Reconhecimento de Locutores Familiares
 * 2. Percepção Multimodal (Visão de Webcam, Tela e Contexto Temporal)
 * 3. Roteamento Inteligente de Agentes Especialistas e Tool Calling Nativo
 * 4. Meta-Tools Autônomas (Criação/Edição/Exclusão de Conectores e Agentes)
 * 5. Pipeline Sequencial de Nós (next_agent_slug) e Interceptação JSON
 * 6. Telemetria Sináptica em Tempo Real (WebSocket) e Auditoria PostgreSQL
 */

import { pool } from '../config/database.js';
import { searchVectorDocuments, ingestDocumentToRag } from './ragService.js';
import { emitBrainLinkEvent, emitNeuroPulse } from './brainSocketService.js';
import { executeProtocolOrIntegration } from './integrationAndProtocolService.js';
import { executeSshCommand, readRemoteFileViaSshToRag } from './sshService.js';
import { dispatchErrorTrigger } from './errorTriggerService.js';
import { appendShortTermMemory } from './shortTermMemoryService.js';
import { interceptAndExecuteTextActions } from './jsonActionInterceptor.js';
import { identifySpeaker, enrollSpeakerVoice } from './voiceBiometricService.js';

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

// ============================================================================
// RE-EXPORTAÇÕES PARA RETROCOMPATIBILIDADE TOTAL COM CONTROLLERS E ROTAS
// ============================================================================
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
    // 1. Inicialização de Esquema e Configuração do Cérebro
    await ensureOrchestratorSchema();
    brainConfig = await getCentralBrainConfig();
    const dynamicServerBaseUrl = brainConfig.server_base_url;

    // 2. Geração do Contexto Temporal com Fuso Local
    const now = new Date();
    const currentTimestampContext = `\n[CONTEXTO TEMPORAL ACTUAL DO SISTEMA]:
- Data e Hora Actual do Servidor: ${now.toLocaleString('pt-BR', { timeZone: 'America/Campo_Grande' })}
- ISO 8601: ${now.toISOString()}
- Fuso Horário Local: America/Campo_Grande (UTC-4)`;

    // 3. Emissão do Pulso Sináptico Inicial (Acetilcolina: Ativação Cognitiva)
    emitNeuroPulse({
      source_dendrite: 'sensory_input',
      target_dendrite: 'jarvis_core',
      neurotransmitter: 'ACETILCOLINA',
      intensity: 0.9,
      metadata: { sessionId, identityToken }
    });

    // ========================================================================
    // 4. BIOMETRIA VOCAL & IDENTIFICAÇÃO DE LOCUTORES FAMILIARES
    // ========================================================================
    let activeSpeakerName = identityToken || 'Matheus-Admin';
    let speakerRole = 'admin';
    let isVoiceIdentified = false;

    const audioSample =
      sensoryInput?.audioBase64 ||
      sensoryInput?.sensorData?.audioBase64 ||
      sensoryInput?.sensorData?.audio ||
      sensoryInput?.audio;

    if (audioSample && typeof audioSample === 'string' && audioSample.length > 300) {
      try {
        // 4.1 Detecção de Auto-Apresentação / Treinamento de Voz Familiar
        // Exemplo: "Sou o Matheus", "Meu nome é Juliana", "Aqui é a Maria", "Cadastre a voz do Lucas"
        const enrollmentMatch = userPrompt.match(
          /(?:sou\s+(?:o|a)?|meu\s+nome\s+[eé]|aqui\s+[eé]\s+(?:o|a)?|cadastre\s+a\s+voz\s+(?:do|da)?)\s+([A-Za-zÀ-ÖØ-öø-ÿ]+)/i
        );

        if (enrollmentMatch && enrollmentMatch[1]) {
          const detectedName =
            enrollmentMatch[1].charAt(0).toUpperCase() +
            enrollmentMatch[1].slice(1).toLowerCase();
          const assignedRole = detectedName.toLowerCase().includes('matheus') ? 'admin' : 'family';

          await enrollSpeakerVoice(detectedName, audioSample, assignedRole);

          const enrollReply = `Prazer em falar com você, ${detectedName}! Identifiquei e memorizei com sucesso a frequência da sua voz no sistema da nossa casa. Como posso ajudar você agora?`;

          appendShortTermMemory(sessionId, 'user', userPrompt);
          appendShortTermMemory(sessionId, 'assistant', enrollReply);

          await pool
            .query(
              `INSERT INTO jarvis_chat_memory (session_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3);`,
              [sessionId, userPrompt, enrollReply]
            )
            .catch(() => {});

          return {
            success: true,
            triggeredSuccess: true,
            agent: 'JARVIS (Biometria Vocal)',
            agentId: 'jarvis_core',
            nodeType: 'core',
            memoryStored: true,
            memoryCount: historyRowsCount + 2,
            identity: detectedName,
            speaker: { name: detectedName, role: assignedRole, identified: true, newlyEnrolled: true },
            sessionId,
            response: enrollReply,
            executionTimeMs: Date.now() - startTime
          };
        }

        // 4.2 Comparação de Padrão Acústico com Perfis Existentes
        const speakerCheck = await identifySpeaker(audioSample);
        if (speakerCheck && speakerCheck.identified) {
          activeSpeakerName = speakerCheck.name;
          speakerRole = speakerCheck.role;
          isVoiceIdentified = true;
        }

        // 4.3 Comportamento para Chamada Simples da Wake Word ("Jarvis" ou "Oi Jarvis")
        const isOnlyWakeWord = /^(oi\s+|ol[aá]\s+|ei\s+)?(jarvis|j[aá]vis|jarves|iarvis)[!.,?\s]*$/i.test(
          userPrompt.trim()
        );

        if (isOnlyWakeWord) {
          let wakeGreeting = '';
          if (isVoiceIdentified) {
            wakeGreeting = `Olá, ${activeSpeakerName}! Estou ouvindo você perfeitamente. Como posso ajudar?`;
          } else {
            wakeGreeting =
              'Olá! Não consegui identificar a sua voz com exatidão. Com quem estou falando? (Você pode dizer: "Sou o Matheus" ou "Sou a Juliana" para eu memorizar sua voz).';
          }

          appendShortTermMemory(sessionId, 'user', userPrompt);
          appendShortTermMemory(sessionId, 'assistant', wakeGreeting);

          await pool
            .query(
              `INSERT INTO jarvis_chat_memory (session_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3);`,
              [sessionId, userPrompt, wakeGreeting]
            )
            .catch(() => {});

          return {
            success: true,
            triggeredSuccess: true,
            agent: 'JARVIS (Biometria Vocal)',
            agentId: 'jarvis_core',
            nodeType: 'core',
            memoryStored: true,
            memoryCount: historyRowsCount + 2,
            identity: isVoiceIdentified ? activeSpeakerName : 'Desconhecido',
            speaker: {
              name: isVoiceIdentified ? activeSpeakerName : 'Desconhecido',
              role: isVoiceIdentified ? speakerRole : 'guest',
              identified: isVoiceIdentified
            },
            sessionId,
            response: wakeGreeting,
            executionTimeMs: Date.now() - startTime
          };
        }
      } catch (voiceErr: any) {
        console.warn('⚠️ [Biometria Vocal] Aviso ao processar locutor:', voiceErr?.message);
      }
    }

    // ========================================================================
    // 5. RECUPERAÇÃO DE MEMÓRIA CONVERSACIONAL (CHAT) & BASE VETORIAL (RAG)
    // ========================================================================
    const historyRes = await pool
      .query(
        `SELECT role, content FROM jarvis_chat_memory 
         WHERE session_id = $1 ORDER BY id ASC LIMIT 14;`,
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

    // ========================================================================
    // 6. CARREGAMENTO DOS AGENTES ATIVOS & CATÁLOGO DINÂMICO DE CONECTORES
    // ========================================================================
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

    // Monta as Tools dos Especialistas no padrão OpenAI Tool Calling
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
                description: 'A pergunta, comando ou dados técnicos que o especialista deve processar.'
              },
              symbol: {
                type: 'string',
                description: 'Ticker ou código de ativo quando aplicável (ex: PETR4, WEGE3).'
              },
              query: {
                type: 'string',
                description: 'Parâmetro textual de pesquisa, cálculo ou filtro.'
              }
            },
            required: ['task_details']
          }
        }
      };
    });

    // Anexa as Meta-Tools Nativas do JARVIS
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
                description: `Slug da conexão a ser excluída. Catálogo disponível: [${validToolSlugs.join(', ')}]`
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
            'Atualiza o modo de falar, estilo ou regras permanentes no system_prompt do JARVIS ou de um Agente.',
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
          description: 'Audita vulnerabilidades (red_team_audit), logs (self_healing_debug) ou rotas HTTP (api_probe).',
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
          description: 'Salva dados em formato estruturado no PostgreSQL (Dynamic Collections).',
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
          description: 'Dispara ações em WhatsApp, Google Workspace, Outlook, Home Assistant, REST, etc.',
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
          description: 'Executa comandos shell via SSH ou indexa logs/arquivos remotos no RAG.',
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

    // ========================================================================
    // 7. CÓRTEX VISUAL E ANÁLISE MULTIMODAL (WEBCAM / TELA)
    // ========================================================================
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
        'Ainda não estou recebendo o sinal da sua câmera ou tela, senhor. Ative o botão correspondente na barra de comando inferior para que eu possa enxergar.';
      return {
        success: true,
        triggeredSuccess: true,
        agent: 'JARVIS (Córtex Visual)',
        agentId: 'jarvis_vision',
        nodeType: 'core',
        memoryStored: false,
        memoryCount: historyRowsCount,
        identity: activeSpeakerName,
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

      const sourceLabel = rawWebcam ? 'WEBCAM (Ambiente do Usuário)' : 'TELA DO COMPUTADOR';
      visionSystemInstruction = `\n\n[SINAL VISUAL ATIVO - ${sourceLabel}]: Você está visualizando o usuário autenticado (${activeSpeakerName}) em tempo real pela imagem anexada. Descreva de forma objetiva, natural e humana o que você vê. Não utilize ferramentas para interpretar a imagem.`;

      userMessageContent = [
        {
          type: 'text',
          text: `${userPrompt}\n(Nota Técnica: Analise a captura da ${sourceLabel} transmitida em anexo.)`
        },
        { type: 'image_url', image_url: { url: formattedUrl } }
      ];
    }

    // ========================================================================
    // 8. PRIMEIRA PASSADA COGNITIVA (DISPATCHER DA LLM CENTRAL)
    // ========================================================================
    const messages: any[] = [
      {
        role: 'system',
        content: `${brainConfig.system_prompt}
${currentTimestampContext}
Identidade Autenticada / Locutor: ${activeSpeakerName} (${speakerRole})
URL Base do Servidor: ${dynamicServerBaseUrl}${visionSystemInstruction}

--- CATÁLOGO DINÂMICO DE TOOLS / CONEXÕES DISPONÍVEIS ---
${liveToolsSummary}

REGRAS OBRIGATÓRIAS DE EXECUÇÃO:
1. NUNCA escreva blocos de texto no formato JSON de ferramenta (como {"action": "invoke_tool"}) diretamente para o usuário.
2. Sempre que a solicitação demandar dados externos, APIs ou especialistas cadastrados, invoque a Tool Call nativa correspondente.
3. Trate o usuário de forma respeitosa, inteligente e alinhada à sua identidade reconhecida (${activeSpeakerName}).

--- AGENTES ESPECIALISTAS ATIVOS ---
${existingAgentsSummary}
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

    // ========================================================================
    // 9. EXECUÇÃO DE FERRAMENTAS & SÍNTESE CONTEXTUAL
    // ========================================================================
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

        // 9.1 Criação/Edição de Conectores
        if (fnName === 'create_or_update_tool_connector') {
          const createdTool = await createOrUpdateToolFromBrain(parsedArgs as any);
          toolOutputsForSynthesis.push({ toolName: fnName, result: createdTool });
          continue;
        }

        // 9.2 Exclusão de Conectores
        if (fnName === 'delete_tool_connector') {
          const deletedTool = await deleteToolConnectorFromBrain({
            provider_key: parsedArgs.provider_key
          });
          toolOutputsForSynthesis.push({ toolName: fnName, result: deletedTool });
          continue;
        }

        // 9.3 Criação/Atualização de Agentes
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
              activeSpeakerName,
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

        // 9.4 Ajuste de Personalidade/Prompt
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

        // 9.5 Suíte Hacker e Auditoria
        if (fnName === 'hacker_sec_agent') {
          triggeredAgentName = 'Agente Hacker (Red Team & Self-Healing)';
          triggeredAgentId = 'hacker_sec_agent';
          triggeredNodeType = 'code';
          const hackerOut = await executeHackerSecuritySuite(parsedArgs as any);
          toolOutputsForSynthesis.push({ toolName: fnName, result: hackerOut });
          continue;
        }

        // 9.6 Persistência em Coleções Dinâmicas
        if (fnName === 'save_to_database') {
          const dbRes = await saveToDatabase({
            collectionName: parsedArgs.collectionName || 'autonomous_logs',
            documentData: parsedArgs.documentData || parsedArgs,
            decisionReasoning: parsedArgs.decisionReasoning
          });
          toolOutputsForSynthesis.push({ toolName: fnName, result: dbRes });
          continue;
        }

        // 9.7 Integrações Externas / IoT
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

        // 9.8 Execução SSH Remota
        if (fnName === 'execute_ssh_command') {
          triggeredAgentId = 'executar_comando_ssh';
          triggeredNodeType = 'ssh';
          const sshRes = parsedArgs.remoteFilePath
            ? await readRemoteFileViaSshToRag({ remoteFilePath: String(parsedArgs.remoteFilePath) })
            : await executeSshCommand(parsedArgs.command || 'uptime');
          toolOutputsForSynthesis.push({ toolName: fnName, result: sshRes });
          continue;
        }

        // 9.9 Acionamento de Agentes Especialistas Ativos
        const matchedAgent = activeAgents.find(
          (a: any) => sanitizeToolName(a.slug) === fnName
        );

        if (matchedAgent) {
          triggeredAgentName = matchedAgent.name;
          triggeredAgentId = matchedAgent.slug;
          triggeredNodeType = matchedAgent.agent_type || 'llm';

          const agentWithTime = {
            ...matchedAgent,
            system_prompt: `${matchedAgent.system_prompt || ''}\n${currentTimestampContext}`
          };

          const chainResults = await executeSpecialistPipeline(
            agentWithTime,
            parsedArgs,
            sessionId,
            activeSpeakerName,
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

        // 9.10 Execução Direta de Conectores Vinculados
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

      // Segunda Passada: Síntese Final Consolidada
      const synthesisMessages = [
        ...messages,
        {
          role: 'user',
          content: `Os especialistas e ferramentas retornaram o seguinte payload:\n${JSON.stringify(
            toolOutputsForSynthesis,
            null,
            2
          )}\n\n[CONTEXTO TEMPORAL ACTUAL]: ${now.toLocaleString('pt-BR', {
            timeZone: 'America/Campo_Grande'
          })}\nComunique a resposta final ao usuário de forma completa, precisa e polida.`
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

    // ========================================================================
    // 10. INTERCEPTAÇÃO DE AÇÕES JSON EM TEXTO & PERSISTÊNCIA NEURAL
    // ========================================================================
    const isJsonText =
      finalResponseText.includes('"action"') || finalResponseText.includes('invoke_tool');
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

    // Gravação Simultânea em Memória Relacional, Auditoria e RAG
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
          JSON.stringify({ prompt: userPrompt, identityToken: activeSpeakerName, speakerRole }),
          JSON.stringify({ response: finalResponseText }),
          executionTimeMs
        ]
      ),
      ingestDocumentToRag({
        content: `Pergunta (${activeSpeakerName}): ${userPrompt} | Resposta (${triggeredAgentName}): ${finalResponseText}`,
        metadata: { sessionId, agent: triggeredAgentName, speaker: activeSpeakerName }
      } as any).catch(() => {})
    ]);

    // Emissão do Pulso Sináptico de Conclusão (Dopamina: Sucesso)
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
        speaker: activeSpeakerName,
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
      identity: activeSpeakerName,
      speaker: {
        name: activeSpeakerName,
        role: speakerRole,
        identified: isVoiceIdentified
      },
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

// ============================================================================
// WRAPPERS DE COMPATIBILIDADE UNIVERSAL PARA CONTROLLERS E WEBHOOKS
// ============================================================================

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
  const sensoryData = params?.sensorData || params;
  return processWorkflowExecution(token, prompt, sid, sensoryData);
}

export const processOrchestratorStimulus = async (
  identityToken: string,
  sensorData: any
) => {
  return processOrchestratorWorkflow({ identityToken, sensorData });
};