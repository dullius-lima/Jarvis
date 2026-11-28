import { queryRelevantSubgraph } from "../knowledgeGraphService.js";
import { ensureActiveWebMcpTools } from "../webMcpService.js";
// src/services/orchestrator/montadorPromptEConexoes.ts
import { pool } from '../../config/database.js';
import { searchVectorDocuments } from '../ragService.js';
import { getCentralBrainConfig, sanitizeToolName } from './brainConfigAndUtils.js';
import { getDynamicToolsCatalog } from './catalogAndDatabase.js';
import { toolDelegarCriacaoSubagente, toolGerenciarMemoria,
    toolRegistrarGrafoConhecimento, toolRegistrarGrafoConhecimento } from './brainMetaTools.js';

export async function montarContextoEConexoes(
  userPrompt: string,
  sessionId: string,
  activeSpeakerName: string,
  speakerRole: string,
  instrucaoVisual: string
) {
  // Carregamento paralelo completo das 3 camadas de memória: Curto Prazo, Médio Prazo e Longo Prazo (RAG + Contatos)
  const [
    configuracaoCerebro,
    historicoRes,
    linhasRag,
    longoPrazoFixoRes,
    contatosRes,
    episodicaRes,
    candidatosRes,
    todosAgentesRes,
    dadosCatalogoTools
  ] = await Promise.all([
    getCentralBrainConfig(),
    pool
      .query(`SELECT role, content FROM jarvis_chat_memory WHERE session_id = $1 ORDER BY id DESC LIMIT 8;`, [sessionId])
      .catch(() => ({ rows: [] as any[] })),
    searchVectorDocuments(userPrompt, 3).catch(() => []),
    pool
      .query(
        `SELECT id, title, category, content
         FROM vector_documents
         WHERE category IN ('contatos', 'permanente')
         ORDER BY id DESC
         LIMIT 8;`
      )
      .catch(() => ({ rows: [] as any[] })),
    pool
      .query(`SELECT nome, telefone, apelidos FROM contatos_agenda ORDER BY nome ASC LIMIT 100;`)
      .catch(() => ({ rows: [] as any[] })),
    pool
      .query(
        `SELECT id, categoria, titulo, conteudo, expires_at
         FROM jarvis_episodic_memory
         WHERE expires_at > NOW() ORDER BY created_at DESC LIMIT 10;`
      )
      .catch(() => ({ rows: [] as any[] })),
    pool
      .query(
        `SELECT LOWER(TRIM(titulo)) AS chave, MAX(titulo) AS titulo, MAX(conteudo) AS conteudo, COUNT(*)::int AS qtd
         FROM jarvis_episodic_memory
         WHERE created_at >= NOW() - INTERVAL '14 days'
         GROUP BY LOWER(TRIM(titulo))
         HAVING COUNT(*) >= 3
         ORDER BY COUNT(*) DESC
         LIMIT 1;`
      )
      .catch(() => ({ rows: [] as any[] })),
    pool.query(`SELECT * FROM ai_agents ORDER BY is_active DESC, id ASC;`).catch(() => ({ rows: [] as any[] })),
    getDynamicToolsCatalog()
  ]);

  const agora = new Date();
  const contextoTemporal = `\n[CONTEXTO TEMPORAL ATUAL DO SISTEMA]:
- Data e Hora Atual do Servidor: ${agora.toLocaleString('pt-BR', { timeZone: 'America/Campo_Grande' })}
- ISO 8601: ${agora.toISOString()}
- Fuso Horário Local: America/Campo_Grande (UTC-4)`;

  const historicoCronologico = [...historicoRes.rows].reverse();
  const threadConversa = historicoCronologico.map((r: any) => ({
    role: r.role,
    content: r.content
  }));

  // 1. Longo Prazo: Contatos (unificados entre contatos_agenda e vector_documents)
  const mapaContatos = new Map<string, string>();
  for (const c of contatosRes.rows) {
    const chave = String(c.nome || '').toLowerCase().trim();
    if (!chave) continue;
    const apelidosTxt = Array.isArray(c.apelidos) && c.apelidos.length > 0 ? ` | Apelidos/Vínculos: ${c.apelidos.join(', ')}` : '';
    mapaContatos.set(chave, `- Nome: ${c.nome} | Telefone: ${c.telefone}${apelidosTxt}`);
  }
  const textoAgenda =
    mapaContatos.size > 0
      ? Array.from(mapaContatos.values()).join('\n')
      : 'Nenhum contato salvo na memória de longo prazo.';

  // 2. Médio Prazo: Memória Episódica Ativa (15 a 180 dias)
  const textoMedioPrazo =
    episodicaRes.rows.length > 0
      ? episodicaRes.rows
          .map((e: any) => {
            const expira = e.expires_at ? new Date(e.expires_at).toLocaleDateString('pt-BR') : '21d';
            return `- [ID:${e.id} | ${e.categoria} | expira em ${expira}] ${e.titulo}: ${e.conteudo}`;
          })
          .join('\n')
      : 'Nenhuma memória episódica ativa no momento.';

  // 3. Longo Prazo: Fatos Permanentes + Busca Semântica RAG
  const seenRag = new Set<string>();
  const itensLongoPrazo: string[] = [];

  for (const doc of longoPrazoFixoRes.rows) {
    if (doc.category === 'contatos') continue;
    const txt = String(doc.content || '').trim();
    if (txt && !seenRag.has(txt)) {
      seenRag.add(txt);
      itensLongoPrazo.push(`- [${doc.title || 'Permanente'}] ${txt}`);
    }
  }

  const listaRag = Array.isArray(linhasRag) ? linhasRag : (linhasRag as any)?.matches || [];
  for (const m of listaRag) {
    if ((m.similarity ?? 1) <= 0.12) continue;
    const txt = String(m.content || '').trim();
    if (txt && !seenRag.has(txt)) {
      seenRag.add(txt);
      itensLongoPrazo.push(`- ${txt}`);
    }
  }
  const textoLongoPrazo =
    itensLongoPrazo.length > 0
      ? itensLongoPrazo.join('\n')
      : 'Nenhum documento adicional indexado no RAG.';

  const avisoConsolidacao =
    candidatosRes.rows.length > 0
      ? `\n[CONSOLIDAÇÃO AUTÔNOMA DE MEMÓRIA]: O padrão "${candidatosRes.rows[0].titulo}" (${candidatosRes.rows[0].conteudo}) foi citado ${candidatosRes.rows[0].qtd} vezes nos últimos 14 dias. Ao final da resposta, pergunte de forma natural se o usuário deseja promovê-lo definitivamente para a memória de longo prazo.`
      : '';

  const contextoMemoriaCompleto = [
    `[GOVERNANÇA DE MEMÓRIA EM 3 NÍVEIS - OBRIGATÓRIO]:
1. CURTO PRAZO (Sessão Atual): Histórico imediato da conversa acima. Não precisa salvar manualmente.
2. MÉDIO PRAZO (15 a 180 dias): Para listas de compras, lembretes, tarefas ativas e projetos temporários, use SEMPRE a ferramenta "gerenciar_memoria_cognitiva" com tipo_memoria="medio_prazo" (contexto_semanal: 15-30d; tarefa_ativa: 45-60d; projeto: 90-180d). NUNCA crie arquivos .md/.txt na VM nem tente salvar listas no Notion sem ordem explícita.
3. ATUALIZAR / CONCLUIR MÉDIO PRAZO: Se já existir item em [MEMÓRIA EPISÓDICA ATIVA], use acao="atualizar" com o ID para incluir/remover itens, ou acao="concluir" ao finalizar.
3. GRAFO RELACIONAL (PRIORIDADE MÁXIMA): Sempre que o usuário informar ou corrigir entidades e vínculos duráveis (pessoas, hospitais, locais de trabalho, endereços, clínicas, empresas, ativos, imóveis ou dispositivos), invoque OBRIGATORIAMENTE "registrar_grafo_conhecimento" (NÃO use gerenciar_memoria_cognitiva para entidades/locais/vínculos). Preencha oldSource/oldTarget apenas ao corrigir um nome anterior.
4. LONGO PRAZO (Permanente & Contatos): Contatos telefônicos e regras permanentes ficam na Memória de Longo Prazo. Para salvar contatos, use "salvar_contato_agenda" ou "gerenciar_memoria_cognitiva" (tipo_memoria="longo_prazo", categoria="contato"). Para consultar números já listados abaixo em [MEMÓRIA DE LONGO PRAZO - CONTATOS], leia diretamente daqui e repasse o telefone ao especialista (ex: WhatsApp) sem pedir o número ao usuário.`,
    `[MEMÓRIA DE LONGO PRAZO - AGENDA DE CONTATOS]:\n${textoAgenda}`,
    `[MEMÓRIA DE MÉDIO PRAZO - EPISÓDICA ATIVA]:\n${textoMedioPrazo}`,
    `[MEMÓRIA DE LONGO PRAZO - FATOS E DOCUMENTOS (RAG)]:\n${textoLongoPrazo}`,
    avisoConsolidacao
  ]
    .filter(Boolean)
    .join('\n\n');

  const todosAgentes = todosAgentesRes.rows;
  const agentesAtivos = todosAgentes.filter((a: any) => a.is_active !== false);
  const agentesInativos = todosAgentes.filter((a: any) => a.is_active === false);

  const { catalog: catalogoAoVivo, connectorsMap } = dadosCatalogoTools;
  const validToolSlugs = catalogoAoVivo.map((t: any) => t.slug);

  const resumoAgentesAtivos =
    agentesAtivos.length > 0
      ? agentesAtivos
          .map((a: any) => {
            let toolsList: string[] = [];
            if (Array.isArray(a.tools)) toolsList = a.tools;
            else if (typeof a.tools === 'string') {
              try { toolsList = JSON.parse(a.tools || '[]'); } catch { toolsList = []; }
            }
            return `- [ESPECIALISTA ATIVO] Nome: "${a.name}" | Slug de Chamada: "${sanitizeToolName(a.slug)}"
  Domínio: ${a.description || 'Geral'}
  Ferramentas sob seu comando: ${toolsList.length > 0 ? `[${toolsList.join(', ')}]` : '[Nenhuma tool externa]'}
  Diretriz: Para demandas deste assunto, acione a ferramenta de função "${sanitizeToolName(a.slug)}".`;
          })
          .join('\n\n')
      : 'Nenhum especialista ativo no momento.';

  const resumoAgentesInativos =
    agentesInativos.length > 0
      ? agentesInativos
          .map((a: any) => `- [PAUSADO] "${a.name}" (slug: "${sanitizeToolName(a.slug)}")`)
          .join('\n')
      : 'Nenhum especialista pausado.';

  const tools: any[] = agentesAtivos.map((ag: any) => {
    let toolsDoAgente: string[] = [];
    if (Array.isArray(ag.tools)) toolsDoAgente = ag.tools;
    else if (typeof ag.tools === 'string') {
      try { toolsDoAgente = JSON.parse(ag.tools || '[]'); } catch { toolsDoAgente = []; }
    }

    const descEnriquecida = `${ag.description?.trim() || `Especialista ${ag.name}.`} ${
      toolsDoAgente.length > 0 ? `Controla as seguintes ferramentas técnicas: [${toolsDoAgente.join(', ')}].` : ''
    } Acione este agente para tarefas do seu domínio.`;

    return {
      type: 'function',
      function: {
        name: sanitizeToolName(ag.slug),
        description: descEnriquecida,
        parameters: {
          type: 'object',
          properties: {
            task_details: {
              type: 'string',
              description: 'Pergunta, dados técnicos ou instrução completa para o especialista.'
            },
            symbol: {
              type: 'string',
              description: 'Ticker/código quando aplicável (ex: SUZB3, PETR4, VALE3).'
            },
            query: {
              type: 'string',
              description: 'Termo de pesquisa, data ou parâmetro específico da tarefa.'
            }
          },
          required: ['task_details']
        }
      }
    };
  });

  // Tools Administrativas e de Memória Cognitiva (Curto, Médio e Longo Prazo)
  tools.push(
    toolGerenciarMemoria, toolRegistrarGrafoConhecimento,
    toolDelegarCriacaoSubagente,
    {
      type: 'function',
      function: {
        name: 'salvar_contato_agenda',
        description: 'Salva ou atualiza um contato telefônico (nome, telefone com DDI 55 e apelidos) na Memória de Longo Prazo.',
        parameters: {
          type: 'object',
          properties: {
            nome: { type: 'string', description: 'Nome completo ou principal do contato (ex: Ronny Fisioterapeuta).' },
            telefone: { type: 'string', description: 'Número de telefone com DDI 55 e DDD (ex: 556798074004).' },
            apelidos: { type: 'array', items: { type: 'string' }, description: 'Apelidos ou profissão para busca futura.' }
          },
          required: ['nome', 'telefone']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'create_or_update_tool_connector',
        description: 'Cria ou atualiza uma Conexão (HTTP, MCP, Code, SSH) no catálogo.',
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
            auth_token: { type: 'string' }
          },
          required: ['name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'delete_tool_connector',
        description: 'Exclui permanentemente uma conexão do catálogo.',
        parameters: {
          type: 'object',
          properties: {
            provider_key: { type: 'string', description: `Slug da conexão: [${validToolSlugs.join(', ')}]` }
          },
          required: ['provider_key']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'update_persona_and_behavior',
        description: 'Atualiza regras permanentes no system_prompt do JARVIS ou de um Agente.',
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
        description: 'Audita vulnerabilidades, rotas ou integridade do sistema.',
        parameters: {
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['red_team_audit', 'self_healing_debug', 'api_probe'] },
            target_slug: { type: 'string' }
          },
          required: ['mode']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'execute_external_integration',
        description: 'Dispara comandos diretos em Google Calendar, Gmail, WhatsApp ou Home Assistant.',
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
        description: 'Executa comandos shell via SSH no servidor.',
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

  let promptSistemaCompleto = `${configuracaoCerebro.system_prompt}
${contextoTemporal}
Identidade Autenticada / Locutor: ${activeSpeakerName} (${speakerRole})
URL Base do Servidor: ${configuracaoCerebro.server_base_url}${instrucaoVisual}

--- AGENTES ESPECIALISTAS INTEGRADOS AO ECOSSISTEMA ---
${resumoAgentesAtivos}

--- AGENTES INATIVOS / PAUSADOS ---
${resumoAgentesInativos}

[DIRETRIZES FUNDAMENTAIS DO ORQUESTRADOR CENTRAL]:
1. ACESSO DIRETO ÀS 3 CAMADAS DE MEMÓRIA:
   - Você TEM acesso completo às memórias de Curto Prazo, Médio Prazo e Longo Prazo (incluindo a Agenda de Contatos) listadas abaixo.
   - Se o usuário perguntar sobre contatos, listas, lembretes ou fatos já presentes nas memórias abaixo, responda diretamente com exatidão.
   - Quando o usuário pedir para enviar WhatsApp/mensagem/e-mail para um contato salvo (ex: "meu número", "minha mãe", "amor"), localize o telefone na seção [MEMÓRIA DE LONGO PRAZO - AGENDA DE CONTATOS] abaixo e acione imediatamente o especialista correspondente passando o número completo já resolvido em "task_details".
2. DELEGAÇÃO OBRIGATÓRIA PARA AÇÕES EXTERNAS E SQL AVANÇADO:
   - Para ações externas (WhatsApp, Gmail, Google Calendar, Home Assistant, cotações B3, consultas SQL customizadas em outras tabelas), acione a TOOL CALL NATIVA do especialista responsável.
3. PROIBIÇÃO DE COMANDOS CRUS EM TEXTO:
   - NUNCA escreva comandos como "consultar_mercado_de_valores query=..." ou "google_calendar ...". Use sempre Function/Tool Calling nativo.

--- MEMÓRIA E CONHECIMENTO DO SISTEMA (CURTO, MÉDIO E LONGO PRAZO) ---
${contextoMemoriaCompleto}`;

  // [WEBMCP_MONTADOR_START]
  try {
    const _liveWmcp = await ensureActiveWebMcpTools(0);
    if (_liveWmcp.length > 0 && typeof tools !== 'undefined' && Array.isArray(tools)) {
      for (const _wt of _liveWmcp) {
        const _wName = sanitizeToolName(_wt.name);
        if (!tools.some((t: any) => t?.function?.name === _wName)) {
          tools.push({
            type: 'function',
            function: {
              name: _wName,
              description: `[Interface Aberta / WebMCP] ${_wt.description}`,
              parameters:
                _wt.inputSchema?.properties && Object.keys(_wt.inputSchema.properties).length > 0
                  ? _wt.inputSchema
                  : { type: 'object', properties: { confirmar: { type: 'boolean', description: 'Confirmar ação na interface' } } }
            }
          });
        }
      }
      if (typeof promptSistemaCompleto === 'string') {
        promptSistemaCompleto += `\n\n[FERRAMENTAS DE TELA ATIVAS (WEBMCP)]:\n${_liveWmcp
          .map((t) => `- ${sanitizeToolName(t.name)}: ${t.description}`)
          .join('\n')}\nREGRA CRÍTICA: Para executar qualquer ação visual acima, CHAME A FERRAMENTA NATIVA correspondente apenas quando o usuário ordenar explicitamente abrir ou navegar para a tela.`;
      }
    }
  } catch {}
  // [WEBMCP_MONTADOR_END]

  const _seenTools = new Set<string>();
  const toolsUnicas = tools.filter((t: any) => {
    const nm = t?.function?.name;
    if (!nm || _seenTools.has(nm)) return false;
    _seenTools.add(nm);
    return true;
  });
  tools.length = 0;
  tools.push(...toolsUnicas);

  return {
    configuracaoCerebro,
    contextoTemporal,
    threadConversa,
    historicoLinhas: historicoCronologico.length,
    agentesAtivos,
    catalogoAoVivo,
    connectorsMap,
    validToolSlugs,
    tools,
    promptSistemaCompleto
  };
}
