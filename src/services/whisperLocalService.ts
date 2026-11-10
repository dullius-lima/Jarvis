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

async function getGroqApiKey(): Promise<string> {
  try {
    const res = await pool.query(
      "SELECT value FROM system_configs WHERE key IN ('brain_llm_config', 'brain_config') LIMIT 1;"
    );
    if (res.rows.length > 0) {
      const val = typeof res.rows[0].value === 'string' ? JSON.parse(res.rows[0].value) : res.rows[0].value;
      const key = val?.saved_keys?.groq || val?.api_key || '';
      if (key && key.startsWith('gsk_')) return key.trim();
    }
  } catch {}
  return (process.env.GROQ_API_KEY || process.env.LLM_API_KEY || '').trim();
}

export async function transcribeWithLocalWhisper(
  audioBase64: string,
  modelSize: string = process.env.WHISPER_MODEL_SIZE || 'base'
): Promise<WhisperTranscriptionResult> {
  const startTime = Date.now();

  if (!audioBase64 || audioBase64.length < 100) {
    return { success: false, error: 'Áudio Base64 vazio ou muito curto.' };
  }

  const cleanBase64 = audioBase64.replace(/^data:audio\/[a-zA-Z0-9+-]+;base64,/, '').trim();
  const audioBuffer = Buffer.from(cleanBase64, 'base64');

  if (audioBuffer.length < 400) {
    return { success: false, error: 'Buffer de áudio sem conteúdo.' };
  }

  const tempWebmPath = path.join(os.tmpdir(), `jarvis_voice_${Date.now()}.webm`);
  const tempWavPath = `${tempWebmPath}.wav`;

  try {
    await fs.promises.writeFile(tempWebmPath, audioBuffer);

    // Converte com FFmpeg para WAV 16kHz Mono limpo (compatível com Android, iOS e PC)
    await new Promise<void>((resolve) => {
      const ff = spawn('ffmpeg', [
        '-y', '-i', tempWebmPath,
        '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
        tempWavPath
      ]);
      ff.on('close', () => resolve());
      ff.on('error', () => resolve());
    });

    const finalAudioPath = fs.existsSync(tempWavPath) && fs.statSync(tempWavPath).size > 500
      ? tempWavPath
      : tempWebmPath;

    // =========================================================================
    // MOTOR 1 (ULTRA-RÁPIDO E PRECISO): Groq Whisper-Large-V3-Turbo (200ms)
    // =========================================================================
    const groqKey = await getGroqApiKey();
    if (groqKey && groqKey.startsWith('gsk_')) {
      try {
        const fileBytes = await fs.promises.readFile(finalAudioPath);
        const formData = new FormData();
        const blob = new Blob([fileBytes], {
          type: finalAudioPath.endsWith('.wav') ? 'audio/wav' : 'audio/webm'
        });
        formData.append('file', blob, finalAudioPath.endsWith('.wav') ? 'speech.wav' : 'speech.webm');
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('language', 'pt');
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
            try { if (fs.existsSync(tempWebmPath)) await fs.promises.unlink(tempWebmPath); } catch {}
            try { if (fs.existsSync(tempWavPath)) await fs.promises.unlink(tempWavPath); } catch {}
            console.log(`⚡ [Groq Whisper Turbo] (${Date.now() - startTime}ms): "${transcribed}"`);
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
        console.warn('⚠️ [Groq Whisper Fallback para Python Local]:', e?.message);
      }
    }

    // =========================================================================
    // MOTOR 2 (OFFLINE FALLBACK): Faster-Whisper Python na VM
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
        try { if (fs.existsSync(tempWebmPath)) await fs.promises.unlink(tempWebmPath); } catch {}
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
