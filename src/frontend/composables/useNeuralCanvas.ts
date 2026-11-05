// Projeção 3D, rotação orbital, hitboxes e gestos do canvas

import { ref, onMounted, onUnmounted } from 'vue';

export interface NeuralCanvasContext {
  getAgents: () => any[];
  getSavedConnections: () => any[];
  getMemoryDots: () => any[];
  getConnectionMeta: (toolId: string) => any;
  getAgentsUsingTool: (toolId: string) => any[];
  getIsSpeaking: () => boolean;
  getIsProcessing: () => boolean;
  getActiveAgentId: () => any;
  getHighlightedAgentSlug?: () => string | null;
  getHighlightedStatusColor?: () => string;
  drawMemoryOrbs?: (ctx: CanvasRenderingContext2D, cx: number, cy: number, rotY: number) => void;
  onSelectAgent?: (agent: any) => void;
  onSelectSubNode?: (node: any) => void;
  onSelectMemory?: (mem: any) => void;
}

export function useNeuralCanvas(ctxOptions: NeuralCanvasContext) {
  const neuralCanvas = ref<HTMLCanvasElement | null>(null);

  // Controles de Câmera Orbital 3D
  const rotationY = ref<number>(0);
  const rotationX = ref<number>(0.18);
  const cameraZoom = ref<number>(1.0);

  let isDragging = false;
  let dragMoved = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let animationFrameId: number | null = null;

  let renderedAgentsHitbox: Array<{ x: number; y: number; r: number; agent: any }> = [];
  let renderedSubNodesHitbox: Array<{ x: number; y: number; r: number; node: any }> = [];
  let renderedMemoriesHitbox: Array<{ x: number; y: number; r: number; mem: any }> = [];

  const AGENT_PALETTE = [
    '#38bdf8', '#10b981', '#d946ef', '#f59e0b',
    '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e'
  ];

  function resetCamera() {
    cameraZoom.value = 1.0;
    rotationX.value = 0.18;
    rotationY.value = 0;
  }

  function project3D(x: number, y: number, z: number, cx: number, cy: number, fov: number) {
    const cosY = Math.cos(rotationY.value);
    const sinY = Math.sin(rotationY.value);
    const x1 = x * cosY - z * sinY;
    const z1 = z * cosY + x * sinY;

    const cosX = Math.cos(rotationX.value);
    const sinX = Math.sin(rotationX.value);
    const y2 = y * cosX - z1 * sinX;
    const z2 = z1 * cosX + y * sinX;

    const depth = Math.max(fov + z2, 120);
    const scale = (fov / depth) * cameraZoom.value;
    return { x: cx + x1 * scale, y: cy + y2 * scale, z: z2, scale };
  }

  function handleStageTap(clientX: number, clientY: number) {
    for (const item of renderedAgentsHitbox) {
      if (Math.hypot(clientX - item.x, clientY - item.y) <= item.r) {
        if (ctxOptions.onSelectAgent) ctxOptions.onSelectAgent(item.agent);
        return;
      }
    }
    for (const sub of renderedSubNodesHitbox) {
      if (Math.hypot(clientX - sub.x, clientY - sub.y) <= sub.r) {
        if (ctxOptions.onSelectSubNode) ctxOptions.onSelectSubNode(sub.node);
        return;
      }
    }
    for (const mem of renderedMemoriesHitbox) {
      if (Math.hypot(clientX - mem.x, clientY - mem.y) <= mem.r) {
        if (ctxOptions.onSelectMemory) ctxOptions.onSelectMemory(mem.mem);
        return;
      }
    }
  }

  function onMouseDown(e: MouseEvent) {
    isDragging = true;
    dragMoved = false;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }

  function onMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
    rotationY.value += dx * 0.005;
    rotationX.value = Math.max(-0.8, Math.min(0.8, rotationX.value + dy * 0.005));
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }

  function onMouseUp(e: MouseEvent) {
    if (isDragging && !dragMoved) handleStageTap(e.clientX, e.clientY);
    isDragging = false;
  }

  function onWheel(e: WheelEvent) {
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    cameraZoom.value = Math.max(0.65, Math.min(1.65, cameraZoom.value + delta));
  }

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      isDragging = true;
      dragMoved = false;
      lastMouseX = e.touches[0].clientX;
      lastMouseY = e.touches[0].clientY;
    }
  }

  function onTouchMove(e: TouchEvent) {
    if (!isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - lastMouseX;
    const dy = e.touches[0].clientY - lastMouseY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true;
    rotationY.value += dx * 0.006;
    rotationX.value = Math.max(-0.8, Math.min(0.8, rotationX.value + dy * 0.006));
    lastMouseX = e.touches[0].clientX;
    lastMouseY = e.touches[0].clientY;
  }

  function onTouchEnd(e: TouchEvent) {
    if (isDragging && !dragMoved && e.changedTouches.length > 0) {
      handleStageTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
    isDragging = false;
  }

  function stopAnimationLoop() {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  function startNeuralCanvasLoop() {
    stopAnimationLoop();
    let time = 0;

    const renderFrame = () => {
      const canvas = neuralCanvas.value;
      if (!canvas) {
        animationFrameId = requestAnimationFrame(renderFrame);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animationFrameId = requestAnimationFrame(renderFrame);
        return;
      }

      const width = window.innerWidth || 360;
      const height = window.innerHeight || 640;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1.0;
      ctx.clearRect(0, 0, width, height);

      const bgGrad = ctx.createRadialGradient(
        width * 0.5, height * 0.48, 10,
        width * 0.5, height * 0.48, Math.max(width, height) * 0.75
      );
      bgGrad.addColorStop(0, '#09192c');
      bgGrad.addColorStop(0.55, '#050b16');
      bgGrad.addColorStop(1, '#020409');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      const isSpeaking = ctxOptions.getIsSpeaking();
      const isProcessing = ctxOptions.getIsProcessing();
      time += isSpeaking || isProcessing ? 0.032 : 0.012;
      if (!isDragging) rotationY.value += 0.0028;

      const isMobile = width < 768;
      const cx = width * 0.5;
      const cy = height * (isMobile ? 0.48 : 0.5);
      const fov = isMobile ? 520 : 680;
      const maxSafeRadius = Math.max(95, Math.min(width * 0.5 - (isMobile ? 48 : 80), height * 0.5 - (isMobile ? 115 : 130)));
      const coreRadius = Math.min(maxSafeRadius * 0.36, isMobile ? 56 : 82);
      const agentOrbitRadius = Math.min(maxSafeRadius * 0.88, isMobile ? 132 : 245);
      const sharedNodeOrbitRadius = Math.min(maxSafeRadius * 1.15, isMobile ? 162 : 330);

      // 1. Anel orbital central
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius * 1.32 * cameraZoom.value, time * 0.4, time * 0.4 + Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 2. Wireframe Esférico Central
      const pulseScale = 1 + (isSpeaking || isProcessing ? Math.sin(time * 5) * 0.07 : Math.sin(time * 2) * 0.02);
      const effectiveCoreR = coreRadius * pulseScale;

      ctx.save();
      ctx.strokeStyle = isSpeaking ? '#38bdf8' : '#22d3ee';
      ctx.lineWidth = 1.1;
      for (let i = 1; i < 7; i++) {
        const theta = (i * Math.PI) / 7;
        ctx.beginPath();
        for (let j = 0; j <= 12; j++) {
          const phi = (j * 2 * Math.PI) / 12;
          const p = project3D(
            effectiveCoreR * Math.sin(theta) * Math.cos(phi),
            effectiveCoreR * Math.cos(theta),
            effectiveCoreR * Math.sin(theta) * Math.sin(phi),
            cx, cy, fov
          );
          if (j === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.globalAlpha = 0.42;
        ctx.stroke();
      }
      ctx.restore();

      // 3. Brilho do Núcleo
      ctx.save();
      const coreGlow = ctx.createRadialGradient(cx, cy, 4, cx, cy, effectiveCoreR * 1.2 * cameraZoom.value);
      coreGlow.addColorStop(0, 'rgba(56, 189, 248, 0.42)');
      coreGlow.addColorStop(0.6, 'rgba(14, 165, 233, 0.12)');
      coreGlow.addColorStop(1, 'rgba(14, 165, 233, 0)');
      ctx.fillStyle = coreGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, effectiveCoreR * 1.2 * cameraZoom.value, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 4. Desenha as bolinhas azuis orbitais de memória
      if (ctxOptions.drawMemoryOrbs) {
        ctxOptions.drawMemoryOrbs(ctx, cx, cy, rotationY.value);
      }

      // 5. Orbes dos Agentes e Conectores
      renderedAgentsHitbox = [];
      renderedSubNodesHitbox = [];
      renderedMemoriesHitbox = [];

      const agentsList = ctxOptions.getAgents();
      const agentPositionsMap = new Map<any, { ag: any; proj: { x: number; y: number; scale: number }; color: string }>();

      agentsList.forEach((ag, idx) => {
        const angle = (idx / Math.max(agentsList.length, 1)) * Math.PI * 2 + 0.3;
        const rawProj = project3D(
          Math.cos(angle) * agentOrbitRadius,
          Math.sin(idx * 1.7 + time * 0.5) * (isMobile ? 28 : 42),
          Math.sin(angle) * agentOrbitRadius,
          cx, cy, fov
        );
        const color = ag.color || AGENT_PALETTE[idx % AGENT_PALETTE.length];
        agentPositionsMap.set(ag.id, { ag, proj: { x: rawProj.x, y: rawProj.y, scale: rawProj.scale }, color });
      });

      // Feixes sinápticos e memórias em trânsito
      const activeId = ctxOptions.getActiveAgentId();
      const memoryDotsList = ctxOptions.getMemoryDots();

      Array.from(agentPositionsMap.values()).forEach(({ ag, proj: agProj, color }, index) => {
        const isSelected = activeId === ag.id;
        ctx.save();
        ctx.globalAlpha = isSelected ? 0.95 : 0.55;
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 2.4 : 1.5;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        const ctrlX = (cx + agProj.x) * 0.5;
        const ctrlY = (cy + agProj.y) * 0.5 - 18;
        ctx.quadraticCurveTo(ctrlX, ctrlY, agProj.x, agProj.y);
        ctx.stroke();
        ctx.restore();

        const agentMems = memoryDotsList.filter((m) => m.agentId === ag.id || m.agentName === ag.name);
        const count = Math.min(Math.max(agentMems.length, 2), 5);
        for (let d = 0; d < count; d++) {
          const t = (time * 0.22 + d * 0.2 + index * 0.17) % 1;
          const invT = 1 - t;
          const mx = invT * invT * cx + 2 * invT * t * ctrlX + t * t * agProj.x;
          const my = invT * invT * cy + 2 * invT * t * ctrlY + t * t * agProj.y;

          ctx.save();
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(mx, my, isMobile ? 3 : 3.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          if (agentMems[d]) renderedMemoriesHitbox.push({ x: mx, y: my, r: 10, mem: agentMems[d] });
        }
      });

      // Conectores externos (Nós Fixos)
      const uniqueToolIds = Array.from(
        new Set(agentsList.flatMap((ag) => ag.tools || []).map((t: string) => String(t).toLowerCase()))
      );

      uniqueToolIds.forEach((toolId, tIdx) => {
        const meta = ctxOptions.getConnectionMeta(toolId);
        const angle = (tIdx / Math.max(uniqueToolIds.length, 1)) * Math.PI * 2 + 0.85;
        const tProj = project3D(
          Math.cos(angle) * sharedNodeOrbitRadius,
          Math.cos(tIdx * 2.1) * (isMobile ? 35 : 55),
          Math.sin(angle) * sharedNodeOrbitRadius,
          cx, cy, fov
        );
        const nodeR = isMobile ? 12 : 15;

        ctxOptions.getAgentsUsingTool(toolId).forEach((cAg) => {
          const agEntry = agentPositionsMap.get(cAg.id);
          if (agEntry) {
            ctx.save();
            ctx.globalAlpha = 0.45;
            ctx.strokeStyle = agEntry.color;
            ctx.lineWidth = 1.2;
            ctx.setLineDash([3, 4]);
            ctx.beginPath();
            ctx.moveTo(agEntry.proj.x, agEntry.proj.y);
            ctx.lineTo(tProj.x, tProj.y);
            ctx.stroke();
            ctx.restore();
          }
        });

        ctx.save();
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(tProj.x, tProj.y, nodeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.font = `${isMobile ? 11 : 13}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(meta.icon || '🔌', tProj.x, tProj.y);
        ctx.restore();

        renderedSubNodesHitbox.push({ x: tProj.x, y: tProj.y, r: nodeR + 6, node: { ...meta, toolId } });
      });

      // Orbes dos Agentes Especialistas
      const highlightedSlug = ctxOptions.getHighlightedAgentSlug ? ctxOptions.getHighlightedAgentSlug() : null;
      const highlightColor = ctxOptions.getHighlightedStatusColor ? ctxOptions.getHighlightedStatusColor() : '#22c55e';

      Array.from(agentPositionsMap.values()).forEach(({ ag, proj, color }) => {
        const orbR = isMobile ? 22 : 28;
        const isSelected = activeId === ag.id;
        const isTriggered = highlightedSlug === ag.slug;

        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = isTriggered ? highlightColor : color;
        ctx.lineWidth = isTriggered || isSelected ? 3 : 2;
        ctx.shadowColor = isTriggered ? highlightColor : color;
        ctx.shadowBlur = isTriggered ? 22 : isSelected ? 16 : 8;

        ctx.beginPath();
        ctx.arc(proj.x, proj.y, orbR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.font = `${isMobile ? 16 : 20}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(ag.icon || '🤖', proj.x, proj.y);

        if ((ag.tools || []).length > 0) {
          ctx.fillStyle = '#0284c7';
          ctx.beginPath();
          ctx.arc(proj.x + orbR * 0.72, proj.y - orbR * 0.72, isMobile ? 8 : 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${isMobile ? 9 : 10}px system-ui`;
          ctx.fillText(String(ag.tools.length), proj.x + orbR * 0.72, proj.y - orbR * 0.72);
        }

        ctx.font = `600 ${isMobile ? 11 : 12.5}px system-ui, sans-serif`;
        ctx.fillStyle = '#f1f5f9';
        ctx.fillText(ag.name || 'Agente', proj.x, proj.y + orbR + (isMobile ? 13 : 16));
        ctx.restore();

        renderedAgentsHitbox.push({ x: proj.x, y: proj.y, r: orbR + 8, agent: ag });
      });

      animationFrameId = requestAnimationFrame(renderFrame);
    };

    animationFrameId = requestAnimationFrame(renderFrame);
  }

  onUnmounted(() => {
    stopAnimationLoop();
  });

  return {
    neuralCanvas,
    rotationY,
    rotationX,
    cameraZoom,
    resetCamera,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onWheel,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    startNeuralCanvasLoop,
    stopAnimationLoop
  };
}