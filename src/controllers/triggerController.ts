import { Request, Response } from 'express';
import { dispatchErrorTrigger } from '../services/errorTriggerService.js';
import { executeScheduledAgent } from '../services/scheduleTriggerService.js';
import { pool } from '../config/database.js';

/**
 * POST /api/v1/triggers/error/simulate
 * Simula um disparo de falha operacional para testar o supervisor
 */
export async function simulateErrorTrigger(req: Request, res: Response) {
  try {
    const { sourceNode, errorMessage, agentSlug, severity } = req.body || {};

    const result = await dispatchErrorTrigger({
      sourceNode: sourceNode || 'Simulação Manual (API)',
      sourceSlug: agentSlug || 'manual_test',
      errorMessage: errorMessage || 'Simulação de erro operacional de teste.',
      severity: severity || 'high',
      inputPayload: req.body
    });

    return res.status(200).json({
      success: true,
      message: 'Error Trigger disparado com sucesso!',
      data: result
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /api/v1/triggers/schedule/:slug/run
 * Força a execução manual imediata de um agente com agendamento
 */
export async function runManualScheduleTrigger(req: Request, res: Response) {
  try {
    const { slug } = req.params;
    const resAgent = await pool.query(
      'SELECT * FROM ai_agents WHERE slug = $1 LIMIT 1;',
      [slug]
    );

    if (resAgent.rows.length === 0) {
      return res.status(404).json({ success: false, error: `Agente "${slug}" não encontrado.` });
    }

    const agent = resAgent.rows[0];
    const execResult = await executeScheduledAgent(agent, true);

    return res.status(200).json({
      success: true,
      message: `Rotina do agente "${agent.name}" executada com sucesso!`,
      data: execResult
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/v1/triggers/logs
 * Retorna o histórico de execuções do Schedule Trigger e do Error Trigger
 */
export async function getTriggerLogs(req: Request, res: Response) {
  try {
    const errorLogs = await pool.query(
      'SELECT * FROM error_trigger_logs ORDER BY created_at DESC LIMIT 30;'
    ).catch(() => ({ rows: [] }));

    const scheduleLogs = await pool.query(
      'SELECT * FROM schedule_execution_logs ORDER BY created_at DESC LIMIT 30;'
    ).catch(() => ({ rows: [] }));

    return res.status(200).json({
      success: true,
      data: {
        errorLogs: errorLogs.rows,
        scheduleLogs: scheduleLogs.rows
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}