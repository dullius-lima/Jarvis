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
  return /^gsk_[a-zA-Z0-9]{20,}/i.test(cleaned) ? cleaned : '';
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

  const cleanBase64 = audioBase64.replace(/^data:audio\/[a-zA-Z0-9+-]+;base64,/, '').trim();
  const audioBuffer = Buffer.from(cleanBase64, 'base64');

  if (audioBuffer.length < 400) {
    return { success: false, error: 'Buffer de áudio muito curto.' };
  }

  const tempInputPath = path.join(os.tmpdir(), `jarvis_voice_${Date.now()}.webm`);
  const tempWavPath = `${tempInputPath}.wav`;

  try {
    await fs.promises.writeFile(tempInputPath, audioBuffer);

    // Filtro de voz humana no FFmpeg: corta ruído abaixo de 85Hz e acima de 7500Hz e nivela a voz sem distorcer
    await new Promise<void>((resolve) => {
      const ff = spawn('ffmpeg', [
        '-y', '-i', tempInputPath,
        '-af', 'highpass=f=85,lowpass=f=7500,dynaudnorm',
        '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
        tempWavPath
      ]);
      ff.on('close', () => resolve());
      ff.on('error', () => resolve());
    });

    const finalAudioPath =
      fs.existsSync(tempWavPath) && fs.statSync(tempWavPath).size > 800
        ? tempWavPath
        : tempInputPath;

    // MOTOR 1: Groq Whisper Large V3 Turbo (~200ms)
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
          if (transcribed.length > 0) {
            try { if (fs.existsSync(tempInputPath)) await fs.promises.unlink(tempInputPath); } catch {}
            try { if (fs.existsSync(tempWavPath)) await fs.promises.unlink(tempWavPath); } catch {}
            console.log(`⚡ [Groq Whisper] (${Date.now() - startTime}ms): "${transcribed}"`);
            return {
              success: true,
              text: transcribed,
              engine: 'groq-whisper-large-v3-turbo',
              model: 'whisper-large-v3-turbo',
              durationMs: Date.now() - startTime
            };
          }
        }
      } catch (e: any) {
        console.warn('⚠️ [Groq Whisper Fallback]:', e?.message);
      }
    }

    // MOTOR 2: Faster-Whisper Local Python
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
        try { if (fs.existsSync(tempInputPath)) await fs.promises.unlink(tempInputPath); } catch {}
        try { if (fs.existsSync(tempWavPath)) await fs.promises.unlink(tempWavPath); } catch {}

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
        resolve({ success: false, error: err.message });
      });
    });
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
