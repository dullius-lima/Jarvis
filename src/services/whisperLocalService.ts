import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';

export interface WhisperTranscriptionResult {
  success: boolean;
  text?: string;
  engine?: string;
  model?: string;
  durationMs?: number;
  error?: string;
}

let pyWorker: ChildProcessWithoutNullStreams | null = null;
let pyWorkerReady = false;
let pendingWorkerResolvers: Array<(res: any) => void> = [];

function startPersistentWhisperWorker() {
  if (pyWorker) return;
  const scriptPath = path.resolve(process.cwd(), 'scripts', 'whisper_worker.py');
  if (!fs.existsSync(scriptPath)) return;

  const venvPython = path.resolve(process.cwd(), 'whisper-env', 'bin', 'python3');
  const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python3';
  const modelSize = process.env.WHISPER_MODEL_SIZE || 'base';

  try {
    pyWorker = spawn(pythonCmd, [scriptPath, modelSize], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const rl = readline.createInterface({ input: pyWorker.stdout });
    rl.on('line', (line) => {
      try {
        const data = JSON.parse(line.trim());
        if (typeof data.ready === 'boolean') {
          pyWorkerReady = data.ready;
          if (pyWorkerReady) {
            console.log(`🧠 [Whisper RAM Worker] Modelo '${modelSize}' aquecido e pronto em RAM (100% Offline / Zero Tokens).`);
          } else {
            console.error(`❌ [Whisper RAM Worker] Erro ao iniciar modelo:`, data.error);
          }
          return;
        }
        const nextResolver = pendingWorkerResolvers.shift();
        if (nextResolver) nextResolver(data);
      } catch {}
    });

    pyWorker.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) console.warn(`⚠️ [Whisper Worker Stderr]: ${msg}`);
    });

    pyWorker.on('close', () => {
      pyWorker = null;
      pyWorkerReady = false;
      while (pendingWorkerResolvers.length > 0) {
        const r = pendingWorkerResolvers.shift();
        if (r) r({ success: false, text: '', error: 'Worker reiniciando' });
      }
    });
  } catch {
    pyWorker = null;
  }
}

startPersistentWhisperWorker();

export async function transcribeWithLocalWhisper(
  audioBase64: string,
  modelSize: string = process.env.WHISPER_MODEL_SIZE || 'base',
  _allowLocalFallbackOnEmpty = true
): Promise<WhisperTranscriptionResult> {
  const startTime = Date.now();

  if (!audioBase64 || audioBase64.length < 100) {
    return { success: false, error: 'Áudio Base64 vazio ou insuficiente.' };
  }

  let cleanBase64 = audioBase64;
  if (cleanBase64.includes('|DATA:')) {
    cleanBase64 = cleanBase64.split('|DATA:')[1] || cleanBase64;
  }
  cleanBase64 = cleanBase64.replace(/^data:audio\/[a-zA-Z0-9+-]+;base64,/, '').trim();

  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(cleanBase64, 'base64');
  } catch {
    return { success: false, error: 'Falha ao decodificar Base64 de áudio.' };
  }

  if (audioBuffer.length < 800) {
    return { success: true, text: '', engine: 'skip-short-buffer', durationMs: 0 };
  }

  startPersistentWhisperWorker();
  const isWavInput = audioBuffer.length >= 4 && audioBuffer.toString('utf8', 0, 4) === 'RIFF';
  const ext = isWavInput ? '.wav' : '.webm';
  const tempInputPath = path.join(os.tmpdir(), `jarvis_voice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`);

  const cleanupFile = async () => {
    try { if (fs.existsSync(tempInputPath)) await fs.promises.unlink(tempInputPath); } catch {}
  };

  try {
    await fs.promises.writeFile(tempInputPath, audioBuffer);

    if (pyWorker && pyWorker.stdin.writable) {
      const workerResult: any = await new Promise((resolve) => {
        const timer = setTimeout(() => {
          resolve({ success: false, text: '', error: 'Timeout no Whisper Worker (12s)' });
        }, 12000);

        pendingWorkerResolvers.push((res) => {
          clearTimeout(timer);
          resolve(res);
        });

        pyWorker!.stdin.write(tempInputPath + '\n');
      });

      await cleanupFile();
      const durationMs = Date.now() - startTime;
      if (workerResult?.error) {
        console.warn(`⚠️ [Whisper RAM Worker Erro] (${durationMs}ms): ${workerResult.error}`);
      } else {
        console.log(`🐍 [Whisper RAM Worker] (${durationMs}ms | Pico: ${workerResult?.peak ?? '?'} | Bytes: ${audioBuffer.length}): "${workerResult?.text || ''}"`);
      }

      return {
        success: Boolean(workerResult?.success),
        text: (workerResult?.text || '').trim(),
        engine: 'faster-whisper-local-ram',
        model: modelSize,
        durationMs,
        error: workerResult?.error
      };
    }

    await cleanupFile();
    return { success: false, text: '', error: 'Worker Python ainda iniciando.' };
  } catch (error: any) {
    await cleanupFile();
    return { success: false, text: '', error: error.message };
  }
}
