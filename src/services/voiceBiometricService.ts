import { query } from '../database/databaseSetup.js';

export interface VoiceProfile {
  id?: number;
  name: string;
  role: 'admin' | 'family' | 'guest';
  pitch_hz: number;
  energy_pattern: number[];
  samples_count: number;
  created_at?: Date;
}

// 1. Garante a tabela de perfis de voz no PostgreSQL
export async function initVoiceBiometricsSchema(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS family_voice_profiles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      role VARCHAR(50) DEFAULT 'family',
      pitch_hz NUMERIC(8, 2) NOT NULL,
      energy_pattern JSONB DEFAULT '[]'::jsonb,
      samples_count INT DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// 2. Extrai características acústicas fundamentais do áudio Base64
export function extractAcousticFeatures(audioBase64: string): { pitchHz: number; energy: number } {
  try {
    const buffer = Buffer.from(audioBase64.replace(/^data:audio\/\w+;base64,/, ''), 'base64');
    let zeroCrossings = 0;
    let totalEnergy = 0;
    
    // Análise rápida nos bytes PCM do buffer
    const step = 2;
    for (let i = 0; i < buffer.length - step; i += step) {
      const val1 = buffer.readInt16LE(i);
      const val2 = buffer.readInt16LE(i + step);
      if ((val1 >= 0 && val2 < 0) || (val1 < 0 && val2 >= 0)) {
        zeroCrossings++;
      }
      totalEnergy += Math.abs(val1);
    }

    const estimatedPitch = Math.max(85, Math.min(300, (zeroCrossings / (buffer.length / 16000)) * 0.5));
    const normalizedEnergy = totalEnergy / (buffer.length / 2);

    return { pitchHz: estimatedPitch, energy: normalizedEnergy };
  } catch {
    return { pitchHz: 130.0, energy: 0.5 };
  }
}

// 3. Identifica qual membro da família está falando
export async function identifySpeaker(audioBase64?: string): Promise<{ identified: boolean; name: string; role: string }> {
  await initVoiceBiometricsSchema();
  if (!audioBase64 || audioBase64.length < 500) {
    return { identified: false, name: 'Desconhecido', role: 'guest' };
  }

  const { pitchHz } = extractAcousticFeatures(audioBase64);
  const res = await query('SELECT name, role, pitch_hz FROM family_voice_profiles');
  
  if (!res.rows || res.rows.length === 0) {
    return { identified: false, name: 'Desconhecido', role: 'guest' };
  }

  let bestMatch = null;
  let minDiff = 9999;

  for (const profile of res.rows) {
    const diff = Math.abs(Number(profile.pitch_hz) - pitchHz);
    if (diff < minDiff) {
      minDiff = diff;
      bestMatch = profile;
    }
  }

  // Tolerância de dispersão de pitch para reconhecimento seguro
  if (bestMatch && minDiff <= 35) {
    return { identified: true, name: bestMatch.name, role: bestMatch.role };
  }

  return { identified: false, name: 'Desconhecido', role: 'guest' };
}

// 4. Cadastra ou atualiza o perfil de voz de uma pessoa da família
export async function enrollSpeakerVoice(name: string, audioBase64: string, role: 'admin' | 'family' = 'family'): Promise<void> {
  await initVoiceBiometricsSchema();
  const { pitchHz } = extractAcousticFeatures(audioBase64);

  await query(`
    INSERT INTO family_voice_profiles (name, role, pitch_hz, samples_count)
    VALUES ($1, $2, $3, 1)
    ON CONFLICT (name) DO UPDATE SET
      pitch_hz = ((family_voice_profiles.pitch_hz * family_voice_profiles.samples_count) + EXCLUDED.pitch_hz) / (family_voice_profiles.samples_count + 1),
      samples_count = family_voice_profiles.samples_count + 1,
      updated_at = CURRENT_TIMESTAMP;
  `, [name.trim(), role, pitchHz]);
}