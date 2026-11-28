import { lookupSemanticRoute, learnSemanticRoute, invalidateSemanticRouteCache } from "./semanticRouteCacheService.js";
import { validateAuthorizedDevice } from './deviceRegistryService.js';
import { tryHandleUiControlCommand, executeDeviceUiAction } from './uiControlService.js';
import { requestLiveSensoryFrame, detectSensoryIntent, handleSensoryStopCommand } from './sensoryRouterService.js';
import { sendToDeviceById } from './deviceMeshService.js';
import { matchAndStoreVisualCapture, promoteLastCaptureToFamiliar } from './visualMemoryService.js';
import { captureVscreenFrame, launchAppOnVscreen } from './agentVscreenBridge.js';
import { callWebMcpTool, ensureActiveWebMcpTools, tryUniversalWebMcpAutoExec } from "./webMcpService.js";
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
  executeBoundTool,
  executeSpecialistPipeline,
  executeSpecialistNode,
  executeAgentChain
} from './orchestrator/llmAndPipelineRunner.js';

import { processarBiometriaESaudacao, processarEntradaVisual } from './orchestrator/cortexSensorial.js';
import { montarContextoEConexoes } from './orchestrator/montadorPromptEConexoes.js';
import { processarChamadasDeFerramentas } from './orchestrator/despachanteFerramentas.js';
import { interceptarAcaoAgenda } from './orchestrator/interceptadorAgenda.js';

// Re-exportações de tipos e utilitários
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
 * Localização flexível e resiliente de Agentes Especialistas
 */
