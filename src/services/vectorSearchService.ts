// src/services/vectorSearchService.ts
import {
  cosineSimilarity,
  resolveTextEmbedding,
  searchVectorDocuments as hybridSearch
} from './ragService.js';

export interface SearchQueryPayload {
  queryText?: string;
  queryEmbedding?: number[];
  matchThreshold?: number;
  matchCount?: number;
}

export const calculateCosineSimilarity = cosineSimilarity;
export const computeCosineSimilarity = cosineSimilarity;
export const generateEmbeddingVector = resolveTextEmbedding;

export async function searchVectorDocuments(params: SearchQueryPayload) {
  const matches = await hybridSearch({
    queryText: params.queryText || '',
    queryEmbedding: params.queryEmbedding,
    matchThreshold: params.matchThreshold ?? 0.08,
    matchCount: params.matchCount ?? 5
  });
  return { success: true, mode: 'hybrid_rag_v2', matches };
}
