<template>
  <div class="jarvis-universe">
    <!-- 1. ECRÃ DE LOGIN / AUTENTICAÇÃO -->
    <div v-if="!isAuthenticated" class="auth-overlay">
      <div class="auth-card">
        <div class="auth-core-ring"><div class="auth-core-inner"></div></div>
        <h1 class="auth-title">JARVIS NEURAL CORE</h1>
        <p class="auth-subtitle">Acesso Restrito ao Ecossistema Neural</p>

        <form @submit.prevent="handleLogin" class="auth-form">
          <div class="auth-field">
            <label>E-mail do Administrador</label>
            <input
              v-model="loginEmail"
              type="email"
              placeholder="matheus_dullius@hotmail.com"
              required
              autocomplete="username"
            />
          </div>
          <div class="auth-field">
            <label>Palavra-passe de Acesso</label>
            <input
              v-model="loginPassword"
              type="password"
              placeholder="••••••••"
              required
              autocomplete="current-password"
            />
          </div>
          <div v-if="loginError" class="auth-error">⚠️ {{ loginError }}</div>
          <button type="submit" class="auth-submit-btn" :disabled="isLoggingIn">
            {{ isLoggingIn ? 'A autenticar...' : '🔓 Desbloquear JARVIS' }}
          </button>
        </form>
      </div>
    </div>

    <!-- 2. ECOSSISTEMA PRINCIPAL 3D -->
    <template v-else>
      <!-- Cabeçalho com proteção da barra de status do celular -->
      <header class="hud-top-safe-area">
        <HudHeader
          :agents-count="dynamicAgents.length"
          :active-nodes-count="activeSharedNodesCount"
          :memories-count="memoryDots.length"
          :has-selection-or-zoom="Boolean(activeAgentForTools || selectedSubNode || selectedMemoryDot || cameraZoom !== 1)"
          @reset-view="resetViewAndSelection"
          @open-password="showPasswordModal = true"
          @logout="handleLogout(stopAllEngines)"
        />
      </header>

      <!-- PALCO CANVAS 3D INTERATIVO -->
      <div
        class="canvas-stage"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
        @wheel.prevent="onWheel"
        @touchstart.passive="onTouchStart"
        @touchmove.prevent="onTouchMove"
        @touchend="onTouchEnd"
      >
        <canvas ref="neuralCanvas"></canvas>

        <!-- MODAL DE PALAVRA-PASSE -->
        <PasswordModal
          v-if="showPasswordModal"
          :initial-email="loginEmail"
          :feedback="credFeedback"
          @close="showPasswordModal = false"
          @save="onSaveCredentials"
        />

        <!-- POPOVER DE FERRAMENTAS DO AGENTE -->
        <AgentToolsPopover
          v-if="activeAgentForTools"
          :agent="activeAgentForTools"
          :catalog="savedConnectionsCatalog"
          :memory-count="getAgentMemoryCount(activeAgentForTools)"
          :feedback="connSaveFeedback"
          :get-meta="getConnectionMeta"
          :get-agents-using="getAgentsUsingTool"
          :is-linked="(toolId) => isConnectionLinked(activeAgentForTools, toolId)"
          @close="activeAgentForTools = null"
          @toggle-tool="(toolId) => toggleAgentConnection(activeAgentForTools, toolId)"
          @create-tool="(form) => createAndAttachConnection(form, activeAgentForTools)"
        />

        <!-- INSPETOR DE NÓ FIXO -->
        <SubNodeInspector
          :node="selectedSubNode"
          :agents="dynamicAgents"
          :is-linked="isConnectionLinked"
          :get-agents-using="getAgentsUsingTool"
          @close="selectedSubNode = null"
          @toggle-agent="(ag, toolId) => toggleAgentConnection(ag, toolId)"
        />

        <!-- INSPETOR DE MEMÓRIA -->
        <MemoryInspector
          :memory="selectedMemoryDot"
          @close="selectedMemoryDot = null"
        />

        <!-- PRÉ-VISUALIZAÇÃO DE VÍDEO -->
        <MediaPreview
          ref="mediaPreviewComponent"
          :is-camera-active="isCameraActive"
          :is-screen-active="isScreenActive"
          @close="stopAllMedia"
        />

        <!-- BALÃO DE RESPOSTA COM TELEMETRIA -->
        <ResponseBubble :response="lastResponse" @close="lastResponse = null">
          <template #telemetry>
            <AgentTelemetryBadge :telemetry="lastTelemetry" />
          </template>
        </ResponseBubble>
      </div>

      <!-- BARRA DE COMANDO MINIMALISTA: CHAT MULTILINHA E CONTROLOS -->
      <footer class="command-dock-wrapper">
        <!-- Indicador de Status Acima do Dock (Sem sobreposição) -->
        <div class="hud-status-badge" @click="toggleMicrophone" :class="{ awake: isJarvisAwake }">
          <span class="status-dot"></span>
          <span>{{ voiceStatusText }}</span>
        </div>

        <div class="command-dock">
          <div class="dock-controls">
            <!-- Botão Microfone -->
            <button
              type="button"
              @click="toggleMicrophone"
              class="dock-btn mic-btn"
              :class="{ active: isJarvisAwake || isRecordingAudio }"
              :title="isJarvisAwake ? 'Microfone ativo' : 'Ativar Microfone'"
            >
              🎙️
            </button>

            <!-- Botão Câmara -->
            <button
              type="button"
              @click="toggleWebcam"
              class="dock-btn"
              :class="{ active: isCameraActive }"
              title="Alternar Câmara"
            >
              📷
            </button>

            <!-- Botão Partilha de Ecrã -->
            <button
              type="button"
              @click="toggleScreenShare"
              class="dock-btn"
              :class="{ active: isScreenActive }"
              title="Partilhar Ecrã"
            >
              🖥️
            </button>
          </div>

          <!-- Caixa de Texto Multilinha com Auto-Resize -->
          <div class="dock-input-wrapper">
            <textarea
              ref="chatInputRef"
              v-model="promptText"
              @keydown.enter.exact.prevent="sendCommand()"
              @keydown.shift.enter.stop
              @input="adjustTextareaHeight"
              rows="1"
              placeholder="Fale 'Jarvis' ou digite..."
              class="dock-textarea"
              :disabled="isProcessing"
            ></textarea>
          </div>

          <!-- Botão Transmitir -->
          <button
            type="button"
            @click="sendCommand()"
            class="send-btn"
            :disabled="!promptText.trim() || isProcessing"
            title="Transmitir comando"
          >
            {{ isProcessing ? '⚡' : 'Enviar' }}
          </button>
        </div>
      </footer>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watchEffect, nextTick } from 'vue';

