// src/services/vectorSearchService.ts
import { pool, isPgVectorAvailable } from '../config/database.js';
import { resolveTextEmbedding } from './ragService.js';

export interface SearchQueryPayload {
  queryText?: string;
  queryEmbedding?: number[];
  matchThreshold?: number;
  matchCount?: number;
}

export interface VectorSearchResultItem {
  id: string | number;
  content: string;
  metadata?: Record<string, any>;
  similarity: number;
}

export function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || !vecA.length || !vecB.length || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

export const computeCosineSimilarity = calculateCosineSimilarity;

export async function generateEmbeddingVector(text: string): Promise<number[]> {
  return resolveTextEmbedding(text);
}

let pgvectorSupported: boolean | null = null;

export async function searchVectorDocuments({
  queryText = '',
  queryEmbedding,
  matchThreshold = 0.05,
  matchCount = 5
}: SearchQueryPayload) {
  const client = await pool.connect();
  try {
    const targetVector = await resolveTextEmbedding(queryText, queryEmbedding);
    const vectorString = `[${targetVector.join(',')}]`;

    // Aguarda corretamente a Promise de verificação da extensão pgvector
    const isExtensionAvailable = await isPgVectorAvailable();
    if (isExtensionAvailable && pgvectorSupported !== false) {
      try {
        const query = `
          SELECT 
            id, 
            content, 
            metadata, 
            1 - (embedding <=> $1::vector) AS similarity
          FROM vector_documents
          WHERE 1 - (embedding <=> $1::vector) >= $2
          ORDER BY embedding <=> $1::vector ASC
          LIMIT $3;
        `;
        const result = await client.query(query, [vectorString, matchThreshold, matchCount]);
        pgvectorSupported = true;
        return { success: true, mode: 'pgvector_native', matches: result.rows };
      } catch (pgErr: any) {
        if (pgErr.code === '42704' || pgErr.code === '42883' || String(pgErr.message).includes('vector')) {
          pgvectorSupported = false;
        }
      }
    }

    // Fallback em memória para ambientes Windows sem pgvector nativo
    const fallbackResult = await client.query(`
      SELECT id, content, metadata, embedding, created_at
      FROM vector_documents
      ORDER BY created_at DESC
      LIMIT 150;
    `);

    const scoredMatches: VectorSearchResultItem[] = fallbackResult.rows
      .map((row: any) => {
        let rowVec: number[] = [];
        try {
          if (typeof row.embedding === 'string' && row.embedding.startsWith('[')) {
            rowVec = JSON.parse(row.embedding);
          } else if (Array.isArray(row.embedding)) {
            rowVec = row.embedding;
          }
        } catch {
          rowVec = [];
        }
        return {
          id: row.id,
          content: row.content,
          metadata: row.metadata,
          similarity: calculateCosineSimilarity(targetVector, rowVec)
        };
      })
      .filter((item) => item.similarity >= matchThreshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, matchCount);

    return { success: true, mode: 'typescript_cosine_fallback', matches: scoredMatches };
  } finally {
    client.release();
  }
}