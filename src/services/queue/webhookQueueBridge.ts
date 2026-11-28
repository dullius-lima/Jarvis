import { Request, Response, NextFunction } from 'express';
import { enqueueJob } from './queueRepository.js';

export function asyncWebhookQueueMiddleware(req: Request, res: Response, next: NextFunction) {
  const isAsync =
    req.query?.async === 'true' ||
    req.query?.async === '1' ||
    req.headers['x-async-queue'] === 'true';

  if (!isAsync) return next();

  const cleanPath = req.originalUrl
    .replace(/([?&])async=(true|1)&?/g, '$1')
    .replace(/[?&]$/, '');

  const payload = req.method === 'GET' ? req.query : req.body;

  enqueueJob('webhook_forward', {
    path: cleanPath,
    method: req.method,
    body: payload || {}
  })
    .then((job) =>
      res.status(202).json({
        success: true,
        queued: true,
        jobId: job.id,
        status: job.status
      })
    )
    .catch((err: any) => res.status(500).json({ success: false, error: err.message }));
}
