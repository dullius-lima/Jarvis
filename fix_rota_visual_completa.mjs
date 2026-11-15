import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// 1. BACKEND: Deduplica prefixos repetidos na rota completa (orchestratorService.ts)
const orchPath = 'src/services/orchestratorService.ts';
if (fs.existsSync(orchPath)) {
  let orchCode = fs.readFileSync(orchPath, 'utf8');
  if (!orchCode.includes('__DEDUP_TRACE_PREFIX__')) {
    const dedupBlock = `// __DEDUP_TRACE_PREFIX__
    {
      const semConsecutivos: any[] = [];
      for (const it of passosRotaFinal) {
        const prev = semConsecutivos[semConsecutivos.length - 1];
        if (prev && prev.kind === it.kind && prev.slug === it.slug) continue;
        semConsecutivos.push(it);
      }
      const trilhaLimpa: any[] = [];
      const agentesVistos = new Set<string>();
      let ignorarToolsRepetidas = false;
      for (const it of semConsecutivos) {
        if (it.kind === 'agent') {
          if (agentesVistos.has(it.slug)) {
            ignorarToolsRepetidas = true;
            continue;
          }
          agentesVistos.add(it.slug);
          ignorarToolsRepetidas = false;
          trilhaLimpa.push(it);
        } else {
          if (ignorarToolsRepetidas) continue;
          trilhaLimpa.push(it);
        }
      }
      passosRotaFinal = trilhaLimpa.map((it, idx) => ({ ...it, step: idx + 1 }));
    }
    rotaCompletaTexto =`;

    if (orchCode.includes('rotaCompletaTexto =')) {
      orchCode = orchCode.replace(/rotaCompletaTexto\s*=/, dedupBlock);
      fs.writeFileSync(orchPath, orchCode, 'utf8');
      console.log('✅ Deduplicação de prefixos aplicada em orchestratorService.ts');
    }
  }
}

// 2. FRONTEND: Garante que qualquer chamada a registerAgentExecution receba o objeto completo (com executionTrace)
function walkDir(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full, fileList);
    else if (/\.(vue|ts)$/.test(entry.name)) fileList.push(full);
  }
  return fileList;
}

