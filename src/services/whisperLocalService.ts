// src/services/whisperLocalService.ts
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface WhisperTranscriptionResult {
  success: boolean;
  text?: string;
  engine?: string;
  model?: string;
  durationMs?: number;
  error?: string;
}

export async function transcribeWithLocalWhisper(
  audioBase64: string,
  modelSize: string = process.env.WHISPER_MODEL_SIZE || 'base'
): Promise<WhisperTranscriptionResult> {
  const startTime = Date.now();

  if (!audioBase64 || audioBase64.length < 100) {
    return { success: false, error: 'Áudio Base64 vazio ou insuficiente.' };
  }

  const cleanBase64 = audioBase64.replace(/^data:audio\/[a-zA-Z0-9+-]+;base64,/, '').trim();
  const tempFilePath = path.join(os.tmpdir(), `jarvis_voice_${Date.now()}.webm`);

  try {
    const audioBuffer = Buffer.from(cleanBase64, 'base64');
    await fs.promises.writeFile(tempFilePath, audioBuffer);

    const scriptPath = path.resolve(process.cwd(), 'scripts', 'whisper_transcribe.py');
    const venvPython = path.resolve(process.cwd(), 'whisper-env', 'bin', 'python3');
    const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python3';

    return await new Promise<WhisperTranscriptionResult>((resolve) => {
      const pyProcess = spawn(pythonCmd, [scriptPath, tempFilePath, modelSize], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdoutData = '';
      let stderrData = '';

      pyProcess.stdout.on('data', (chunk) => {
        stdoutData += chunk.toString('utf8');
      });

      pyProcess.stderr.on('data', (chunk) => {
        stderrData += chunk.toString('utf8');
      });

      pyProcess.on('close', async () => {
        try {
          if (fs.existsSync(tempFilePath)) await fs.promises.unlink(tempFilePath);
        } catch {}

        const durationMs = Date.now() - startTime;
        try {
          const lines = stdoutData.trim().split('\n');
          const lastJsonLine = lines[lines.length - 1] || '{}';
          const parsed = JSON.parse(lastJsonLine);
          resolve({ ...parsed, durationMs });
        } catch {
          resolve({
            success: false,
            durationMs,
            error: `Falha na saída do Whisper: ${stderrData || stdoutData}`
          });
        }
      });

      pyProcess.on('error', (err) => {
        resolve({
          success: false,
          error: `Falha ao iniciar Python (${pythonCmd}): ${err.message}`
        });
      });
    });
  } catch (error: any) {
    return {
      success: false,
      error: `Erro interno no Whisper Local: ${error.message}`
    };
  }
}
