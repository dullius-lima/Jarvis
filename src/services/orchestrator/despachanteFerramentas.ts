// src/services/orchestrator/despachanteFerramentas.ts
import { sanitizeToolName } from './brainConfigAndUtils.js';
import {
  createOrUpdateToolFromBrain,
  deleteToolConnectorFromBrain,
  updateAgentOrJarvisPersona,
  executeHackerSecuritySuite,
  executarDelegacaoSubagente
} from './brainMetaTools.js';
import { saveToDatabase } from './catalogAndDatabase.js';
import {
  callOpenAICompatibleLLM,
  executeBoundTool,
  executeSpecialistPipeline
} from './llmAndPipelineRunner.js';
import { executeProtocolOrIntegration } from '../integrationAndProtocolService.js';
import { executeSshCommand, readRemoteFileViaSshToRag } from '../sshService.js';
import { extractJsonActionBlocks } from '../jsonActionInterceptor.js';

export async function processarChamadasDeFerramentas(params: {
  toolCalls: any[];
  configuracaoCerebro: any;
  contextoTemporal: string;
  agentesAtivos: any[];
  connectorsMap: Map<string, any>;
  validToolSlugs: string[];
  activeSpeakerName: string;
  sessionId: string;
  threadConversa: any[];
  userPrompt: string;
  mensagensBase: any[];
}) {
  const {
    toolCalls,
    configuracaoCerebro,
    contextoTemporal,
    agentesAtivos,
    connectorsMap,
    validToolSlugs,
    activeSpeakerName,
    sessionId,
    threadConversa,
    userPrompt,
    mensagensBase
  } = params;

  let triggeredAgentName = configuracaoCerebro.name || 'JARVIS';
  let triggeredAgentId = 'jarvis_core';
  let triggeredNodeType = 'core';

  const saidasFerramentasParaSintese: Array<{
    toolName: string;
    responseInstruction?: string;
    result: any;
    isReadySpecialistText?: boolean;
  }> = [];

  for (const toolCall of toolCalls) {
    if (toolCall.type !== 'function') continue;

    const fnName = sanitizeToolName(toolCall.function?.name);
    const rawArgs = toolCall.function?.arguments || '{}';
    let argsParsed: Record<string, any> = {};
    try {
      argsParsed = JSON.parse(rawArgs);
    } catch {
      argsParsed = { task_details: rawArgs };
    }

    // 1. Delegação Segura para o Subagente Arquiteto (com travas de rate-limit)
    if (fnName === 'delegar_criacao_ou_ajuste_de_subagente' || fnName === 'create_or_update_ai_agent') {
      const intencao = argsParsed.intencao_do_subagente || argsParsed.description || userPrompt;
      const resFabrica = await executarDelegacaoSubagente(intencao, 'usuario_direto');

      triggeredAgentName = 'Subagente Arquiteto';
      triggeredAgentId = 'fabrica_agentes';
      triggeredNodeType = 'code';

      saidasFerramentasParaSintese.push({
        toolName: fnName,
        result: resFabrica
      });
      continue;
    }

    // 2. Conectores e Tools Dinâmicas
    if (fnName === 'create_or_update_tool_connector') {
      const res = await createOrUpdateToolFromBrain(argsParsed as any);
      saidasFerramentasParaSintese.push({ toolName: fnName, result: res });
      continue;
    }

    if (fnName === 'delete_tool_connector') {
      const res = await deleteToolConnectorFromBrain({ provider_key: argsParsed.provider_key });
      saidasFerramentasParaSintese.push({ toolName: fnName, result: res });
      continue;
    }

    if (fnName === 'update_persona_and_behavior') {
      const res = await updateAgentOrJarvisPersona({
        target_slug: argsParsed.target_slug || 'jarvis_core',
        behavior_instruction: argsParsed.behavior_instruction || userPrompt,
        replace_entire_prompt: Boolean(argsParsed.replace_entire_prompt)
      });
      saidasFerramentasParaSintese.push({ toolName: fnName, result: res });
      continue;
    }

    if (fnName === 'hacker_sec_agent') {
      triggeredAgentName = 'Agente Hacker';
      triggeredAgentId = 'hacker_sec_agent';
      triggeredNodeType = 'code';
      const res = await executeHackerSecuritySuite(argsParsed as any);
      saidasFerramentasParaSintese.push({ toolName: fnName, result: res });
      continue;
    }

    if (fnName === 'save_to_database') {
      const res = await saveToDatabase({
        collectionName: argsParsed.collectionName || 'autonomous_logs',
        documentData: argsParsed.documentData || argsParsed,
        decisionReasoning: argsParsed.decisionReasoning
      });
      saidasFerramentasParaSintese.push({ toolName: fnName, result: res });
      continue;
    }

    if (fnName === 'execute_external_integration') {
      triggeredAgentName = `Protocolo: ${(argsParsed.provider || 'externo').toUpperCase()}`;
      triggeredAgentId = sanitizeToolName(argsParsed.provider || 'external_api');
      triggeredNodeType = 'api';
      const res = await executeProtocolOrIntegration(argsParsed.provider, {
        protocol: argsParsed.provider,
        endpoint: argsParsed.endpoint,
        body: argsParsed.params || argsParsed
      });
      saidasFerramentasParaSintese.push({ toolName: fnName, result: res });
      continue;
    }

    if (fnName === 'execute_ssh_command') {
      triggeredAgentId = 'executar_comando_ssh';
      triggeredNodeType = 'ssh';
      const res = argsParsed.remoteFilePath
        ? await readRemoteFileViaSshToRag({ remoteFilePath: String(argsParsed.remoteFilePath) })
        : await executeSshCommand(argsParsed.command || 'uptime');
      saidasFerramentasParaSintese.push({ toolName: fnName, result: res });
      continue;
    }

    // 3. Subagentes Especialistas Ativos
    const agenteCorrespondente = agentesAtivos.find(
      (a: any) => sanitizeToolName(a.slug) === fnName
    );

    if (agenteCorrespondente) {
      triggeredAgentName = agenteCorrespondente.name;
      triggeredAgentId = agenteCorrespondente.slug;
      triggeredNodeType = agenteCorrespondente.agent_type || 'llm';

      const agenteComTempo = {
        ...agenteCorrespondente,
        system_prompt: `${agenteCorrespondente.system_prompt || ''}\n${contextoTemporal}`
      };

      const resultadoCadeia = await executeSpecialistPipeline(
        agenteComTempo,
        argsParsed,
        sessionId,
        activeSpeakerName,
        threadConversa,
        configuracaoCerebro.server_base_url,
        userPrompt,
        configuracaoCerebro,
        connectorsMap
      );

      const ultimaSaida = resultadoCadeia[resultadoCadeia.length - 1]?.output;
      const ehTextoLimpo =
        typeof ultimaSaida === 'string' &&
        ultimaSaida.trim().length > 0 &&
        extractJsonActionBlocks(ultimaSaida).length === 0;

      saidasFerramentasParaSintese.push({
        toolName: agenteCorrespondente.slug,
        responseInstruction: agenteComTempo.system_prompt || undefined,
        result: ehTextoLimpo ? ultimaSaida : resultadoCadeia,
        isReadySpecialistText: ehTextoLimpo
      });
      continue;
    }

    // 4. Conector Direto do Catálogo
    if (connectorsMap.has(fnName) || validToolSlugs.includes(fnName)) {
      triggeredAgentId = fnName;
      triggeredNodeType = 'api';
      const saidaConector = await executeBoundTool(
        fnName,
        argsParsed,
        userPrompt,
        connectorsMap,
        configuracaoCerebro.server_base_url
      );
      saidasFerramentasParaSintese.push({ toolName: fnName, result: saidaConector });
    }
  }

  // Síntese Contextual
  let textoFinal = '';
  if (
    saidasFerramentasParaSintese.length === 1 &&
    saidasFerramentasParaSintese[0].isReadySpecialistText &&
    typeof saidasFerramentasParaSintese[0].result === 'string'
  ) {
    textoFinal = saidasFerramentasParaSintese[0].result;
  } else {
    const mensagensSintese = [
      ...mensagensBase,
      {
        role: 'user',
        content: `Os nós retornaram os seguintes dados:\n${JSON.stringify(
          saidasFerramentasParaSintese,
          null,
          2
        )}\n\nSintetize a resposta final ao usuário em linguagem natural clara, sem blocos de JSON soltos.`
      }
    ];

    const segundaPassada: any = await callOpenAICompatibleLLM({
      provider: configuracaoCerebro.provider,
      model: configuracaoCerebro.model,
      apiKey: configuracaoCerebro.api_key,
      baseUrl: configuracaoCerebro.base_url,
      messages: mensagensSintese,
      temperature: configuracaoCerebro.temperature
    });

    textoFinal = segundaPassada?.choices?.[0]?.message?.content || JSON.stringify(saidasFerramentasParaSintese);
  }

  return {
    textoFinal,
    triggeredAgentName,
    triggeredAgentId,
    triggeredNodeType
  };
}