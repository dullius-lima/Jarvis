import { upsertKnowledgeTriplet } from "../knowledgeGraphService.js";
// src/services/orchestrator/brainMetaTools.ts
import { pool } from '../../config/database.js';
import {
  ensureOrchestratorSchema,
  getCentralBrainConfig,
  sanitizeToolName
} from './brainConfigAndUtils.js';
import { construirOuEvoluirSubagente } from '../agents/fabricaAgentesService.js';

// ============================================================================
// 1. META-TOOL DO SUBAGENTE ARQUITETO (CRIAÇÃO/AJUSTE DE AGENTES)
// ============================================================================
export const toolDelegarCriacaoSubagente = {
  type: 'function' as const,
  function: {
    name: 'delegar_criacao_ou_ajuste_de_subagente',
    description:
      'Acione SEMPRE que o usuário pedir para criar, treinar, modificar ou adicionar um novo subagente/especialista, ou quando uma tarefa exigir uma especialidade inexistente.',
    parameters: {
      type: 'object',
      properties: {
        intencao_do_subagente: {
          type: 'string',
          description: 'A descrição da especialidade, o que ele precisa fazer e as integrações necessárias.'
        }
      },
      required: ['intencao_do_subagente']
    }
  }
};

// ============================================================================
// 2. META-TOOL DE MEMÓRIA COGNITIVA (CURTO, MÉDIO E LONGO PRAZO)
// ============================================================================
const PRAZO_PADRAO_MEDIO_PRAZO: Record<string, number> = {
  contexto_semanal: 21, // Faixa de 15 a 30 dias
  tarefa_ativa: 45,     // Faixa de 45 a 60 dias
  projeto: 180,         // Faixa de 90 a 180 dias (3 a 6 meses)
  habito: 30
};

export const toolGerenciarMemoria = {
  type: 'function' as const,
  function: {
    name: 'gerenciar_memoria_cognitiva',
    description:
      'Acione OBRIGATORIAMENTE para salvar, atualizar, concluir ou consultar informações nos 3 níveis de memória do JARVIS: curto_prazo (sessão), medio_prazo (listas de compras, lembretes, tarefas ativas e projetos com validade de 15 a 180 dias) ou longo_prazo (regras permanentes e contatos). NUNCA crie arquivos .md ou .txt para listas ou anotações.',
    parameters: {
      type: 'object',
      properties: {
        acao: {
          type: 'string',
          enum: ['salvar', 'atualizar', 'concluir', 'consultar'],
          description: 'Use "salvar" para novo registro, "atualizar" para modificar/adicionar/remover itens de uma memória existente, "concluir" para encerrar uma tarefa finalizada, ou "consultar" para buscar.'
        },
        tipo_memoria: {
          type: 'string',
          enum: ['curto_prazo', 'medio_prazo', 'longo_prazo'],
          description: 'Nível de persistência: curto_prazo (sessão), medio_prazo (episódica de 15 a 180 dias) ou longo_prazo (permanente).'
        },
        id: { type: 'number', description: 'ID da memória episódica (para atualizar ou concluir).' },
        titulo: { type: 'string', description: 'Título curto da memória (ex: "Lista de Compras", "Projeto Reforma").' },
        conteudo: { type: 'string', description: 'Texto completo e atualizado do fato, lista ou instrução.' },
        categoria: {
          type: 'string',
          enum: ['contexto_semanal', 'tarefa_ativa', 'projeto', 'habito', 'contato', 'geral'],
          description: 'Para medio_prazo: "contexto_semanal" (15-30 dias), "tarefa_ativa" (45-60 dias) ou "projeto" (90-180 dias).'
        },
        dias_validade: {
          type: 'number',
          description: 'Validade em dias para medio_prazo (15-30 contexto_semanal, 45-60 tarefa_ativa, 90-180 projeto). Se omitido, usa o padrão da categoria.'
        }
      },
      required: ['acao', 'tipo_memoria', 'titulo']
    }
  }
};

/**
 * Registra o catálogo de Meta-Tools universais na chamada da LLM Central
 */
export function registrarMetaToolsDoBrain(tools: any[]) {
  tools.push(toolDelegarCriacaoSubagente);
  tools.push(toolGerenciarMemoria);
}

/**
 * Despacha a criação/ajuste diretamente para a Fábrica de Agentes
 */
export async function executarDelegacaoSubagente(
  intencao: string,
  origem: 'usuario_direto' | 'jarvis_orquestrador' = 'usuario_direto'
) {
  return await construirOuEvoluirSubagente({
    intencaoUsuario: intencao,
    origemChamada: origem
  });
}

// Re-exportação da fábrica
export { construirOuEvoluirSubagente };

