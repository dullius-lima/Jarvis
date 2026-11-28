import { Router } from 'express';
import { getQueueStats, listQueueJobs, retryJobById, purgeOldJobs } from '../services/queue/queueRepository.js';

export const queueRouter = Router();

queueRouter.get('/stats', async (_req, res) => {
  try {
    return res.json({ success: true, stats: await getQueueStats() });
  } catch (e: any) { return res.status(500).json({ success: false, error: e.message }); }
});

queueRouter.get('/jobs', async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const limit = Number(req.query.limit) || 20;
    return res.json({ success: true, jobs: await listQueueJobs(status, limit) });
  } catch (e: any) { return res.status(500).json({ success: false, error: e.message }); }
});

queueRouter.post('/jobs/:id/retry', async (req, res) => {
  try {
    const job = await retryJobById(Number(req.params.id));
    if (!job) return res.status(404).json({ success: false, error: 'Job nao encontrado' });
    return res.json({ success: true, job });
  } catch (e: any) { return res.status(500).json({ success: false, error: e.message }); }
});

queueRouter.delete('/purge', async (_req, res) => {
  try {
    return res.json({ success: true, deleted: await purgeOldJobs(7, 30) });
  } catch (e: any) { return res.status(500).json({ success: false, error: e.message }); }
});
