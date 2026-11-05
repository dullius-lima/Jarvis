// Balão flutuante de resposta do JARVIS com latência

<template>
  <transition name="fade">
    <div v-if="response" class="response-bubble">
      <slot name="telemetry"></slot>
      <div class="response-header">
        <span>⚡ <strong>{{ response.agent }}</strong> ({{ response.executionTimeMs || 0 }}ms)</span>
        <button @click="$emit('close')" class="close-bubble" title="Fechar">✕</button>
      </div>
      <div class="response-text">{{ response.text }}</div>
    </div>
  </transition>
</template>

<script setup lang="ts">
defineProps<{
  response: {
    agent: string;
    text: string;
    executionTimeMs?: number;
  } | null;
}>();

defineEmits<{
  (e: 'close'): void;
}>();
</script>

<style scoped>
.response-bubble {
  position: fixed;
  bottom: 104px;
  left: 50%;
  transform: translateX(-50%);
  width: min(560px, calc(100vw - 24px));
  max-height: 36dvh;
  overflow-y: auto;
  z-index: 40;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid #38bdf8;
  border-radius: 12px;
  padding: 10px 14px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(10px);
}

.response-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11.5px;
  color: #38bdf8;
  margin-bottom: 6px;
}

.response-text {
  font-size: 13px;
  line-height: 1.45;
  color: #f1f5f9;
  white-space: pre-wrap;
}

.close-bubble {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 13px;
  padding: 2px 4px;
}
.close-bubble:hover {
  color: #fff;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 10px);
}
</style>