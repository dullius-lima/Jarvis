import fs from 'fs';
import { execSync } from 'child_process';

const abaPath = 'src/frontend/components/settings/AbaMemoria.vue';
const srvPath = 'src/server.ts';
const backups = [];

for (const f of [abaPath, srvPath]) {
  if (fs.existsSync(f)) {
    fs.copyFileSync(f, f + '.bak');
    backups.push(f);
  }
}

try {
  // 1. Aumentar limite de payload JSON no server.ts para suportar PDFs em Base64 (até 50MB)
  if (fs.existsSync(srvPath)) {
    let sCode = fs.readFileSync(srvPath, 'utf8');
    if (/express\.json\(\s*\)/.test(sCode)) {
      sCode = sCode.replace(/express\.json\(\s*\)/g, "express.json({ limit: '50mb' })");
      fs.writeFileSync(srvPath, sCode, 'utf8');
      console.log('✅ Limite de upload ajustado para 50MB em ' + srvPath);
    }
  }

  // 2. Inserir o Document Loader Visual diretamente dentro da aba Longo Prazo em AbaMemoria.vue
  if (!fs.existsSync(abaPath)) {
    throw new Error('Arquivo src/frontend/components/settings/AbaMemoria.vue não encontrado.');
  }

  let vueCode = fs.readFileSync(abaPath, 'utf8');

  if (!vueCode.includes('enviarArquivoRagLongo')) {
    const uiBloco = `
    <!-- UPLOAD DE ARQUIVOS PARA MEMÓRIA DE LONGO PRAZO (RAG) -->
    <div style="background:#0f172a;border:1px solid #0284c7;border-radius:10px;padding:14px;margin:12px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="color:#38bdf8;font-size:13px;">📄 Adicionar Arquivo ao Longo Prazo (PDF, CSV, DOCX, TXT)</strong>
        <span style="font-size:11px;color:#94a3b8;">Fatiamento automático no RAG</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
        <input
          type="file"
          accept=".pdf,.csv,.docx,.txt,.md,.json"
          @change="selecionarArquivoRagLongo"
          style="font-size:12px;color:#e2e8f0;background:#020617;border:1px solid #334155;padding:6px;border-radius:6px;flex:1;min-width:200px;"
        />
        <input
          v-model="docRagCategoria"
          placeholder="Categoria (ex: fisiologia)"
          style="background:#020617;color:#fff;border:1px solid #334155;padding:7px 10px;border-radius:6px;font-size:12px;width:170px;"
        />
        <select
          v-model.number="docRagChunkSize"
          title="Tamanho de cada bloco de leitura"
          style="background:#020617;color:#fff;border:1px solid #334155;padding:7px 8px;border-radius:6px;font-size:12px;"
        >
          <option :value="1000">Bloco: 1000 chars</option>
          <option :value="1500">Bloco: 1500 chars (Livros/Fisiologia)</option>
          <option :value="2000">Bloco: 2000 chars</option>
        </select>
        <button
          type="button"
          :disabled="!docRagBase64 || docRagLoading"
          @click="enviarArquivoRagLongo"
          style="background:#0284c7;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;opacity:1;"
        >
          {{ docRagLoading ? '⏳ Processando...' : '🚀 Salvar no Longo Prazo' }}
        </button>
      </div>
      <div v-if="docRagStatus" style="margin-top:8px;font-size:12px;color:#38bdf8;font-weight:500;">
        {{ docRagStatus }}
      </div>
    </div>
`;

    // Localiza a seção da aba Longo Prazo no template (ancorando perto do botão Recarregar RAG ou do v-if de longo prazo)
    const ragBtnIdx = vueCode.indexOf('Recarregar RAG');
    if (ragBtnIdx !== -1) {
      const divCloseIdx = vueCode.indexOf('</div>', ragBtnIdx);
      if (divCloseIdx !== -1) {
        vueCode = vueCode.slice(0, divCloseIdx + 6) + '\n' + uiBloco + vueCode.slice(divCloseIdx + 6);
      } else {
        vueCode = vueCode.replace('</template>', uiBloco + '\n</template>');
      }
    } else {
      vueCode = vueCode.replace('</template>', uiBloco + '\n</template>');
    }

    // Descobre o nome da função que recarrega o RAG no script atual
    const fnMatch = vueCode.match(/(?:async\s+)?function\s+([a-zA-Z0-9_]*(?:Rag|Longo|Vector)[a-zA-Z0-9_]*)\s*\(/i);
    const reloadFnCall = fnMatch ? `if (typeof ${fnMatch[1]} === 'function') await ${fnMatch[1]}();` : '';

    // Garante import de ref se necessário
    if (!/\bref\b/.test(vueCode)) {
      vueCode = vueCode.replace(/<script setup[^>]*>/, `$&\nimport { ref } from 'vue';`);
    }

    const scriptBloco = `
const docRagNome = ref('');
const docRagBase64 = ref('');
const docRagCategoria = ref('fisiologia');
const docRagChunkSize = ref(1500);
const docRagLoading = ref(false);
const docRagStatus = ref('');

function selecionarArquivoRagLongo(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  docRagNome.value = file.name;
  docRagStatus.value = \`📎 Arquivo selecionado: \${file.name} (\${(file.size / 1024 / 1024).toFixed(2)} MB)\`;
  const reader = new FileReader();
  reader.onload = () => {
    docRagBase64.value = String(reader.result || '');
  };
  reader.readAsDataURL(file);
}

async function enviarArquivoRagLongo() {
  if (!docRagBase64.value || !docRagNome.value) return;
  docRagLoading.value = true;
  docRagStatus.value = '⏳ Extraindo texto e dividindo em blocos na memória de longo prazo...';
  try {
    const res = await fetch('/api/v1/docs-ssh/rag/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: docRagNome.value,
        contentBase64: docRagBase64.value,
        category: docRagCategoria.value || 'geral',
        chunkSize: docRagChunkSize.value,
        chunkOverlap: 200
      })
    });
    const json = await res.json();
    if (json.success) {
      docRagStatus.value = \`✅ \${json.message}\`;
      docRagBase64.value = '';
      ${reloadFnCall}
    } else {
      docRagStatus.value = \`❌ Erro: \${json.error || 'Falha ao processar arquivo.'}\`;
    }
  } catch (err: any) {
    docRagStatus.value = \`❌ Falha na requisição: \${err.message}\`;
  } finally {
    docRagLoading.value = false;
  }
}
`;
    vueCode = vueCode.replace('</script>', scriptBloco + '\n</script>');
    fs.writeFileSync(abaPath, vueCode, 'utf8');
    console.log('✅ Painel de upload adicionado na aba Longo Prazo de ' + abaPath);
  }

  // 3. Garantir pdf-parse instalado para leitura completa de PDFs
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  if (!pkg.dependencies?.['pdf-parse']) {
    console.log('📦 Instalando pdf-parse...');
    execSync('npm install pdf-parse --save', { stdio: 'inherit' });
  }

  // 4. Compilar backend e frontend
  execSync('npm run build && npm run build:frontend', { stdio: 'inherit' });

  for (const f of backups) fs.unlinkSync(f + '.bak');
  execSync('pm2 restart all --update-env && pm2 save', { stdio: 'inherit' });

  try {
    execSync('git add -A && git commit -m "feat(memory): adiciona upload visual de PDF/DOCX/CSV na aba Longo Prazo" && git push origin main', { stdio: 'inherit' });
  } catch {}

  console.log('🚀 Upload de arquivos ativado! Atualize o navegador com Ctrl + F5.');
} catch (err) {
  console.error('❌ Erro ao aplicar, restaurando backups...', err);
  for (const f of backups) {
    if (fs.existsSync(f + '.bak')) {
      fs.copyFileSync(f + '.bak', f);
      fs.unlinkSync(f + '.bak');
    }
  }
  process.exit(1);
}
