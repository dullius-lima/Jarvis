import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

let visionKillSwitchActive = false;

export const SENSITIVE_KEYWORDS: string[] = [
  'banco',
  'password',
  'senha',
  '1password',
  'bitwarden',
  'itau',
  'nubank',
  'metamask',
  'cartao',
  'cvv',
  'token'
];

export interface ScreenCaptureResult {
  success: boolean;
  mimeType: string;
  base64Image?: string;
  capturedAt: string;
  blockedByKillSwitch?: boolean;
  blockedByPrivacyFilter?: boolean;
  error?: string;
}

export function setVisionKillSwitch(state: boolean): boolean {
  visionKillSwitchActive = Boolean(state);
  return visionKillSwitchActive;
}

export function getVisionKillSwitchStatus(): boolean {
  return visionKillSwitchActive;
}

async function captureLocalDesktop(tempFile: string): Promise<void> {
  if (process.platform === 'win32') {
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
      $bitmap = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      $graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
      $bitmap.Save('${tempFile.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Jpeg)
      $graphics.Dispose()
      $bitmap.Dispose()
    `;
    const encodedCommand = Buffer.from(psScript, 'utf16le').toString('base64');
    await execAsync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encodedCommand}`, {
      timeout: 8000
    });
  } else if (process.platform === 'darwin') {
    await execAsync(`screencapture -x -t jpg "${tempFile}"`, { timeout: 8000 });
  } else {
    // Ambientes Linux Desktop com X11 / Wayland
    await execAsync(`import -window root "${tempFile}" || scrot "${tempFile}"`, {
      timeout: 8000
    });
  }
}

/**
 * Captura ou processa a tela ativa para os "Olhos do JARVIS".
 * Suporta frame recebido diretamente do cliente (Web/HUD) ou captura nativa local via SO.
 */
export async function captureActiveScreenBase64(
  clientScreenBase64?: string,
  activeWindowTitle?: string
): Promise<ScreenCaptureResult> {
  const timestamp = new Date().toISOString();

  // 1. Verificação do Kill Switch de Privacidade
  if (visionKillSwitchActive) {
    return {
      success: false,
      mimeType: 'image/jpeg',
      capturedAt: timestamp,
      blockedByKillSwitch: true,
      error: 'Captura de tela bloqueada pelo Kill Switch de Privacidade ativo.'
    };
  }

  // 2. Filtro de Privacidade por Janela Sensível
  if (activeWindowTitle) {
    const lowerTitle = activeWindowTitle.toLowerCase();
    if (SENSITIVE_KEYWORDS.some((kw) => lowerTitle.includes(kw))) {
      return {
        success: false,
        mimeType: 'image/jpeg',
        capturedAt: timestamp,
        blockedByPrivacyFilter: true,
        error: 'Janela sensível detectada. Captura suspensa automaticamente para proteção de credenciais.'
      };
    }
  }

  // 3. Se o frame já foi fornecido pelo cliente (Web/HUD)
  if (clientScreenBase64) {
    const cleanBase64 = clientScreenBase64.replace(/^data:image\/\w+;base64,/, '');
    return {
      success: true,
      mimeType: 'image/jpeg',
      base64Image: cleanBase64,
      capturedAt: timestamp
    };
  }

  // 4. Captura local nativa do sistema operacional (Fallback de Desktop)
  const tempFile = path.join(
    os.tmpdir(),
    `jarvis_screen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`
  );

  try {
    await captureLocalDesktop(tempFile);

    if (fs.existsSync(tempFile)) {
      const buffer = fs.readFileSync(tempFile);
      const base64Image = buffer.toString('base64');
      try {
        fs.unlinkSync(tempFile);
      } catch {}

      return {
        success: true,
        mimeType: 'image/jpeg',
        base64Image,
        capturedAt: timestamp
      };
    }

    return {
      success: false,
      mimeType: 'image/jpeg',
      capturedAt: timestamp,
      error: 'Nenhum frame fornecido pelo cliente e a captura nativa local não gerou arquivo temporário.'
    };
  } catch (err: any) {
    if (fs.existsSync(tempFile)) {
      try {
        fs.unlinkSync(tempFile);
      } catch {}
    }

    return {
      success: false,
      mimeType: 'image/jpeg',
      capturedAt: timestamp,
      error: `Falha na captura nativa de tela: ${err.message}`
    };
  }
}