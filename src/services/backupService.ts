import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pool } from '../config/database.js';

const BACKUP_DIR = path.resolve(process.cwd(), 'backups');
const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(process.env.BACKUP_AES_KEY || 'jarvis-aes-256-master-backup-key-2026')
  .digest(); // 32 bytes exatos para AES-256

export async function runEncryptedDatabaseBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const [agents, brainConfig, promptVersions, collections] = await Promise.all([
      pool.query('SELECT * FROM ai_agents ORDER BY id ASC').catch(() => ({ rows: [] })),
      pool.query('SELECT * FROM brain_config ORDER BY id ASC').catch(() => ({ rows: [] })),
      pool.query('SELECT * FROM prompt_versions ORDER BY id DESC LIMIT 100').catch(() => ({ rows: [] })),
      pool.query('SELECT * FROM dynamic_collections ORDER BY id DESC LIMIT 500').catch(() => ({ rows: [] }))
    ]);

    const snapshot = {
      timestamp: new Date().toISOString(),
      ecosystem: 'JARVIS_N8N_ENTERPRISE',
      data: {
        brain_config: brainConfig.rows,
        ai_agents: agents.rows,
        prompt_versions: promptVersions.rows,
        dynamic_collections: collections.rows
      }
    };

    const plainText = JSON.stringify(snapshot, null, 2);

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const payload = JSON.stringify({
      algorithm: 'aes-256-cbc',
      iv: iv.toString('hex'),
      createdAt: snapshot.timestamp,
      ciphertext: encrypted
    });

    const fileName = `jarvis-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.enc`;
    const filePath = path.join(BACKUP_DIR, fileName);
    fs.writeFileSync(filePath, payload, 'utf8');

    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.enc'))
      .map((f) => ({
        name: f,
        time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 15) {
      for (const oldFile of files.slice(15)) {
        fs.unlinkSync(path.join(BACKUP_DIR, oldFile.name));
      }
    }

    console.log(`🔒 [Backup AES-256] Snapshot criptografado gerado: ${fileName}`);
    return {
      success: true,
      fileName,
      sizeBytes: Buffer.byteLength(payload, 'utf8'),
      createdAt: snapshot.timestamp
    };
  } catch (error: any) {
    console.error('❌ [Backup AES-256] Falha ao gerar backup:', error.message);
    return { success: false, error: error.message };
  }
}

export function listEncryptedBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.enc'))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return {
        fileName: f,
        sizeKB: Math.round((stat.size / 1024) * 10) / 10,
        createdAt: stat.mtime
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function startAutomatedBackupSchedule() {
  setTimeout(() => {
    runEncryptedDatabaseBackup();
  }, 10000);

  setInterval(() => {
    runEncryptedDatabaseBackup();
  }, 24 * 60 * 60 * 1000);

  console.log('🔐 [Segurança] Agendador de Backups Criptografados (AES-256) ativado.');
}