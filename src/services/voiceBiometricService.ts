// src/services/voiceBiometricService.ts
import { pool } from '../config/database.js';

export interface VoiceProfile {
  id?: number;
  name: string;
  role: 'admin' | 'family' | 'guest';
  pitch_hz: number;
  energy_avg: number;
  spectral_vector: number[];
  samples_count: number;
}

export async function initVoiceBiometricsSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS family_voice_profiles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      role VARCHAR(50) DEFAULT 'family',
      pitch_hz NUMERIC(8, 2) NOT NULL,
      energy_avg NUMERIC(8, 4) DEFAULT 0.05,
      spectral_vector JSONB DEFAULT '[]'::jsonb,
      samples_count INT DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Garante a coluna spectral_vector caso a tabela já exista da versão anterior
  await pool.query(`
    ALTER TABLE family_voice_profiles
    ADD COLUMN IF NOT EXISTS spectral_vector JSONB DEFAULT '[]'::jsonb;
  `).catch(() => {});
}

// Calcula a Similaridade de Cosseno (0.0 a 1.0) entre dois vetores de timbre vocal
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecA.length !== vecB.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function extractAcousticFeatures(audioPayload: string): {
  pitchHz: number;
  energy: number;
  spectralVector: number[];
  rawAudioBase64: string;
} {
  try {
    const pitchMatch = audioPayload.match(/PITCH:([0-9.]+)/);
    const energyMatch = audioPayload.match(/ENERGY:([0-9.]+)/);
    const specMatch = audioPayload.match(/SPEC:([0-9.,-]+)/);
    const dataMatch = audioPayload.split('|DATA:');

    const pitchHz = pitchMatch?.[1] ? parseFloat(pitchMatch[1]) : 0;
    const energy = energyMatch?.[1] ? parseFloat(energyMatch[1]) : 0.05;
    const spectralVector = specMatch?.[1]
      ? specMatch[1].split(',').map((v) => parseFloat(v) || 0)
      : [];
    const rawAudioBase64 = dataMatch.length > 1 ? dataMatch[1] : '';

    if (pitchHz > 60 && pitchHz < 450) {
      return { pitchHz, energy, spectralVector, rawAudioBase64 };
    }

    // Fallback: análise direta nos bytes PCM caso venha apenas Base64 puro
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
    const calcEnergy = Math.min(1, sumAbs / Math.max(1, (buffer.length / 2) * 32768));

    return {
      pitchHz: Number(estimatedPitch.toFixed(2)),
      energy: Number(calcEnergy.toFixed(4)),
      spectralVector: [],
      rawAudioBase64: cleanB64
    };
  } catch {
    return { pitchHz: 0, energy: 0, spectralVector: [], rawAudioBase64: '' };
  }
}

