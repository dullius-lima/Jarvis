<template>
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
            item.status === 'error' ? 'is-fail' : ''
          ]"
        >
          <small class="step-num">{{ item.step }}</small>
          {{ item.kind === 'agent' ? '🤖' : '🔧' }}
          <strong>{{ item.name }}</strong>
        </span>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  telemetry: any | null;
}>();

const routeHeaderTitle = computed(() => {
  if (props.telemetry?.rotaCompleta) {
    return props.telemetry.rotaCompleta;
  }
  const trace = props.telemetry?.executionTrace || [];
  if (trace.length > 0) {
    const parts = ['🧠 JARVIS', ...trace.map((t: any) => `${t.kind === 'tool' ? '🔧' : '🤖'} ${t.name || t.slug}`)];
    return parts.filter((p, i) => i === 0 || p !== parts[i - 1]).join(' ➔ ');
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
  background: rgba(15, 23, 42, 0.82);
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
  padding: 3px 8px;
  border-radius: 6px;
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
.step-num {
  background: rgba(0, 0, 0, 0.45);
  padding: 0 5px;
  border-radius: 4px;
  font-size: 0.68rem;
  font-weight: bold;
}
</style>
