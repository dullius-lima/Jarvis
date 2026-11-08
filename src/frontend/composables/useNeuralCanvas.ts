// src/frontend/composables/useNeuralCanvas.ts
import { ref, Ref } from 'vue';
import { AGENT_PALETTE } from './useEcosystem';

interface CanvasOptions {
  neuralCanvas: Ref<HTMLCanvasElement | null>;
  dynamicAgents: Ref<any[]>;
  memoryDots: Ref<any[]>;
  getConnectionMeta: (toolId: string) => any;
  getAgentsUsingTool: (toolId: string) => any[];
  drawMemoryOrbsOnCanvas: (ctx: CanvasRenderingContext2D, cx: number, cy: number, rotY: number) => void;
  highlightedAgentSlug: Ref<string | null>;
  highlightedStatusColor: Ref<string>;
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

      // Memórias em Órbita
      opts.drawMemoryOrbsOnCanvas(ctx, cx, cy, rotationY.value);

      renderedAgentsHitbox = [];
      renderedSubNodesHitbox = [];
      renderedMemoriesHitbox = [];

      const agentPositionsMap = new Map<any, { ag: any; proj: { x: number; y: number; scale: number }; color: string }>();
      const totalAgents = Math.max(opts.dynamicAgents.value.length, 1);

      opts.dynamicAgents.value.forEach((ag, idx) => {
        const angle = (idx / totalAgents) * Math.PI * 2 + 0.4;
        const heightOffset = Math.sin(idx * 2.1 + time * 0.45) * (isMobile ? 18 : 30);
        const rawProj = project3D(Math.cos(angle) * agentOrbitRadius, heightOffset, Math.sin(angle) * agentOrbitRadius, cx, cy, fov);
        const color = ag.color || AGENT_PALETTE[idx % AGENT_PALETTE.length];
        agentPositionsMap.set(ag.id, { ag, proj: { x: rawProj.x, y: rawProj.y, scale: rawProj.scale }, color });
      });

