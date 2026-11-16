import { pool } from '../config/database.js';
import { processOrchestratorWorkflow } from './orchestratorService.js';

export interface AgentScheduleItem {
  id: string;
  label?: string;
  enabled: boolean;
  cron_expression: string;
  schedule_prompt: string;
  last_run?: string | null;
}

function getCampoGrandeNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Campo_Grande' }));
}

export async function ensureMultiScheduleColumn(): Promise<void> {
  await pool.query(`
    ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS schedules JSONB DEFAULT '[]'::jsonb;
  `).catch(() => {});
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

function normalizeAgentSchedules(agent: any): AgentScheduleItem[] {
  let list: any[] = [];
  if (Array.isArray(agent.schedules)) {
    list = agent.schedules;
  } else if (typeof agent.schedules === 'string') {
    try { list = JSON.parse(agent.schedules || '[]'); } catch { list = []; }
  }

  if (list.length > 0) {
    return list.map((item: any, idx: number) => ({
      id: item.id || `sched_${agent.id}_${idx + 1}`,
      label: item.label || `Disparo #${idx + 1}`,
      enabled: item.enabled !== false,
      cron_expression: String(item.cron_expression || '').trim(),
      schedule_prompt: String(item.schedule_prompt || '').trim(),
      last_run: item.last_run || null
    }));
  }

  if (agent.schedule_enabled && agent.cron_expression) {
    return [{
      id: `sched_${agent.id}_primary`,
      label: 'Disparo Principal',
      enabled: true,
      cron_expression: String(agent.cron_expression).trim(),
      schedule_prompt: String(agent.schedule_prompt || '').trim(),
      last_run: agent.last_scheduled_run || null
    }];
  }

  return [];
}

export async function executeScheduledAgent(
  agent: any,
  isManual = false,
  overridePrompt?: string,
  scheduleId?: string
) {
  await ensureMultiScheduleColumn();
  const start = Date.now();
  const schedules = normalizeAgentSchedules(agent);
  const targetSched = scheduleId
    ? schedules.find((s) => s.id === scheduleId)
    : schedules[0];

  const tarefa = (overridePrompt || targetSched?.schedule_prompt || agent.schedule_prompt || '').trim();
  const cronUsed = targetSched?.cron_expression || agent.cron_expression || 'manual';
  const schedLabel = targetSched?.label || 'Disparo Programado';

  if (!tarefa) {
    throw new Error('Preencha o campo "Comando / Tarefa" deste disparo antes de executar.');
  }

  const nextSlugs = Array.isArray(agent.next_agent_slugs) && agent.next_agent_slugs.length > 0
    ? agent.next_agent_slugs.join(', ')
    : (agent.next_agent_slug || 'nenhum fixo');

  const comandoCompleto = `[DISPARO AUTOMÁTICO AGENDADO - EXECUTAR IMEDIATAMENTE SEM PERGUNTAR]
Agente Principal: ${agent.name} (${agent.slug})
Rotina Disparada: ${schedLabel} (${cronUsed})
Próximos Nós Encadeados: ${nextSlugs}
Data/Hora Atual (Campo Grande -04:00): ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Campo_Grande' })}

ORDEM A EXECUTAR AGORA:
${tarefa}

REGRAS OBRIGATÓRIAS:
1. Acione imediatamente o especialista "${agent.slug}" e execute suas ferramentas conectadas (${JSON.stringify(agent.tools || [])}).
2. Se a ordem solicitar encaminhamento ou envio para outro especialista/WhatsApp, execute toda a cadeia até concluir o envio.
3. Nunca responda dizendo que "está pronto para ajudar"; execute a tarefa agora e devolva o resultado real.`;

  try {
    const res: any = await processOrchestratorWorkflow({
      identityToken: 'Matheus-Admin',
      sessionId: `cron_${agent.slug}_${targetSched?.id || 'main'}_${Date.now()}`,
      sensorData: {
        type: 'schedule_trigger',
        source: isManual ? 'manual_schedule_test' : 'cron_schedule',
        targetAgentSlug: agent.slug,
        prompt: comandoCompleto,
        textPrompt: comandoCompleto
      }
    });

    const finalOutput = res?.response || res?.data?.response || JSON.stringify(res);
    const nowIso = new Date().toISOString();

    if (schedules.length > 0 && targetSched) {
      const updatedSchedules = schedules.map((s) =>
        s.id === targetSched.id ? { ...s, last_run: nowIso } : s
      );
      await pool.query(
        `UPDATE ai_agents SET last_scheduled_run = NOW(), schedules = $1::jsonb WHERE id = $2;`,
        [JSON.stringify(updatedSchedules), agent.id]
      ).catch(() => {});
    } else {
      await pool.query(`UPDATE ai_agents SET last_scheduled_run = NOW() WHERE id = $1;`, [agent.id]).catch(() => {});
    }

    await pool.query(
      `INSERT INTO schedule_execution_logs (agent_slug, agent_name, cron_expression, prompt_dispatched, execution_status, output_summary, execution_time_ms)
       VALUES ($1, $2, $3, $4, 'success', $5, $6);`,
      [agent.slug, `${agent.name} (${schedLabel})`, cronUsed, tarefa, String(finalOutput).slice(0, 1200), Date.now() - start]
    ).catch(() => {});

    return {
      success: true,
      output: finalOutput,
      rota: res?.rota_completa || res?.agent || agent.name,
      executionTimeMs: Date.now() - start
    };
  } catch (err: any) {
    await pool.query(
      `INSERT INTO schedule_execution_logs (agent_slug, agent_name, cron_expression, prompt_dispatched, execution_status, output_summary, execution_time_ms)
       VALUES ($1, $2, $3, $4, 'error', $5, $6);`,
      [agent.slug, `${agent.name} (${schedLabel})`, cronUsed, tarefa, err.message, Date.now() - start]
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
    await ensureMultiScheduleColumn();
    const result = await pool.query(`
      SELECT * FROM ai_agents
      WHERE is_active = TRUE
        AND (schedule_enabled = TRUE OR jsonb_array_length(COALESCE(schedules, '[]'::jsonb)) > 0);
    `);

    for (const agent of result.rows) {
      const schedules = normalizeAgentSchedules(agent);
      for (const sched of schedules) {
        if (!sched.enabled || !sched.cron_expression) continue;
        if (sched.last_run) {
          const diffMs = Date.now() - new Date(sched.last_run).getTime();
          if (diffMs < 55000) continue;
        }
        if (matchesCronExpression(sched.cron_expression, nowCg)) {
          console.log(`⏰ [Schedule Trigger] Disparando "${agent.name}" -> "${sched.label}" (${sched.cron_expression})`);
          executeScheduledAgent(agent, false, sched.schedule_prompt, sched.id).catch((e) =>
            console.error(`❌ [Schedule Trigger] Erro em "${agent.name}" (${sched.label}):`, e.message)
          );
        }
      }
    }
  } catch (error: any) {
    console.error('❌ [Schedule Trigger] Falha na varredura Cron:', error.message);
  }
}

export function startScheduleTriggerEngine() {
  ensureMultiScheduleColumn().catch(() => {});
  setInterval(evaluateScheduledTriggers, 20 * 1000);
  console.log('⏰ [Schedule Trigger] Motor Multi-Disparo Cron ativo (Fuso: America/Campo_Grande).');
}
