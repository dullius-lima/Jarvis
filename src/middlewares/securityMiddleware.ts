// src/middlewares/securityMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';

const JWT_SECRET = process.env.JWT_SECRET || 'jarvis-n8n-oci-super-secret-key-2026';

// ============================================================================
// 1. MOTOR JWT NATIVO (HS256 com proteção Timing-Safe)
// ============================================================================
export function signJwtToken(payload: object, expiresInHours = 24): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + expiresInHours * 3600;
  const body = Buffer.from(
    JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp })
  ).toString('base64url');

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');

  return `${header}.${body}.${signature}`;
}

export function verifyJwtToken(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;

    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp * 1000 && Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function requireJwtAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'] as string;

  if (process.env.INTERNAL_API_KEY && apiKeyHeader === process.env.INTERNAL_API_KEY) {
    return next();
  }

  const isLocalOrigin =
    req.hostname === 'localhost' ||
    req.hostname === '127.0.0.1' ||
    req.ip === '::1' ||
    req.ip === '127.0.0.1';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const decoded = verifyJwtToken(token);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        error: 'Token JWT inválido ou expirado. Faça login novamente.'
      });
    }
    (req as any).user = decoded;
    return next();
  }

  if (process.env.NODE_ENV === 'production' || !isLocalOrigin) {
    return res.status(401).json({
      success: false,
      error: 'Acesso negado: Token JWT obrigatório para esta rota administrativa.'
    });
  }

  next();
}

// ============================================================================
// 2. RATE LIMITER & PROTEÇÃO DoS (Com emissão de Neurotransmissor GABA)
// ============================================================================
interface RateEntry {
  count: number;
  resetAt: number;
}
const rateBuckets = new Map<string, RateEntry>();

export function createRateLimiter(maxRequests: number, windowMs: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      req.ip ||
      req.socket.remoteAddress ||
      'unknown'
    ).trim();

    const key = `${ip}:${req.baseUrl || req.path}`;
    const now = Date.now();

    const current = rateBuckets.get(key);
    if (!current || now > current.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > maxRequests) {
      try {
        const brainSocket = await import('../services/brainSocketService.js').catch(() => null);
        const emitFn =
          brainSocket?.emitNeuroPulse || (brainSocket as any)?.emitBrainLinkEvent;
        if (typeof emitFn === 'function') {
          emitFn({
            axon_id: 'security_firewall',
            source_dendrite: `IP_${ip}`,
            target_dendrite: 'JARVIS_FIREWALL',
            direction: 'FORWARD',
            neurotransmitter: 'GABA',
            neurotransmitter_type: 'GABA',
            intensity: 1.0,
            metadata: { reason: 'Rate Limit Excedido (DoS Protection)', path: req.originalUrl }
          });
        }
      } catch {}

      return res.status(429).json({
        success: false,
        error: 'Limite de requisições excedido (GABA Rate Limit ativo). Aguarde alguns instantes.'
      });
    }

    next();
  };
}

// ============================================================================
// 3. SANITIZAÇÃO ESTRITA E VALIDAÇÃO ZOD (Ingress & Retorno de Especialistas)
// ============================================================================
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '[BLOCKED_SCRIPT]')
    .replace(/javascript:/gi, '[BLOCKED_JS]')
    .trim();
}

export const SpecialistOutputSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    agentType: z.string().optional(),
    output: z.any()
  })
  .passthrough();

const WebhookIngressSchema = z
  .object({
    sessionId: z.string().max(120).optional(),
    identityToken: z.string().max(120).optional(),
    eventId: z.string().max(120).optional(),
    prompt: z.string().max(50000).optional(),
    sensorData: z
      .object({
        type: z.string().optional(),
        textPrompt: z.string().max(50000).optional(),
        hasVision: z.boolean().optional(),
        screenBase64: z.string().optional(),
        faceBadge: z.string().optional(),
        faceFrameBase64: z.string().optional(),
        imagePayload: z
          .object({
            mimeType: z.string().optional(),
            dataBase64: z.string().optional()
          })
          .optional()
      })
      .passthrough()
      .optional(),
    payload: z.any().optional()
  })
  .passthrough();

export function validateWebhookIngress(req: Request, res: Response, next: NextFunction) {
  const parsed = WebhookIngressSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Payload rejeitado pelo escudo Zod.',
      details: parsed.error.issues
    });
  }

  if (req.body?.sensorData?.textPrompt) {
    req.body.sensorData.textPrompt = sanitizeString(req.body.sensorData.textPrompt);
  }
  if (typeof req.body?.prompt === 'string') {
    req.body.prompt = sanitizeString(req.body.prompt);
  }

  const hmacSignature = req.headers['x-hmac-signature'] as string;
  if (hmacSignature && process.env.WEBHOOK_HMAC_SECRET) {
    const expectedHmac = crypto
      .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex');

    const hmacBuf = Buffer.from(hmacSignature);
    const expectedBuf = Buffer.from(expectedHmac);

    if (hmacBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(hmacBuf, expectedBuf)) {
      return res.status(403).json({
        success: false,
        error: 'Assinatura HMAC inválida. Possível tentativa de Spoofing bloqueada.'
      });
    }
  }

  next();
}