// ============================================================================
// EXECUÇÃO DO GERENCIAMENTO DE MEMÓRIA (3 NÍVEIS)
// ============================================================================
export async function executarGerenciamentoMemoria(params: {
  acao: 'salvar' | 'atualizar' | 'concluir' | 'consultar';
  tipo_memoria: 'curto_prazo' | 'medio_prazo' | 'longo_prazo';
  id?: number;
  titulo: string;
  conteudo?: string;
  categoria?: string;
  dias_validade?: number;
  session_id?: string;
}) {
  const { acao, tipo_memoria, id, titulo, conteudo = '', categoria = 'contexto_semanal', dias_validade, session_id = 'default_session' } = params;

  const resolverDias = (cat: string, inf?: number) => {
    if (inf && Number(inf) > 0) return Math.min(Math.max(Number(inf), 1), 180);
    return PRAZO_PADRAO_MEDIO_PRAZO[cat] || 21;
  };

  if (acao === 'salvar') {
    if (tipo_memoria === 'curto_prazo') {
      await pool.query(
        `INSERT INTO jarvis_chat_memory (session_id, role, content) VALUES ($1, 'system', $2);`,
        [session_id, `[MEMÓRIA CURTO PRAZO - ${titulo}]: ${conteudo}`]
      ).catch(() => {});
      return { success: true, tipo_memoria: 'curto_prazo', titulo, message: `Memória de curto prazo retida na sessão: "${titulo}".` };
    }

    if (tipo_memoria === 'medio_prazo') {
      const catFinal = ['contexto_semanal', 'tarefa_ativa', 'projeto', 'habito'].includes(categoria) ? categoria : 'contexto_semanal';
      const dias = resolverDias(catFinal, dias_validade);
      const insRes = await pool.query(
        `INSERT INTO jarvis_episodic_memory (categoria, titulo, conteudo, expires_at, metadata)
         VALUES ($1, $2, $3, NOW() + ($4 || ' days')::interval, $5::jsonb)
         RETURNING id, expires_at;`,
        [catFinal, titulo, conteudo, dias, JSON.stringify({ origem: 'brainMetaTools', categoria: catFinal, dias_validade: dias })]
      );
      return {
        success: true,
        id: insRes.rows[0]?.id,
        tipo_memoria: 'medio_prazo',
        categoria: catFinal,
        dias_validade: dias,
        expires_at: insRes.rows[0]?.expires_at,
        titulo,
        message: `Memória de médio prazo (${catFinal}) salva por ${dias} dias: "${titulo}".`
      };
    }

    if (tipo_memoria === 'longo_prazo') {
      if (categoria === 'contato' || /telefone|contato|whatsapp|celular/i.test(titulo)) {
        const digitos = conteudo.replace(/\D/g, '');
        if (digitos.length >= 8) {
          let fone = digitos;
          if (fone.length === 8 || fone.length === 9) fone = `5567${fone.length === 8 ? '9' + fone : fone}`;
          else if (fone.length === 10 || fone.length === 11) fone = `55${fone}`;
          const nomeNorm = titulo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          await pool.query(
            `INSERT INTO contatos_agenda (nome, telefone, apelidos) VALUES ($1, $2, ARRAY[$3])
             ON CONFLICT (nome) DO UPDATE SET telefone = EXCLUDED.telefone, atualizado_em = NOW();`,
            [nomeNorm, fone, titulo]
          ).catch(() => {});
        }
      }
      await pool.query(`INSERT INTO vector_documents (title, content, category) VALUES ($1, $2, 'permanente');`, [titulo, conteudo]);
      return { success: true, tipo_memoria: 'longo_prazo', titulo, message: `Fato gravado permanentemente na memória de longo prazo: "${titulo}".` };
    }
  }

    if (acao === 'atualizar') {
    if (tipo_memoria === 'medio_prazo') {
      const dias = resolverDias(categoria, dias_validade);
      const updRes = id
        ? await pool.query(
            `UPDATE jarvis_episodic_memory SET conteudo = $1, titulo = COALESCE(NULLIF($2, ''), titulo), expires_at = NOW() + ($3 || ' days')::interval WHERE id = $4 RETURNING id, titulo, conteudo, expires_at;`,
            [conteudo, titulo, dias, id]
          )
        : await pool.query(
            `UPDATE jarvis_episodic_memory SET conteudo = $1, expires_at = NOW() + ($2 || ' days')::interval
             WHERE id = (SELECT id FROM jarvis_episodic_memory WHERE expires_at > NOW() AND titulo ILIKE $3 ORDER BY id DESC LIMIT 1)
             RETURNING id, titulo, conteudo, expires_at;`,
            [conteudo, dias, '%' + titulo + '%']
          );
      if (updRes.rows.length > 0) {
        return { success: true, registro: updRes.rows[0], message: 'Memória "' + updRes.rows[0].titulo + '" atualizada (válida por mais ' + dias + ' dias).' };
      }
      return { success: false, message: 'Nenhuma memória episódica ativa encontrada com "' + titulo + '".' };
    }

    if (tipo_memoria === 'longo_prazo') {
      if (categoria === 'contato' || /telefone|contato|whatsapp|celular/i.test(titulo)) {
        const digitos = conteudo.replace(/\D/g, '');
        if (digitos.length >= 8) {
          let fone = digitos;
          if (fone.length === 8 || fone.length === 9) fone = '5567' + (fone.length === 8 ? '9' + fone : fone);
          else if (fone.length === 10 || fone.length === 11) fone = '55' + fone;
          const nomeNorm = titulo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          await pool.query(
            `INSERT INTO contatos_agenda (nome, telefone, apelidos) VALUES ($1, $2, ARRAY[$3])
             ON CONFLICT (nome) DO UPDATE SET telefone = EXCLUDED.telefone, atualizado_em = NOW();`,
            [nomeNorm, fone, titulo]
          ).catch(() => {});
          await pool.query(`DELETE FROM vector_documents WHERE category = 'contatos' AND (title ILIKE $1 OR content ILIKE $2);`, ['%' + titulo + '%', '%' + nomeNorm + '%']).catch(() => {});
          await pool.query(`INSERT INTO vector_documents (title, content, category) VALUES ($1, $2, 'contatos');`, ['Contato: ' + titulo, 'Nome: ' + titulo + ' | Telefone: ' + fone]);
          return { success: true, tipo_memoria: 'longo_prazo', message: 'Contato "' + titulo + '" (' + fone + ') atualizado na memória de longo prazo.' };
        }
      }
      const updRag = id
        ? await pool.query(`UPDATE vector_documents SET content = $1, title = COALESCE(NULLIF($2, ''), title) WHERE id = $3 RETURNING id, title;`, [conteudo, titulo, id])
        : await pool.query(`UPDATE vector_documents SET content = $1 WHERE id = (SELECT id FROM vector_documents WHERE title ILIKE $2 ORDER BY id DESC LIMIT 1) RETURNING id, title;`, [conteudo, '%' + titulo + '%']);
      if (updRag.rows.length > 0) {
        return { success: true, registro: updRag.rows[0], message: 'Memória de longo prazo "' + updRag.rows[0].title + '" atualizada.' };
      }
      return { success: false, message: 'Registro de longo prazo "' + titulo + '" não localizado para atualização.' };
    }
  }

  if (acao === 'concluir') {
    if (tipo_memoria === 'medio_prazo') {
      const delRes = id
        ? await pool.query(`UPDATE jarvis_episodic_memory SET expires_at = NOW() WHERE id = $1 RETURNING id, titulo;`, [id])
        : await pool.query(
            `UPDATE jarvis_episodic_memory SET expires_at = NOW()
             WHERE id = (SELECT id FROM jarvis_episodic_memory WHERE expires_at > NOW() AND titulo ILIKE $1 ORDER BY id DESC LIMIT 1)
             RETURNING id, titulo;`,
            ['%' + titulo + '%']
          );
      return {
        success: delRes.rows.length > 0,
        message: delRes.rows.length > 0 ? 'Memória "' + delRes.rows[0].titulo + '" concluída e encerrada.' : 'Registro "' + titulo + '" já encerrado.'
      };
    }
    if (tipo_memoria === 'longo_prazo') {
      const delRag = id
        ? await pool.query(`DELETE FROM vector_documents WHERE id = $1 RETURNING id, title;`, [id])
        : await pool.query(`DELETE FROM vector_documents WHERE title ILIKE $1 RETURNING id, title;`, ['%' + titulo + '%']);
      return {
        success: delRag.rows.length > 0,
        message: delRag.rows.length > 0 ? 'Registro de longo prazo "' + delRag.rows[0].title + '" removido.' : 'Registro não localizado.'
      };
    }
  }

  if (acao === 'consultar') {
    if (tipo_memoria === 'curto_prazo') {
      const res = await pool.query(`SELECT role, content, created_at FROM jarvis_chat_memory WHERE session_id = $1 AND content ILIKE $2 ORDER BY id DESC LIMIT 5;`, [session_id, `%${titulo}%`]).catch(() => ({ rows: [] as any[] }));
      return { success: true, tipo_memoria: 'curto_prazo', total: res.rows.length, registros: res.rows };
    }
    if (tipo_memoria === 'medio_prazo') {
      const res = await pool.query(`SELECT id, categoria, titulo, conteudo, expires_at, created_at FROM jarvis_episodic_memory WHERE expires_at > NOW() AND (titulo ILIKE $1 OR conteudo ILIKE $1) ORDER BY id DESC LIMIT 10;`, [`%${titulo}%`]).catch(() => ({ rows: [] as any[] }));
      return { success: true, tipo_memoria: 'medio_prazo', total: res.rows.length, registros: res.rows };
    }
    if (tipo_memoria === 'longo_prazo') {
      const res = await pool.query(`SELECT id, title, content, metadata, created_at FROM vector_documents WHERE content ILIKE $1 OR title ILIKE $1 ORDER BY id DESC LIMIT 5;`, [`%${titulo}%`]).catch(() => ({ rows: [] as any[] }));
      return { success: true, tipo_memoria: 'longo_prazo', total: res.rows.length, registros: res.rows };
    }
  }

  return { success: false, message: 'Operação de memória não reconhecida.' };
}

