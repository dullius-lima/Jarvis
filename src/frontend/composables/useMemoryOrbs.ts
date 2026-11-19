// src/frontend/composables/useMemoryOrbs.ts
// Desenha as bolinhas azuis de memória e gerencia o estado luminoso do agente e das tools acionadas no 3D
import { ref } from 'vue';

export const liveTrace3D = ref<any[]>([]);

export interface MemoryOrb3D {
  id: number;
  angle: number;
  radius: number;
  yOffset: number;
  speed: number;
  size: number;
  isNew: boolean;
}

export interface AgentTriggerTelemetry {
  agentName: string;
  agentSlug: string;
  nodeType: string;
  success: boolean;
  executionTimeMs: number;
  memoryStored: boolean;
  memoryCount: number;
  timestamp: string;
}

export function useMemoryOrbs() {
  const memoryOrbs = ref<MemoryOrb3D[]>([]);
  const lastTelemetry = ref<AgentTriggerTelemetry | null>(null);
  const highlightedAgentSlug = ref<string | null>(null);
  const highlightedStatusColor = ref<string>('#22c55e');

  // [NOVO] Conjunto reativo com os identificadores normalizados das ferramentas em execução
  const highlightedToolSlugs = ref<Set<string>>(new Set());

  // Inicializa ou sincroniza a quantidade de bolinhas azuis com o histórico da sessão
  function syncMemoryOrbsCount(count: number) {
    const total = Math.min(Math.max(count || 8, 6), 65);
    const list: MemoryOrb3D[] = [];
    for (let i = 0; i < total; i++) {
      list.push({
        id: i,
        angle: (i / total) * Math.PI * 2 + (i % 5) * 0.2,
        radius: 90 + (i % 4) * 16,
        yOffset: ((i % 7) - 3) * 14,
        speed: 0.0035 + (i % 4) * 0.0012,
        size: 3.2 + (i % 3) * 1.1,
        isNew: false
      });
    }
    memoryOrbs.value = list;
  }

  // Busca no banco quantas memórias existem na sessão ativa
  async function fetchSessionMemoryOrbs(sessionId: string) {
    try {
      const res = await fetch(`/api/v1/memory/sessions/${encodeURIComponent(sessionId)}`);
      if (!res.ok) {
        syncMemoryOrbsCount(12);
        return;
      }
      const data = await res.json();
      const totalMsgs = Array.isArray(data.chatHistory) ? data.chatHistory.length : 12;
      syncMemoryOrbsCount(totalMsgs);
    } catch {
      syncMemoryOrbsCount(12);
    }
  }

  // Faz nascer uma nova bolinha azul brilhante quando o JARVIS grava memória
  function spawnBlueMemoryOrb() {
    const orbId = Date.now();
    memoryOrbs.value.push({
      id: orbId,
      angle: Math.random() * Math.PI * 2,
      radius: 102,
      yOffset: (Math.random() - 0.5) * 45,
      speed: 0.007,
      size: 6.8,
      isNew: true
    });

    setTimeout(() => {
      const target = memoryOrbs.value.find((o) => o.id === orbId);
      if (target) {
        target.isNew = false;
        target.size = 4.0;
        target.speed = 0.004;
      }
    }, 3500);
  }

  // Registra o retorno do webhook/orquestrador, acende o agente acionado e as tools exclusivas
  function registerAgentExecution(apiResponse: any) {
    const payload = apiResponse?.data || apiResponse || {};
    const slug = payload.agentId || payload.agentSlug || payload.slug || 'jarvis_core';
    const name = payload.agent || payload.agentName || (slug === 'jarvis_core' ? 'JARVIS (Núcleo Central)' : slug);
    const ok = apiResponse?.success !== false && payload.triggeredSuccess !== false;

    // [NOVO] Extrai e normaliza as tools efetivamente chamadas neste ciclo
    const rawTools: string[] = payload.executedTools || apiResponse?.executedTools || [];
    const normalizedTools = rawTools
      .map((t: string) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter(Boolean);

    highlightedToolSlugs.value = new Set(normalizedTools);

    const rawTrace = Array.isArray(payload.executionTrace)
      ? payload.executionTrace
      : Array.isArray(apiResponse?.executionTrace)
      ? apiResponse.executionTrace
      : [];
    const fallbackTrace = rawTrace.length > 0
      ? rawTrace
      : (slug && slug !== 'jarvis_core'
          ? [
              { step: 1, kind: 'agent', slug, name, parentSlug: 'jarvis_core', status: ok ? 'ok' : 'error' },
              ...rawTools.map((t: string, idx: number) => ({
                step: idx + 2,
                kind: 'tool',
                slug: t,
                name: t,
                parentSlug: slug,
                status: ok ? 'ok' : 'error'
              }))
            ]
          : []);

    liveTrace3D.value = fallbackTrace;

    lastTelemetry.value = {
      
      agentName: name,
      agentSlug: slug,
      nodeType: payload.nodeType || 'llm',
      success: ok,
      executionTimeMs: Number(payload.executionTimeMs || 0),
      memoryStored: payload.memoryStored !== false,
      memoryCount: Number(payload.memoryCount || memoryOrbs.value.length + 1),
      timestamp: new Date().toLocaleTimeString()
    ,
      executionTrace: fallbackTrace,
      rotaCompleta: payload.rotaCompleta || apiResponse?.rotaCompleta || ''
    };

    if (payload.memoryStored !== false) {
      spawnBlueMemoryOrb();
    }

    if (slug && slug !== 'jarvis_core') {
      highlightedAgentSlug.value = slug;
      highlightedStatusColor.value = ok ? '#22c55e' : '#ef4444';

      setTimeout(() => {
        if (highlightedAgentSlug.value === slug) {
          highlightedAgentSlug.value = null;
        }
        // Limpa o realce das ferramentas junto com o agente
        highlightedToolSlugs.value.clear();
        liveTrace3D.value = [];
      }, 6500);
    } else {
      // Se a chamada partiu diretamente do Core ou sem slug específico, desliga as tools após 6.5s
      setTimeout(() => {
        highlightedToolSlugs.value.clear();
      }, 6500);
    }
  }

  // Desenha as bolinhas azuis no Canvas 2D/3D a cada frame
  function drawMemoryOrbsOnCanvas(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    rotationY = 0,
    coreRadius = 54
  ) {
    const baseBand = coreRadius * 1.46;

    for (const orb of memoryOrbs.value) {
      orb.angle += orb.speed;
      const effectiveAngle = orb.angle + rotationY * 0.45;
      const bandRadius = baseBand + (orb.id % 3) * 6;

      const x3d = Math.cos(effectiveAngle) * bandRadius;
      const z3d = Math.sin(effectiveAngle) * bandRadius;
      const y3d = (orb.yOffset * 0.45) + Math.sin(orb.angle * 2) * 4;

      const perspective = 560 / (560 + z3d);
      const screenX = centerX + x3d * perspective;
      const screenY = centerY + y3d * perspective;
      const radius = Math.max(1.4, (orb.isNew ? 4.2 : 2.1) * perspective);

      ctx.save();
      ctx.beginPath();
      ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
      ctx.fillStyle = orb.isNew ? '#67e8f9' : '#38bdf8';
      ctx.shadowColor = orb.isNew ? '#22d3ee' : '#0284c7';
      ctx.shadowBlur = orb.isNew ? 14 : 6;
      ctx.globalAlpha = z3d > 0 ? 0.25 : orb.isNew ? 0.95 : 0.65;
      ctx.fill();
      ctx.restore();
    }
  }

  return {
    memoryOrbs,
    lastTelemetry,
    highlightedAgentSlug,
    highlightedStatusColor,
    highlightedToolSlugs, // Exposto para o Canvas 3D
    fetchSessionMemoryOrbs,
    spawnBlueMemoryOrb,
    registerAgentExecution,
    drawMemoryOrbsOnCanvas
  };
}
