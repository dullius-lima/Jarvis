// src/services/waitApprovalService.ts
import crypto from 'crypto';
import { pool } from '../config/database.js';
import { emitBrainLinkEvent } from './brainSocketService.js';

function safeEmitBrainEvent(payload: any) {
  try {
    if (typeof emitBrainLinkEvent === 'function') {
      emitBrainLinkEvent({
        axon_id: `axon_wait_${Date.now()}`,
        source_dendrite: payload.sourceNode || 'wait_gate',
        target_dendrite: payload.targetNode || 'jarvis_core',
        direction: 'FORWARD',
        neurotransmitter_type: payload.neurotransmitter || 'GABA',
        intensity: payload.intensity ?? 0.8,
        metadata: payload.metadata || {}
      });
    }
  } catch {}
}

export interface CreateWaitStateParams {
  agentSlug: string;
  agentName: string;
  environment: 'test' | 'production';
  triggerSource: string;
  inputPayload: any;
  proposedOutput?: any;
  nextAgentSlug?: string | null;
  approvalPrompt?: string;
}

export async function createWorkflowWaitState(params: CreateWaitStateParams) {
  const executionId = `exec_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const resumeToken = crypto.randomBytes(24).toString('hex');

  const query = `
    INSERT INTO workflow_wait_states (
      execution_id, resume_token, agent_slug, agent_name,
      environment, trigger_source, input_payload, proposed_output,
      next_agent_slug, approval_prompt, status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'WAITING')
    RETURNING *;
  `;

  const values = [
    executionId,
    resumeToken,
    params.agentSlug,
    params.agentName,
    params.environment,
    params.triggerSource,
    JSON.stringify(params.inputPayload || {}),
    JSON.stringify(params.proposedOutput || {}),
    params.nextAgentSlug || null,
    params.approvalPrompt || `Aprovação humana exigida para o agente [${params.agentName}].`
  ];

  const result = await pool.query(query, values);
  const waitRecord = result.rows[0];

  safeEmitBrainEvent({
    type: 'WORKFLOW_WAIT_CREATED',
    neurotransmitter: 'NORADRENALINA',
    sourceNode: params.agentSlug,
    targetNode: 'human_approval_gate',
    intensity: 0.95,
    metadata: {
      executionId,
      agentName: params.agentName,
      environment: params.environment,
      approvalPrompt: waitRecord.approval_prompt,
      createdAt: waitRecord.created_at
    }
  });

  return waitRecord;
}

export async function listWaitStates(statusFilter?: string) {
  if (statusFilter) {
    const res = await pool.query(
      'SELECT * FROM workflow_wait_states WHERE status = $1 ORDER BY created_at DESC LIMIT 50;',
      [statusFilter.toUpperCase()]
    );
    return res.rows;
  }

  const res = await pool.query(
    "SELECT * FROM workflow_wait_states ORDER BY CASE WHEN status = 'WAITING' THEN 0 ELSE 1 END, created_at DESC LIMIT 50;"
  );
  return res.rows;
}

export async function getWaitStateByIdentifier(identifier: string) {
  const res = await pool.query(
    'SELECT * FROM workflow_wait_states WHERE execution_id = $1 OR resume_token = $1 LIMIT 1;',
    [identifier]
  );
  return res.rows[0] || null;
}

export async function markWaitStateDecision(
  identifier: string,
  decision: 'APPROVED' | 'REJECTED',
  decidedBy: string = 'Admin',
  notes: string = ''
) {
  const res = await pool.query(
    `UPDATE workflow_wait_states
     SET status = $1,
         decided_by = $2,
         decision_notes = $3,
         decided_at = CURRENT_TIMESTAMP
     WHERE (execution_id = $4 OR resume_token = $4) AND status = 'WAITING'
     RETURNING *;`,
    [decision, decidedBy, notes, identifier]
  );

  return res.rows[0] || null;
}