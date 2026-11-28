import { pool } from '../../config/database.js';
import { emitBrainLinkEvent } from '../brainSocketService.js';

export interface FanOutBranchResult {
  slug: string;
  name: string;
  agentType: string;
  status: 'ok' | 'error' | 'timeout';
  output: any;
  executedTools: string[];
  traceSteps: any[];
  durationMs: number;
  nextAgentSlug?: string | null;
}

export interface FanOutJoinOutcome {
  branchEntries: Array<{
    traceSteps?: any[];
    agentSlug: string;
    agentName: string;
    agentType?: string;
    responseInstruction?: string;
    output: any;
    executedTools?: string[];
  }>;
  joinAgent: any | null;
  mergedPayload: Record<string, any>;
}

async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, limit = 4): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (idx < tasks.length) {
      const current = idx++;
      try {
        results[current] = { status: 'fulfilled', value: await tasks[current]() };
      } catch (reason) {
        results[current] = { status: 'rejected', reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export async function executarFanOutJoin(params: {
  parentAgent: any;
  branchSlugs: string[];
  basePayload: Record<string, any>;
  visitedSlugs: Set<string>;
  executeBranch: (branchAgent: any, branchPayload: Record<string, any>) => Promise<{
    output: any;
    executedTools?: string[];
    traceSteps?: any[];
  }>;
  timeoutMs?: number;
}): Promise<FanOutJoinOutcome> {
  const { parentAgent, branchSlugs, basePayload, visitedSlugs, executeBranch, timeoutMs = 45000 } = params;

  const agentsRes = await pool
    .query(`SELECT * FROM ai_agents WHERE LOWER(slug) = ANY($1) AND is_active = TRUE;`, [
      branchSlugs.map((s) => s.toLowerCase())
    ])
    .catch(() => ({ rows: [] as any[] }));

  const branchAgents = branchSlugs
    .map((sl) => agentsRes.rows.find((r: any) => String(r.slug).toLowerCase() === sl.toLowerCase()))
    .filter((ag: any) => ag && !visitedSlugs.has(ag.slug));

  if (branchAgents.length === 0) {
    return { branchEntries: [], joinAgent: null, mergedPayload: basePayload };
  }

  const tasks = branchAgents.map((ag: any) => async (): Promise<FanOutBranchResult> => {
    const t0 = Date.now();
    visitedSlugs.add(ag.slug);
    try {
      emitBrainLinkEvent({
        axon_id: `axon_fanout_${parentAgent.slug}_${ag.slug}`,
        source_dendrite: parentAgent.slug,
        target_dendrite: ag.slug,
        direction: 'FORWARD',
        neurotransmitter_type: 'ADRENALINA',
        intensity: 1.0,
        metadata: { mode: 'FAN_OUT', branch: ag.name }
      } as any);
    } catch {}

    const branchPayload = { ...basePayload, fanoutParent: parentAgent.slug, branchTarget: ag.slug };
    const timeoutPromise = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error(`Timeout (${timeoutMs}ms) no ramo ${ag.slug}`)), timeoutMs)
    );

    try {
      const res = await Promise.race([executeBranch(ag, branchPayload), timeoutPromise]);
      return {
        slug: ag.slug,
        name: ag.name,
        agentType: ag.agent_type || 'llm',
        status: 'ok',
        output: res.output,
        executedTools: res.executedTools || [],
        traceSteps: res.traceSteps || [],
        durationMs: Date.now() - t0,
        nextAgentSlug: (ag.next_agent_slug || '').trim() || null
      };
    } catch (err: any) {
      return {
        slug: ag.slug,
        name: ag.name,
        agentType: ag.agent_type || 'llm',
        status: String(err?.message || '').includes('Timeout') ? 'timeout' : 'error',
        output: { error: err?.message || 'Falha no ramo paralelo' },
        executedTools: [],
        traceSteps: [],
        durationMs: Date.now() - t0,
        nextAgentSlug: (ag.next_agent_slug || '').trim() || null
      };
    }
  });

  const settled = await runWithConcurrency(tasks, 4);
  const branchResults: FanOutBranchResult[] = settled.map((s, i) =>
    s.status === 'fulfilled'
      ? s.value
      : {
          slug: branchAgents[i].slug,
          name: branchAgents[i].name,
          agentType: branchAgents[i].agent_type || 'llm',
          status: 'error',
          output: { error: (s as PromiseRejectedResult).reason?.message || 'Erro desconhecido' },
          executedTools: [],
          traceSteps: [],
          durationMs: 0,
          nextAgentSlug: null
        }
  );

  let joinSlug = String(parentAgent.join_agent_slug || '').trim();
  if (!joinSlug) {
    const counts = new Map<string, number>();
    for (const br of branchResults) {
      if (br.nextAgentSlug && !visitedSlugs.has(br.nextAgentSlug)) {
        const k = br.nextAgentSlug.toLowerCase();
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    for (const [slugCand, qtd] of counts.entries()) {
      if (qtd >= 2) {
        joinSlug = slugCand;
        break;
      }
    }
  }

  let joinAgent: any = null;
  if (joinSlug && !visitedSlugs.has(joinSlug)) {
    const jRes = await pool
      .query(`SELECT * FROM ai_agents WHERE LOWER(slug) = LOWER($1) AND is_active = TRUE LIMIT 1;`, [joinSlug])
      .catch(() => ({ rows: [] as any[] }));
    joinAgent = jRes.rows[0] || null;
  }

  if (joinAgent) {
    try {
      emitBrainLinkEvent({
        axon_id: `axon_join_${joinAgent.slug}`,
        source_dendrite: branchResults[0]?.slug || parentAgent.slug,
        target_dendrite: joinAgent.slug,
        direction: 'FORWARD',
        neurotransmitter_type: 'GLUTAMATO',
        intensity: 1.0,
        metadata: { mode: 'JOIN_BARRIER', branchesCount: branchResults.length }
      } as any);
    } catch {}
  }

  const branchEntries = branchResults.map((br) => ({
    traceSteps: br.traceSteps,
    agentSlug: br.slug,
    agentName: `${br.name} [Paralelo]`,
    agentType: br.agentType,
    output: br.output,
    executedTools: br.executedTools
  }));

  const etapasParalelas = branchResults.map((br) => ({
    especialista: `${br.name} (${br.slug}) [Paralelo - ${br.status}]`,
    resultado: br.output
  }));

  const resumoJoin = branchResults
    .map((br, i) => `[Ramo ${i + 1} - ${br.name} (${br.status}, ${br.durationMs}ms)]: ${typeof br.output === 'string' ? br.output : JSON.stringify(br.output)}`)
    .join('\n\n');

  const mergedPayload = {
    ...basePayload,
    fanoutCompleted: true,
    resultadosParalelos: branchResults,
    etapasAnteriores: [...(Array.isArray(basePayload.etapasAnteriores) ? basePayload.etapasAnteriores : []), ...etapasParalelas],
    task_details: `${basePayload.userPrompt || ''}\n\n[CONSOLIDAÇÃO PARALELA (FAN-OUT / JOIN - ${branchResults.length} RAMOS)]:\n${resumoJoin}`
  };

  return { branchEntries, joinAgent, mergedPayload };
}
