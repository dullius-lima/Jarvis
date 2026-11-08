// src/services/orchestratorService.ts
import { pool } from '../config/database.js';
import { ingestDocumentToRag } from './ragService.js';
import { emitBrainLinkEvent, emitNeuroPulse } from './brainSocketService.js';
import { dispatchErrorTrigger } from './errorTriggerService.js';
import { appendShortTermMemory } from './shortTermMemoryService.js';
import { interceptAndExecuteTextActions, extractJsonActionBlocks } from './jsonActionInterceptor.js';

import {
  ensureOrchestratorSchema,
  SupportedProtocolOrPlatform,
  ExternalProvider,
  SensoryAttachments,
  SensorPayload,
  DynamicToolCatalogItem,
  sanitizeToolName,
  resolveDynamicUrl,
  interpolateApiTemplate,
  resolveProviderCredentials,
  getCentralBrainConfig,
  getJarvisConfig,
  createLLMClient
} from './orchestrator/brainConfigAndUtils.js';

import { saveToDatabase, getDynamicToolsCatalog } from './orchestrator/catalogAndDatabase.js';
import {
  createOrUpdateToolFromBrain,
  deleteToolConnectorFromBrain,
  createOrUpdateAgentFromBrain,
  updateAgentOrJarvisPersona,
  executeHackerSecuritySuite,
  toolDelegarCriacaoSubagente,
  executarDelegacaoSubagente
} from './orchestrator/brainMetaTools.js';

import {
  callOpenAICompatibleLLM,
  executeSpecialistPipeline,
  executeSpecialistNode,
  executeAgentChain
} from './orchestrator/llmAndPipelineRunner.js';

import { processarBiometriaESaudacao, processarEntradaVisual } from './orchestrator/cortexSensorial.js';
import { montarContextoEConexoes } from './orchestrator/montadorPromptEConexoes.js';
import { processarChamadasDeFerramentas } from './orchestrator/despachanteFerramentas.js';
import { interceptarAcaoAgenda } from './orchestrator/interceptadorAgenda.js';

// Re-exportações de tipos e utilitários para manter compatibilidade total
export type { SupportedProtocolOrPlatform, ExternalProvider, SensoryAttachments, SensorPayload, DynamicToolCatalogItem };
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
  executeAgentChain,
  interceptarAcaoAgenda
};

/**
 * Localização flexível e tolerante de Agentes Especialistas
 * (Suporta variações de hífen vs underline, maiúsculas ou nome amigável)
 */
