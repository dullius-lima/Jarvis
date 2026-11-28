import { pool } from '../config/database.js';

const DIM = 128;

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function buildRouteVector(text: string): number[] {
  const vec = new Array<number>(DIM).fill(0);
  const clean = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();

  const words = clean.split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return vec;

  for (let i = 0; i < words.length; i++) {
    vec[fnv1a(words[i]) % DIM] += 1.0;
    if (i < words.length - 1) {
      vec[fnv1a(`${words[i]}_${words[i + 1]}`) % DIM] += 1.4;
    }
  }

  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0)) || 1;
  return vec.map((v) => Number((v / norm).toFixed(5)));
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export async function lookupSemanticRoute(userPrompt: string, threshold = 0.88) {
  const promptVec = buildRouteVector(userPrompt);
  const res = await pool
    .query(
      `SELECT c.id, c.prompt_sample, c.vector_json, c.agent_slug, c.agent_name, c.tool_name, c.hit_count
       FROM semantic_route_cache c
       JOIN ai_agents a ON LOWER(a.slug) = LOWER(c.agent_slug) AND a.is_active = TRUE
       ORDER BY c.hit_count DESC, c.updated_at DESC
       LIMIT 250;`
    )
    .catch(() => ({ rows: [] as any[] }));

  let best: any = null;
  let bestScore = 0;

  for (const row of res.rows) {
    const score = cosineSimilarity(promptVec, row.vector_json);
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  if (best && bestScore >= threshold) {
    pool.query(`UPDATE semantic_route_cache SET hit_count = hit_count + 1, updated_at = NOW() WHERE id = $1;`, [best.id]).catch(() => {});
    return { hit: true, similarity: Number(bestScore.toFixed(4)), route: best };
  }

  return { hit: false, similarity: Number(bestScore.toFixed(4)), route: null };
}

export async function learnSemanticRoute(params: {
  promptSample: string;
  agentSlug: string;
  agentName?: string;
  toolName?: string;
}) {
  const prompt = String(params.promptSample || '').trim();
  if (prompt.length < 6 || prompt.length > 260 || !params.agentSlug) return;

  const existing = await lookupSemanticRoute(prompt, 0.92);
  if (existing.hit && existing.route?.agent_slug?.toLowerCase() === params.agentSlug.toLowerCase()) {
    return;
  }

  const vec = buildRouteVector(prompt);
  await pool
    .query(
      `INSERT INTO semantic_route_cache (prompt_sample, vector_json, agent_slug, agent_name, tool_name, hit_count, updated_at)
       VALUES ($1, $2::jsonb, $3, $4, $5, 1, NOW());`,
      [prompt, JSON.stringify(vec), params.agentSlug, params.agentName || params.agentSlug, params.toolName || null]
    )
    .catch(() => {});
}

export async function invalidateSemanticRouteCache(agentSlug?: string) {
  if (agentSlug) {
    await pool.query(`DELETE FROM semantic_route_cache WHERE LOWER(agent_slug) = LOWER($1);`, [agentSlug]);
  } else {
    await pool.query(`TRUNCATE TABLE semantic_route_cache;`);
  }
}
