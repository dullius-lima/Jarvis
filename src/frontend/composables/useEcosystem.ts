// Busca de agentes, conectores, histórico e vínculos

import { ref, computed } from 'vue';

export const AGENT_PALETTE = [
  '#38bdf8', '#10b981', '#d946ef', '#f59e0b',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e'
];

export function useEcosystem(sessionId: string) {
  const dynamicAgents = ref<any[]>([]);
  const savedConnectionsCatalog = ref<any[]>([]);
  const memoryDots = ref<any[]>([]);
  const connSaveFeedback = ref<string>('');

  const activeSharedNodesCount = computed(() => {
    const used = new Set<string>();
    dynamicAgents.value.forEach((ag) => {
      if (Array.isArray(ag.tools)) {
        ag.tools.forEach((t: string) => used.add(String(t).toLowerCase()));
      }
    });
    return used.size;
  });

  function getConnectionMeta(toolId: string) {
    const clean = String(toolId || '').toLowerCase();
    const found = savedConnectionsCatalog.value.find(
      (c) => String(c.id).toLowerCase() === clean || String(c.provider_key).toLowerCase() === clean
    );
    if (found) return found;
    return { id: clean, label: toolId.toUpperCase(), icon: '🔌', http_method: 'API', endpoint_url: '' };
  }

  function getAgentsUsingTool(toolId: string) {
    const clean = String(toolId || '').toLowerCase();
    return dynamicAgents.value.filter(
      (ag) => Array.isArray(ag.tools) && ag.tools.some((t: string) => String(t).toLowerCase() === clean)
    );
  }

  function isConnectionLinked(agent: any, toolId: string) {
    if (!agent || !Array.isArray(agent.tools)) return false;
    const clean = String(toolId || '').toLowerCase();
    return agent.tools.some((t: string) => String(t).toLowerCase() === clean);
  }

  function getAgentMemoryCount(agent: any) {
    if (!agent) return 0;
    return memoryDots.value.filter((m) => m.agentId === agent.id || m.agentName === agent.name).length;
  }

  async function loadEcosystemData() {
    try {
      const [agentsRes, connRes, memRes] = await Promise.all([
        fetch('/api/v1/agents').catch(() => null),
        fetch('/api/v1/connectors').catch(() => null),
        fetch(`/api/v1/memory/sessions/${encodeURIComponent(sessionId)}`).catch(() => null)
      ]);

      if (agentsRes?.ok) {
        const agJson = await agentsRes.json().catch(() => ({}));
        const list = Array.isArray(agJson.data) ? agJson.data : Array.isArray(agJson) ? agJson : [];
        dynamicAgents.value = list.map((ag: any, idx: number) => ({
          ...ag,
          tools: Array.isArray(ag.tools) ? ag.tools : [],
          color: AGENT_PALETTE[idx % AGENT_PALETTE.length]
        }));
      }

      if (connRes?.ok) {
        const cJson = await connRes.json().catch(() => ({}));
        const cList = Array.isArray(cJson.data) ? cJson.data : Array.isArray(cJson) ? cJson : [];
        savedConnectionsCatalog.value = cList.map((c: any) => ({
          id: c.provider_key || c.id || c.slug,
          provider_key: c.provider_key || c.id,
          label: c.name || c.label || c.provider_key,
          icon: c.icon || '🔌',
          description: c.description || '',
          http_method: c.http_method || c.config?.http_method || 'GET',
          endpoint_url: c.endpoint_url || c.config?.endpoint_url || ''
        }));
      }

      if (memRes?.ok) {
        const mJson = await memRes.json().catch(() => ({}));
        const chatRows = Array.isArray(mJson.chatHistory)
          ? mJson.chatHistory
          : Array.isArray(mJson.data)
          ? mJson.data
          : [];

        const agList = dynamicAgents.value;
        memoryDots.value = chatRows.slice(-28).map((row: any, i: number) => {
          const linkedAgent = agList.length > 0 ? agList[i % agList.length] : null;
          return {
            id: row.id || i,
            agentId: linkedAgent?.id || 0,
            agentName: linkedAgent?.name || 'JARVIS Core',
            summary: String(row.content || '').slice(0, 180),
            progressOffset: (i * 0.13) % 1
          };
        });
      }
    } catch (err) {
      console.warn('⚠️ [useEcosystem] Erro ao sincronizar dados:', err);
    }
  }

  async function toggleAgentConnection(agent: any, toolId: string) {
    const clean = String(toolId || '').toLowerCase();
    const currentTools = Array.isArray(agent.tools) ? [...agent.tools] : [];
    const idx = currentTools.findIndex((t: string) => String(t).toLowerCase() === clean);

    if (idx >= 0) currentTools.splice(idx, 1);
    else currentTools.push(clean);
    agent.tools = currentTools;

    try {
      await fetch(`/api/v1/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...agent, tools: currentTools })
      });
    } catch {}
  }

  async function createAndAttachConnection(form: any, targetAgent?: any) {
    if (!form.label.trim()) {
      connSaveFeedback.value = '⚠️ Informe o nome do nó.';
      return false;
    }
    const key = form.label
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_]/g, '_');

    try {
      await fetch('/api/v1/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_key: key,
          name: form.label.trim(),
          icon: form.icon || '🔌',
          description: form.description,
          http_method: form.http_method,
          endpoint_url: form.endpoint_url,
          api_key: form.auth_token,
          is_enabled: true
        })
      });

      await loadEcosystemData();
      if (targetAgent) {
        await toggleAgentConnection(targetAgent, key);
      }
      connSaveFeedback.value = '✅ Nó fixo criado e conectado!';
      return true;
    } catch {
      connSaveFeedback.value = '❌ Erro ao salvar nó.';
      return false;
    }
  }

  return {
    dynamicAgents,
    savedConnectionsCatalog,
    memoryDots,
    connSaveFeedback,
    activeSharedNodesCount,
    getConnectionMeta,
    getAgentsUsingTool,
    isConnectionLinked,
    getAgentMemoryCount,
    loadEcosystemData,
    toggleAgentConnection,
    createAndAttachConnection
  };
}