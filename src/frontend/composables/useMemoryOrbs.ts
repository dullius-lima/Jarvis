// Desenha as bolinhas azuis de memória e o anel de agente acionado no 3D
import { ref } from 'vue';

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

  // Registra o retorno do webhook/orquestrador e acende o agente acionado
  function registerAgentExecution(apiResponse: any) {
    const payload = apiResponse?.data || apiResponse || {};
    const slug = payload.agentId || payload.agentSlug || payload.slug || 'jarvis_core';
    const name = payload.agent || payload.agentName || (slug === 'jarvis_core' ? 'JARVIS (Núcleo Central)' : slug);
    const ok = apiResponse?.success !== false && payload.triggeredSuccess !== false;

    lastTelemetry.value = {
      agentName: name,
      agentSlug: slug,
      nodeType: payload.nodeType || 'llm',
      success: ok,
      executionTimeMs: Number(payload.executionTimeMs || 0),
      memoryStored: payload.memoryStored !== false,
      memoryCount: Number(payload.memoryCount || memoryOrbs.value.length + 1),
      timestamp: new Date().toLocaleTimeString()
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
      }, 6500);
    }
  }

  // Desenha as bolinhas azuis no Canvas 2D/3D a cada frame
  function drawMemoryOrbsOnCanvas(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    rotationY = 0
  ) {
    for (const orb of memoryOrbs.value) {
      orb.angle += orb.speed;
      const effectiveAngle = orb.angle + rotationY * 0.5;
      const x3d = Math.cos(effectiveAngle) * orb.radius;
      const z3d = Math.sin(effectiveAngle) * orb.radius;
      const y3d = orb.yOffset + Math.sin(orb.angle * 2) * 7;

      const perspective = 520 / (520 + z3d);
      const screenX = centerX + x3d * perspective;
      const screenY = centerY + y3d * perspective;
      const radius = Math.max(1.8, orb.size * perspective);

      ctx.save();
      ctx.beginPath();
      ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
      ctx.fillStyle = orb.isNew ? '#00ffff' : '#38bdf8';
      ctx.shadowColor = orb.isNew ? '#00ffff' : '#0284c7';
      ctx.shadowBlur = orb.isNew ? 18 : 9;
      ctx.globalAlpha = z3d > 0 ? 0.45 : orb.isNew ? 1 : 0.82;
      ctx.fill();
      ctx.restore();
    }
  }

  return {
    memoryOrbs,
    lastTelemetry,
    highlightedAgentSlug,
    highlightedStatusColor,
    fetchSessionMemoryOrbs,
    spawnBlueMemoryOrb,
    registerAgentExecution,
    drawMemoryOrbsOnCanvas
  };
}