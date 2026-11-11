// src/services/whisperLocalService.ts
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pool } from '../config/database.js';

export interface WhisperTranscriptionResult {
  success: boolean;
  text?: string;
  engine?: string;
  model?: string;
  durationMs?: number;
  error?: string;
}

function cleanGroqKey(raw: any): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw.replace(/[•*]/g, '').replace(/^Bearer\s+/i, '').trim();
  // Aceita letras, números, sublinhados e hífens das chaves reais da Groq
  return /^gsk_[a-zA-Z0-9_\-]{20,}/i.test(cleaned) ? cleaned : '';
}

async function getGroqApiKey(): Promise<string> {
  const envKey = cleanGroqKey(process.env.GROQ_API_KEY) || cleanGroqKey(process.env.LLM_API_KEY);
  if (envKey) return envKey;

  try {
    const res = await pool.query("SELECT value FROM system_configs;");
    for (const row of res.rows) {
      const val = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      const candidates = [
        val?.saved_keys?.groq,
        val?.api_key,
        val?.groq_api_key,
        ...(val?.saved_keys ? Object.values(val.saved_keys) : [])
      ];
      for (const c of candidates) {
        const k = cleanGroqKey(c);
        if (k) return k;
      }
    }
  } catch {}

  try {
    const agRes = await pool.query("SELECT api_key FROM ai_agents WHERE api_key IS NOT NULL;");
    for (const row of agRes.rows) {
      const k = cleanGroqKey(row.api_key);
      if (k) return k;
    }
  } catch {}

  return '';
}

export async function transcribeWithLocalWhisper(
  audioBase64: string,
  modelSize: string = process.env.WHISPER_MODEL_SIZE || 'base'
): Promise<WhisperTranscriptionResult> {
  const startTime = Date.now();

  if (!audioBase64 || audioBase64.length < 100) {
    return { success: false, error: 'Áudio Base64 vazio ou insuficiente.' };
  }

  // Extrai apenas a base64 caso venha combinada com metadados biométricos
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

  if (audioBuffer.length < 400) {
    return { success: false, error: 'Buffer de áudio muito curto.' };
  }

  // Verifica se o áudio já é um WAV válido (cabeçalho RIFF)
  const isWavInput = audioBuffer.length >= 4 && audioBuffer.toString('utf8', 0, 4) === 'RIFF';
  const ext = isWavInput ? '.wav' : '.webm';
  const tempInputPath = path.join(os.tmpdir(), `jarvis_voice_${Date.now()}${ext}`);
  const tempConvertedWavPath = `${tempInputPath}.converted.wav`;

  const cleanupFiles = async () => {
    try { if (fs.existsSync(tempInputPath)) await fs.promises.unlink(tempInputPath); } catch {}
    try { if (fs.existsSync(tempConvertedWavPath)) await fs.promises.unlink(tempConvertedWavPath); } catch {}
  };

  try {
    await fs.promises.writeFile(tempInputPath, audioBuffer);

    let finalAudioPath = tempInputPath;

    // Se NÃO for WAV nativo (ex: WebM legado), converte via FFmpeg para WAV 16kHz
    if (!isWavInput) {
      await new Promise<void>((resolve) => {
        const ff = spawn('ffmpeg', [
          '-y', '-i', tempInputPath,
          '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
          tempConvertedWavPath
        ]);
        ff.on('close', () => resolve());
        ff.on('error', () => resolve());
      });

      if (fs.existsSync(tempConvertedWavPath) && fs.statSync(tempConvertedWavPath).size > 600) {
        finalAudioPath = tempConvertedWavPath;
      }
    }

    // =========================================================================
    // MOTOR 1: Groq Whisper Large V3 Turbo (~200ms)
    // =========================================================================
    const groqKey = await getGroqApiKey();
    if (groqKey) {
      try {
        const fileBytes = await fs.promises.readFile(finalAudioPath);
        const formData = new FormData();
        const isWav = finalAudioPath.endsWith('.wav');
        const blob = new Blob([fileBytes], { type: isWav ? 'audio/wav' : 'audio/webm' });
        formData.append('file', blob, isWav ? 'speech.wav' : 'speech.webm');
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('language', 'pt');
        formData.append('prompt', 'Jarvis. Oi Jarvis. Olá Jarvis. Comandos de voz em português.');
        formData.append('response_format', 'json');
        formData.append('temperature', '0.0');

        const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${groqKey}` },
          body: formData
        });

        if (resp.ok) {
          const data: any = await resp.json();
          const transcribed = (data?.text || '').trim();
          await cleanupFiles();

          if (transcribed.length > 0) {
            console.log(`⚡ [Groq Whisper Turbo] (${Date.now() - startTime}ms): "${transcribed}"`);
            return {
              success: true,
              text: transcribed,
              engine: 'groq-whisper-large-v3-turbo',
              model: 'whisper-large-v3-turbo',
              durationMs: Date.now() - startTime
            };
          }
        } else {
          const errBody = await resp.text().catch(() => '');
          console.warn(`⚠️ [Groq Whisper HTTP ${resp.status}]:`, errBody);
        }
      } catch (e: any) {
        console.warn('⚠️ [Groq Whisper Erro]:', e?.message);
      }
    }

    // =========================================================================
    // MOTOR 2: Fallback Faster-Whisper Local Python
    // =========================================================================
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'whisper_transcribe.py');
    const venvPython = path.resolve(process.cwd(), 'whisper-env', 'bin', 'python3');
    const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python3';

    return await new Promise<WhisperTranscriptionResult>((resolve) => {
      const pyProcess = spawn(pythonCmd, [scriptPath, finalAudioPath, modelSize], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdoutData = '';
      let stderrData = '';

      pyProcess.stdout.on('data', (chunk) => { stdoutData += chunk.toString('utf8'); });
      pyProcess.stderr.on('data', (chunk) => { stderrData += chunk.toString('utf8'); });

      pyProcess.on('close', async () => {
        await cleanupFiles();
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

      pyProcess.on('error', async (err) => {
        await cleanupFiles();
        resolve({ success: false, error: err.message });
      });
    });
  } catch (error: any) {
    await cleanupFiles();
    return { success: false, error: error.message };
  }
}
