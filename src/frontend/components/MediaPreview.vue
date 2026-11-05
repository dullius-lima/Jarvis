// Janela Picture-in-Picture de câmera/tela

<template>
  <div v-show="isActive" class="media-preview-box">
    <div class="media-preview-header">
      <span>{{ isCamera ? '📷 Câmera Ativa' : '🖥️ Tela Ativa' }}</span>
      <button @click="$emit('close')" class="media-close-btn" title="Fechar visualização">✕</button>
    </div>
    <video
      ref="videoRef"
      autoplay
      playsinline
      muted
      class="media-video"
    ></video>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  isCameraActive: boolean;
  isScreenActive: boolean;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

const videoRef = ref<HTMLVideoElement | null>(null);

const isActive = computed(() => props.isCameraActive || props.isScreenActive);
const isCamera = computed(() => props.isCameraActive);

defineExpose({
  videoRef
});
</script>

<style scoped>
.media-preview-box {
  position: fixed;
  bottom: 110px;
  right: 12px;
  width: 150px;
  z-index: 38;
  background: #0f172a;
  border: 1px solid #38bdf8;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
}

.media-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  font-size: 10px;
  background: rgba(2, 6, 23, 0.9);
  color: #94a3b8;
}

.media-close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 12px;
}
.media-close-btn:hover {
  color: #f87171;
}

.media-video {
  width: 100%;
  display: block;
  background: #000;
}
</style>