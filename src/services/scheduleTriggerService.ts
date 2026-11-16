import { pool } from '../config/database.js';
import { executeSingleAgentLogic } from '../controllers/agentController.js';

function getCampoGrandeNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Campo_Grande' }));
}

export function matchesCronField(cronField: string, currentValue: number): boolean {
  if (!cronField || cronField === '*' || cronField === '?') return true;
  if (cronField.startsWith('*/')) {
    const step = parseInt(cronField.replace('*/', ''), 10);
    return !isNaN(step) && step > 0 && currentValue % step === 0;
  }
  if (cronField.includes(',')) {
    return cronField.split(',').map((v) => parseInt(v.trim(), 10)).includes(currentValue);
  }
  if (cronField.includes('-')) {
    const [s, e] = cronField.split('-').map((v) => parseInt(v.trim(), 10));
    return !isNaN(s) && !isNaN(e) && currentValue >= s && currentValue <= e;
  }
  return parseInt(cronField, 10) === currentValue;
}

export function matchesCronExpression(cronExpression: string, date: Date = getCampoGrandeNow()): boolean {
  const parts = (cronExpression || '').trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minR, hourR, domR, monR, dowR] = parts;
  return (
    matchesCronField(minR, date.getMinutes()) &&
    matchesCronField(hourR, date.getHours()) &&
    matchesCronField(domR, date.getDate()) &&
    matchesCronField(monR, date.getMonth() + 1) &&
    matchesCronField(dowR, date.getDay())
  );
}

export async function executeScheduledAgent(agent: any, isManual = false) {
  const start = Date.now();
  const promptToRun = (agent.schedule_prompt || '').trim() ||
    `Execute agora sua rotina programada principal conforme sua especialidade (${agent.description || agent.name}).`;

  try {
    const res = await executeSingleAgentLogic(
      agent,
      { prompt: promptToRun, textPrompt: promptToRun, trigger: isManual ? 'manual_ui' : 'cron_schedule' },
      'production'
    );
    const outStr = typeof res.output === 'string' ? res.output : JSON.stringify(res.output);

    await pool.query(`UPDATE ai_agents SET last_scheduled_run = NOW() WHERE id = $1;`, [agent.id]).catch(() => {});
    await pool.query(
      `INSERT INTO schedule_execution_logs (agent_slug, agent_name, cron_expression, prompt_dispatched, execution_status, output_summary, execution_time_ms)
       VALUES ($1, $2, $3, $4, 'success', $5, $6);`,
      [agent.slug, agent.name, agent.cron_expression || 'manual', promptToRun, outStr.slice(0, 1000), Date.now() - start]
    ).catch(() => {});

    return { success: true, output: res.output, executionTimeMs: Date.now() - start };
  } catch (err: any) {
    await pool.query(
      `INSERT INTO schedule_execution_logs (agent_slug, agent_name, cron_expression, prompt_dispatched, execution_status, output_summary, execution_time_ms)
       VALUES ($1, $2, $3, $4, 'error', $5, $6);`,
      [agent.slug, agent.name, agent.cron_expression || 'manual', promptToRun, err.message, Date.now() - start]
    ).catch(() => {});
    throw err;
  }
}

let lastMinuteKey = '';

export async function evaluateScheduledTriggers() {
  const nowCg = getCampoGrandeNow();
  const minuteKey = `${nowCg.getFullYear()}-${nowCg.getMonth()}-${nowCg.getDate()}-${nowCg.getHours()}:${nowCg.getMinutes()}`;
  if (minuteKey === lastMinuteKey) return;
  lastMinuteKey = minuteKey;

  try {
    const result = await pool.query(`
      SELECT * FROM ai_agents
      WHERE is_active = TRUE
        AND schedule_enabled = TRUE
        AND cron_expression IS NOT NULL
        AND TRIM(cron_expression) <> '';
    `);
    for (const agent of result.rows) {
      if (agent.last_scheduled_run) {
        const diffMs = Date.now() - new Date(agent.last_scheduled_run).getTime();
        if (diffMs < 55000) continue;
      }
      if (matchesCronExpression(agent.cron_expression, nowCg)) {
        console.log(`⏰ [Schedule Trigger - Campo Grande] Disparando "${agent.name}" (${agent.cron_expression})`);
        executeScheduledAgent(agent, false).catch((e) =>
          console.error(`❌ [Schedule Trigger] Erro em "${agent.name}":`, e.message)
        );
      }
    }
  } catch (error: any) {
    console.error('❌ [Schedule Trigger] Falha na varredura Cron:', error.message);
  }
}

export function startScheduleTriggerEngine() {
  setInterval(evaluateScheduledTriggers, 20 * 1000);
  console.log('⏰ [Schedule Trigger] Motor Cron ativo (Fuso: America/Campo_Grande -04:00).');
}
