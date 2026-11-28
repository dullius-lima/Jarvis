import { captureActiveScreenBase64 } from './visionCaptureService.js';
import { captureVscreenFrame } from './agentVscreenBridge.js';

export type SensoryBlockReason = 'bank_or_password' | 'contacts_privacy' | 'accessibility_disabled' | null;

interface PendingCapture {
  resolve: (res: { frame: string | null; blockedReason?: SensoryBlockReason }) => void;
  timer: NodeJS.Timeout;
}

const pendingCaptures = new Map<string, PendingCapture>();
const armedCameras = new Map<string, { deviceId: string; facing: 'front' | 'back'; armedAt: number }>();
const armedScreens = new Map<string, { deviceId: string; armedAt: number }>();

export function resolveSensoryFrame(
  requestId: string,
  imageBase64: string | null,
  blockedSensitive = false,
  blockedReason: SensoryBlockReason = null
): boolean {
  const entry = pendingCaptures.get(requestId);
  if (!entry) return false;
  clearTimeout(entry.timer);
  pendingCaptures.delete(requestId);
  const effectiveReason: SensoryBlockReason =
    blockedReason || (blockedSensitive ? 'bank_or_password' : null);
  console.log(
    `📸 [SensoryRouter] Retorno (${requestId}): ${
      effectiveReason ? `BLOQUEADO (${effectiveReason})` : imageBase64 ? imageBase64.length + ' chars' : 'vazio'
    }`
  );
  entry.resolve({ frame: imageBase64 || null, blockedReason: effectiveReason });
  return true;
}

export interface SensoryIntent {
  isVisual: boolean;
  stopAction: 'camera' | 'screen' | null;
  armAction: 'camera' | 'screen' | null;
  modality: 'camera' | 'screen';
  facing: 'front' | 'back';
  allowContacts: boolean;
  targetDeviceId: string;
  targetLabel: string;
}

