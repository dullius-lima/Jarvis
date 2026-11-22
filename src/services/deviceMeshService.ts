import type { Express, Request, Response } from 'express';
import type { WebSocket, WebSocketServer } from 'ws';

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
  const authHeader = String(req.headers['authorization'] || '');
  if (authHeader.startsWith('Bearer ') && authHeader.length > 20) return true;
  const ip = req.ip || req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip.endsWith('127.0.0.1');
}

export function attachDeviceMeshWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket) => {
    let registeredId: string | null = null;

    ws.on('message', (raw: Buffer | string) => {
      try {
        const text = typeof raw === 'string' ? raw : raw.toString('utf8');
        if (!text.startsWith('{')) return;
        const msg = JSON.parse(text);
        if (msg.type === 'register_device' && msg.deviceId) {
          const expected = getMeshSecret();
          if (expected && msg.token !== expected) {
            console.warn(`🚫 [Security] Tentativa não autorizada de registro WS para ${msg.deviceId}`);
            ws.close(4001, 'Unauthorized device');
            return;
          }
          registeredId = String(msg.deviceId);
          connectedDevices.set(registeredId, {
            deviceId: registeredId,
            platform: String(msg.platform || 'android'),
            ws,
            connectedAt: new Date().toISOString(),
            apps: deviceAppsRegistry.get(registeredId) || [],
          });
          console.log(`📡 [DeviceMesh] Dispositivo autenticado online: ${registeredId}`);
        }
      } catch {
        // Ignora frames não-JSON
      }
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