function encontrarAgenteResiliente(fnName: string, agentes: any[]) {
  if (!fnName || !Array.isArray(agentes)) return undefined;
  const n = (x: string) => (x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const alvo = n(fnName);
  const blk = new Set(['jarvis','agente','especialista','mcp','webmcp','tool','core','sistema']);
  if (!alvo || blk.has(alvo)) return undefined;
  return agentes.find((a: any) => n(a.slug) === alvo || n(a.name) === alvo)
    || agentes.find((a: any) => { const sl = n(a.slug); return sl.length >= 6 && !blk.has(sl) && alvo.includes(sl); });
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

  const trilhaGlobalTurno: any[] = [];
  let passosRotaFinal: any[] = [];
  let rotaCompletaTexto = '🧠 JARVIS';
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
      const respPronta: any = filtroSensorial.respostaPronta;
      if (respPronta && typeof respPronta === 'object' && !respPronta.data) {
        respPronta.data = { ...respPronta };
      }
      return respPronta;
    }

    const { activeSpeakerName, speakerRole, isVoiceIdentified } = filtroSensorial;
    if (filtroSensorial.promptTranscrito && filtroSensorial.promptTranscrito.trim().length > 0) {
      userPrompt = filtroSensorial.promptTranscrito.trim();
    }

    // 1.1 Fast-Path instantâneo (< 5ms) para hora local sem viagem externa à LLM
    const _normFast = userPrompt
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f.?!,-]/g, '')
      .replace(/\bjarvis\b/g, '')
      .trim();
    if (/^(que horas sao|que hora e|horas|qual o horario|me diga as horas)$/.test(_normFast)) {
      const _hora = new Date().toLocaleTimeString('pt-BR', {
        timeZone: 'America/Campo_Grande',
        hour: '2-digit',
        minute: '2-digit'
      });
      const _respHora: any = {
        success: true,
        triggeredSuccess: true,
        agent: 'JARVIS (Núcleo Instantâneo)',
        agentId: 'jarvis_core',
        nodeType: 'core',
        executedTools: [],
        memoryStored: false,
        memoryCount: 0,
        identity: activeSpeakerName,
        sessionId,
        response: `Agora são ${_hora}, ${activeSpeakerName}.`,
        executionTimeMs: Date.now() - inicioExecucao,
        data: null as any
      };
      _respHora.data = { ..._respHora };
      return _respHora;
    }

    // 2. Visão Multimodal
    const originDev = String(sensoryInput?.deviceId || sensoryInput?.sensorData?.deviceId || '').trim();
  const originToken = String(sensoryInput?.deviceToken || sensoryInput?.sensorData?.deviceToken || '').trim();
  if (originDev) {
    const authDev = await validateAuthorizedDevice(originDev, originToken).catch(() => null);
    if (!authDev) {
      return {
        success: true,
        triggeredSuccess: true,
        agent: 'JARVIS (Segurança de Dispositivos)',
        agentId: 'jarvis_device_guard',
        nodeType: 'core',
        executedTools: [],
        response: 'Dispositivo não autorizado. Abra o JARVIS neste aparelho e insira o Código de Acesso gerado na aba Dispositivos da conta principal.',
        executionTimeMs: Date.now() - inicioExecucao,
        data: null as any
      };
    }
    userPrompt = `${userPrompt}\n[ORIGEM DO CONTATO]: Dispositivo "${authDev.custom_name}" (ID: ${authDev.device_id} | Tipo: ${authDev.device_type} | Perfil: ${authDev.owner_profile}${authDev.is_primary ? ' | CONTA PRINCIPAL' : ''}).`;
  }
  const famMatch = userPrompt.match(/^(?:jarvis[,\s]+)?(?:esse|essa|este|esta)\s+[eé]\s+(?:o\s+|a\s+|meu\s+irm[aã]o\s+|minha\s+irm[aã]\s+|meu\s+pai\s+|minha\s+m[aã]e\s+|minha\s+esposa\s+|meu\s+filho\s+|minha\s+filha\s+)?([a-zA-ZÀ-ÿ ]{2,40})$/i);
  if (famMatch && !/quem|que|isso|aquilo/i.test(famMatch[1])) {
    const msgFam = await promoteLastCaptureToFamiliar(famMatch[1]);
    return { success: true, triggeredSuccess: true, agent: 'JARVIS (Biometria Visual 512D)', agentId: 'jarvis_visual_bio', nodeType: 'core', executedTools: ['jarvis_visual_memory'], response: msgFam, executionTimeMs: Date.now() - inicioExecucao, data: null as any };
  }

  const uiRes = await tryHandleUiControlCommand(userPrompt, originDev);
  if (uiRes && uiRes.handled) {
    return { success: true, triggeredSuccess: true, agent: 'JARVIS (Controle de Tela & Cursor)', agentId: 'jarvis_ui_control', nodeType: 'core', executedTools: ['ui_control'], response: uiRes.response, executionTimeMs: Date.now() - inicioExecucao, data: null as any };
  }

  const sCheck = detectSensoryIntent(userPrompt, originDev, sessionId);
  if (sCheck.stopAction) {
    const stopMsg = handleSensoryStopCommand(sCheck.stopAction, sessionId, sendToDeviceById);
    return { success: true, triggeredSuccess: true, agent: 'JARVIS (Córtex Visual)', agentId: 'jarvis_vision', nodeType: 'core', executedTools: [], response: stopMsg, executionTimeMs: Date.now() - inicioExecucao, data: null as any };
  }

  const hasFrame = Boolean(sensoryInput?.webcamFrame || sensoryInput?.screenFrame || sensoryInput?.sensorData?.webcamFrame || sensoryInput?.sensorData?.screenFrame);
  let offlineTarget: string | undefined;
  if (!hasFrame && sCheck.isVisual) {
    const liveCap = await requestLiveSensoryFrame(userPrompt, originDev, sessionId, sendToDeviceById);
    offlineTarget = liveCap.offlineDevice;
    if (liveCap.frame) {
      sensoryInput = sensoryInput || {};
      sensoryInput.sensorData = sensoryInput.sensorData || {};
      if (liveCap.intent.modality === 'screen') {
        sensoryInput.screenFrame = liveCap.frame;
        sensoryInput.sensorData.screenFrame = liveCap.frame;
      } else {
        sensoryInput.webcamFrame = liveCap.frame;
        sensoryInput.sensorData.webcamFrame = liveCap.frame;
      }
    }
  }

  const camNow = sensoryInput?.webcamFrame || sensoryInput?.sensorData?.webcamFrame;
  if (camNow) {
    const bioRes = await matchAndStoreVisualCapture({ imageBase64: camNow, deviceId: sCheck.targetDeviceId || originDev, analiseInicial: userPrompt }).catch(() => null);
    if (bioRes) { const st = (globalThis as any).__jarvisSensoryStatus; if (st && st.active) { st.identifiedName = bioRes.nome; st.isFamiliar = bioRes.isFamiliar; st.updatedAt = Date.now(); } userPrompt = `${userPrompt}\n[MEMÓRIA VISUAL 512 PARÂMETROS]: ${bioRes.matchSummary}`; }
  }
  if (sCheck.armAction) {
    userPrompt = `${userPrompt}\n[MODO ARMADO ATIVO]: Confirme brevemente ao usuário que a ${sCheck.armAction === 'camera' ? 'câmera' : 'tela'} de ${sCheck.targetLabel} ficará ativa sob demanda (sem gasto de tokens em repouso) até ele pedir para encerrar.`;
  }

  const visual = processarEntradaVisual(sensoryInput, userPrompt, activeSpeakerName);
  if (visual.ehPerguntaVisual && !visual.frameAtivo && offlineTarget) {
    return { success: true, triggeredSuccess: true, agent: 'JARVIS (Córtex Visual)', agentId: 'jarvis_vision', nodeType: 'core', executedTools: [], response: `Não consegui conectar ao sensor de ${offlineTarget} no momento. Abra o app JARVIS nesse aparelho para mantê-lo ativo na rede.`, executionTimeMs: Date.now() - inicioExecucao, data: null as any };
  }
    if ((visual.ehPerguntaVisual || (sCheck.isVisual && !sCheck.stopAction)) && !visual.frameAtivo) {
      const respVisual = {
        success: true,
        triggeredSuccess: true,
        agent: 'JARVIS (Córtex Visual)',
        agentId: 'jarvis_vision',
        nodeType: 'core',
        executedTools: [],
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

    // 3.05 Registra Ferramenta Global de Controle de Dispositivos (Celular, TV, PC, Watch)
    if (!dadosContexto.tools.some((t: any) => t.function?.name === 'controlar_dispositivo')) {
      dadosContexto.tools.push({
        type: 'function',
        function: {
          name: 'controlar_dispositivo',
          description: 'Controla diretamente o celular (galaxy_s25), TV TCL (tv_sala), PC (pc_windows) ou relógio (galaxy_watch): abre aplicativos, lê os elementos da tela, clica em botões/ícones, digita e pesquisa dentro de apps, rola a tela, busca documentos/arquivos internos e abre arquivos. Pode ser chamada em sequência (ex: open_app -> read_screen -> click_text -> type_and_search) para mergulhar dentro de qualquer app.',
          parameters: {
            type: 'object',
            properties: {
              dispositivo: { type: 'string', enum: ['galaxy_s25', 'tv_sala', 'pc_windows', 'galaxy_watch'], description: 'Dispositivo alvo.' },
              acao: { type: 'string', enum: ['open_app', 'read_screen', 'click_text', 'type_text', 'type_and_search', 'scroll', 'global', 'search_files', 'open_file'], description: 'Ação a executar na tela ou armazenamento.' },
              valor: { type: 'string', description: 'Nome do app, texto para clicar/digitar, direção (up/down/left/right), tecla (back/home), termo de busca de arquivo ou caminho completo do arquivo.' }
            },
            required: ['acao']
          }
        }
      });
    }

    // 3.1 Registra a Ferramenta Nativa de Aprendizado Permanente
    if (!dadosContexto.tools.some((t: any) => t.function?.name === 'salvar_memoria_permanente')) {
      dadosContexto.tools.push({
        type: 'function',
        function: {
          name: 'salvar_memoria_permanente',
          description: 'Acione quando o usuário solicitar mudanças na sua forma de falar, tom de voz, regras pessoais ou preferências.',
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
                description: 'A instrução, preferência ou fato exato a ser memorizado.'
              },
              agente_alvo: {
                type: 'string',
                description: 'Deixe vazio ou use "jarvis_core" para regras gerais.'
              }
            },
            required: ['tipo', 'conteudo']
          }
        }
      });
    }

    const promptSistemaBlindado = `${dadosContexto.promptSistemaCompleto}

[DIRETRIZES DE DELEGAÇÃO E APRENDIZADO DO JARVIS]:
1. DELEGAÇÃO OBRIGATÓRIA: Se a dúvida ou comando for do domínio de um dos Agentes Especialistas Ativos listados acima, você está PROIBIDO de responder diretamente como JARVIS e proibido de inventar dados. É OBRIGATÓRIO acionar a Tool Call do respectivo subagente.
2. APRENDIZADO ATIVO: Sempre que o usuário disser como deseja ser tratado, estilo de resposta (ex: "seja mais direto", "responda em tópicos") ou pedir para memorizar algo ("guarde na sua memória", "lembre-se disso"), invoque a ferramenta "salvar_memoria_permanente".
3. HUMANIZAÇÃO: Fale de forma inteligente, polida, empática e objetiva em português. NUNCA gere mensagens em branco nem responda com comandos técnicos soltos.`;

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

    // [NOVO] Conjunto acumulador das ferramentas executadas nesta execução
    let executedTools: string[] = [];

    // 5. Execução de Ferramentas Nativas / Especialistas
    // [WEBMCP_STEP5_START]
    // 5.0 Converte qualquer bloco <tool_call>...</tool_call> emitido em texto para tool_calls nativas
    if (typeof textoRespostaFinal === 'string' && textoRespostaFinal.includes('<tool_call>')) {
      const _rxTc = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
      const _extractedCalls: any[] = [];
      let _mTc: RegExpExecArray | null;
      while ((_mTc = _rxTc.exec(textoRespostaFinal)) !== null) {
        const _inner = String(_mTc[1] || '').trim();
        let _fn = '';
        let _argsObj: Record<string, any> = {};
        if (_inner.startsWith('{')) {
          try {
            const _o = JSON.parse(_inner);
            _fn = String(_o.name || _o.tool || _o.tool_name || _o.function || '').trim();
            const _ra = _o.arguments ?? _o.args ?? _o.params ?? _o.parameters ?? {};
            _argsObj = typeof _ra === 'string' ? JSON.parse(_ra) : (_ra || {});
          } catch {}
        } else {
          const _bIdx = _inner.indexOf('{');
          if (_bIdx !== -1) {
            _fn = _inner.slice(0, _bIdx).trim().replace(/\(.*$/, '').trim();
            const _jPart = _inner.slice(_bIdx).replace(/\)\s*$/, '').trim();
            try { _argsObj = JSON.parse(_jPart); } catch {}
          } else {
            _fn = _inner.replace(/\(\s*\)\s*$/, '').trim();
          }
        }
        if (_fn) {
          _extractedCalls.push({
            id: `call_wmcp_${Date.now()}_${_extractedCalls.length}`,
            type: 'function',
            function: { name: _fn, arguments: JSON.stringify(_argsObj) }
          });
        }
      }
      if (_extractedCalls.length > 0 && mensagemEscolha) {
        mensagemEscolha.tool_calls = [
          ...(Array.isArray(mensagemEscolha.tool_calls) ? mensagemEscolha.tool_calls : []),
          ..._extractedCalls
        ];
        textoRespostaFinal = textoRespostaFinal.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim();
        mensagemEscolha.content = textoRespostaFinal;
      }
    }

    // 5.0.1 Execução Universal Direta para ferramentas WebMCP ativas na tela (descoberta via schema vivo)
    if (Array.isArray(mensagemEscolha?.tool_calls) && mensagemEscolha.tool_calls.length > 0) {
      const _liveWmcp = await ensureActiveWebMcpTools(0);
      if (_liveWmcp.length > 0) {
        const _remainingCalls: any[] = [];
        for (const _tc of mensagemEscolha.tool_calls) {
          const _rawName = String(_tc?.function?.name || '').trim();
          const _cleanName = sanitizeToolName(_rawName);
          const _matchedWmcp = _liveWmcp.find(
            (wt) => wt.name === _rawName || sanitizeToolName(wt.name) === _cleanName
          );
          if (_matchedWmcp) {
            let _wArgs: Record<string, any> = {};
            try {
              const _ra = _tc?.function?.arguments;
              _wArgs = typeof _ra === 'string' ? JSON.parse(_ra || '{}') : (_ra || {});
            } catch {}
            const _wmcpOut = await callWebMcpTool(_matchedWmcp.name, _wArgs);
            textoRespostaFinal =
              typeof _wmcpOut === 'string'
                ? _wmcpOut
                : _wmcpOut?.mensagem || `✅ Ação '${_matchedWmcp.name}' executada na interface.`;
            triggeredAgentName = 'Controlador de Interface (WebMCP)';
            triggeredAgentId = _matchedWmcp.name;
            triggeredNodeType = 'api';
            executedTools.push(_matchedWmcp.name);
            trilhaGlobalTurno.push({
              step: trilhaGlobalTurno.length + 1,
              kind: 'tool',
              slug: _matchedWmcp.name,
              name: _matchedWmcp.name,
              parentSlug: 'jarvis_core',
              status: 'ok'
            });
          } else {
            _remainingCalls.push(_tc);
          }
        }
        mensagemEscolha.tool_calls = _remainingCalls;
      }
    }

    // 5.0.2 Contingência semântica universal caso a LLM apenas narre a ação ("Vou abrir a aba...") sem emitir tool_call
    if (executedTools.length === 0 && (!Array.isArray(mensagemEscolha?.tool_calls) || mensagemEscolha.tool_calls.length === 0) && (await ensureActiveWebMcpTools(0)).length > 0) {
      try {
        const _autoWmcp = await tryUniversalWebMcpAutoExec(String(userPrompt || ''), String(textoRespostaFinal || ''));
        if (_autoWmcp) {
          textoRespostaFinal =
            typeof _autoWmcp.result === 'string'
              ? _autoWmcp.result
              : _autoWmcp.result?.mensagem || `✅ Ação '${_autoWmcp.toolName}' executada na interface.`;
          triggeredAgentName = 'Controlador de Interface (WebMCP)';
          triggeredAgentId = _autoWmcp.toolName;
          triggeredNodeType = 'api';
          executedTools.push(_autoWmcp.toolName);
        }
      } catch (_wErr: any) {
        console.warn('[WebMCP AutoExec]', _wErr?.message || _wErr);
      }
    }
    // [WEBMCP_STEP5_END]

    if (Array.isArray(mensagemEscolha?.tool_calls) && mensagemEscolha.tool_calls.length > 0) {
      const callMemoria = mensagemEscolha.tool_calls.find(
        (tc: any) => sanitizeToolName(tc.function?.name) === 'salvar_memoria_permanente'
      );

      const callDevControl = mensagemEscolha.tool_calls.find(
          (tc: any) => sanitizeToolName(tc.function?.name) === 'controlar_dispositivo'
        );

        if (callDevControl) {
          const loopMsgs: any[] = [...mensagensBase, mensagemEscolha];
          let currentCalls = mensagemEscolha.tool_calls.filter((tc: any) => sanitizeToolName(tc.function?.name) === 'controlar_dispositivo');
          let stepCount = 0;

          while (currentCalls.length > 0 && stepCount < 5) {
            stepCount++;
            for (const tc of currentCalls) {
              let a: any = {};
              try { a = JSON.parse(tc.function?.arguments || '{}'); } catch {}
              const dev = a.dispositivo || originDev || 'galaxy_s25';
              const act = String(a.acao || 'read_screen');
              const val = String(a.valor || '');
              const pld: Record<string, any> =
                act === 'open_app' ? { app: val } :
                act === 'scroll' ? { direction: val || 'down' } :
                act === 'global' ? { key: val || 'back' } :
                act === 'search_files' ? { query: val } :
                act === 'open_file' ? { path: val } :
                { text: val };

              const resDev = await executeDeviceUiAction(dev, act, pld);
              if (act === 'open_app' && resDev.ok) await new Promise((r) => setTimeout(r, 900));
              executedTools.push(`controlar_dispositivo:${act}`);
              loopMsgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(resDev) });
            }

            const nextPass: any = await callOpenAICompatibleLLM({
              provider: dadosContexto.configuracaoCerebro.provider,
              model: dadosContexto.configuracaoCerebro.model,
              apiKey: dadosContexto.configuracaoCerebro.api_key,
              baseUrl: dadosContexto.configuracaoCerebro.base_url,
              messages: loopMsgs,
              tools: dadosContexto.tools.filter((t: any) => t.function?.name === 'controlar_dispositivo'),
              temperature: 0.1
            });
            const nextMsg = nextPass?.choices?.[0]?.message;
            if (!nextMsg) break;
            loopMsgs.push(nextMsg);
            if (Array.isArray(nextMsg.tool_calls) && nextMsg.tool_calls.length > 0) {
              currentCalls = nextMsg.tool_calls;
            } else {
              textoRespostaFinal = nextMsg.content || 'Ação concluída no dispositivo.';
              break;
            }
          }
          triggeredAgentName = 'JARVIS (Controle Global de Dispositivos)';
          triggeredAgentId = 'jarvis_device_navigator';
          triggeredNodeType = 'api';
        } else if (callMemoria) {
        let argsMem: any = {};
        try { argsMem = JSON.parse(callMemoria.function?.arguments || '{}'); } catch { argsMem = {}; }

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

        textoRespostaFinal = `Compreendido perfeitamente, ${activeSpeakerName}! Guardei essa instrução na minha memória permanente.`;
        triggeredAgentName = 'JARVIS (Memória Evolutiva)';
        triggeredAgentId = 'jarvis_core';
        triggeredNodeType = 'core';
        executedTools.push('salvar_memoria_permanente');
      } else {
        for (const tc of mensagemEscolha.tool_calls) {
          const rawName = tc.function?.name || '';
          const matchAg = encontrarAgenteResiliente(rawName, dadosContexto.agentesAtivos);
          if (matchAg && tc.function) {
            tc.function.name = sanitizeToolName(matchAg.slug);
          }
        }

        // [NOVO] Chamada do despachante capturando executedTools
        const resultadoDespacho = await processarChamadasDeFerramentas({
          toolCalls: mensagemEscolha.tool_calls,
          configuracaoCerebro: dadosContexto.configuracaoCerebro,
          contextoTemporal: dadosContexto.contextoTemporal,
          agentesAtivos: dadosContexto.agentesAtivos,
          connectorsMap: dadosContexto.connectorsMap,
          validToolSlugs: dadosContexto.validToolSlugs,
            toolsCatalogoOrquestrador: dadosContexto.tools,
          activeSpeakerName,
          sessionId,
          threadConversa: dadosContexto.threadConversa,
          userPrompt,
          mensagensBase
        });
      if (Array.isArray(resultadoDespacho?.executionTrace) && resultadoDespacho.executionTrace.length > 0) {
        for (const st of resultadoDespacho.executionTrace) {
          trilhaGlobalTurno.push({ ...st, step: trilhaGlobalTurno.length + 1 });
        }
      } else if (resultadoDespacho?.triggeredAgentId && resultadoDespacho.triggeredAgentId !== 'jarvis_core') {
        trilhaGlobalTurno.push({
          step: trilhaGlobalTurno.length + 1,
          kind: 'agent',
          slug: resultadoDespacho.triggeredAgentId,
          name: resultadoDespacho.triggeredAgentName || resultadoDespacho.triggeredAgentId,
          parentSlug: 'jarvis_core',
          status: 'ok'
        });
      }

        textoRespostaFinal = resultadoDespacho.textoFinal;
        triggeredAgentName = resultadoDespacho.triggeredAgentName;
        triggeredAgentId = resultadoDespacho.triggeredAgentId;
        triggeredNodeType = resultadoDespacho.triggeredNodeType;
        executedTools = resultadoDespacho.executedTools || [];
      }
    } else {
      // 5.1 Heurística de Memória
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

          await ingestDocumentToRag(`[MEMÓRIA APRENDIDA]: ${regraExtraida}`, {
            sessionId,
            category: 'memoria_permanente',
            speaker: activeSpeakerName
          }).catch(() => {});

          textoRespostaFinal = `Entendido, ${activeSpeakerName}! Guardei isso na minha memória permanente: "${regraExtraida}".`;
          triggeredAgentName = 'JARVIS (Memória Evolutiva)';
          triggeredAgentId = 'jarvis_core';
          executedTools.push('salvar_memoria_permanente');
        }
      }
    }

    // __XML_GLOBAL_GUARD__
  if (textoRespostaFinal && textoRespostaFinal.includes('<function=')) {
    const rxXml = new RegExp(
      '<function=([a-zA-Z0-9_.-]+)[>\\s]*' +
      '(\\{[\\s\\S]*?\\})?\\s*(?:</function>|$)',
      'g'
    );
    const xmlCalls: any[] = [];
    let xm: any;
    while ((xm = rxXml.exec(textoRespostaFinal)) !== null) {
      const rawNm = xm[1].trim();
      const matchAg = encontrarAgenteResiliente(
        rawNm,
        dadosContexto.agentesAtivos
      );
      const finalNm = matchAg
        ? sanitizeToolName(matchAg.slug)
        : sanitizeToolName(rawNm);
      let argStr = (xm[2] || '{}').trim().replace(/\\"/g, '"');
      try { JSON.parse(argStr); } catch { argStr = '{}'; }
      xmlCalls.push({
        id: 'xml_' + Date.now() + '_' + xmlCalls.length,
        type: 'function',
        function: { name: finalNm, arguments: argStr }
      });
    }
    if (xmlCalls.length > 0) {
      const resXml = await processarChamadasDeFerramentas({
        toolCalls: xmlCalls,
        configuracaoCerebro: dadosContexto.configuracaoCerebro,
        contextoTemporal: dadosContexto.contextoTemporal,
        agentesAtivos: dadosContexto.agentesAtivos,
        connectorsMap: dadosContexto.connectorsMap,
        validToolSlugs: dadosContexto.validToolSlugs,
        toolsCatalogoOrquestrador: dadosContexto.tools,
        activeSpeakerName,
        sessionId,
        threadConversa: dadosContexto.threadConversa,
        userPrompt,
        mensagensBase
      });
      textoRespostaFinal = resXml.textoFinal;
      triggeredAgentName = resXml.triggeredAgentName;
      triggeredAgentId = resXml.triggeredAgentId;
      triggeredNodeType = resXml.triggeredNodeType;
      executedTools = resXml.executedTools || [];
      if (Array.isArray(resXml.executionTrace)) {
        for (const st of resXml.executionTrace) {
          trilhaGlobalTurno.push({
            ...st,
            step: trilhaGlobalTurno.length + 1
          });
        }
      }
    }
  }

  // 6. INTERCEPTAÇÃO DE CHAMADAS PSEUDO-TEXTO
    const textoLimpoPrimeiraLinha = textoRespostaFinal.trim().split('\n')[0].trim();
    const matchColchete = textoRespostaFinal.match(
      /\[\s*(?:acionando|executando|chamando|delegando\s+para)\s+(?:o|a)?\s*([^\]]+)\]/i
    );
    const ehPseudoComandoTexto =
      Boolean(matchColchete) ||
      /^[a-z0-9_]{3,50}(?:\s+[a-z0-9_]+=[^\s]+.*|\s+list_events.*|\s+get_.*|---.*)?$/i.test(textoLimpoPrimeiraLinha) ||
      textoLimpoPrimeiraLinha.includes('query=') ||
      textoLimpoPrimeiraLinha.includes('date=') ||
      textoLimpoPrimeiraLinha.includes('consultar_mercado') ||
      textoLimpoPrimeiraLinha.includes('home_detector');

    if (ehPseudoComandoTexto) {
      const alvoBruto = matchColchete
        ? matchColchete[1].trim()
        : textoLimpoPrimeiraLinha.split(/[\s=]/)[0];
      const primeiroToken = sanitizeToolName(alvoBruto);

      // Procura se esse comando pertence a um Subagente ou Conector
      const agenteProprietario =
        encontrarAgenteResiliente(alvoBruto, dadosContexto.agentesAtivos) ||
        dadosContexto.agentesAtivos.find((ag: any) => {
        const slugNorm = sanitizeToolName(ag.slug);
        const toolsJson = JSON.stringify(ag.tools || []).toLowerCase();
        return slugNorm === primeiroToken || (Array.isArray(ag.tools) && ag.tools.map((t: any) => sanitizeToolName(String(t))).includes(primeiroToken));
      });

      // Extrai ticker ou query do comando
      const matchTicker = (textoRespostaFinal + ' ' + userPrompt).toUpperCase().match(/\b([A-Z]{4}\d{1,2})\b/);
      const extractedQuery = matchTicker ? matchTicker[1] : userPrompt;

      if (agenteProprietario) {
        triggeredAgentName = agenteProprietario.name;
        triggeredAgentId = agenteProprietario.slug;
        triggeredNodeType = agenteProprietario.agent_type || 'llm';

        const execCadeia = await executeSpecialistPipeline(
          agenteProprietario,
          { task_details: userPrompt, symbol: matchTicker ? matchTicker[1] : undefined, query: extractedQuery },
          sessionId,
          activeSpeakerName,
          dadosContexto.threadConversa,
          dadosContexto.configuracaoCerebro.server_base_url,
          userPrompt,
          dadosContexto.configuracaoCerebro,
          dadosContexto.connectorsMap
        );

        // Extrai tools executadas na cadeia do subagente
        const toolsSub = execCadeia.flatMap((elo: any) => elo.executedTools || []);
        executedTools.push(...toolsSub);

        const saidaElo = execCadeia[execCadeia.length - 1]?.output;
        if (saidaElo && typeof saidaElo === 'object' && typeof saidaElo.relatorio === 'string') {
          textoRespostaFinal = saidaElo.relatorio;
        } else if (typeof saidaElo === 'string' && saidaElo.length > 0 && !saidaElo.startsWith('{')) {
          textoRespostaFinal = saidaElo;
        } else {
          const sintese: any = await callOpenAICompatibleLLM({
            provider: dadosContexto.configuracaoCerebro.provider,
            model: dadosContexto.configuracaoCerebro.model,
            apiKey: dadosContexto.configuracaoCerebro.api_key,
            baseUrl: dadosContexto.configuracaoCerebro.base_url,
            messages: [
              {
                role: 'system',
                content: `Você é o JARVIS. Sintetize em português natural e executivo o resultado retornado pelo especialista ${agenteProprietario.name}. NUNCA exiba código JSON nem comandos.`
              },
              { role: 'user', content: `Pergunta: "${userPrompt}"\nDados: ${JSON.stringify(saidaElo || execCadeia)}` }
            ],
            temperature: 0.2
          });
          textoRespostaFinal = sintese?.choices?.[0]?.message?.content || 'Operação concluída pelo especialista.';
        }
      } else if (dadosContexto.connectorsMap.has(primeiroToken) || dadosContexto.validToolSlugs.includes(primeiroToken)) {
        triggeredAgentName = dadosContexto.connectorsMap.get(primeiroToken)?.name || primeiroToken;
        triggeredAgentId = primeiroToken;
        triggeredNodeType = 'api';
        executedTools.push(primeiroToken);

        const outBound = await executeBoundTool(
          primeiroToken,
          { query: extractedQuery, symbol: matchTicker ? matchTicker[1] : undefined, task_details: userPrompt },
          userPrompt,
          dadosContexto.connectorsMap,
          dadosContexto.configuracaoCerebro.server_base_url
        );

        const sintese: any = await callOpenAICompatibleLLM({
          provider: dadosContexto.configuracaoCerebro.provider,
          model: dadosContexto.configuracaoCerebro.model,
          apiKey: dadosContexto.configuracaoCerebro.api_key,
          baseUrl: dadosContexto.configuracaoCerebro.base_url,
          messages: [
            { role: 'system', content: 'Você é o JARVIS. Apresente os dados obtidos de forma amigável, clara e humana em português.' },
            { role: 'user', content: `Pergunta: "${userPrompt}"\nDados da ferramenta: ${JSON.stringify(outBound)}` }
          ],
          temperature: 0.2
        });
        textoRespostaFinal = sintese?.choices?.[0]?.message?.content || JSON.stringify(outBound);
      }
    }

    // 7. Interceptação de Agendamento e JSON Residual
    const acaoAgenda = await interceptarAcaoAgenda(textoRespostaFinal);
    if (acaoAgenda.interceptado && acaoAgenda.respostaTexto) {
      textoRespostaFinal = acaoAgenda.respostaTexto;
      triggeredAgentName = 'Agente de Agendamento';
      triggeredAgentId = 'calendar_agent';
      triggeredNodeType = 'api';
      executedTools.push('google_calendar');
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
          if (interceptado.agentSlug) {
            executedTools.push(interceptado.agentSlug);
          }
        }
      }
    }

    // 8. Blindagem Anti-Vazio
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
            content: `DIRETRIZ DE SÍNTESE OBRIGATÓRIA: Responda ao usuário (${activeSpeakerName}) de forma amigável, acolhedora, clara e em português. NUNCA deixe o retorno vazio e NUNCA retorne código JSON solto.`
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

    // 9. Persistência e Emissão Sináptica
    passosRotaFinal = trilhaGlobalTurno.length > 0
      ? trilhaGlobalTurno
      : (typeof triggeredAgentId !== 'undefined' && triggeredAgentId && triggeredAgentId !== 'jarvis_core'
          ? [{ step: 1, kind: 'agent', slug: triggeredAgentId, name: (typeof triggeredAgentName !== 'undefined' ? triggeredAgentName : triggeredAgentId), parentSlug: 'jarvis_core', status: 'ok' }]
          : []);
    // __DEDUP_TRACE_PREFIX__
    {
      const semConsecutivos: any[] = [];
      for (const it of passosRotaFinal) {
        const prev = semConsecutivos[semConsecutivos.length - 1];
        if (prev && prev.kind === it.kind && prev.slug === it.slug) continue;
        semConsecutivos.push(it);
      }
      passosRotaFinal = semConsecutivos.map((it, idx) => ({ ...it, step: idx + 1 }));
    }
    rotaCompletaTexto = ['🧠 JARVIS', ...passosRotaFinal.map((p: any) => `${p.kind === 'tool' ? '🔧' : '🤖'} ${p.name || p.slug}`)].join(' ➔ ');
    console.log('[ROTA COMPLETA]', rotaCompletaTexto);
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
          JSON.stringify({ response: textoRespostaFinal, rota_completa: rotaCompletaTexto, executionTrace: passosRotaFinal,
      rotaCompleta: rotaCompletaTexto}),
          tempoExecucaoMs
        ]
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

    // [NOVO] Retorno com executedTools desduplicado no nível superior e dentro de data
    const retornoExecucao: any = {
      success: true,
      triggeredSuccess: true,
      agent: triggeredAgentName,
      agentId: triggeredAgentId,
      nodeType: triggeredNodeType,
      executedTools: Array.from(new Set(executedTools)),
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
      executedTools: [],
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
 * Adaptador flexível de entrada
 */
export async function processarFluxoOrquestrador(arg1?: any, arg2?: any, arg3?: string, arg4?: any) {
  if (typeof arg1 === 'string') {
    const token = arg1 || 'Matheus-Admin';
    const prompt = typeof arg2 === 'string' ? arg2 : arg2?.textPrompt || arg2?.prompt || 'Verificar status';
    const sid = arg3 || arg2?.sessionId || `sess_${Date.now()}`;
    const sensory = arg4 || (typeof arg2 === 'object' ? arg2 : undefined);
    return processarExecucaoWorkflowComCache(token, prompt, sid, sensory);
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
  return processarExecucaoWorkflowComCache(token, prompt, sid, sensoryData);
}

export const processarEstimuloOrquestrador = async (identityToken: string, sensorData: any) => {
  return processarFluxoOrquestrador({ identityToken, sensorData });
};

// __SEMANTIC_ROUTE_CACHE_HOOK__
const _execucaoOriginalWorkflow = processarExecucaoWorkflow;
export async function processarExecucaoWorkflowComCache(
  identityToken: string,
  userPrompt: string,
  sessionId = `sess_${Date.now()}`,
  sensoryInput?: any
) {
  const t0 = Date.now();
  const ehMutacaoOuEstado = /\b(registr\w+|salv\w+|atualiz\w+|cri\w+|apag\w+|exclu\w+|lembr\w+|memoriz\w+|grafo|agora|que horas|c[aâ]mera|tela)\b/i.test(userPrompt);
  const temMidia = Boolean(sensoryInput?.audioBase64 || sensoryInput?.screenFrame || sensoryInput?.webcamFrame || sensoryInput?.sensorData?.audioBase64 || sensoryInput?.sensorData?.screenFrame || sensoryInput?.sensorData?.webcamFrame);

  if (!ehMutacaoOuEstado && !temMidia) {
    try {
      const hit = await lookupSemanticRoute(userPrompt, 0.88);
      if (hit.hit && hit.route?.agent_slug) {
        const agRes = await pool.query(`SELECT * FROM ai_agents WHERE LOWER(slug) = LOWER($1) AND is_active = TRUE LIMIT 1;`, [hit.route.agent_slug]);
        if (agRes.rows.length > 0) {
          const ag = agRes.rows[0];
          const brainCfg = await getCentralBrainConfig();
          const { connectorsMap } = await getDynamicToolsCatalog();
          const cadeia = await executeSpecialistPipeline(
            ag,
            { task_details: userPrompt, query: userPrompt },
            sessionId,
            identityToken || "Matheus-Admin",
            [],
            brainCfg.server_base_url,
            userPrompt,
            brainCfg,
            connectorsMap
          );
          const ultimo = cadeia[cadeia.length - 1];
          const outText = typeof ultimo?.output === "string" ? ultimo.output : JSON.stringify(ultimo?.output ?? cadeia);
          if (outText && outText.trim().length > 2) {
            appendShortTermMemory(sessionId, "user", userPrompt);
            appendShortTermMemory(sessionId, "assistant", outText);
            return {
              success: true,
              triggeredSuccess: true,
              agent: `${ag.name} ⚡ [Cache Semântico ${Math.round(hit.similarity * 100)}%]`,
              agentId: ag.slug,
              nodeType: ag.agent_type || "llm",
              semanticCacheHit: true,
              semanticSimilarity: hit.similarity,
              memoryStored: true,
              identity: identityToken || "Matheus-Admin",
              sessionId,
              response: outText,
              executionTimeMs: Date.now() - t0
            };
          }
        }
      }
    } catch {}
  }

  const resultado: any = await _execucaoOriginalWorkflow(identityToken, userPrompt, sessionId, sensoryInput);

  try {
    const tools: string[] = Array.isArray(resultado?.executedTools) ? resultado.executedTools : [];
    const houveMutacao = tools.some((t) =>
      ["registrar_grafo_conhecimento", "gerenciar_memoria_cognitiva", "salvar_memoria_permanente", "create_or_update_ai_agent", "delete_tool_connector", "update_persona_and_behavior"].includes(t)
    );
    if (houveMutacao) {
      await invalidateSemanticRouteCache();
    } else if (
      resultado?.success &&
      !ehMutacaoOuEstado &&
      resultado?.agentId &&
      !["jarvis_core", "jarvis_vision", "fanout_parallel"].includes(resultado.agentId)
    ) {
      await learnSemanticRoute({
        promptSample: userPrompt,
        agentSlug: resultado.agentId,
        agentName: resultado.agent,
        toolName: tools[0]
      });
    }
  } catch {}

  return resultado;
}

// Aliases para retrocompatibilidade
export const processWorkflowExecution = processarExecucaoWorkflowComCache;
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
