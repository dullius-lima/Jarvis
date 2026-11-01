// src/routes/triggerRoutes.ts
import { Router, Request, Response } from 'express';
import { pool } from '../config/database.js';
import { dispatchErrorTrigger } from '../services/errorTriggerService.js';
import { executeScheduledAgent, matchesCronExpression } from '../services/scheduleTriggerService.js';

const router = Router();

// 1. Listar histórico recente do Schedule Trigger e do Error Trigger
router.get('/logs', async (_req: Request, res: Response) => {
  try {
    const [scheduleLogs, errorLogs] = await Promise.all([
      pool.query(`SELECT * FROM schedule_execution_logs ORDER BY created_at DESC LIMIT 25;`).catch(() => ({ rows: [] })),
      pool.query(`SELECT * FROM error_trigger_logs ORDER BY created_at DESC LIMIT 25;`).catch(() => ({ rows: [] }))
    ]);

    return res.status(200).json({
      success: true,
      scheduleLogs: scheduleLogs.rows,
      errorLogs: errorLogs.rows,
      data: {
        scheduleLogs: scheduleLogs.rows,
        errorLogs: errorLogs.rows
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Disparar um Agente Agendado agora (aceita ID numérico ou Slug em ambas as rotas)
async function handleRunScheduledAgentNow(req: Request, res: Response) {
  try {
    const identifier = req.params.id || req.params.slug;
    const agentRes = await pool.query(
      `SELECT * FROM ai_agents WHERE id::text = $1 OR slug = $1 LIMIT 1;`,
      [String(identifier)]
    );

    if (agentRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agente não encontrado.' });
    }

    const agent = agentRes.rows[0];
    const result = await executeScheduledAgent(agent, true);

    return res.status(200).json({
      success: true,
      message: `Rotina agendada de "${agent.name}" executada com sucesso!`,
      data: result
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

router.post('/schedule/run-now/:id', handleRunScheduledAgentNow);
router.post('/schedule/:slug/run', handleRunScheduledAgentNow);

// 3. Simular um erro para testar o Error Trigger e o pulso de Cortisol no Cérebro 3D
router.post('/error/simulate', async (req: Request, res: Response) => {
  try {
    const {
      sourceNode = 'Simulador de Stress (Painel)',
      sourceSlug = 'finance_b3_agent',
      agentSlug,
      errorMessage = 'Timeout de conexão (504 Gateway Timeout) ao consultar endpoint externo.',
      severity = 'critical'
    } = req.body || {};

    const errorRecord = await dispatchErrorTrigger({
      sourceNode,
      sourceSlug: agentSlug || sourceSlug,
      errorMessage,
      severity,
      inputPayload: { testMode: true, triggeredBy: 'Matheus-Admin' }
    });

    return res.status(200).json({
      success: true,
      message: 'Error Trigger disparado! Verifique o diagnóstico do Supervisor e o pulso de Cortisol no Cérebro 3D.',
      data: errorRecord
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Validar se uma expressão Cron é válida
router.post('/schedule/validate-cron', (req: Request, res: Response) => {
  const { cronExpression } = req.body || {};
  const parts = (cronExpression || '').trim().split(/\s+/);
  const isValidFormat = parts.length === 5;
  const matchesNow = isValidFormat ? matchesCronExpression(cronExpression, new Date()) : false;

  return res.status(200).json({
    success: true,
    isValidFormat,
    matchesCurrentMinute: matchesNow
  });
});

export const triggerRoutes = router;
export default router;