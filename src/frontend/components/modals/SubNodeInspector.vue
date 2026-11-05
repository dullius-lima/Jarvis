// Painel de detalhes do nó fixo conectado

<template>
  <div v-if="node" class="subnode-inspector">
    <div class="inspector-header">
      <strong class="node-title">
        {{ node.icon || '🔌' }} {{ node.label }}
      </strong>
      <button @click="$emit('close')" class="close-btn" title="Fechar">✕</button>
    </div>

    <div v-if="node.endpoint_url" class="endpoint-badge">
      <strong>{{ node.http_method || 'GET' }}</strong> {{ node.endpoint_url }}
    </div>

    <div class="section-label">
      Agentes conectados ({{ connectedCount }}):
    </div>

    <div class="shared-node-agents-list">
      <label v-for="ag in agents" :key="ag.id" class="shared-agent-row">
        <input
          type="checkbox"
          :checked="isLinked(ag, node.toolId)"
          @change="$emit('toggle-agent', ag, node.toolId)"
        />
        <span>{{ ag.icon || '🤖' }} {{ ag.name }}</span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  node: {
    toolId: string;
    label?: string;
    icon?: string;
    http_method?: string;
    endpoint_url?: string;
    [key: string]: any;
  } | null;
  agents: any[];
  isLinked: (agent: any, toolId: string) => boolean;
  getAgentsUsing: (toolId: string) => any[];
}>();

defineEmits<{
  (e: 'close'): void;
  (e: 'toggle-agent', agent: any, toolId: string): void;
}>();

const connectedCount = computed(() => {
  if (!props.node?.toolId) return 0;
  return props.getAgentsUsing(props.node.toolId).length;
});
</script>

<style scoped>
.subnode-inspector {
  position: fixed;
  top: 66px;
  right: 12px;
  width: min(340px, calc(100vw - 24px));
  max-height: calc(100dvh - 150px);
  overflow-y: auto;
  z-index: 45;
  background: rgba(11, 15, 25, 0.96);
  border: 1px solid rgba(56, 189, 248, 0.4);
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(12px);
}

.inspector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.node-title {
  color: #38bdf8;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 15px;
  cursor: pointer;
  padding: 2px 4px;
}

.close-btn:hover {
  color: #fff;
}

.endpoint-badge {
  font-size: 10.5px;
  color: #10b981;
  word-break: break-all;
  background: rgba(15, 23, 42, 0.9);
  padding: 6px;
  border-radius: 6px;
  margin-bottom: 8px;
  font-family: monospace;
}

.section-label {
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 6px;
}

.shared-node-agents-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 140px;
  overflow-y: auto;
}

.shared-agent-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: #cbd5e1;
  padding: 5px 8px;
  border-radius: 4px;
  background: rgba(15, 23, 42, 0.6);
  cursor: pointer;
}

.shared-agent-row:hover {
  background: rgba(30, 41, 59, 0.8);
}
</style>