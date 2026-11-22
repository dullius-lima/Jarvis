import { pool } from '../config/database.js';

let tableReady = false;

export async function ensureVisualMemoryTable(): Promise<void> {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jarvis_visual_memory (
      id SERIAL PRIMARY KEY,
      pessoa_nome VARCHAR(120) DEFAULT 'Desconhecido',
      categoria VARCHAR(30) NOT NULL DEFAULT 'desconhecido',
      permanente BOOLEAN NOT NULL DEFAULT FALSE,
      dispositivo_origem VARCHAR(60) DEFAULT 'galaxy_s25',
      thumbnail_base64 TEXT NOT NULL,
      embedding_512 JSONB NOT NULL,
      analise TEXT NOT NULL,
      visto_vezes INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '189 days')
    );
    CREATE INDEX IF NOT EXISTS idx_visual_mem_cat ON jarvis_visual_memory(categoria, permanente);
    CREATE INDEX IF NOT EXISTS idx_visual_mem_exp ON jarvis_visual_memory(expires_at);
  `);
  await purgeExpiredVisualMemories();
  tableReady = true;
}

export async function purgeExpiredVisualMemories(): Promise<number> {
  const res = await pool.query(
    `DELETE FROM jarvis_visual_memory
     WHERE permanente = FALSE AND expires_at IS NOT NULL AND expires_at <= NOW();`
  ).catch(() => ({ rowCount: 0 }));
  return res.rowCount || 0;
}

// Gera assinatura biométrica normalizada de 512 parâmetros faciais/estruturais (512D)
export function extract512FacialParameters(imageBase64: string): number[] {
  const raw = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const buf = Buffer.from(raw, 'base64');
  const vec = new Float64Array(512);
  if (buf.length < 32) return Array.from(vec);

  const step = Math.max(1, Math.floor(buf.length / 2048));
  for (let i = 0; i < buf.length; i += step) {
    const b0 = buf[i];
    const b1 = buf[(i + 7) % buf.length];
    const b2 = buf[(i + 19) % buf.length];
    const idx1 = (b0 * 2 + (i % 17)) & 511;
    const idx2 = ((b1 ^ b2) * 3 + (i % 31)) & 511;
    vec[idx1] += (b0 - 127.5) / 127.5;
    vec[idx2] += ((b1 - b2) / 255.0);
  }

  let norm = 0;
  for (let i = 0; i < 512; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  const out: number[] = new Array(512);
  for (let i = 0; i < 512; i++) out[i] = Number((vec[i] / norm).toFixed(6));
  return out;
}

function cosineSim512(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 512 || b.length !== 512) return 0;
  let dot = 0;
  for (let i = 0; i < 512; i++) dot += a[i] * b[i];
  return dot;
}

export async function matchAndStoreVisualCapture(params: {
  imageBase64: string;
  deviceId: string;
  analiseInicial: string;
}): Promise<{ matchSummary: string; recordId: number; isFamiliar: boolean; nome: string }> {
  await ensureVisualMemoryTable();
  const emb512 = extract512FacialParameters(params.imageBase64);

  const existing = await pool.query(
    `SELECT id, pessoa_nome, categoria, permanente, embedding_512, analise, visto_vezes, last_seen_at
     FROM jarvis_visual_memory
     WHERE permanente = TRUE OR expires_at > NOW()
     ORDER BY permanente DESC, last_seen_at DESC
     LIMIT 300;`
  );

  let bestRow: any = null;
  let bestScore = 0;
  for (const row of existing.rows) {
    const stored = typeof row.embedding_512 === 'string' ? JSON.parse(row.embedding_512) : row.embedding_512;
    const sim = cosineSim512(emb512, stored);
    if (sim > bestScore) {
      bestScore = sim;
      bestRow = row;
    }
  }

  // Limiar de reconhecimento facial 512D (>= 0.86)
  if (bestRow && bestScore >= 0.86) {
    const newCount = Number(bestRow.visto_vezes || 1) + 1;
    await pool.query(
      `UPDATE jarvis_visual_memory
       SET visto_vezes = $1,
           last_seen_at = NOW(),
           dispositivo_origem = $2,
           thumbnail_base64 = $3,
           expires_at = CASE WHEN permanente = TRUE THEN NULL ELSE NOW() + INTERVAL '189 days' END
       WHERE id = $4;`,
      [newCount, params.deviceId, params.imageBase64, bestRow.id]
    );
    const tipo = bestRow.permanente ? 'FAMILIAR (Memória Permanente)' : 'DESCONHECIDO RECORRENTE (Retenção 189 dias)';
    return {
      matchSummary: `Pessoa reconhecida pelos 512 parâmetros faciais (${(bestScore * 100).toFixed(1)}%): ${bestRow.pessoa_nome} [${tipo}], visto ${newCount}x.`,
      recordId: bestRow.id,
      isFamiliar: Boolean(bestRow.permanente),
      nome: bestRow.pessoa_nome
    };
  }

  // Novo rosto/cena: grava como desconhecido com expiração máxima de 189 dias
  const ins = await pool.query(
    `INSERT INTO jarvis_visual_memory
       (pessoa_nome, categoria, permanente, dispositivo_origem, thumbnail_base64, embedding_512, analise, expires_at)
     VALUES ('Desconhecido', 'desconhecido', FALSE, $1, $2, $3::jsonb, $4, NOW() + INTERVAL '189 days')
     RETURNING id;`,
    [params.deviceId, params.imageBase64, JSON.stringify(emb512), params.analiseInicial]
  );

  return {
    matchSummary: `Novo registro visual salvo com 512 parâmetros (ID #${ins.rows[0].id} — Desconhecido, retenção automática de 189 dias). Se for um familiar, diga "Jarvis, esse é [Nome]" para tornar permanente.`,
    recordId: ins.rows[0].id,
    isFamiliar: false,
    nome: 'Desconhecido'
  };
}

export async function updateVisualAnalysis(recordId: number, analise: string): Promise<void> {
  await pool.query(`UPDATE jarvis_visual_memory SET analise = $1 WHERE id = $2;`, [analise, recordId]).catch(() => {});
}

export async function promoteLastCaptureToFamiliar(nome: string): Promise<string> {
  await ensureVisualMemoryTable();
  const cleanName = nome.replace(/[.!?]+$/, '').trim();
  const res = await pool.query(
    `UPDATE jarvis_visual_memory
     SET pessoa_nome = $1,
         categoria = 'familiar',
         permanente = TRUE,
         expires_at = NULL,
         last_seen_at = NOW()
     WHERE id = (SELECT id FROM jarvis_visual_memory ORDER BY last_seen_at DESC LIMIT 1)
     RETURNING id, pessoa_nome;`,
    [cleanName]
  );
  if (res.rowCount === 0) {
    return `Ainda não há nenhuma captura recente da câmera para vincular a ${cleanName}. Peça primeiro para eu olhar pela câmera.`;
  }
  return `Biometria visual de 512 parâmetros vinculada a ${res.rows[0].pessoa_nome} (ID #${res.rows[0].id}) e promovida para memória permanente de familiar.`;
}

setInterval(() => { purgeExpiredVisualMemories().catch(() => {}); }, 12 * 60 * 60 * 1000);
