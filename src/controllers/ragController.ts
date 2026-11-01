// src/controllers/ragController.ts
import { Request, Response } from 'express';
import { ingestDocument } from '../services/ragService.js';
import { searchVectorDocuments } from '../services/vectorSearchService.js';

export async function handleRagIngest(req: Request, res: Response) {
  try {
    const { documents } = req.body || {};
    if (!documents) {
      return res.status(400).json({ success: false, error: 'O campo "documents" é obrigatório.' });
    }

    const docsArray = Array.isArray(documents) ? documents : [documents];
    const results = [];

    for (const doc of docsArray) {
      if (!doc?.content) continue;
      const resInsertion = await ingestDocument({
        content: doc.content,
        metadata: doc.metadata || {},
        embedding: doc.embedding
      });
      results.push(resInsertion);
    }

    return res.status(201).json({
      success: true,
      message: `${results.length} documento(s) armazenado(s) no RAG.`,
      results
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function handleVectorSearch(req: Request, res: Response) {
  try {
    const { queryText, query, queryEmbedding, matchThreshold, matchCount } = req.body || {};
    const searchResult = await searchVectorDocuments({
      queryText: queryText || query || '',
      queryEmbedding,
      matchThreshold,
      matchCount
    });

    return res.status(200).json({
      success: true,
      message: 'Busca vetorial executada.',
      mode: searchResult.mode,
      data: searchResult.matches
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}