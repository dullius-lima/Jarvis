import { pool } from '../config/database.js';
import { dispatchErrorTrigger } from './errorTriggerService.js';
import { processOrchestratorWorkflow } from './orchestratorService.js';

let schedulerInterval: NodeJS.Timeout | null = null;
let lastCheckedMinuteKey = '';

// Dicionário de conversão de abreviações comuns do Cron
const MONTH_NAMES: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12
};

const DAY_NAMES: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6
};

/**
 * Avaliador nativo de expressões Cron de 5 campos (minuto, hora, dia_do_mes, mes, dia_da_semana).
 * Suporta curingas (*, ?), passos com barra, valores numéricos, intervalos e listas separadas por virgula.
 */
export function matchesCronExpression(cronExpr: string, date: Date = new Date()): boolean {
  if (!cronExpr || typeof cronExpr !== 'string') return false;
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minExpr, hourExpr, domExpr, monthExpr, dowExpr] = parts;

  const minute = date.getMinutes();
  const hour = date.getHours();
  const dom = date.getDate();
  const month = date.getMonth() + 1; // 1 a 12
  const dow = date.getDay(); // 0 (Domingo) a 6 (Sábado)

  return (
    matchCronField(minExpr, minute, 0, 59) &&
    matchCronField(hourExpr, hour, 0, 23) &&
    matchCronField(domExpr, dom, 1, 31) &&
    matchCronField(monthExpr, month, 1, 12, false, MONTH_NAMES) &&
    matchCronField(dowExpr, dow, 0, 7, true, DAY_NAMES)
  );
}

function matchCronField(
  fieldExpr: string,
  value: number,
  min: number,
  max: number,
  isDayOfWeek = false,
  aliasMap?: Record<string, number>
): boolean {
  // Trata curingas universais
  if (fieldExpr === '*' || fieldExpr === '?') return true;

  // Substitui abreviações por números (ex: MON -> 1, JAN -> 1)
  let normalizedExpr = fieldExpr.toUpperCase();
  if (aliasMap) {
    for (const [name, num] of Object.entries(aliasMap)) {
      normalizedExpr = normalizedExpr.replace(new RegExp(`\\b${name}\\b`, 'g'), String(num));
    }
  }

  // Suporte a listas separadas por vírgula (ex: 1,3,5 ou 10,20,30)
  const subParts = normalizedExpr.split(',');
  for (const part of subParts) {
    // Passo com intervalo ou asterisco (ex: */5 ou 8-18/2)
    if (part.includes('/')) {
      const [rangePart, stepStr] = part.split('/');
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) continue;

      let start = min;
      let end = max;

      if (rangePart !== '*' && rangePart !== '?') {
        if (rangePart.includes('-')) {
          const [startStr, endStr] = rangePart.split('-');
          start = parseInt(startStr, 10);
          end = parseInt(endStr, 10);
        } else {
          start = parseInt(rangePart, 10);
        }
      }

      if (!isNaN(start) && value >= start && value <= end && (value - start) % step === 0) {
        return true;
      }
      continue;
    }

    // Intervalo simples (ex: 1-5 para Seg a Sex)
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (!isNaN(start) && !isNaN(end)) {
        // No Cron para dia da semana, tanto 0 quanto 7 representam Domingo
        if (isDayOfWeek && value === 0 && (start <= 7 && end >= 7)) {
          return true;
        }
        if (value >= start && value <= end) {
          return true;
        }
      }
      continue;
    }

    // Valor numérico exato
    let num = parseInt(part, 10);
    if (!isNaN(num)) {
      if (isDayOfWeek && num === 7) num = 0;
      if (num === value) return true;
    }
  }

  return false;
}

/**
 * Executa um agente agendado (via Cron automático ou disparo manual de teste)
 */
