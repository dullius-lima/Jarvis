// src/routes/authRoutes.ts
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../config/database.js';
import { verifyBiometricIdentity } from '../services/biometricService.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'jarvis-n8n-oci-super-secret-key-2026';

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

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, username, password } = req.body || {};
    const identifier = (email || username || '').trim();

    if (!identifier || !password) {
      return res.status(400).json({ success: false, error: 'Informe o usuário/e-mail e a senha.' });
    }

    const result = await pool.query(
      `SELECT * FROM identities 
       WHERE LOWER(email) = LOWER($1) OR LOWER(COALESCE(name, '')) = LOWER($1) 
       LIMIT 1;`,
      [identifier]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Credenciais inválidas.' });
    }

    const user = result.rows[0];
    const isValid = verifyPassword(password, user.password);

    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Senha incorreta.' });
    }

    if (!String(user.password).startsWith('scrypt:')) {
      const hashed = hashPassword(password);
      await pool.query('UPDATE identities SET password = $1 WHERE id = $2;', [hashed, user.id]).catch(() => {});
    }

    const fullName = user.full_name || user.name || 'Matheus Dulius';
    const token = generateAuthToken({
      id: user.id,
      email: user.email,
      role: user.role || 'admin',
      accessLevel: user.access_level || 10
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
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/update-credentials', async (req: Request, res: Response) => {
  try {
    const { currentEmail, newEmail, newPassword } = req.body || {};
    if (!currentEmail || (!newEmail && !newPassword)) {
      return res.status(400).json({
        success: false,
        error: 'Informe o e-mail atual e ao menos um novo dado para alteração.'
      });
    }

    const checkUser = await pool.query('SELECT * FROM identities WHERE LOWER(email) = LOWER($1);', [
      currentEmail
    ]);
    if (checkUser.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }

    const updatedEmail = newEmail || currentEmail;
    const updatedPassword = newPassword ? hashPassword(newPassword) : checkUser.rows[0].password;

    await pool.query('UPDATE identities SET email = $1, password = $2 WHERE id = $3;', [
      updatedEmail,
      updatedPassword,
      checkUser.rows[0].id
    ]);

    return res.status(200).json({
      success: true,
      message: 'Credenciais atualizadas com sucesso!',
      newEmail: updatedEmail
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/biometric-verify', async (req: Request, res: Response) => {
  try {
    const { identityToken, webcamFrameBase64 } = req.body || {};
    const identity = await verifyBiometricIdentity({ identityToken, webcamFrameBase64 });
    return res.status(200).json({ success: true, identity });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export const authRoutes = router;
export default router;