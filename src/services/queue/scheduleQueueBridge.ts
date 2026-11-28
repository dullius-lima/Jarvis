import { enqueueJob } from './queueRepository.js';

export async function enqueueScheduledTrigger(agent: any, sched: any): Promise<void> {
  const isCode = agent.agent_type === 'code';
  await enqueueJob(
    'scheduled_agent',
    {
      agentId: agent.id,
      agentSlug: agent.slug,
      agentName: agent.name,
      scheduleId: sched.id,
      scheduleLabel: sched.label || 'Disparo Programado',
      schedulePrompt: sched.schedule_prompt || agent.schedule_prompt || ''
    },
    {
      priority: isCode ? 10 : 5,
      maxAttempts: isCode ? 2 : 3
    }
  );
}
