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
    agentName?: string;
    responseInstruction?: string;
    result: any;
    isReadySpecialistText?: boolean;
  }> = [];

  const normalizar = (str: string) =>
    (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');

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

    // Enriquecimento automático de ticker e query a partir do prompt do usuário
    const tickerMatch = String(userPrompt || '')
      .toUpperCase()
      .match(/\b([A-Z]{4}\d{1,2})\b/);
    if (tickerMatch && !argsParsed.symbol) {
      argsParsed.symbol = tickerMatch[1];
    }
    if (!argsParsed.task_details) {
      argsParsed.task_details = userPrompt;
    }
    if (!argsParsed.query) {
      argsParsed.query = argsParsed.symbol || userPrompt;
    }

    // 1. Delegação Segura para o Subagente Arquiteto (com travas de rate-limit)
    if (fnName === 'delegar_criacao_ou_ajuste_de_subagente' || fnName === 'create_or_update_ai_agent') {
      const intencao = argsParsed.intencao_do_subagente || argsParsed.description || userPrompt;
      const resFabrica = await executarDelegacaoSubagente(intencao, 'usuario_direto');

      triggeredAgentName = 'Arquiteto de Agentes';
      triggeredAgentId = 'fabrica_agentes';
      triggeredNodeType = 'code';

      saidasFerramentasParaSintese.push({
        toolName: fnName,
        agentName: triggeredAgentName,
        result: resFabrica
      });
      continue;
    }

    // 2. Conectores e Tools Administrativas Dinâmicas
    if (fnName === 'create_or_update_tool_connector') {
      triggeredAgentName = 'JARVIS (Gestor de Conectores)';
      triggeredAgentId = 'jarvis_core';
      triggeredNodeType = 'api';
      const res = await createOrUpdateToolFromBrain(argsParsed as any);
      saidasFerramentasParaSintese.push({ toolName: fnName, result: res });
      continue;
    }

    if (fnName === 'delete_tool_connector') {
      triggeredAgentName = 'JARVIS (Gestor de Conectores)';
      triggeredAgentId = 'jarvis_core';
      triggeredNodeType = 'api';
      const res = await deleteToolConnectorFromBrain({ provider_key: argsParsed.provider_key });
      saidasFerramentasParaSintese.push({ toolName: fnName, result: res });
      continue;
    }

    if (fnName === 'update_persona_and_behavior') {
      triggeredAgentName = 'JARVIS (Memória Evolutiva)';
      triggeredAgentId = argsParsed.target_slug || 'jarvis_core';
      triggeredNodeType = 'core';
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
      saidasFerramentasParaSintese.push({ toolName: fnName, agentName: triggeredAgentName, result: res });
      continue;
    }

    if (fnName === 'save_to_database') {
      triggeredAgentName = 'PostgreSQL Dinâmico';
      triggeredAgentId = 'save_to_database';
      triggeredNodeType = 'code';
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
        body: argsParsed.params || argsParsed,
        prompt: userPrompt
      });
      saidasFerramentasParaSintese.push({ toolName: fnName, agentName: triggeredAgentName, result: res });
      continue;
    }

    if (fnName === 'execute_ssh_command') {
      triggeredAgentName = 'Terminal SSH Remoto';
      triggeredAgentId = 'executar_comando_ssh';
      triggeredNodeType = 'ssh';
      const res = argsParsed.remoteFilePath
        ? await readRemoteFileViaSshToRag({ remoteFilePath: String(argsParsed.remoteFilePath) })
        : await executeSshCommand(argsParsed.command || 'uptime');
      saidasFerramentasParaSintese.push({ toolName: fnName, agentName: triggeredAgentName, result: res });
      continue;
    }

    // 3. Subagentes Especialistas Ativos (Busca Tolerante e Resiliente)
    const alvo = normalizar(fnName);

    const agenteCorrespondente = agentesAtivos.find((a: any) => {
      const slugNorm = normalizar(a.slug);
      const nomeNorm = normalizar(a.name);
      return (
        slugNorm === alvo ||
        nomeNorm === alvo ||
        (slugNorm.length >= 4 && alvo.includes(slugNorm)) ||
        (alvo.length >= 4 && slugNorm.includes(alvo)) ||
        (nomeNorm.length >= 4 && alvo.includes(nomeNorm)) ||
        (alvo.length >= 4 && nomeNorm.includes(alvo))
      );
    });

    if (agenteCorrespondente) {
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

      const ultimoElo = resultadoCadeia[resultadoCadeia.length - 1];
      triggeredAgentName = ultimoElo?.agentName || agenteCorrespondente.name;
      triggeredAgentId = ultimoElo?.agentSlug || agenteCorrespondente.slug;
      triggeredNodeType = ultimoElo?.agentType || agenteCorrespondente.agent_type || 'llm';

      const ultimaSaida = ultimoElo?.output;
      const ehTextoLimpo =
        typeof ultimaSaida === 'string' &&
        ultimaSaida.trim().length > 0 &&
        !ultimaSaida.trim().startsWith('{') &&
        !ultimaSaida.trim().startsWith('[') &&
        extractJsonActionBlocks(ultimaSaida).length === 0;

      saidasFerramentasParaSintese.push({
        toolName: triggeredAgentId,
        agentName: triggeredAgentName,
        responseInstruction: agenteComTempo.system_prompt || undefined,
        result: ehTextoLimpo ? ultimaSaida : resultadoCadeia,
        isReadySpecialistText: ehTextoLimpo
      });
      continue;
    }

    // 4. Conector Direto do Catálogo (Busca Exata ou Normalizada)
    let conectorAlvo = connectorsMap.get(fnName);
    let slugConectorFinal = fnName;

    if (!conectorAlvo) {
      for (const [k, v] of connectorsMap.entries()) {
        if (normalizar(k) === alvo || normalizar(v?.name) === alvo) {
          conectorAlvo = v;
          slugConectorFinal = k;
          break;
        }
      }
    }

    if (conectorAlvo || validToolSlugs.includes(fnName)) {
      triggeredAgentName = conectorAlvo?.name || fnName;
      triggeredAgentId = slugConectorFinal;
      triggeredNodeType = 'api';

      const saidaConector = await executeBoundTool(
        slugConectorFinal,
        argsParsed,
        userPrompt,
        connectorsMap,
        configuracaoCerebro.server_base_url
      );

      saidasFerramentasParaSintese.push({
        toolName: slugConectorFinal,
        agentName: triggeredAgentName,
        result: saidaConector
      });
    }
  }

  // 5. Síntese Contextual Humanizada (Desbloqueia resposta direta após execução da Tool)
  let textoFinal = '';
  if (
    saidasFerramentasParaSintese.length === 1 &&
    saidasFerramentasParaSintese[0].isReadySpecialistText &&
    typeof saidasFerramentasParaSintese[0].result === 'string'
  ) {
    textoFinal = saidasFerramentasParaSintese[0].result;
  } else {
    // Substitui a trava de delegação da 1ª passada por autorização de síntese final
    const mensagensSemTravaDePrimeiraPassada = [
      {
        role: 'system',
        content: `${configuracaoCerebro.system_prompt || 'Você é o JARVIS.'}\n${contextoTemporal}\n
[DIRETRIZ DE SÍNTESE PÓS-EXECUÇÃO]:
1. O subagente ou ferramenta (${triggeredAgentName}) JÁ FOI ACIONADO e retornou os dados reais abaixo.
2. Agora você está AUTORIZADO e DEVE responder diretamente ao usuário (${activeSpeakerName}) em português natural, fluido, inteligente e objetivo.
3. Apresente os valores, resultados ou confirmações obtidos sem inventar informações, sem mostrar blocos JSON e sem tentar invocar novas ferramentas.`
      },
      ...threadConversa.slice(-6),
      {
        role: 'user',
        content: `Pergunta original do usuário: "${userPrompt}"\n\nDados retornados por [${triggeredAgentName}]:\n${JSON.stringify(
          saidasFerramentasParaSintese,
          null,
          2
        )}\n\nFormule a resposta final para ${activeSpeakerName}:`
      }
    ];

    const segundaPassada: any = await callOpenAICompatibleLLM({
      provider: configuracaoCerebro.provider,
      model: configuracaoCerebro.model,
      apiKey: configuracaoCerebro.api_key,
      baseUrl: configuracaoCerebro.base_url,
      messages: mensagensSemTravaDePrimeiraPassada,
      temperature: configuracaoCerebro.temperature
    });

    textoFinal =
      segundaPassada?.choices?.[0]?.message?.content?.trim() ||
      JSON.stringify(saidasFerramentasParaSintese);
  }

  return {
    textoFinal,
    triggeredAgentName,
    triggeredAgentId,
    triggeredNodeType
  };
}
