<template>
  <div v-if="telemetry" class="telemetry-pill" :class="telemetry.success ? 'is-ok' : 'is-err'">
    <span class="status-dot"></span>
    <span class="status-label">
      {{ telemetry.success ? '✅ Agente Acionado:' : '❌ Falha no Agente:' }}
    </span>
    <strong class="agent-name">{{ telemetry.agentName }}</strong>
    <code class="agent-slug">{{ telemetry.agentSlug }}</code>

    <span v-if="telemetry.memoryStored" class="memory-indicator" title="Memória persistida no PostgreSQL">
      🔵 Memória Azul ({{ telemetry.memoryCount }})
    </span>

    <small v-if="telemetry.executionTimeMs > 0" class="latency">
      ⚡ {{ telemetry.executionTimeMs }}ms
    </small>
  </div>
</template>

<script setup lang="ts">
import type { AgentTriggerTelemetry } from '../composables/useMemoryOrbs';

defineProps<{
  telemetry: AgentTriggerTelemetry | null;
}>();
</script>

<style scoped>
.telemetry-pill {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 0.78rem;
  backdrop-filter: blur(8px);
  margin-bottom: 8px;
  transition: all 0.25s ease;
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
}
.agent-name {
  color: #f8fafc;
}
.agent-slug {
  background: rgba(15, 23, 42, 0.75);
  color: #38bdf8;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}
.memory-indicator {
  color: #38bdf8;
  font-weight: 600;
}
.latency {
  color: #94a3b8;
}
</style>