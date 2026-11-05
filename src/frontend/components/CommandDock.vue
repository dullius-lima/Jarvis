// Barra inferior (microfone, câmera, tela, input de chat)

<template>
  <footer class="command-dock-wrapper">
    <div class="command-dock">
      <button
        @click="$emit('toggle-mic')"
        :class="['dock-icon-btn', { 'active-mic': isMicActive }]"
        title="Ativar/Desativar Microfone"
      >
        🎙️
      </button>
      <button
        @click="$emit('toggle-cam')"
        :class="['dock-icon-btn', { 'active-cam': isCamActive }]"
        title="Ativar/Desativar Câmera"
      >
        📷
      </button>
      <button
        @click="$emit('toggle-screen')"
        :class="['dock-icon-btn', { 'active-screen': isScreenActive }]"
        title="Compartilhar Tela"
      >
        🖥️
      </button>

      <input
        :value="modelValue"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @keyup.enter="$emit('send')"
        type="text"
        class="dock-input"
        placeholder="Comande o JARVIS ou diga 'Jarvis'..."
        :disabled="isProcessing"
      />

      <button
        @click="$emit('send')"
        class="dock-send-btn"
        :disabled="isProcessing || !modelValue.trim()"
      >
        {{ isProcessing ? '...' : 'Enviar' }}
      </button>
    </div>
  </footer>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string;
  isProcessing: boolean;
  isMicActive: boolean;
  isCamActive: boolean;
  isScreenActive: boolean;
}>();

defineEmits(['update:modelValue', 'send', 'toggle-mic', 'toggle-cam', 'toggle-screen']);
</script>

<style scoped>
.command-dock-wrapper {
  position: fixed;
  bottom: env(safe-area-inset-bottom, 10px);
  left: 0; right: 0;
  z-index: 35;
  display: flex;
  justify-content: center;
  padding: 0 10px 8px;
}
.command-dock {
  width: min(680px, 100%);
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(15, 23, 42, 0.94);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 999px;
  padding: 6px 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.65);
}
.dock-icon-btn {
  width: 34px; height: 34px; border-radius: 50%;
  border: 1px solid #334155; background: #090d16;
  color: #f8fafc; font-size: 15px; display: flex;
  align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;
}
.dock-icon-btn.active-mic { border-color: #22c55e; box-shadow: 0 0 10px rgba(34, 197, 94, 0.6); }
.dock-icon-btn.active-cam { border-color: #38bdf8; box-shadow: 0 0 10px rgba(56, 189, 248, 0.6); }
.dock-icon-btn.active-screen { border-color: #a855f7; box-shadow: 0 0 10px rgba(168, 85, 247, 0.6); }
.dock-input {
  flex: 1; min-width: 0; background: transparent; border: none;
  color: #ffffff; font-size: 13.5px; padding: 6px; outline: none;
}
.dock-send-btn {
  background: linear-gradient(135deg, #0284c7, #2563eb);
  border: none; color: #ffffff; font-weight: 700; font-size: 12px;
  padding: 8px 14px; border-radius: 999px; cursor: pointer; flex-shrink: 0;
}
</style>