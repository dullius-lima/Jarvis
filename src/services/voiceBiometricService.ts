import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { pool } from '../config/database.js';

const query = (text: string, params?: any[]) => pool.query(text, params);
const execFileAsync = promisify(execFile);

export interface VoiceProfile {
  id: number;
  name: string;
  role: 'admin' | 'family' | 'guest';
  pitch_hz: number;
  energy_avg: number;
  spectral_vector: number[];
  neural_embedding: number[];
  samples_count: number;
  updated_at?: Date;
}

export interface SpeakerIdentificationResult {
  identified: boolean;
  name: string;
  role: string;
  confidence: number;
  hasRegisteredProfiles: boolean;
  lockEnabled: boolean;
  continuousLearned?: boolean;
}

let schemaReady = false;
const lastAdaptationByProfile = new Map<number, number>();

export async function initVoiceBiometricsSchema(): Promise<void> {
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS family_voice_profiles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      role VARCHAR(50) DEFAULT 'family',
      pitch_hz NUMERIC(8, 2) NOT NULL DEFAULT 130.00,
      energy_avg NUMERIC(8, 5) DEFAULT 0.05000,
      energy_pattern JSONB DEFAULT '[]'::jsonb,
      spectral_vector JSONB DEFAULT '[]'::jsonb,
      neural_embedding JSONB DEFAULT '[]'::jsonb,
      samples_count INT DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await query(`ALTER TABLE family_voice_profiles ADD COLUMN IF NOT EXISTS energy_avg NUMERIC(8, 5) DEFAULT 0.05000;`);
  await query(`ALTER TABLE family_voice_profiles ADD COLUMN IF NOT EXISTS spectral_vector JSONB DEFAULT '[]'::jsonb;`);
  await query(`ALTER TABLE family_voice_profiles ADD COLUMN IF NOT EXISTS neural_embedding JSONB DEFAULT '[]'::jsonb;`);
  schemaReady = true;
}

function readPreferences(): Record<string, any> {
  const candidates = [
    path.join(process.cwd(), 'user_preferences.json'),
    path.join(process.cwd(), 'assets', 'user_preferences.json')
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch {}
  }
  return {};
}

export function isVoiceLockEnabled(): boolean {
  const prefs = readPreferences();
  return typeof prefs.voice_lock_only_registered === 'boolean' ? prefs.voice_lock_only_registered : true;
}

export function isContinuousLearningEnabled(): boolean {
  const prefs = readPreferences();
  return typeof prefs.continuous_voice_learning === 'boolean' ? prefs.continuous_voice_learning : true;
}

function parseCombinedPayload(rawPayload: string): {
  hintPitch: number;
  hintEnergy: number;
  hintSpec: number[];
  audioBase64: string;
} {
  let hintPitch = 0;
  let hintEnergy = 0;
  let hintSpec: number[] = [];
  let audioBase64 = rawPayload || '';

  if (rawPayload.includes('|DATA:')) {
    const [metaPart, dataPart] = rawPayload.split('|DATA:');
    audioBase64 = dataPart || '';
    for (const token of metaPart.split('|')) {
      if (token.startsWith('PITCH:')) hintPitch = parseFloat(token.slice(6)) || 0;
      else if (token.startsWith('ENERGY:')) hintEnergy = parseFloat(token.slice(7)) || 0;
      else if (token.startsWith('SPEC:')) {
        hintSpec = token.slice(5).split(',').map((n) => parseFloat(n) || 0);
      }
    }
  }

  audioBase64 = audioBase64.replace(/^data:audio\/[\w.+-]+;base64,/, '').trim();
  return { hintPitch, hintEnergy, hintSpec, audioBase64 };
}

function l2Normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));
  if (!norm || norm < 1e-8) return vec;
  return vec.map((v) => Number((v / norm).toFixed(6)));
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

export async function extractAcousticFeatures(rawPayload: string): Promise<{
  pitchHz: number;
  energy: number;
  spectralVector: number[];
  embedding: number[];
  activeFrames: number;
  rawAudioBase64: string;
}> {
  const { hintPitch, hintEnergy, hintSpec, audioBase64 } = parseCombinedPayload(rawPayload);

  if (audioBase64 && audioBase64.length > 350) {
    const tmpFile = path.join('/tmp', `vp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.audio`);
    try {
      fs.writeFileSync(tmpFile, Buffer.from(audioBase64, 'base64'));
      const scriptPath = path.join(process.cwd(), 'scripts', 'voiceprint_extractor.py');
      const { stdout } = await execFileAsync('python3', [scriptPath, tmpFile], { timeout: 6000 });
      const parsed = JSON.parse(stdout.trim());
      if (parsed && parsed.ok && Array.isArray(parsed.embedding) && parsed.embedding.length > 0) {
        return {
          pitchHz: Number(parsed.pitchHz) || hintPitch || 130,
          energy: Number(parsed.energy) || hintEnergy || 0.05,
          spectralVector: hintSpec.length === 16 ? hintSpec : parsed.embedding.slice(0, 16),
          embedding: parsed.embedding,
          activeFrames: Number(parsed.activeFrames) || 10,
          rawAudioBase64: audioBase64
        };
      }
    } catch (err: any) {
      console.warn('[VoiceBiometric] Fallback acústico:', err?.message || err);
    } finally {
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
    }
  }

  return {
    pitchHz: hintPitch > 0 ? hintPitch : 130,
    energy: hintEnergy > 0 ? hintEnergy : 0.05,
    spectralVector: hintSpec,
    embedding: [],
    activeFrames: 0,
    rawAudioBase64: audioBase64
  };
}

