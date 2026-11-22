import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const targetFile = 'src/services/orchestrator/motorInferencaLLM.ts';
const backupDir = '.backup_xml_toolcall';

if (!fs.existsSync(targetFile)) {
  console.error('❌ Arquivo não encontrado:', targetFile);
  process.exit(1);
}

fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(targetFile, path.join(backupDir, 'motorInferencaLLM.ts'));
console.log('📦 Backup salvo em .backup_xml_toolcall/motorInferencaLLM.ts');

try {
  let code = fs.readFileSync(targetFile, 'utf8');

  if (code.includes('__XML_TOOLCALL_HTTP200_FIX__')) {
    console.log('ℹ️ Correção já estava aplicada em motorInferencaLLM.ts');
    process.exit(0);
  }

  const targetReturn = 'return await client.chat.completions.create(payload);';
  if (!code.includes(targetReturn)) {
    throw new Error('Assinatura "return await client.chat.completions.create(payload);" não encontrada.');
  }

  const replacementBlock = `// __XML_TOOLCALL_HTTP200_FIX__
      const completion = await client.chat.completions.create(payload);
      const msg = completion?.choices?.[0]?.message;
      const rawContent = typeof msg?.content === 'string' ? msg.content : '';

      if (usarTools && (!Array.isArray(msg?.tool_calls) || msg.tool_calls.length === 0) && rawContent.includes('<function=')) {
        const regexFn = /<function=([a-zA-Z0-9_.-]+)[>\\s]*(\\{[\\s\\S]*?\\})?\\s*(?:<\\/function>|$)/g;
        const extractedCalls: any[] = [];
        let m: RegExpExecArray | null;
        while ((m = regexFn.exec(rawContent)) !== null) {
          const fnName = m[1].trim();
          let fnArgs = (m[2] || '{}').trim();
          try {
            JSON.parse(fnArgs);
          } catch {
            fnArgs = JSON.stringify({ query: fnArgs });
          }
          extractedCalls.push({
            id: \`call_xml_\${Date.now()}_\${extractedCalls.length}\`,
            type: 'function',
            function: {
              name: fnName,
              arguments: fnArgs
            }
          });
        }

        if (extractedCalls.length > 0) {
          msg.tool_calls = extractedCalls;
          msg.content = rawContent.replace(/<function=[\\s\\S]*?(?:<\\/function>|$)/g, '').trim();
        }
      }

      return completion;`;

  code = code.replace(targetReturn, replacementBlock);
  fs.writeFileSync(targetFile, code, 'utf8');
  console.log('✅ Parser de <function=...> em HTTP 200 injetado em motorInferencaLLM.ts');

  console.log('🔨 Compilando backend...');
  execSync('npm run build', { stdio: 'inherit' });

  console.log('🚀 Reiniciando serviço jarvis...');
  execSync('pm2 restart jarvis --update-env', { stdio: 'inherit' });

  console.log('\n🎉 Correção aplicada! Pode testar a consulta aos especialistas agora.');
} catch (err) {
  console.error('\n❌ Erro ao aplicar correção:', err.message);
  fs.copyFileSync(path.join(backupDir, 'motorInferencaLLM.ts'), targetFile);
  console.log('↩️ Rollback realizado.');
  process.exit(1);
}
