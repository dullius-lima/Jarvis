// src/services/voiceBiometricService.ts
import { pool } from '../config/database.js';

export interface VoiceProfile {
  id: number;
  name: string;
  role: 'admin' | 'family' | 'guest';
  pitch_hz: number;
  energy_avg: number;
  spectral_vector: number[];
  neural_embedding?: number[];
  samples_count: number;
  updated_at?: string;
}

let schemaInitialized = false;

export async function initVoiceBiometricsSchema(): Promise<void> {
  if (schemaInitialized) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS family_voice_profiles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        role VARCHAR(50) DEFAULT 'family',
        pitch_hz NUMERIC(8, 2) NOT NULL,
        energy_avg NUMERIC(8, 4) DEFAULT 0.05,
        spectral_vector JSONB DEFAULT '[]'::jsonb,
        neural_embedding JSONB DEFAULT '[]'::jsonb,
        samples_count INT DEFAULT 1,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      ALTER TABLE family_voice_profiles
      ADD COLUMN IF NOT EXISTS spectral_vector JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS neural_embedding JSONB DEFAULT '[]'::jsonb;
    `).catch(() => {});

    schemaInitialized = true;
  } catch {}
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecA.length !== vecB.length) return 0;
  let dot = 0, normA = 0, normB = 0;
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
    const dataParts = audioPayload.split('|DATA:');

    const pitchHz = pitchMatch?.[1] ? parseFloat(pitchMatch[1]) : 0;
    const energy = energyMatch?.[1] ? parseFloat(energyMatch[1]) : 0.05;
    const spectralVector = specMatch?.[1]
      ? specMatch[1].split(',').map((v) => parseFloat(v) || 0)
      : [];
    const rawAudioBase64 = dataParts.length > 1 ? dataParts[1] : '';

    if (pitchHz > 60 && pitchHz < 450) {
      return { pitchHz, energy, spectralVector, rawAudioBase64 };
    }

    const cleanB64 = audioPayload.replace(/^.*base64,/, '');
    return { pitchHz: 135, energy: 0.05, spectralVector: [], rawAudioBase64: cleanB64 };
  } catch {
    return { pitchHz: 0, energy: 0, spectralVector: [], rawAudioBase64: '' };
  }
}

export async function listVoiceProfiles(): Promise<VoiceProfile[]> {
  await initVoiceBiometricsSchema();
  const res = await pool.query(`
    SELECT id, name, role, pitch_hz, energy_avg, spectral_vector, neural_embedding, samples_count, updated_at
    FROM family_voice_profiles
    ORDER BY role ASC, name ASC;
  `);
  return res.rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    pitch_hz: Number(r.pitch_hz),
    energy_avg: Number(r.energy_avg || 0.05),
    spectral_vector: Array.isArray(r.spectral_vector) ? r.spectral_vector : [],
    neural_embedding: Array.isArray(r.neural_embedding) ? r.neural_embedding : [],
    samples_count: Number(r.samples_count || 1),
    updated_at: r.updated_at
  }));
}

export async function deleteVoiceProfile(id: number): Promise<boolean> {
  await initVoiceBiometricsSchema();
  const res = await pool.query('DELETE FROM family_voice_profiles WHERE id = $1;', [id]);
  return (res.rowCount || 0) > 0;
}

export async function enrollSpeakerVoice(
  name: string,
  audioPayload: string,
  role: 'admin' | 'family' | 'guest' = 'family'
): Promise<{ id: number; name: string; pitchHz: number; samplesCount: number; hasNeural256D: boolean }> {
  await initVoiceBiometricsSchema();
  const { pitchHz, energy, spectralVector } = extractAcousticFeatures(audioPayload);
  const validPitch = pitchHz > 65 ? pitchHz : 135.0;

  const cleanName = name.trim();
  const existing = await pool.query(
    'SELECT id, pitch_hz, energy_avg, spectral_vector, samples_count FROM family_voice_profiles WHERE LOWER(name) = LOWER($1) LIMIT 1;',
    [cleanName]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    const count = Number(row.samples_count) || 1;
    const newCount = count + 1;
    const updatedPitch = ((Number(row.pitch_hz) * count) + validPitch) / newCount;
    const updatedEnergy = ((Number(row.energy_avg || 0.05) * count) + (energy || 0.05)) / newCount;

    const oldSpec: number[] = Array.isArray(row.spectral_vector) ? row.spectral_vector.map(Number) : [];
    const mergedSpec =
      oldSpec.length === spectralVector.length && spectralVector.length > 0
        ? spectralVector.map((v, i) => Number((((oldSpec[i] * count) + v) / newCount).toFixed(4)))
        : spectralVector.length > 0 ? spectralVector : oldSpec;

    await pool.query(
      `UPDATE family_voice_profiles
       SET role = $1, pitch_hz = $2, energy_avg = $3, spectral_vector = $4::jsonb, samples_count = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6;`,
      [role, updatedPitch, updatedEnergy, JSON.stringify(mergedSpec), newCount, row.id]
    );

    return {
      id: row.id,
      name: cleanName,
      pitchHz: Number(updatedPitch.toFixed(2)),
      samplesCount: newCount,
      hasNeural256D: false
    };
  }

  const ins = await pool.query(
    `INSERT INTO family_voice_profiles (name, role, pitch_hz, energy_avg, spectral_vector, samples_count)
     VALUES ($1, $2, $3, $4, $5::jsonb, 1)
     RETURNING id;`,
    [cleanName, role, validPitch, energy || 0.05, JSON.stringify(spectralVector)]
  );

  return {
    id: ins.rows[0].id,
    name: cleanName,
    pitchHz: Number(validPitch.toFixed(2)),
    samplesCount: 1,
    hasNeural256D: false
  };
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

  const profiles = await listVoiceProfiles();
  if (profiles.length === 0) {
    return { identified: false, name: 'Desconhecido', role: 'guest', measuredPitchHz: pitchHz };
  }

  const ranked = profiles
    .map((prof) => {
      const pitchDiff = Math.abs(prof.pitch_hz - pitchHz);
      const pitchScore = Math.max(0, 1 - pitchDiff / 60);

      const hasSpec = spectralVector.length > 0 && prof.spectral_vector.length === spectralVector.length;
      const specScore = hasSpec ? cosineSimilarity(spectralVector, prof.spectral_vector) : pitchScore;

      const energyDiff = Math.abs(prof.energy_avg - energy);
      const energyScore = Math.max(0, 1 - energyDiff * 4);

      const confidence = hasSpec
        ? specScore * 0.55 + pitchScore * 0.35 + energyScore * 0.10
        : pitchScore * 0.85 + energyScore * 0.15;

      return {
        name: prof.name,
        role: prof.role,
        pitchDiff,
        confidence: Number(confidence.toFixed(3))
      };
    })
    .sort((a, b) => b.confidence - a.confidence);

  const best = ranked[0];
  const second = ranked[1];

  if (best && second && best.confidence >= 0.73 && Math.abs(best.confidence - second.confidence) < 0.035) {
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

  if (best && best.confidence >= 0.70 && best.pitchDiff <= 35) {
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
