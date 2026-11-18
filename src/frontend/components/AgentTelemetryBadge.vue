<template>
  <div
    v-if="telemetry"
    class="hud-route-bar"
    :class="telemetry.success ? 'is-ok' : 'is-err'"
  >
    <span class="route-led"></span>

    <div class="route-track">
      <span class="node-chip is-core">🧠 JARVIS</span>

      <template v-for="(st, idx) in normalizedSteps" :key="idx">
        <span class="route-arrow">➔</span>
        <span
          class="node-chip"
          :class="[
            st.kind === 'tool' ? 'is-tool' : 'is-agent',
            st.status === 'error' ? 'is-fail' : ''
          ]"
        >
          <span class="step-num">{{ st.step || idx + 1 }}</span>
          <span>{{ st.kind === 'tool' ? '🔧' : '🤖' }}</span>
          <span class="step-name">{{ st.name || st.slug }}</span>
        </span>
      </template>
    </div>

    <div class="route-meta">
      <span v-if="telemetry.memoryStored" class="meta-mem">
        🔵 {{ telemetry.memoryCount }}
      </span>
      <span v-if="telemetry.executionTimeMs > 0" class="meta-ms">
        ⚡ {{ formattedTime }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AgentTriggerTelemetry } from '../composables/useMemoryOrbs';

const props = defineProps<{
  telemetry: (AgentTriggerTelemetry & {
    executionTrace?: any[];
    rotaCompleta?: string;
  }) | null;
}>();

const normalizedSteps = computed(() => {
  const t = props.telemetry;
  if (!t) return [];
  if (Array.isArray(t.executionTrace) && t.executionTrace.length > 0) {
    return t.executionTrace;
  }
  if (t.agentSlug && t.agentSlug !== 'jarvis_core') {
    return [
      {
        step: 1,
        kind: 'agent',
        slug: t.agentSlug,
        name: t.agentName || t.agentSlug,
        status: t.success ? 'ok' : 'error'
      }
    ];
  }
  return [];
});

const formattedTime = computed(() => {
  const ms = Number(props.telemetry?.executionTimeMs || 0);
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
  return ms + 'ms';
});
</script>

<style scoped>
.hud-route-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border-radius: 10px;
  background: rgba(6, 12, 26, 0.85);
  border: 1px solid rgba(56, 189, 248, 0.25);
  font-size: 11px;
  min-width: 0;
}

.hud-route-bar.is-ok {
  border-color: rgba(16, 185, 129, 0.38);
}

.hud-route-bar.is-err {
  border-color: rgba(239, 68, 68, 0.5);
}

.route-led {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
}

.is-err .route-led {
  background: #ef4444;
  box-shadow: 0 0 8px #ef4444;
}

.route-track {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.route-track::-webkit-scrollbar {
  display: none;
}

.node-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 999px;
  white-space: nowrap;
  font-size: 10.5px;
  font-weight: 600;
  flex-shrink: 0;
}

.node-chip.is-core {
  background: rgba(14, 165, 233, 0.16);
  border: 1px solid rgba(56, 189, 248, 0.45);
  color: #7dd3fc;
}

.node-chip.is-agent {
  background: rgba(16, 185, 129, 0.16);
  border: 1px solid rgba(52, 211, 153, 0.5);
  color: #6ee7b7;
}

.node-chip.is-tool {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(251, 191, 36, 0.48);
  color: #fcd34d;
}

.node-chip.is-fail {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(248, 113, 113, 0.6);
  color: #fca5a5;
}

.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  font-size: 9px;
  font-weight: 700;
}

.route-arrow {
  color: #64748b;
  font-size: 10px;
  flex-shrink: 0;
}

.route-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding-left: 4px;
  border-left: 1px solid rgba(148, 163, 184, 0.2);
  font-size: 10px;
}

.meta-mem {
  color: #38bdf8;
  font-weight: 600;
}

.meta-ms {
  color: #94a3b8;
}
</style>
