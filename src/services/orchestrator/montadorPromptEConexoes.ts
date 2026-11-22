import { ensureActiveWebMcpTools } from "../webMcpService.js";
// src/services/orchestrator/montadorPromptEConexoes.ts
import { pool } from '../../config/database.js';
import { searchVectorDocuments } from '../ragService.js';
import { getCentralBrainConfig, sanitizeToolName } from './brainConfigAndUtils.js';
import { getDynamicToolsCatalog } from './catalogAndDatabase.js';
import { toolDelegarCriacaoSubagente } from './brainMetaTools.js';

export async function montarContextoEConexoes(
  userPrompt: string,
  sessionId: string,
  activeSpeakerName: string,
  speakerRole: string,
  instrucaoVisual: string
) {
  // Carregamento paralelo completo: Cérebro, Curto Prazo, Médio Prazo, Agenda Permanente e RAG
  const [
    configuracaoCerebro,
    historicoRes,
    linhasRag,
    contatosRes,
    episodicaRes,
    todosAgentesRes,
    dadosCatalogoTools
  ] = await Promise.all([
    getCentralBrainConfig(),
    pool
      .query(`SELECT role, content FROM jarvis_chat_memory WHERE session_id = $1 ORDER BY id DESC LIMIT 15;`, [sessionId])
      .catch(() => ({ rows: [] as any[] })),
    searchVectorDocuments(userPrompt, 6).catch(() => []),
    Promise.resolve({ rows: [] as any[] }),
    Promise.resolve({ rows: [] as any[] }),
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

  let contextoRagTexto = '';
  const listaRag = Array.isArray(linhasRag) ? linhasRag : (linhasRag as any)?.matches || [];
  if (listaRag.length > 0) {
    contextoRagTexto = listaRag
      .filter((m: any) => (m.similarity ?? 1) > 0.12)
      .map((m: any) => `- ${m.content}`)
      .join('\n');
  }

  const textoAgenda = contatosRes.rows.length > 0
    ? contatosRes.rows
        .map((c: any) => `- Nome: ${c.nome} | Telefone: ${c.telefone} | Apelidos/Vínculos: ${(c.apelidos || []).join(', ')}`)
        .join('\n')
    : 'Nenhum contato salvo.';

  const textoMedioPrazo = episodicaRes.rows.length > 0
    ? episodicaRes.rows
        .map((e: any) => {
          const expira = e.expires_at ? new Date(e.expires_at).toLocaleDateString('pt-BR') : '21d';
          return `- [ID:${e.id} | ${e.categoria} | expira em ${expira}] ${e.titulo}: ${e.conteudo}`;
        })
        .join('\n')
    : '';
  // Anexa Agenda + Médio Prazo + Longo Prazo (RAG) de forma visível para o Orquestrador
  contextoRagTexto = [
    `[GOVERNANÇA DE MEMÓRIA E INTERFACE - OBRIGATÓRIO]:
1. LISTAS, LEMBRETES E TAREFAS TEMPORÁRIAS: Use SEMPRE a ferramenta "gerenciar_memoria_cognitiva" com tipo_memoria="medio_prazo" (contexto_semanal: 15-30 dias; tarefa_ativa: 45-60 dias; projeto: 90-180 dias). NUNCA crie arquivos .md/.txt na VM nem tente salvar listas no Notion sem pedido explícito.
2. ATUALIZAÇÃO DE LISTAS ATIVAS: Se já existir registro em [MEMÓRIA EPISÓDICA ATIVA] sobre o assunto, use acao="atualizar" com o ID para incluir/remover itens, ou acao="concluir" ao finalizar.
3. NAVEGAÇÃO DE INTERFACE (WebMCP): NUNCA acione trocar_aba_configuracoes ou abrir_painel_configuracoes em perguntas informativas. Só navegue com ordem explícita para abrir tela.

[AGENDA PERMANENTE DE CONTATOS E IDENTIDADES]:\n${textoAgenda}`,
    textoMedioPrazo ? `[MEMÓRIA EPISÓDICA ATIVA (MÉDIO PRAZO)]:\n${textoMedioPrazo}` : '',
    contextoRagTexto ? `[DOCUMENTOS E FATOS DE LONGO PRAZO (RAG)]:\n${contextoRagTexto}` : ''
  ].filter(Boolean).join('\n\n');

  const todosAgentes = todosAgentesRes.rows;
  const agentesAtivos = todosAgentes.filter((a: any) => a.is_active !== false);
  const agentesInativos = todosAgentes.filter((a: any) => a.is_active === false);

  const { catalog: catalogoAoVivo, connectorsMap } = dadosCatalogoTools;
  const validToolSlugs = catalogoAoVivo.map((t) => t.slug);

  // Mapeamento enriquecido dos Especialistas Ativos com as tools que cada um possui
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

  // Cada subagente ativo é registrado como ferramenta nativa com suas competências explícitas
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

  // Tools Administrativas Centrais
  tools.push(
    toolDelegarCriacaoSubagente,
    {
      type: 'function',
      function: {
        name: 'salvar_contato_agenda',
        description: 'Salva ou atualiza um contato telefônico (nome, telefone com DDI 55 e apelidos) na agenda permanente do PostgreSQL.',
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

  // Diretrizes Centrais do JARVIS
  let promptSistemaCompleto = `${configuracaoCerebro.system_prompt}
${contextoTemporal}
Identidade Autenticada / Locutor: ${activeSpeakerName} (${speakerRole})
URL Base do Servidor: ${configuracaoCerebro.server_base_url}${instrucaoVisual}

--- AGENTES ESPECIALISTAS INTEGRADOS AO ECOSSISTEMA ---
${resumoAgentesAtivos}

--- AGENTES INATIVOS / PAUSADOS ---
${resumoAgentesInativos}

[DIRETRIZES FUNDAMENTAIS DO ORQUESTRADOR CENTRAL]:
1. DELEGAÇÃO OBRIGATÓRIA A SUBAGENTES (INCLUINDO BANCO DE DADOS):
   - Você NÃO tem acesso direto ao banco de dados PostgreSQL, contatos, tabelas ou registros.
   - Se o usuário solicitar consulta ao banco de dados, tabelas, registros, contatos, cotação, agenda, automação residencial ou qualquer domínio atendido pelos Especialistas listados acima, você está ESTRITAMENTE PROIBIDO de responder em texto como JARVIS.
   - Você DEVE acionar a TOOL CALL NATIVA do respectivo especialista (ex: o especialista que controla "mcp_postgres").

2. PROIBIÇÃO DE COMANDOS CRUS EM TEXTO:
 - NUNCA escreva comandos como "consultar_mercado_de_valores query=...", "google_calendar ..." ou "home_detector_de_sensores...".
 - As ferramentas técnicas pertencem aos especialistas. Acione o Especialista correto via function call.
3. FLUIDEZ E NATURALIDADE:
 - Você só responde em texto após o especialista concluir a execução e trazer os dados reais.
 - Cumprimentos e conversação comum devem ser respondidos de forma amigável, inteligente e em português.

${contextoRagTexto ? `\n--- MEMÓRIA E CONHECIMENTO DO SISTEMA (AGENDA, MÉDIO E LONGO PRAZO) ---\n${contextoRagTexto}` : ''}`;
  try {
    const candRes = await pool.query(`
      SELECT LOWER(TRIM(titulo)) AS chave, MAX(titulo) AS titulo, MAX(conteudo) AS conteudo, COUNT(*)::int AS qtd
      FROM jarvis_episodic_memory
      WHERE created_at >= NOW() - INTERVAL '14 days'
      GROUP BY LOWER(TRIM(titulo))
      HAVING COUNT(*) >= 3
      ORDER BY COUNT(*) DESC LIMIT 1;
    `);
    if (candRes.rows.length > 0) {
      const c = candRes.rows[0];
      contextoRagTexto += `\n\n[CONSOLIDAÇÃO AUTÔNOMA DE MEMÓRIA]: O padrão "${c.titulo}" (${c.conteudo}) foi citado ${c.qtd} vezes nos últimos 14 dias. Ao final da resposta, pergunte se o usuário deseja promovê-lo definitivamente para o banco vetorial de longo prazo.`;
    }
  } catch {}


    // [WEBMCP_MONTADOR_START]
  try {
    const _liveWmcp = await ensureActiveWebMcpTools(300);
    if (_liveWmcp.length > 0 && typeof tools !== 'undefined' && Array.isArray(tools)) {
      for (const _wt of _liveWmcp) {
        const _wName = sanitizeToolName(_wt.name);
        if (!tools.some((t: any) => t?.function?.name === _wName)) {
          tools.push({
            type: 'function',
            function: {
              name: _wName,
              description: `[Interface Aberta / WebMCP] ${_wt.description}`,
              parameters: (_wt.inputSchema?.properties && Object.keys(_wt.inputSchema.properties).length > 0)
                ? _wt.inputSchema
                : { type: 'object', properties: { confirmar: { type: 'boolean', description: 'Confirmar ação na interface' } } }
            }
          });
        }
      }
      if (typeof promptSistemaCompleto === 'string') {
        promptSistemaCompleto += `\n\n[FERRAMENTAS DE TELA ATIVAS (WEBMCP)]:\n${_liveWmcp.map(t => `- ${sanitizeToolName(t.name)}: ${t.description}`).join('\n')}\nREGRA CRÍTICA: Para executar qualquer ação visual acima, CHAME A FERRAMENTA NATIVA correspondente. Nunca responda apenas "Vou abrir..." em texto sem chamar a ferramenta.`;
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
