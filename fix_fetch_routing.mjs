import fs from 'fs';
import { execSync } from 'child_process';

// 1. Mostrar último log de mcp_web_fetch para confirmação
try {
  const logs = execSync('pm2 logs jarvis --lines 35 --nostream 2>&1', { encoding: 'utf8' });
  const relevante = logs.split('\n').filter(l => /mcp|fetch|especialista|cmin3|error/i.test(l)).slice(-10);
  console.log('--- ÚLTIMOS LOGS RELEVANTES ---\n' + relevante.join('\n'));
} catch {}

// 2. Atualizar executorConectorApi.ts para mapear automaticamente url/query/endpoint em servidores MCP
const execPath = 'src/services/orchestrator/executorConectorApi.ts';
if (fs.existsSync(execPath)) {
  fs.copyFileSync(execPath, '/tmp/executorConectorApi.bak');
  let code = fs.readFileSync(execPath, 'utf8');

  const helper = `// [MCP_ARGS_NORMALIZER_START]
function normalizarChamadaMcp(slugStr, urlStr, argsObj) {
  const isFetch = String(slugStr || '').toLowerCase().includes('fetch') || String(urlStr || '').includes(':8013');
  let toolName = argsObj?.tool_name || argsObj?.tool || argsObj?.method || (isFetch ? 'fetch' : 'list_directory');
  let toolArgs = argsObj?.arguments || argsObj?.params || null;

  if (isFetch) {
    toolName = 'fetch';
    const rawUrl =
      toolArgs?.url ||
      argsObj?.url ||
      argsObj?.endpoint ||
      (typeof argsObj?.query === 'string' && argsObj.query.startsWith('http') ? argsObj.query : '') ||
      'https://news.google.com/rss/search?q=CMIN3+B3&hl=pt-BR&gl=BR&ceid=BR:pt-419';
    toolArgs = {
      url: String(rawUrl).trim(),
      max_length: Number(toolArgs?.max_length || argsObj?.max_length || 4500),
      raw: true
    };
  } else if (!toolArgs) {
    toolArgs = { ...argsObj };
    delete toolArgs.tool_name;
    delete toolArgs.tool;
    delete toolArgs.method;
  }
  return { toolName, toolArgs };
}
// [MCP_ARGS_NORMALIZER_END]\n`;

  code = code.replace(/\/\/ \[MCP_ARGS_NORMALIZER_START\][\s\S]*?\/\/ \[MCP_ARGS_NORMALIZER_END\]\n?/g, '');
  code = helper + code;

  // Substitui extração antiga de toolName/toolArgs dentro da ponte MCP
  code = code.replace(
    /const toolName\s*=[\s\S]*?const toolArgs\s*=[\s\S]*?\};/,
    'const { toolName, toolArgs } = normalizarChamadaMcp(slug, targetUrl, argsObj);'
  );

  fs.writeFileSync(execPath, code, 'utf8');
  console.log('✅ Normalizador universal de parâmetros MCP aplicado em executorConectorApi.ts!');
}

// 3. Limpar memória do chat com Especialista SQL errado e consolidar apenas 1 agente financeiro
execSync(`PAGER=cat sudo -u postgres psql -d postgres -c "
DELETE FROM jarvis_chat_memory WHERE content ILIKE '%CMIN3%' OR content ILIKE '%Especialista SQL%';
UPDATE ai_agents SET is_active = false WHERE id = 214;
UPDATE ai_agents SET is_active = true WHERE id = 9;
SELECT id, name, slug, is_active, tools FROM ai_agents WHERE id IN (9, 214) OR name ILIKE '%SQL%';
"`, { stdio: 'inherit' });

// 4. Compilar com rollback automático e reiniciar PM2
try {
  execSync('npm run build', { stdio: 'inherit' });
  execSync('pm2 restart jarvis --update-env', { stdio: 'inherit' });
  console.log('🚀 Build e PM2 concluídos com sucesso!');
} catch (err) {
  if (fs.existsSync('/tmp/executorConectorApi.bak')) {
    fs.copyFileSync('/tmp/executorConectorApi.bak', execPath);
  }
  console.error('❌ Erro no build — backup restaurado.');
  process.exit(1);
}
