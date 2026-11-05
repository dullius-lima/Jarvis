// Webcam inteligente, captura de tela e frames Base64

import { ref } from 'vue';

export function useMediaStream() {
  const videoElement = ref<HTMLVideoElement | null>(null);
  const isCameraActive = ref<boolean>(false);
  const isScreenActive = ref<boolean>(false);
  let activeMediaStream: MediaStream | null = null;

  function requiresCameraActivation(text: string): boolean {
    const lower = (text || '').toLowerCase();
    return (
      lower.includes('ative a câmera') || lower.includes('ativar a câmera') ||
      lower.includes('ativa a câmera') || lower.includes('ligue a câmera') ||
      lower.includes('ligar a câmera') || lower.includes('abra a câmera') ||
      lower.includes('está me vendo') || lower.includes('esta me vendo') ||
      lower.includes('tá me vendo') || lower.includes('ta me vendo') ||
      lower.includes('consegue me ver') || lower.includes('você me vê') ||
      lower.includes('voce me ve') || lower.includes('olhe para mim') ||
      lower.includes('olha pra mim') || lower.includes('como eu estou') ||
      lower.includes('quem sou eu')
    );
  }

  function captureCurrentVideoFrame(): string | null {
    if (!videoElement.value || (!isCameraActive.value && !isScreenActive.value)) return null;
    try {
      const c = document.createElement('canvas');
      c.width = videoElement.value.videoWidth || 640;
      c.height = videoElement.value.videoHeight || 480;
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(videoElement.value, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.8);
    } catch {
      return null;
    }
  }

  async function ensureCameraAndCaptureFrame(): Promise<string | null> {
    try {
      if (!activeMediaStream || !activeMediaStream.active || !isCameraActive.value) {
        activeMediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false
        });
        if (videoElement.value) {
          videoElement.value.srcObject = activeMediaStream;
          await videoElement.value.play().catch(() => {});
        }
        isCameraActive.value = true;
        await new Promise((r) => setTimeout(r, 400));
      }
      return captureCurrentVideoFrame();
    } catch (err) {
      console.warn('⚠️ Acesso à câmera falhou:', err);
      return null;
    }
  }

  async function toggleWebcam() {
    if (isCameraActive.value) {
      stopAllMedia();
      return;
    }
    try {
      stopAllMedia();
      activeMediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (videoElement.value) {
        videoElement.value.srcObject = activeMediaStream;
        videoElement.value.play().catch(() => {});
      }
      isCameraActive.value = true;
    } catch {
      console.warn('Permissão de câmera requer HTTPS');
    }
  }

  async function toggleScreenShare() {
    if (isScreenActive.value) {
      stopAllMedia();
      return;
    }
    try {
      stopAllMedia();
      activeMediaStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
      if (videoElement.value) {
        videoElement.value.srcObject = activeMediaStream;
        videoElement.value.play().catch(() => {});
      }
      isScreenActive.value = true;
    } catch {
      console.warn('Captura de tela indisponível');
    }
  }

  function stopAllMedia() {
    if (activeMediaStream) {
      activeMediaStream.getTracks().forEach((t) => t.stop());
      activeMediaStream = null;
    }
    isCameraActive.value = false;
    isScreenActive.value = false;
  }

  return {
    videoElement,
    isCameraActive,
    isScreenActive,
    requiresCameraActivation,
    captureCurrentVideoFrame,
    ensureCameraAndCaptureFrame,
    toggleWebcam,
    toggleScreenShare,
    stopAllMedia
  };
}