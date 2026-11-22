import { callWebMcpTool, ensureActiveWebMcpTools } from "../webMcpService.js";
// src/services/orchestrator/despachanteFerramentas.ts
import { sanitizeToolName } from './brainConfigAndUtils.js';
import {
  createOrUpdateToolFromBrain,
  deleteToolConnectorFromBrain,
  updateAgentOrJarvisPersona,
  executeHackerSecuritySuite,
  executarDelegacaoSubagente,
  executarGerenciamentoMemoria
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
  toolsCatalogoOrquestrador?: any[];
}) {
  const trilhaExecucao: any[] = [];
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
    toolsCatalogoOrquestrador
  } = params;

  let triggeredAgentName = configuracaoCerebro.name || 'JARVIS';
  let triggeredAgentId = 'jarvis_core';
  let triggeredNodeType = 'core';

  const toolsUsadas: string[] = [];

  const saidasFerramentasParaSintese: Array<{
    step: number;
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

  const toolsSubagentesParaReAct: any[] =
    Array.isArray(toolsCatalogoOrquestrador) && toolsCatalogoOrquestrador.length > 0
      ? toolsCatalogoOrquestrador
      : agentesAtivos.map((ag: any) => {
          let toolsDoAgente: string[] = [];
          if (Array.isArray(ag.tools)) toolsDoAgente = ag.tools;
          else if (typeof ag.tools === 'string') {
            try {
              toolsDoAgente = JSON.parse(ag.tools || '[]');
            } catch {
              toolsDoAgente = [];
            }
          }
          return {
            type: 'function',
            function: {
              name: sanitizeToolName(ag.slug),
              description: `${ag.description?.trim() || `Especialista ${ag.name}.`} ${
                toolsDoAgente.length > 0 ? `Ferramentas: [${toolsDoAgente.join(', ')}].` : ''
              }`,
              parameters: {
                type: 'object',
                properties: {
                  task_details: {
                    type: 'string',
                    description:
                      'Instrução detalhada do que este especialista deve fazer agora, incluindo dados obtidos nos passos anteriores.'
                  },
                  symbol: { type: 'string', description: 'Ticker quando aplicável.' },
                  query: { type: 'string', description: 'Filtro, contacto, SQL ou parâmetro.' }
                },
                required: ['task_details']
              }
            }
          };
        });

  let filaToolCallsAtual: any[] = Array.isArray(toolCalls) ? [...toolCalls] : [];
  let cicloOrquestrador = 0;
  const MAX_ORCHESTRATOR_CYCLES = 6;
  let textoFinal = '';
  const assinaturasExecutadas = new Set<string>();

  while (filaToolCallsAtual.length > 0 && cicloOrquestrador < MAX_ORCHESTRATOR_CYCLES) {
    cicloOrquestrador++;

    for (const toolCall of filaToolCallsAtual) {
    // [WEBMCP_DESP_START]
    {
      const _rawFnName = String(toolCall?.function?.name || '').trim();
      const _cleanFnName = sanitizeToolName(_rawFnName);
      const _wmcpTools = await ensureActiveWebMcpTools(350);
      const _matchedWmcp = _wmcpTools.find(
        (wt) => wt.name === _rawFnName || sanitizeToolName(wt.name) === _cleanFnName
      );
      if (_matchedWmcp) {
        let _wmcpArgs: Record<string, any> = {};
        try {
          const _rawA = toolCall?.function?.arguments;
          _wmcpArgs = typeof _rawA === 'string' ? JSON.parse(_rawA || '{}') : (_rawA || {});
        } catch {}
        const _wmcpOut = await callWebMcpTool(_matchedWmcp.name, _wmcpArgs);
        triggeredAgentName = 'Controlador de Interface (WebMCP)';
        triggeredAgentId = _matchedWmcp.name;
        triggeredNodeType = 'api';
        toolsUsadas.push(_matchedWmcp.name);
        trilhaExecucao.push({
          step: trilhaExecucao.length + 1,
          kind: 'tool',
          slug: _matchedWmcp.name,
          name: _matchedWmcp.name,
          parentSlug: 'jarvis_core',
          status: 'ok'
        });
        const _resText =
          typeof _wmcpOut === 'string'
            ? _wmcpOut
            : _wmcpOut?.mensagem || `✅ Ação '${_matchedWmcp.name}' executada na interface.`;
        saidasFerramentasParaSintese.push({
          step: saidasFerramentasParaSintese.length + 1,
          toolName: _matchedWmcp.name,
          agentName: 'Controlador de Interface (WebMCP)',
          result: _resText,
          isReadySpecialistText: true
        });
        continue;
      }
    }
    // [WEBMCP_DESP_END]
      if (toolCall.type !== 'function') continue;

      const fnName = sanitizeToolName(toolCall.function?.name);
      const rawArgs = toolCall.function?.arguments || '{}';
      let argsParsed: Record<string, any> = {}
      ;
      try {
        argsParsed = JSON.parse(rawArgs);
      } catch {
        argsParsed = { task_details: rawArgs };
      }

      const assinaturaChamada = `${fnName}::${JSON.stringify(argsParsed)}`;
      if (assinaturasExecutadas.has(assinaturaChamada) && cicloOrquestrador > 1) {
        console.warn(`🛑 [Anti-Loop Orquestrador] Chamada idêntica ignorada: ${assinaturaChamada}`);
        continue;
      }
      assinaturasExecutadas.add(assinaturaChamada);

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

      if (saidasFerramentasParaSintese.length > 0) {
        argsParsed.etapasAnteriores = saidasFerramentasParaSintese.map((s) => ({
          especialista: s.agentName || s.toolName,
          resultado: s.result
        }));
        const contextoAcumuladoTexto = saidasFerramentasParaSintese
          .map((s, idx) => `[Etapa ${idx + 1} - ${s.agentName || s.toolName}]: ${typeof s.result === "string" ? s.result : JSON.stringify(s.result)}`)
          .join("\n");
        argsParsed.task_details = `${argsParsed.task_details}\n\n[DADOS OBTIDOS NAS ETAPAS ANTERIORES - USE ESTES DADOS E O CONTEÚDO ORIGINAL]:\n${contextoAcumuladoTexto}`;
      }

      // 0. Gestão Cognitiva de Memória (Curto, Médio e Longo Prazo)
      if (fnName === 'gerenciar_memoria_cognitiva') {
        const tipoMem = argsParsed.tipo_memoria || 'medio_prazo';
        triggeredAgentName =
          tipoMem === 'longo_prazo'
            ? 'Memória de Longo Prazo (RAG)'
            : tipoMem === 'curto_prazo'
            ? 'Memória de Curto Prazo (Sessão)'
            : 'Memória de Médio Prazo (Episódica)';
        triggeredAgentId = 'gerenciar_memoria_cognitiva';
        triggeredNodeType = 'code';
        toolsUsadas.push('gerenciar_memoria_cognitiva');

        const resMem = await executarGerenciamentoMemoria({
          acao: argsParsed.acao || 'salvar',
          tipo_memoria: tipoMem,
          id: argsParsed.id ? Number(argsParsed.id) : undefined,
          titulo: String(argsParsed.titulo || userPrompt.slice(0, 60)),
          conteudo: String(argsParsed.conteudo || userPrompt),
          categoria: argsParsed.categoria,
          dias_validade: argsParsed.dias_validade ? Number(argsParsed.dias_validade) : undefined,
          session_id: sessionId
        });

        trilhaExecucao.push({
          step: trilhaExecucao.length + 1,
          kind: 'tool',
          slug: 'gerenciar_memoria_cognitiva',
          name: triggeredAgentName,
          parentSlug: 'jarvis_core',
          status: resMem?.success === false ? 'error' : 'ok'
        });

        saidasFerramentasParaSintese.push({
          step: saidasFerramentasParaSintese.length + 1,
          toolName: fnName,
          agentName: triggeredAgentName,
          result: resMem
        });
        continue;
      }

      // 1. Delegação Segura para o Subagente Arquiteto
      if (fnName === 'delegar_criacao_ou_ajuste_de_subagente' || fnName === 'create_or_update_ai_agent') {
        const intencao = argsParsed.intencao_do_subagente || argsParsed.description || userPrompt;
        const resFabrica = await executarDelegacaoSubagente(intencao, 'usuario_direto');

        triggeredAgentName = 'Arquiteto de Agentes';
        triggeredAgentId = 'fabrica_agentes';
        triggeredNodeType = 'code';

        trilhaExecucao.push({
          step: trilhaExecucao.length + 1,
          kind: 'agent',
          slug: triggeredAgentId,
          name: triggeredAgentName,
          nodeType: 'code',
          parentSlug: 'jarvis_core',
          status: 'ok'
        });

        saidasFerramentasParaSintese.push({
          step: saidasFerramentasParaSintese.length + 1,
          toolName: fnName,
          agentName: triggeredAgentName,
          result: resFabrica
        });
        continue;
      }

      // 2. Conectores e Tools Administrativas Dinâmicas
      if (fnName === 'salvar_contato_agenda') {
        triggeredAgentName = 'Agenda de Contactos';
        triggeredAgentId = 'salvar_contato_agenda';
        triggeredNodeType = 'code';
        toolsUsadas.push('salvar_contato_agenda');
        const res = await executeBoundTool(
          'salvar_contato_agenda',
          argsParsed,
          userPrompt,
          connectorsMap,
          configuracaoCerebro.server_base_url
        );
        trilhaExecucao.push({
          step: trilhaExecucao.length + 1,
          kind: 'tool',
          slug: 'salvar_contato_agenda',
          name: 'Salvar Contacto na Agenda',
          parentSlug: 'jarvis_core',
          status: 'ok'
        });
        saidasFerramentasParaSintese.push({
          step: saidasFerramentasParaSintese.length + 1,
          toolName: fnName,
          agentName: triggeredAgentName,
          result: res
        });
        continue;
      }

      if (fnName === 'create_or_update_tool_connector') {
        triggeredAgentName = 'JARVIS (Gestor de Conectores)';
        triggeredAgentId = 'jarvis_core';
        triggeredNodeType = 'api';
        const res = await createOrUpdateToolFromBrain(argsParsed as any);
        saidasFerramentasParaSintese.push({
          step: saidasFerramentasParaSintese.length + 1,
          toolName: fnName,
          result: res
        });
        continue;
      }

      if (fnName === 'delete_tool_connector') {
        triggeredAgentName = 'JARVIS (Gestor de Conectores)';
        triggeredAgentId = 'jarvis_core';
        triggeredNodeType = 'api';
        const res = await deleteToolConnectorFromBrain({ provider_key: argsParsed.provider_key });
        saidasFerramentasParaSintese.push({
          step: saidasFerramentasParaSintese.length + 1,
          toolName: fnName,
          result: res
        });
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
        saidasFerramentasParaSintese.push({
          step: saidasFerramentasParaSintese.length + 1,
          toolName: fnName,
          result: res
        });
        continue;
      }

      if (fnName === 'hacker_sec_agent') {
        triggeredAgentName = 'Agente Hacker';
        triggeredAgentId = 'hacker_sec_agent';
        triggeredNodeType = 'code';
        const res = await executeHackerSecuritySuite(argsParsed as any);
        saidasFerramentasParaSintese.push({
          step: saidasFerramentasParaSintese.length + 1,
          toolName: fnName,
          agentName: triggeredAgentName,
          result: res
        });
        continue;
      }

      if (fnName === 'save_to_database') {
        triggeredAgentName = 'PostgreSQL Dinâmico';
        triggeredAgentId = 'save_to_database';
        triggeredNodeType = 'code';
        toolsUsadas.push('save_to_database');
        const res = await saveToDatabase({
          collectionName: argsParsed.collectionName || 'autonomous_logs',
          documentData: argsParsed.documentData || argsParsed,
          decisionReasoning: argsParsed.decisionReasoning
        });
        saidasFerramentasParaSintese.push({
          step: saidasFerramentasParaSintese.length + 1,
          toolName: fnName,
          result: res
        });
        continue;
      }

      if (fnName === 'execute_external_integration') {
        triggeredAgentName = `Protocolo: ${(argsParsed.provider || 'externo').toUpperCase()}`;
        triggeredAgentId = sanitizeToolName(argsParsed.provider || 'external_api');
        triggeredNodeType = 'api';
        toolsUsadas.push(triggeredAgentId);
        const res = await executeProtocolOrIntegration(argsParsed.provider, {
          protocol: argsParsed.provider,
          endpoint: argsParsed.endpoint,
          body: argsParsed.params || argsParsed,
          prompt: userPrompt
        });
        saidasFerramentasParaSintese.push({
          step: saidasFerramentasParaSintese.length + 1,
          toolName: fnName,
          agentName: triggeredAgentName,
          result: res
        });
        continue;
      }

      if (fnName === 'execute_ssh_command') {
        triggeredAgentName = 'Terminal SSH Remoto';
        triggeredAgentId = 'executar_comando_ssh';
        triggeredNodeType = 'ssh';
        toolsUsadas.push('executar_comando_ssh');
        const res = argsParsed.remoteFilePath
          ? await readRemoteFileViaSshToRag({ remoteFilePath: String(argsParsed.remoteFilePath) })
          : await executeSshCommand(argsParsed.command || 'uptime');
        saidasFerramentasParaSintese.push({
          step: saidasFerramentasParaSintese.length + 1,
          toolName: fnName,
          agentName: triggeredAgentName,
          result: res
        });
        continue;
      }

      
    // 3. Subagentes Especialistas Ativos (Busca Tolerante e Resiliente)
      const alvo = normalizar(fnName);

      const blk = new Set(['jarvis','agente','especialista','mcp','webmcp','tool','core','sistema']);
  const agenteCorrespondente =
    agentesAtivos.find((a: any) => normalizar(a.slug) === alvo || normalizar(a.name) === alvo) ||
    (!blk.has(alvo) ? agentesAtivos.find((a: any) => { const sl = normalizar(a.slug); return sl.length >= 6 && !blk.has(sl) && alvo.includes(sl); }) : undefined);

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

        const toolsDaCadeia = resultadoCadeia.flatMap((elo: any) => elo.executedTools || []);
        toolsUsadas.push(...toolsDaCadeia);

        for (const elo of resultadoCadeia) {
          if (Array.isArray(elo.traceSteps) && elo.traceSteps.length > 0) {
            for (const st of elo.traceSteps) {
              trilhaExecucao.push({ ...st, step: trilhaExecucao.length + 1 });
            }
          } else {
            trilhaExecucao.push({
              step: trilhaExecucao.length + 1,
              kind: 'agent',
              slug: elo.agentSlug || agenteCorrespondente.slug,
              name: elo.agentName || agenteCorrespondente.name,
              nodeType: elo.agentType || agenteCorrespondente.agent_type || 'llm',
              parentSlug: 'jarvis_core',
              status: 'ok'
            });
            for (const tSlug of elo.executedTools || []) {
              trilhaExecucao.push({
                step: trilhaExecucao.length + 1,
                kind: 'tool',
                slug: tSlug,
                name: tSlug,
                parentSlug: elo.agentSlug || agenteCorrespondente.slug,
                status: 'ok'
              });
            }
          }
        }

        const ultimaSaida = ultimoElo?.output;
        const ehTextoLimpo =
          typeof ultimaSaida === 'string' &&
          ultimaSaida.trim().length > 0 &&
          !ultimaSaida.trim().startsWith('{') &&
          !ultimaSaida.trim().startsWith('[') &&
          extractJsonActionBlocks(ultimaSaida).length === 0;

        saidasFerramentasParaSintese.push({
          step: saidasFerramentasParaSintese.length + 1,
          toolName: triggeredAgentId,
          agentName: triggeredAgentName,
          responseInstruction: agenteComTempo.system_prompt || undefined,
          result: ehTextoLimpo ? ultimaSaida : resultadoCadeia,
          isReadySpecialistText: ehTextoLimpo
        });
        continue;
      }

      // 4. Conector Direto do Catálogo
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

        trilhaExecucao.push({
          step: trilhaExecucao.length + 1,
          kind: 'tool',
          slug: slugConectorFinal,
          name: triggeredAgentName,
          parentSlug: 'jarvis_core',
          status: 'ok'
        });

        toolsUsadas.push(slugConectorFinal);

        saidasFerramentasParaSintese.push({
          step: saidasFerramentasParaSintese.length + 1,
          toolName: slugConectorFinal,
          agentName: triggeredAgentName,
          result: saidaConector
        });
      }
    }

    // 5. AVALIAÇÃO REACT DO ORQUESTRADOR (Continua até resolver todas as etapas necessárias)
    filaToolCallsAtual = [];
    if (saidasFerramentasParaSintese.length === 0) break;

    const resumoPassosExecutados = saidasFerramentasParaSintese
      .map(
        (s, idx) =>
          `Passo ${idx + 1} [${s.agentName || s.toolName}]: ${
            typeof s.result === 'string' ? s.result : JSON.stringify(s.result)
          }`
      )
      .join('\n\n');

    const mensagensAvaliacaoReAct = [
      {
        role: 'system',
        content: `${String(configuracaoCerebro.system_prompt || 'Você é o JARVIS.').replace(
          /REGRA CRÍTICA DE EXECUÇÃO:[\s\S]*?\n\n/,
          ''
        )}\n${contextoTemporal}\n
[MOTOR DE ORQUESTRAÇÃO DINÂMICA MULTI-AGENTE (REACT)]:
1. Analise o pedido original do utilizador ("${userPrompt}") e os passos que JÁ FORAM EXECUTADOS abaixo.
2. SE O PEDIDO EXIGIR MÚLTIPLAS ETAPAS (ex: ler e-mail ou cotação -> consultar telefone de contacto no banco SQL -> enviar mensagem no WhatsApp / gravar ficheiro / acionar dispositivo) e alguma etapa AINDA NÃO FOI EXECUTADA:
   - Acione IMEDIATAMENTE a Tool Call do próximo Especialista necessário passando em "task_details" os dados obtidos nos passos anteriores!
   - NUNCA peça ao utilizador um número ou dado que pode ser consultado pelo Especialista SQL (mcp_postgres).
   - NUNCA afirme que enviou uma mensagem se a ferramenta de envio ainda não constar nos passos executados.
3. SE TODAS AS ETAPAS DO PEDIDO JÁ FORAM CONCLUÍDAS COM SUCESSO:
   - NÃO chame mais nenhuma ferramenta.
   - Responda diretamente ao utilizador (${activeSpeakerName}) em português natural, fluido, inteligente e objetivo, consolidando o resultado final.`
      },
      ...threadConversa.slice(-4),
      {
        role: 'user',
        content: `Pedido original: "${userPrompt}"\n\n[PASSOS E DADOS JÁ EXECUTADOS NESTE TURNO]:\n${resumoPassosExecutados}\n\nSe ainda faltar acionar outro especialista para concluir o pedido completo, dispare a tool call dele agora. Caso contrário, escreva a resposta final para ${activeSpeakerName}.`
      }
    ];

    const avaliacaoPassada: any = await callOpenAICompatibleLLM({
      provider: configuracaoCerebro.provider,
      model: configuracaoCerebro.model,
      apiKey: configuracaoCerebro.api_key,
      baseUrl: configuracaoCerebro.base_url,
      messages: mensagensAvaliacaoReAct,
      tools: cicloOrquestrador < MAX_ORCHESTRATOR_CYCLES ? toolsSubagentesParaReAct : undefined,
      temperature: configuracaoCerebro.temperature
    });

    const msgEscolhaReAct = avaliacaoPassada?.choices?.[0]?.message;
    const novasToolCalls = Array.isArray(msgEscolhaReAct?.tool_calls)
      ? msgEscolhaReAct.tool_calls
      : [];

    if (novasToolCalls.length > 0 && cicloOrquestrador < MAX_ORCHESTRATOR_CYCLES) {
      filaToolCallsAtual = novasToolCalls;
      continue;
    }

    const conteudoReAct = String(msgEscolhaReAct?.content || "").trim();
    const blocosReAct = extractJsonActionBlocks(conteudoReAct);
    if (blocosReAct.length > 0 && cicloOrquestrador < MAX_ORCHESTRATOR_CYCLES) {
      filaToolCallsAtual = blocosReAct
        .map((b: any, i: number) => ({
          id: `react_fb_${Date.now()}_${i}`,
          type: "function",
          function: {
            name: sanitizeToolName(b.slug || b.tool || b.name || b.agent || ""),
            arguments: JSON.stringify(b.payload || b.params || b.arguments || b)
          }
        }))
        .filter((tc: any) => tc.function.name);
      if (filaToolCallsAtual.length > 0) continue;
    }

    // [AUTO_CONTINUACAO_WHATSAPP]
    const pedeEnvioWhatsAppExplicito =
      /\b(whatsapp|zap)\b/i.test(userPrompt) &&
      /\b(mande|manda|envie|envia|encaminhe|encaminha)\b/i.test(userPrompt);
    const jaExecutouWhatsApp =
      toolsUsadas.some((t) => t.includes('whatsapp')) ||
      saidasFerramentasParaSintese.some((s) => String(s.toolName).includes('whatsapp'));
    if (pedeEnvioWhatsAppExplicito && !jaExecutouWhatsApp && cicloOrquestrador < MAX_ORCHESTRATOR_CYCLES) {
      const agWhats = agentesAtivos.find(
        (a) => normalizar(a.slug).includes('whatsapp') || normalizar(a.name).includes('whatsapp')
      );
      if (agWhats) {
        const resumoDados = saidasFerramentasParaSintese
          .map((s, i) => '[Passo ' + (i + 1) + ' - ' + (s.agentName || s.toolName) + ']: ' + (typeof s.result === 'string' ? s.result : JSON.stringify(s.result)))
          .join('\n');
        filaToolCallsAtual = [
          {
            id: 'auto_whats_' + Date.now(),
            type: 'function',
            function: {
              name: sanitizeToolName(agWhats.slug),
              arguments: JSON.stringify({
                task_details: 'Pedido do utilizador: "' + userPrompt + '". Envie no WhatsApp utilizando o telefone localizado na Memória de Longo Prazo (Agenda de Contatos).\n\nDados coletados:\n' + resumoDados
              })
            }
          }
        ];
        continue;
      }
    }

    textoFinal = msgEscolhaReAct?.content?.trim() || '';
    break;
  }

  if (!textoFinal && saidasFerramentasParaSintese.length > 0) {
    const ultimoItem = saidasFerramentasParaSintese[saidasFerramentasParaSintese.length - 1];
    if (typeof ultimoItem.result === 'string' && ultimoItem.result.trim().length > 0) {
      textoFinal = ultimoItem.result.trim();
    } else {
      textoFinal = JSON.stringify(saidasFerramentasParaSintese.map((s) => s.result));
    }
  }

  return {
    textoFinal,
    triggeredAgentName,
    triggeredAgentId,
    triggeredNodeType,
    executedTools: Array.from(new Set(toolsUsadas)),
    executionTrace: trilhaExecucao
  };
}
