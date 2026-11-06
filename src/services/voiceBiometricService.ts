// src/services/voiceBiometricService.ts
import { pool } from '../config/database.js';

export interface VoiceProfile {
  id?: number;
  name: string;
  role: 'admin' | 'family' | 'guest';
  pitch_hz: number;
  energy_avg: number;
  samples_count: number;
}

// 1. Cria e alinha a tabela de perfis de voz da família no PostgreSQL
export async function initVoiceBiometricsSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS family_voice_profiles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      role VARCHAR(50) DEFAULT 'family',
      pitch_hz NUMERIC(8, 2) NOT NULL,
      energy_avg NUMERIC(8, 4) DEFAULT 0.05,
      samples_count INT DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// 2. Extrai frequência (Pitch Hz) e Energia do pacote enviado pelo frontend ou do buffer PCM
export function extractAcousticFeatures(audioPayload: string): { pitchHz: number; energy: number } {
  try {
    // Se o frontend enviou o cabeçalho de telemetria acústica: "PITCH:125.4|ENERGY:0.08|DATA:..."
    const pitchMatch = audioPayload.match(/PITCH:([0-9.]+)/);
    const energyMatch = audioPayload.match(/ENERGY:([0-9.]+)/);
    if (pitchMatch && pitchMatch[1]) {
      const p = parseFloat(pitchMatch[1]);
      const e = energyMatch && energyMatch[1] ? parseFloat(energyMatch[1]) : 0.05;
      if (p > 60 && p < 450) {
        return { pitchHz: p, energy: e };
      }
    }

    // Fallback: análise direta nos bytes do buffer de áudio
    const cleanB64 = audioPayload.replace(/^.*base64,/, '');
    const buffer = Buffer.from(cleanB64, 'base64');
    let zeroCrossings = 0;
    let sumAbs = 0;

    for (let i = 44; i < buffer.length - 2; i += 2) {
      const s1 = buffer.readInt16LE(i);
      const s2 = buffer.readInt16LE(i + 2);
      if ((s1 >= 0 && s2 < 0) || (s1 < 0 && s2 >= 0)) zeroCrossings++;
      sumAbs += Math.abs(s1);
    }

    const durationSec = Math.max(0.5, buffer.length / 32000);
    const estimatedPitch = Math.max(85, Math.min(340, (zeroCrossings / durationSec) * 0.45));
    const energy = Math.min(1, sumAbs / Math.max(1, (buffer.length / 2) * 32768));

    return { pitchHz: Number(estimatedPitch.toFixed(2)), energy: Number(energy.toFixed(4)) };
  } catch {
    return { pitchHz: 0, energy: 0 };
  }
}

// 3. Identifica quem da família está falando
export async function identifySpeaker(audioPayload?: string): Promise<{
  identified: boolean;
  ambiguous?: boolean;
  candidates?: string[];
  name: string;
  role: string;
  measuredPitchHz?: number;
}> {
  await initVoiceBiometricsSchema();

  if (!audioPayload || audioPayload.length < 15) {
    return { identified: false, name: 'Desconhecido', role: 'guest' };
  }

  const { pitchHz, energy } = extractAcousticFeatures(audioPayload);
  if (!pitchHz || pitchHz < 65) {
    return { identified: false, name: 'Desconhecido', role: 'guest' };
  }

  const res = await pool.query('SELECT name, role, pitch_hz, energy_avg FROM family_voice_profiles;');
  if (!res.rows || res.rows.length === 0) {
    return { identified: false, name: 'Desconhecido', role: 'guest', measuredPitchHz: pitchHz };
  }

  // Calcula a distância acústica para cada pessoa cadastrada na casa
  const ranked = res.rows
    .map((row: any) => {
      const pitchDiff = Math.abs(Number(row.pitch_hz) - pitchHz);
      const energyDiff = Math.abs(Number(row.energy_avg || 0.05) - energy) * 120;
      const score = pitchDiff + energyDiff;
      return { name: row.name, role: row.role, pitchDiff, score };
    })
    .sort((a, b) => a.score - b.score);

  const best = ranked[0];
  const second = ranked[1];

  // Se houver duas pessoas da família com tom de voz muito parecido (ex: esposa e mãe)
  if (best && second && best.pitchDiff <= 24 && Math.abs(best.score - second.score) < 8) {
    return {
      identified: false,
      ambiguous: true,
      candidates: [best.name, second.name],
      name: 'Desconhecido',
      role: 'family',
      measuredPitchHz: pitchHz
    };
  }

  // Se a diferença de frequência estiver dentro da margem daquela pessoa (<= 26 Hz)
  if (best && best.pitchDiff <= 26) {
    return {
      identified: true,
      name: best.name,
      role: best.role,
      measuredPitchHz: pitchHz
    };
  }

  return { identified: false, name: 'Desconhecido', role: 'guest', measuredPitchHz: pitchHz };
}

// 4. Salva ou refina a voz da pessoa da família no PostgreSQL
export async function enrollSpeakerVoice(
  name: string,
  audioPayload: string,
  role: 'admin' | 'family' = 'family'
): Promise<{ pitchHz: number; samplesCount: number }> {
  await initVoiceBiometricsSchema();
  const { pitchHz, energy } = extractAcousticFeatures(audioPayload);
  const validPitch = pitchHz > 65 ? pitchHz : 135.0;

  const result = await pool.query(
    `INSERT INTO family_voice_profiles (name, role, pitch_hz, energy_avg, samples_count)
     VALUES ($1, $2, $3, $4, 1)
     ON CONFLICT (name) DO UPDATE SET
       pitch_hz = ((family_voice_profiles.pitch_hz * family_voice_profiles.samples_count) + EXCLUDED.pitch_hz) / (family_voice_profiles.samples_count + 1),
       energy_avg = ((family_voice_profiles.energy_avg * family_voice_profiles.samples_count) + EXCLUDED.energy_avg) / (family_voice_profiles.samples_count + 1),
       samples_count = family_voice_profiles.samples_count + 1,
       updated_at = CURRENT_TIMESTAMP
     RETURNING pitch_hz, samples_count;`,
    [name.trim(), role, validPitch, energy || 0.05]
  );

  return {
    pitchHz: Number(result.rows[0]?.pitch_hz || validPitch),
    samplesCount: Number(result.rows[0]?.samples_count || 1)
  };
}