// src/services/ragService.ts
import { pool, isPgVectorAvailable } from '../config/database.js';
import OpenAI from 'openai';

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  const len = Math.min(vecA.length, vecB.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function normalizeTokens(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/**
 * Embedding determinístico por tokens/bigramas (FNV-1a) independente da posição na frase
 */
export function generateDeterministicEmbedding(text: string): number[] {
  const vector = new Array<number>(1536).fill(0);
  const tokens = normalizeTokens(text);
  if (tokens.length === 0) return vector;

  const addFeature = (feat: string, weight: number) => {
    let h1 = 2166136261;
    let h2 = 16777619;
    for (let i = 0; i < feat.length; i++) {
      const c = feat.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 16777619);
      h2 ^= c;
      h2 = Math.imul(h2, 1099511628);
    }
    vector[Math.abs(h1) % 1536] += weight;
    vector[Math.abs(h2) % 1536] += weight * 0.5;
  };

  for (let i = 0; i < tokens.length; i++) {
    addFeature(tokens[i], 1.0);
    if (i + 1 < tokens.length) {
      addFeature(`${tokens[i]}_${tokens[i + 1]}`, 0.75);
    }
  }

  const norm = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0)) || 1;
  return vector.map((v) => Number((v / norm).toFixed(6)));
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const cleanText = (text || '').trim();
  if (!cleanText) return new Array<number>(1536).fill(0);

  // 1. Tenta Gemini Embedding gratuito (text-embedding-004) se chave AIza estiver disponível
  const geminiKey = process.env.GEMINI_API_KEY || (String(process.env.LLM_API_KEY || '').startsWith('AIza') ? process.env.LLM_API_KEY : '');
  if (geminiKey && geminiKey.startsWith('AIza')) {
    try {
      const gemRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'models/text-embedding-004',
            content: { parts: [{ text: cleanText }] },
            outputDimensionality: 1536
          }),
          signal: AbortSignal.timeout(8000)
        }
      );
      if (gemRes.ok) {
        const gData: any = await gemRes.json();
        const vals = gData?.embedding?.values;
        if (Array.isArray(vals) && vals.length > 0) {
          const padded = new Array<number>(1536).fill(0);
          for (let i = 0; i < Math.min(vals.length, 1536); i++) padded[i] = vals[i];
          return padded;
        }
      }
    } catch {}
  }

  // 2. Tenta OpenAI Embeddings se chave sk- estiver configurada
  const openAiKey = process.env.OPENAI_API_KEY || '';
  if (openAiKey && openAiKey.startsWith('sk-') && !openAiKey.startsWith('sk-or-')) {
    try {
      const openai = new OpenAI({ apiKey: openAiKey });
      const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: cleanText });
      return res.data[0].embedding;
    } catch {}
  }

  // 3. Fallback determinístico léxico posicionalmente invariante
  return generateDeterministicEmbedding(cleanText);
}

export async function resolveTextEmbedding(queryText?: string, queryEmbedding?: number[]): Promise<number[]> {
  if (Array.isArray(queryEmbedding) && queryEmbedding.length > 0) return queryEmbedding;
  return generateEmbedding(queryText || '');
}

export async function ingestDocumentToRag(
  content: string,
  metadata: Record<string, any> = {},
  customEmbedding?: number[]
) {
  const cleanContent = String(content || '').trim();
  if (!cleanContent) throw new Error('Conteúdo vazio para ingestão no RAG.');

  // Deduplicação por conteúdo exato
  const dup = await pool
    .query('SELECT id, created_at FROM vector_documents WHERE content = $1 LIMIT 1;', [cleanContent])
    .catch(() => ({ rows: [] as any[] }));
  if (dup.rows.length > 0) return dup.rows[0];

  const embedding = Array.isArray(customEmbedding) && customEmbedding.length > 0
    ? customEmbedding
    : await generateEmbedding(cleanContent);
  const vectorLiteral = `[${embedding.join(',')}]`;
  const hasPgVector = await isPgVectorAvailable();
  const title = metadata?.title || metadata?.fileName || null;
  const category = metadata?.category || 'permanente';

  if (hasPgVector) {
    try {
      const res = await pool.query(
        `INSERT INTO vector_documents (title, category, content, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5::vector) RETURNING id, created_at;`,
        [title, category, cleanContent, JSON.stringify(metadata), vectorLiteral]
      );
      return res.rows[0];
    } catch {}
  }

  const res = await pool.query(
    `INSERT INTO vector_documents (title, category, content, metadata, embedding)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at;`,
    [title, category, cleanContent, JSON.stringify(metadata), JSON.stringify(embedding)]
  );
  return res.rows[0];
}

