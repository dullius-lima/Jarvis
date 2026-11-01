// src/services/securityGovernanceService.ts
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { pool } from '../config/database.js';

const ENCRYPTION_SECRET =
  process.env.BACKUP_ENCRYPTION_KEY || 'jarvis-n8n-oci-master-secret-key-32b';

/**
 * Gera um Backup Criptografado (AES-256-CBC) das configurações, agentes e conectores do PostgreSQL
 */
export async function generateEncryptedBackup(): Promise<{
  success: boolean;
  fileName?: string;
  sizeBytes?: number;
  error?: string;
}> {
  const client = await pool.connect();
  try {
    const backupDir = path.join(process.cwd(), 'backups');
    await fs.mkdir(backupDir, { recursive: true });

    const agents = await client.query('SELECT * FROM ai_agents').catch(() => ({ rows: [] }));
    const configs = await client.query('SELECT * FROM system_configs').catch(() => ({ rows: [] }));
    const connectors = await client
      .query('SELECT * FROM external_connectors')
      .catch(() => ({ rows: [] }));
    const dynamicCollections = await client
      .query('SELECT * FROM dynamic_collections ORDER BY created_at DESC LIMIT 200')
      .catch(() => ({ rows: [] }));

    const payload = JSON.stringify({
      timestamp: new Date().toISOString(),
      agents: agents.rows,
      configs: configs.rows,
      connectors: connectors.rows,
      dynamicCollections: dynamicCollections.rows
    });

    const key = crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(payload, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const finalContent = `${iv.toString('hex')}:${encrypted}`;
    const fileName = `jarvis-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.enc`;
    const filePath = path.join(backupDir, fileName);

    await fs.writeFile(filePath, finalContent, 'utf8');
    console.log(`🔒 [Backup AES-256] Snapshot criptografado gerado: ${fileName}`);

    return {
      success: true,
      fileName,
      sizeBytes: Buffer.byteLength(finalContent, 'utf8')
    };
  } catch (error: any) {
    console.error('❌ [Backup AES-256] Falha ao gerar backup:', error.message);
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
}

/**
 * Lista todos os snapshots criptografados (.enc) salvos na pasta /backups
 */
export async function listEncryptedBackups() {
  try {
    const backupDir = path.join(process.cwd(), 'backups');
    await fs.mkdir(backupDir, { recursive: true });
    const files = await fs.readdir(backupDir);
    const encFiles = files.filter((f) => f.endsWith('.enc')).sort().reverse();

    const details = await Promise.all(
      encFiles.slice(0, 20).map(async (file) => {
        const stat = await fs.stat(path.join(backupDir, file));
        return {
          fileName: file,
          sizeKB: Number((stat.size / 1024).toFixed(2)),
          createdAt: stat.birthtime
        };
      })
    );

    return { success: true, backups: details };
  } catch (error: any) {
    return { success: false, backups: [], error: error.message };
  }
}

let backupSchedulerStarted = false;

export function startMemoryAndBackupScheduler() {
  if (backupSchedulerStarted) return;
  backupSchedulerStarted = true;

  setTimeout(() => {
    generateEncryptedBackup();
  }, 10000).unref();

  setInterval(() => {
    generateEncryptedBackup();
  }, 24 * 60 * 60 * 1000).unref();

  console.log('🔐 [Segurança] Agendador de Backups Criptografados (AES-256) ativado.');
}