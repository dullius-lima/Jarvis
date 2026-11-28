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
  reference_embeddings?: number[][];
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

function getPythonBinary(): string {
  const venvPy = path.join(process.cwd(), 'whisper-env', 'bin', 'python3');
  return fs.existsSync(venvPy) ? venvPy : 'python3';
}

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
      reference_embeddings JSONB DEFAULT '[]'::jsonb,
      samples_count INT DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await query(`ALTER TABLE family_voice_profiles ADD COLUMN IF NOT EXISTS energy_avg NUMERIC(8, 5) DEFAULT 0.05000;`);
  await query(`ALTER TABLE family_voice_profiles ADD COLUMN IF NOT EXISTS spectral_vector JSONB DEFAULT '[]'::jsonb;`);
  await query(`ALTER TABLE family_voice_profiles ADD COLUMN IF NOT EXISTS neural_embedding JSONB DEFAULT '[]'::jsonb;`);
  await query(`ALTER TABLE family_voice_profiles ADD COLUMN IF NOT EXISTS reference_embeddings JSONB DEFAULT '[]'::jsonb;`);
  schemaReady = true;
}

function readPreferences(): Record<string, any> {
  const candidates = [
    path.join(process.cwd(), 'assets', 'user_preferences.json'),
    path.join(process.cwd(), 'user_preferences.json')
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
  return false;
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

function getProfileTemplates(profile: VoiceProfile): number[][] {
  const list: number[][] = [];
  if (Array.isArray(profile.reference_embeddings)) {
    for (const item of profile.reference_embeddings) {
      if (Array.isArray(item) && item.length >= 200) list.push(item);
    }
  }
  if (Array.isArray(profile.neural_embedding) && profile.neural_embedding.length >= 200) {
    list.push(profile.neural_embedding);
  }
  return list;
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
      const { stdout } = await execFileAsync(getPythonBinary(), [scriptPath, tmpFile], { timeout: 6000 });
      const parsed = JSON.parse(stdout.trim());
      if (parsed && parsed.ok && Array.isArray(parsed.embedding) && parsed.embedding.length >= 200) {
        return {
          pitchHz: Number(parsed.pitchHz) || hintPitch || 130,
          energy: Number(parsed.energy) || hintEnergy || 0.05,
          spectralVector: hintSpec.length === 16 ? hintSpec : parsed.embedding.slice(0, 16),
          embedding: parsed.embedding,
          activeFrames: Number(parsed.activeFrames) || 20,
          rawAudioBase64: audioBase64
        };
      }
    } catch (err: any) {
      console.warn('[VoiceBiometric] Falha extração neural:', err?.message || err);
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
    `SELECT id, name, role, pitch_hz, energy_avg, spectral_vector, neural_embedding, reference_embeddings, samples_count, updated_at
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
): Promise<{ name: string; role: string; pitchHz: number; samplesCount: number; has44D: boolean; hasNeural256D: boolean }> {
  await initVoiceBiometricsSchema();
  const cleanName = name.trim();
  const features = await extractAcousticFeatures(audioPayload);

  if (features.embedding.length < 200) {
    throw new Error('Fala muito curta ou baixa para gerar assinatura neural. Fale uma frase completa de 2 a 4 segundos.');
  }

  const existingRes = await query(
    'SELECT id, pitch_hz, energy_avg, neural_embedding, reference_embeddings, samples_count FROM family_voice_profiles WHERE LOWER(name) = LOWER($1)',
    [cleanName]
  );

  if (existingRes.rows && existingRes.rows.length > 0) {
    const row = existingRes.rows[0];
    const oldRefs: number[][] = Array.isArray(row.reference_embeddings)
      ? row.reference_embeddings.filter((v: any) => Array.isArray(v) && v.length === features.embedding.length)
      : [];
    const oldCount = oldRefs.length;
    const nextRefs = [...oldRefs, features.embedding].slice(-12);
    const newCount = nextRefs.length;

    const mergedPitch = oldCount > 0
      ? Number((((Number(row.pitch_hz) * oldCount) + features.pitchHz) / (oldCount + 1)).toFixed(2))
      : features.pitchHz;
    const mergedEnergy = oldCount > 0
      ? Number((((Number(row.energy_avg || 0.05) * oldCount) + features.energy) / (oldCount + 1)).toFixed(5))
      : features.energy;

    const meanVec = new Array(features.embedding.length).fill(0);
    for (const ref of nextRefs) {
      for (let i = 0; i < ref.length; i++) meanVec[i] += ref[i];
    }
    const centroid = l2Normalize(meanVec.map((v) => v / nextRefs.length));

    await query(
      `UPDATE family_voice_profiles
       SET role = $1, pitch_hz = $2, energy_avg = $3, spectral_vector = $4::jsonb, neural_embedding = $5::jsonb, reference_embeddings = $6::jsonb, samples_count = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8`,
      [role, mergedPitch, mergedEnergy, JSON.stringify(features.spectralVector), JSON.stringify(centroid), JSON.stringify(nextRefs), newCount, row.id]
    );

    return { name: cleanName, role, pitchHz: mergedPitch, samplesCount: newCount, has44D: true, hasNeural256D: true };
  }

  const refs = [features.embedding];
  await query(
    `INSERT INTO family_voice_profiles (name, role, pitch_hz, energy_avg, spectral_vector, neural_embedding, reference_embeddings, samples_count)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, 1)`,
    [
      cleanName,
      role,
      features.pitchHz,
      features.energy,
      JSON.stringify(features.spectralVector),
      JSON.stringify(features.embedding),
      JSON.stringify(refs)
    ]
  );

  return { name: cleanName, role, pitchHz: features.pitchHz, samplesCount: 1, has44D: true, hasNeural256D: true };
}

async function reinforceProfileContinuously(
  profile: VoiceProfile,
  incoming: { pitchHz: number; energy: number; embedding: number[]; activeFrames: number },
  bestSimilarity: number
): Promise<boolean> {
  if (!isContinuousLearningEnabled()) return false;
  if (incoming.embedding.length < 200 || incoming.activeFrames < 35) return false;
  // Só adiciona um novo template se for claramente a mesma pessoa (0.58..0.86) cobrindo uma nova distância/acústica
  if (bestSimilarity < 0.43 || bestSimilarity > 0.86) return false;

  const now = Date.now();
  const lastAt = lastAdaptationByProfile.get(profile.id) || 0;
  if (now - lastAt < 25000) return false;

  const existingRefs = getProfileTemplates(profile);
  const nextRefs = [...existingRefs, incoming.embedding].slice(-12);
  const meanVec = new Array(incoming.embedding.length).fill(0);
  for (const ref of nextRefs) {
    for (let i = 0; i < ref.length; i++) meanVec[i] += ref[i];
  }
  const centroid = l2Normalize(meanVec.map((v) => v / nextRefs.length));

  lastAdaptationByProfile.set(profile.id, now);
  await query(
    `UPDATE family_voice_profiles
     SET neural_embedding = $1::jsonb, reference_embeddings = $2::jsonb, samples_count = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $4`,
    [JSON.stringify(centroid), JSON.stringify(nextRefs), nextRefs.length, profile.id]
  );
  console.log(`🧬 [VoiceLearning] Novo template acústico (distância/ambiente) adicionado para ${profile.name} (${nextRefs.length}/12).`);
  return true;
}

export async function identifySpeaker(
  audioPayload?: string,
  opts?: { trustedAdminChannel?: boolean; hasWakeWord?: boolean }
): Promise<SpeakerIdentificationResult> {
  await initVoiceBiometricsSchema();
  const lockEnabled = isVoiceLockEnabled();
  const profilesRes = await query(
    'SELECT id, name, role, pitch_hz, spectral_vector, neural_embedding, reference_embeddings, samples_count FROM family_voice_profiles'
  );
  const profiles: VoiceProfile[] = profilesRes.rows || [];

  const calibratedProfiles = profiles.filter(
    (pr) => getProfileTemplates(pr).length > 0 && (Number(pr.samples_count) || 0) >= 3
  );
  const hasRegisteredProfiles = calibratedProfiles.length > 0;

  if (!hasRegisteredProfiles) {
    if (opts?.trustedAdminChannel && opts?.hasWakeWord && audioPayload && audioPayload.length > 1000) {
      const enrolled = await enrollSpeakerVoice('Matheus', audioPayload, 'admin').catch(() => null);
      if (enrolled) {
        console.log(`🎙️ [VoiceBiometric] Amostra nativa S25 gravada (${enrolled.samplesCount}/3) para Matheus.`);
        return {
          identified: true,
          name: 'Matheus',
          role: 'admin',
          confidence: 0.99,
          hasRegisteredProfiles: enrolled.samplesCount >= 3,
          lockEnabled,
          continuousLearned: true
        };
      }
    }
    return { identified: false, name: 'Desconhecido', role: 'guest', confidence: 0, hasRegisteredProfiles: false, lockEnabled };
  }

  if (!audioPayload || audioPayload.length < 350) {
    return { identified: false, name: 'Desconhecido', role: 'guest', confidence: 0, hasRegisteredProfiles: true, lockEnabled };
  }

  const incoming = await extractAcousticFeatures(audioPayload);
  if (incoming.embedding.length < 200 || incoming.activeFrames < 16) {
    return { identified: false, name: 'Desconhecido', role: 'guest', confidence: 0, hasRegisteredProfiles: true, lockEnabled };
  }

  let bestProfile: VoiceProfile | null = null;
  let bestScore = -1;
  let secondBestScore = -1;

  for (const profile of calibratedProfiles) {
    const templates = getProfileTemplates(profile);
    let profileMax = -1;
    for (const tpl of templates) {
      if (tpl.length !== incoming.embedding.length) continue;
      const sim = cosineSimilarity(incoming.embedding, tpl);
      if (sim > profileMax) profileMax = sim;
    }

    if (profileMax > bestScore) {
      secondBestScore = bestScore;
      bestScore = profileMax;
      bestProfile = profile;
    } else if (profileMax > secondBestScore) {
      secondBestScore = profileMax;
    }
  }

  // Comparação Multi-Template 256D:
  // Mesmo locutor (perto ou longe): 0.50 - 0.92 | TV / terceiros: 0.05 - 0.36
  const THRESHOLD = opts?.hasWakeWord ? 0.38 : 0.42;
  const MIN_MARGIN = calibratedProfiles.length > 1 ? 0.06 : 0;

  if (bestProfile && bestScore >= THRESHOLD && (bestScore - secondBestScore) >= MIN_MARGIN) {
    const continuousLearned = await reinforceProfileContinuously(bestProfile, incoming, bestScore).catch(() => false);
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
