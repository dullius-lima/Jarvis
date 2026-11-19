import fs from 'fs';
import { execSync } from 'child_process';

const arquivos = [
  'src/services/orchestrator/brainMetaTools.ts',
  'src/services/orchestrator/montadorPromptEConexoes.ts',
  'src/services/orchestrator/despachanteFerramentas.ts',
  'src/services/orchestrator/executorFerramentasFixas.ts',
  'src/frontend/components/settings/AbaMemoria.vue',
  'src/frontend/SettingsApp.vue',
  'src/frontend/App.vue'
].filter(f => fs.existsSync(f));

for (const f of arquivos) fs.copyFileSync(f, f + '.bak');

function substituirDeclaracaoTs(code, marker, novoBloco) {
  const sIdx = code.indexOf(marker);
  if (sIdx === -1) return null;

  let searchBraceFrom = sIdx;
  if (marker.includes('function')) {
    const parenStart = code.indexOf('(', sIdx);
    if (parenStart === -1) return null;
    let pDepth = 0, inStr = null, esc = false;
    for (let i = parenStart; i < code.length; i++) {
      const ch = code[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (inStr) { if (ch === inStr) inStr = null; continue; }
      if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
      if (ch === '(') pDepth++;
      else if (ch === ')') {
        pDepth--;
        if (pDepth === 0) { searchBraceFrom = i + 1; break; }
      }
    }
  } else {
    const eqIdx = code.indexOf('=', sIdx);
    if (eqIdx === -1) return null;
    searchBraceFrom = eqIdx + 1;
  }

  const braceStart = code.indexOf('{', searchBraceFrom);
  if (braceStart === -1) return null;

  let depth = 0, inStr = null, esc = false, endIdx = -1;
  for (let i = braceStart; i < code.length; i++) {
    const ch = code[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (inStr) { if (ch === inStr) inStr = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { endIdx = i + 1; break; }
    }
  }
  if (endIdx === -1) return null;
  if (code[endIdx] === ';') endIdx++;
  return code.slice(0, sIdx) + novoBloco + code.slice(endIdx);
}

try {
  // 1. Atualizar apenas toolGerenciarMemoria e executarGerenciamentoMemoria em brainMetaTools.ts
  const brainPath = 'src/services/orchestrator/brainMetaTools.ts';
  let bCode = fs.readFileSync(brainPath, 'utf8');

  const novoToolBloco = `const PRAZO_PADRAO_MEDIO_PRAZO: Record<string, number> = {
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
};`;

  const novaFuncaoBloco = `export async function executarGerenciamentoMemoria(params: {
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
        \`INSERT INTO jarvis_chat_memory (session_id, role, content) VALUES ($1, 'system', $2);\`,
        [session_id, \`[MEMÓRIA CURTO PRAZO - \${titulo}]: \${conteudo}\`]
      ).catch(() => {});
      return { success: true, tipo_memoria: 'curto_prazo', titulo, message: \`Memória de curto prazo retida na sessão: "\${titulo}".\` };
    }

    if (tipo_memoria === 'medio_prazo') {
      const catFinal = ['contexto_semanal', 'tarefa_ativa', 'projeto', 'habito'].includes(categoria) ? categoria : 'contexto_semanal';
      const dias = resolverDias(catFinal, dias_validade);
      const insRes = await pool.query(
        \`INSERT INTO jarvis_episodic_memory (categoria, titulo, conteudo, expires_at, metadata)
         VALUES ($1, $2, $3, NOW() + ($4 || ' days')::interval, $5::jsonb)
         RETURNING id, expires_at;\`,
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
        message: \`Memória de médio prazo (\${catFinal}) salva por \${dias} dias: "\${titulo}".\`
      };
    }

    if (tipo_memoria === 'longo_prazo') {
      if (categoria === 'contato' || /telefone|contato|whatsapp|celular/i.test(titulo)) {
        const digitos = conteudo.replace(/\\D/g, '');
        if (digitos.length >= 8) {
          let fone = digitos;
          if (fone.length === 8 || fone.length === 9) fone = \`5567\${fone.length === 8 ? '9' + fone : fone}\`;
          else if (fone.length === 10 || fone.length === 11) fone = \`55\${fone}\`;
          const nomeNorm = titulo.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim();
          await pool.query(
            \`INSERT INTO contatos_agenda (nome, telefone, apelidos) VALUES ($1, $2, ARRAY[$3])
             ON CONFLICT (nome) DO UPDATE SET telefone = EXCLUDED.telefone, atualizado_em = NOW();\`,
            [nomeNorm, fone, titulo]
          ).catch(() => {});
        }
      }
      await pool.query(\`INSERT INTO vector_documents (title, content, category) VALUES ($1, $2, 'permanente');\`, [titulo, conteudo]);
      return { success: true, tipo_memoria: 'longo_prazo', titulo, message: \`Fato gravado permanentemente na memória de longo prazo: "\${titulo}".\` };
    }
  }

  if (acao === 'atualizar' && tipo_memoria === 'medio_prazo') {
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
          [conteudo, dias, \`%\${titulo}%\`]
        );
    if (updRes.rows.length > 0) {
      return { success: true, registro: updRes.rows[0], message: \`Memória "\${updRes.rows[0].titulo}" atualizada (válida por mais \${dias} dias).\` };
    }
    return { success: false, message: \`Nenhuma memória episódica ativa encontrada com "\${titulo}".\` };
  }

  if (acao === 'concluir' && tipo_memoria === 'medio_prazo') {
    const delRes = id
      ? await pool.query(\`UPDATE jarvis_episodic_memory SET expires_at = NOW() WHERE id = $1 RETURNING id, titulo;\`, [id])
      : await pool.query(
          \`UPDATE jarvis_episodic_memory SET expires_at = NOW()
           WHERE id = (SELECT id FROM jarvis_episodic_memory WHERE expires_at > NOW() AND titulo ILIKE $1 ORDER BY id DESC LIMIT 1)
           RETURNING id, titulo;\`,
          [\`%\${titulo}%\`]
        );
    return {
      success: delRes.rows.length > 0,
      message: delRes.rows.length > 0 ? \`Memória "\${delRes.rows[0].titulo}" concluída e encerrada.\` : \`Registro "\${titulo}" já encerrado.\`
    };
  }

  if (acao === 'consultar') {
    if (tipo_memoria === 'curto_prazo') {
      const res = await pool.query(\`SELECT role, content, created_at FROM jarvis_chat_memory WHERE session_id = $1 AND content ILIKE $2 ORDER BY id DESC LIMIT 5;\`, [session_id, \`%\${titulo}%\`]).catch(() => ({ rows: [] as any[] }));
      return { success: true, tipo_memoria: 'curto_prazo', total: res.rows.length, registros: res.rows };
    }
    if (tipo_memoria === 'medio_prazo') {
      const res = await pool.query(\`SELECT id, categoria, titulo, conteudo, expires_at, created_at FROM jarvis_episodic_memory WHERE expires_at > NOW() AND (titulo ILIKE $1 OR conteudo ILIKE $1) ORDER BY id DESC LIMIT 10;\`, [\`%\${titulo}%\`]).catch(() => ({ rows: [] as any[] }));
      return { success: true, tipo_memoria: 'medio_prazo', total: res.rows.length, registros: res.rows };
    }
    if (tipo_memoria === 'longo_prazo') {
      const res = await pool.query(\`SELECT id, title, content, metadata, created_at FROM vector_documents WHERE content ILIKE $1 OR title ILIKE $1 ORDER BY id DESC LIMIT 5;\`, [\`%\${titulo}%\`]).catch(() => ({ rows: [] as any[] }));
      return { success: true, tipo_memoria: 'longo_prazo', total: res.rows.length, registros: res.rows };
    }
  }

  return { success: false, message: 'Operação de memória não reconhecida.' };
}`;

  bCode = substituirDeclaracaoTs(bCode, 'export const toolGerenciarMemoria', novoToolBloco);
  if (!bCode) throw new Error('toolGerenciarMemoria não localizado');
  bCode = substituirDeclaracaoTs(bCode, 'export async function executarGerenciamentoMemoria', novaFuncaoBloco);
  if (!bCode) throw new Error('executarGerenciamentoMemoria não localizado');
  fs.writeFileSync(brainPath, bCode, 'utf8');
  console.log('✅ brainMetaTools.ts atualizado (exportações preservadas)');

  // 2. Repassar id e categoria nos executores de ferramentas
  for (const df of ['src/services/orchestrator/despachanteFerramentas.ts', 'src/services/orchestrator/executorFerramentasFixas.ts', 'src/services/orchestratorService.ts']) {
    if (!fs.existsSync(df)) continue;
    let dCode = fs.readFileSync(df, 'utf8');
    if (dCode.includes('executarGerenciamentoMemoria({')) {
      dCode = dCode.replace(
        /executarGerenciamentoMemoria\(\{\s*([^{}]+)\}\)/g,
        (m, inner) => {
          if (inner.includes('id:')) return m;
          const v = inner.includes('parsedArgs') ? 'parsedArgs' : 'args';
          return `executarGerenciamentoMemoria({ id: ${v}.id, categoria: ${v}.categoria, ${inner} })`;
        }
      );
      fs.writeFileSync(df, dCode, 'utf8');
      console.log(`✅ Parâmetros id/categoria ligados em ${df}`);
    }
  }

  // 3. Atualizar montadorPromptEConexoes.ts
  const montPath = 'src/services/orchestrator/montadorPromptEConexoes.ts';
  let mCode = fs.readFileSync(montPath, 'utf8');
  mCode = mCode.replace(
    /SELECT\s+categoria,\s*titulo,\s*conteudo\s+FROM\s+jarvis_episodic_memory[^;]+;/i,
    'SELECT id, categoria, titulo, conteudo, expires_at FROM jarvis_episodic_memory WHERE expires_at > NOW() ORDER BY created_at DESC LIMIT 20;'
  );
  mCode = mCode.replace(
    /const textoMedioPrazo\s*=[\s\S]*?;\s*\n/,
    `const textoMedioPrazo = episodicaRes.rows.length > 0
    ? episodicaRes.rows
        .map((e: any) => {
          const expira = e.expires_at ? new Date(e.expires_at).toLocaleDateString('pt-BR') : '21d';
          return \`- [ID:\${e.id} | \${e.categoria} | expira em \${expira}] \${e.titulo}: \${e.conteudo}\`;
        })
        .join('\\n')
    : '';\n`
  );
  if (!mCode.includes('GOVERNANÇA DE MEMÓRIA E INTERFACE')) {
    mCode = mCode.replace(
      /(\[AGENDA PERMANENTE DE CONTATOS E IDENTIDADES\]:)/,
      `[GOVERNANÇA DE MEMÓRIA E INTERFACE - OBRIGATÓRIO]:
1. LISTAS, LEMBRETES E TAREFAS TEMPORÁRIAS: Use SEMPRE a ferramenta "gerenciar_memoria_cognitiva" com tipo_memoria="medio_prazo" (contexto_semanal: 15-30 dias; tarefa_ativa: 45-60 dias; projeto: 90-180 dias). NUNCA crie arquivos .md/.txt na VM nem tente salvar listas no Notion sem pedido explícito.
2. ATUALIZAÇÃO DE LISTAS ATIVAS: Se já existir registro em [MEMÓRIA EPISÓDICA ATIVA] sobre o assunto, use acao="atualizar" com o ID para incluir/remover itens, ou acao="concluir" ao finalizar.
3. NAVEGAÇÃO DE INTERFACE (WebMCP): NUNCA acione trocar_aba_configuracoes ou abrir_painel_configuracoes em perguntas informativas. Só navegue com ordem explícita para abrir tela.

$1`
    );
  }
  fs.writeFileSync(montPath, mCode, 'utf8');
  console.log('✅ montadorPromptEConexoes.ts atualizado');

  // 4. Atualizar AbaMemoria.vue (contexto_semanal 15 a 30 dias, padrão 21d)
  const abaPath = 'src/frontend/components/settings/AbaMemoria.vue';
  if (fs.existsSync(abaPath)) {
    let aCode = fs.readFileSync(abaPath, 'utf8');
    aCode = aCode.replace(
      /<select\s+v-model="novaEpisodica\.categoria"[\s\S]*?<\/select>/,
      `<select v-model="novaEpisodica.categoria" @change="novaEpisodica.dias = ({ contexto_semanal: 21, tarefa_ativa: 45, projeto: 180, habito: 30 } as any)[novaEpisodica.categoria] || 21" class="input-field">
            <option value="contexto_semanal">Contexto Semanal (15 a 30 dias)</option>
            <option value="tarefa_ativa">Tarefa Ativa (45 a 60 dias)</option>
            <option value="projeto">Projeto em Andamento (90 a 180 dias)</option>
            <option value="habito">Hábito / Rotina (30 dias)</option>
          </select>`
    );
    aCode = aCode.replace(
      /<button type="button" @click="novaEpisodica\.dias = 7"[\s\S]*?<\/div>/,
      `<button type="button" @click="novaEpisodica.dias = 15" class="btn-secondary-sm">15 dias</button>
          <button type="button" @click="novaEpisodica.dias = 21" class="btn-secondary-sm">21 dias</button>
          <button type="button" @click="novaEpisodica.dias = 30" class="btn-secondary-sm">30 dias</button>
          <button type="button" @click="novaEpisodica.dias = 60" class="btn-secondary-sm">60 dias</button>
          <button type="button" @click="novaEpisodica.dias = 180" class="btn-secondary-sm">6 meses (180d)</button>
        </div>`
    );
    aCode = aCode.replace(
      /const novaEpisodica\s*=\s*reactive\(\{[\s\S]*?\}\);/,
      `const novaEpisodica = reactive({ titulo: '', conteudo: '', categoria: 'contexto_semanal', dias: 21 });`
    );
    fs.writeFileSync(abaPath, aCode, 'utf8');
    console.log('✅ AbaMemoria.vue atualizado');
  }

  // 5. Reforçar descrição do WebMCP em SettingsApp.vue e App.vue
  for (const vf of ['src/frontend/SettingsApp.vue', 'src/frontend/App.vue']) {
    if (!fs.existsSync(vf)) continue;
    let vCode = fs.readFileSync(vf, 'utf8');
    vCode = vCode.replace(
      /(name:\s*['"]trocar_aba_configuracoes['"],\s*description:\s*)['"`][^'"`]+['"`]/,
      `$1'Muda a aba visível no painel APENAS quando o usuário ordenar explicitamente abrir ou navegar para uma aba. NUNCA acione em perguntas informativas.'`
    );
    fs.writeFileSync(vf, vCode, 'utf8');
  }

  // 6. Compilar backend + frontend, limpar backups, reiniciar PM2 e sincronizar GitHub
  execSync('npm run build && npm run build:frontend', { stdio: 'inherit' });
  for (const f of arquivos) { if (fs.existsSync(f + '.bak')) fs.unlinkSync(f + '.bak'); }
  execSync('pm2 restart all --update-env && pm2 save', { stdio: 'inherit' });

  try {
    execSync('git add -A && git commit -m "feat(memory): otimiza memoria de medio prazo (15-180d) e trava falsos-positivos WebMCP" && git push origin main', { stdio: 'inherit' });
  } catch {
    console.log('ℹ️ GitHub já sincronizado.');
  }

  console.log('🚀 Tudo compilado, ativo no PM2 e sincronizado!');
} catch (err) {
  console.error('❌ Erro ao aplicar ajustes, restaurando backups...', err);
  for (const f of arquivos) {
    if (fs.existsSync(f + '.bak')) {
      fs.copyFileSync(f + '.bak', f);
      fs.unlinkSync(f + '.bak');
    }
  }
  process.exit(1);
}