export function detectSensoryIntent(prompt: string, originDeviceId = 'galaxy_s25', sessionId = 'sess_main_admin'): SensoryIntent {
  const p = (prompt || '').trim();
  const stopCamera = /encerr[ae]\s+(?:a\s+)?c[aâ]mera|deslig[ae]\s+(?:a\s+)?c[aâ]mera|fech[ae]\s+(?:a\s+)?c[aâ]mera|par[ae]\s+(?:a\s+)?c[aâ]mera/i.test(p);
  const stopScreen = /encerr[ae]\s+(?:o\s+compartilhamento\s+de\s+|a\s+)?tela|par[ae]\s+de\s+(?:olhar|compartilhar|ver)\s+(?:a\s+|minha\s+)?tela|deslig[ae]\s+(?:o\s+compartilhamento\s+de\s+)?tela/i.test(p);

  const armCamera = !stopCamera && /ativ[ae]\s+(?:a\s+)?c[aâ]mera|lig[ae]\s+(?:a\s+)?c[aâ]mera|abr[ae]\s+(?:a\s+)?c[aâ]mera|deix[ae]\s+(?:a\s+)?c[aâ]mera\s+ligada|fica\s+me\s+olhando/i.test(p);
  const armScreen = !stopScreen && /compartilh[ae]\s+(?:a\s+|minha\s+|o\s+compartilhamento\s+de\s+)?tela|ativ[ae]\s+(?:o\s+compartilhamento\s+de\s+|a\s+|minha\s+)?tela|fica\s+olhando\s+(?:a\s+|minha\s+)?tela|deix[ae]\s+(?:a\s+)?tela\s+compartilhada|modo\s+gemini/i.test(p);

  const isCameraPhrase = /c[aâ]mera|me\s+olh[ae]|olh[ae]\s+para\s+mim|o\s+que\s+(?:eu\s+)?estou\s+fazendo|o\s+que\s+est[aá]\s+acontecendo|me\s+vendo|me\s+v[eê]|quem\s+est[aá]|como\s+(?:eu\s+)?estou|olh[ae]\s+isso|olha\s+isso/i.test(p);
  const isScreenPhrase = /minha\s+tela|na\s+tela|a\s+tela|tela\s+do|tela\s+da|o\s+que\s+est[aá]\s+aberto|o\s+que\s+est[aá]\s+passando|l[eê]\s+(?:a\s+|na\s+)?tela|veja\s+a\s+tela|olha\s+a\s+tela|descrev[ae]\s+(?:o\s+que\s+voc[eê]\s+est[aá]\s+vendo\s+)?(?:na\s+)?tela|print/i.test(p);

  // Só libera leitura de contatos se o usuário pedir explicitamente
  const allowContacts = /(?:pode\s+ler|autoriz[ao]|mostr[ae]|l[eê]|qual\s+(?:[eé]\s+)?o)\s+(?:o\s+|os\s+)?(?:n[uú]mero|telefone|contato|contatos|agenda)/i.test(p);

  const camState = armedCameras.get(sessionId);
  const scrState = armedScreens.get(sessionId);

  let targetDeviceId = originDeviceId || 'galaxy_s25';
  if (/\b(?:tv|televis[aã]o|tcl)\b/i.test(p)) targetDeviceId = 'tv_sala';
  else if (/\b(?:pc|computador|notebook|windows)\b/i.test(p)) targetDeviceId = 'pc_windows';
  else if (/\b(?:outro\s+celular|segundo\s+celular)\b/i.test(p)) targetDeviceId = 'celular_2';
  else if (/\b(?:celular|telefone|s25|galaxy)\b/i.test(p)) targetDeviceId = 'galaxy_s25';
  else if (camState) targetDeviceId = camState.deviceId;
  else if (scrState) targetDeviceId = scrState.deviceId;

  const facing: 'front' | 'back' = /traseira|atr[aá]s|ambiente|frente\s+a\s+mim/i.test(p) ? 'back' : (camState?.facing || 'front');
  const modality: 'camera' | 'screen' = (armScreen || isScreenPhrase || (scrState && !isCameraPhrase && !armCamera)) ? 'screen' : 'camera';

  if (armCamera) {
    armedCameras.set(sessionId, { deviceId: targetDeviceId, facing, armedAt: Date.now() });
    (globalThis as any).__jarvisSensoryStatus = {
      active: true,
      modality: 'camera',
      deviceId: targetDeviceId,
      deviceLabel: targetDeviceId === 'tv_sala' ? 'TV TCL' : targetDeviceId === 'pc_windows' ? 'PC Windows' : 'Galaxy S25',
      identifiedName: 'Identificando (512D)...',
      isFamiliar: false,
      updatedAt: Date.now()
    };
  }
  if (armScreen) {
    armedScreens.set(sessionId, { deviceId: targetDeviceId, armedAt: Date.now() });
    (globalThis as any).__jarvisSensoryStatus = {
      active: true,
      modality: 'screen',
      deviceId: targetDeviceId,
      deviceLabel: targetDeviceId === 'tv_sala' ? 'TV TCL' : targetDeviceId === 'pc_windows' ? 'PC Windows' : 'Galaxy S25',
      identifiedName: 'Tela Compartilhada',
      isFamiliar: true,
      updatedAt: Date.now()
    };
  }

  const labels: Record<string, string> = {
    galaxy_s25: 'Celular (Galaxy S25)',
    tv_sala: 'TV TCL (Sala)',
    pc_windows: 'Computador (Windows)',
    celular_2: 'Segundo Celular',
    galaxy_watch: 'Galaxy Watch'
  };

  return {
    isVisual: Boolean(armCamera || armScreen || isCameraPhrase || isScreenPhrase || camState || scrState),
    stopAction: stopCamera ? 'camera' : (stopScreen ? 'screen' : null),
    armAction: armCamera ? 'camera' : (armScreen ? 'screen' : null),
    modality,
    facing,
    allowContacts,
    targetDeviceId,
    targetLabel: labels[targetDeviceId] || targetDeviceId
  };
}

