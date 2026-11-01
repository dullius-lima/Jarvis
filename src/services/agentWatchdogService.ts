import { pool } from '../config/database.js';
import { sendChannelMessage } from './messagingService.js';

const AGENT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos sem atividade

export async function checkAgentsHealth() {
  const client = await pool.connect();
  try {
    const query = `
      SELECT agent_name, MAX(created_at) as last_execution
      FROM agent_audit_logs
      GROUP BY agent_name;
    `;
    const result = await client.query(query);
    const now = Date.now();

    for (const row of result.rows) {
      const agentName = row.agent_name;
      const lastExecutionTime = new Date(row.last_execution).getTime();
      const diffMs = now - lastExecutionTime;

      if (diffMs > AGENT_TIMEOUT_MS) {
        console.warn(`⚠️ [Watchdog] O agente "${agentName}" está inativo há ${Math.round(diffMs / 60000)} minutos.`);
        
        // Só tenta enviar se o token existir
        if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim() !== '') {
          await sendChannelMessage({
            channel: 'telegram',
            recipientId: process.env.ADMIN_TELEGRAM_CHAT_ID || 'Admin-Master',
            text: `🚨 *ALERTA (n8n OCI)*: O agente *${agentName}* está inativo há ${Math.round(diffMs / 60000)} minutos.`
          });
        }
      }
    }
  } catch (error: any) {
    // Silencia erros de infraestrutura no monitoramento em background
  } finally {
    client.release();
  }
}

export function startAgentWatchdog() {
  setInterval(checkAgentsHealth, 5 * 60 * 1000);
  console.log('🛡️ [Watchdog] Módulo de monitoramento de saúde dos agentes ativado.');
}