      // ======================================================================
      // 1. FEIXES SINÁPTICOS (COM DESTAQUE EM ALTA ENERGIA PARA O AGENTE ACIONADO)
      // ======================================================================
      Array.from(agentPositionsMap.values()).forEach(({ ag, proj: agProj, color }, index) => {
        const isAgentActive = opts.highlightedAgentSlug.value === ag.slug;
        const beamColor = isAgentActive ? opts.highlightedStatusColor.value : color;

        ctx.save();
        ctx.strokeStyle = beamColor;
        ctx.lineWidth = isAgentActive ? 3.5 : 1.1;
        ctx.globalAlpha = isAgentActive ? 1.0 : 0.35;
        if (isAgentActive) {
          ctx.setLineDash([]); // Linha sólida luminosa
          ctx.shadowColor = beamColor;
          ctx.shadowBlur = 25;
        } else {
          ctx.setLineDash([3, 5]);
        }

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        const ctrlX = (cx + agProj.x) * 0.5;
        const ctrlY = (cy + agProj.y) * 0.5 - (isAgentActive ? 22 : 14);
        ctx.quadraticCurveTo(ctrlX, ctrlY, agProj.x, agProj.y);
        ctx.stroke();
        ctx.restore();

        // Fótons de Dados viajando no feixe
        const photonCount = isAgentActive ? 5 : 2;
        for (let d = 0; d < photonCount; d++) {
          const speed = isAgentActive ? 0.48 : 0.18;
          const t = (time * speed + d * (1 / photonCount) + index * 0.15) % 1;
          const invT = 1 - t;
          const mx = invT * invT * cx + 2 * invT * t * ctrlX + t * t * agProj.x;
          const my = invT * invT * cy + 2 * invT * t * ctrlY + t * t * agProj.y;

          ctx.save();
          ctx.globalAlpha = isAgentActive ? 1.0 : 0.85;
          ctx.fillStyle = isAgentActive ? '#ffffff' : color;
          ctx.shadowColor = beamColor;
          ctx.shadowBlur = isAgentActive ? 18 : 6;
          ctx.beginPath();
          ctx.arc(mx, my, (isAgentActive ? 4.2 : isMobile ? 2.3 : 3.0), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });

      // ======================================================================
      // 2. CONECTORES E TOOLS EXTERNAS (ILUMINAÇÃO SE AGENTE ATIVO ESTIVER VINCULADO)
      // ======================================================================
      const uniqueToolIds = Array.from(new Set(opts.dynamicAgents.value.flatMap((ag) => ag.tools || []).map((t: string) => String(t).toLowerCase())));
      uniqueToolIds.forEach((toolId, tIdx) => {
        const meta = opts.getConnectionMeta(toolId);
        const angle = (tIdx / Math.max(uniqueToolIds.length, 1)) * Math.PI * 2 + 0.95;
        const tProj = project3D(Math.cos(angle) * sharedNodeOrbitRadius, Math.cos(tIdx * 2.1) * (isMobile ? 24 : 40), Math.sin(angle) * sharedNodeOrbitRadius, cx, cy, fov);
        const nodeR = isMobile ? 9 : 11;

        const agentsUsingThis = opts.getAgentsUsingTool(toolId);
        const isToolConnectedToActive = agentsUsingThis.some((cAg) => cAg.slug === opts.highlightedAgentSlug.value);

        agentsUsingThis.forEach((cAg) => {
          const agEntry = agentPositionsMap.get(cAg.id);
          if (agEntry) {
            const isLineActive = cAg.slug === opts.highlightedAgentSlug.value;
            ctx.save();
            ctx.globalAlpha = isLineActive ? 0.95 : 0.28;
            ctx.strokeStyle = isLineActive ? opts.highlightedStatusColor.value : agEntry.color;
            ctx.lineWidth = isLineActive ? 2.4 : 0.9;
            ctx.setLineDash(isLineActive ? [] : [2, 4]);
            if (isLineActive) {
              ctx.shadowColor = opts.highlightedStatusColor.value;
              ctx.shadowBlur = 12;
            }
            ctx.beginPath();
            ctx.moveTo(agEntry.proj.x, agEntry.proj.y);
            ctx.lineTo(tProj.x, tProj.y);
            ctx.stroke();
            ctx.restore();
          }
        });

        ctx.save();
        ctx.fillStyle = isToolConnectedToActive ? 'rgba(6, 78, 59, 0.95)' : 'rgba(11, 19, 41, 0.92)';
        ctx.strokeStyle = isToolConnectedToActive ? opts.highlightedStatusColor.value : 'rgba(56, 189, 248, 0.7)';
        ctx.lineWidth = isToolConnectedToActive ? 2.2 : 1.1;
        if (isToolConnectedToActive) {
          ctx.shadowColor = opts.highlightedStatusColor.value;
          ctx.shadowBlur = 16;
        }
        ctx.beginPath();
        ctx.arc(tProj.x, tProj.y, nodeR * (isToolConnectedToActive ? 1.25 : 1), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.font = `${isMobile ? 9 : 11}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(meta.icon || '🔌', tProj.x, tProj.y);
        ctx.restore();

        renderedSubNodesHitbox.push({ x: tProj.x, y: tProj.y, r: nodeR + 5, node: { ...meta, toolId } });
      });

      // ======================================================================
      // 3. AGENTES (DESTAQUE CÊNICO MASSIVO NO AGENTE ACIONADO)
      // ======================================================================
      Array.from(agentPositionsMap.values()).forEach(({ ag, proj, color }) => {
        const isHighlighted = opts.highlightedAgentSlug.value === ag.slug;
        const statusColor = opts.highlightedStatusColor.value || '#22c55e';
        const baseOrbR = isMobile ? 16 : 20;
        const orbR = isHighlighted ? baseOrbR * 1.38 + Math.sin(time * 8) * 2.2 : baseOrbR;

        // ONDAS DE RADAR / SHOCKWAVE EXPANSIVAS (QUANDO O AGENTE ESTÁ ACIONADO)
        if (isHighlighted) {
          ctx.save();
          // Onda de Choque Externa 1
          const wave1R = orbR + 12 + Math.sin(time * 6) * 5;
          ctx.strokeStyle = statusColor;
          ctx.lineWidth = 2.4;
          ctx.shadowColor = statusColor;
          ctx.shadowBlur = 28;
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, wave1R, 0, Math.PI * 2);
          ctx.stroke();

          // Onda de Expansão Contínua 2
          const expansion = (time * 30) % 22;
          const wave2R = orbR + 14 + expansion;
          ctx.strokeStyle = statusColor;
          ctx.globalAlpha = Math.max(0, 1 - expansion / 22);
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, wave2R, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          // BADGE FLUTUANTE SUPERIOR INDICANDO "⚡ AGENTE ATIVO"
          ctx.save();
          const badgeText = opts.isProcessing.value ? '⚡ EXECUTANDO...' : '● AGENTE ATIVO';
          const badgeY = proj.y - orbR - 16;
          ctx.font = 'bold 9px system-ui';
          const textW = ctx.measureText(badgeText).width + 14;

          ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
          ctx.strokeStyle = statusColor;
          ctx.lineWidth = 1.5;
          ctx.shadowColor = statusColor;
          ctx.shadowBlur = 14;

          ctx.beginPath();
          ctx.roundRect(proj.x - textW / 2, badgeY - 8, textW, 16, 8);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = statusColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(badgeText, proj.x, badgeY);
          ctx.restore();
        }

        // ESFERA PRINCIPAL DO AGENTE
        ctx.save();
        if (isHighlighted) {
          const highlightGrad = ctx.createRadialGradient(
            proj.x - orbR * 0.3,
            proj.y - orbR * 0.3,
            2,
            proj.x,
            proj.y,
            orbR
          );
          highlightGrad.addColorStop(0, '#ffffff');
          highlightGrad.addColorStop(0.4, statusColor);
          highlightGrad.addColorStop(1, 'rgba(6, 78, 59, 0.95)');
          ctx.fillStyle = highlightGrad;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3.0;
          ctx.shadowColor = statusColor;
          ctx.shadowBlur = 35;
        } else {
          ctx.fillStyle = 'rgba(11, 18, 34, 0.92)';
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.4;
          ctx.shadowColor = color;
          ctx.shadowBlur = 5;
        }

        ctx.beginPath();
        ctx.arc(proj.x, proj.y, orbR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Ícone do Agente
        ctx.font = `${(isHighlighted ? 18 : isMobile ? 12.5 : 15)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(ag.icon || '🤖', proj.x, proj.y);

        // Contador de Tools no Canto do Nó
        if ((ag.tools || []).length > 0) {
          ctx.fillStyle = isHighlighted ? statusColor : '#0284c7';
          ctx.beginPath();
          ctx.arc(proj.x + orbR * 0.72, proj.y - orbR * 0.72, isMobile ? 5.5 : 7.0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${isMobile ? 7 : 8.5}px system-ui`;
          ctx.fillText(String(ag.tools.length), proj.x + orbR * 0.72, proj.y - orbR * 0.72);
        }

        // Rótulo do Nome do Agente
        ctx.font = isHighlighted
          ? `bold ${isMobile ? 10.5 : 12.5}px system-ui`
          : `500 ${isMobile ? 8.5 : 10}px system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = isHighlighted ? '#ffffff' : 'rgba(203, 213, 225, 0.88)';
        if (isHighlighted) {
          ctx.shadowColor = statusColor;
          ctx.shadowBlur = 12;
        }

        const rawName = ag.name || 'Agente';
        const cleanName = rawName.length > 16 ? rawName.slice(0, 14) + '…' : rawName;
        ctx.fillText(cleanName, proj.x, proj.y + orbR + (isMobile ? 10 : 14));
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