export function handleSensoryStopCommand(
  stopAction: 'camera' | 'screen',
  sessionId: string,
  sendWsToDevice: (deviceId: string, msg: any) => boolean
): string {
  if (stopAction === 'camera') {
    const prev = armedCameras.get(sessionId);
    armedCameras.delete(sessionId);
    (globalThis as any).__jarvisSensoryStatus = { active: false, modality: 'camera', deviceId: '', deviceLabel: '', identifiedName: '', isFamiliar: false, updatedAt: Date.now() };
    if (prev) sendWsToDevice(prev.deviceId, { type: 'STOP_SENSORY', modality: 'camera' });
    return 'Câmera encerrada. Não estou mais capturando imagens até você pedir novamente.';
  }
  const prev = armedScreens.get(sessionId);
  armedScreens.delete(sessionId);
  (globalThis as any).__jarvisSensoryStatus = { active: false, modality: 'screen', deviceId: '', deviceLabel: '', identifiedName: '', isFamiliar: false, updatedAt: Date.now() };
  if (prev) sendWsToDevice(prev.deviceId, { type: 'STOP_SENSORY', modality: 'screen' });
  return 'Compartilhamento de tela encerrado.';
}

export async function requestLiveSensoryFrame(
  prompt: string,
  originDeviceId: string,
  sessionId: string,
  sendWsToDevice: (deviceId: string, msg: any) => boolean
): Promise<{ frame: string | null; intent: SensoryIntent; offlineDevice?: string; blockedReason?: SensoryBlockReason }> {
  const intent = detectSensoryIntent(prompt, originDeviceId, sessionId);
  if (!intent.isVisual || intent.stopAction) return { frame: null, intent };

  if (intent.targetDeviceId === 'pc_windows' && intent.modality === 'screen') {
    const pcScreen = await captureActiveScreenBase64().catch(() => null);
    if (pcScreen?.success && pcScreen.base64Image) {
      return { frame: `data:image/jpeg;base64,${pcScreen.base64Image}`, intent };
    }
  }

  const requestId = `sens_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  console.log(`📡 [SensoryRouter] Solicitando ${intent.modality} (${intent.facing}) de ${intent.targetDeviceId} [${requestId}]`);
  const dispatched = sendWsToDevice(intent.targetDeviceId, {
    type: 'CAPTURE_SENSORY',
    action: 'CAPTURE_SENSORY',
    requestId,
    modality: intent.modality,
    facing: intent.facing,
    allowContacts: intent.allowContacts,
    keepArmed: Boolean(intent.armAction || armedCameras.has(sessionId) || armedScreens.has(sessionId))
  });

  if (dispatched) {
    const res = await new Promise<{ frame: string | null; blockedReason?: SensoryBlockReason }>((resolve) => {
      const timer = setTimeout(() => {
        pendingCaptures.delete(requestId);
        resolve({ frame: null });
      }, 7500);
      pendingCaptures.set(requestId, { resolve, timer });
    });
    if (res.blockedReason) {
      return { frame: null, intent, blockedReason: res.blockedReason };
    }
    if (res.frame) return { frame: res.frame, intent };
  } else {
    console.warn(`⚠️ [SensoryRouter] Dispositivo ${intent.targetDeviceId} offline no barramento /ws`);
  }

  if (intent.modality === 'screen') {
    const vFrame = await captureVscreenFrame();
    if (vFrame) return { frame: vFrame, intent };
  }

  return { frame: null, intent, offlineDevice: dispatched ? undefined : intent.targetLabel };
}

export function waitForSensoryAck(requestId: string, timeoutMs = 3500): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingCaptures.delete(requestId);
      resolve(null);
    }, timeoutMs);
    pendingCaptures.set(requestId, {
      resolve: (r) => resolve(r.frame),
      timer
    });
  });
}
