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
  peak?: number;
  durationMs?: number;
  error?: string;
}

let workerProc: ChildProcessWithoutNullStreams | null = null;
let workerReady = false;
let workerBootPromise: Promise<boolean> | null = null;
let pendingResolve: ((line: string) => void) | null = null;
let requestQueue: Promise<any> = Promise.resolve();

function getPythonBinary(): string {
  const venvPy = path.resolve(process.cwd(), 'whisper-env', 'bin', 'python3');
  return fs.existsSync(venvPy) ? venvPy : 'python3';
}

function resetWorker() {
  workerReady = false;
  workerBootPromise = null;
  if (pendingResolve) {
    const res = pendingResolve;
    pendingResolve = null;
    res('{"success":false,"error":"Worker reiniciado"}');
  }
  if (workerProc) {
    try { workerProc.kill('SIGKILL'); } catch {}
    workerProc = null;
  }
}

async function ensureWorkerReady(modelSize: string): Promise<boolean> {
  if (workerProc && workerReady && !workerProc.killed) return true;
  if (workerBootPromise) return workerBootPromise;

  workerBootPromise = new Promise<boolean>((resolve) => {
    const pyBin = getPythonBinary();
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'whisper_worker.py');
    const proc = spawn(pyBin, [scriptPath, modelSize], { stdio: ['pipe', 'pipe', 'pipe'] });
    workerProc = proc;

    const rl = readline.createInterface({ input: proc.stdout });
    const bootTimer = setTimeout(() => {
      resetWorker();
      resolve(false);
    }, 25000);

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (!workerReady) {
        try {
          const msg = JSON.parse(trimmed);
          if (msg.ready) {
            clearTimeout(bootTimer);
            workerReady = true;
            console.log(`🧠 [Whisper RAM] Modelo '${modelSize}' carregado (${pyBin})`);
            resolve(true);
          } else {
            clearTimeout(bootTimer);
            resetWorker();
            resolve(false);
          }
        } catch {}
        return;
      }

      if (pendingResolve) {
        const res = pendingResolve;
        pendingResolve = null;
        res(trimmed);
      }
    });

    proc.on('exit', () => {
      clearTimeout(bootTimer);
      resetWorker();
      resolve(false);
    });
  });

  return workerBootPromise;
}

export function transcribeWithLocalWhisper(
  audioBase64: string,
  modelSize: string = process.env.WHISPER_MODEL_SIZE || 'base',
  _allowLocalFallbackOnEmpty = true
): Promise<WhisperTranscriptionResult> {
  const task = async (): Promise<WhisperTranscriptionResult> => {
    const startTime = Date.now();
    if (!audioBase64 || audioBase64.length < 100) {
      return { success: false, text: '', error: 'Áudio Base64 vazio ou curto.' };
    }

    let cleanBase64 = audioBase64.trim();
    if (cleanBase64.includes('|DATA:')) {
      cleanBase64 = cleanBase64.split('|DATA:').pop() || '';
    }
    cleanBase64 = cleanBase64.replace(/^data:audio\/[a-zA-Z0-9+.-]+;base64,/, '').trim();

    let buf: Buffer;
    try {
      buf = Buffer.from(cleanBase64, 'base64');
    } catch {
      return { success: false, text: '', error: 'Base64 inválido.' };
    }

    const isWav = buf.length >= 4 && buf.toString('utf8', 0, 4) === 'RIFF';
    const tempFile = path.join(os.tmpdir(), `jv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${isWav ? 'wav' : 'webm'}`);

    try {
      await fs.promises.writeFile(tempFile, buf);
      const effectiveModel = process.env.WHISPER_MODEL_SIZE || 'base';
      const ready = await ensureWorkerReady(effectiveModel);
      if (!ready || !workerProc) {
        return { success: false, text: '', durationMs: Date.now() - startTime, error: 'Whisper Worker indisponível' };
      }

      const rawJsonLine = await new Promise<string>((resolve) => {
        const timer = setTimeout(() => {
          pendingResolve = null;
          resetWorker();
          resolve('{"success":false,"error":"Timeout Whisper"}');
        }, 12000);

        pendingResolve = (line) => {
          clearTimeout(timer);
          resolve(line);
        };

        workerProc!.stdin.write(tempFile + '\n');
      });

      const parsed = JSON.parse(rawJsonLine);
      const durationMs = Date.now() - startTime;
      console.log(`🎙️ [Whisper RAM] (${durationMs}ms | Pico:${parsed.peak ?? 0}): "${parsed.text || ''}"`);
      return { ...parsed, durationMs };
    } catch (err: any) {
      return { success: false, text: '', durationMs: Date.now() - startTime, error: err?.message || 'Erro Whisper' };
    } finally {
      try { if (fs.existsSync(tempFile)) await fs.promises.unlink(tempFile); } catch {}
    }
  };

  const next = requestQueue.then(task, task);
  requestQueue = next.catch(() => {});
  return next;
}
