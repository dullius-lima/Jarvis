import crypto from 'crypto';
import { pool } from '../config/database.js';

let schemaReady = false;

export interface RegisteredDevice {
  device_id: string;
  custom_name: string;
  device_type: string;
  platform: string;
  model_info: string;
  owner_profile: string;
  status: 'awaiting_pair' | 'approved' | 'blocked';
  is_primary: boolean;
  pairing_code: string;
  device_token: string;
  hardware_id: string;
  ip_address: string;
  last_seen_at: string;
  created_at: string;
}

function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = (len: number) => {
    let out = '';
    const bytes = crypto.randomBytes(len);
    for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
    return out;
  };
  return `JRV-${part(4)}-${part(4)}`;
}

function generateDeviceToken(): string {
  return 'jrv_tok_' + crypto.randomBytes(24).toString('hex');
}

export async function ensureDeviceRegistrySchema(): Promise<void> {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jarvis_devices (
      device_id VARCHAR(140) PRIMARY KEY,
      custom_name VARCHAR(140) NOT NULL,
      device_type VARCHAR(40) NOT NULL DEFAULT 'phone',
      platform VARCHAR(40) NOT NULL DEFAULT 'android',
      model_info VARCHAR(180) DEFAULT '',
      owner_profile VARCHAR(120) DEFAULT 'Matheus-Admin',
      status VARCHAR(30) NOT NULL DEFAULT 'awaiting_pair',
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      pairing_code VARCHAR(32),
      device_token VARCHAR(128),
      hardware_id VARCHAR(140) DEFAULT '',
      ip_address VARCHAR(80) DEFAULT '',
      last_seen_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE jarvis_devices ADD COLUMN IF NOT EXISTS pairing_code VARCHAR(32);
    ALTER TABLE jarvis_devices ADD COLUMN IF NOT EXISTS device_token VARCHAR(128);
    ALTER TABLE jarvis_devices ADD COLUMN IF NOT EXISTS hardware_id VARCHAR(140) DEFAULT '';
  `);
  schemaReady = true;
}

export async function createDeviceInvite(params: {
  custom_name: string;
  device_type?: string;
  owner_profile?: string;
  is_primary?: boolean;
}): Promise<RegisteredDevice> {
  await ensureDeviceRegistrySchema();
  const type = String(params.device_type || 'phone').trim();
  const name = String(params.custom_name || 'Novo Dispositivo').trim();
  const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$|_/g, '_').slice(0, 20);
  const deviceId = `${type}_${slug || 'dev'}_${crypto.randomBytes(2).toString('hex')}`;
  const pairingCode = generatePairingCode();
  const deviceToken = generateDeviceToken();

  const existingPrim = await pool.query(`SELECT COUNT(*)::int AS total FROM jarvis_devices WHERE is_primary = TRUE;`);
  const makePrimary = typeof params.is_primary === 'boolean'
    ? params.is_primary
    : Number(existingPrim.rows[0]?.total || 0) === 0;

  if (makePrimary) {
    await pool.query(`UPDATE jarvis_devices SET is_primary = FALSE;`);
  }

  const ins = await pool.query(
    `INSERT INTO jarvis_devices
       (device_id, custom_name, device_type, platform, owner_profile, status, is_primary, pairing_code, device_token)
     VALUES ($1, $2, $3, $4, $5, 'awaiting_pair', $6, $7, $8)
     RETURNING *;`,
    [
      deviceId,
      name,
      type,
      type === 'pc' ? 'windows' : 'android',
      String(params.owner_profile || (makePrimary ? 'Matheus-Admin' : 'Família')).trim(),
      makePrimary,
      pairingCode,
      deviceToken
    ]
  );
  return ins.rows[0];
}

export async function pairDeviceWithCode(params: {
  pairingCode: string;
  hardwareId?: string;
  platform?: string;
  deviceType?: string;
  modelInfo?: string;
  ipAddress?: string;
}): Promise<RegisteredDevice | null> {
  await ensureDeviceRegistrySchema();
  const code = String(params.pairingCode || '').toUpperCase().replace(/\s+/g, '').trim();
  if (!code) return null;

  const found = await pool.query(
    `SELECT * FROM jarvis_devices WHERE UPPER(TRIM(pairing_code)) = $1 LIMIT 1;`,
    [code]
  );
  if (found.rows.length === 0) return null;
  const row = found.rows[0];
  if (row.status === 'blocked') return null;

  const newToken = row.device_token || generateDeviceToken();
  const upd = await pool.query(
    `UPDATE jarvis_devices
     SET status = 'approved',
         device_token = $2,
         hardware_id = COALESCE(NULLIF($3, ''), hardware_id),
         platform = COALESCE(NULLIF($4, ''), platform),
         model_info = COALESCE(NULLIF($5, ''), model_info),
         ip_address = COALESCE(NULLIF($6, ''), ip_address),
         last_seen_at = NOW()
     WHERE device_id = $1
     RETURNING *;`,
    [
      row.device_id,
      newToken,
      params.hardwareId || '',
      params.platform || '',
      params.modelInfo || '',
      params.ipAddress || ''
    ]
  );
  return upd.rows[0];
}

export async function regenerateDeviceCode(deviceId: string): Promise<RegisteredDevice | null> {
  await ensureDeviceRegistrySchema();
  const pairingCode = generatePairingCode();
  const deviceToken = generateDeviceToken();
  const upd = await pool.query(
    `UPDATE jarvis_devices
     SET status = 'awaiting_pair',
         pairing_code = $2,
         device_token = $3
     WHERE device_id = $1
     RETURNING *;`,
    [deviceId, pairingCode, deviceToken]
  );
  return upd.rows[0] || null;
}

export async function validateAuthorizedDevice(deviceId?: string, deviceToken?: string): Promise<RegisteredDevice | null> {
  await ensureDeviceRegistrySchema();
  const id = String(deviceId || '').trim();
  const tok = String(deviceToken || '').trim();
  if (!id || !tok) return null;

  const res = await pool.query(
    `SELECT * FROM jarvis_devices WHERE device_id = $1 AND device_token = $2 AND status = 'approved' LIMIT 1;`,
    [id, tok]
  );
  if (res.rows.length === 0) return null;
  await pool.query(`UPDATE jarvis_devices SET last_seen_at = NOW() WHERE device_id = $1;`, [id]).catch(() => {});
  return res.rows[0];
}

export async function listAllRegisteredDevices(): Promise<RegisteredDevice[]> {
  await ensureDeviceRegistrySchema();
  const res = await pool.query(
    `SELECT * FROM jarvis_devices ORDER BY is_primary DESC, created_at DESC;`
  );
  return res.rows;
}

export async function updateRegisteredDevice(
  deviceId: string,
  patch: Partial<{ custom_name: string; status: string; device_type: string; owner_profile: string; is_primary: boolean }>
): Promise<RegisteredDevice | null> {
  await ensureDeviceRegistrySchema();
  if (patch.is_primary) {
    await pool.query(`UPDATE jarvis_devices SET is_primary = FALSE;`);
  }
  const res = await pool.query(
    `UPDATE jarvis_devices
     SET custom_name = COALESCE(NULLIF($2, ''), custom_name),
         status = COALESCE(NULLIF($3, ''), status),
         device_type = COALESCE(NULLIF($4, ''), device_type),
         owner_profile = COALESCE(NULLIF($5, ''), owner_profile),
         is_primary = COALESCE($6, is_primary)
     WHERE device_id = $1
     RETURNING *;`,
    [
      deviceId,
      patch.custom_name?.trim() || '',
      patch.status || '',
      patch.device_type || '',
      patch.owner_profile?.trim() || '',
      typeof patch.is_primary === 'boolean' ? patch.is_primary : null
    ]
  );
  return res.rows[0] || null;
}

export async function deleteRegisteredDevice(deviceId: string): Promise<boolean> {
  await ensureDeviceRegistrySchema();
  const res = await pool.query(`DELETE FROM jarvis_devices WHERE device_id = $1;`, [deviceId]);
  return (res.rowCount || 0) > 0;
}

export async function resolveDeviceByPromptOrId(prompt: string, fallbackId: string): Promise<{ id: string; label: string }> {
  await ensureDeviceRegistrySchema();
  const pLow = (prompt || '').toLowerCase();
  const all = await listAllRegisteredDevices();
  const approved = all.filter((d) => d.status === 'approved');

  for (const dev of approved) {
    const nm = dev.custom_name.toLowerCase().trim();
    if (nm.length >= 3 && pLow.includes(nm)) {
      return { id: dev.device_id, label: dev.custom_name };
    }
  }

  let wantedType = '';
  if (/\b(?:tv|televis[aã]o|tcl)\b/i.test(pLow)) wantedType = 'tv';
  else if (/\b(?:pc|computador|notebook|windows)\b/i.test(pLow)) wantedType = 'pc';
  else if (/\b(?:rel[oó]gio|watch)\b/i.test(pLow)) wantedType = 'watch';
  else if (/\b(?:tablet)\b/i.test(pLow)) wantedType = 'tablet';
  else if (/\b(?:celular|telefone|s25|galaxy)\b/i.test(pLow)) wantedType = 'phone';

  if (wantedType) {
    const matchType = approved.find((d) => d.device_type === wantedType);
    if (matchType) return { id: matchType.device_id, label: matchType.custom_name };
  }

  const origin = approved.find((d) => d.device_id === fallbackId) || approved[0];
  if (origin) return { id: origin.device_id, label: origin.custom_name };
  return { id: fallbackId, label: fallbackId || 'Dispositivo' };
}
