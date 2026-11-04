// src/routes/authRoutes.ts
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pool } from '../config/database.js';
import { verifyBiometricIdentity } from '../services/biometricService.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'jarvis-n8n-oci-super-secret-key-2026';

// ============================================================================
// 1. UTILITÁRIOS CRIPTOGRÁFICOS E TOKEN JWT
// ============================================================================
export function hashPassword(password: string): string {
  const salt = 'jarvis_salt_v1';
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedPassword: string): boolean {
  if (!storedPassword) return false;
  if (storedPassword.startsWith('scrypt:')) {
    const [, salt, originalHash] = storedPassword.split(':');
    const derived = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(originalHash, 'hex'), Buffer.from(derived, 'hex'));
  }
  return password === storedPassword;
}

export function generateAuthToken(payload: Record<string, any>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + 24 * 60 * 60 * 1000 })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

// ============================================================================
// 2. INICIALIZAÇÃO E GARANTIA DO USUÁRIO ADMIN PADRÃO
// ============================================================================
async function ensureDefaultAdmin() {
  const defaultEmail = process.env.ADMIN_EMAIL || 'matheus_dullius@hotmail.com';
  const defaultPass = process.env.ADMIN_PASSWORD || '123456';

  try {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS identities (
          id SERIAL PRIMARY KEY,
          name VARCHAR(120) DEFAULT 'Matheus Dullius',
          email VARCHAR(160) UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role VARCHAR(50) DEFAULT 'admin',
          biometric_hash VARCHAR(255),
          permissions JSONB DEFAULT '["all"]'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      const check = await client.query(
        'SELECT id, password FROM identities WHERE LOWER(email) = LOWER($1);',
        [defaultEmail.trim()]
      );

      if (check.rows.length === 0) {
        const hashed = hashPassword(defaultPass);
        await client.query(
          'INSERT INTO identities (name, email, password, role) VALUES ($1, $2, $3, $4);',
          ['Matheus Dullius', defaultEmail.trim(), hashed, 'admin']
        );
      }
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('⚠️ [Auth] Aviso ao verificar admin padrão no banco:', err?.message || err);
  }
}
ensureDefaultAdmin();

// ============================================================================
// 3. ROTA DE LOGIN
// ============================================================================
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, username, password } = req.body || {};
    const identifier = (email || username || '').trim();

    if (!identifier || !password) {
      return res.status(400).json({ success: false, error: 'Informe o usuário/e-mail e a senha.' });
    }

    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT id, name, email, password, role, permissions 
         FROM identities 
         WHERE LOWER(email) = LOWER($1) OR LOWER(COALESCE(name, '')) = LOWER($1) 
         LIMIT 1;`,
        [identifier]
      );

      if (result.rows.length === 0) {
        // Fallback seguro usando variáveis de ambiente (.env)
        const envEmail = process.env.ADMIN_EMAIL || 'matheus_dullius@hotmail.com';
        const envPass = process.env.ADMIN_PASSWORD || '123456';

        if (identifier.toLowerCase() === envEmail.toLowerCase() && password === envPass) {
          const token = generateAuthToken({
            id: 1,
            email: envEmail,
            role: 'admin',
            accessLevel: 10
          });

          return res.status(200).json({
            success: true,
            message: 'Login realizado com sucesso.',
            token,
            user: {
              id: 1,
              name: 'Matheus Dullius',
              fullName: 'Matheus Dullius',
              email: envEmail,
              role: 'admin',
              identityToken: 'Matheus-Admin'
            }
          });
        }

        return res.status(401).json({ success: false, error: 'Credenciais inválidas.' });
      }

      const user = result.rows[0];
      const isValid = verifyPassword(password, user.password);

      if (!isValid) {
        return res.status(401).json({ success: false, error: 'Senha incorreta.' });
      }

      // Upgrade automático para hash seguro se ainda estiver em texto puro
      if (!String(user.password).startsWith('scrypt:')) {
        const hashed = hashPassword(password);
        await client.query('UPDATE identities SET password = $1 WHERE id = $2;', [hashed, user.id]).catch(() => {});
      }

      const fullName = user.name || 'Matheus Dullius';
      const token = generateAuthToken({
        id: user.id,
        email: user.email,
        role: user.role || 'admin',
        accessLevel: 10
      });

      return res.status(200).json({
        success: true,
        message: 'Login realizado com sucesso.',
        token,
        user: {
          id: user.id,
          name: fullName,
          fullName,
          email: user.email,
          role: user.role || 'admin',
          identityToken: user.role === 'admin' ? 'Matheus-Admin' : fullName
        }
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 4. ROTA DE ATUALIZAÇÃO DE CREDENCIAIS (BANCO + .ENV)
// ============================================================================
router.put('/update-credentials', async (req: Request, res: Response) => {
  try {
    const { currentEmail, newEmail, newPassword } = req.body || {};
    if (!currentEmail || (!newEmail && !newPassword)) {
      return res.status(400).json({
        success: false,
        error: 'Informe o e-mail atual e ao menos um novo dado para alteração.'
      });
    }

    const client = await pool.connect();
    try {
      const checkUser = await client.query(
        'SELECT id, password FROM identities WHERE LOWER(email) = LOWER($1);',
        [currentEmail.trim()]
      );

      const targetEmail = (newEmail || currentEmail).trim();
      let targetHashedPass: string | null = null;

      if (newPassword) {
        targetHashedPass = hashPassword(newPassword);
      }

      if (checkUser.rows.length > 0) {
        const userId = checkUser.rows[0].id;
        const finalPass = targetHashedPass || checkUser.rows[0].password;

        await client.query(
          'UPDATE identities SET email = $1, password = $2 WHERE id = $3;',
          [targetEmail, finalPass, userId]
        );
      } else {
        const finalPass = targetHashedPass || hashPassword('123456');
        await client.query(
          'INSERT INTO identities (name, email, password, role) VALUES ($1, $2, $3, $4);',
          ['Matheus Dullius', targetEmail, finalPass, 'admin']
        );
      }

      // Atualiza também o arquivo .env para persistência das variáveis
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf-8');

        envContent = envContent.match(/^ADMIN_EMAIL=/m)
          ? envContent.replace(/^ADMIN_EMAIL=.*/m, `ADMIN_EMAIL=${targetEmail}`)
          : envContent + `\nADMIN_EMAIL=${targetEmail}`;

        if (newPassword) {
          envContent = envContent.match(/^ADMIN_PASSWORD=/m)
            ? envContent.replace(/^ADMIN_PASSWORD=.*/m, `ADMIN_PASSWORD=${newPassword}`)
            : envContent + `\nADMIN_PASSWORD=${newPassword}`;
        }

        fs.writeFileSync(envPath, envContent, 'utf-8');
      }

      process.env.ADMIN_EMAIL = targetEmail;
      if (newPassword) {
        process.env.ADMIN_PASSWORD = newPassword;
      }

      return res.status(200).json({
        success: true,
        message: 'Credenciais atualizadas com sucesso no Banco e no .env!',
        newEmail: targetEmail
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 5. ROTA DE VERIFICAÇÃO BIOMÉTRICA FACIAL
// ============================================================================
router.post('/biometric-verify', async (req: Request, res: Response) => {
  try {
    const { identityToken, webcamFrameBase64 } = req.body || {};
    const identity = await verifyBiometricIdentity({ identityToken, webcamFrameBase64 });
    return res.status(200).json({ success: true, identity });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Exportações duplas compatíveis com o src/server.ts
export const authRoutes = router;
export default router;