import fs from 'fs';
import { execSync } from 'child_process';

const govPath = 'src/services/securityGovernanceService.ts';
const srvPath = 'src/server.ts';
const backups = [];

for (const p of [govPath, srvPath]) {
  if (fs.existsSync(p)) {
    fs.copyFileSync(p, p + '.bak');
    backups.push(p);
  }
}

try {
  let govCode = fs.existsSync(govPath) ? fs.readFileSync(govPath, 'utf8') : '';
  if (!govCode.includes('__jarvisShortTermGcStarted')) {
    if (!govCode.includes('config/database')) {
      govCode = `import { pool } from '../config/database.js';\n` + govCode;
    }
    govCode += `
// Limpeza automática da Memória de Curto Prazo a cada 6 horas
if (!(globalThis as any).__jarvisShortTermGcStarted) {
  (globalThis as any).__jarvisShortTermGcStarted = true;
  setInterval(async () => {
    try {
      await pool.query(\`
        DELETE FROM jarvis_chat_memory
        WHERE session_id LIKE 'sess_%'
          AND session_id <> 'sess_main_admin'
          AND created_at < NOW() - INTERVAL '24 hours';
      \`);
      await pool.query(\`
        DELETE FROM jarvis_chat_memory
        WHERE id NOT IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY id DESC) AS rn
            FROM jarvis_chat_memory
          ) sub
          WHERE rn <= 50
        );
      \`);
      await pool.query(\`
        DELETE FROM specialist_context_memory
        WHERE created_at < NOW() - INTERVAL '48 hours';
      \`);
      console.log('🧹 [Garbage Collector] Memória de curto prazo higienizada.');
    } catch (err: any) {
      console.error('❌ [Garbage Collector] Erro ao limpar curto prazo:', err.message);
    }
  }, 6 * 60 * 60 * 1000).unref?.();
}
`;
    fs.writeFileSync(govPath, govCode, 'utf8');
    console.log('✅ Garbage Collector adicionado em ' + govPath);
  }

  if (fs.existsSync(srvPath)) {
    let srvCode = fs.readFileSync(srvPath, 'utf8');
    if (!srvCode.includes('securityGovernanceService')) {
      srvCode = srvCode.replace(/^(import .+;)/m, `$1\nimport './services/securityGovernanceService.js';`);
      fs.writeFileSync(srvPath, srvCode, 'utf8');
      console.log('✅ Importação garantida em ' + srvPath);
    }
  }

  execSync('npm run build', { stdio: 'inherit' });

  const sql = `
DELETE FROM jarvis_chat_memory WHERE session_id LIKE 'sess_%' AND session_id <> 'sess_main_admin' AND created_at < NOW() - INTERVAL '24 hours';
DELETE FROM jarvis_chat_memory WHERE id NOT IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY id DESC) AS rn FROM jarvis_chat_memory) sub WHERE rn <= 50);
DELETE FROM specialist_context_memory WHERE created_at < NOW() - INTERVAL '48 hours';
SELECT session_id, COUNT(*) AS mensagens FROM jarvis_chat_memory GROUP BY session_id ORDER BY mensagens DESC;
`;
  execSync('sudo -u postgres psql -P pager=off -d postgres', { input: sql, stdio: ['pipe', 'inherit', 'inherit'] });

  for (const p of backups) fs.unlinkSync(p + '.bak');
  execSync('pm2 restart all --update-env && pm2 save', { stdio: 'inherit' });
  try {
    execSync('git add -A && git commit -m "chore(memory): ativa limpeza automatica de curto prazo a cada 6h" && git push origin main', { stdio: 'inherit' });
  } catch {}
  console.log('🚀 Limpeza imediata concluída e rotina automática de 6h ativa!');
} catch (err) {
  console.error('❌ Falha ao aplicar, restaurando backups...', err);
  for (const p of backups) {
    if (fs.existsSync(p + '.bak')) {
      fs.copyFileSync(p + '.bak', p);
      fs.unlinkSync(p + '.bak');
    }
  }
  process.exit(1);
}