function encontrarAgenteResiliente(fnName: string, agentes: any[]): any | undefined {
  if (!fnName || !Array.isArray(agentes)) return undefined;

  const normalizar = (str: string) =>
    (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');

  const alvo = normalizar(fnName);
  if (!alvo) return undefined;

  // 1. Casamento direto por slug
  let correspondente = agentes.find((a: any) => normalizar(a.slug) === alvo);
  if (correspondente) return correspondente;

  // 2. Casamento direto por nome do agente
  correspondente = agentes.find((a: any) => normalizar(a.name) === alvo);
  if (correspondente) return correspondente;

  // 3. Casamento por inclusão recíproca (substring relevante)
  correspondente = agentes.find((a: any) => {
    const slugNorm = normalizar(a.slug);
    const nomeNorm = normalizar(a.name);
    return (
      (slugNorm.length >= 4 && alvo.includes(slugNorm)) ||
      (alvo.length >= 4 && slugNorm.includes(alvo)) ||
      (nomeNorm.length >= 4 && alvo.includes(nomeNorm)) ||
      (alvo.length >= 4 && nomeNorm.includes(alvo))
    );
  });

  return correspondente;
}

/**
 * Processamento principal do fluxo cognitivo, sensorial e execução de ferramentas
 */
export async function processarExecucaoWorkflow(
  identityToken: string,
  userPrompt: string,
  sessionId = `sess_${Date.now()}`,
  sensoryInput?: SensorPayload | SensoryAttachments | any
) {
  const inicioExecucao = Date.now();

  try {
    await ensureOrchestratorSchema();

    emitNeuroPulse({
      source_dendrite: 'sensory_input',
      target_dendrite: 'jarvis_core',
      neurotransmitter: 'ACETILCOLINA',
      intensity: 0.9,
      metadata: { sessionId, identityToken }
    });

    // 1. Biometria Vocal e Saudações Rápidas
    const filtroSensorial = await processarBiometriaESaudacao(
      userPrompt,
      identityToken,
      sessionId,
      sensoryInput,
      0,
      inicioExecucao
    );

    if (filtroSensorial.interceptado) {
      return filtroSensorial.respostaPronta;
    }

    const { activeSpeakerName, speakerRole, isVoiceIdentified } = filtroSensorial;

    // 2. Visão Multimodal (Webcam / Tela)
    const visual = processarEntradaVisual(sensoryInput, userPrompt, activeSpeakerName);
    if (visual.ehPerguntaVisual && !visual.frameAtivo) {
      const respVisual = {
        success: true,
        triggeredSuccess: true,
        agent: 'JARVIS (Córtex Visual)',
        agentId: 'jarvis_vision',
        nodeType: 'core',
        memoryStored: false,
        memoryCount: 0,
        identity: activeSpeakerName,
        sessionId,
        response: 'Ainda não estou recebendo o sinal da sua câmera ou tela, senhor. Ative o botão correspondente para que eu possa enxergar.',
        executionTimeMs: Date.now() - inicioExecucao,
        data: null as any
      };
      respVisual.data = { ...respVisual };
      return respVisual;
    }

    // 3. Montagem do Contexto, Memória e Ferramentas
    const dadosContexto = await montarContextoEConexoes(
      userPrompt,
      sessionId,
      activeSpeakerName,
      speakerRole,
      visual.instrucaoVisualSistema
    );

    // 3.1 Registra a Ferramenta Nativa de Aprendizado e Gravação de Memória Permanente
    if (!dadosContexto.tools.some((t: any) => t.function?.name === 'salvar_memoria_permanente')) {
      dadosContexto.tools.push({
        type: 'function',
        function: {
          name: 'salvar_memoria_permanente',
          description:
            'Acione OBRIGATORIAMENTE quando o usuário solicitar mudanças na sua forma de falar, tom de voz, regras pessoais, nomes ou preferências permanentes da casa.',
          parameters: {
            type: 'object',
            properties: {
              tipo: {
                type: 'string',
                enum: ['estilo_de_conversa', 'fato_do_usuario', 'regra_de_negocio'],
                description: 'Classificação da memória.'
              },
              conteudo: {
                type: 'string',
                description: 'A instrução, preferência ou fato exato a ser memorizado de forma concisa.'
              },
              agente_alvo: {
                type: 'string',
                description: 'Deixe vazio ou use "jarvis_core" para regras gerais, ou o slug do especialista alvo.'
              }
            },
            required: ['tipo', 'conteudo']
          }
        }
      });
    }

    // 3.2 Reforço de Diretriz contra Respostas Robotizadas e Delegação Obrigatória
    const promptSistemaBlindado = `${dadosContexto.promptSistemaCompleto}

[DIRETRIZES DE DELEGAÇÃO E APRENDIZADO DO JARVIS]:
1. DELEGAÇÃO OBRIGATÓRIA: Se a dúvida ou comando for do domínio de um dos Agentes Especialistas Ativos listados acima, você está PROIBIDO de responder diretamente como JARVIS e proibido de inventar dados. É OBRIGATÓRIO acionar a Tool Call do respectivo subagente.
2. APRENDIZADO ATIVO: Sempre que o usuário disser como deseja ser tratado, estilo de resposta (ex: "seja mais direto", "responda em tópicos") ou pedir para memorizar algo ("guarde na sua memória", "lembre-se disso"), invoque a ferramenta "salvar_memoria_permanente".
3. HUMANIZAÇÃO: Fale de forma inteligente, polida, empática e objetiva em português. NUNCA gere mensagens em branco nem responda com termos técnicos sobre logs ou modelos.`;

    const mensagensBase = [
      { role: 'system', content: promptSistemaBlindado },
      ...dadosContexto.threadConversa,
      { role: 'user', content: visual.conteudoMensagemUsuario }
    ];

    // 4. Primeira Passada Cognitiva
    const primeiraPassada: any = await callOpenAICompatibleLLM({
      provider: dadosContexto.configuracaoCerebro.provider,
      model: dadosContexto.configuracaoCerebro.model,
      apiKey: dadosContexto.configuracaoCerebro.api_key,
      baseUrl: dadosContexto.configuracaoCerebro.base_url,
      messages: mensagensBase,
      tools: visual.frameAtivo && visual.ehPerguntaVisual ? undefined : dadosContexto.tools,
      temperature: dadosContexto.configuracaoCerebro.temperature
    });

    const mensagemEscolha = primeiraPassada?.choices?.[0]?.message;
    let textoRespostaFinal = mensagemEscolha?.content || '';
    let triggeredAgentName = dadosContexto.configuracaoCerebro.name || 'JARVIS';
    let triggeredAgentId = 'jarvis_core';
    let triggeredNodeType = 'core';

    // 5. Execução de Ferramentas / Especialistas
    if (Array.isArray(mensagemEscolha?.tool_calls) && mensagemEscolha.tool_calls.length > 0) {
      // 5.1 Tratamento Nativo da Ferramenta de Memória Permanente
      const callMemoria = mensagemEscolha.tool_calls.find(
        (tc: any) => sanitizeToolName(tc.function?.name) === 'salvar_memoria_permanente'
      );

      if (callMemoria) {
        let argsMem: any = {};
        try {
          argsMem = JSON.parse(callMemoria.function?.arguments || '{}');
        } catch {
          argsMem = {};
        }

        const conteudo = (argsMem.conteudo || userPrompt).trim();
        const alvo = argsMem.agente_alvo || 'jarvis_core';

        await updateAgentOrJarvisPersona({
          target_slug: alvo,
          behavior_instruction: conteudo,
          replace_entire_prompt: false
        }).catch(() => {});

        await ingestDocumentToRag(
          `[MEMÓRIA APRENDIDA]: ${conteudo} (Tipo: ${argsMem.tipo || 'estilo_de_conversa'})`,
          { sessionId, category: 'memoria_permanente', speaker: activeSpeakerName }
        ).catch(() => {});

        textoRespostaFinal = `Compreendido perfeitamente, ${activeSpeakerName}! Guardei essa instrução na minha memória permanente. Nossas próximas conversas já seguirão essa diretriz.`;
        triggeredAgentName = 'JARVIS (Memória Evolutiva)';
        triggeredAgentId = 'jarvis_core';
        triggeredNodeType = 'core';
      } else {
        // 5.2 Normalização dos Slugs das Chamadas de Ferramentas antes do despacho
        for (const tc of mensagemEscolha.tool_calls) {
          const rawName = tc.function?.name || '';
          const matchAg = encontrarAgenteResiliente(rawName, dadosContexto.agentesAtivos);
          if (matchAg && tc.function) {
            tc.function.name = sanitizeToolName(matchAg.slug);
          }
        }

        const resultadoFerramentas = await processarChamadasDeFerramentas({
          toolCalls: mensagemEscolha.tool_calls,
          configuracaoCerebro: dadosContexto.configuracaoCerebro,
          contextoTemporal: dadosContexto.contextoTemporal,
          agentesAtivos: dadosContexto.agentesAtivos,
          connectorsMap: dadosContexto.connectorsMap,
          validToolSlugs: dadosContexto.validToolSlugs,
          activeSpeakerName,
          sessionId,
          threadConversa: dadosContexto.threadConversa,
          userPrompt,
          mensagensBase
        });

        textoRespostaFinal = resultadoFerramentas.textoFinal;
        triggeredAgentName = resultadoFerramentas.triggeredAgentName;
        triggeredAgentId = resultadoFerramentas.triggeredAgentId;
        triggeredNodeType = resultadoFerramentas.triggeredNodeType;
      }
    } else {
      // 5.3 Heurística de Memória: Se o usuário pedir para gravar algo mas a LLM não acionar tool call
      const ehComandoDeMemoria =
        /(?:grave|salve|guarde|lembre|memorize|aprenda)\s+(?:na|em)?\s*(?:sua|tua)?\s*mem[oó]ria/i.test(userPrompt) ||
        /(?:a\s+partir\s+de\s+agora|de\s+hoje\s+em\s+diante|sempre\s+que\s+eu\s+falar)\s*[,:]?\s*(?:me\s+chame|responda|fale|seja)/i.test(userPrompt);

      if (ehComandoDeMemoria) {
        const regraExtraida = userPrompt
          .replace(/^(?:jarvis\s*[,:]?\s*)?(?:por\s+favor\s*)?(?:grave|salve|guarde|lembre|memorize|aprenda)\s+(?:na|em)?\s*(?:sua|tua)?\s*mem[oó]ria\s*(?:que)?/i, '')
          .trim();

        if (regraExtraida.length > 4) {
          await updateAgentOrJarvisPersona({
            target_slug: 'jarvis_core',
            behavior_instruction: regraExtraida,
            replace_entire_prompt: false
          }).catch(() => {});

          await ingestDocumentToRag(
            `[MEMÓRIA APRENDIDA]: ${regraExtraida}`,
            { sessionId, category: 'memoria_permanente', speaker: activeSpeakerName }
          ).catch(() => {});

          textoRespostaFinal = `Entendido, ${activeSpeakerName}! Guardei isso na minha memória permanente: "${regraExtraida}".`;
          triggeredAgentName = 'JARVIS (Memória Evolutiva)';
          triggeredAgentId = 'jarvis_core';
          triggeredNodeType = 'core';
        }
      }
    }

    // 6. Interceptação de Agendamento e JSON Residual
    const acaoAgenda = await interceptarAcaoAgenda(textoRespostaFinal);
    if (acaoAgenda.interceptado && acaoAgenda.respostaTexto) {
      textoRespostaFinal = acaoAgenda.respostaTexto;
      triggeredAgentName = 'Agente de Agendamento';
      triggeredAgentId = 'calendar_agent';
      triggeredNodeType = 'api';
    } else {
      const temJsonResidual =
        extractJsonActionBlocks(textoRespostaFinal).length > 0 ||
        textoRespostaFinal.includes('"toolName"') ||
        textoRespostaFinal.includes('"action"');

      if (temJsonResidual) {
        const interceptado = await interceptAndExecuteTextActions({
          llmText: textoRespostaFinal,
          userPrompt,
          sessionId,
          serverBaseUrl: dadosContexto.configuracaoCerebro.server_base_url
        });
        if (interceptado?.intercepted) {
          textoRespostaFinal = interceptado.finalText;
          triggeredAgentName = interceptado.agentName;
          triggeredAgentId = interceptado.agentSlug;
          triggeredNodeType = interceptado.nodeType || 'api';
        }
      }
    }

    // 7. Blindagem Anti-Vazio e Síntese Humanizada
    const respostaEstaVazia =
      !textoRespostaFinal ||
      textoRespostaFinal.trim() === '' ||
      textoRespostaFinal.trim() === '[]' ||
      textoRespostaFinal.trim() === '{}' ||
      textoRespostaFinal.toLowerCase().includes('o sistema não retornou');

    if (respostaEstaVazia) {
      try {
        const promptContingencia = [
          ...mensagensBase,
          {
            role: 'system',
            content: `DIRETRIZ DE SÍNTESE OBRIGATÓRIA: Responda ao usuário (${activeSpeakerName}) de forma amigável, acolhedora, clara e em português. NUNCA deixe o retorno vazio e NUNCA retorne código JSON solto nem frases técnicas sobre logs.`
          }
        ];

        const chamadaContingencia: any = await callOpenAICompatibleLLM({
          provider: dadosContexto.configuracaoCerebro.provider,
          model: dadosContexto.configuracaoCerebro.model,
          apiKey: dadosContexto.configuracaoCerebro.api_key,
          baseUrl: dadosContexto.configuracaoCerebro.base_url,
          messages: promptContingencia,
          temperature: 0.3
        });

        textoRespostaFinal =
          chamadaContingencia?.choices?.[0]?.message?.content?.trim() ||
          `Comando recebido, ${activeSpeakerName}. A operação foi concluída com sucesso no ecossistema.`;
      } catch {
        textoRespostaFinal = `Estou operacional, ${activeSpeakerName}. Estímulo processado com sucesso.`;
      }
    }

    appendShortTermMemory(sessionId, 'user', userPrompt);
    appendShortTermMemory(sessionId, 'assistant', textoRespostaFinal);
    const tempoExecucaoMs = Date.now() - inicioExecucao;

    // 8. Persistência Assíncrona e Emissão de Pulso Sináptico (Dopamina)
    Promise.allSettled([
      pool.query(
        `INSERT INTO jarvis_chat_memory (session_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3);`,
        [sessionId, userPrompt, textoRespostaFinal]
      ),
      pool.query(
        `INSERT INTO agent_audit_logs (session_id, agent_name, action_payload, response_payload, execution_time_ms)
         VALUES ($1, $2, $3, $4, $5);`,
        [
          sessionId,
          triggeredAgentName,
          JSON.stringify({ prompt: userPrompt, identityToken: activeSpeakerName, speakerRole }),
          JSON.stringify({ response: textoRespostaFinal }),
          tempoExecucaoMs
        ]
      ),
      ingestDocumentToRag(
        `Pergunta (${activeSpeakerName}): ${userPrompt} | Resposta (${triggeredAgentName}): ${textoRespostaFinal}`,
        { sessionId, agent: triggeredAgentName, speaker: activeSpeakerName }
      )
    ]).catch(() => {});

    emitBrainLinkEvent({
      axon_id: 'response_output',
      source_dendrite: 'jarvis_core',
      target_dendrite: 'hippocampus_rag',
      direction: 'BACKWARD',
      neurotransmitter_type: 'DOPAMINA',
      intensity: 1.0,
      metadata: { agent: triggeredAgentName, agentId: triggeredAgentId, speaker: activeSpeakerName }
    } as any);

    // Retorno unificado com espelhamento duplo (raiz e data)
    const retornoExecucao: any = {
      success: true,
      triggeredSuccess: true,
      agent: triggeredAgentName,
      agentId: triggeredAgentId,
      nodeType: triggeredNodeType,
      memoryStored: true,
      memoryCount: dadosContexto.historicoLinhas + 2,
      identity: activeSpeakerName,
      speaker: { name: activeSpeakerName, role: speakerRole, identified: isVoiceIdentified },
      sessionId,
      response: textoRespostaFinal,
      executionTimeMs: tempoExecucaoMs
    };

    retornoExecucao.data = { ...retornoExecucao };
    return retornoExecucao;

  } catch (error: any) {
    console.error('❌ [Orquestrador Central] Erro na execução:', error?.message);

    dispatchErrorTrigger({
      sourceNode: 'Orquestrador Central (JARVIS)',
      sourceSlug: 'jarvis_core',
      errorMessage: error?.message || 'Falha no processamento neural',
      stackTrace: error?.stack,
      inputPayload: { prompt: userPrompt, identityToken, sessionId },
      severity: 'high'
    }).catch(() => {});

    const retornoFalha: any = {
      success: false,
      triggeredSuccess: false,
      agent: 'Sistema Nervoso Central (Fallback Local)',
      agentId: 'jarvis_core',
      nodeType: 'core',
      memoryStored: false,
      memoryCount: 0,
      identity: identityToken,
      sessionId,
      response: `Falha no processamento: ${error?.message || 'Verifique as credenciais no painel.'}`,
      executionTimeMs: Date.now() - inicioExecucao
    };

    retornoFalha.data = { ...retornoFalha };
    return retornoFalha;
  }
}

/**
 * Adaptador flexível de entrada para compatibilidade universal com controllers
 * Suporta tanto chamada por objeto quanto posicional
 */
export async function processarFluxoOrquestrador(arg1?: any, arg2?: any, arg3?: string, arg4?: any) {
  if (typeof arg1 === 'string') {
    const token = arg1 || 'Matheus-Admin';
    const prompt = typeof arg2 === 'string' ? arg2 : arg2?.textPrompt || arg2?.prompt || 'Verificar status';
    const sid = arg3 || arg2?.sessionId || `sess_${Date.now()}`;
    const sensory = arg4 || (typeof arg2 === 'object' ? arg2 : undefined);
    return processarExecucaoWorkflow(token, prompt, sid, sensory);
  }

  const params = arg1 || {};
  const token = params?.identityToken || params?.sensorData?.faceBadge || 'Matheus-Admin';
  const prompt =
    params?.prompt ||
    params?.textPrompt ||
    params?.sensorData?.textPrompt ||
    params?.sensorData?.prompt ||
    'Verificar status';
  const sid = params?.sessionId || params?.sensorData?.sessionId || `sess_${Date.now()}`;
  const sensoryData = params?.sensorData || params;
  return processarExecucaoWorkflow(token, prompt, sid, sensoryData);
}

export const processarEstimuloOrquestrador = async (identityToken: string, sensorData: any) => {
  return processarFluxoOrquestrador({ identityToken, sensorData });
};

// Aliases para retrocompatibilidade total com controllers
export const processWorkflowExecution = processarExecucaoWorkflow;
export const processOrchestratorWorkflow = processarFluxoOrquestrador;
export const processOrchestratorStimulus = processarEstimuloOrquestrador;
export const scheduleCalendarInterceptor = interceptarAcaoAgenda;

export default {
  processarExecucaoWorkflow,
  processarFluxoOrquestrador,
  processarEstimuloOrquestrador,
  interceptarAcaoAgenda,
  processWorkflowExecution,
  processOrchestratorWorkflow,
  processOrchestratorStimulus
};
