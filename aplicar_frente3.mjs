import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BACKUP_DIR = '.backup_frente3';
const FILES = [
  'src/services/orchestrator/montadorPromptEConexoes.ts',
  'src/services/orchestrator/brainMetaTools.ts',
  'src/services/orchestrator/despachanteFerramentas.ts',
  'src/services/orchestrator/executorFerramentasFixas.ts',
  'src/services/orchestratorService.ts',
  'src/services/webMcpService.ts',
  'src/frontend/components/settings/AbaMemoria.vue'
];

fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });
for (const rel of FILES) {
  if (fs.existsSync(rel)) {
    const dest = path.join(BACKUP_DIR, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(rel, dest);
  }
}
console.log('📦 Backup criado em ' + BACKUP_DIR);

function rollback() {
  for (const rel of FILES) {
    const src = path.join(BACKUP_DIR, rel);
    if (fs.existsSync(src)) fs.copyFileSync(src, rel);
  }
  console.error('↩️ Rollback automático executado.');
}

function replaceBetween(code, startMarker, endMarker, replacement, includeEnd = false) {
  const sIdx = code.indexOf(startMarker);
  if (sIdx === -1) throw new Error('Marcador inicial não encontrado: ' + startMarker);
  const eIdx = code.indexOf(endMarker, sIdx + startMarker.length);
  if (eIdx === -1) throw new Error('Marcador final não encontrado: ' + endMarker);
  const cutEnd = includeEnd ? eIdx + endMarker.length : eIdx;
  return code.slice(0, sIdx) + replacement + code.slice(cutEnd);
}

try {
  // 1. src/services/orchestrator/montadorPromptEConexoes.ts
  // Religação completa: Curto Prazo + Médio Prazo + Longo Prazo (RAG + Contatos) + toolGerenciarMemoria
  {
    const p = 'src/services/orchestrator/montadorPromptEConexoes.ts';
    const content = `import { ensureActiveWebMcpTools } from "../webMcpService.js";
// src/services/orchestrator/montadorPromptEConexoes.ts
import { pool } from '../../config/database.js';
import { searchVectorDocuments } from '../ragService.js';
import { getCentralBrainConfig, sanitizeToolName } from './brainConfigAndUtils.js';
import { getDynamicToolsCatalog } from './catalogAndDatabase.js';
import { toolDelegarCriacaoSubagente, toolGerenciarMemoria } from './brainMetaTools.js';

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
      .query(\`SELECT role, content FROM jarvis_chat_memory WHERE session_id = $1 ORDER BY id DESC LIMIT 20;\`, [sessionId])
      .catch(() => ({ rows: [] as any[] })),
    searchVectorDocuments(userPrompt, 6).catch(() => []),
    pool
      .query(
        \`SELECT id, title, category, content
         FROM vector_documents
         WHERE category IN ('contatos', 'permanente')
         ORDER BY id DESC
         LIMIT 30;\`
      )
      .catch(() => ({ rows: [] as any[] })),
    pool
      .query(\`SELECT nome, telefone, apelidos FROM contatos_agenda ORDER BY nome ASC LIMIT 100;\`)
      .catch(() => ({ rows: [] as any[] })),
    pool
      .query(
        \`SELECT id, categoria, titulo, conteudo, expires_at
         FROM jarvis_episodic_memory
         WHERE expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 20;\`
      )
      .catch(() => ({ rows: [] as any[] })),
    pool
      .query(
        \`SELECT LOWER(TRIM(titulo)) AS chave, MAX(titulo) AS titulo, MAX(conteudo) AS conteudo, COUNT(*)::int AS qtd
         FROM jarvis_episodic_memory
         WHERE created_at >= NOW() - INTERVAL '14 days'
         GROUP BY LOWER(TRIM(titulo))
         HAVING COUNT(*) >= 3
         ORDER BY COUNT(*) DESC
         LIMIT 1;\`
      )
      .catch(() => ({ rows: [] as any[] })),
    pool.query(\`SELECT * FROM ai_agents ORDER BY is_active DESC, id ASC;\`).catch(() => ({ rows: [] as any[] })),
    getDynamicToolsCatalog()
  ]);

  const agora = new Date();
  const contextoTemporal = \`\\n[CONTEXTO TEMPORAL ATUAL DO SISTEMA]:
- Data e Hora Atual do Servidor: \${agora.toLocaleString('pt-BR', { timeZone: 'America/Campo_Grande' })}
- ISO 8601: \${agora.toISOString()}
- Fuso Horário Local: America/Campo_Grande (UTC-4)\`;

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
    const apelidosTxt = Array.isArray(c.apelidos) && c.apelidos.length > 0 ? \` | Apelidos/Vínculos: \${c.apelidos.join(', ')}\` : '';
    mapaContatos.set(chave, \`- Nome: \${c.nome} | Telefone: \${c.telefone}\${apelidosTxt}\`);
  }
  const textoAgenda =
    mapaContatos.size > 0
      ? Array.from(mapaContatos.values()).join('\\n')
      : 'Nenhum contato salvo na memória de longo prazo.';

  // 2. Médio Prazo: Memória Episódica Ativa (15 a 180 dias)
  const textoMedioPrazo =
    episodicaRes.rows.length > 0
      ? episodicaRes.rows
          .map((e: any) => {
            const expira = e.expires_at ? new Date(e.expires_at).toLocaleDateString('pt-BR') : '21d';
            return \`- [ID:\${e.id} | \${e.categoria} | expira em \${expira}] \${e.titulo}: \${e.conteudo}\`;
          })
          .join('\\n')
      : 'Nenhuma memória episódica ativa no momento.';

  // 3. Longo Prazo: Fatos Permanentes + Busca Semântica RAG
  const seenRag = new Set<string>();
  const itensLongoPrazo: string[] = [];

  for (const doc of longoPrazoFixoRes.rows) {
    if (doc.category === 'contatos') continue;
    const txt = String(doc.content || '').trim();
    if (txt && !seenRag.has(txt)) {
      seenRag.add(txt);
      itensLongoPrazo.push(\`- [\${doc.title || 'Permanente'}] \${txt}\`);
    }
  }

  const listaRag = Array.isArray(linhasRag) ? linhasRag : (linhasRag as any)?.matches || [];
  for (const m of listaRag) {
    if ((m.similarity ?? 1) <= 0.12) continue;
    const txt = String(m.content || '').trim();
    if (txt && !seenRag.has(txt)) {
      seenRag.add(txt);
      itensLongoPrazo.push(\`- \${txt}\`);
    }
  }
  const textoLongoPrazo =
    itensLongoPrazo.length > 0
      ? itensLongoPrazo.join('\\n')
      : 'Nenhum documento adicional indexado no RAG.';

  const avisoConsolidacao =
    candidatosRes.rows.length > 0
      ? \`\\n[CONSOLIDAÇÃO AUTÔNOMA DE MEMÓRIA]: O padrão "\${candidatosRes.rows[0].titulo}" (\${candidatosRes.rows[0].conteudo}) foi citado \${candidatosRes.rows[0].qtd} vezes nos últimos 14 dias. Ao final da resposta, pergunte de forma natural se o usuário deseja promovê-lo definitivamente para a memória de longo prazo.\`
      : '';

  const contextoMemoriaCompleto = [
    \`[GOVERNANÇA DE MEMÓRIA EM 3 NÍVEIS - OBRIGATÓRIO]:
1. CURTO PRAZO (Sessão Atual): Histórico imediato da conversa acima. Não precisa salvar manualmente.
2. MÉDIO PRAZO (15 a 180 dias): Para listas de compras, lembretes, tarefas ativas e projetos temporários, use SEMPRE a ferramenta "gerenciar_memoria_cognitiva" com tipo_memoria="medio_prazo" (contexto_semanal: 15-30d; tarefa_ativa: 45-60d; projeto: 90-180d). NUNCA crie arquivos .md/.txt na VM nem tente salvar listas no Notion sem ordem explícita.
3. ATUALIZAR / CONCLUIR MÉDIO PRAZO: Se já existir item em [MEMÓRIA EPISÓDICA ATIVA], use acao="atualizar" com o ID para incluir/remover itens, ou acao="concluir" ao finalizar.
4. LONGO PRAZO (Permanente & Contatos): Contatos telefônicos e regras permanentes ficam na Memória de Longo Prazo. Para salvar contatos, use "salvar_contato_agenda" ou "gerenciar_memoria_cognitiva" (tipo_memoria="longo_prazo", categoria="contato"). Para consultar números já listados abaixo em [MEMÓRIA DE LONGO PRAZO - CONTATOS], leia diretamente daqui e repasse o telefone ao especialista (ex: WhatsApp) sem pedir o número ao usuário.\`,
    \`[MEMÓRIA DE LONGO PRAZO - AGENDA DE CONTATOS]:\\n\${textoAgenda}\`,
    \`[MEMÓRIA DE MÉDIO PRAZO - EPISÓDICA ATIVA]:\\n\${textoMedioPrazo}\`,
    \`[MEMÓRIA DE LONGO PRAZO - FATOS E DOCUMENTOS (RAG)]:\\n\${textoLongoPrazo}\`,
    avisoConsolidacao
  ]
    .filter(Boolean)
    .join('\\n\\n');

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
            return \`- [ESPECIALISTA ATIVO] Nome: "\${a.name}" | Slug de Chamada: "\${sanitizeToolName(a.slug)}"
  Domínio: \${a.description || 'Geral'}
  Ferramentas sob seu comando: \${toolsList.length > 0 ? \`[\${toolsList.join(', ')}]\` : '[Nenhuma tool externa]'}
  Diretriz: Para demandas deste assunto, acione a ferramenta de função "\${sanitizeToolName(a.slug)}".\`;
          })
          .join('\\n\\n')
      : 'Nenhum especialista ativo no momento.';

  const resumoAgentesInativos =
    agentesInativos.length > 0
      ? agentesInativos
          .map((a: any) => \`- [PAUSADO] "\${a.name}" (slug: "\${sanitizeToolName(a.slug)}")\`)
          .join('\\n')
      : 'Nenhum especialista pausado.';

  const tools: any[] = agentesAtivos.map((ag: any) => {
    let toolsDoAgente: string[] = [];
    if (Array.isArray(ag.tools)) toolsDoAgente = ag.tools;
    else if (typeof ag.tools === 'string') {
      try { toolsDoAgente = JSON.parse(ag.tools || '[]'); } catch { toolsDoAgente = []; }
    }

    const descEnriquecida = \`\${ag.description?.trim() || \`Especialista \${ag.name}.\`} \${
      toolsDoAgente.length > 0 ? \`Controla as seguintes ferramentas técnicas: [\${toolsDoAgente.join(', ')}].\` : ''
    } Acione este agente para tarefas do seu domínio.\`;

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
    toolGerenciarMemoria,
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
            provider_key: { type: 'string', description: \`Slug da conexão: [\${validToolSlugs.join(', ')}]\` }
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

  let promptSistemaCompleto = \`\${configuracaoCerebro.system_prompt}
\${contextoTemporal}
Identidade Autenticada / Locutor: \${activeSpeakerName} (\${speakerRole})
URL Base do Servidor: \${configuracaoCerebro.server_base_url}\${instrucaoVisual}

--- AGENTES ESPECIALISTAS INTEGRADOS AO ECOSSISTEMA ---
\${resumoAgentesAtivos}

--- AGENTES INATIVOS / PAUSADOS ---
\${resumoAgentesInativos}

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
\${contextoMemoriaCompleto}\`;

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
              description: \`[Interface Aberta / WebMCP] \${_wt.description}\`,
              parameters:
                _wt.inputSchema?.properties && Object.keys(_wt.inputSchema.properties).length > 0
                  ? _wt.inputSchema
                  : { type: 'object', properties: { confirmar: { type: 'boolean', description: 'Confirmar ação na interface' } } }
            }
          });
        }
      }
      if (typeof promptSistemaCompleto === 'string') {
        promptSistemaCompleto += \`\\n\\n[FERRAMENTAS DE TELA ATIVAS (WEBMCP)]:\\n\${_liveWmcp
          .map((t) => \`- \${sanitizeToolName(t.name)}: \${t.description}\`)
          .join('\\n')}\\nREGRA CRÍTICA: Para executar qualquer ação visual acima, CHAME A FERRAMENTA NATIVA correspondente apenas quando o usuário ordenar explicitamente abrir ou navegar para a tela.\`;
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
`;
    fs.writeFileSync(p, content, 'utf8');
    console.log('✅ montadorPromptEConexoes.ts atualizado (Curto, Médio e Longo Prazo + Contatos + toolGerenciarMemoria)');
  }

  // 2. src/services/orchestrator/brainMetaTools.ts -> Suporte completo a salvar/atualizar/concluir/consultar nos 3 níveis
  {
    const p = 'src/services/orchestrator/brainMetaTools.ts';
    let code = fs.readFileSync(p, 'utf8');
    const newMemBlock = `  if (acao === 'atualizar') {
    if (tipo_memoria === 'medio_prazo') {
      const dias = resolverDias(categoria, dias_validade);
      const updRes = id
        ? await pool.query(
            \`UPDATE jarvis_episodic_memory SET conteudo = $1, titulo = COALESCE(NULLIF($2, ''), titulo), expires_at = NOW() + ($3 || ' days')::interval WHERE id = $4 RETURNING id, titulo, conteudo, expires_at;\`,
            [conteudo, titulo, dias, id]
          )
        : await pool.query(
            \`UPDATE jarvis_episodic_memory SET conteudo = $1, expires_at = NOW() + ($2 || ' days')::interval
             WHERE id = (SELECT id FROM jarvis_episodic_memory WHERE expires_at > NOW() AND titulo ILIKE $3 ORDER BY id DESC LIMIT 1)
             RETURNING id, titulo, conteudo, expires_at;\`,
            [conteudo, dias, '%' + titulo + '%']
          );
      if (updRes.rows.length > 0) {
        return { success: true, registro: updRes.rows[0], message: 'Memória "' + updRes.rows[0].titulo + '" atualizada (válida por mais ' + dias + ' dias).' };
      }
      return { success: false, message: 'Nenhuma memória episódica ativa encontrada com "' + titulo + '".' };
    }

    if (tipo_memoria === 'longo_prazo') {
      if (categoria === 'contato' || /telefone|contato|whatsapp|celular/i.test(titulo)) {
        const digitos = conteudo.replace(/\\D/g, '');
        if (digitos.length >= 8) {
          let fone = digitos;
          if (fone.length === 8 || fone.length === 9) fone = '5567' + (fone.length === 8 ? '9' + fone : fone);
          else if (fone.length === 10 || fone.length === 11) fone = '55' + fone;
          const nomeNorm = titulo.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim();
          await pool.query(
            \`INSERT INTO contatos_agenda (nome, telefone, apelidos) VALUES ($1, $2, ARRAY[$3])
             ON CONFLICT (nome) DO UPDATE SET telefone = EXCLUDED.telefone, atualizado_em = NOW();\`,
            [nomeNorm, fone, titulo]
          ).catch(() => {});
          await pool.query(\`DELETE FROM vector_documents WHERE category = 'contatos' AND (title ILIKE $1 OR content ILIKE $2);\`, ['%' + titulo + '%', '%' + nomeNorm + '%']).catch(() => {});
          await pool.query(\`INSERT INTO vector_documents (title, content, category) VALUES ($1, $2, 'contatos');\`, ['Contato: ' + titulo, 'Nome: ' + titulo + ' | Telefone: ' + fone]);
          return { success: true, tipo_memoria: 'longo_prazo', message: 'Contato "' + titulo + '" (' + fone + ') atualizado na memória de longo prazo.' };
        }
      }
      const updRag = id
        ? await pool.query(\`UPDATE vector_documents SET content = $1, title = COALESCE(NULLIF($2, ''), title) WHERE id = $3 RETURNING id, title;\`, [conteudo, titulo, id])
        : await pool.query(\`UPDATE vector_documents SET content = $1 WHERE id = (SELECT id FROM vector_documents WHERE title ILIKE $2 ORDER BY id DESC LIMIT 1) RETURNING id, title;\`, [conteudo, '%' + titulo + '%']);
      if (updRag.rows.length > 0) {
        return { success: true, registro: updRag.rows[0], message: 'Memória de longo prazo "' + updRag.rows[0].title + '" atualizada.' };
      }
      return { success: false, message: 'Registro de longo prazo "' + titulo + '" não localizado para atualização.' };
    }
  }

  if (acao === 'concluir') {
    if (tipo_memoria === 'medio_prazo') {
      const delRes = id
        ? await pool.query(\`UPDATE jarvis_episodic_memory SET expires_at = NOW() WHERE id = $1 RETURNING id, titulo;\`, [id])
        : await pool.query(
            \`UPDATE jarvis_episodic_memory SET expires_at = NOW()
             WHERE id = (SELECT id FROM jarvis_episodic_memory WHERE expires_at > NOW() AND titulo ILIKE $1 ORDER BY id DESC LIMIT 1)
             RETURNING id, titulo;\`,
            ['%' + titulo + '%']
          );
      return {
        success: delRes.rows.length > 0,
        message: delRes.rows.length > 0 ? 'Memória "' + delRes.rows[0].titulo + '" concluída e encerrada.' : 'Registro "' + titulo + '" já encerrado.'
      };
    }
    if (tipo_memoria === 'longo_prazo') {
      const delRag = id
        ? await pool.query(\`DELETE FROM vector_documents WHERE id = $1 RETURNING id, title;\`, [id])
        : await pool.query(\`DELETE FROM vector_documents WHERE title ILIKE $1 RETURNING id, title;\`, ['%' + titulo + '%']);
      return {
        success: delRag.rows.length > 0,
        message: delRag.rows.length > 0 ? 'Registro de longo prazo "' + delRag.rows[0].title + '" removido.' : 'Registro não localizado.'
      };
    }
  }

  `;
    code = replaceBetween(code, "if (acao === 'atualizar' && tipo_memoria === 'medio_prazo') {", "if (acao === 'consultar') {", newMemBlock, false);
    fs.writeFileSync(p, code, 'utf8');
    console.log('✅ brainMetaTools.ts atualizado (CRUD completo nos 3 níveis de memória)');
  }

  // 3. src/services/orchestrator/despachanteFerramentas.ts
  // Adiciona despacho nativo para gerenciar_memoria_cognitiva, trilha das tools admin e trava do WhatsApp
  {
    const p = 'src/services/orchestrator/despachanteFerramentas.ts';
    let code = fs.readFileSync(p, 'utf8');

    code = code.replace(
      "  executeHackerSecuritySuite,\n  executarDelegacaoSubagente\n} from './brainMetaTools.js';",
      "  executeHackerSecuritySuite,\n  executarDelegacaoSubagente,\n  executarGerenciamentoMemoria\n} from './brainMetaTools.js';"
    );

    const anchorDeleg = "// 1. Delegação Segura para o Subagente Arquiteto";
    const memHandler = `// 0. Gestão Cognitiva de Memória (Curto, Médio e Longo Prazo)
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

      `;
    if (!code.includes("if (fnName === 'gerenciar_memoria_cognitiva')")) {
      code = code.replace(anchorDeleg, memHandler + anchorDeleg);
    }

    // Torna o auto-disparo de WhatsApp estrito (apenas quando WhatsApp/Zap foi explicitamente pedido e não disparado)
    const newWhatsAuto = `// [AUTO_CONTINUACAO_WHATSAPP]
    const pedeEnvioWhatsAppExplicito =
      /\\b(whatsapp|zap)\\b/i.test(userPrompt) &&
      /\\b(mande|manda|envie|envia|encaminhe|encaminha)\\b/i.test(userPrompt);
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
          .join('\\n');
        filaToolCallsAtual = [
          {
            id: 'auto_whats_' + Date.now(),
            type: 'function',
            function: {
              name: sanitizeToolName(agWhats.slug),
              arguments: JSON.stringify({
                task_details: 'Pedido do utilizador: "' + userPrompt + '". Envie no WhatsApp utilizando o telefone localizado na Memória de Longo Prazo (Agenda de Contatos).\\n\\nDados coletados:\\n' + resumoDados
              })
            }
          }
        ];
        continue;
      }
    }`;
    code = replaceBetween(
      code,
      '// [AUTO_CONTINUACAO_WHATSAPP]',
      "textoFinal = msgEscolhaReAct?.content?.trim() || '';",
      newWhatsAuto + '\n\n    ',
      false
    );

    fs.writeFileSync(p, code, 'utf8');
    console.log('✅ despachanteFerramentas.ts atualizado (handler gerenciar_memoria_cognitiva + WhatsApp seguro)');
  }

  // 4. src/services/orchestrator/executorFerramentasFixas.ts
  // Espelha contatos salvos na tabela vector_documents (category = 'contatos') sem duplicar
  {
    const p = 'src/services/orchestrator/executorFerramentasFixas.ts';
    let code = fs.readFileSync(p, 'utf8');
    const oldUpsert = `        if (nomeNorm && foneFinal) {
          await pool.query(
            \`INSERT INTO contatos_agenda (nome, telefone, apelidos)
             VALUES ($1, $2, ARRAY[$3])
             ON CONFLICT (nome) DO UPDATE 
             SET telefone = EXCLUDED.telefone, atualizado_em = NOW();\`,
            [nomeNorm, foneFinal, String(nomeIdentificado || nomeNorm)]
          );
        }`;
    const newUpsert = `        if (nomeNorm && foneFinal) {
          const rotuloOriginal = String(nomeIdentificado || nomeNorm).trim();
          await pool.query(
            \`INSERT INTO contatos_agenda (nome, telefone, apelidos)
             VALUES ($1, $2, ARRAY[$3])
             ON CONFLICT (nome) DO UPDATE 
             SET telefone = EXCLUDED.telefone, atualizado_em = NOW();\`,
            [nomeNorm, foneFinal, rotuloOriginal]
          );
          await pool.query(
            \`DELETE FROM vector_documents WHERE category = 'contatos' AND (LOWER(title) = LOWER($1) OR content LIKE '%' || $2 || '%');\`,
            ['Contato: ' + rotuloOriginal, foneFinal]
          ).catch(() => {});
          await pool.query(
            \`INSERT INTO vector_documents (title, category, content)
             VALUES ($1, 'contatos', $2);\`,
            ['Contato: ' + rotuloOriginal, 'Nome: ' + rotuloOriginal + ' | Telefone: ' + foneFinal + ' | Apelidos: ' + nomeNorm]
          ).catch(() => {});
        }`;
    if (code.includes(oldUpsert)) {
      code = code.replace(oldUpsert, newUpsert);
      fs.writeFileSync(p, code, 'utf8');
      console.log('✅ executorFerramentasFixas.ts atualizado (espelhamento de contatos no Longo Prazo)');
    }
  }

  // 5. src/services/orchestratorService.ts
  // Para de poluir Longo Prazo (vector_documents) com todo bate-papo trivial e passa toolsCatalogoOrquestrador no XML guard
  {
    const p = 'src/services/orchestratorService.ts';
    let code = fs.readFileSync(p, 'utf8');

    const ragChatDump = `,
      ingestDocumentToRag(
        \`Pergunta (\${activeSpeakerName}): \${userPrompt} | Resposta (\${triggeredAgentName}): \${textoRespostaFinal}\`,
        { sessionId, agent: triggeredAgentName, speaker: activeSpeakerName }
      )`;
    if (code.includes(ragChatDump)) {
      code = code.replace(ragChatDump, '');
    }

    code = code.replace(
      '        connectorsMap: dadosContexto.connectorsMap,\n        validToolSlugs: dadosContexto.validToolSlugs,\n        activeSpeakerName,',
      '        connectorsMap: dadosContexto.connectorsMap,\n        validToolSlugs: dadosContexto.validToolSlugs,\n        toolsCatalogoOrquestrador: dadosContexto.tools,\n        activeSpeakerName,'
    );

    fs.writeFileSync(p, code, 'utf8');
    console.log('✅ orchestratorService.ts atualizado (Curto Prazo isolado do Longo Prazo RAG)');
  }

  // 6. src/services/webMcpService.ts
  // Evita troca de aba acidental em perguntas informativas sobre memória/agentes
  {
    const p = 'src/services/webMcpService.ts';
    let code = fs.readFileSync(p, 'utf8');
    const oldUiRegex = `  const hasUiIntent =
    /(abr[aei]|abrir|mud[ae]|mudar|vai|ir|mostr[ae]|mostrar|acess[ae]|acessar|naveg[ae]|navegar|troc[ae]|trocar|volt[ae]|voltar|fech[ae]|fechar|foc[ae]|focar|filtr[ae]|filtrar|acionando|controlador de interface|webmcp)/.test(
      combined
    );`;
    const newUiRegex = `  const ehPerguntaInformativa =
    uNorm.includes('?') ||
    /^(o que|oque|como|qual|quais|quando|quanto|quantos|por que|porque|voce vai|vai guardar|onde)/.test(uNorm);
  if (ehPerguntaInformativa) return null;

  const hasUiIntent =
    /(abr[aei]\\s+(?:a\\s+|o\\s+)?(?:aba|painel|tela|config)|abrir\\s+(?:a\\s+|o\\s+)?(?:aba|painel|tela)|mud[ae]\\s+(?:para|de)\\s+aba|va\\s+para\\s+(?:a\\s+)?aba|vai\\s+para\\s+(?:a\\s+)?aba|naveg[ae]\\s+para|troc[ae]\\s+(?:de\\s+|a\\s+)?aba|volt[ae]\\s+(?:para\\s+o\\s+)?cerebro|fech[ae]\\s+(?:o\\s+)?painel|controlador de interface|webmcp)/.test(
      uNorm
    );`;
    if (code.includes(oldUiRegex)) {
      code = code.replace(oldUiRegex, newUiRegex);
      fs.writeFileSync(p, code, 'utf8');
      console.log('✅ webMcpService.ts atualizado (sem falsos-positivos de troca de aba)');
    }
  }

  // 7. src/frontend/components/settings/AbaMemoria.vue
  // Corrige nivelAtivo -> nivelMemoriaAtivo para exibir o Document Loader na aba Longo Prazo
  {
    const p = 'src/frontend/components/settings/AbaMemoria.vue';
    let code = fs.readFileSync(p, 'utf8');
    if (code.includes('nivelAtivo')) {
      code = code.replace(/nivelAtivo/g, 'nivelMemoriaAtivo');
      fs.writeFileSync(p, code, 'utf8');
      console.log('✅ AbaMemoria.vue atualizado (Document Loader visível no Longo Prazo)');
    }
  }

  // 8. Sincroniza contatos_agenda -> vector_documents no PostgreSQL (sem duplicar)
  const sqlSync = `
INSERT INTO vector_documents (title, category, content)
SELECT
  'Contato: ' || INITCAP(nome),
  'contatos',
  'Nome: ' || INITCAP(nome) || ' | Telefone: ' || telefone || ' | Apelidos: ' || COALESCE(array_to_string(apelidos, ', '), '')
FROM contatos_agenda
WHERE NOT EXISTS (
  SELECT 1 FROM vector_documents WHERE category = 'contatos' AND content LIKE '%' || contatos_agenda.telefone || '%'
);
`;
  try {
    execSync('sudo -u postgres psql -d postgres', { input: sqlSync, stdio: ['pipe', 'inherit', 'inherit'] });
    console.log('✅ Contatos sincronizados com a Memória de Longo Prazo no PostgreSQL');
  } catch (e) {
    console.warn('⚠️ Aviso PostgreSQL:', e.message);
  }

  // 9. Compila Backend + Frontend e reinicia PM2
  console.log('🔨 Compilando backend e frontend...');
  execSync('npm run build && npm run build:frontend', { stdio: 'inherit' });
  console.log('🚀 Reiniciando PM2...');
  execSync('pm2 flush && pm2 restart all --update-env && pm2 save', { stdio: 'inherit' });

  // 10. Commit e push para origin/main
  console.log('📤 Enviando Frente 3 para o GitHub (origin/main)...');
  execSync('git add -A', { stdio: 'inherit' });
  try {
    execSync('git commit -m "feat(memory): unifica acesso as 3 memorias (curto, medio e longo prazo) e contatos no orquestrador"', { stdio: 'inherit' });
  } catch {
    console.log('ℹ️ Sem alterações pendentes para novo commit.');
  }
  execSync('git push origin main', { stdio: 'inherit' });

  fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  console.log('\n🎉 FRENTE 3 CONCLUÍDA, COMPILADA E ENVIADA AO GITHUB!');
} catch (err) {
  console.error('\n❌ ERRO NA FRENTE 3:', err.message);
  rollback();
  process.exit(1);
}