export async function executeScheduledAgent(agent: any, isManualTrigger = false) {
  const startTime = Date.now();
  const promptToRun =
    agent.schedule_prompt && agent.schedule_prompt.trim() !== ''
      ? agent.schedule_prompt
      : `Executar rotina programada do agente ${agent.name} (${agent.slug}).`;

  console.log(`⏰ [Schedule Trigger] Disparando agente "${agent.name}" (${agent.slug}) | Cron: ${agent.cron_expression || 'Manual'}`);

  try {
    // Envia o estímulo para o Orquestrador Central com metadados do disparo
    const result = await processOrchestratorWorkflow({
      identityToken: 'Matheus-Admin',
      sessionId: `cron-${agent.slug}-${new Date().toISOString().slice(0, 10)}`,
      sensorData: {
        type: isManualTrigger ? 'manual_schedule_test' : 'schedule_cron_trigger',
        targetAgentSlug: agent.slug,
        textPrompt: `[GATILHO AGENDADO - ${agent.name}]: ${promptToRun}`
      }
    });

    const elapsed = Date.now() - startTime;
    const outputSummary =
      typeof result?.response === 'string'
        ? result.response
        : JSON.stringify(result).slice(0, 500);

    // Atualiza last_scheduled_run sem derrubar o fluxo caso a coluna ainda não exista
    await pool.query(
      `UPDATE ai_agents SET last_scheduled_run = NOW() WHERE id = $1;`,
      [agent.id]
    ).catch(() => {});

    // Registra no histórico específico ou recorre a agent_audit_logs como fallback
    await pool.query(
      `INSERT INTO schedule_execution_logs 
        (agent_slug, agent_name, cron_expression, prompt_dispatched, execution_status, output_summary, execution_time_ms)
       VALUES ($1, $2, $3, $4, 'success', $5, $6);`,
      [
        agent.slug,
        agent.name,
        agent.cron_expression || 'MANUAL_RUN',
        promptToRun,
        outputSummary,
        elapsed
      ]
    ).catch(async () => {
      await pool.query(
        `INSERT INTO agent_audit_logs 
          (agent_name, action_payload, response_payload, execution_time_ms)
         VALUES ($1, $2, $3, $4);`,
        [
          agent.slug,
          JSON.stringify({ trigger: 'cron', prompt: promptToRun }),
          JSON.stringify({ output: outputSummary }),
          elapsed
        ]
      ).catch(() => {});
    });

    return {
      success: true,
      agent: agent.name,
      elapsedMs: elapsed,
      output: outputSummary
    };
  } catch (error: any) {
    const elapsed = Date.now() - startTime;

    // Registra falha no histórico com fallback seguro
    await pool.query(
      `INSERT INTO schedule_execution_logs 
        (agent_slug, agent_name, cron_expression, prompt_dispatched, execution_status, output_summary, execution_time_ms)
       VALUES ($1, $2, $3, $4, 'error', $5, $6);`,
      [
        agent.slug,
        agent.name,
        agent.cron_expression || 'MANUAL_RUN',
        promptToRun,
        error?.message || 'Erro desconhecido na rotina agendada',
        elapsed
      ]
    ).catch(async () => {
      await pool.query(
        `INSERT INTO agent_audit_logs 
          (agent_name, action_payload, response_payload, execution_time_ms)
         VALUES ($1, $2, $3, $4);`,
        [
          agent.slug,
          JSON.stringify({ trigger: 'cron_error', prompt: promptToRun }),
          JSON.stringify({ error: error?.message }),
          elapsed
        ]
      ).catch(() => {});
    });

    // Aciona o Error Trigger estritamente tipado com a interface do errorTriggerService
    try {
      await dispatchErrorTrigger({
        sourceNode: `Schedule Trigger: ${agent.name}`,
        sourceSlug: agent.slug,
        errorMessage: error?.message || 'Falha na execução agendada (Cron)',
        errorStack: error?.stack,
        stackTrace: error?.stack,
        inputPayload: { cron: agent.cron_expression, prompt: promptToRun, agentSlug: agent.slug, agentName: agent.name },
        severity: 'high'
      } as any);
    } catch (errTriggerErr: any) {
      console.warn('⚠️ [Schedule Trigger] Falha ao despachar error trigger:', errTriggerErr?.message);
    }

    throw error;
  }
}

/**
 * Varredura de relógio (executada a cada 15 segundos, garantindo apenas 1 disparo por minuto por agente)
 */
async function tickScheduleEngine() {
  const now = new Date();
  const currentMinuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}:${now.getMinutes()}`;

  // Evita reavaliação no mesmo minuto do relógio
  if (currentMinuteKey === lastCheckedMinuteKey) return;
  lastCheckedMinuteKey = currentMinuteKey;

  try {
    const res = await pool.query(`
      SELECT * FROM ai_agents
      WHERE is_active = TRUE
        AND schedule_enabled = TRUE
        AND cron_expression IS NOT NULL
        AND TRIM(cron_expression) <> '';
    `);

    for (const agent of res.rows) {
      // Prevenção extra: se já executou há menos de 55 segundos, pula
      if (agent.last_scheduled_run) {
        const diffMs = now.getTime() - new Date(agent.last_scheduled_run).getTime();
        if (diffMs < 55000) continue;
      }

      if (matchesCronExpression(agent.cron_expression, now)) {
        // Execução desacoplada para não bloquear os demais agentes do mesmo minuto
        executeScheduledAgent(agent, false).catch((err) => {
          console.error(`❌ [Schedule Trigger] Falha ao executar ${agent.slug}:`, err?.message);
        });
      }
    }
  } catch (error: any) {
    console.error('❌ [Schedule Trigger] Erro ao consultar agendamentos no banco:', error?.message);
  }
}

/**
 * Inicia o motor Cron do ecossistema n8n/JARVIS
 */
export function startScheduleTriggerEngine() {
  if (schedulerInterval) clearInterval(schedulerInterval);
  schedulerInterval = setInterval(tickScheduleEngine, 15 * 1000);
  console.log('⏰ [Schedule Trigger] Motor de agendamento Cron dinâmico ativado.');
}

/**
 * Encerra o motor Cron (útil em testes ou encerramento gracioso do servidor)
 */
export function stopScheduleTriggerEngine() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('🛑 [Schedule Trigger] Motor de agendamento Cron desativado.');
  }
}