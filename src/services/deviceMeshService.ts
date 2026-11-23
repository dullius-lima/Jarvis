import type { Express, Request, Response } from 'express';
import type { WebSocket, WebSocketServer } from 'ws';
import {
  createDeviceInvite,
  pairDeviceWithCode,
  regenerateDeviceCode,
  validateAuthorizedDevice,
  listAllRegisteredDevices,
  updateRegisteredDevice,
  deleteRegisteredDevice
} from './deviceRegistryService.js';

interface DeviceSession {
  deviceId: string;
  platform: string;
  ws: WebSocket;
  connectedAt: string;
  apps: Array<{ name: string; packageName: string }>;
}

const connectedDevices = new Map<string, DeviceSession>();
const deviceAppsRegistry = new Map<string, Array<{ name: string; packageName: string }>>();
const pendingGalleryUploads = new Map<string, { fileName: string; imageBase64: string; receivedAt: number }>();

function getMeshSecret(): string {
  return process.env.DEVICE_MESH_SECRET || '';
}

function isAuthorizedDeviceOrAdmin(req: Request): boolean {
  const secret = getMeshSecret();
  const deviceToken = String(req.headers['x-device-token'] || '');
  if (secret && deviceToken === secret) return true;
  if (deviceToken.startsWith('jrv_tok_')) return true;
  const authHeader = String(req.headers['authorization'] || '');
  if (authHeader.startsWith('Bearer ') && authHeader.length > 20) return true;
  const ip = req.ip || req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip.endsWith('127.0.0.1');
}

export function attachDeviceMeshWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket) => {
    let registeredId: string | null = null;

    ws.on('message', async (raw: Buffer | string) => {
      try {
        const text = typeof raw === 'string' ? raw : raw.toString('utf8');
        if (!text.startsWith('{')) return;
        const msg = JSON.parse(text);
        if (msg.type === 'register_device' && msg.deviceId) {
          const authDev = await validateAuthorizedDevice(String(msg.deviceId), String(msg.deviceToken || ''));
          if (!authDev) {
            ws.send(JSON.stringify({ type: 'device_auth_status', status: 'unpaired', deviceId: msg.deviceId }));
            ws.close(4001, 'Device token required or revoked');
            return;
          }
          registeredId = authDev.device_id;
          connectedDevices.set(registeredId, {
            deviceId: registeredId,
            platform: String(msg.platform || authDev.platform || 'android'),
            ws,
            connectedAt: new Date().toISOString(),
            apps: deviceAppsRegistry.get(registeredId) || [],
          });
          ws.send(JSON.stringify({ type: 'device_auth_status', status: 'approved', customName: authDev.custom_name }));
          console.log(`📡 [DeviceMesh] Dispositivo pareado online: ${authDev.custom_name} (${registeredId})`);
        }
      } catch {}
    });

    ws.on('close', () => {
      if (registeredId && connectedDevices.get(registeredId)?.ws === ws) {
        connectedDevices.delete(registeredId);
      }
    });
  });
}

export function dispatchCommandToDevice(
  targetDevice: string,
  action: string,
  payload: Record<string, unknown> = {}
): { ok: boolean; message: string } {
  const normalized = targetDevice.toLowerCase().trim();
  const aliasMap: Record<string, string> = {
    celular: 'galaxy_s25',
    s25: 'galaxy_s25',
    telefone: 'galaxy_s25',
    relogio: 'galaxy_watch',
    watch: 'galaxy_watch',
    tv: 'tv_sala',
    televisao: 'tv_sala',
    tcl: 'tv_sala',
    pc: 'pc_windows',
    computador: 'pc_windows',
    windows: 'pc_windows',
    desktop: 'pc_windows',
    notebook: 'pc_windows',
  };
  const deviceId = aliasMap[normalized] || normalized;
  const session = connectedDevices.get(deviceId);

  if (!session || session.ws.readyState !== 1) {
    const online = Array.from(connectedDevices.keys());
    return {
      ok: false,
      message: `Dispositivo "${deviceId}" está offline. Ativos agora: ${online.length ? online.join(', ') : 'nenhum'}.`,
    };
  }

  session.ws.send(
    JSON.stringify({
      type: 'device_command',
      action,
      payload,
      timestamp: Date.now(),
    })
  );

  return { ok: true, message: `Comando "${action}" enviado com segurança para ${deviceId}.` };
}

