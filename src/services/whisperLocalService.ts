// src/services/whisperLocalService.ts
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { emitBrainEvent } from './brainEventsService.js';

export interface WhisperTranscriptionResult {
  success: boolean;
  text?: string;
  engine?: string;
  model?: string;
  durationMs?: number;
  error?: string;
}

/**
 * Recebe um áudio em Base64 (ex: data:audio/webm;base64,...),
 * grava em arquivo temporário e executa o modelo Whisper Local 'small' via Python.
 */
export async function transcribeWithLocalWhisper(
  audioBase64: string,
  modelSize: string = process.env.WHISPER_MODEL_SIZE || 'small'
): Promise<WhisperTranscriptionResult> {
  const startTime = Date.now();

  // Emite pulso de Acetilcolina (Roxo) no Cérebro 3D indicando ativação do Córtex Auditivo
  emitBrainEvent({
    neurotransmitter: 'acetylcholine',
    sourceNode: 'auditory_cortex_whisper',
    targetNode: 'central_brain',
    intensity: 0.85,
    message: `Processando voz no Whisper Local (${modelSize})...`
  });

  // Remove cabeçalho data:audio/...;base64, se existir
  const cleanBase64 = audioBase64.replace(/^data:audio\/[a-zA-Z0-9+-]+;base64,/, '');
  const tempFilePath = path.join(os.tmpdir(), `jarvis_voice_${Date.now()}.webm`);

  try {
    const audioBuffer = Buffer.from(cleanBase64, 'base64');
    await fs.promises.writeFile(tempFilePath, audioBuffer);

    const scriptPath = path.resolve(process.cwd(), 'scripts', 'whisper_transcribe.py');
    const pythonCmd = process.env.PYTHON_BIN || 'python';

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
        // Remove o arquivo de áudio temporário imediatamente
        try {
          if (fs.existsSync(tempFilePath)) {
            await fs.promises.unlink(tempFilePath);
          }
        } catch {
          // Ignora erro de limpeza temporária
        }

        const durationMs = Date.now() - startTime;

        try {
          const parsed = JSON.parse(stdoutData.trim());
          if (parsed.success) {
            emitBrainEvent({
              neurotransmitter: 'dopamine',
              sourceNode: 'auditory_cortex_whisper',
              targetNode: 'central_brain',
              intensity: 0.9,
              message: `Voz transcrita em ${durationMs}ms: "${parsed.text}"`
            });
          }
          resolve({ ...parsed, durationMs });
        } catch {
          resolve({
            success: false,
            durationMs,
            error: `Falha ao ler saída do Whisper Python. Stderr: ${stderrData || stdoutData}`
          });
        }
      });

      pyProcess.on('error', (err) => {
        resolve({
          success: false,
          error: `Não foi possível iniciar o Python (${pythonCmd}): ${err.message}`
        });
      });
    });
  } catch (error: any) {
    return {
      success: false,
      error: `Erro interno no serviço Whisper Local: ${error.message}`
    };
  }
}