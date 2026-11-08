import { pool } from '../../config/database.js';
import { createLLMClient, getCentralBrainConfig } from '../orchestrator/brainConfigAndUtils.js';

// ============================================================================
// CONFIGURAÇÕES E TRAVAS DE SEGURANÇA (CIRCUIT BREAKER)
// ============================================================================
const CONFIG_TRAVAS = {
  // Limite máximo de agentes criados por janela de 1 hora
  LIMITE_HORARIO_CRAVADO: 3,
  // Limite máximo de agentes criados em um período de 24 horas
  LIMITE_DIARIO_CRAVADO: 8,
  // Janela noturna de bloqueio para criações autônomas não supervisionadas (22h às 07h)
  HORA_INICIO_BLOQUEIO_NOTURNO: 22,
  HORA_FIM_BLOQUEIO_NOTURNO: 7,
  // Se falso, bloqueia qualquer criação vinda de Cron/Watchdog sem interação humana
  PERMITIR_CRIACAO_POR_CRON_OU_WATCHDOG: false
};

// Interface do pedido de criação ou evolução
export interface ParametrosFabricaAgente {
  intencaoUsuario: string;
  origemChamada?: 'usuario_direto' | 'cron' | 'watchdog' | 'jarvis_orquestrador';
  forcarCriacao?: boolean;
}

// ============================================================================
// TRAVA 1 E 2: VALIDAÇÃO DE TAXA, HORÁRIO E ORIGEM
// ============================================================================
async function validarTravasDeCriacao(origem: string = 'usuario_direto'): Promise<{ permitido: boolean; motivo?: string }> {
  const agora = new Date();
  const horaAtual = agora.getHours();

  // Trava Noturna: Impede loops automáticos de madrugada sem autorização expressa
  const emHorarioNoturno = horaAtual >= CONFIG_TRAVAS.HORA_INICIO_BLOQUEIO_NOTURNO || horaAtual < CONFIG_TRAVAS.HORA_FIM_BLOQUEIO_NOTURNO;
  if (emHorarioNoturno && origem !== 'usuario_direto') {
    return {
      permitido: false,
      motivo: `[TRAVA NOTURNA ATIVADA] Criações autônomas bloqueadas entre 22:00 e 07:00 para evitar loops noturnos (Horário atual: ${horaAtual}h).`
    };
  }

  // Trava de Origem: Bloqueia criação disparada por rotinas de background
  if (!CONFIG_TRAVAS.PERMITIR_CRIACAO_POR_CRON_OU_WATCHDOG && (origem === 'cron' || origem === 'watchdog')) {
    return {
      permitido: false,
      motivo: '[TRAVA DE ORIGEM] Criação automática rejeitada: disparos de rotina agendada ou auto-cura não têm permissão para criar agentes.'
    };
  }

  // Trava de Quota por Janela (Rate Limit no PostgreSQL)
  const checagemUltimaHora = await pool.query(`
    SELECT COUNT(*)::int as total
    FROM ai_agents
    WHERE created_at >= NOW() - INTERVAL '1 hour';
  `);
  if (checagemUltimaHora.rows[0].total >= CONFIG_TRAVAS.LIMITE_HORARIO_CRAVADO) {
    return {
      permitido: false,
      motivo: `[TRAVA DE QUOTA HORÁRIA] Limite de segurança excedido: já foram criados ${checagemUltimaHora.rows[0].total} agentes na última hora (Máximo permitido: ${CONFIG_TRAVAS.LIMITE_HORARIO_CRAVADO}).`
    };
  }

  const checagemUltimoDia = await pool.query(`
    SELECT COUNT(*)::int as total
    FROM ai_agents
    WHERE created_at >= NOW() - INTERVAL '24 hours';
  `);
  if (checagemUltimoDia.rows[0].total >= CONFIG_TRAVAS.LIMITE_DIARIO_CRAVADO) {
    return {
      permitido: false,
      motivo: `[TRAVA DE QUOTA DIÁRIA] Limite diário atingido: ${checagemUltimoDia.rows[0].total} agentes criados nas últimas 24h (Máximo permitido: ${CONFIG_TRAVAS.LIMITE_DIARIO_CRAVADO}).`
    };
  }

  return { permitido: true };
}

