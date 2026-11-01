import { Request, Response } from 'express';
import { searchVectorDocuments } from '../services/vectorSearchService.js';

export async function handleVectorSearch(req: Request, res: Response) {
  try {
    const { queryEmbedding, matchThreshold, matchCount } = req.body;
    const searchResult = await searchVectorDocuments({
      queryEmbedding,
      matchThreshold,
      matchCount
    });

    return res.status(200).json({
      success: true,
      data: searchResult.matches
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}