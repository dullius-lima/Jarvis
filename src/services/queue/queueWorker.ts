import {
  ensureQueueTable, claimNextJob, completeJob, failOrRetryJob, recoverStaleJobs, purgeOldJobs
} from './queueRepository.js';
import { dispatchQueueJob } from './queueHandlers.js';

let running = false;
let activeCount = 0;
const MAX_CONCURRENCY = 3;

async function processNext(): Promise<void> {
  if (!running || activeCount >= MAX_CONCURRENCY) return;
  const job = await claimNextJob();
  if (!job) return;
  activeCount++;
  try {
    await completeJob(job.id, await dispatchQueueJob(job));
  } catch (err: any) {
    await failOrRetryJob(job, err?.message || String(err));
  } finally {
    activeCount--;
    setImmediate(processNext);
  }
}

export async function startQueueWorker(): Promise<void> {
  if (running) return;
  await ensureQueueTable();
  const recovered = await recoverStaleJobs(3);
  if (recovered > 0) console.log(`♻️ [Queue] ${recovered} job(s) recuperado(s)`);
  await purgeOldJobs(7, 30).catch(() => {});
  running = true;
  setInterval(() => { processNext().catch(() => {}); }, 1500);
  setInterval(() => { recoverStaleJobs(3).catch(() => {}); }, 60000);
  setInterval(() => { purgeOldJobs(7, 30).catch(() => {}); }, 21600000);
  console.log('📥 [Queue] Worker persistente PostgreSQL ativo (com auto-limpeza 7d)');
}