// ============================================================================
// ACESSO TOTAL AO CATÁLOGO DE CONEXÕES & AGENTES EXISTENTES
// ============================================================================
async function obterInventarioCompletoConexoes() {
  // 1. Busca todos os conectores externos ativos cadastrados
  const conectoresRes = await pool.query(`
    SELECT provider_key, name, category, icon, description, is_enabled
    FROM external_connectors
    WHERE is_enabled = true
    ORDER BY category ASC, name ASC;
  `);

  // 2. Busca todos os agentes especialistas atuais para evitar duplicidade de domínio
  const agentesRes = await pool.query(`
    SELECT id, name, slug, agent_type, description, tools
    FROM ai_agents
    WHERE is_active = true
    ORDER BY id ASC;
  `);

  return {
    conectoresDisponiveis: conectoresRes.rows,
    agentesAtuais: agentesRes.rows
  };
}

// ============================================================================
// SUBAGENTE ARQUITETO: RACIOCINA, FORMULA E PERSISTE O NÓ
// ============================================================================
export async function construirOuEvoluirSubagente(dados: ParametrosFabricaAgente) {
  const { intencaoUsuario, origemChamada = 'jarvis_orquestrador' } = dados;

  // 1. Executa a auditoria de travas
  const trava = await validarTravasDeCriacao(origemChamada);
  if (!trava.permitido) {
    console.warn(`🛡️ [Fábrica de Agentes] Ação bloqueada: ${trava.motivo}`);
    return {
      sucesso: false,
      bloqueadoPorTrava: true,
      mensagem: trava.motivo
    };
  }

  // 2. Coleta todo o ecossistema de conexões e agentes
  const { conectoresDisponiveis, agentesAtuais } = await obterInventarioCompletoConexoes();

  const resumoConectores = conectoresDisponiveis
    .map(c => `- Chave: "${c.provider_key}" | Nome: "${c.name}" | Categoria: ${c.category} | Escopo: ${c.description}`)
    .join('\n');

  const resumoAgentes = agentesAtuais
    .map(a => `- Nome: "${a.name}" | Slug: "${a.slug}" | Tipo: ${a.agent_type} | Ferramentas: ${JSON.stringify(a.tools || [])} | Finalidade: ${a.description}`)
    .join('\n');

  // 3. Consulta a LLM Arquiteta com as diretrizes de governança e economia de tokens
  const configCerebro = await getCentralBrainConfig();
  const llm = createLLMClient(configCerebro);

  const promptEspecialista = `Você é o Agente Arquiteto de Sistemas, especialista subordinado ao JARVIS. Sua função exclusiva é projetar e configurar novos nós e subagentes ou evoluir os já existentes, mantendo o JARVIS desocupado.

[INVENTÁRIO DE TODAS AS CONEXÕES E TOOLS DISPONÍVEIS NO SERVIDOR]
${resumoConectores || 'Nenhuma ferramenta externa cadastrada no momento.'}

[AGENTES ATUALMENTE EXISTENTES NO ECOSSISTEMA]
${resumoAgentes || 'Nenhum agente cadastrado ainda.'}

DIRETRIZES DE DECISÃO TÉCNICA E ECONOMIA DE TOKENS:
1. PREVENÇÃO DE DUPLICIDADE:
   - Verifique a lista de agentes existentes. Se já houver um nó para este mesmo nicho/domínio, você DEVE retornar a ação "ATUALIZAR" usando o mesmo "slug".
   - Jamais crie nomes com timestamps (ex: m034995). O slug deve ser técnico, limpo e em snake_case (ex: "cotacoes_b3", "assistente_residencial").

2. HIERARQUIA DE CUSTO (ESCOLHA DO AGENT_TYPE):
   - "code" (ZERO TOKENS): Para cálculos, fórmulas, parsing de strings/JSON, validação de regex e rotinas determinísticas.
   - "api" (ZERO TOKENS): Para requisições diretas a endpoints REST/Webhooks.
   - "mcp": Para servidores Model Context Protocol.
   - "llm": Use APENAS se a tarefa exigir interpretação semântica subjetiva ou redação analítica.

3. VINCULAÇÃO CIRÚRGICA DE TOOLS:
   - Conecte apenas as ferramentas estritamente pertinentes ao domínio do agente a partir do inventário fornecido.

Responda OBRIGATORIAMENTE em JSON puro no seguinte formato:
{
  "acao": "CRIAR" | "ATUALIZAR",
  "nome": "Nome do Agente",
  "slug": "identificador_snake_case",
  "tipo_agente": "code" | "api" | "mcp" | "llm",
  "descricao_gatilho": "Quando o orquestrador deve acionar este nó",
  "prompt_sistema": "Instruções do agente ou regras de extração do JSON",
  "codigo_javascript": "function(payload, env) { return { ... }; } caso o tipo seja code",
  "url_endpoint": "URL caso seja api ou mcp",
  "metodo_http": "GET" | "POST",
  "modelo_ia": "llama-3.3-70b-versatile ou gpt-4o-mini",
  "ferramentas_selecionadas": ["chave_da_tool_1", "chave_da_tool_2"],
  "icone": "Emoji representativo",
  "justificativa_arquitetural": "Por que esta estrutura foi escolhida"
}`;

  const completion = await llm.chat.completions.create({
    model: configCerebro.model || 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: promptEspecialista },
      { role: 'user', content: `Demanda de novo subagente: "${intencaoUsuario}"` }
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' }
  });

  const respostaTexto = completion.choices[0]?.message?.content || '{}';
  let plano;
  try {
    plano = JSON.parse(respostaTexto);
  } catch {
    throw new Error('Falha ao decodificar a resposta do Agente Arquiteto.');
  }

  // 4. Grava ou Atualiza o Agente no PostgreSQL com histórico de versões
  const slugLimpo = (plano.slug || 'novo_agente')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, '_')
    .slice(0, 45);

  // Backup em prompt_versions antes de alterar
  await pool.query(`
    INSERT INTO prompt_versions (target_slug, system_prompt, model, provider)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT DO NOTHING;
  `, [slugLimpo, plano.prompt_sistema || '', plano.modelo_ia || 'llama-3.3-70b-versatile', configCerebro.provider]);

  // Persistência com upsert (ON CONFLICT DO UPDATE)
  const resultadoPersistencia = await pool.query(`
    INSERT INTO ai_agents (
      name, slug, description, system_prompt, agent_type, 
      code_snippet, endpoint_url, http_method, model, 
      provider, tools, icon, is_active, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, true, NOW())
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      system_prompt = EXCLUDED.system_prompt,
      agent_type = EXCLUDED.agent_type,
      code_snippet = EXCLUDED.code_snippet,
      endpoint_url = EXCLUDED.endpoint_url,
      http_method = EXCLUDED.http_method,
      model = EXCLUDED.model,
      tools = EXCLUDED.tools,
      icon = EXCLUDED.icon,
      is_active = true,
      updated_at = NOW()
    RETURNING id, name, slug, agent_type, tools;
  `, [
    plano.nome || 'Subagente Especialista',
    slugLimpo,
    plano.descricao_gatilho || '',
    plano.prompt_sistema || '',
    plano.tipo_agente || 'llm',
    plano.codigo_javascript || null,
    plano.url_endpoint || null,
    plano.metodo_http || 'POST',
    plano.modelo_ia || 'llama-3.3-70b-versatile',
    configCerebro.provider || 'groq',
    JSON.stringify(plano.ferramentas_selecionadas || []),
    plano.icone || '🤖'
  ]);

  return {
    sucesso: true,
    acaoExecutada: plano.acao,
    agente: resultadoPersistencia.rows[0],
    detalhes: plano.justificativa_arquitetural
  };
}