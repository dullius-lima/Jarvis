import { ref } from 'vue';

export function useMediaStream() {
  const videoElement = ref<HTMLVideoElement | null>(null);
  const isCameraActive = ref<boolean>(false);
  const isScreenActive = ref<boolean>(false);
  let activeMediaStream: MediaStream | null = null;

  function requiresCameraActivation(text: string): boolean {
    const lower = (text || '').toLowerCase();
    return (
      lower.includes('ative a câmera') || lower.includes('ative a camera') ||
      lower.includes('ativar a câmera') || lower.includes('ativar a camera') ||
      lower.includes('ativa a câmera') || lower.includes('ativa a camera') ||
      lower.includes('ligue a câmera') || lower.includes('ligue a camera') ||
      lower.includes('ligar a câmera') || lower.includes('ligar a camera') ||
      lower.includes('abra a câmera') || lower.includes('abra a camera') ||
      lower.includes('câmera traseira') || lower.includes('camera traseira') ||
      lower.includes('câmera frontal') || lower.includes('camera frontal') ||
      lower.includes('está me vendo') || lower.includes('esta me vendo') ||
      lower.includes('tá me vendo') || lower.includes('ta me vendo') ||
      lower.includes('consegue me ver') || lower.includes('você me vê') ||
      lower.includes('voce me ve') || lower.includes('olhe para mim') ||
      lower.includes('olha pra mim') || lower.includes('olha isso') ||
      lower.includes('o que é isso') || lower.includes('como eu estou') ||
      lower.includes('quem sou eu')
    );
  }

  function wantsRearCamera(text: string): boolean {
    const lower = (text || '').toLowerCase();
    return lower.includes('traseira') || lower.includes('de trás') || lower.includes('de tras');
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

  async function ensureCameraAndCaptureFrame(preferRear = false): Promise<string | null> {
    try {
      if (preferRear && isCameraActive.value) {
        stopAllMedia();
      }
      if (!activeMediaStream || !activeMediaStream.active || !isCameraActive.value) {
        activeMediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 640,
            height: 480,
            facingMode: preferRear ? { ideal: 'environment' } : 'user'
          },
          audio: false
        });
        if (videoElement.value) {
          videoElement.value.srcObject = activeMediaStream;
          await videoElement.value.play().catch(() => {});
        }
        isCameraActive.value = true;
        await new Promise((r) => setTimeout(r, 450));
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
    wantsRearCamera,
    captureCurrentVideoFrame,
    ensureCameraAndCaptureFrame,
    toggleWebcam,
    toggleScreenShare,
    stopAllMedia
  };
}