// Composables do Ecossistema
import { useAuth } from './composables/useAuth';
import { useEcosystem, AGENT_PALETTE } from './composables/useEcosystem';
import { useMediaStream } from './composables/useMediaStream';
import { useMemoryOrbs } from './composables/useMemoryOrbs';

// Componentes da Interface
import HudHeader from './components/HudHeader.vue';
import ResponseBubble from './components/ResponseBubble.vue';
import MediaPreview from './components/MediaPreview.vue';
import AgentTelemetryBadge from './components/AgentTelemetryBadge.vue';

// Modais do Sistema
import PasswordModal from './components/modals/PasswordModal.vue';
import AgentToolsPopover from './components/modals/AgentToolsPopover.vue';
import SubNodeInspector from './components/modals/SubNodeInspector.vue';
import MemoryInspector from './components/modals/MemoryInspector.vue';

// 1. Ponte de Vídeo para MediaPreview
const mediaPreviewComponent = ref<any>(null);
watchEffect(() => {
  if (mediaPreviewComponent.value?.videoRef) {
    videoElement.value = mediaPreviewComponent.value.videoRef;
  }
});

// 2. Ponte de Credenciais do PasswordModal
async function onSaveCredentials(payload: { email: string; password: string }) {
  newEmailInput.value = payload.email;
  newPasswordInput.value = payload.password;
  await updateAdminCredentials();
}
const sessionId = ref<string>(localStorage.getItem('jarvis_active_session_id') || 'sess_main_admin');

// 3. Injeção de Módulos
const {
  isAuthenticated, loginEmail, loginPassword, loginError, isLoggingIn,
  showPasswordModal, newEmailInput, newPasswordInput, credFeedback,
  handleLogin, updateAdminCredentials, handleLogout
} = useAuth(async () => { await bootAuthenticatedUniverse(); });

const {
  dynamicAgents, savedConnectionsCatalog, memoryDots, connSaveFeedback,
  activeSharedNodesCount, getConnectionMeta, getAgentsUsingTool,
  isConnectionLinked, getAgentMemoryCount, loadEcosystemData,
  toggleAgentConnection, createAndAttachConnection
} = useEcosystem(sessionId.value);

const {
  videoElement, isCameraActive, isScreenActive,
  requiresCameraActivation, captureCurrentVideoFrame,
  ensureCameraAndCaptureFrame, toggleWebcam, toggleScreenShare, stopAllMedia
} = useMediaStream();

const {
  lastTelemetry, highlightedAgentSlug, highlightedStatusColor,
  fetchSessionMemoryOrbs, registerAgentExecution, drawMemoryOrbsOnCanvas
} = useMemoryOrbs();

// 4. Estados do Canvas e Input
const neuralCanvas = ref<HTMLCanvasElement | null>(null);
const chatInputRef = ref<HTMLTextAreaElement | null>(null);
const activeAgentForTools = ref<any | null>(null);
const selectedSubNode = ref<any | null>(null);
const selectedMemoryDot = ref<any | null>(null);
const promptText = ref<string>('');
const isProcessing = ref<boolean>(false);
const lastResponse = ref<{ agent: string; text: string; executionTimeMs?: number } | null>(null);