export async function identifySpeaker(audioPayload?: string): Promise<{
  identified: boolean;
  ambiguous?: boolean;
  candidates?: string[];
  confidence?: number;
  name: string;
  role: string;
  measuredPitchHz?: number;
}> {
  await initVoiceBiometricsSchema();

  if (!audioPayload || audioPayload.length < 10) {
    return { identified: false, name: 'Desconhecido', role: 'guest' };
  }

  const { pitchHz, energy, spectralVector } = extractAcousticFeatures(audioPayload);
  if (!pitchHz || pitchHz < 65) {
    return { identified: false, name: 'Desconhecido', role: 'guest' };
  }

  const res = await pool.query(
    'SELECT name, role, pitch_hz, energy_avg, spectral_vector, samples_count FROM family_voice_profiles;'
  );
  if (!res.rows || res.rows.length === 0) {
    return { identified: false, name: 'Desconhecido', role: 'guest', measuredPitchHz: pitchHz };
  }

  const ranked = res.rows
    .map((row: any) => {
      const dbPitch = Number(row.pitch_hz);
      const pitchDiff = Math.abs(dbPitch - pitchHz);
      const pitchScore = Math.max(0, 1 - pitchDiff / 60); // 1.0 se idêntico, 0 se > 60Hz de diferença

      let dbSpec: number[] = [];
      if (Array.isArray(row.spectral_vector)) {
        dbSpec = row.spectral_vector.map(Number);
      } else if (typeof row.spectral_vector === 'string') {
        try { dbSpec = JSON.parse(row.spectral_vector); } catch {}
      }

      const hasSpectral = spectralVector.length > 0 && dbSpec.length === spectralVector.length;
      const specSim = hasSpectral ? cosineSimilarity(spectralVector, dbSpec) : pitchScore;

      const energyDiff = Math.abs(Number(row.energy_avg || 0.05) - energy);
      const energyScore = Math.max(0, 1 - energyDiff * 4);

      // Peso: 55% Timbre Espectral (Formantes) + 35% Pitch (Hz) + 10% Energia
      const finalConfidence = hasSpectral
        ? specSim * 0.55 + pitchScore * 0.35 + energyScore * 0.10
        : pitchScore * 0.85 + energyScore * 0.15;

      return {
        name: row.name,
        role: row.role,
        pitchDiff,
        specSim,
        confidence: Number(finalConfidence.toFixed(3))
      };
    })
    .sort((a, b) => b.confidence - a.confidence);

  const best = ranked[0];
  const second = ranked[1];

  // Se duas pessoas ficaram muito próximas na confiança (ex.: duas vozes femininas ainda com poucas amostras)
  if (best && second && best.confidence >= 0.72 && Math.abs(best.confidence - second.confidence) < 0.04) {
    return {
      identified: false,
      ambiguous: true,
      candidates: [best.name, second.name],
      confidence: best.confidence,
      name: 'Desconhecido',
      role: 'family',
      measuredPitchHz: pitchHz
    };
  }

  // Limiar de reconhecimento confiável (>= 72% de compatibilidade vocal e diferença de Pitch aceitável)
  if (best && best.confidence >= 0.72 && best.pitchDiff <= 32) {
    return {
      identified: true,
      confidence: best.confidence,
      name: best.name,
      role: best.role,
      measuredPitchHz: pitchHz
    };
  }

  return { identified: false, name: 'Desconhecido', role: 'guest', measuredPitchHz: pitchHz };
}

export async function enrollSpeakerVoice(
  name: string,
  audioPayload: string,
  role: 'admin' | 'family' = 'family'
): Promise<{ pitchHz: number; samplesCount: number }> {
  await initVoiceBiometricsSchema();
  const { pitchHz, energy, spectralVector } = extractAcousticFeatures(audioPayload);
  const validPitch = pitchHz > 65 ? pitchHz : 135.0;

  const existing = await pool.query(
    'SELECT pitch_hz, energy_avg, spectral_vector, samples_count FROM family_voice_profiles WHERE LOWER(name) = LOWER($1) LIMIT 1;',
    [name.trim()]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    const count = Number(row.samples_count) || 1;
    const newCount = count + 1;
    const updatedPitch = ((Number(row.pitch_hz) * count) + validPitch) / newCount;
    const updatedEnergy = ((Number(row.energy_avg || 0.05) * count) + (energy || 0.05)) / newCount;

    let oldSpec: number[] = Array.isArray(row.spectral_vector) ? row.spectral_vector.map(Number) : [];
    let mergedSpec = spectralVector;

    if (oldSpec.length === spectralVector.length && spectralVector.length > 0) {
      mergedSpec = spectralVector.map((val, idx) => Number((((oldSpec[idx] * count) + val) / newCount).toFixed(4)));
    } else if (oldSpec.length > 0 && spectralVector.length === 0) {
      mergedSpec = oldSpec;
    }

    await pool.query(
      `UPDATE family_voice_profiles
       SET pitch_hz = $1, energy_avg = $2, spectral_vector = $3::jsonb, samples_count = $4, updated_at = CURRENT_TIMESTAMP
       WHERE LOWER(name) = LOWER($5);`,
      [updatedPitch, updatedEnergy, JSON.stringify(mergedSpec), newCount, name.trim()]
    );

    return { pitchHz: Number(updatedPitch.toFixed(2)), samplesCount: newCount };
  }

  const cleanName = name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase();
  await pool.query(
    `INSERT INTO family_voice_profiles (name, role, pitch_hz, energy_avg, spectral_vector, samples_count)
     VALUES ($1, $2, $3, $4, $5::jsonb, 1);`,
    [cleanName, role, validPitch, energy || 0.05, JSON.stringify(spectralVector)]
  );

  return { pitchHz: Number(validPitch.toFixed(2)), samplesCount: 1 };
}
