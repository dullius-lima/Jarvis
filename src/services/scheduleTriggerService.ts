import { pool } from '../config/database.js';
import { processOrchestratorWorkflow } from './orchestratorService.js';

function getCampoGrandeNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Campo_Grande' }));
}

export async function ensureMultiScheduleColumn(): Promise<void> {
  await pool.query(`ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS schedules JSONB DEFAULT '[]'::jsonb;`).catch(() => {});
}

export function matchesCronField(cronField: string, currentValue: number): boolean {
  if (!cronField || cronField === '*' || cronField === '?') return true;
  if (cronField.startsWith('*/')) {
    const step = parseInt(cronField.replace('*/', ''), 10);
    return !isNaN(step) && step > 0 && currentValue % step === 0;
  }
  if (cronField.includes(',')) return cronField.split(',').map((v) => parseInt(v.trim(), 10)).includes(currentValue);
  if (cronField.includes('-')) {
    const [s, e] = cronField.split('-').map((v) => parseInt(v.trim(), 10));
    return !isNaN(s) && !isNaN(e) && currentValue >= s && currentValue <= e;
  }
  return parseInt(cronField, 10) === currentValue;
}

export function matchesCronExpression(cronExpression: string, date: Date = getCampoGrandeNow()): boolean {
  const parts = (cronExpression || '').trim().split(/\s+/);
  if (parts.length !== 5) return false;
  return (
    matchesCronField(parts[0], date.getMinutes()) &&
    matchesCronField(parts[1], date.getHours()) &&
    matchesCronField(parts[2], date.getDate()) &&
    matchesCronField(parts[3], date.getMonth() + 1) &&
    matchesCronField(parts[4], date.getDay())
  );
}

function normalizeSchedules(agent: any) {
  let list = Array.isArray(agent.schedules) ? agent.schedules : [];
  if (typeof agent.schedules === 'string') {
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
      id: `sched_${agent.id}_1`,
      label: 'Disparo Principal',
      enabled: true,
      cron_expression: String(agent.cron_expression).trim(),
      schedule_prompt: String(agent.schedule_prompt || '').trim(),
      last_run: agent.last_scheduled_run || null
    }];
  }
  return [];
}

export async function executeScheduledAgent(agent: any, isManual = false, overridePrompt?: string, scheduleId?: string) {
  await ensureMultiScheduleColumn();
  const start = Date.now();
  const schedules = normalizeSchedules(agent);
  const target = scheduleId ? schedules.find((s: any) => s.id === scheduleId) : schedules[0];
  const tarefa = (overridePrompt || target?.schedule_prompt || agent.schedule_prompt || '').trim();
  const cronUsed = target?.cron_expression || agent.cron_expression || 'manual';
  const label = target?.label || 'Disparo Programado';

  if (!tarefa) throw new Error('Preencha o campo "Comando / Tarefa" deste disparo antes de executar.');

  const nextSlugs = Array.isArray(agent.next_agent_slugs) && agent.next_agent_slugs.length > 0
    ? agent.next_agent_slugs.join(', ')
    : (agent.next_agent_slug || 'nenhum fixo');

  const comandoCompleto = `[DISPARO AUTOMÁTICO AGENDADO - EXECUTAR IMEDIATAMENTE]
Agente Principal: ${agent.name} (${agent.slug}) | Rotina: ${label} (${cronUsed})
Próximos Nós Encadeados: ${nextSlugs}
Data/Hora Atual (Campo Grande -04:00): ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Campo_Grande' })}

ORDEM A EXECUTAR AGORA:
${tarefa}

REGRAS: Acione imediatamente "${agent.slug}" com suas ferramentas (${JSON.stringify(agent.tools || [])}) e conclua toda a cadeia até o destino final sem fazer perguntas.`;

  let res: any;
  if (agent.agent_type === 'code' && agent.code_snippet) {
    const AF = Object.getPrototypeOf(async function () {}).constructor;
    const out = await new AF('payload', 'env', agent.code_snippet)(
      { query: tarefa, prompt: tarefa, input: tarefa, trigger: isManual ? 'manual_ui' : 'cron_schedule' },
      { BASE_URL: 'http://127.0.0.1:3333' }
    );
    res = { response: typeof out === 'string' ? out : JSON.stringify(out), rota_completa: agent.name + ' (Code 0-Tokens)' };
  } else {
    res = await processOrchestratorWorkflow({
    identityToken: 'Matheus-Admin',
    sessionId: `cron_${agent.slug}_${target?.id || 'main'}_${Date.now()}`,
    sensorData: {
      type: 'schedule_trigger',
      source: isManual ? 'manual_schedule_test' : 'cron_schedule',
      targetAgentSlug: agent.slug,
      prompt: comandoCompleto,
      textPrompt: comandoCompleto
    }
  });

  }
  const finalOutput = res?.response || res?.data?.response || JSON.stringify(res);
  const nowIso = new Date().toISOString();

  if (schedules.length > 0 && target) {
    const updated = schedules.map((s: any) => (s.id === target.id ? { ...s, last_run: nowIso } : s));
    await pool.query(`UPDATE ai_agents SET last_scheduled_run = NOW(), schedules = $1::jsonb WHERE id = $2;`, [JSON.stringify(updated), agent.id]).catch(() => {});
  } else {
    await pool.query(`UPDATE ai_agents SET last_scheduled_run = NOW() WHERE id = $1;`, [agent.id]).catch(() => {});
  }

  return { success: true, output: finalOutput, rota: res?.rota_completa || res?.agent || agent.name, executionTimeMs: Date.now() - start };
}

let lastMinuteKey = '';
export async function evaluateScheduledTriggers() {
  const nowCg = getCampoGrandeNow();
  const minuteKey = `${nowCg.getFullYear()}-${nowCg.getMonth()}-${nowCg.getDate()}-${nowCg.getHours()}:${nowCg.getMinutes()}`;
  if (minuteKey === lastMinuteKey) return;
  lastMinuteKey = minuteKey;

  try {
    await ensureMultiScheduleColumn();
    const result = await pool.query(`SELECT * FROM ai_agents WHERE is_active = TRUE AND (schedule_enabled = TRUE OR jsonb_array_length(COALESCE(schedules, '[]'::jsonb)) > 0);`);
    for (const agent of result.rows) {
      for (const sched of normalizeSchedules(agent)) {
        if (!sched.enabled || !sched.cron_expression) continue;
        if (sched.last_run && Date.now() - new Date(sched.last_run).getTime() < 55000) continue;
        if (matchesCronExpression(sched.cron_expression, nowCg)) {
          executeScheduledAgent(agent, false, sched.schedule_prompt, sched.id).catch((e) => console.error(`❌ [Cron] ${agent.name}:`, e.message));
        }
      }
    }
  } catch (e: any) {
    console.error('❌ [Cron] Falha:', e.message);
  }
}

export function startScheduleTriggerEngine() {
  ensureMultiScheduleColumn().catch(() => {});
  setInterval(evaluateScheduledTriggers, 20 * 1000);
  console.log('⏰ [Schedule Trigger] Motor Multi-Disparo ativo (America/Campo_Grande).');
}
