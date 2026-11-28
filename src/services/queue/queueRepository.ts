import { pool } from '../../config/database.js';

export interface QueueJob {
  id: number;
  job_type: string;
  payload: Record<string, any>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority: number;
  attempts: number;
  max_attempts: number;
}

export async function ensureQueueTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_queue (
      id SERIAL PRIMARY KEY,
      job_type VARCHAR(80) NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      priority INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      locked_at TIMESTAMPTZ,
      last_error TEXT,
      result JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_job_queue_poll
      ON job_queue (status, next_run_at, priority DESC, created_at ASC);
  `);
}

export async function enqueueJob(
  jobType: string,
  payload: Record<string, any>,
  opts: { priority?: number; delaySeconds?: number; maxAttempts?: number } = {}
): Promise<QueueJob> {
  const { priority = 0, delaySeconds = 0, maxAttempts = 3 } = opts;
  const r = await pool.query(
    `INSERT INTO job_queue (job_type, payload, priority, max_attempts, next_run_at)
     VALUES ($1, $2::jsonb, $3, $4, NOW() + ($5 || ' seconds')::interval)
     RETURNING *`,
    [jobType, JSON.stringify(payload), priority, maxAttempts, delaySeconds]
  );
  return r.rows[0];
}

export async function claimNextJob(): Promise<QueueJob | null> {
  const r = await pool.query(`
    WITH nxt AS (
      SELECT id FROM job_queue
      WHERE status = 'pending' AND next_run_at <= NOW()
      ORDER BY priority DESC, created_at ASC
      LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    UPDATE job_queue q
    SET status = 'processing', attempts = q.attempts + 1, locked_at = NOW(), updated_at = NOW()
    FROM nxt WHERE q.id = nxt.id RETURNING q.*
  `);
  return r.rows[0] || null;
}

export async function completeJob(id: number, result: any = {}): Promise<void> {
  await pool.query(
    `UPDATE job_queue SET status = 'completed', result = $2::jsonb, locked_at = NULL, updated_at = NOW() WHERE id = $1`,
    [id, JSON.stringify(result)]
  );
}

export async function failOrRetryJob(job: QueueJob, err: string): Promise<void> {
  const retry = job.attempts < job.max_attempts;
  const backoff = Math.min(300, Math.pow(3, job.attempts) * 5);
  await pool.query(
    `UPDATE job_queue
     SET status = $2, last_error = $3, locked_at = NULL,
         next_run_at = CASE WHEN $4 THEN NOW() + ($5 || ' seconds')::interval ELSE next_run_at END,
         updated_at = NOW()
     WHERE id = $1`,
    [job.id, retry ? 'pending' : 'failed', err.slice(0, 1000), retry, backoff]
  );
}

export async function recoverStaleJobs(mins = 3): Promise<number> {
  const r = await pool.query(
    `UPDATE job_queue
     SET status = CASE WHEN attempts < max_attempts THEN 'pending' ELSE 'failed' END,
         last_error = COALESCE(last_error, 'Recuperado apos reinicio'),
         locked_at = NULL, updated_at = NOW()
     WHERE status = 'processing' AND locked_at < NOW() - ($1 || ' minutes')::interval`,
    [mins]
  );
  return r.rowCount || 0;
}

export async function getQueueStats(): Promise<Record<string, number>> {
  const r = await pool.query(`SELECT status, COUNT(*)::int AS total FROM job_queue GROUP BY status`);
  const stats: Record<string, number> = { pending: 0, processing: 0, completed: 0, failed: 0 };
  for (const row of r.rows) stats[row.status] = row.total;
  return stats;
}

export async function listQueueJobs(status?: string, limit = 20): Promise<QueueJob[]> {
  const lim = Math.min(100, Math.max(1, Number(limit) || 20));
  const r = status
    ? await pool.query(`SELECT * FROM job_queue WHERE status = $1 ORDER BY id DESC LIMIT $2`, [status, lim])
    : await pool.query(`SELECT * FROM job_queue ORDER BY id DESC LIMIT $1`, [lim]);
  return r.rows;
}

export async function retryJobById(id: number): Promise<QueueJob | null> {
  const r = await pool.query(
    `UPDATE job_queue
     SET status = 'pending', attempts = 0, last_error = NULL, locked_at = NULL, next_run_at = NOW(), updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id]
  );
  return r.rows[0] || null;
}

export async function purgeOldJobs(daysCompleted = 7, daysFailed = 30): Promise<number> {
  const r = await pool.query(
    `DELETE FROM job_queue
     WHERE (status = 'completed' AND updated_at < NOW() - ($1 || ' days')::interval)
        OR (status = 'failed' AND updated_at < NOW() - ($2 || ' days')::interval)`,
    [daysCompleted, daysFailed]
  );
  return r.rowCount || 0;
}