function adjustTextareaHeight() {
  nextTick(() => {
    const el = chatInputRef.value;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 90)}px`;
  });
}

// ============================================================================
// 5. MOTOR DE VOZ NATIVO + FALLBACK WHISPER PARA ANDROID/WEBVIEW
// ============================================================================
const isJarvisAwake = ref<boolean>(false);
const isJarvisSpeaking = ref<boolean>(false);
const isRecordingAudio = ref<boolean>(false);
const voiceStatusText = ref<string>('Toque no microfone ou diga "Jarvis"');
const isVoiceMuted = ref<boolean>(false);

let recognition: any = null;
let speechSilenceTimer: any = null;
let speechAccumulatedBuffer = '';
let lastChimeTimestamp = 0;
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let localAudioStream: MediaStream | null = null;

function playJarvisChime(type: 'wake' | 'send' = 'wake') {
  const now = Date.now();
  if (now - lastChimeTimestamp < 1800 && type === 'wake') return;
  lastChimeTimestamp = now;

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    if (type === 'wake') {
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
    } else {
      osc.frequency.setValueAtTime(659.25, ctx.currentTime);
      osc.frequency.setValueAtTime(523.25, ctx.currentTime + 0.08);
    }

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    setTimeout(() => ctx.close().catch(() => {}), 280);
  } catch {}
}

// Força o pop-up nativo de permissão do microfone no Android/WebView
async function ensureMicrophonePermission(): Promise<boolean> {
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      if (!localAudioStream || !localAudioStream.active) {
        localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      return true;
    }
  } catch (err) {
    console.warn('Permissão de microfone negada no sistema:', err);
    voiceStatusText.value = '❌ Microfone bloqueado nas permissões do celular';
    return false;
  }
  return false;
}

// Gravação de contingência enviada para o Whisper Local na VM
async function startWhisperFallbackRecording() {
  if (!localAudioStream) return;
  try {
    audioChunks = [];
    mediaRecorder = new MediaRecorder(localAudioStream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      isRecordingAudio.value = false;
      if (audioChunks.length === 0 || promptText.value.trim().length > 1) return;

      voiceStatusText.value = '⚡ Transcrevendo áudio via Whisper...';
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        if (!base64Audio) return;

        try {
          const res = await fetch('/api/v1/audio/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: base64Audio })
          });
          const data = await res.json();
          if (data.success && data.text && data.text.trim().length > 1) {
            promptText.value = data.text.trim();
            sendCommand(data.text.trim());
          } else {
            voiceStatusText.value = '🎙️ Não entendi, fale novamente.';
          }
        } catch {
          voiceStatusText.value = '⚠️ Falha no Whisper local.';
        }
      };
    };
    mediaRecorder.start();
    isRecordingAudio.value = true;
  } catch (e) {
    console.warn('Erro ao inicializar MediaRecorder:', e);
  }
}

function stopWhisperFallbackRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  isRecordingAudio.value = false;
}

function initSTT() {
  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) return null;

  const rec = new SpeechRecognition();
  rec.lang = 'pt-BR';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onstart = () => {
    voiceStatusText.value = isJarvisAwake.value
      ? '🎙️ Ouvindo... Pode falar'
      : '🟢 Diga "Jarvis" ou toque no centro';
  };

  rec.onresult = (event: any) => {
    if (isJarvisSpeaking.value) return;

    if (speechSilenceTimer) clearTimeout(speechSilenceTimer);

    let currentInterim = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const part = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        speechAccumulatedBuffer += ' ' + part;
      } else {
        currentInterim += part;
      }
    }

    const liveText = (speechAccumulatedBuffer + ' ' + currentInterim).trim();
    const lower = liveText.toLowerCase();
    const wakeWordPattern = /(?:oi|ol[aá]|ei|ok|fala|al[oô])?\s*(jarvis|j[aá]vis|jarves|iarvis)/i;

    if (!isJarvisAwake.value && wakeWordPattern.test(lower)) {
      isJarvisAwake.value = true;
      playJarvisChime('wake');

      const parts = liveText.split(wakeWordPattern);
      const afterWake = parts.pop()?.replace(/^[,.\s!?-]+/, '').trim() || '';

      if (afterWake.length > 2) {
        speechAccumulatedBuffer = afterWake;
        promptText.value = afterWake;
        adjustTextareaHeight();
        voiceStatusText.value = `🎙️ Captando: "${afterWake}"`;
      } else {
        speechAccumulatedBuffer = '';
        promptText.value = '';
        voiceStatusText.value = '🎙️ Sim, senhor? Estou ouvindo...';
        return;
      }
    }

    if (isJarvisAwake.value && liveText.length > 1) {
      const cleaned = liveText.replace(wakeWordPattern, '').replace(/^[,.\s!?-]+/, '').trim();
      promptText.value = cleaned;
      voiceStatusText.value = `🎙️ "${cleaned}"`;
      adjustTextareaHeight();

      speechSilenceTimer = setTimeout(() => {
        const finalPrompt = promptText.value.trim();
        if (finalPrompt.length > 1 && !isProcessing.value) {
          playJarvisChime('send');
          voiceStatusText.value = '⚡ Transmitindo comando...';
          stopMicrophoneSession();
          sendCommand(finalPrompt);
        }
      }, 2000);
    }
  };

  rec.onerror = (event: any) => {
    // Se o serviço do Google falhar no WebView do Android, aciona a gravação Whisper
    if (['service-not-allowed', 'network', 'not-allowed'].includes(event.error)) {
      if (isJarvisAwake.value && !isRecordingAudio.value) {
        voiceStatusText.value = '🎙️ Gravando comando de voz...';
        startWhisperFallbackRecording();
      }
    }
  };

  rec.onend = () => {
    if (isJarvisAwake.value && isRecordingAudio.value) {
      stopWhisperFallbackRecording();
    }
    if (isJarvisAwake.value && !isJarvisSpeaking.value) {
      try { rec.start(); } catch {}
    }
  };

  return rec;
}

async function onJarvisCoreClick() {
  selectedSubNode.value = null;
  selectedMemoryDot.value = null;
  activeAgentForTools.value = null;

  if (isJarvisAwake.value) {
    stopMicrophoneSession();
    voiceStatusText.value = '🎙️ Microfone em repouso';
    return;
  }

  // 1. Garante a permissão no sistema Android
  const hasPerm = await ensureMicrophonePermission();
  if (!hasPerm) return;

  speechAccumulatedBuffer = '';
  promptText.value = '';
  adjustTextareaHeight();
  isJarvisAwake.value = true;
  playJarvisChime('wake');
  voiceStatusText.value = '🎙️ Ouvindo... Pode falar';

  // Inicia SpeechRecognition e abre gravação de segurança
  if (!recognition) recognition = initSTT();
  try {
    recognition.start();
  } catch {
    try { recognition.stop(); recognition.start(); } catch {}
  }
  startWhisperFallbackRecording();

  // Trava de segurança: se após 6 segundos não houver fala, finaliza
  if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
  speechSilenceTimer = setTimeout(() => {
    if (isJarvisAwake.value && !promptText.value.trim()) {
      stopMicrophoneSession();
      voiceStatusText.value = '🎙️ Toque no microfone ou diga "Jarvis"';
    }
  }, 6000);
}

function toggleMicrophone() {
  onJarvisCoreClick();
}

function stopMicrophoneSession() {
  if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
  isJarvisAwake.value = false;
  speechAccumulatedBuffer = '';
  stopWhisperFallbackRecording();
  if (recognition) {
    try { recognition.stop(); } catch {}
  }
}

function speakJarvisResponse(rawText: string, onDone?: () => void) {
  if (isVoiceMuted.value || !rawText) {
    if (onDone) onDone();
    return;
  }

  stopMicrophoneSession();
  isJarvisSpeaking.value = true;

  const cleanText = rawText
    .replace(/```[\s\S]*?```/g, 'bloco de código.')
    .replace(/[*#_`~>|]/g, '')
    .trim();

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.05;

      utterance.onend = () => {
        isJarvisSpeaking.value = false;
        if (onDone) onDone();
      };
      utterance.onerror = () => {
        isJarvisSpeaking.value = false;
        if (onDone) onDone();
      };

      window.speechSynthesis.speak(utterance);
    }, 70);
  } else {
    isJarvisSpeaking.value = false;
    if (onDone) onDone();
  }
}

