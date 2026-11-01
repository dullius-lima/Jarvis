// src/services/ragService.ts
import { pool, isPgVectorAvailable } from '../config/database.js';
import OpenAI from 'openai';

function cosineSimilarity(vecA: number[], vecB: number[]): number {
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

export async function generateEmbedding(text: string): Promise<number[]> {
  const cleanText = (text || '').trim();
  const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || '';

  if (apiKey && apiKey.startsWith('sk-')) {
    try {
      const openai = new OpenAI({ apiKey });
      const res = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: cleanText || ' '
      });
      return res.data[0].embedding;
    } catch (err: any) {
      console.warn('⚠️ [RAG] Fallback de embedding local acionado:', err.message);
    }
  }

  // Vetor determinístico normalizado de 1536 dimensões (compatível com pgvector e fallback local)
  const vector = new Array<number>(1536).fill(0);
  const lower = cleanText.toLowerCase();
  for (let i = 0; i < lower.length; i++) {
    const code = lower.charCodeAt(i);
    vector[(i * 31 + code) % 1536] += (code % 13) / 13;
  }
  const norm = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0)) || 1;
  return vector.map((v) => Number((v / norm).toFixed(6)));
}

/**
 * Exigido por src/services/vectorSearchService.ts
 */
export async function resolveTextEmbedding(
  queryText?: string,
  queryEmbedding?: number[]
): Promise<number[]> {
  if (Array.isArray(queryEmbedding) && queryEmbedding.length > 0) {
    return queryEmbedding;
  }
  return generateEmbedding(queryText || '');
}

export async function ingestDocumentToRag(
  content: string,
  metadata: Record<string, any> = {},
  customEmbedding?: number[]
) {
  const embedding =
    Array.isArray(customEmbedding) && customEmbedding.length > 0
      ? customEmbedding
      : await generateEmbedding(content);
  const vectorLiteral = `[${embedding.join(',')}]`;
  const hasPgVector = await isPgVectorAvailable();

  if (hasPgVector) {
    try {
      const res = await pool.query(
        `INSERT INTO vector_documents (content, metadata, embedding)
         VALUES ($1, $2, $3::vector) RETURNING id, created_at;`,
        [content, JSON.stringify(metadata), vectorLiteral]
      );
      return res.rows[0];
    } catch {
      // Fallback automático caso a coluna embedding tenha sido criada como TEXT
    }
  }

  const res = await pool.query(
    `INSERT INTO vector_documents (content, metadata, embedding)
     VALUES ($1, $2, $3) RETURNING id, created_at;`,
    [content, JSON.stringify(metadata), JSON.stringify(embedding)]
  );
  return res.rows[0];
}

// Alias de compatibilidade
export const ingestDocumentToRAG = ingestDocumentToRag;

/**
 * Exigido por src/controllers/ragController.ts e src/services/documentLoaderService.ts
 * Suporta tanto objeto { content, metadata, embedding } quanto parâmetros posicionais (content, metadata, embedding)
 */
export async function ingestDocument(
  docOrContent:
    | string
    | {
        content: string;
        metadata?: Record<string, any>;
        embedding?: number[];
      },
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

export async function searchVectorDocuments(queryText: string, limit: number = 5) {
  const queryEmbedding = await generateEmbedding(queryText);
  const hasPgVector = await isPgVectorAvailable();

  if (hasPgVector) {
    try {
      const vectorLiteral = `[${queryEmbedding.join(',')}]`;
      const res = await pool.query(
        `SELECT id, content, metadata, 1 - (embedding <=> $1::vector) AS similarity
         FROM vector_documents
         ORDER BY embedding <=> $1::vector
         LIMIT $2;`,
        [vectorLiteral, limit]
      );
      return res.rows;
    } catch {
      // Fallback para cálculo em memória caso a coluna seja TEXT
    }
  }

  const res = await pool
    .query(
      `SELECT id, content, metadata, embedding, created_at FROM vector_documents ORDER BY id DESC LIMIT 200;`
    )
    .catch(() => ({ rows: [] }));

  const scored = res.rows.map((row: any) => {
    let docVec: number[] = [];
    try {
      docVec =
        typeof row.embedding === 'string'
          ? JSON.parse(row.embedding)
          : Array.isArray(row.embedding)
          ? row.embedding
          : [];
    } catch {
      docVec = [];
    }
    return {
      id: row.id,
      content: row.content,
      metadata: row.metadata,
      similarity: cosineSimilarity(queryEmbedding, docVec),
      created_at: row.created_at
    };
  });

  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}

export async function queryRAGKnowledgeBase(queryText: string, limit: number = 3) {
  const matches = await searchVectorDocuments(queryText, limit);
  return {
    success: true,
    matches
  };
}