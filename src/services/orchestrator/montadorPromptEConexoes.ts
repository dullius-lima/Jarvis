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
    pool
      .query(`SELECT nome, telefone, apelidos FROM contatos_agenda ORDER BY nome ASC;`)
      .catch(() => ({ rows: [] as any[] })),
    pool
      .query(`SELECT categoria, titulo, conteudo FROM jarvis_episodic_memory WHERE expires_at > NOW() ORDER BY created_at DESC LIMIT 15;`)
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
        .map((e: any) => `- [${e.categoria}] ${e.titulo}: ${e.conteudo}`)
        .join('\n')
    : '';

  // Anexa Agenda + Médio Prazo + Longo Prazo (RAG) de forma visível para o Orquestrador
  contextoRagTexto = [
    `[AGENDA PERMANENTE DE CONTATOS E IDENTIDADES]:\n${textoAgenda}`,
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
        name: 'save_to_database',
        description: 'Salva dados em formato estruturado no PostgreSQL.',
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
  const promptSistemaCompleto = `${configuracaoCerebro.system_prompt}
${contextoTemporal}
Identidade Autenticada / Locutor: ${activeSpeakerName} (${speakerRole})
URL Base do Servidor: ${configuracaoCerebro.server_base_url}${instrucaoVisual}

--- AGENTES ESPECIALISTAS INTEGRADOS AO ECOSSISTEMA ---
${resumoAgentesAtivos}

--- AGENTES INATIVOS / PAUSADOS ---
${resumoAgentesInativos}

[DIRETRIZES FUNDAMENTAIS DO ORQUESTRADOR CENTRAL]:
1. DELEGAÇÃO OBRIGATÓRIA A SUBAGENTES:
 - Se o usuário solicitar cotação, dados da B3, agenda, automação residencial, segurança ou qualquer domínio atendido pelos Especialistas listados acima, você está ESTRITAMENTE PROIBIDO de responder em texto como JARVIS.
 - Você DEVE acionar a TOOL CALL NATIVA do respectivo especialista.
2. PROIBIÇÃO DE COMANDOS CRUS EM TEXTO:
 - NUNCA escreva comandos como "consultar_mercado_de_valores query=...", "google_calendar ..." ou "home_detector_de_sensores...".
 - As ferramentas técnicas pertencem aos especialistas. Acione o Especialista correto via function call.
3. FLUIDEZ E NATURALIDADE:
 - Você só responde em texto após o especialista concluir a execução e trazer os dados reais.
 - Cumprimentos e conversação comum devem ser respondidos de forma amigável, inteligente e em português.

${contextoRagTexto ? `\n--- MEMÓRIA E CONHECIMENTO DO SISTEMA (AGENDA, MÉDIO E LONGO PRAZO) ---\n${contextoRagTexto}` : ''}`;

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
