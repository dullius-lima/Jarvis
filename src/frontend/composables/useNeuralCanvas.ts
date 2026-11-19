// src/frontend/composables/useNeuralCanvas.ts
import { ref, Ref } from 'vue';
import { AGENT_PALETTE } from './useEcosystem';
import { liveTrace3D } from './useMemoryOrbs';

interface CanvasOptions {
  neuralCanvas: Ref<HTMLCanvasElement | null>;
  dynamicAgents: Ref<any[]>;
  memoryDots: Ref<any[]>;
  getConnectionMeta: (toolId: string) => any;
  getAgentsUsingTool: (toolId: string) => any[];
  drawMemoryOrbsOnCanvas: (ctx: CanvasRenderingContext2D, cx: number, cy: number, rotY: number) => void;
  highlightedAgentSlug: Ref<string | null>;
  highlightedStatusColor: Ref<string>;
  highlightedToolSlugs?: Ref<Set<string>>;
  isJarvisAwake: Ref<boolean>;
  isJarvisSpeaking: Ref<boolean>;
  isProcessing: Ref<boolean>;
  onSelectAgent: (agent: any) => void;
  onSelectSubNode: (node: any) => void;
  onSelectMemory: (mem: any) => void;
  onCoreTap: () => void;
}

export function useNeuralCanvas(opts: CanvasOptions) {
  const rotationY = ref<number>(0);
  const rotationX = ref<number>(0.22);
  const cameraZoom = ref<number>(1.0);

  let isDragging = false;
  let dragMoved = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let animationFrameId: number | null = null;

  let renderedAgentsHitbox: Array<{ x: number; y: number; r: number; agent: any }> = [];
  let renderedSubNodesHitbox: Array<{ x: number; y: number; r: number; node: any }> = [];
  let renderedMemoriesHitbox: Array<{ x: number; y: number; r: number; mem: any }> = [];

  // Malha Fibonacci 3D
  const GLOBE_NODES_COUNT = 110;
  const globeFibonacciNodes: Array<{ x: number; y: number; z: number; pulseOffset: number }> = [];
  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  for (let i = 0; i < GLOBE_NODES_COUNT; i++) {
    const theta = (2 * Math.PI * i) / goldenRatio;
    const phi = Math.acos(1 - (2 * (i + 0.5)) / GLOBE_NODES_COUNT);
    globeFibonacciNodes.push({
      x: Math.sin(phi) * Math.cos(theta),
      y: Math.cos(phi),
      z: Math.sin(phi) * Math.sin(theta),
      pulseOffset: Math.random() * Math.PI * 2
    });
  }

  function resetView() {
    cameraZoom.value = 1.0;
    rotationX.value = 0.22;
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
      const canvas = opts.neuralCanvas.value;
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

      const isMobile = width < 768;
      const cx = width * 0.5;
      const cy = height * (isMobile ? 0.44 : 0.48);
      const fov = isMobile ? 540 : 680;

      // Fundo Espacial com gradiente radial profundo
      const bgGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, Math.max(width, height) * 0.72);
      bgGrad.addColorStop(0, '#0a192f');
      bgGrad.addColorStop(0.5, '#040914');
      bgGrad.addColorStop(1, '#010307');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      const isActiveState = opts.isJarvisAwake.value || opts.isJarvisSpeaking.value || opts.isProcessing.value;
      time += isActiveState ? 0.036 : 0.014;
      if (!isDragging) rotationY.value += isActiveState ? 0.005 : 0.0028;

      const maxSafeRadius = Math.max(95, Math.min(width * 0.5 - (isMobile ? 30 : 65), height * 0.43 - (isMobile ? 35 : 60)));
      const coreRadius = Math.min(maxSafeRadius * 0.42, isMobile ? 54 : 85);
      const agentOrbitRadius = Math.min(maxSafeRadius * 0.98, isMobile ? 138 : 245);
      const sharedNodeOrbitRadius = Math.min(maxSafeRadius * 1.25, isMobile ? 168 : 325);

      const voicePulse = opts.isJarvisSpeaking.value
        ? 1 + Math.sin(time * 8) * 0.09 + Math.cos(time * 13) * 0.05
        : opts.isJarvisAwake.value
        ? 1 + Math.sin(time * 5) * 0.06
        : 1 + Math.sin(time * 2) * 0.02;

      const effectiveCoreR = coreRadius * voicePulse;
      const screenCoreR = effectiveCoreR * cameraZoom.value;

      // Halo Luminoso do Núcleo
      ctx.save();
      const outerHalo = ctx.createRadialGradient(cx, cy, screenCoreR * 0.1, cx, cy, screenCoreR * 1.85);
      outerHalo.addColorStop(0, opts.isJarvisAwake.value ? 'rgba(56, 189, 248, 0.55)' : opts.isJarvisSpeaking.value ? 'rgba(34, 211, 238, 0.65)' : 'rgba(14, 165, 233, 0.34)');
      outerHalo.addColorStop(0.5, 'rgba(2, 132, 199, 0.12)');
      outerHalo.addColorStop(1, 'rgba(2, 6, 23, 0)');
      ctx.fillStyle = outerHalo;
      ctx.beginPath();
      ctx.arc(cx, cy, screenCoreR * 1.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Esfera 3D Central
      ctx.save();
      const sphereGrad = ctx.createRadialGradient(cx - screenCoreR * 0.3, cy - screenCoreR * 0.3, screenCoreR * 0.08, cx, cy, screenCoreR);
      sphereGrad.addColorStop(0, 'rgba(186, 230, 253, 0.42)');
      sphereGrad.addColorStop(0.35, 'rgba(14, 165, 233, 0.22)');
      sphereGrad.addColorStop(0.78, 'rgba(3, 105, 161, 0.32)');
      sphereGrad.addColorStop(1, 'rgba(125, 211, 252, 0.65)');
      ctx.fillStyle = sphereGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, screenCoreR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Anéis Giroscópicos
      const gyroConfigs = [
        { tiltX: 0.65, tiltZ: 0.3, radiusMult: 1.25, speed: 0.7, dash: [8, 6], color: '#38bdf8' },
        { tiltX: -0.55, tiltZ: -0.45, radiusMult: 1.36, speed: -0.5, dash: [18, 10, 4, 10], color: '#0ea5e9' },
        { tiltX: 0.18, tiltZ: 0.85, radiusMult: 1.15, speed: 0.9, dash: [4, 8], color: '#22d3ee' }
      ];

      gyroConfigs.forEach((gyro) => {
        ctx.save();
        ctx.strokeStyle = gyro.color;
        ctx.lineWidth = isActiveState ? 1.5 : 1.1;
        ctx.globalAlpha = isActiveState ? 0.75 : 0.45;
        ctx.setLineDash(gyro.dash);
        ctx.beginPath();
        const ringR = effectiveCoreR * gyro.radiusMult;
        for (let s = 0; s <= 40; s++) {
          const a = (s / 40) * Math.PI * 2 + time * gyro.speed;
          const rx = Math.cos(a) * ringR;
          const ry = Math.sin(a) * ringR * Math.sin(gyro.tiltX);
          const rz = Math.sin(a) * ringR * Math.cos(gyro.tiltZ);
          const p = project3D(rx, ry, rz, cx, cy, fov);
          if (s === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.restore();
      });

      // Malha Geodésica 3D (Fibonacci)
      const projectedGlobePts = globeFibonacciNodes.map((n) => {
        const p = project3D(n.x * effectiveCoreR, n.y * effectiveCoreR, n.z * effectiveCoreR, cx, cy, fov);
        return { ...p, pulseOffset: n.pulseOffset };
      });

      ctx.save();
      for (let i = 0; i < projectedGlobePts.length; i++) {
        const p1 = projectedGlobePts[i];
        const depthFactor = Math.max(0.15, Math.min(1, (effectiveCoreR - p1.z) / (effectiveCoreR * 2)));
        for (let j = i + 1; j < projectedGlobePts.length; j++) {
          const p2 = projectedGlobePts[j];
          const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
          if (dist < screenCoreR * 0.35) {
            ctx.strokeStyle = opts.isJarvisAwake.value ? '#7dd3fc' : '#38bdf8';
            ctx.globalAlpha = depthFactor * (1 - dist / (screenCoreR * 0.35)) * (isActiveState ? 0.7 : 0.42);
            ctx.lineWidth = depthFactor * 1.1;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }

      for (let i = 0; i < projectedGlobePts.length; i++) {
        const pt = projectedGlobePts[i];
        const depthFactor = Math.max(0.2, Math.min(1, (effectiveCoreR - pt.z) / (effectiveCoreR * 2)));
        const nodeSize = (1.1 + depthFactor * 1.5) * cameraZoom.value;
        ctx.fillStyle = depthFactor > 0.65 ? '#e0f2fe' : '#38bdf8';
        ctx.globalAlpha = depthFactor * (0.6 + 0.4 * Math.sin(time * 3 + pt.pulseOffset));
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, nodeSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Centro do Núcleo
      ctx.save();
      const innerCoreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, screenCoreR * 0.42);
      innerCoreGrad.addColorStop(0, '#ffffff');
      innerCoreGrad.addColorStop(0.4, opts.isJarvisAwake.value ? '#7dd3fc' : '#38bdf8');
      innerCoreGrad.addColorStop(1, 'rgba(2, 132, 199, 0)');
      ctx.fillStyle = innerCoreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, screenCoreR * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Memórias em Órbita (anel contido fora do núcleo central)
      (opts.drawMemoryOrbsOnCanvas as any)(ctx, cx, cy, rotationY.value, screenCoreR);

      renderedAgentsHitbox = [];
      renderedSubNodesHitbox = [];
      renderedMemoriesHitbox = [];

      const traceSteps = Array.isArray(liveTrace3D.value) ? liveTrace3D.value : [];
      const hasActiveExecution = Boolean(opts.highlightedAgentSlug.value) || traceSteps.length > 0;
      const activeToolsSet: Set<string> = opts.highlightedToolSlugs?.value || new Set();
      const normKey3D = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      // Distribuição esférica em 3 latitudes + Z-Sorting para profundidade 3D real
      const agentPositionsMap = new Map<any, { ag: any; proj: { x: number; y: number; z: number; scale: number }; color: string }>();
      const totalAgents = Math.max(opts.dynamicAgents.value.length, 1);
      const latitudeBands = [-0.42, 0.05, 0.44];

      opts.dynamicAgents.value.forEach((ag, idx) => {
        const angle = (idx / totalAgents) * Math.PI * 2 + 0.4;
        const lat = latitudeBands[idx % latitudeBands.length];
        const ringR = agentOrbitRadius * Math.cos(lat * 0.65);
        const yPos = agentOrbitRadius * Math.sin(lat) + Math.sin(idx * 1.9 + time * 0.4) * (isMobile ? 8 : 14);

        const rawProj = project3D(Math.cos(angle) * ringR, yPos, Math.sin(angle) * ringR, cx, cy, fov);
        const color = ag.color || AGENT_PALETTE[idx % AGENT_PALETTE.length];
        agentPositionsMap.set(ag.id, { ag, proj: rawProj, color });
      });

      // Ordena do fundo (z maior) para a frente (z menor)
      const sortedAgents = Array.from(agentPositionsMap.values()).sort((a, b) => b.proj.z - a.proj.z);

      // Mapeia agentes visitados no fluxo atual (suporta salto entre múltiplos agentes)
      const visitedAgentStepMap = new Map<string, number>();
      traceSteps.forEach((st: any) => {
        if (st.kind === 'agent' && st.slug) {
          visitedAgentStepMap.set(normKey3D(st.slug), st.step || 1);
        }
      });

      // LOD Inteligente: exibe pílula de nome apenas para os agentes frontais sem colisão ou ativos
      const visibleLabelIds = new Set<any>();
      const occupiedLabelBoxes: Array<{ x: number; y: number }> = [];
      [...sortedAgents].reverse().forEach(({ ag, proj }) => {
        const agNorm = normKey3D(ag.slug);
        const isTarget = opts.highlightedAgentSlug.value === ag.slug || visitedAgentStepMap.has(agNorm);
        if (isTarget) {
          visibleLabelIds.add(ag.id);
          occupiedLabelBoxes.push({ x: proj.x, y: proj.y });
          return;
        }
        if (visibleLabelIds.size >= (isMobile ? 5 : 8) || proj.z > agentOrbitRadius * 0.25) return;
        const hasCollision = occupiedLabelBoxes.some(
          (box) => Math.abs(box.x - proj.x) < (isMobile ? 88 : 120) && Math.abs(box.y - proj.y) < 34
        );
        if (!hasCollision) {
          visibleLabelIds.add(ag.id);
          occupiedLabelBoxes.push({ x: proj.x, y: proj.y });
        }
      });

      // ======================================================================
      // 1. FEIXES SINÁPTICOS (COM DIMMING EM MODO FOCO)
      // ======================================================================
      sortedAgents.forEach(({ ag, proj: agProj, color }, index) => {
        const isAgentActive = opts.highlightedAgentSlug.value === ag.slug || visitedAgentStepMap.has(normKey3D(ag.slug));
        const depthRatio = Math.max(0.25, Math.min(1, (agentOrbitRadius - agProj.z) / (agentOrbitRadius * 2)));
        const beamColor = isAgentActive ? opts.highlightedStatusColor.value : color;

        ctx.save();
        ctx.strokeStyle = beamColor;
        ctx.lineWidth = isAgentActive ? 3.0 : 1.0 * depthRatio;
        ctx.globalAlpha = isAgentActive ? 0.95 : hasActiveExecution ? 0.08 : 0.24 * depthRatio;

        if (isAgentActive) {
          ctx.setLineDash([]);
          ctx.shadowColor = beamColor;
          ctx.shadowBlur = 20;
        } else {
          ctx.setLineDash([2, 6]);
        }

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        const ctrlX = (cx + agProj.x) * 0.5;
        const ctrlY = (cy + agProj.y) * 0.5 - (isAgentActive ? 20 : 10);
        ctx.quadraticCurveTo(ctrlX, ctrlY, agProj.x, agProj.y);
        ctx.stroke();
        ctx.restore();

        if (isAgentActive || (!hasActiveExecution && depthRatio > 0.6)) {
          const photonCount = isAgentActive ? 4 : 1;
          for (let d = 0; d < photonCount; d++) {
            const speed = isAgentActive ? 0.55 : 0.16;
            const t = (time * speed + d * (1 / photonCount) + index * 0.17) % 1;
            const invT = 1 - t;
            const mx = invT * invT * cx + 2 * invT * t * ctrlX + t * t * agProj.x;
            const my = invT * invT * cy + 2 * invT * t * ctrlY + t * t * agProj.y;

            ctx.save();
            ctx.globalAlpha = isAgentActive ? 1.0 : 0.65 * depthRatio;
            ctx.fillStyle = isAgentActive ? '#ffffff' : color;
            ctx.shadowColor = beamColor;
            ctx.shadowBlur = isAgentActive ? 16 : 4;
            ctx.beginPath();
            ctx.arc(mx, my, isAgentActive ? 3.8 : 2.0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      });

      // ======================================================================
      // 2. CONECTORES E TOOLS EXTERNAS (DISCRETOS EM REPOUSO, NÍTIDOS EM FOCO)
      // ======================================================================
      const toolPositionsMap3D = new Map<string, { x: number; y: number; z: number }>();
      const uniqueToolIds = Array.from(
        new Set(opts.dynamicAgents.value.flatMap((ag) => ag.tools || []).map((t: string) => String(t).toLowerCase()))
      );

      uniqueToolIds.forEach((toolId, tIdx) => {
        const meta = opts.getConnectionMeta(toolId);
        const angle = (tIdx / Math.max(uniqueToolIds.length, 1)) * Math.PI * 2 + 0.95;
        const tProj = project3D(
          Math.cos(angle) * sharedNodeOrbitRadius,
          Math.sin(tIdx * 1.7) * (isMobile ? 32 : 52),
          Math.sin(angle) * sharedNodeOrbitRadius,
          cx,
          cy,
          fov
        );
        const normTool = normKey3D(toolId);
        toolPositionsMap3D.set(normTool, tProj);

        const agentsUsingThis = opts.getAgentsUsingTool(toolId);
        const isToolUsedNow = activeToolsSet.has(normTool);
        const isConnectedToActiveAgent = agentsUsingThis.some((cAg) => cAg.slug === opts.highlightedAgentSlug.value);
        const isToolHighlighted = isToolUsedNow || (isConnectedToActiveAgent && activeToolsSet.size === 0);

        const depthRatio = Math.max(0.25, Math.min(1, (sharedNodeOrbitRadius - tProj.z) / (sharedNodeOrbitRadius * 2)));
        const nodeR = (isMobile ? 8.5 : 10.5) * (0.8 + depthRatio * 0.25);

        agentsUsingThis.forEach((cAg) => {
          const agEntry = agentPositionsMap.get(cAg.id);
          if (!agEntry) return;
          const isLineActive = (cAg.slug === opts.highlightedAgentSlug.value || visitedAgentStepMap.has(normKey3D(cAg.slug))) && isToolHighlighted;

          ctx.save();
          ctx.globalAlpha = isLineActive ? 0.95 : hasActiveExecution ? 0.04 : 0.12 * depthRatio;
          ctx.strokeStyle = isLineActive ? '#fbbf24' : agEntry.color;
          ctx.lineWidth = isLineActive ? 2.2 : 0.8;
          ctx.setLineDash(isLineActive ? [] : [2, 5]);
          if (isLineActive) {
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 12;
          }
          ctx.beginPath();
          ctx.moveTo(agEntry.proj.x, agEntry.proj.y);
          ctx.lineTo(tProj.x, tProj.y);
          ctx.stroke();
          ctx.restore();
        });

        ctx.save();
        ctx.globalAlpha = isToolHighlighted ? 1.0 : hasActiveExecution ? 0.16 : 0.42 * depthRatio;
        ctx.fillStyle = isToolHighlighted ? 'rgba(120, 53, 15, 0.95)' : 'rgba(11, 19, 41, 0.85)';
        ctx.strokeStyle = isToolHighlighted ? '#fbbf24' : 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = isToolHighlighted ? 2.0 : 0.9;
        if (isToolHighlighted) {
          ctx.shadowColor = '#fbbf24';
          ctx.shadowBlur = 16;
        }
        ctx.beginPath();
        ctx.arc(tProj.x, tProj.y, nodeR * (isToolHighlighted ? 1.25 : 1), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.font = (isMobile ? 8.5 : 10) + 'px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(meta.icon || '🔌', tProj.x, tProj.y);
        ctx.restore();

        renderedSubNodesHitbox.push({ x: tProj.x, y: tProj.y, r: nodeR + 6, node: { ...meta, toolId } });
      });

      // ======================================================================
      // 3. TRAJETO DIRECIONAL MULTI-SALTO (JARVIS -> AGENTE -> TOOL -> AGENTE)
      // ======================================================================
      if (traceSteps.length > 0) {
        const resolveNodeCoords = (stepItem: any) => {
          if (!stepItem) return { x: cx, y: cy };
          const tNorm = normKey3D(stepItem.slug);
          const nNorm = normKey3D(stepItem.name || '');
          if (stepItem.kind === 'agent') {
            for (const { ag, proj } of agentPositionsMap.values()) {
              const sN = normKey3D(ag.slug);
              const nN = normKey3D(ag.name);
              if (sN === tNorm || nN === tNorm || (nNorm && nN === nNorm) || (sN.length >= 4 && tNorm.includes(sN))) {
                return { x: proj.x, y: proj.y };
              }
            }
          } else {
            for (const [k, pos] of toolPositionsMap3D.entries()) {
              if (k === tNorm || k.includes(tNorm) || tNorm.includes(k)) {
                return { x: pos.x, y: pos.y };
              }
            }
          }
          return null;
        };

        for (let i = 0; i < traceSteps.length; i++) {
          const currStep = traceSteps[i];
          const prevStep = i > 0 ? traceSteps[i - 1] : null;
          const fromPt = prevStep ? (resolveNodeCoords(prevStep) || { x: cx, y: cy }) : { x: cx, y: cy };
          const toPt = resolveNodeCoords(currStep);
          if (!toPt) continue;

          const segColor = currStep.status === 'error' ? '#ef4444' : currStep.kind === 'tool' ? '#fbbf24' : '#34d399';
          ctx.save();
          ctx.strokeStyle = segColor;
          ctx.lineWidth = 2.6;
          ctx.globalAlpha = 0.92;
          ctx.shadowColor = segColor;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.moveTo(fromPt.x, fromPt.y);
          ctx.lineTo(toPt.x, toPt.y);
          ctx.stroke();

          // Seta direcional no meio do trajeto
          const midX = (fromPt.x + toPt.x) * 0.5;
          const midY = (fromPt.y + toPt.y) * 0.5;
          const angle = Math.atan2(toPt.y - fromPt.y, toPt.x - fromPt.x);
          const arrowLen = 7.5;
          ctx.fillStyle = segColor;
          ctx.beginPath();
          ctx.moveTo(midX + Math.cos(angle) * arrowLen, midY + Math.sin(angle) * arrowLen);
          ctx.lineTo(midX + Math.cos(angle + 2.5) * arrowLen, midY + Math.sin(angle + 2.5) * arrowLen);
          ctx.lineTo(midX + Math.cos(angle - 2.5) * arrowLen, midY + Math.sin(angle - 2.5) * arrowLen);
          ctx.closePath();
          ctx.fill();

          // Pulso viajante
          const travelT = (time * 1.3 + i * 0.25) % 1;
          const px = fromPt.x + (toPt.x - fromPt.x) * travelT;
          const py = fromPt.y + (toPt.y - fromPt.y) * travelT;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(px, py, 3.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // ======================================================================
      // 4. AGENTES (COM Z-DEPTH E PÍLULA GLASSMORPHISM SEM COLISÃO)
      // ======================================================================
      sortedAgents.forEach(({ ag, proj, color }) => {
        const stepNum = visitedAgentStepMap.get(normKey3D(ag.slug));
        const isHighlighted = opts.highlightedAgentSlug.value === ag.slug || Boolean(stepNum);
        const statusColor = opts.highlightedStatusColor.value || '#22c55e';
        const depthRatio = Math.max(0.28, Math.min(1, (agentOrbitRadius - proj.z) / (agentOrbitRadius * 2)));
        const baseOrbR = (isMobile ? 14 : 18) * (0.76 + depthRatio * 0.3);
        const orbR = isHighlighted ? baseOrbR * 1.32 + Math.sin(time * 8) * 1.8 : baseOrbR;

        if (isHighlighted) {
          ctx.save();
          const waveR = orbR + 9 + Math.sin(time * 6) * 4;
          ctx.strokeStyle = statusColor;
          ctx.lineWidth = 2.0;
          ctx.shadowColor = statusColor;
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, waveR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        ctx.save();
        ctx.globalAlpha = isHighlighted ? 1.0 : hasActiveExecution ? 0.2 : 0.42 + depthRatio * 0.58;

        if (isHighlighted) {
          const highlightGrad = ctx.createRadialGradient(proj.x - orbR * 0.3, proj.y - orbR * 0.3, 2, proj.x, proj.y, orbR);
          highlightGrad.addColorStop(0, '#ffffff');
          highlightGrad.addColorStop(0.45, statusColor);
          highlightGrad.addColorStop(1, 'rgba(6, 78, 59, 0.95)');
          ctx.fillStyle = highlightGrad;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.shadowColor = statusColor;
          ctx.shadowBlur = 28;
        } else {
          ctx.fillStyle = 'rgba(10, 17, 32, 0.92)';
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.3;
          ctx.shadowColor = color;
          ctx.shadowBlur = depthRatio > 0.7 ? 8 : 0;
        }

        ctx.beginPath();
        ctx.arc(proj.x, proj.y, orbR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.font = Math.round(orbR * 0.78) + 'px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(ag.icon || '🤖', proj.x, proj.y);

        // Badge numérico de ordem no fluxo (1, 2, 3...)
        if (stepNum) {
          ctx.fillStyle = '#10b981';
          ctx.beginPath();
          ctx.arc(proj.x - orbR * 0.74, proj.y - orbR * 0.74, isMobile ? 6.5 : 7.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold ' + (isMobile ? 7.5 : 8.5) + 'px system-ui';
          ctx.fillText(String(stepNum), proj.x - orbR * 0.74, proj.y - orbR * 0.74);
        }

        // Badge de quantidade de tools
        if ((ag.tools || []).length > 0 && (isHighlighted || depthRatio > 0.55)) {
          ctx.fillStyle = isHighlighted ? statusColor : 'rgba(15, 23, 42, 0.95)';
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(proj.x + orbR * 0.74, proj.y - orbR * 0.74, isMobile ? 5.2 : 6.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#e2e8f0';
          ctx.font = 'bold ' + (isMobile ? 6.5 : 7.5) + 'px system-ui';
          ctx.fillText(String(ag.tools.length), proj.x + orbR * 0.74, proj.y - orbR * 0.74);
        }

        // Pílula Glassmorphism com Nome
        if (visibleLabelIds.has(ag.id)) {
          const rawName = ag.name || 'Agente';
          const cleanName = rawName.length > 18 ? rawName.slice(0, 16) + '…' : rawName;
          ctx.font = isHighlighted
            ? '600 ' + (isMobile ? 10 : 11.5) + 'px system-ui, sans-serif'
            : '500 ' + (isMobile ? 8.5 : 9.5) + 'px system-ui, sans-serif';

          const padX = 7;
          const pillW = ctx.measureText(cleanName).width + padX * 2;
          const pillH = isMobile ? 15 : 17;
          const pillY = proj.y + orbR + (isMobile ? 11 : 14);

          ctx.fillStyle = isHighlighted ? 'rgba(6, 78, 59, 0.9)' : 'rgba(9, 14, 28, 0.78)';
          ctx.strokeStyle = isHighlighted ? statusColor : 'rgba(148, 163, 184, 0.22)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(proj.x - pillW / 2, pillY - pillH / 2, pillW, pillH, pillH / 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = isHighlighted ? '#ffffff' : '#cbd5e1';
          ctx.fillText(cleanName, proj.x, pillY);
        }

        ctx.restore();
        renderedAgentsHitbox.push({ x: proj.x, y: proj.y, r: orbR + 6, agent: ag });
      });

      animationFrameId = requestAnimationFrame(renderFrame);
    };

    animationFrameId = requestAnimationFrame(renderFrame);
  }

  function handleStageTap(clientX: number, clientY: number) {
    const isMobile = (window.innerWidth || 360) < 768;
    const cx = (window.innerWidth || 360) * 0.5;
    const cy = (window.innerHeight || 640) * (isMobile ? 0.44 : 0.48);
    const coreHitRadius = (isMobile ? 54 : 85) * cameraZoom.value * 1.25;

    if (Math.hypot(clientX - cx, clientY - cy) <= coreHitRadius) {
      opts.onCoreTap();
      return;
    }

    for (const item of renderedAgentsHitbox) {
      if (Math.hypot(clientX - item.x, clientY - item.y) <= item.r) {
        opts.onSelectAgent(item.agent);
        return;
      }
    }

    for (const sub of renderedSubNodesHitbox) {
      if (Math.hypot(clientX - sub.x, clientY - sub.y) <= sub.r) {
        opts.onSelectSubNode(sub.node);
        return;
      }
    }

    for (const mem of renderedMemoriesHitbox) {
      if (Math.hypot(clientX - mem.x, clientY - mem.y) <= mem.r) {
        opts.onSelectMemory(mem.mem);
        return;
      }
    }
  }

  function onMouseDown(e: MouseEvent) {
    isDragging = true; dragMoved = false; lastMouseX = e.clientX; lastMouseY = e.clientY;
  }
  function onMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    const dx = e.clientX - lastMouseX; const dy = e.clientY - lastMouseY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
    rotationY.value += dx * 0.005;
    rotationX.value = Math.max(-0.8, Math.min(0.8, rotationX.value + dy * 0.005));
    lastMouseX = e.clientX; lastMouseY = e.clientY;
  }
  function onMouseUp(e: MouseEvent) {
    if (isDragging && !dragMoved) handleStageTap(e.clientX, e.clientY);
    isDragging = false;
  }
  function onWheel(e: WheelEvent) {
    cameraZoom.value = Math.max(0.65, Math.min(1.65, cameraZoom.value + (e.deltaY > 0 ? -0.08 : 0.08)));
  }
  function onTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      isDragging = true; dragMoved = false; lastMouseX = e.touches[0].clientX; lastMouseY = e.touches[0].clientY;
    }
  }
  function onTouchMove(e: TouchEvent) {
    if (!isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - lastMouseX; const dy = e.touches[0].clientY - lastMouseY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true;
    rotationY.value += dx * 0.006;
    rotationX.value = Math.max(-0.8, Math.min(0.8, rotationX.value + dy * 0.006));
    lastMouseX = e.touches[0].clientX; lastMouseY = e.touches[0].clientY;
  }
  function onTouchEnd(e: TouchEvent) {
    if (isDragging && !dragMoved && e.changedTouches.length > 0) {
      handleStageTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
    isDragging = false;
  }

  return {
    rotationX,
    rotationY,
    cameraZoom,
    resetView,
    startNeuralCanvasLoop,
    stopAnimationLoop,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onWheel,
    onTouchStart,
    onTouchMove,
    onTouchEnd
  };
}