export async function requestGalleryPhotoFromPhone(index = 0): Promise<{ ok: boolean; fileName?: string; imageBase64?: string; message: string }> {
  const requestId = `gal_${Date.now()}`;
  const sent = dispatchCommandToDevice('galaxy_s25', 'get_gallery_photo', { index, requestId });
  if (!sent.ok) return { ok: false, message: sent.message };

  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const found = pendingGalleryUploads.get(requestId);
    if (found) {
      pendingGalleryUploads.delete(requestId);
      return {
        ok: true,
        fileName: found.fileName,
        imageBase64: found.imageBase64,
        message: `Foto "${found.fileName}" recuperada da galeria do Galaxy S25.`,
      };
    }
  }
  return { ok: false, message: 'Tempo esgotado aguardando foto da galeria. Verifique se a permissão Fotos e Vídeos está liberada no JARVIS Core.' };
}

export function registerDeviceMeshRoutes(app: Express, pool?: any) {

  app.get('/api/v1/devices', async (_req: Request, res: Response) => {
    try {
      const list = await listAllRegisteredDevices();
      const enriched = list.map((d) => ({
        ...d,
        online: connectedDevices.has(d.device_id) && connectedDevices.get(d.device_id)?.ws.readyState === 1,
        appsCount: (deviceAppsRegistry.get(d.device_id) || []).length
      }));
      return res.json({ success: true, data: enriched });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Erro ao listar dispositivos' });
    }
  });

  app.post('/api/v1/devices/create-invite', async (req: Request, res: Response) => {
    try {
      const { custom_name, device_type, owner_profile, is_primary } = req.body || {};
      if (!custom_name || !String(custom_name).trim()) {
        return res.status(400).json({ success: false, error: 'Informe um nome para o dispositivo.' });
      }
      const created = await createDeviceInvite({ custom_name, device_type, owner_profile, is_primary });
      return res.json({ success: true, data: created });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Erro ao gerar código de acesso' });
    }
  });

  app.post('/api/v1/devices/pair', async (req: Request, res: Response) => {
    try {
      const { pairingCode, hardwareId, platform, deviceType, modelInfo } = req.body || {};
      const ipAddress = req.ip || req.socket.remoteAddress || '';
      const paired = await pairDeviceWithCode({ pairingCode, hardwareId, platform, deviceType, modelInfo, ipAddress });
      if (!paired) {
        return res.status(401).json({ success: false, error: 'Código de acesso inválido, já revogado ou bloqueado.' });
      }
      return res.json({
        success: true,
        deviceId: paired.device_id,
        deviceToken: paired.device_token,
        customName: paired.custom_name,
        ownerProfile: paired.owner_profile,
        isPrimary: paired.is_primary
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Erro ao vincular dispositivo' });
    }
  });

  app.post('/api/v1/devices/:deviceId/regenerate-code', async (req: Request, res: Response) => {
    try {
      const id = decodeURIComponent(req.params.deviceId);
      if (connectedDevices.has(id)) {
        try { connectedDevices.get(id)?.ws.close(4003, 'Token regenerated'); } catch {}
        connectedDevices.delete(id);
      }
      const updated = await regenerateDeviceCode(id);
      if (!updated) return res.status(404).json({ success: false, error: 'Dispositivo não encontrado' });
      return res.json({ success: true, data: updated });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Erro ao gerar novo código' });
    }
  });

  app.put('/api/v1/devices/:deviceId', async (req: Request, res: Response) => {
    try {
      const id = decodeURIComponent(req.params.deviceId);
      const updated = await updateRegisteredDevice(id, req.body || {});
      if (!updated) return res.status(404).json({ success: false, error: 'Dispositivo não encontrado' });
      if (updated.status !== 'approved' && connectedDevices.has(id)) {
        try { connectedDevices.get(id)?.ws.close(4003, 'Device revoked'); } catch {}
        connectedDevices.delete(id);
      }
      return res.json({ success: true, data: updated });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Erro ao atualizar dispositivo' });
    }
  });

  app.delete('/api/v1/devices/:deviceId', async (req: Request, res: Response) => {
    try {
      const id = decodeURIComponent(req.params.deviceId);
      if (connectedDevices.has(id)) {
        try { connectedDevices.get(id)?.ws.close(4003, 'Device deleted'); } catch {}
        connectedDevices.delete(id);
      }
      await deleteRegisteredDevice(id);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Erro ao excluir dispositivo' });
    }
  });

  app.get('/api/v1/device/mesh-status', (req: Request, res: Response) => {
    if (!isAuthorizedDeviceOrAdmin(req)) return res.status(401).json({ success: false, error: 'Não autorizado' });
    const list = Array.from(connectedDevices.values()).map((d) => ({
      deviceId: d.deviceId,
      platform: d.platform,
      connectedAt: d.connectedAt,
      appsCount: (deviceAppsRegistry.get(d.deviceId) || []).length,
    }));
    return res.json({ success: true, devices: list });
  });

  app.post('/api/v1/device/dispatch', (req: Request, res: Response) => {
    if (!isAuthorizedDeviceOrAdmin(req)) return res.status(401).json({ success: false, error: 'Não autorizado' });
    const { targetDevice, action, payload } = req.body || {};
    if (!targetDevice || !action) return res.status(400).json({ success: false, error: 'Informe targetDevice e action.' });
    const result = dispatchCommandToDevice(String(targetDevice), String(action), payload || {});
    return res.status(result.ok ? 200 : 404).json(result);
  });

  app.post('/api/v1/device/gallery-upload', (req: Request, res: Response) => {
    if (!isAuthorizedDeviceOrAdmin(req)) return res.status(401).json({ success: false, error: 'Não autorizado' });
    const { requestId, fileName, imageBase64 } = req.body || {};
    if (!requestId || !imageBase64) return res.status(400).json({ success: false });
    pendingGalleryUploads.set(String(requestId), {
      fileName: String(fileName || 'foto.jpg'),
      imageBase64: String(imageBase64),
      receivedAt: Date.now(),
    });
    return res.json({ success: true });
  });

  app.post('/api/v1/device/sync-context', async (req: Request, res: Response) => {
    if (!isAuthorizedDeviceOrAdmin(req)) return res.status(401).json({ success: false, error: 'Não autorizado' });
    try {
      const { deviceId = 'galaxy_s25', apps = [], contacts = [] } = req.body || {};
      if (Array.isArray(apps) && apps.length > 0) deviceAppsRegistry.set(String(deviceId), apps);

      const dbPool = pool || (await import('../config/database.js')).pool;
      console.log(`📥 [DeviceMesh] Recebido sync-context de ${deviceId}: ${contacts.length} contactos, ${apps.length} apps`);
      let savedContacts = 0;
      if (dbPool && Array.isArray(contacts) && contacts.length > 0) {
        const seen = new Set<string>();
        const nomes: string[] = [];
        const telefones: string[] = [];
        const apelidos: string[] = [];
        for (const c of contacts) {
          if (!c?.name || !c?.phone) continue;
          const rawName = String(c.name).trim();
          const cleanPhone = String(c.phone).replace(/[^0-9+]/g, '');
          if (!rawName || cleanPhone.length < 8) continue;
          let key = rawName.toLowerCase();
          if (seen.has(key)) key = `${key} (${cleanPhone.slice(-4)})`;
          if (seen.has(key)) continue;
          seen.add(key);
          nomes.push(key);
          telefones.push(cleanPhone);
          apelidos.push(rawName);
        }
        if (nomes.length > 0) {
          await dbPool.query(
            `INSERT INTO contatos_agenda (nome, telefone, apelidos)
             SELECT u.nome, u.telefone, ARRAY[u.apelido]
             FROM UNNEST($1::text[], $2::text[], $3::text[]) AS u(nome, telefone, apelido)
             ON CONFLICT (nome) DO UPDATE SET telefone = EXCLUDED.telefone`,
            [nomes, telefones, apelidos]
          );
          savedContacts = nomes.length;
        }
      }
      return res.json({ success: true, deviceId, appsCount: apps.length, savedContacts });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Erro na sincronia' });
    }
  });
}

export function sendToDeviceById(deviceId: string, payload: any): boolean {
  try {
    const g: any = globalThis as any;
    const sockets = g.__jarvisDeviceSockets || (typeof connectedDevices !== 'undefined' ? connectedDevices : null);
    if (sockets && typeof sockets.forEach === 'function') {
      let sent = false;
      sockets.forEach((entry: any, key: string) => {
        const ws = entry?.ws || entry?.socket || entry;
        const id = entry?.deviceId || key || '';
        if (ws && ws.readyState === 1 && (id === deviceId || String(id).includes(deviceId))) {
          ws.send(JSON.stringify(payload));
          sent = true;
        }
      });
      if (sent) return true;
    }
  } catch {}
  return false;
}
