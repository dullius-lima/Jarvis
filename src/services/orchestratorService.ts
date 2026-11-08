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

// Re-exportações de tipos e utilitários para compatibilidade
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
      return {
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
        executionTimeMs: Date.now() - inicioExecucao
      };
    }

    // 3. Montagem do Contexto, Memória e Ferramentas
    const dadosContexto = await montarContextoEConexoes(
      userPrompt,
      sessionId,
      activeSpeakerName,
      speakerRole,
      visual.instrucaoVisualSistema
    );

    const mensagensBase = [
      { role: 'system', content: dadosContexto.promptSistemaCompleto },
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

    appendShortTermMemory(sessionId, 'user', userPrompt);
    appendShortTermMemory(sessionId, 'assistant', textoRespostaFinal);
    const tempoExecucaoMs = Date.now() - inicioExecucao;

    // 7. Persistência Assíncrona e Dopamina
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

    return {
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

    return {
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
  }
}

/**
 * Adaptador flexível de entrada
 */
export async function processarFluxoOrquestrador(arg1?: any, arg2?: any, arg3?: string, arg4?: any) {
  if (typeof arg1 === 'string') {
    const token = arg1 || 'Admin-Node';
    const prompt = typeof arg2 === 'string' ? arg2 : arg2?.textPrompt || arg2?.prompt || 'Verificar status';
    const sid = arg3 || arg2?.sessionId || `sess_${Date.now()}`;
    const sensory = arg4 || (typeof arg2 === 'object' ? arg2 : undefined);
    return processarExecucaoWorkflow(token, prompt, sid, sensory);
  }

  const params = arg1 || {};
  const token = params?.identityToken || params?.sensorData?.faceBadge || 'Admin-Node';
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