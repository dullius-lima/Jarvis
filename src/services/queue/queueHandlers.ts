import { QueueJob } from './queueRepository.js';
import { sendChannelMessage } from '../messagingService.js';
import { pool } from '../../config/database.js';
import { executeScheduledAgent } from '../scheduleTriggerService.js';

export async function dispatchQueueJob(job: QueueJob): Promise<any> {
  const { job_type, payload } = job;
  const port = process.env.PORT || 3333;

  if (job_type === 'scheduled_agent') {
    const r = await pool.query(`SELECT * FROM ai_agents WHERE id = $1 AND is_active = TRUE`, [payload.agentId]);
    const agent = r.rows[0];
    if (!agent) return { skipped: true, reason: 'Agente inativo ou removido' };
    return await executeScheduledAgent(agent, false, payload.schedulePrompt, payload.scheduleId);
  }

  if (job_type === 'webhook_forward') {
    const method = (payload.method || 'POST').toUpperCase();
    const res = await fetch(`http://127.0.0.1:${port}${payload.path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(payload.body || {})
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Webhook HTTP ${res.status}: ${text.slice(0, 300)}`);
    try { return JSON.parse(text); } catch { return { raw: text }; }
  }

  if (job_type === 'agent_prompt') {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/webhook/ingress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identityToken: payload.identityToken || 'Matheus-Admin',
        sessionId: payload.sessionId || `queue_${job.id}`,
        sensorData: { textPrompt: payload.prompt }
      })
    });
    if (!res.ok) throw new Error(`Ingress HTTP ${res.status}`);
    return await res.json();
  }

  if (job_type === 'send_message') {
    return await sendChannelMessage({
      channel: payload.channel || 'whatsapp',
      recipientId: payload.recipientId,
      text: payload.text
    });
  }

  throw new Error(`Tipo de job desconhecido: ${job_type}`);
}