export const ingestDocumentToRAG = ingestDocumentToRag;

export async function ingestDocument(
  docOrContent: string | { content: string; metadata?: Record<string, any>; embedding?: number[] },
  metadata: Record<string, any> = {},
  customEmbedding?: number[]
) {
  if (typeof docOrContent === 'string') {
    return ingestDocumentToRag(docOrContent, metadata, customEmbedding);
  }
  return ingestDocumentToRag(
    docOrContent.content,
    docOrContent.metadata || metadata || {},
    docOrContent.embedding || customEmbedding
  );
}

/**
 * Busca Híbrida (Vetorial + Léxica + Documentos sem embedding)
 * Aceita assinatura posicional (queryText, limit) ou objeto ({ queryText, matchThreshold, matchCount })
 */
export async function searchVectorDocuments(
  queryOrOptions: string | { queryText?: string; queryEmbedding?: number[]; matchThreshold?: number; matchCount?: number },
  limitArg: number = 5
): Promise<any[]> {
  const isObj = typeof queryOrOptions === 'object' && queryOrOptions !== null;
  const queryText = isObj ? String(queryOrOptions.queryText || '') : String(queryOrOptions || '');
  const limit = isObj ? Number(queryOrOptions.matchCount || limitArg) : Number(limitArg || 5);
  const threshold = isObj ? Number(queryOrOptions.matchThreshold ?? 0.08) : 0.08;
  const customEmb = isObj ? queryOrOptions.queryEmbedding : undefined;

  const queryEmbedding = await resolveTextEmbedding(queryText, customEmb);
  const hasPgVector = await isPgVectorAvailable();
  const merged = new Map<string, any>();

  // 1. Busca Semântica Vetorial (pgvector nativo)
  if (hasPgVector) {
    try {
      const vectorLiteral = `[${queryEmbedding.join(',')}]`;
      const res = await pool.query(
        `SELECT id, title, category, content, metadata, 1 - (embedding <=> $1::vector) AS similarity
         FROM vector_documents
         WHERE embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT $2;`,
        [vectorLiteral, limit * 2]
      );
      for (const r of res.rows) {
        merged.set(String(r.id), { ...r, similarity: Number(r.similarity || 0) });
      }
    } catch {}
  }

  // 2. Fallback em memória caso pgvector não esteja ativo
  if (merged.size === 0) {
    const res = await pool
      .query(`SELECT id, title, category, content, metadata, embedding, created_at FROM vector_documents WHERE embedding IS NOT NULL ORDER BY id DESC LIMIT 200;`)
      .catch(() => ({ rows: [] as any[] }));

    for (const row of res.rows) {
      let docVec: number[] = [];
      try {
        docVec = typeof row.embedding === 'string' && row.embedding.startsWith('[') ? JSON.parse(row.embedding) : [];
      } catch {
        docVec = [];
      }
      const sim = cosineSimilarity(queryEmbedding, docVec);
      if (sim >= threshold) {
        merged.set(String(row.id), { id: row.id, title: row.title, category: row.category, content: row.content, metadata: row.metadata, similarity: sim });
      }
    }
  }

  // 3. Complemento Léxico Híbrido (garante match exato de nomes, números e linhas com embedding IS NULL)
  const tokens = normalizeTokens(queryText).slice(0, 5);
  if (tokens.length > 0) {
    const conditions = tokens.map((_, idx) => `(LOWER(COALESCE(title, '') || ' ' || content) LIKE '%' || $${idx + 1} || '%')`).join(' OR ');
    const lexRes = await pool
      .query(`SELECT id, title, category, content, metadata FROM vector_documents WHERE ${conditions} ORDER BY id DESC LIMIT $${tokens.length + 1};`, [...tokens, limit])
      .catch(() => ({ rows: [] as any[] }));

    for (const row of lexRes.rows) {
      const key = String(row.id);
      const lowAll = `${row.title || ''} ${row.content || ''}`.toLowerCase();
      const hits = tokens.filter((t) => lowAll.includes(t)).length;
      const lexScore = Math.min(0.95, 0.45 + (hits / tokens.length) * 0.45);
      const prev = merged.get(key);
      if (!prev || lexScore > prev.similarity) {
        merged.set(key, { ...row, similarity: lexScore });
      }
    }
  }

  return Array.from(merged.values())
    .filter((item) => item.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
