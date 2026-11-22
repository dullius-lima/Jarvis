import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

const BACKUP_DIR = '.backup_frente4';
const FILES = [
  'src/middlewares/securityMiddleware.ts',
  'src/controllers/brainConfigController.ts',
  'src/server.ts',
  'src/frontend/composables/useAuth.ts',
  'src/frontend/SettingsApp.vue',
  'src/frontend/main.ts',
  'src/frontend/settings.ts'
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
  // 0. Garantir INTERNAL_API_KEY e JWT_SECRET no .env
  let internalKey = process.env.INTERNAL_API_KEY || '';
  if (fs.existsSync('.env')) {
    let envTxt = fs.readFileSync('.env', 'utf8');
    const mInt = envTxt.match(/^INTERNAL_API_KEY=(.+)$/m);
    if (mInt && mInt[1].trim()) {
      internalKey = mInt[1].trim();
    } else {
      internalKey = 'jarvis_int_' + crypto.randomBytes(24).toString('hex');
      envTxt += `\nINTERNAL_API_KEY=${internalKey}\n`;
    }
    if (!/^JWT_SECRET=/m.test(envTxt)) {
      envTxt += `JWT_SECRET=jarvis_jwt_${crypto.randomBytes(32).toString('hex')}\n`;
    }
    fs.writeFileSync('.env', envTxt, 'utf8');
    fs.copyFileSync('.env', path.join(process.env.HOME || '/tmp', 'env_backup_jarvis'));
  }

  // 1. src/middlewares/securityMiddleware.ts -> Validação JWT compatível com Nginx (X-Forwarded-For) e authRoutes
  {
    const p = 'src/middlewares/securityMiddleware.ts';
    let code = fs.readFileSync(p, 'utf8');

    const newVerifyAndAuth = `export function verifyJwtToken(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;

    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(\`\${header}.\${body}\`)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp) {
      const expMs = payload.exp > 1e12 ? payload.exp : payload.exp * 1000;
      if (Date.now() > expMs) return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function requireJwtAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'] as string;

  if (process.env.INTERNAL_API_KEY && apiKeyHeader === process.env.INTERNAL_API_KEY) {
    return next();
  }

  // Requisição vinda de proxy externo (Nginx) nunca é considerada local
  const forwardedFor = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const remoteAddr = req.socket?.remoteAddress || '';
  const isDirectLoopback =
    !forwardedFor &&
    !realIp &&
    (remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const decoded = verifyJwtToken(token);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        error: 'Token JWT inválido ou expirado. Faça login novamente.'
      });
    }
    (req as any).user = decoded;
    return next();
  }

  if (isDirectLoopback) {
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'Acesso negado: Token JWT obrigatório para esta rota administrativa.'
  });
}

`;
    code = replaceBetween(
      code,
      'export function verifyJwtToken(',
      '// ============================================================================\n// 2. RATE LIMITER',
      newVerifyAndAuth,
      false
    );
    fs.writeFileSync(p, code, 'utf8');
    console.log('✅ securityMiddleware.ts atualizado (JWT timing-safe + detecção real de proxy Nginx)');
  }

  // 2. src/controllers/brainConfigController.ts -> Mascara api_key e saved_keys nas respostas HTTP
  {
    const p = 'src/controllers/brainConfigController.ts';
    let code = fs.readFileSync(p, 'utf8');

    const maskHelper = `function maskSecretForResponse(key?: string): string {
  const k = String(key || '').trim();
  if (!k) return '';
  if (k.length <= 8) return '••••••••';
  return '••••••••' + k.slice(-4);
}

function maskSavedKeysMap(map?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!map || typeof map !== 'object') return out;
  for (const [prov, val] of Object.entries(map)) {
    const masked = maskSecretForResponse(String(val || ''));
    if (masked) out[prov] = masked;
  }
  return out;
}

`;
    if (!code.includes('function maskSecretForResponse(')) {
      code = code.replace('export async function getBrainConfig(', maskHelper + 'export async function getBrainConfig(');
    }

    code = code.replace(
      /api_key:\s*effectiveKey,\s*\n\s*base_url:\s*KNOWN_ENDPOINTS\[provider\]/,
      'api_key: maskSecretForResponse(effectiveKey),\n      has_api_key: Boolean(effectiveKey),\n      base_url: KNOWN_ENDPOINTS[provider]'
    );
    code = code.replace(
      /saved_keys:\s*savedKeys\s*\n\s*\}\s*\n\s*\}\);/,
      'saved_keys: maskSavedKeysMap(savedKeys)\n    }\n  });'
    );
    code = code.replace(
      'return res.status(200).json({ success: true, message: `Modelo [${chosenModel}] (${provider.toUpperCase()}) salvo!`, data: newConfig });',
      'return res.status(200).json({ success: true, message: `Modelo [${chosenModel}] (${provider.toUpperCase()}) salvo!`, data: { ...newConfig, api_key: maskSecretForResponse(effectiveKey), has_api_key: Boolean(effectiveKey), saved_keys: maskSavedKeysMap(savedKeys) } });'
    );

    fs.writeFileSync(p, code, 'utf8');
    console.log('✅ brainConfigController.ts atualizado (chaves de API mascaradas na resposta HTTP)');
  }

  // 3. src/server.ts -> Conecta requireJwtAuth, rateLimiter, validateWebhookIngress e blinda query-db
  {
    const p = 'src/server.ts';
    let code = fs.readFileSync(p, 'utf8');

    const secImport = `import {
  requireJwtAuth,
  createRateLimiter,
  validateWebhookIngress
} from './middlewares/securityMiddleware.js';
`;
    if (!code.includes('requireJwtAuth')) {
      code = code.replace("import cors from 'cors';", "import cors from 'cors';\n" + secImport);
    }

    if (!code.includes("app.set('trust proxy'")) {
      code = code.replace('const app = express();', "const app = express();\napp.set('trust proxy', 1);");
    }

    // Rate limiters
    const limitersBlock = `const authRateLimiter = createRateLimiter(15, 60 * 1000);
const webhookRateLimiter = createRateLimiter(120, 60 * 1000);

app.use('/api/v1/auth', authRateLimiter, authRoutes);`;
    if (!code.includes('authRateLimiter')) {
      code = code.replace("app.use('/api/v1/auth', authRoutes);", limitersBlock);
    }

    // Protege rotas administrativas com requireJwtAuth
    const adminPrefixes = [
      "app.use('/api/v1/agents',",
      "app.use('/api/v1/rag',",
      "app.use('/api/v1/messaging',",
      "app.use('/api/v1/triggers',",
      "app.get('/api/v1/brain-config',",
      "app.put('/api/v1/brain-config',",
      "app.post('/api/v1/brain-config/validate',",
      "app.get('/api/v1/brain-config/models',",
      "app.get('/api/v1/brain-config/prompt-versions',",
      "app.post('/api/v1/brain-config/port',",
      "app.get('/api/v1/connectors',",
      "app.post('/api/v1/connectors',",
      "app.put('/api/v1/connectors',",
      "app.post('/api/v1/connectors/test',",
      "app.delete('/api/v1/connectors/:key',",
      "app.get('/api/v1/memory/sessions',",
      "app.get('/api/v1/memory/sessions/:sessionId',",
      "app.put('/api/v1/memory/messages/:id',",
      "app.delete('/api/v1/memory/messages/:id',",
      "app.delete('/api/v1/memory/sessions/:sessionId',",
      "app.get('/api/v1/dynamic-db/collections',",
      "app.get('/api/v1/dynamic-db/collections/:name',",
      "app.get('/api/v1/prompts/versions/:slug',",
      "app.get('/api/v1/voice-profiles',",
      "app.post('/api/v1/voice-profiles/enroll',",
      "app.delete('/api/v1/voice-profiles/:id',",
      "app.post('/api/v1/audio/voice-settings',",
      "app.post('/api/v1/audio/voice-sample',",
      "app.post('/api/v1/docs-ssh/rag/upload',",
      "app.get('/api/v1/docs-ssh/rag/documents',",
      "app.delete('/api/v1/docs-ssh/rag/documents/:id',",
      "app.post('/api/v1/docs-ssh/ssh/execute',",
      "app.post('/api/v1/docs-ssh/ssh/read-to-rag',"
    ];

    for (const prefix of adminPrefixes) {
      if (code.includes(prefix) && !code.includes(prefix + ' requireJwtAuth,')) {
        code = code.replace(prefix, prefix + ' requireJwtAuth,');
      }
    }

    // Blinda /api/v1/connectors/query-db -> JWT obrigatório + Somente SELECT + Bloqueio de tabelas sensíveis
    const hardenedQueryDb = `app.post('/api/v1/connectors/query-db', requireJwtAuth, async (req: Request, res: Response) => {
  try {
    const { query, params } = req.body || {};
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: 'Query SQL obrigatória.' });
    }
    const cleanSql = query.trim();
    if (!/^SELECT\\s+/i.test(cleanSql) || /;\\s*\\S/.test(cleanSql)) {
      return res.status(403).json({
        success: false,
        error: 'Operação bloqueada: este endpoint permite apenas consultas SELECT únicas.'
      });
    }
    if (/\\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|CREATE|COPY|EXECUTE)\\b/i.test(cleanSql)) {
      return res.status(403).json({
        success: false,
        error: 'Comandos de escrita ou DDL não são permitidos nesta rota.'
      });
    }
    if (/\\b(system_configs|identities|pg_shadow|pg_authid)\\b/i.test(cleanSql)) {
      return res.status(403).json({
        success: false,
        error: 'Acesso negado a tabelas protegidas de credenciais.'
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
      hardenedQueryDb + '\n\n',
      false
    );

    // Conecta Rate Limit + Zod na entrada do Webhook Ingress
    code = code.replace(
      "app.post('/api/v1/webhook/ingress', handleWebhookIngress);",
      "app.post('/api/v1/webhook/ingress', webhookRateLimiter, validateWebhookIngress, handleWebhookIngress);"
    );

    fs.writeFileSync(p, code, 'utf8');
    console.log('✅ src/server.ts atualizado (JWT, Zod, Rate Limit GABA e query-db blindado)');
  }

  // 4. src/frontend/composables/useAuth.ts -> Remove senha hardcoded 123456 e exige token JWT do backend
  {
    const p = 'src/frontend/composables/useAuth.ts';
    const content = `// Sessão, token JWT, login real e troca de credenciais
import { ref, nextTick } from 'vue';

const STORAGE_AUTH_KEY = 'jarvis_authenticated_session';
const STORAGE_EMAIL_KEY = 'jarvis_authenticated_email';
const STORAGE_TOKEN_KEY = 'jarvis_auth_jwt_token';

export function useAuth(onLoginSuccess?: () => Promise<void> | void) {
  const hasStoredSession =
    localStorage.getItem(STORAGE_AUTH_KEY) === 'true' &&
    Boolean(localStorage.getItem(STORAGE_TOKEN_KEY));

  const isAuthenticated = ref<boolean>(hasStoredSession);
  const loginEmail = ref<string>(localStorage.getItem(STORAGE_EMAIL_KEY) || '');
  const loginPassword = ref<string>('');
  const loginError = ref<string>('');
  const isLoggingIn = ref<boolean>(false);

  const showPasswordModal = ref<boolean>(false);
  const newEmailInput = ref<string>(loginEmail.value);
  const newPasswordInput = ref<string>('');
  const credFeedback = ref<string>('');

  async function handleLogin() {
    loginError.value = '';
    isLoggingIn.value = true;
    const emailTrimmed = loginEmail.value.trim().toLowerCase();
    const passTrimmed = loginPassword.value.trim();

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailTrimmed, password: passTrimmed })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success && data.token) {
        isAuthenticated.value = true;
        localStorage.setItem(STORAGE_AUTH_KEY, 'true');
        localStorage.setItem(STORAGE_EMAIL_KEY, emailTrimmed);
        localStorage.setItem(STORAGE_TOKEN_KEY, data.token);
        loginPassword.value = '';
        await nextTick();
        if (onLoginSuccess) await onLoginSuccess();
      } else {
        loginError.value = data.error || 'E-mail ou senha incorretos.';
      }
    } catch {
      loginError.value = 'Falha ao conectar com o servidor.';
    } finally {
      isLoggingIn.value = false;
    }
  }

  async function updateAdminCredentials() {
    credFeedback.value = '';
    if (!newEmailInput.value.trim() || !newPasswordInput.value.trim()) {
      credFeedback.value = '⚠️ Preencha o novo e-mail e a nova senha.';
      return;
    }
    try {
      const token = localStorage.getItem(STORAGE_TOKEN_KEY) || '';
      const res = await fetch('/api/v1/auth/update-credentials', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: \`Bearer \${token}\` } : {})
        },
        body: JSON.stringify({
          currentEmail: loginEmail.value,
          newEmail: newEmailInput.value.trim(),
          newPassword: newPasswordInput.value.trim()
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        loginEmail.value = newEmailInput.value.trim();
        localStorage.setItem(STORAGE_EMAIL_KEY, loginEmail.value);
        newPasswordInput.value = '';
        credFeedback.value = '✅ Credenciais atualizadas com sucesso!';
      } else {
        credFeedback.value = '❌ ' + (data.error || 'Erro ao atualizar.');
      }
    } catch {
      credFeedback.value = '❌ Erro de comunicação com o backend.';
    }
  }

  function handleLogout(onLogoutCallback?: () => void) {
    isAuthenticated.value = false;
    localStorage.removeItem(STORAGE_AUTH_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    if (onLogoutCallback) onLogoutCallback();
  }

  return {
    isAuthenticated,
    loginEmail,
    loginPassword,
    loginError,
    isLoggingIn,
    showPasswordModal,
    newEmailInput,
    newPasswordInput,
    credFeedback,
    handleLogin,
    updateAdminCredentials,
    handleLogout
  };
}
`;
    fs.writeFileSync(p, content, 'utf8');
    console.log('✅ useAuth.ts atualizado (sem senha hardcoded no cliente + JWT obrigatório)');
  }

  // 5. Interceptor global de fetch JWT nos entrypoints do frontend (main.ts e settings.ts)
  const fetchInterceptorSnippet = `
// [JWT_FETCH_INTERCEPTOR]
if (typeof window !== 'undefined' && !(window as any).__jarvisJwtFetchPatched) {
  (window as any).__jarvisJwtFetchPatched = true;
  const _origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const isApiCall = urlStr.startsWith('/api/') || urlStr.includes('/api/v1/');
    const token = localStorage.getItem('jarvis_auth_jwt_token') || '';
    let nextInit = init;
    if (isApiCall && token) {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      if (!headers.has('Authorization')) {
        headers.set('Authorization', 'Bearer ' + token);
      }
      nextInit = { ...init, headers };
    }
    const resp = await _origFetch(input, nextInit);
    if (isApiCall && resp.status === 401 && !urlStr.includes('/api/v1/auth/login')) {
      localStorage.removeItem('jarvis_authenticated_session');
      localStorage.removeItem('jarvis_auth_jwt_token');
      if (window.location.pathname.includes('settings')) {
        window.location.href = '/';
      }
    }
    return resp;
  };
}
`;

  for (const entry of ['src/frontend/main.ts', 'src/frontend/settings.ts']) {
    if (fs.existsSync(entry)) {
      let c = fs.readFileSync(entry, 'utf8');
      if (!c.includes('[JWT_FETCH_INTERCEPTOR]')) {
        c = fetchInterceptorSnippet + '\n' + c;
        fs.writeFileSync(entry, c, 'utf8');
        console.log('✅ Interceptor JWT anexado em ' + entry);
      }
    }
  }

  // Garante também guarda de sessão em SettingsApp.vue
  if (fs.existsSync('src/frontend/SettingsApp.vue')) {
    let sc = fs.readFileSync('src/frontend/SettingsApp.vue', 'utf8');
    if (!sc.includes('jarvis_auth_jwt_token')) {
      sc = sc.replace(
        '<script setup lang="ts">',
        `<script setup lang="ts">
if (typeof window !== 'undefined' && (localStorage.getItem('jarvis_authenticated_session') !== 'true' || !localStorage.getItem('jarvis_auth_jwt_token'))) {
  window.location.href = '/';
}`
      );
      fs.writeFileSync('src/frontend/SettingsApp.vue', sc, 'utf8');
      console.log('✅ Guarda JWT adicionada em SettingsApp.vue');
    }
  }

  // 6. Compilar Backend e Frontend + Reiniciar PM2
  console.log('🔨 Compilando backend e frontend...');
  execSync('npm run build && npm run build:frontend', { stdio: 'inherit' });
  console.log('🚀 Reiniciando PM2...');
  execSync('pm2 flush && pm2 restart all --update-env && pm2 save', { stdio: 'inherit' });

  // 7. Sincronizar com GitHub (origin/main)
  console.log('📤 Enviando Frente 4 para o GitHub (origin/main)...');
  execSync('git add -A', { stdio: 'inherit' });
  try {
    execSync('git commit -m "security(auth,api): ativa JWT, rate limit GABA, validacao Zod, mascara chaves e blinda query-db"', { stdio: 'inherit' });
  } catch {
    console.log('ℹ️ Sem alterações pendentes para novo commit.');
  }
  execSync('git push origin main', { stdio: 'inherit' });

  fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  console.log('\n🎉 FRENTE 4 CONCLUÍDA! TODAS AS 5 FRENTES DA AUDITORIA FORAM APLICADAS.');
} catch (err) {
  console.error('\n❌ ERRO NA FRENTE 4:', err.message);
  rollback();
  process.exit(1);
}