for (const file of walkDir('src/frontend')) {
  if (file.endsWith('useMemoryOrbs.ts')) continue;
  let content = fs.readFileSync(file, 'utf8');
  // Se algum composable/componente montar um objeto manual para registerAgentExecution sem executionTrace, injeta executionTrace
  if (content.includes('registerAgentExecution({') && !content.includes('executionTrace:')) {
    content = content.replace(
      /(registerAgentExecution\(\{\s*)/g,
      `$1executionTrace: (typeof payload !== 'undefined' ? payload?.executionTrace : undefined) || (typeof data !== 'undefined' ? (data?.data?.executionTrace || data?.executionTrace) : undefined) || [], `
    );
    fs.writeFileSync(file, content, 'utf8');
    console.log(`✅ Repasse de executionTrace garantido em ${file}`);
  }
}

// 3. FRONTEND: Atualiza useMemoryOrbs.ts (mantém o percurso aceso por 30s para visualização confortável)
const orbsPath = 'src/frontend/composables/useMemoryOrbs.ts';
if (fs.existsSync(orbsPath)) {
  let orbsCode = fs.readFileSync(orbsPath, 'utf8');
  orbsCode = orbsCode.replace(/\+\s*14000\)/g, '+ 30000)');
  fs.writeFileSync(orbsPath, orbsCode, 'utf8');
  console.log('✅ Tempo de retenção visual ajustado para 30s em useMemoryOrbs.ts');
}

// 4. FRONTEND: Atualiza AgentTelemetryBadge.vue para mostrar TODOS os agentes da cadeia no topo e cada passo abaixo
const badgePath = 'src/frontend/components/AgentTelemetryBadge.vue';
if (fs.existsSync(badgePath)) {
  const updatedBadge = `<template>
  <div v-if="telemetry" class="telemetry-wrapper">
    <div class="telemetry-pill" :class="telemetry.success ? 'is-ok' : 'is-err'">
      <span class="status-dot"></span>
      <span class="status-label">
        {{ telemetry.success ? '✅ Rota:' : '❌ Falha:' }}
      </span>
      <strong class="agent-name">{{ routeHeaderTitle }}</strong>

      <span v-if="telemetry.memoryStored" class="memory-indicator" title="Memória persistida no PostgreSQL">
        🔵 ({{ telemetry.memoryCount }})
      </span>

      <small v-if="telemetry.executionTimeMs > 0" class="latency">
        ⚡ {{ telemetry.executionTimeMs }}ms
      </small>
    </div>

    <div v-if="telemetry.executionTrace && telemetry.executionTrace.length > 0" class="trace-chain">
      <span class="trace-node is-core">🧠 JARVIS</span>
      <template v-for="item in telemetry.executionTrace" :key="item.step + '_' + item.slug">
        <span class="trace-arrow">➔</span>
        <span
          class="trace-node"
          :class="[
            item.kind === 'agent' ? 'is-agent' : 'is-tool',
            item.status === 'error' ? 'is-fail' : '',
            activeStep?.step === item.step ? 'is-pulsing' : ''
          ]"
          :title="'Acionado por: ' + (item.parentSlug || 'jarvis_core')"
        >
          <small class="step-num">{{ item.step }}</small>
          {{ item.kind === 'agent' ? '🤖' : '🔧' }}
          <strong>{{ item.name }}</strong>
        </span>
      </template>
      <button type="button" class="replay-btn" @click="$emit('replay')" title="Repetir animação do percurso no 3D">
        🔁 Replay
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AgentTriggerTelemetry, TraceStepItem } from '../composables/useMemoryOrbs';

const props = defineProps<{
  telemetry: AgentTriggerTelemetry | null;
  activeStep?: TraceStepItem | null;
}>();

defineEmits<{ (e: 'replay'): void }>();

const routeHeaderTitle = computed(() => {
  const trace = props.telemetry?.executionTrace || [];
  const agents = trace.filter((t) => t.kind === 'agent').map((t) => t.name || t.slug);
  const uniqueAgents = agents.filter((name, idx) => idx === 0 || name !== agents[idx - 1]);
  if (uniqueAgents.length > 1) {
    return uniqueAgents.join(' ➔ ');
  }
  return props.telemetry?.agentName || 'JARVIS';
});
</script>

<style scoped>
.telemetry-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}
.telemetry-pill {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 14px;
  font-size: 0.78rem;
  backdrop-filter: blur(8px);
  max-width: 100%;
}
.telemetry-pill.is-ok {
  background: rgba(16, 185, 129, 0.14);
  border: 1px solid rgba(34, 197, 94, 0.55);
  color: #4ade80;
}
.telemetry-pill.is-err {
  background: rgba(239, 68, 68, 0.16);
  border: 1px solid rgba(239, 68, 68, 0.6);
  color: #f87171;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 8px currentColor;
  flex-shrink: 0;
}
.agent-name {
  color: #f8fafc;
  word-break: break-word;
}
.memory-indicator {
  color: #38bdf8;
  font-weight: 600;
}
.latency {
  color: #94a3b8;
}
.trace-chain {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.78);
  border: 1px solid rgba(56, 189, 248, 0.35);
  font-size: 0.74rem;
}
.trace-arrow {
  color: #38bdf8;
  font-weight: bold;
}
.trace-node {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 6px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.trace-node.is-core {
  background: rgba(14, 165, 233, 0.2);
  border: 1px solid rgba(56, 189, 248, 0.55);
  color: #7dd3fc;
}
.trace-node.is-agent {
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid rgba(52, 211, 153, 0.6);
  color: #6ee7b7;
}
.trace-node.is-tool {
  background: rgba(245, 158, 11, 0.2);
  border: 1px solid rgba(251, 191, 36, 0.6);
  color: #fcd34d;
}
.trace-node.is-fail {
  background: rgba(239, 68, 68, 0.22);
  border-color: rgba(248, 113, 113, 0.7);
  color: #fca5a5;
}
.trace-node.is-pulsing {
  transform: scale(1.08);
  box-shadow: 0 0 14px rgba(56, 189, 248, 0.85);
  border-color: #ffffff;
}
.step-num {
  background: rgba(0, 0, 0, 0.45);
  padding: 0 5px;
  border-radius: 4px;
  font-size: 0.68rem;
  font-weight: bold;
}
.replay-btn {
  margin-left: auto;
  background: rgba(56, 189, 248, 0.2);
  border: 1px solid rgba(56, 189, 248, 0.55);
  color: #7dd3fc;
  border-radius: 6px;
  padding: 3px 9px;
  font-size: 0.72rem;
  cursor: pointer;
}
.replay-btn:hover {
  background: rgba(56, 189, 248, 0.35);
}
</style>
`;
  fs.writeFileSync(badgePath, updatedBadge, 'utf8');
  console.log('✅ AgentTelemetryBadge.vue atualizado com rota completa no cabeçalho e passos detalhados!');
}

// 5. FRONTEND: Garante injeção real dos feixes direcionais e HUD de percurso no Grafo 3D (useNeuralCanvas.ts)
const canvasPath = 'src/frontend/composables/useNeuralCanvas.ts';
if (fs.existsSync(canvasPath)) {
  let canvasCode = fs.readFileSync(canvasPath, 'utf8');

  if (!canvasCode.includes('__DIRECTIONAL_TRACE_3D_V2__')) {
    const beamAndHudCode = `
      // __DIRECTIONAL_TRACE_3D_V2__
      if (typeof traceList3D !== 'undefined' && Array.isArray(traceList3D) && traceList3D.length > 0 && currentTraceIdx3D >= 0) {
        const resolveNodeCoords3D = (stepItem: any) => {
          if (!stepItem) return { x: cx, y: cy };
          const targetNorm = normKey3D(stepItem.slug);
          const nameNorm = normKey3D(stepItem.name || '');
          if (stepItem.kind === 'agent') {
            for (const { ag, proj } of agentPositionsMap.values()) {
              const sN = normKey3D(ag.slug);
              const nN = normKey3D(ag.name);
              if (sN === targetNorm || nN === targetNorm || (nameNorm && nN === nameNorm) || (sN.length >= 4 && targetNorm.includes(sN))) {
                return { x: proj.x, y: proj.y };
              }
            }
          } else {
            for (const [k, pos] of toolPositionsMap3D.entries()) {
              if (k === targetNorm || k.includes(targetNorm) || targetNorm.includes(k)) {
                return { x: pos.x, y: pos.y };
              }
            }
            if (stepItem.parentSlug) {
              const pNorm = normKey3D(stepItem.parentSlug);
              for (const { ag, proj } of agentPositionsMap.values()) {
                if (normKey3D(ag.slug) === pNorm) {
                  return { x: proj.x + 28, y: proj.y - 26 };
                }
              }
            }
          }
          return null;
        };

        const maxIdx = Math.min(currentTraceIdx3D, traceList3D.length - 1);
        for (let i = 0; i <= maxIdx; i++) {
          const currStep = traceList3D[i];
          const prevStep = i > 0 ? traceList3D[i - 1] : null;
          const fromPt = prevStep ? (resolveNodeCoords3D(prevStep) || { x: cx, y: cy }) : { x: cx, y: cy };
          const toPt = resolveNodeCoords3D(currStep);
          if (!toPt) continue;

          const isCurrent = i === currentTraceIdx3D;
          const segColor = currStep.status === 'error' ? '#ef4444' : currStep.kind === 'tool' ? '#fbbf24' : '#34d399';

          ctx.save();
          ctx.strokeStyle = segColor;
          ctx.lineWidth = isCurrent ? 3.2 : 2.0;
          ctx.globalAlpha = isCurrent ? 1.0 : 0.78;
          ctx.shadowColor = segColor;
          ctx.shadowBlur = isCurrent ? 16 : 6;
          ctx.setLineDash([]);

          ctx.beginPath();
          ctx.moveTo(fromPt.x, fromPt.y);
          ctx.lineTo(toPt.x, toPt.y);
          ctx.stroke();

          // Seta direcional no centro da linha
          const midX = (fromPt.x + toPt.x) * 0.5;
          const midY = (fromPt.y + toPt.y) * 0.5;
          const angle = Math.atan2(toPt.y - fromPt.y, toPt.x - fromPt.x);
          const arrowLen = isCurrent ? 9 : 6.5;

          ctx.fillStyle = segColor;
          ctx.beginPath();
          ctx.moveTo(midX + Math.cos(angle) * arrowLen, midY + Math.sin(angle) * arrowLen);
          ctx.lineTo(midX + Math.cos(angle + 2.5) * arrowLen, midY + Math.sin(angle + 2.5) * arrowLen);
          ctx.lineTo(midX + Math.cos(angle - 2.5) * arrowLen, midY + Math.sin(angle - 2.5) * arrowLen);
          ctx.closePath();
          ctx.fill();

          if (isCurrent) {
            const travelT = (time * 1.5) % 1;
            const px = fromPt.x + (toPt.x - fromPt.x) * travelT;
            const py = fromPt.y + (toPt.y - fromPt.y) * travelT;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(px, py, 4.5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // Banner HUD no topo do Canvas 3D mostrando o trajeto completo em tempo real
        const resumoCaminho = ['🧠 JARVIS', ...traceList3D.slice(0, maxIdx + 1).map((s: any) => \`\${s.step}.\${s.kind === 'tool' ? '🔧' : '🤖'}\${s.name}\`)].join(' ➔ ');
        ctx.save();
        ctx.font = \`600 \${isMobile ? 10 : 11.5}px system-ui, sans-serif\`;
        const textW = Math.min(width - 24, ctx.measureText(resumoCaminho).width + 24);
        const boxX = (width - textW) * 0.5;
        const boxY = isMobile ? 64 : 72;
        ctx.fillStyle = 'rgba(2, 6, 23, 0.84)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, textW, 26, 13);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#e0f2fe';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const textoExibido = resumoCaminho.length > (isMobile ? 48 : 85) ? '…' + resumoCaminho.slice(-(isMobile ? 47 : 84)) : resumoCaminho;
        ctx.fillText(textoExibido, width * 0.5, boxY + 13);
        ctx.restore();
      }
`;

    // Âncora garantida: imediatamente antes de loopar agentPositionsMap para desenhar os orbes
    const anchor = /(Array\.from\(agentPositionsMap\.values\(\)\)\.forEach\(\(\{\s*ag,\s*proj,\s*color\s*\}\)\s*=>\s*\{)/;
    if (!anchor.test(canvasCode)) {
      throw new Error('Âncora de renderização dos agentes não encontrada em useNeuralCanvas.ts');
    }
    canvasCode = canvasCode.replace(anchor, `${beamAndHudCode}\n      $1`);
    fs.writeFileSync(canvasPath, canvasCode, 'utf8');
    console.log('✅ Feixes direcionais 3D e banner HUD do trajeto injetados com sucesso!');
  }
}

// 6. Compila Backend e Frontend e verifica se o novo bundle contém o código atualizado
console.log('🔨 Compilando backend...');
execSync('npm run build', { stdio: 'inherit' });

console.log('🎨 Compilando frontend...');
execSync('npm run build:frontend', { stdio: 'inherit' });

const distAssets = fs.readdirSync('dist/assets').filter((f) => f.startsWith('main-') && f.endsWith('.js'));
const bundleOk = distAssets.some((f) => fs.readFileSync(path.join('dist/assets', f), 'utf8').includes('__DIRECTIONAL_TRACE_3D_V2__'));
if (!bundleOk) {
  throw new Error('O bundle compilado em dist/assets não contém __DIRECTIONAL_TRACE_3D_V2__');
}
console.log(`✅ Verificado no bundle de produção: ${distAssets.join(', ')}`);

console.log('🚀 Reiniciando PM2...');
execSync('pm2 restart all --update-env', { stdio: 'inherit' });
