<!-- src/frontend/components/CommandDock.vue -->
<template>
  <footer class="command-dock-wrapper">
    <!-- Pílula de Status Luminosa -->
    <div
      class="hud-status-badge"
      :class="{ awake: isJarvisAwake, speaking: isJarvisSpeaking }"
      @click="$emit('toggle-mic')"
    >
      <span class="status-dot"></span>
      <span>{{ voiceStatusText }}</span>
    </div>

    <!-- Barra de Ações e Chat -->
    <div class="command-dock">
      <div class="dock-controls">
        <button
          type="button"
          @click="$emit('toggle-mic')"
          class="dock-curved-btn mic-btn"
          :class="{ active: isJarvisAwake || isRecordingAudio }"
          title="Ativar Voz do JARVIS"
        >
          🎙️
        </button>

        <button
          type="button"
          @click="$emit('toggle-cam')"
          class="dock-curved-btn"
          :class="{ active: isCameraActive }"
          title="Câmera"
        >
          📷
        </button>

        <button
          type="button"
          @click="$emit('toggle-screen')"
          class="dock-curved-btn"
          :class="{ active: isScreenActive }"
          title="Compartilhar Tela"
        >
          🖥️
        </button>
      </div>

      <!-- Textarea Multilinha com Auto-Resize -->
      <div class="dock-input-wrapper">
        <textarea
          ref="textareaRef"
          :value="modelValue"
          @input="onInput"
          @keydown="handleKeydown"
          rows="1"
          placeholder="Digite ou fale com JARVIS..."
          class="dock-textarea"
          :disabled="isProcessing"
        ></textarea>
      </div>

      <!-- Botão Enviar -->
      <button
        type="button"
        @click="$emit('send')"
        class="send-curved-btn"
        :disabled="!modelValue.trim() || isProcessing"
        title="Enviar mensagem"
      >
        {{ isProcessing ? '⚡' : '➤' }}
      </button>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';

const props = defineProps<{
  modelValue: string;
  isProcessing: boolean;
  isJarvisAwake: boolean;
  isJarvisSpeaking: boolean;
  isRecordingAudio: boolean;
  isCameraActive: boolean;
  isScreenActive: boolean;
  voiceStatusText: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'toggle-mic'): void;
  (e: 'toggle-cam'): void;
  (e: 'toggle-screen'): void;
  (e: 'send'): void;
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);

function autoResize() {
  nextTick(() => {
    const el = textareaRef.value;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 115)}px`;
  });
}

function onInput(e: Event) {
  const target = e.target as HTMLTextAreaElement;
  emit('update:modelValue', target.value);
  autoResize();
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    const isMobile = window.innerWidth < 768 || 'ontouchstart' in window;
    if (!isMobile) {
      e.preventDefault();
      emit('send');
    }
  }
}

defineExpose({
  resetHeight: () => {
    if (textareaRef.value) textareaRef.value.style.height = 'auto';
  }
});
</script>

<style scoped>
.command-dock-wrapper {
  position: fixed;
  bottom: max(env(safe-area-inset-bottom, 10px), 10px);
  left: 0;
  right: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 10px;
  pointer-events: none;
}

.hud-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(11, 18, 33, 0.82);
  border: 1px solid rgba(56, 189, 248, 0.22);
  padding: 3px 11px;
  border-radius: 999px;
  font-size: 10px;
  color: #94a3b8;
  margin-bottom: 6px;
  cursor: pointer;
  pointer-events: auto;
  backdrop-filter: blur(8px);
  max-width: 92%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-dot {
  width: 5.5px;
  height: 5.5px;
  border-radius: 50%;
  background: #38bdf8;
}

.hud-status-badge.awake {
  border-color: rgba(249, 115, 22, 0.6);
  color: #fdba74;
}
.hud-status-badge.awake .status-dot {
  background: #ea580c;
  box-shadow: 0 0 8px #f97316;
}
.hud-status-badge.speaking {
  border-color: rgba(34, 211, 238, 0.6);
  color: #67e8f9;
}

.command-dock {
  pointer-events: auto;
  width: min(600px, 100%);
  display: flex;
  align-items: flex-end;
  gap: 6px;
  background: rgba(11, 18, 33, 0.88);
  border: 1px solid rgba(56, 189, 248, 0.22);
  border-radius: 18px;
  padding: 5px 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(14px);
  box-sizing: border-box;
}

.dock-controls {
  display: flex;
  gap: 4px;
  align-items: center;
  margin-bottom: 1px;
}

.dock-curved-btn {
  background: rgba(30, 41, 59, 0.65);
  border: 1px solid rgba(51, 65, 85, 0.6);
  color: #f8fafc;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.dock-curved-btn.active {
  background: #0284c7;
  border-color: #38bdf8;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.45);
}

.mic-btn.active {
  background: #ea580c;
  border-color: #f97316;
  box-shadow: 0 0 10px rgba(234, 88, 12, 0.55);
}

.dock-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
}

.dock-textarea {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: #f8fafc;
  font-size: 12.5px;
  font-family: inherit;
  line-height: 1.4;
  resize: none;
  max-height: 115px;
  min-height: 22px;
  padding: 4px 6px;
  box-sizing: border-box;
  overflow-y: auto;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.dock-textarea::placeholder {
  color: #64748b;
  font-size: 11.5px;
}

.send-curved-btn {
  background: linear-gradient(135deg, #0284c7, #2563eb);
  color: #ffffff;
  border: none;
  width: 30px;
  height: 28px;
  border-radius: 9px;
  font-size: 11.5px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-bottom: 1px;
  transition: opacity 0.2s;
  flex-shrink: 0;
}

.send-curved-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>