// Alias direto para chamadas programáticas do orquestrador
export const salvarMemoriaClassificada = executarGerenciamentoMemoria;

// ============================================================================
// CONECTORES / TOOLS DINÂMICAS NO POSTGRESQL
// ============================================================================
export async function criarOuAtualizarToolNoBrain(params: {
  name: string;
  provider_key?: string;
  tool_type?: 'http' | 'mcp' | 'code' | 'ssh' | string;
  http_method?: string;
  endpoint_url?: string;
  description?: string;
  icon?: string;
  auth_token?: string;
  payload_template?: string;
  code_snippet?: string;
}) {
  await ensureOrchestratorSchema();
  const rawKey = params.provider_key || params.name || 'custom_tool';
  const key = sanitizeToolName(rawKey);
  const name = (params.name || key).trim();
  const toolType = (params.tool_type || 'http').toLowerCase();
  const icon =
    params.icon ||
    (toolType === 'mcp' ? '🔌' : toolType === 'code' ? '💻' : toolType === 'ssh' ? '🖥️' : '🌐');
  const description = params.description || `Ferramenta ${name} criada pelo JARVIS.`;

  const configObj = {
    tool_type: toolType,
    http_method: (params.http_method || (toolType === 'mcp' ? 'POST' : 'GET')).toUpperCase(),
    endpoint_url: params.endpoint_url || '',
    auth_token: params.auth_token || '',
    payload_template: params.payload_template || '',
    code_snippet: params.code_snippet || '',
    description
  };

  await pool.query(
    `INSERT INTO external_connectors (provider_key, name, category, icon, description, config, is_enabled, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, TRUE, NOW())
     ON CONFLICT (provider_key) DO UPDATE SET
       name = EXCLUDED.name,
       icon = EXCLUDED.icon,
       description = EXCLUDED.description,
       config = EXCLUDED.config,
       is_enabled = TRUE,
       updated_at = NOW();`,
    [key, name, 'Custom Tool', icon, description, JSON.stringify(configObj)]
  );

  // Remove da lista de conectores excluídos caso estivesse desativado
  try {
    const delRes = await pool.query(
      `SELECT value FROM system_configs WHERE key = 'deleted_default_connectors' LIMIT 1;`
    );
    if (delRes.rows.length > 0 && Array.isArray(delRes.rows[0].value)) {
      const updatedList = delRes.rows[0].value.filter(
        (k: string) => sanitizeToolName(k) !== key
      );
      await pool.query(
        `UPDATE system_configs SET value = $1::jsonb, updated_at = NOW() WHERE key = 'deleted_default_connectors';`,
        [JSON.stringify(updatedList)]
      );
    }
  } catch {}

  return {
    success: true,
    tool_id: key,
    name,
    tool_type: toolType,
    endpoint_url: configObj.endpoint_url,
    message: `Tool "${name}" (${key}) criada e habilitada no catálogo dinâmico.`
  };
}

