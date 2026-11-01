// src/routes/ragRoutes.ts
import { Router } from 'express';
import { handleRagIngest, handleVectorSearch } from '../controllers/ragController.js';

const router = Router();

router.post('/ingest', handleRagIngest);
router.post('/search', handleVectorSearch);

export const ragRoutes = router;
export default router;