// Inspetor de sinapses e resumos de conversas

<template>
  <div v-if="memory" class="subnode-inspector memory-inspector">
    <div class="inspector-header">
      <strong class="memory-title">• Sinapse de Memória</strong>
      <button @click="$emit('close')" class="close-btn" title="Fechar">✕</button>
    </div>

    <div class="agent-origin">
      Produzida por: <strong>{{ memory.agentName || 'JARVIS' }}</strong> ↔ <strong>JARVIS</strong>
    </div>

    <div class="memory-summary">
      {{ memory.summary }}
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  memory: {
    id?: number | string;
    agentId?: number | string;
    agentName?: string;
    summary?: string;
    [key: string]: any;
  } | null;
}>();

defineEmits<{
  (e: 'close'): void;
}>();
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
  border: 1px solid rgba(168, 85, 247, 0.45);
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(12px);
}

.inspector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.memory-title {
  color: #a855f7;
  font-size: 12.5px;
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

.agent-origin {
  font-size: 11px;
  color: #cbd5e1;
  margin-bottom: 6px;
}

.agent-origin strong {
  color: #f8fafc;
}

.memory-summary {
  font-size: 11px;
  color: #94a3b8;
  background: rgba(15, 23, 42, 0.9);
  padding: 8px;
  border-radius: 6px;
  max-height: 110px;
  overflow-y: auto;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>