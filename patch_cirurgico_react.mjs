import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BACKUP_DIR = '.backup_cirurgico_react';
fs.mkdirSync(BACKUP_DIR, { recursive: true });

function backupFile(relPath) {
  const dest = path.join(BACKUP_DIR, relPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!fs.existsSync(dest)) fs.copyFileSync(relPath, dest);
}

function rollbackAll() {
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const orig = path.relative(BACKUP_DIR, full);
        fs.copyFileSync(full, orig);
      }
    }
  }
  walk(BACKUP_DIR);
  console.log('↩️ Rollback executado: arquivos originais restaurados.');
}

function listTsFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      listTsFiles(full, acc);
    } else if (entry.isFile() && /\.(ts|js)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

try {
  // 1. Deduplicação de chamadas idênticas dentro do loop em esteiraEspecialistas.ts
  const esteiraPath = 'src/services/orchestrator/esteiraEspecialistas.ts';
  if (fs.existsSync(esteiraPath)) {
    let code = fs.readFileSync(esteiraPath, 'utf8');
    if (!code.includes('__DEDUP_TOOL_LOOP__') && code.includes('executarFerramentaVinculada')) {
      backupFile(esteiraPath);
      code = code.replace(
        /(while\s*\(currentAgent\s*&&\s*hopCount\s*<\s*MAX_HOPS\)\s*\{)/,
        `const __chamadasExecutadasNoTurno = new Set<string>(); // __DEDUP_TOOL_LOOP__\n  $1`
      );
      code = code.replace(
        /(const resultadoTool\s*=\s*await\s*executarFerramentaVinculada\(([^)]+)\);)/,
        `const __assinaturaTool = \`\${fnName}:\${JSON.stringify(fnArgs || {})}\`;
          if (__chamadasExecutadasNoTurno.has(__assinaturaTool)) {
            console.log(\`🛑 [Loop Especialista] Bloqueada chamada repetida idêntica: \${fnName}\`);
            continue;
          }
          __chamadasExecutadasNoTurno.add(__assinaturaTool);
          $1`
      );
      fs.writeFileSync(esteiraPath, code, 'utf8');
      console.log(`✅ Patch cirúrgico aplicado em ${esteiraPath}`);
    }
  }

  // 2. Localiza onde está [Auto-Continuação ReAct] e bloqueia se já enviou WhatsApp ou se há condicional
  const allFiles = listTsFiles('src');
  for (const file of allFiles) {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes('Enfileirando Especialista do WhatsApp') && !content.includes('__GUARD_REACT_WHATSAPP__')) {
      backupFile(file);
      content = content.replace(
        /(if\s*\([^\n]+\)\s*\{[\s\S]{0,180}?Enfileirando Especialista do WhatsApp)/,
        `// __GUARD_REACT_WHATSAPP__
      const __rotaAtualStr = typeof rotaCompletaTexto !== 'undefined' ? rotaCompletaTexto : JSON.stringify(typeof trilhaGlobalTurno !== 'undefined' ? trilhaGlobalTurno : []);
      const __promptAtualStr = typeof userPrompt !== 'undefined' ? String(userPrompt) : '';
      const __jaDisparouWpp = /whatsapp/i.test(__rotaAtualStr);
      const __temCondicional = /\\b(se\\s+|caso\\s+|quando\\s+|somente\\s+se|apenas\\s+se)\\b/i.test(__promptAtualStr);
      if (!__jaDisparouWpp && !__temCondicional) {
        $1`
      );
      // Fecha o bloco extra logo após o fechamento do if original do Auto-Continuação
      content = content.replace(
        /(Enfileirando Especialista do WhatsApp[\s\S]*?\n\s*\})/,
        `$1\n      }`
      );
      fs.writeFileSync(file, content, 'utf8');
      console.log(`✅ Trava de Auto-Continuação ReAct aplicada em ${file}`);
    }
  }

  // 3. Inspeciona onde está [Whisper RAM] para mostrar as 8 linhas exatas (sem alterar cegamente)
  for (const file of allFiles) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const idx = lines.findIndex((l) => l.includes('[Whisper RAM]'));
    if (idx !== -1) {
      console.log(`\n🔎 Trecho atual de [Whisper RAM] em ${file} (linhas ${idx + 1} a ${idx + 10}):`);
      console.log(lines.slice(Math.max(0, idx - 1), idx + 10).join('\n'));
    }
  }

  console.log('\n🔨 Testando compilação TypeScript...');
  execSync('npm run build', { stdio: 'inherit' });
  execSync('pm2 restart jarvis --update-env', { stdio: 'inherit' });
  console.log('\n🎉 Atualização cirúrgica concluída com sucesso!');
} catch (err) {
  console.error('\n❌ Falha detectada, revertendo alterações:', err.message);
  rollbackAll();
  process.exit(1);
}
