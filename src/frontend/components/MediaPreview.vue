<template>
  <div v-show="isActive" class="media-preview-box">
    <button
      type="button"
      @click.stop="$emit('close')"
      class="media-close-x"
      aria-label="Fechar câmera"
    >
      <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>

    <video
      ref="videoRef"
      v-show="hasLocalVideo"
      @loadedmetadata="hasLocalVideo = true"
      @emptied="hasLocalVideo = false"
      autoplay
      playsinline
      muted
      class="media-video"
    ></video>

    <div v-if="!hasLocalVideo" class="blue-cam-stage">
      <div class="cam-glow-ring"></div>
      <svg class="blue-cam-icon" viewBox="0 0 64 64" width="54" height="54" fill="none">
        <defs>
          <linearGradient id="jarvisBlueCam" x1="8" y1="12" x2="56" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#38bdf8" />
            <stop offset="55%" stop-color="#0284c7" />
            <stop offset="100%" stop-color="#2563eb" />
          </linearGradient>
        </defs>
        <rect x="8" y="18" width="48" height="34" rx="10" fill="url(#jarvisBlueCam)" fill-opacity="0.22" stroke="url(#jarvisBlueCam)" stroke-width="3" />
        <path d="M22 18L26 12H38L42 18" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="32" cy="35" r="10" fill="#071326" stroke="#38bdf8" stroke-width="3" />
        <circle cx="32" cy="35" r="4.5" fill="#7dd3fc" />
        <circle cx="48" cy="24" r="2.5" fill="#38bdf8" />
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const props = defineProps<{
  isCameraActive: boolean;
  isScreenActive: boolean;
  remoteActive?: boolean;
  remoteModality?: string;
  deviceLabel?: string;
  identifiedName?: string;
  isFamiliar?: boolean;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

const videoRef = ref<HTMLVideoElement | null>(null);
const hasLocalVideo = ref(false);

watch(
  () => [props.isCameraActive, props.isScreenActive],
  ([cam, scr]) => {
    if (!cam && !scr) hasLocalVideo.value = false;
  }
);

const isActive = computed(() => props.isCameraActive || props.isScreenActive || Boolean(props.remoteActive));

defineExpose({
  videoRef
});
</script>

<style scoped>
.media-preview-box {
  position: fixed;
  bottom: 112px;
  right: 14px;
  width: 148px;
  height: 112px;
  z-index: 45;
  background: radial-gradient(circle at center, rgba(14, 34, 64, 0.96), rgba(6, 11, 24, 0.98));
  border: 1.5px solid rgba(56, 189, 248, 0.55);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 10px 28px rgba(2, 132, 199, 0.35), inset 0 0 18px rgba(56, 189, 248, 0.14);
}
.media-close-x {
  position: absolute;
  top: 7px;
  right: 7px;
  z-index: 10;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid rgba(56, 189, 248, 0.55);
  color: #e0f2fe;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}
.media-close-x:active {
  transform: scale(0.92);
  background: rgba(239, 68, 68, 0.35);
  border-color: #f87171;
}
.media-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  background: #000;
}
.blue-cam-stage {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.cam-glow-ring {
  position: absolute;
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(56, 189, 248, 0.28) 0%, transparent 70%);
  animation: pulseCam 2.4s ease-in-out infinite;
}
.blue-cam-icon {
  position: relative;
  filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.65));
}
@keyframes pulseCam {
  0%, 100% { transform: scale(0.92); opacity: 0.65; }
  50% { transform: scale(1.12); opacity: 1; }
}
</style>
