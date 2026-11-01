// src/routes/messagingRoutes.ts
import { Router, Request, Response } from 'express';
import { sendChannelMessage } from '../services/messagingService.js';

const router = Router();

router.post('/send', async (req: Request, res: Response) => {
  try {
    const { channel, recipientId, text } = req.body || {};
    if (!channel || !recipientId || !text) {
      return res.status(400).json({
        success: false,
        error: 'channel, recipientId e text são obrigatórios.'
      });
    }
    const result = await sendChannelMessage({ channel, recipientId, text });
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/telegram', (_req: Request, res: Response) => {
  return res.status(200).json({ status: 'ok', received: true });
});

router.post('/whatsapp', (_req: Request, res: Response) => {
  return res.status(200).json({ status: 'ok', received: true });
});

export const messagingRoutes = router;
export default router;