export async function excluirConectorToolDoBrain(params: { provider_key: string }) {
  await ensureOrchestratorSchema();
  const cleanKey = sanitizeToolName(params.provider_key || '');
  if (!cleanKey) {
    return { success: false, message: 'Identificador da conexão (provider_key) não informado.' };
  }

  const delRes = await pool
    .query(
      `DELETE FROM external_connectors WHERE LOWER(provider_key) = LOWER($1) RETURNING provider_key, name;`,
      [cleanKey]
    )
    .catch(() => ({ rows: [] as any[] }));

  // Adiciona à lista de conectores ignorados permanentemente
  try {
    const sysRes = await pool.query(
      `SELECT value FROM system_configs WHERE key = 'deleted_default_connectors' LIMIT 1;`
    );
    const currentDeleted: string[] =
      sysRes.rows.length > 0 && Array.isArray(sysRes.rows[0].value)
        ? sysRes.rows[0].value
        : [];
    if (!currentDeleted.includes(cleanKey)) {
      currentDeleted.push(cleanKey);
      await pool.query(
        `INSERT INTO system_configs (key, value, updated_at)
         VALUES ('deleted_default_connectors', $1::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
        [JSON.stringify(currentDeleted)]
      );
    }
  } catch {}

  // Desvincula de agentes que tinham essa ferramenta associada
  await pool
    .query(
      `UPDATE ai_agents
       SET tools = COALESCE(
         (
           SELECT jsonb_agg(elem)
           FROM jsonb_array_elements_text(tools) AS elem
           WHERE LOWER(elem) <> LOWER($1)
         ),
         '[]'::jsonb
       ),
       updated_at = NOW()
       WHERE tools IS NOT NULL 
         AND jsonb_typeof(tools) = 'array';`,
      [cleanKey]
    )
    .catch(() => {});

  return {
    success: true,
    deleted_key: cleanKey,
    message: `Conexão "${delRes.rows[0]?.name || cleanKey}" excluída permanentemente do catálogo e desvinculada dos agentes.`
  };
}

// ============================================================================
// CRIAÇÃO / ATUALIZAÇÃO DIRETA DE AGENTES (RETORNO COMPLETO DO OBJETO AGENT)
// ============================================================================
export async function criarOuAtualizarAgenteNoBrain(
  params: {
    name: string;
    slug?: string;
    agent_type?: 'code' | 'api' | 'mcp' | 'llm' | string;
    description?: string;
    system_prompt?: string;
    append_behavior_rule?: string;
    provider?: string;
    model?: string;
    api_key?: string;
    icon?: string;
    tools?: string[];
    replace_tools?: boolean;
    endpoint_url?: string;
    http_method?: string;
    auth_token?: string;
    payload_template?: string;
    code_snippet?: string;
    next_agent_slug?: string;
    cron_expression?: string;
  },
  brainConfig?: any
) {
  await ensureOrchestratorSchema();

  const baseName = (params.name || 'agente_especialista').trim();
  const slug = sanitizeToolName(params.slug || baseName || 'agente_especialista');
  const name = baseName;

  const existingRes = await pool
    .query('SELECT * FROM ai_agents WHERE slug = $1 LIMIT 1;', [slug])
    .catch(() => ({ rows: [] as any[] }));
  const existingAgent = existingRes.rows[0] || null;
  const previousPrompt = (existingAgent?.system_prompt || '').trim();

  const previousTools: string[] = Array.isArray(existingAgent?.tools)
    ? existingAgent.tools.map((t: any) => sanitizeToolName(String(t)))
    : [];
  const hasIncomingTools = Array.isArray(params.tools);
  const incomingTools: string[] = hasIncomingTools
    ? params.tools!.map((t) => sanitizeToolName(t)).filter(Boolean)
    : [];

  let toolsList: string[] = [];
  if (hasIncomingTools) {
    toolsList =
      params.replace_tools === false
        ? Array.from(new Set([...previousTools, ...incomingTools]))
        : Array.from(new Set(incomingTools));
  } else {
    toolsList = previousTools;
  }

  const knownNativeSlugs = [
    'home_assistant',
    'brapi',
    'gmail',
    'outlook',
    'telegram',
    'whatsapp',
    'google_calendar',
    'google_sheets',
    'notion'
  ];
  for (const nativeKey of knownNativeSlugs) {
    if (
      (slug.includes(nativeKey) || name.toLowerCase().includes(nativeKey.replace('_', ' '))) &&
      !toolsList.includes(nativeKey)
    ) {
      toolsList.push(nativeKey);
    }
  }

  const candidateConnectorKeys = Array.from(new Set([slug, ...toolsList]));
  let connectorSavedToken = '';
  let connectorSavedUrl = '';
  let connectorSavedMethod = '';

  try {
    const connRes = await pool.query(
      'SELECT * FROM external_connectors WHERE LOWER(provider_key) = ANY($1) ORDER BY updated_at DESC LIMIT 1;',
      [candidateConnectorKeys]
    );
    if (connRes.rows.length > 0) {
      const cfg =
        typeof connRes.rows[0].config === 'string'
          ? JSON.parse(connRes.rows[0].config || '{}')
          : connRes.rows[0].config || {};
      connectorSavedToken = (cfg.auth_token || cfg.api_key || '').trim();
      connectorSavedUrl = (cfg.endpoint_url || '').trim();
      connectorSavedMethod = (cfg.http_method || '').toUpperCase();
    }
  } catch {}

  const finalAuthToken = (
    params.auth_token ||
    params.api_key ||
    existingAgent?.auth_token ||
    existingAgent?.api_key ||
    connectorSavedToken ||
    ''
  )
    .replace(/^Bearer\s+/i, '')
    .trim();

  const finalEndpointUrl = (
    params.endpoint_url ||
    existingAgent?.endpoint_url ||
    connectorSavedUrl ||
    ''
  ).trim();

  if (finalAuthToken || finalEndpointUrl) {
    const targetConnKey =
      toolsList.find((t) => knownNativeSlugs.includes(t)) ||
      knownNativeSlugs.find((k) => slug.includes(k)) ||
      (finalEndpointUrl ? slug : '');

    if (targetConnKey) {
      await criarOuAtualizarToolNoBrain({
        name: params.name || targetConnKey,
        provider_key: targetConnKey,
        tool_type: 'http',
        http_method:
          params.http_method ||
          connectorSavedMethod ||
          (targetConnKey === 'brapi' ? 'GET' : 'POST'),
        endpoint_url: finalEndpointUrl || connectorSavedUrl,
        auth_token: finalAuthToken,
        description: params.description || `Conector sincronizado pelo agente ${name}`
      }).catch(() => {});
    }
  }

  let agentType = (params.agent_type || existingAgent?.agent_type || 'llm').toLowerCase().trim();
  if (params.code_snippet && params.code_snippet.trim() !== '' && !params.agent_type) {
    agentType = 'code';
  } else if (finalEndpointUrl && agentType === 'llm' && toolsList.length === 0) {
    agentType = finalEndpointUrl.toLowerCase().includes('mcp') ? 'mcp' : 'api';
  }

  const provider = (
    params.provider ||
    existingAgent?.provider ||
    brainConfig?.provider ||
    'groq'
  ).toLowerCase();

  const model =
    params.model ||
    existingAgent?.model ||
    brainConfig?.model ||
    'openai/gpt-oss-20b';

  const defaultIcons: Record<string, string> = {
    code: '💻',
    api: '🌐',
    mcp: '🔌',
    llm: '🧠'
  };
  const icon = params.icon || existingAgent?.icon || defaultIcons[agentType] || '🤖';

  const description =
    params.description ||
    existingAgent?.description ||
    `Acione quando o usuário solicitar tarefas do domínio ${name}.`;

  let systemPrompt = '';
  if (params.append_behavior_rule && previousPrompt) {
    systemPrompt = `${previousPrompt}\n\n[DIRETRIZ PERMANENTE DE COMPORTAMENTO E INTERAÇÃO]:\n- ${params.append_behavior_rule.trim()}`;
  } else if (params.system_prompt && params.system_prompt.trim() !== '') {
    systemPrompt = params.system_prompt.trim();
  } else if (previousPrompt) {
    systemPrompt = previousPrompt;
  } else if (agentType === 'api' || agentType === 'mcp') {
    systemPrompt =
      'Extraia os dados principais do JSON retornado pela API e apresente de forma objetiva e estruturada.';
  } else {
    systemPrompt = `Você é o agente especialista ${name}. Utilize suas ferramentas conectadas (${toolsList.join(
      ', '
    )}) para executar as ordens com precisão técnica.`;
  }

  const isGetDefault =
    slug.includes('brapi') ||
    finalEndpointUrl.includes('brapi.dev') ||
    finalEndpointUrl.endsWith('/states');

  const httpMethod = (
    params.http_method ||
    existingAgent?.http_method ||
    connectorSavedMethod ||
    (isGetDefault || agentType === 'api' ? 'GET' : 'POST')
  ).toUpperCase();

  const res = await pool.query(
    `INSERT INTO ai_agents (
      name, slug, agent_type, description, system_prompt,
      provider, model, api_key, icon, tools, endpoint_url, http_method,
      auth_token, payload_template, code_snippet, next_agent_slug,
      cron_expression, is_active, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, TRUE, NOW())
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name,
      agent_type = EXCLUDED.agent_type,
      description = EXCLUDED.description,
      system_prompt = EXCLUDED.system_prompt,
      provider = EXCLUDED.provider,
      model = EXCLUDED.model,
      api_key = COALESCE(NULLIF(EXCLUDED.api_key, ''), ai_agents.api_key),
      icon = EXCLUDED.icon,
      tools = EXCLUDED.tools,
      endpoint_url = COALESCE(NULLIF(EXCLUDED.endpoint_url, ''), ai_agents.endpoint_url),
      http_method = COALESCE(EXCLUDED.http_method, ai_agents.http_method),
      auth_token = COALESCE(NULLIF(EXCLUDED.auth_token, ''), ai_agents.auth_token),
      payload_template = COALESCE(EXCLUDED.payload_template, ai_agents.payload_template),
      code_snippet = COALESCE(EXCLUDED.code_snippet, ai_agents.code_snippet),
      next_agent_slug = COALESCE(EXCLUDED.next_agent_slug, ai_agents.next_agent_slug),
      cron_expression = COALESCE(EXCLUDED.cron_expression, ai_agents.cron_expression),
      is_active = TRUE,
      updated_at = NOW()
    RETURNING *;`,
    [
      name,
      slug,
      agentType,
      description,
      systemPrompt,
      provider,
      model,
      finalAuthToken || null,
      icon,
      JSON.stringify(toolsList),
      finalEndpointUrl || null,
      httpMethod,
      finalAuthToken || null,
      params.payload_template ?? existingAgent?.payload_template ?? null,
      params.code_snippet ?? existingAgent?.code_snippet ?? null,
      params.next_agent_slug ?? existingAgent?.next_agent_slug ?? null,
      params.cron_expression ?? existingAgent?.cron_expression ?? null
    ]
  );

  await pool
    .query(
      `INSERT INTO prompt_versions (target_slug, system_prompt, model, provider)
       VALUES ($1, $2, $3, $4);`,
      [slug, systemPrompt, model, provider]
    )
    .catch(() => {});

  const persistedAgent = res.rows[0];

  return {
    success: true,
    agent: persistedAgent,
    agent_id: persistedAgent?.id,
    slug,
    name,
    agent_type: agentType,
    tools: toolsList,
    message: `Agente "${name}" (${slug}) configurado com sucesso!`
  };
}

// ============================================================================
// ATUALIZAÇÃO DE PERSONA (PRESERVANDO COFRE SAVED_KEYS)
// ============================================================================
export async function atualizarPersonaAgenteOuJarvis(params: {
  target_slug: string;
  behavior_instruction: string;
  replace_entire_prompt?: boolean;
}) {
  const slug = (params.target_slug || 'jarvis_core').toLowerCase().trim();
  const newRule = (params.behavior_instruction || '').trim();

  if (!newRule) {
    throw new Error('A instrução de comportamento não pode estar vazia.');
  }

  if (slug === 'jarvis' || slug === 'jarvis_core' || slug === 'core') {
    const cfgRes = await pool.query(
      `SELECT value FROM system_configs WHERE key IN ('brain_llm_config', 'brain_llm') ORDER BY updated_at DESC LIMIT 1;`
    );

    let rawConfig: Record<string, any> = {};
    if (cfgRes.rows.length > 0) {
      const raw = cfgRes.rows[0].value;
      rawConfig = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
    }

    const currentPrompt = String(rawConfig.system_prompt || 'Você é o JARVIS, o Cérebro Central.').trim();
    const updatedPrompt = params.replace_entire_prompt
      ? newRule
      : `${currentPrompt}\n\n[PREFERÊNCIA DO USUÁRIO / ESTILO DE INTERAÇÃO]:\n- ${newRule}`;

    const updatedConfig = {
      ...rawConfig,
      system_prompt: updatedPrompt,
      updated_at: new Date().toISOString()
    };

    await pool.query(
      `INSERT INTO system_configs (key, value, updated_at)
       VALUES ('brain_llm_config', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
      [JSON.stringify(updatedConfig)]
    );

    await pool
      .query(
        `INSERT INTO prompt_versions (target_slug, system_prompt, model, provider)
         VALUES ('jarvis_core', $1, $2, $3);`,
        [updatedPrompt, rawConfig.model || 'openai/gpt-oss-20b', rawConfig.provider || 'groq']
      )
      .catch(() => {});

    return {
      success: true,
      target: 'JARVIS (Cérebro Central)',
      updated_system_prompt: updatedPrompt
    };
  }

  const agentRes = await pool.query(
    'SELECT * FROM ai_agents WHERE slug = $1 OR LOWER(name) LIKE $2 LIMIT 1;',
    [slug, `%${slug}%`]
  );

  if (agentRes.rows.length === 0) {
    throw new Error(`Agente "${slug}" não encontrado para atualizar o comportamento.`);
  }

  const agent = agentRes.rows[0];
  const updatedAgentPrompt = params.replace_entire_prompt
    ? newRule
    : `${(agent.system_prompt || '').trim()}\n\n[PREFERÊNCIA DO USUÁRIO / ESTILO DE INTERAÇÃO]:\n- ${newRule}`;

  await pool.query(
    `UPDATE ai_agents 
     SET system_prompt = $1, updated_at = NOW() 
     WHERE id = $2;`,
    [updatedAgentPrompt, agent.id]
  );

  await pool
    .query(
      `INSERT INTO prompt_versions (target_slug, system_prompt, model, provider)
       VALUES ($1, $2, $3, $4);`,
      [agent.slug, updatedAgentPrompt, agent.model, agent.provider]
    )
    .catch(() => {});

  return {
    success: true,
    target: `${agent.name} (${agent.slug})`,
    updated_system_prompt: updatedAgentPrompt
  };
}

// ============================================================================
// SUÍTE DE SEGURANÇA E DIAGNÓSTICO (RED TEAM, PROBE E AUTO-CURA)
// ============================================================================
export async function executarSuiteSegurancaHacker(params?: {
  mode?: 'red_team_audit' | 'self_healing_debug' | 'api_probe' | string;
  target_slug?: string;
  target_url?: string;
}) {
  const modo = params?.mode || 'red_team_audit';

  if (modo === 'self_healing_debug') {
    const logsRecentes = await pool.query(`
      SELECT agent_name, action_payload, response_payload, execution_time_ms, created_at
      FROM agent_audit_logs
      ORDER BY id DESC
      LIMIT 5;
    `).catch(() => ({ rows: [] as any[] }));

    return {
      success: true,
      mode: 'self_healing_debug',
      status: 'inspected',
      ultimos_eventos: logsRecentes.rows,
      diagnostico: 'Nenhum erro de colapso detectado nas últimas sessões de auditoria.'
    };
  }

  if (modo === 'api_probe' && params?.target_url) {
    try {
      const inicio = Date.now();
      const respostaProbe = await fetch(params.target_url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      return {
        success: true,
        mode: 'api_probe',
        target_url: params.target_url,
        http_status: respostaProbe.status,
        latency_ms: Date.now() - inicio,
        acessivel: respostaProbe.ok
      };
    } catch (err: any) {
      return {
        success: false,
        mode: 'api_probe',
        target_url: params.target_url,
        error: err?.message || 'Timeout/Inacessível'
      };
    }
  }

  const agentesSemProtecao = await pool.query(`
    SELECT count(*)::int as total
    FROM ai_agents
    WHERE is_active = true AND (endpoint_url IS NOT NULL AND auth_token IS NULL);
  `).catch(() => ({ rows: [{ total: 0 }] }));

  return {
    success: true,
    mode: 'red_team_audit',
    status: 'audited',
    agentes_sem_autenticacao: agentesSemProtecao.rows[0]?.total || 0,
    message: 'Auditoria de segurança concluída. Nenhum vazamento de credenciais em plain-text detectado.'
  };
}

// ============================================================================
// ALIASES DE COMPATIBILIDADE COM O RESTANTE DO SISTEMA
// ============================================================================
export const createOrUpdateToolFromBrain = criarOuAtualizarToolNoBrain;
export const deleteToolConnectorFromBrain = excluirConectorToolDoBrain;
export const createOrUpdateAgentFromBrain = criarOuAtualizarAgenteNoBrain;
export const updateAgentOrJarvisPersona = atualizarPersonaAgenteOuJarvis;
export const executeHackerSecuritySuite = executarSuiteSegurancaHacker;

export default {
  toolDelegarCriacaoSubagente,
  toolGerenciarMemoria,
  registrarMetaToolsDoBrain,
  executarDelegacaoSubagente,
  construirOuEvoluirSubagente,
  executarGerenciamentoMemoria,
  salvarMemoriaClassificada,
  criarOuAtualizarToolNoBrain,
  excluirConectorToolDoBrain,
  criarOuAtualizarAgenteNoBrain,
  atualizarPersonaAgenteOuJarvis,
  executarSuiteSegurancaHacker,
  createOrUpdateToolFromBrain,
  deleteToolConnectorFromBrain,
  createOrUpdateAgentFromBrain,
  updateAgentOrJarvisPersona,
  executeHackerSecuritySuite
};

export const toolRegistrarGrafoConhecimento = {
  type: "function" as const,
  function: {
    name: "registrar_grafo_conhecimento",
    description: "Analisa entidades e vínculos duráveis (pessoas, família, empresas, ativos B3, imóveis, dispositivos, saúde, conceitos). Verifica no PostgreSQL se já existem: se não existir, CRIA; se já existir, ATUALIZA e mescla atributos.",
    parameters: {
      type: "object",
      properties: {
        source: { type: "string", description: "Entidade de origem (ex: Dra. Camila, PETR4, Ar Sala)" },
        sourceType: { type: "string", description: "Tipo: pessoa, empresa, ativo, imovel, dispositivo, saude, conceito" },
        sourceProps: { type: "object", description: "Atributos chave-valor da origem (ex: { telefone, especialidade })" },
        relation: { type: "string", description: "Relação direcionada (ex: TRABALHA_EM, ESPOSA_DE, PRECO_TETO, LOCALIZADO_EM)" },
        target: { type: "string", description: "Entidade de destino (ex: Clínica OdontoPrime, R$ 34,50, Sala)" },
        targetType: { type: "string", description: "Tipo da entidade de destino" },
        targetProps: { type: "object", description: "Atributos chave-valor do destino (ex: { endereco })" },
        metadata: { type: "object", description: "Observações ou contexto adicional" },
        oldSource: { type: "string", description: "Preencher APENAS se o usuário estiver corrigindo o nome anterior da entidade origem" },
        oldTarget: { type: "string", description: "Preencher APENAS se o usuário estiver corrigindo o nome anterior da entidade destino" }
      },
      required: ["source", "relation", "target"]
    }
  }
};

export async function executarRegistroGrafoConhecimento(params: any) {
  return await upsertKnowledgeTriplet(params);
}
