import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BACKUP_DIR = '.backup_latencia';
const FILES = [
  'src/services/webMcpService.ts',
  'src/services/orchestrator/montadorPromptEConexoes.ts',
  'src/services/orchestratorService.ts',
  'src/server.ts'
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
  // 1. src/services/webMcpService.ts -> Leitura 0ms sem bloquear turnos quando não há aba registrada
  {
    const p = 'src/services/webMcpService.ts';
    let code = fs.readFileSync(p, 'utf8');
    const nonBlockingDiscover = `export async function ensureActiveWebMcpTools(_waitMs = 0): Promise<WebMcpToolMeta[]> {
  const current = listActiveWebMcpTools();
  if (current.length > 0) return current;

  if (boundWss && boundWss.clients) {
    for (const client of boundWss.clients) {
      if (client.readyState === 1) {
        try {
          client.send(JSON.stringify({ type: 'webmcp:discover' }));
        } catch {}
      }
    }
  }
  return listActiveWebMcpTools();
}

`;
    code = replaceBetween(
      code,
      'export async function ensureActiveWebMcpTools(',
      'export function handleWebMcpSocketMessage(',
      nonBlockingDiscover,
      false
    );
    fs.writeFileSync(p, code, 'utf8');
    console.log('✅ webMcpService.ts otimizado (0ms sem espera bloqueante)');
  }

  // 2. src/services/orchestrator/montadorPromptEConexoes.ts -> Janela enxuta das 3 memórias + WebMCP 0ms
  {
    const p = 'src/services/orchestrator/montadorPromptEConexoes.ts';
    let code = fs.readFileSync(p, 'utf8');

    code = code
      .replace('LIMIT 20;`, [sessionId])', 'LIMIT 8;`, [sessionId])')
      .replace('searchVectorDocuments(userPrompt, 6)', 'searchVectorDocuments(userPrompt, 3)')
      .replace(/LIMIT 30;`/g, 'LIMIT 8;`')
      .replace(/WHERE expires_at > NOW\(\)\s+ORDER BY created_at DESC\s+LIMIT 20;/g, 'WHERE expires_at > NOW() ORDER BY created_at DESC LIMIT 10;')
      .replace('await ensureActiveWebMcpTools(300)', 'await ensureActiveWebMcpTools(0)');

    fs.writeFileSync(p, code, 'utf8');
    console.log('✅ montadorPromptEConexoes.ts otimizado (prompt enxuto mantendo 3 memórias e contatos)');
  }

  // 3. src/services/orchestratorService.ts -> WebMCP 0ms + Fast-Path instantâneo (< 5ms) para hora local
  {
    const p = 'src/services/orchestratorService.ts';
    let code = fs.readFileSync(p, 'utf8');

    code = code.replace('await ensureActiveWebMcpTools(350)', 'await ensureActiveWebMcpTools(0)');
    code = code.replace(
      'if (executedTools.length === 0 && (!Array.isArray(mensagemEscolha?.tool_calls) || mensagemEscolha.tool_calls.length === 0)) {',
      'if (executedTools.length === 0 && (!Array.isArray(mensagemEscolha?.tool_calls) || mensagemEscolha.tool_calls.length === 0) && (await ensureActiveWebMcpTools(0)).length > 0) {'
    );

    const anchorVisao = '// 2. Visão Multimodal';
    const fastPathHora = `// 1.1 Fast-Path instantâneo (< 5ms) para hora local sem viagem externa à LLM
    const _normFast = userPrompt
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\\u0300-\\u036f.?!,-]/g, '')
      .replace(/\\bjarvis\\b/g, '')
      .trim();
    if (/^(que horas sao|que hora e|horas|qual o horario|me diga as horas)$/.test(_normFast)) {
      const _hora = new Date().toLocaleTimeString('pt-BR', {
        timeZone: 'America/Campo_Grande',
        hour: '2-digit',
        minute: '2-digit'
      });
      const _respHora: any = {
        success: true,
        triggeredSuccess: true,
        agent: 'JARVIS (Núcleo Instantâneo)',
        agentId: 'jarvis_core',
        nodeType: 'core',
        executedTools: [],
        memoryStored: false,
        memoryCount: 0,
        identity: activeSpeakerName,
        sessionId,
        response: \`Agora são \${_hora}, \${activeSpeakerName}.\`,
        executionTimeMs: Date.now() - inicioExecucao,
        data: null as any
      };
      _respHora.data = { ..._respHora };
      return _respHora;
    }

    `;
    if (!code.includes('JARVIS (Núcleo Instantâneo)') && code.includes(anchorVisao)) {
      code = code.replace(anchorVisao, fastPathHora + anchorVisao);
    }

    fs.writeFileSync(p, code, 'utf8');
    console.log('✅ orchestratorService.ts otimizado (WebMCP 0ms + Fast-Path de hora)');
  }

  // 4. src/server.ts -> Execução direta em memória em /api/v1/voice/turn (sem fetch loopback)
  {
    const p = 'src/server.ts';
    let code = fs.readFileSync(p, 'utf8');

    const directImports = `import { transcribeWithLocalWhisper } from './services/whisperLocalService.js';
import { processarExecucaoWorkflow } from './services/orchestratorService.js';
`;
    if (!code.includes('transcribeWithLocalWhisper')) {
      code = code.replace("import cors from 'cors';", "import cors from 'cors';\n" + directImports);
    }

    const optimizedVoiceTurn = `app.post('/api/v1/voice/turn', async (req, res) => {
  try {
    const { audioBase64, requireWakeWord, identityToken, sessionId } = req.body || {};
    if (!audioBase64) return res.status(400).json({ success: false, error: 'audioBase64 ausente' });

    const whisperModel = process.env.WHISPER_MODEL_SIZE || 'base';
    const trJson = await transcribeWithLocalWhisper(audioBase64, whisperModel);
    const transcript = String(trJson?.text || '').trim();
    console.log(\`[VoiceTurn] Ouviu: "\${transcript}"\`);

    if (!transcript) return res.json({ success: true, woke: false, transcript: '', reply: '' });

    const norm = transcript.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
    const hasWake = /\\b(jarvis|javis|jarves|jaives|javes|iarvis|yarvis|djarvis|jarbas|jar\\s*vis|ja\\s*vis)\\b/.test(norm);
    if (requireWakeWord !== false && !hasWake) {
      return res.json({ success: true, woke: false, transcript, reply: '' });
    }

    const cleanPrompt = transcript
      .replace(/^(oi|olá|ola|ei|hey|ok|fala|e\\s*a[ií])?[,\\s.-]*(jarvis|j[aá]vis|jarves|jaives|javes|iarvis|yarvis|djarvis|jarbas|j\\.a\\.r\\.v\\.i\\.s\\.?)\\s*[,\\s.:!?-]*/i, '')
      .trim();
    if (!cleanPrompt) {
      return res.json({ success: true, woke: true, transcript, reply: '' });
    }

    const ingJson: any = await processarExecucaoWorkflow(
      identityToken || 'Matheus-Admin',
      cleanPrompt,
      sessionId || 'sess_main_admin',
      {
        type: 'voice_or_text',
        inputSource: 'android_voice_service',
        prompt: cleanPrompt,
        textPrompt: cleanPrompt
      }
    );
    const reply = String(ingJson?.data?.response || ingJson?.response || 'Pronto.').trim();

    let replyAudioB64 = '';
    if (reply) {
      try {
        const localBase = \`http://127.0.0.1:\${PORT}\`;
        const spResp = await fetch(\`\${localBase}/api/v1/audio/speak\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: reply })
        });
        const spJson: any = await spResp.json().catch(() => ({}));
        replyAudioB64 = String(spJson?.audioBase64 || '');
      } catch {}
    }

    return res.json({ success: true, woke: true, transcript, reply, audioBase64: replyAudioB64 });
  } catch (e: any) {
    console.error('[VoiceTurn] Erro:', e?.message || e);
    return res.status(500).json({ success: false, error: e?.message || 'Erro interno' });
  }
});

`;
    code = replaceBetween(
      code,
      "app.post('/api/v1/voice/turn',",
      "app.get('/api/v1/preferences',",
      optimizedVoiceTurn,
      false
    );
    fs.writeFileSync(p, code, 'utf8');
    console.log('✅ src/server.ts otimizado (chamadas diretas em memória na rota de voz)');
  }

  // 5. Compilar Backend + Reiniciar PM2
  console.log('🔨 Compilando backend...');
  execSync('npm run build', { stdio: 'inherit' });
  console.log('🚀 Reiniciando PM2...');
  execSync('pm2 flush && pm2 restart jarvis jarvis-backend --update-env && pm2 save', { stdio: 'inherit' });

  // 6. Sincronizar com GitHub (origin/main)
  console.log('📤 Enviando otimização para o GitHub (origin/main)...');
  execSync('git add -A', { stdio: 'inherit' });
  try {
    execSync('git commit -m "perf(orchestrator): remove espera bloqueante WebMCP, otimiza janela de memoria e acelera voice/turn"', { stdio: 'inherit' });
  } catch {
    console.log('ℹ️ Sem alterações adicionais para commit.');
  }
  execSync('git push origin main', { stdio: 'inherit' });

  fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  console.log('\n🎉 OTIMIZAÇÃO DE LATÊNCIA CONCLUÍDA E ENVIADA AO GITHUB!');
} catch (err) {
  console.error('\n❌ ERRO NA OTIMIZAÇÃO:', err.message);
  rollback();
  process.exit(1);
}