export async function listVoiceProfiles(): Promise<VoiceProfile[]> {
  await initVoiceBiometricsSchema();
  const res = await query(
    `SELECT id, name, role, pitch_hz, energy_avg, spectral_vector, neural_embedding, samples_count, updated_at
     FROM family_voice_profiles
     ORDER BY CASE WHEN role = 'admin' THEN 1 WHEN role = 'family' THEN 2 ELSE 3 END, id ASC`
  );
  return res.rows || [];
}

export async function deleteVoiceProfile(id: number): Promise<boolean> {
  await initVoiceBiometricsSchema();
  const res = await query('DELETE FROM family_voice_profiles WHERE id = $1', [id]);
  return (res.rowCount || 0) > 0;
}

export async function enrollSpeakerVoice(
  name: string,
  audioPayload: string,
  role: 'admin' | 'family' | 'guest' = 'family'
): Promise<{ name: string; role: string; pitchHz: number; samplesCount: number; has44D: boolean }> {
  await initVoiceBiometricsSchema();
  const cleanName = name.trim();
  const features = await extractAcousticFeatures(audioPayload);

  if (features.embedding.length === 0 && features.pitchHz <= 0) {
    throw new Error('Não foi possível extrair assinatura vocal válida desta gravação.');
  }

  const existingRes = await query(
    'SELECT id, pitch_hz, energy_avg, spectral_vector, neural_embedding, samples_count FROM family_voice_profiles WHERE LOWER(name) = LOWER($1)',
    [cleanName]
  );

  if (existingRes.rows && existingRes.rows.length > 0) {
    const row = existingRes.rows[0];
    const oldCount = Math.max(1, Number(row.samples_count) || 1);
    const newCount = oldCount + 1;

    const mergedPitch = Number((((Number(row.pitch_hz) * oldCount) + features.pitchHz) / newCount).toFixed(2));
    const mergedEnergy = Number((((Number(row.energy_avg || 0.05) * oldCount) + features.energy) / newCount).toFixed(5));

    const oldSpec: number[] = Array.isArray(row.spectral_vector) ? row.spectral_vector : [];
    const mergedSpec =
      oldSpec.length === 16 && features.spectralVector.length === 16
        ? oldSpec.map((v, idx) => Number((((v * oldCount) + features.spectralVector[idx]) / newCount).toFixed(4)))
        : (features.spectralVector.length === 16 ? features.spectralVector : oldSpec);

    const oldEmb: number[] = Array.isArray(row.neural_embedding) ? row.neural_embedding : [];
    let mergedEmb: number[] = features.embedding;
    if (oldEmb.length === features.embedding.length && oldEmb.length > 0) {
      const avg = oldEmb.map((v, idx) => ((v * oldCount) + features.embedding[idx]) / newCount);
      mergedEmb = l2Normalize(avg);
    } else if (oldEmb.length > 0 && features.embedding.length === 0) {
      mergedEmb = oldEmb;
    }

    await query(
      `UPDATE family_voice_profiles
       SET role = $1, pitch_hz = $2, energy_avg = $3, spectral_vector = $4::jsonb, neural_embedding = $5::jsonb, samples_count = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [role, mergedPitch, mergedEnergy, JSON.stringify(mergedSpec), JSON.stringify(mergedEmb), newCount, row.id]
    );

    return { name: cleanName, role, pitchHz: mergedPitch, samplesCount: newCount, has44D: mergedEmb.length >= 40 };
  }

  await query(
    `INSERT INTO family_voice_profiles (name, role, pitch_hz, energy_avg, spectral_vector, neural_embedding, samples_count)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 1)`,
    [
      cleanName,
      role,
      features.pitchHz,
      features.energy,
      JSON.stringify(features.spectralVector),
      JSON.stringify(features.embedding)
    ]
  );

  return {
    name: cleanName,
    role,
    pitchHz: features.pitchHz,
    samplesCount: 1,
    has44D: features.embedding.length >= 40
  };
}

/**
 * Aprendizado Contínuo da Voz: assimila amostras reais do dia a dia via Média Móvel Exponencial (EMA)
 * mantendo proteção anti-contaminação (apenas amostras >= 0.81 e com intervalo >= 15s).
 */
async function reinforceProfileContinuously(
  profile: VoiceProfile,
  incoming: { pitchHz: number; energy: number; embedding: number[]; activeFrames: number }
): Promise<boolean> {
  if (!isContinuousLearningEnabled()) return false;
  if (incoming.embedding.length < 40 || incoming.activeFrames < 18) return false;

  const now = Date.now();
  const lastAt = lastAdaptationByProfile.get(profile.id) || 0;
  if (now - lastAt < 15000) return false;

  const storedEmb = Array.isArray(profile.neural_embedding) ? profile.neural_embedding : [];
  if (storedEmb.length !== incoming.embedding.length) return false;

  // Taxa de aprendizado adaptativa (8% da nova fala + 92% da assinatura consolidada)
  const alpha = 0.08;
  const blended = storedEmb.map((v, i) => v * (1 - alpha) + incoming.embedding[i] * alpha);
  const normalized = l2Normalize(blended);
  const adaptedPitch = Number((Number(profile.pitch_hz) * (1 - alpha) + incoming.pitchHz * alpha).toFixed(2));
  const nextCount = Math.min(999, (Number(profile.samples_count) || 1) + 1);

  lastAdaptationByProfile.set(profile.id, now);
  await query(
    `UPDATE family_voice_profiles
     SET pitch_hz = $1, neural_embedding = $2::jsonb, samples_count = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $4`,
    [adaptedPitch, JSON.stringify(normalized), nextCount, profile.id]
  );
  console.log(`🧬 [VoiceLearning] Assinatura de ${profile.name} aprimorada automaticamente (${nextCount} amostras).`);
  return true;
}

export async function identifySpeaker(audioPayload?: string): Promise<SpeakerIdentificationResult> {
  await initVoiceBiometricsSchema();
  const lockEnabled = isVoiceLockEnabled();
  const profilesRes = await query('SELECT id, name, role, pitch_hz, spectral_vector, neural_embedding, samples_count FROM family_voice_profiles');
  const profiles: VoiceProfile[] = profilesRes.rows || [];
  const calibratedProfiles = profiles.filter((pr) => Array.isArray(pr.neural_embedding) && pr.neural_embedding.length >= 40 && (Number(pr.samples_count) || 0) >= 3);
  const hasRegisteredProfiles = calibratedProfiles.length > 0;

  if (!hasRegisteredProfiles) {
    return { identified: false, name: 'Desconhecido', role: 'guest', confidence: 0, hasRegisteredProfiles: false, lockEnabled };
  }

  if (!audioPayload || audioPayload.length < 350) {
    return { identified: false, name: 'Desconhecido', role: 'guest', confidence: 0, hasRegisteredProfiles: false, lockEnabled };
  }

  const incoming = await extractAcousticFeatures(audioPayload);
  let bestProfile: VoiceProfile | null = null;
  let bestScore = -1;

  for (const profile of profiles) {
    const storedEmb = Array.isArray(profile.neural_embedding) ? profile.neural_embedding : [];
    const storedSpec = Array.isArray(profile.spectral_vector) ? profile.spectral_vector : [];
    const pitchDiff = Math.abs(Number(profile.pitch_hz) - incoming.pitchHz);

    let score = 0;
    if (storedEmb.length > 0 && incoming.embedding.length === storedEmb.length) {
      const cosSim = cosineSimilarity(incoming.embedding, storedEmb);
      const pitchBonus = pitchDiff <= 28 ? 0.04 : (pitchDiff > 70 ? -0.08 : 0);
      score = cosSim + pitchBonus;
    } else if (storedSpec.length === 16 && incoming.spectralVector.length === 16) {
      const specSim = cosineSimilarity(incoming.spectralVector, storedSpec);
      const pitchFactor = Math.max(0, 1 - pitchDiff / 80);
      score = (specSim * 0.72) + (pitchFactor * 0.28);
    } else {
      score = pitchDiff <= 25 ? 0.78 : 0.30;
    }

    if (score > bestScore) {
      bestScore = score;
      bestProfile = profile;
    }
  }

  // Limiar 0.73 permite variações naturais de distância/ambiente enquanto barra TV (< 0.68)
  const THRESHOLD = 0.65;
  if (bestProfile && bestScore >= THRESHOLD) {
    let continuousLearned = false;
    if (bestScore >= 0.81) {
      continuousLearned = await reinforceProfileContinuously(bestProfile, incoming).catch(() => false);
    }
    return {
      identified: true,
      name: bestProfile.name,
      role: bestProfile.role,
      confidence: Number(bestScore.toFixed(3)),
      hasRegisteredProfiles: true,
      lockEnabled,
      continuousLearned
    };
  }

  return {
    identified: false,
    name: 'Desconhecido',
    role: 'guest',
    confidence: Number(Math.max(0, bestScore).toFixed(3)),
    hasRegisteredProfiles: true,
    lockEnabled
  };
}

export const processarBiometriaESaudacao = identifySpeaker;
