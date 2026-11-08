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
  // Carregamento paralelo de configurações, memória, RAG, agentes e catálogo
  const [
    configuracaoCerebro,
    historicoRes,
    linhasRag,
    todosAgentesRes,
    dadosCatalogoTools
  ] = await Promise.all([
    getCentralBrainConfig(),
    pool
      .query(`SELECT role, content FROM jarvis_chat_memory WHERE session_id = $1 ORDER BY id DESC LIMIT 10;`, [sessionId])
      .catch(() => ({ rows: [] as any[] })),
    searchVectorDocuments(userPrompt, 3).catch(() => []),
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
      .filter((m: any) => (m.similarity ?? 1) > 0.15)
      .map((m: any) => `- ${m.content}`)
      .join('\n');
  }

  const todosAgentes = todosAgentesRes.rows;
  const agentesAtivos = todosAgentes.filter((a: any) => a.is_active !== false);
  const agentesInativos = todosAgentes.filter((a: any) => a.is_active === false);

  const { catalog: catalogoAoVivo, connectorsMap } = dadosCatalogoTools;
  const validToolSlugs = catalogoAoVivo.map((t) => t.slug);

  const resumoToolsAoVivo =
    catalogoAoVivo.length > 0
      ? catalogoAoVivo
          .map(
            (t) =>
              `- slug: "${t.slug}" | Nome: "${t.name}" | Método: ${t.method}${
                t.endpoint ? ` | Endpoint: ${t.endpoint}` : ''
              } | Uso: ${t.description}`
          )
          .join('\n')
      : 'Nenhuma tool externa cadastrada no momento.';

  const resumoAgentesAtivos =
    agentesAtivos.length > 0
      ? agentesAtivos
          .map(
            (a: any) =>
              `- [ATIVO] Nome: "${a.name}" | Slug: "${sanitizeToolName(a.slug)}" | Modo: ${(
                a.agent_type || 'llm'
              ).toUpperCase()} | Tools: ${JSON.stringify(a.tools || [])} | Gatilho: ${a.description || 'Geral'}`
          )
          .join('\n')
      : 'Nenhum especialista ativo.';

  const resumoAgentesInativos =
    agentesInativos.length > 0
      ? agentesInativos
          .map(
            (a: any) =>
              `- [PAUSADO] Nome: "${a.name}" | Slug: "${sanitizeToolName(a.slug)}" | Modo: ${(
                a.agent_type || 'llm'
              ).toUpperCase()}`
          )
          .join('\n')
      : 'Nenhum especialista pausado.';

  // Cada subagente ativo torna-se uma Tool invocável pelo JARVIS
  const tools: any[] = agentesAtivos.map((ag: any) => ({
    type: 'function',
    function: {
      name: sanitizeToolName(ag.slug),
      description: ag.description?.trim() || `Aciona o especialista ${ag.name}.`,
      parameters: {
        type: 'object',
        properties: {
          task_details: { type: 'string', description: 'Pergunta ou dados técnicos para o especialista.' },
          symbol: { type: 'string', description: 'Ticker/código quando aplicável (ex: PETR4).' },
          query: { type: 'string', description: 'Parâmetro textual de pesquisa ou cálculo.' }
        },
        required: ['task_details']
      }
    }
  }));

  // Tools Administrativas Centrais
  tools.push(
    // Substitui a criação solta pela ferramenta delegada com travas de rate-limit
    toolDelegarCriacaoSubagente,
    {
      type: 'function',
      function: {
        name: 'create_or_update_tool_connector',
        description: 'Cria ou atualiza uma Tool/Conexão (HTTP, MCP, Code, SSH) no catálogo.',
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
        description: 'Exclui permanentemente uma conexão do catálogo dinâmico.',
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
        description: 'Atualiza o comportamento e regras no system_prompt do JARVIS ou de um Agente.',
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
        description: 'Audita vulnerabilidades, logs ou rotas HTTP.',
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
        description: 'Dispara ações em WhatsApp, Google Workspace, Google Calendar, Gmail, Home Assistant, etc.',
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
        description: 'Executa comandos shell via SSH ou indexa logs remotos no RAG.',
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

--- CATÁLOGO DE TOOLS / CONEXÕES EXTERNAS ---
${resumoToolsAoVivo}

--- AGENTES ESPECIALISTAS ATIVOS NO SISTEMA ---
${resumoAgentesAtivos}

--- AGENTES EXISTENTES PAUSADOS / INATIVOS ---
${resumoAgentesInativos}

[DIRETRIZES FUNDAMENTAIS DO ORQUESTRADOR CENTRAL]:
1. DELEGAÇÃO OBRIGATÓRIA A SUBAGENTES:
   - Se houver um especialista ativo para o domínio da pergunta, acione OBRIGATORIAMENTE a Tool Call dele. Não execute APIs de negócio diretamente como JARVIS.
2. CRIAÇÃO DE SUBAGENTES SEM SOBRECARGA:
   - Quando o usuário solicitar a criação de um especialista novo ou evolução de agente existente, acione SEMPRE a ferramenta "delegar_criacao_ou_ajuste_de_subagente".
   - O Subagente Arquiteto cuidará de toda a montagem, conectores e travas de segurança.
   
[DIRETRIZ IMPERATIVA DE EXECUÇÃO - PROIBIDO MENSAGENS INTERMEDIÁRIAS]:
1. NUNCA responda dizendo "Vou verificar...", "Aguarde um instante...", "Estou consultando..." ou qualquer frase no tempo futuro prometendo ação.
2. Se o usuário solicitou qualquer dado externo (ações, finanças, agenda, e-mails, luzes, arquivos ou status), DISPARE A TOOL CALL NATIVA IMEDIATAMENTE.
3. Você só deve responder em texto ao usuário APÓS a ferramenta ter sido executada e ter retornado os dados reais.
4. Se nenhuma ferramenta atender a demanda, informe diretamente em uma única resposta o motivo.

${contextoRagTexto ? `\n--- MEMÓRIA VETORIAL (RAG) ---\n${contextoRagTexto}` : ''}`;

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
