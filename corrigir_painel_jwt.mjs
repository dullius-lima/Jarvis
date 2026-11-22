import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BACKUP_DIR = '.backup_fix_jwt';
const FILES = [
  'src/frontend/main.ts',
  'src/frontend/settingsMain.ts',
  'src/frontend/SettingsApp.vue',
  'src/frontend/composables/useAuth.ts',
  'src/middlewares/securityMiddleware.ts',
  'src/routes/authRoutes.ts',
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
  // 1. Entrypoints unificados (main.ts e settingsMain.ts): redireciona APK + injeta JWT + força renovação em 401
  const makeEntryCode = (componentName, componentFile) => `// [JWT_AND_APK_FETCH_BRIDGE]
if (typeof window !== 'undefined' && !(window as any).__jarvisFetchBridgeInstalled) {
  (window as any).__jarvisFetchBridgeInstalled = true;
  const _baseFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let resolvedInput: RequestInfo | URL = input;
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (typeof resolvedInput === 'string' && resolvedInput.startsWith('/api/')) {
      const isLocalApp =
        window.location.hostname === 'localhost' ||
        window.location.protocol === 'capacitor:' ||
        window.location.protocol === 'file:';
      if (isLocalApp) {
        resolvedInput = 'http://163.176.111.18' + resolvedInput;
      }
    }

    const isApiCall = rawUrl.startsWith('/api/') || rawUrl.includes('/api/v1/');
    const token = localStorage.getItem('jarvis_auth_jwt_token') || '';
    let nextInit = init;

    if (isApiCall && token) {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      if (!headers.has('Authorization')) {
        headers.set('Authorization', 'Bearer ' + token);
      }
      nextInit = { ...init, headers };
    }

    const resp = await _baseFetch(resolvedInput, nextInit);

    if (isApiCall && resp.status === 401 && !rawUrl.includes('/api/v1/auth/login')) {
      localStorage.removeItem('jarvis_authenticated_session');
      localStorage.removeItem('jarvis_auth_jwt_token');
      window.dispatchEvent(new Event('jarvis-auth-expired'));
      if (window.location.pathname.includes('settings')) {
        window.location.href = '/';
      }
    }

    return resp;
  };
}

import { createApp } from 'vue';
import ${componentName} from './${componentFile}';

createApp(${componentName}).mount('#app');
`;

  fs.writeFileSync('src/frontend/main.ts', makeEntryCode('App', 'App.vue'), 'utf8');
  fs.writeFileSync('src/frontend/settingsMain.ts', makeEntryCode('SettingsApp', 'SettingsApp.vue'), 'utf8');
  console.log('✅ main.ts e settingsMain.ts atualizados com ponte JWT + APK');

  // 2. useAuth.ts -> Escuta evento jarvis-auth-expired para reabrir tela de login automaticamente se o token expirar
  {
    const p = 'src/frontend/composables/useAuth.ts';
    let code = fs.readFileSync(p, 'utf8');
    if (!code.includes('jarvis-auth-expired')) {
      code = code.replace(
        'const showPasswordModal = ref<boolean>(false);',
        `const showPasswordModal = ref<boolean>(false);
  if (typeof window !== 'undefined') {
    window.addEventListener('jarvis-auth-expired', () => {
      isAuthenticated.value = false;
    });
  }`
      );
      fs.writeFileSync(p, code, 'utf8');
      console.log('✅ useAuth.ts atualizado (renovação automática de sessão em 401)');
    }
  }

  // 3. securityMiddleware.ts e authRoutes.ts -> Leitura dinâmica de process.env.JWT_SECRET
  {
    const secPath = 'src/middlewares/securityMiddleware.ts';
    let secCode = fs.readFileSync(secPath, 'utf8');
    secCode = secCode.replace(
      "const JWT_SECRET = process.env.JWT_SECRET || 'jarvis-n8n-oci-super-secret-key-2026';",
      "const getJwtSecret = () => process.env.JWT_SECRET || 'jarvis-n8n-oci-super-secret-key-2026';"
    );
    secCode = secCode.replace(/\.createHmac\('sha256', JWT_SECRET\)/g, ".createHmac('sha256', getJwtSecret())");
    fs.writeFileSync(secPath, secCode, 'utf8');

    const authPath = 'src/routes/authRoutes.ts';
    let authCode = fs.readFileSync(authPath, 'utf8');
    authCode = authCode.replace(
      "const JWT_SECRET = process.env.JWT_SECRET || 'jarvis-n8n-oci-super-secret-key-2026';",
      "const getJwtSecret = () => process.env.JWT_SECRET || 'jarvis-n8n-oci-super-secret-key-2026';"
    );
    authCode = authCode.replace(/\.createHmac\('sha256', JWT_SECRET\)/g, ".createHmac('sha256', getJwtSecret())");
    fs.writeFileSync(authPath, authCode, 'utf8');
    console.log('✅ Segredo JWT sincronizado dinamicamente entre authRoutes e securityMiddleware');
  }

  // 4. src/server.ts -> Permite operações da AbaMemoria.vue no query-db autenticado, bloqueando tabelas sensíveis e DDL
  {
    const p = 'src/server.ts';
    let code = fs.readFileSync(p, 'utf8');
    const updatedQueryDb = `app.post('/api/v1/connectors/query-db', requireJwtAuth, async (req: Request, res: Response) => {
  try {
    const { query, params } = req.body || {};
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: 'Query SQL obrigatória.' });
    }
    const cleanSql = query.trim();
    if (/;\\s*\\S/.test(cleanSql)) {
      return res.status(403).json({
        success: false,
        error: 'Operação bloqueada: apenas uma instrução SQL por chamada é permitida.'
      });
    }
    if (/\\b(DROP|ALTER|TRUNCATE|GRANT|REVOKE|CREATE|COPY|EXECUTE)\\b/i.test(cleanSql)) {
      return res.status(403).json({
        success: false,
        error: 'Comandos DDL/administrativos não são permitidos nesta rota.'
      });
    }
    if (/\\b(system_configs|identities|pg_shadow|pg_authid)\\b/i.test(cleanSql)) {
      return res.status(403).json({
        success: false,
        error: 'Acesso negado a tabelas protegidas de credenciais.'
      });
    }
    const isSelect = /^SELECT\\s+/i.test(cleanSql);
    const isSafeMemoryMutation =
      /^(INSERT\\s+INTO|DELETE\\s+FROM|UPDATE)\\s+(jarvis_episodic_memory|vector_documents)\\b/i.test(cleanSql);

    if (!isSelect && !isSafeMemoryMutation) {
      return res.status(403).json({
        success: false,
        error: 'Escrita permitida apenas nas tabelas de memória episódica e vetorial.'
      });
    }
    const result = await pool.query(cleanSql, Array.isArray(params) ? params : []);
    return res.status(200).json({
      success: true,
      rows: result.rows,
      data: result.rows,
      rowCount: result.rowCount
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});`;
    code = replaceBetween(
      code,
      "app.post('/api/v1/connectors/query-db',",
      '// 4. Gestão de Memória por Session ID',
      updatedQueryDb + '\n\n',
      false
    );
    fs.writeFileSync(p, code, 'utf8');
    console.log('✅ query-db ajustado para compatibilidade total com AbaMemoria.vue');
  }

  // 5. Compilar Backend e Frontend + Reiniciar PM2
  console.log('🔨 Compilando backend e frontend...');
  execSync('npm run build && npm run build:frontend', { stdio: 'inherit' });
  console.log('🚀 Reiniciando PM2...');
  execSync('pm2 flush && pm2 restart all --update-env && pm2 save', { stdio: 'inherit' });

  // 6. Sincronizar com GitHub (origin/main)
  console.log('📤 Enviando correção para o GitHub (origin/main)...');
  execSync('git add -A', { stdio: 'inherit' });
  try {
    execSync('git commit -m "fix(frontend,auth): injeta interceptor JWT em settingsMain.ts e restaura listagem de agentes, triggers e conexoes"', { stdio: 'inherit' });
  } catch {
    console.log('ℹ️ Sem alterações adicionais para commit.');
  }
  execSync('git push origin main', { stdio: 'inherit' });

  fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  console.log('\n🎉 CORREÇÃO APLICADA COM SUCESSO!');
} catch (err) {
  console.error('\n❌ ERRO:', err.message);
  rollback();
  process.exit(1);
}