function stopAllAudio() {
  stopMicrophoneSession();
  if (localAudioStream) {
    localAudioStream.getTracks().forEach((t) => t.stop());
    localAudioStream = null;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

// 6. Câmara 3D e Renderização no Canvas (Reescalonado Sem Colisão)
const rotationY = ref<number>(0);
const rotationX = ref<number>(0.18);
const cameraZoom = ref<number>(1.0);
let isDragging = false;
let dragMoved = false;
let lastMouseX = 0;
let lastMouseY = 0;
let animationFrameId: number | null = null;
let refreshIntervalId: any = null;

let renderedAgentsHitbox: Array<{ x: number; y: number; r: number; agent: any }> = [];
let renderedSubNodesHitbox: Array<{ x: number; y: number; r: number; node: any }> = [];
let renderedMemoriesHitbox: Array<{ x: number; y: number; r: number; mem: any }> = [];

function resetViewAndSelection() {
  activeAgentForTools.value = null;
  selectedSubNode.value = null;
  selectedMemoryDot.value = null;
  cameraZoom.value = 1.0;
  rotationX.value = 0.18;
}

function project3D(x: number, y: number, z: number, cx: number, cy: number, fov: number) {
  const cosY = Math.cos(rotationY.value);
  const sinY = Math.sin(rotationY.value);
  const x1 = x * cosY - z * sinY;
  const z1 = z * cosY + x * sinY;

  const cosX = Math.cos(rotationX.value);
  const sinX = Math.sin(rotationX.value);
  const y2 = y * cosX - z1 * sinX;
  const z2 = z1 * cosX + y * sinX;

  const depth = Math.max(fov + z2, 120);
  const scale = (fov / depth) * cameraZoom.value;
  return { x: cx + x1 * scale, y: cy + y2 * scale, z: z2, scale };
}

function stopAnimationLoop() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function startNeuralCanvasLoop() {
  stopAnimationLoop();
  let time = 0;

  const renderFrame = () => {
    const canvas = neuralCanvas.value;
    if (!canvas) {
      animationFrameId = requestAnimationFrame(renderFrame);
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      animationFrameId = requestAnimationFrame(renderFrame);
      return;
    }

    const width = window.innerWidth || 360;
    const height = window.innerHeight || 640;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1.0;
    ctx.clearRect(0, 0, width, height);

    // Fundo espacial profundo
    const bgGrad = ctx.createRadialGradient(width * 0.5, height * 0.44, 8, width * 0.5, height * 0.44, Math.max(width, height) * 0.72);
    bgGrad.addColorStop(0, '#091524');
    bgGrad.addColorStop(0.6, '#040813');
    bgGrad.addColorStop(1, '#020409');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    time += isJarvisSpeaking.value || isProcessing.value ? 0.03 : 0.012;
    if (!isDragging) rotationY.value += 0.0024;

    const isMobile = width < 768;
    const cx = width * 0.5;
    const cy = height * (isMobile ? 0.43 : 0.48); // Centro elevado para dar respiro aos nós inferiores
    const fov = isMobile ? 520 : 680;
    const maxSafeRadius = Math.max(85, Math.min(width * 0.5 - (isMobile ? 36 : 60), height * 0.44 - (isMobile ? 40 : 60)));
    const coreRadius = Math.min(maxSafeRadius * 0.32, isMobile ? 40 : 65); // Núcleo compacto
    const agentOrbitRadius = Math.min(maxSafeRadius * 0.92, isMobile ? 125 : 230);
    const sharedNodeOrbitRadius = Math.min(maxSafeRadius * 1.2, isMobile ? 155 : 310);

    // ========================================================================
    // NÚCLEO HOLOGRÁFICO JARVIS (Com aura sem colisão de texto)
    // ========================================================================
    const corePulse = isJarvisAwake.value
      ? 1 + Math.sin(time * 6) * 0.08
      : isJarvisSpeaking.value || isProcessing.value
      ? 1 + Math.sin(time * 5) * 0.06
      : 1 + Math.sin(time * 2) * 0.02;

    const currentCoreR = coreRadius * corePulse * cameraZoom.value;

    ctx.save();
    const coreGlow = ctx.createRadialGradient(cx, cy, 2, cx, cy, currentCoreR * 1.6);
    coreGlow.addColorStop(0, isJarvisAwake.value ? 'rgba(56, 189, 248, 0.45)' : 'rgba(14, 165, 233, 0.22)');
    coreGlow.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = coreGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, currentCoreR * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Anéis Concêntricos
    ctx.save();
    ctx.strokeStyle = isJarvisAwake.value ? '#38bdf8' : '#0ea5e9';
    ctx.lineWidth = isJarvisAwake.value ? 2 : 1.2;
    ctx.globalAlpha = isJarvisAwake.value ? 0.9 : 0.6;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.arc(cx, cy, currentCoreR * 1.2, time * 0.4, time * 0.4 + Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Esfera 3D Central
    const effectiveCoreR = coreRadius * corePulse;
    ctx.save();
    ctx.strokeStyle = isJarvisAwake.value ? '#38bdf8' : isJarvisSpeaking.value ? '#22d3ee' : '#0284c7';
    ctx.lineWidth = 1.0;
    for (let i = 1; i < 7; i++) {
      const theta = (i * Math.PI) / 7;
      ctx.beginPath();
      for (let j = 0; j <= 12; j++) {
        const phi = (j * 2 * Math.PI) / 12;
        const p = project3D(effectiveCoreR * Math.sin(theta) * Math.cos(phi), effectiveCoreR * Math.cos(theta), effectiveCoreR * Math.sin(theta) * Math.sin(phi), cx, cy, fov);
        if (j === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.globalAlpha = isJarvisAwake.value ? 0.65 : 0.35;
      ctx.stroke();
    }
    ctx.restore();

    // Bolinhas Azuis de Memória
    drawMemoryOrbsOnCanvas(ctx, cx, cy, rotationY.value);

    // Mapeamento e desenho de agentes e conectores
    renderedAgentsHitbox = [];
    renderedSubNodesHitbox = [];
    renderedMemoriesHitbox = [];

    const agentPositionsMap = new Map<any, { ag: any; proj: { x: number; y: number; scale: number }; color: string }>();
    dynamicAgents.value.forEach((ag, idx) => {
      const angle = (idx / Math.max(dynamicAgents.value.length, 1)) * Math.PI * 2 + 0.3;
      const rawProj = project3D(Math.cos(angle) * agentOrbitRadius, Math.sin(idx * 1.7 + time * 0.5) * (isMobile ? 22 : 36), Math.sin(angle) * agentOrbitRadius, cx, cy, fov);
      const color = ag.color || AGENT_PALETTE[idx % AGENT_PALETTE.length];
      agentPositionsMap.set(ag.id, { ag, proj: { x: rawProj.x, y: rawProj.y, scale: rawProj.scale }, color });
    });

    // Feixes sinápticos e memórias
    Array.from(agentPositionsMap.values()).forEach(({ ag, proj: agProj, color }, index) => {
      const isSelected = activeAgentForTools.value?.id === ag.id;
      ctx.save();
      ctx.globalAlpha = isSelected ? 0.9 : 0.45;
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 2.0 : 1.2;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const ctrlX = (cx + agProj.x) * 0.5;
      const ctrlY = (cy + agProj.y) * 0.5 - 14;
      ctx.quadraticCurveTo(ctrlX, ctrlY, agProj.x, agProj.y);
      ctx.stroke();
      ctx.restore();

      const agentMemories = memoryDots.value.filter((m) => m.agentId === ag.id || m.agentName === ag.name);
      for (let d = 0; d < Math.min(Math.max(agentMemories.length, 2), 4); d++) {
        const t = (time * 0.2 + d * 0.2 + index * 0.17) % 1;
        const invT = 1 - t;
        const mx = invT * invT * cx + 2 * invT * t * ctrlX + t * t * agProj.x;
        const my = invT * invT * cy + 2 * invT * t * ctrlY + t * t * agProj.y;
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(mx, my, isMobile ? 2.5 : 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (agentMemories[d]) renderedMemoriesHitbox.push({ x: mx, y: my, r: 8, mem: agentMemories[d] });
      }
    });

    // Conectores Externos (Nós Fixos)
    const uniqueToolIds = Array.from(new Set(dynamicAgents.value.flatMap((ag) => ag.tools || []).map((t: string) => String(t).toLowerCase())));
    uniqueToolIds.forEach((toolId, tIdx) => {
      const meta = getConnectionMeta(toolId);
      const angle = (tIdx / Math.max(uniqueToolIds.length, 1)) * Math.PI * 2 + 0.85;
      const tProj = project3D(Math.cos(angle) * sharedNodeOrbitRadius, Math.cos(tIdx * 2.1) * (isMobile ? 28 : 46), Math.sin(angle) * sharedNodeOrbitRadius, cx, cy, fov);
      const nodeR = isMobile ? 10 : 13;

      getAgentsUsingTool(toolId).forEach((cAg) => {
        const agEntry = agentPositionsMap.get(cAg.id);
        if (agEntry) {
          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = agEntry.color;
          ctx.lineWidth = 1.0;
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.moveTo(agEntry.proj.x, agEntry.proj.y);
          ctx.lineTo(tProj.x, tProj.y);
          ctx.stroke();
          ctx.restore();
        }
      });

      ctx.save();
      ctx.fillStyle = '#0b1329';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(tProj.x, tProj.y, nodeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.font = `${isMobile ? 10 : 12}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(meta.icon || '🔌', tProj.x, tProj.y);
      ctx.restore();

      renderedSubNodesHitbox.push({ x: tProj.x, y: tProj.y, r: nodeR + 5, node: { ...meta, toolId } });
    });

    // Orbes dos Agentes Especialistas (Com truncamento de texto anti-colisão)
    Array.from(agentPositionsMap.values()).forEach(({ ag, proj, color }) => {
      const orbR = isMobile ? 18 : 23;
      const isSelected = activeAgentForTools.value?.id === ag.id;
      const isHighlighted = highlightedAgentSlug.value === ag.slug;

      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
      ctx.strokeStyle = isHighlighted ? highlightedStatusColor.value : color;
      ctx.lineWidth = isHighlighted || isSelected ? 2.5 : 1.5;
      ctx.shadowColor = isHighlighted ? highlightedStatusColor.value : color;
      ctx.shadowBlur = isHighlighted ? 16 : isSelected ? 12 : 6;

      ctx.beginPath();
      ctx.arc(proj.x, proj.y, orbR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.font = `${isMobile ? 14 : 17}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(ag.icon || '🤖', proj.x, proj.y);

      if ((ag.tools || []).length > 0) {
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(proj.x + orbR * 0.72, proj.y - orbR * 0.72, isMobile ? 6 : 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${isMobile ? 7.5 : 8.5}px system-ui`;
        ctx.fillText(String(ag.tools.length), proj.x + orbR * 0.72, proj.y - orbR * 0.72);
      }

      // Rótulo compacto que não invade nós vizinhos
      ctx.font = `500 ${isMobile ? 9 : 10.5}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = '#cbd5e1';
      const rawName = ag.name || 'Agente';
      const cleanName = rawName.length > 16 ? rawName.slice(0, 14) + '…' : rawName;
      ctx.fillText(cleanName, proj.x, proj.y + orbR + (isMobile ? 10 : 13));
      ctx.restore();

      renderedAgentsHitbox.push({ x: proj.x, y: proj.y, r: orbR + 6, agent: ag });
    });

    animationFrameId = requestAnimationFrame(renderFrame);
  };
  animationFrameId = requestAnimationFrame(renderFrame);
}

// 7. Interações de Toque e Rato
function handleStageTap(clientX: number, clientY: number) {
  const isMobile = (window.innerWidth || 360) < 768;
  const cx = (window.innerWidth || 360) * 0.5;
  const cy = (window.innerHeight || 640) * (isMobile ? 0.43 : 0.48);
  const coreHitRadius = (isMobile ? 40 : 65) * cameraZoom.value * 1.35;

  // 1. Toque no Núcleo JARVIS Central
  if (Math.hypot(clientX - cx, clientY - cy) <= coreHitRadius) {
    onJarvisCoreClick();
    return;
  }

  // 2. Toque nos Agentes Especialistas
  for (const item of renderedAgentsHitbox) {
    if (Math.hypot(clientX - item.x, clientY - item.y) <= item.r) {
      selectedSubNode.value = null;
      selectedMemoryDot.value = null;
      activeAgentForTools.value = item.agent;
      return;
    }
  }

  // 3. Toque nos Nós Conectores
  for (const sub of renderedSubNodesHitbox) {
    if (Math.hypot(clientX - sub.x, clientY - sub.y) <= sub.r) {
      activeAgentForTools.value = null;
      selectedMemoryDot.value = null;
      selectedSubNode.value = sub.node;
      return;
    }
  }

  // 4. Toque nas Memórias
  for (const mem of renderedMemoriesHitbox) {
    if (Math.hypot(clientX - mem.x, clientY - mem.y) <= mem.r) {
      activeAgentForTools.value = null;
      selectedSubNode.value = null;
      selectedMemoryDot.value = mem.mem;
      return;
    }
  }
}

function onMouseDown(e: MouseEvent) {
  isDragging = true; dragMoved = false; lastMouseX = e.clientX; lastMouseY = e.clientY;
}
function onMouseMove(e: MouseEvent) {
  if (!isDragging) return;
  const dx = e.clientX - lastMouseX; const dy = e.clientY - lastMouseY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
  rotationY.value += dx * 0.005;
  rotationX.value = Math.max(-0.8, Math.min(0.8, rotationX.value + dy * 0.005));
  lastMouseX = e.clientX; lastMouseY = e.clientY;
}
function onMouseUp(e: MouseEvent) {
  if (isDragging && !dragMoved) handleStageTap(e.clientX, e.clientY);
  isDragging = false;
}
function onWheel(e: WheelEvent) {
  cameraZoom.value = Math.max(0.65, Math.min(1.65, cameraZoom.value + (e.deltaY > 0 ? -0.08 : 0.08)));
}
function onTouchStart(e: TouchEvent) {
  if (e.touches.length === 1) {
    isDragging = true; dragMoved = false; lastMouseX = e.touches[0].clientX; lastMouseY = e.touches[0].clientY;
  }
}
function onTouchMove(e: TouchEvent) {
  if (!isDragging || e.touches.length !== 1) return;
  const dx = e.touches[0].clientX - lastMouseX; const dy = e.touches[0].clientY - lastMouseY;
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true;
  rotationY.value += dx * 0.006;
  rotationX.value = Math.max(-0.8, Math.min(0.8, rotationX.value + dy * 0.006));
  lastMouseX = e.touches[0].clientX; lastMouseY = e.touches[0].clientY;
}
function onTouchEnd(e: TouchEvent) {
  if (isDragging && !dragMoved && e.changedTouches.length > 0) {
    handleStageTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
  }
  isDragging = false;
}

// 8. Envio de Comandos e Telemetria
async function sendCommand(overrideText?: string) {
  const textToSend = (typeof overrideText === 'string' ? overrideText : promptText.value).trim();
  if (!textToSend || isProcessing.value) return;

  isProcessing.value = true;
  if (!overrideText) promptText.value = '';
  adjustTextareaHeight();

  let currentWebcamFrame = isCameraActive.value ? captureCurrentVideoFrame() : null;
  if (requiresCameraActivation(textToSend)) {
    voiceStatusText.value = '📷 A ativar visão da câmara...';
    const autoFrame = await ensureCameraAndCaptureFrame();
    if (autoFrame) currentWebcamFrame = autoFrame;
  }
  const screenFrame = isScreenActive.value ? captureCurrentVideoFrame() : null;

  try {
    const res = await fetch('/api/v1/webhook/ingress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identityToken: 'Matheus-Admin',
        sessionId: sessionId.value,
        sensorData: {
          type: 'voice_or_text',
          prompt: textToSend,
          textPrompt: textToSend,
          webcamFrame: currentWebcamFrame || undefined,
          faceFrameBase64: currentWebcamFrame || undefined,
          screenFrame: screenFrame || undefined
        }
      })
    });

    const json = await res.json().catch(() => ({}));
    registerAgentExecution(json);

    const payload = json.data || json;
    const replyText = payload?.response || payload?.data?.response || json?.response || json?.error || 'Comando processado.';
    lastResponse.value = {
      agent: payload?.agent || 'JARVIS',
      text: replyText,
      executionTimeMs: payload?.executionTimeMs || json?.executionTimeMs || 0
    };

    speakJarvisResponse(replyText);
    await loadEcosystemData();
  } catch {
    const msg = 'Erro de comunicação com o núcleo do JARVIS.';
    lastResponse.value = { agent: 'JARVIS', text: msg, executionTimeMs: 0 };
    speakJarvisResponse(msg);
  } finally {
    isProcessing.value = false;
  }
}

function stopAllEngines() {
  stopAnimationLoop();
  stopAllMedia();
  stopAllAudio();
  if (refreshIntervalId) clearInterval(refreshIntervalId);
}

async function bootAuthenticatedUniverse() {
  await loadEcosystemData();
  await fetchSessionMemoryOrbs(sessionId.value);
  startNeuralCanvasLoop();

  if (refreshIntervalId) clearInterval(refreshIntervalId);
  refreshIntervalId = setInterval(() => {
    if (isAuthenticated.value) loadEcosystemData();
  }, 15000);
}

onMounted(async () => {
  if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
  if (isAuthenticated.value) await bootAuthenticatedUniverse();

  // Desbloqueia o motor de áudio no primeiro toque na tela
  const startVigilance = async () => {
    await ensureMicrophonePermission();
    if (!recognition) recognition = initSTT();
    try {
      recognition.start();
    } catch {}
    window.removeEventListener('click', startVigilance);
    window.removeEventListener('touchstart', startVigilance);
  };
  window.addEventListener('click', startVigilance, { once: true });
  window.addEventListener('touchstart', startVigilance, { once: true });
});

onUnmounted(() => { stopAllEngines(); });
</script>

<style scoped>
.jarvis-universe {
  position: fixed; inset: 0; width: 100vw; height: 100dvh;
  background: #020409; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif;
  overflow: hidden; user-select: none;
}

/* Proteção do topo para não colidir com o relógio e bateria do Android */
.hud-top-safe-area {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;
  padding-top: max(env(safe-area-inset-top), 24px);
  pointer-events: none;
}
.hud-top-safe-area > * {
  pointer-events: auto;
}

.auth-overlay {
  position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center;
  padding: 16px; background: radial-gradient(circle at center, #09192c 0%, #020409 100%);
}
.auth-card {
  width: 100%; max-width: 360px; background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 16px; padding: 24px 20px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8); text-align: center; backdrop-filter: blur(12px);
}
.auth-core-ring {
  width: 52px; height: 52px; margin: 0 auto 12px; border-radius: 50%;
  border: 2px dashed #38bdf8; display: flex; align-items: center; justify-content: center;
}
.auth-core-inner { width: 28px; height: 28px; border-radius: 50%; background: radial-gradient(circle, #38bdf8 0%, #0284c7 100%); box-shadow: 0 0 16px #38bdf8; }
.auth-title { margin: 0; font-size: 16px; letter-spacing: 1.5px; color: #f8fafc; }
.auth-subtitle { margin: 4px 0 16px; font-size: 11px; color: #94a3b8; }
.auth-form { display: flex; flex-direction: column; gap: 12px; text-align: left; }
.auth-field label { display: block; font-size: 11px; color: #cbd5e1; margin-bottom: 4px; }
.auth-field input { width: 100%; box-sizing: border-box; padding: 9px 11px; border-radius: 8px; border: 1px solid #334155; background: #090d16; color: #ffffff; font-size: 13px; }
.auth-error { font-size: 11.5px; color: #f87171; background: rgba(127, 29, 29, 0.35); padding: 7px 9px; border-radius: 8px; }
.auth-submit-btn { padding: 10px; border-radius: 8px; border: none; background: linear-gradient(135deg, #0284c7, #2563eb); color: #ffffff; font-weight: 600; font-size: 13px; cursor: pointer; }

.canvas-stage { position: relative; width: 100%; height: 100%; touch-action: none; }
canvas { display: block; width: 100%; height: 100%; }

/* Indicador de Status Acoplado Acima da Barra de Comando */
.hud-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(11, 18, 33, 0.9);
  border: 1px solid rgba(56, 189, 248, 0.3);
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 10.5px;
  color: #94a3b8;
  margin-bottom: 6px;
  cursor: pointer;
  pointer-events: auto;
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  max-width: 90%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #38bdf8;
}
.hud-status-badge.awake {
  border-color: #f97316;
  color: #fdba74;
}
.hud-status-badge.awake .status-dot {
  background: #ea580c;
  box-shadow: 0 0 8px #f97316;
}

/* BARRA DE COMANDO COMPACTA */
.command-dock-wrapper {
  position: fixed;
  bottom: env(safe-area-inset-bottom, 10px);
  left: 0;
  right: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 10px;
  pointer-events: none;
}

.command-dock {
  pointer-events: auto;
  width: min(640px, 100%);
  display: flex;
  align-items: flex-end;
  gap: 6px;
  background: rgba(11, 18, 33, 0.94);
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 16px;
  padding: 6px 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(12px);
  box-sizing: border-box;
}

.dock-controls {
  display: flex;
  gap: 5px;
  align-items: center;
  margin-bottom: 2px;
}

.dock-btn {
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(51, 65, 85, 0.7);
  color: #f8fafc;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.dock-btn.active {
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
  line-height: 1.35;
  resize: none;
  max-height: 90px;
  min-height: 22px;
  padding: 4px 6px;
  box-sizing: border-box;
  overflow-y: auto;
}

.dock-textarea::placeholder {
  color: #64748b;
  font-size: 11.5px;
}

.send-btn {
  background: linear-gradient(135deg, #0284c7, #2563eb);
  color: #ffffff;
  border: none;
  border-radius: 10px;
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 2px;
  white-space: nowrap;
  transition: opacity 0.2s;
  flex-shrink: 0;
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Balão de Resposta Minimalista */
.response-bubble {
  position: fixed; bottom: 84px; left: 50%; transform: translateX(-50%);
  width: min(520px, calc(100vw - 20px)); max-height: 32dvh; overflow-y: auto;
  z-index: 40; background: rgba(11, 18, 33, 0.95); border: 1px solid rgba(56, 189, 248, 0.4);
  border-radius: 12px; padding: 9px 12px; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.65);
}
.response-header { display: flex; justify-content: space-between; font-size: 11px; color: #38bdf8; margin-bottom: 3px; }
.response-text { font-size: 12px; line-height: 1.4; color: #f1f5f9; white-space: pre-wrap; }
.close-bubble { background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 13px; }
</style>
