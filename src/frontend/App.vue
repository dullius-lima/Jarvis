<template>
  <div class="jarvis-universe">
    <!-- 1. TELA DE LOGIN / AUTENTICAÇÃO -->
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
            <label>Senha de Acesso</label>
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
            {{ isLoggingIn ? 'Autenticando...' : '🔓 Desbloquear JARVIS' }}
          </button>
        </form>
      </div>
    </div>

    <!-- 2. ECOSSISTEMA PRINCIPAL 3D MINIMALISTA -->
    <template v-else>
      <!-- TOPO MINIMALISTA COM ÍCONES PEQUENOS DE BORDAS CURVAS -->
      <header class="minimal-top-bar">
        <div class="brand-cluster">
          <div class="brand-row">
            <span class="core-status-led" :class="{ awake: isJarvisAwake, speaking: isJarvisSpeaking }"></span>
            <span class="brand-title">JARVIS CORE</span>
          </div>
          <div class="metrics-pill">
            {{ dynamicAgents.length }} Agentes • {{ activeSharedNodesCount }} Nós • {{ memoryDots.length }} Memórias
          </div>
        </div>

        <div class="top-actions">
          <button
            v-if="activeAgentForTools || selectedSubNode || selectedMemoryDot || cameraZoom !== 1"
            type="button"
            class="curved-icon-btn highlight"
            @click="resetViewAndSelection"
            title="Centralizar Visão 3D"
          >
            🎯
          </button>
          <button
            type="button"
            class="curved-icon-btn"
            @click="showPasswordModal = true"
            title="Alterar Senha"
          >
            🔑
          </button>
          <a
            href="/settings.html"
            class="curved-icon-btn"
            title="Configurações & Agentes"
          >
            ⚙️
          </a>
          <button
            type="button"
            class="curved-icon-btn danger"
            @click="handleLogout(stopAllEngines)"
            title="Sair"
          >
            🚪
          </button>
        </div>
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

        <!-- MODAL DE SENHA -->
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

        <!-- PREVIEW DE VÍDEO -->
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

      <!-- RODAPÉ MINIMALISTA COM QUEBRA DE LINHA E BORDAS CURVAS -->
      <footer class="command-dock-wrapper">
        <div
          class="hud-status-badge"
          :class="{ awake: isJarvisAwake, speaking: isJarvisSpeaking }"
          @click="onJarvisCoreClick"
        >
          <span class="status-dot"></span>
          <span>{{ voiceStatusText }}</span>
        </div>

        <div class="command-dock">
          <div class="dock-controls">
            <button
              type="button"
              @click="onJarvisCoreClick"
              class="dock-curved-btn mic-btn"
              :class="{ active: isJarvisAwake || isRecordingAudio }"
              title="Ativar Voz do JARVIS"
            >
              🎙️
            </button>

            <button
              type="button"
              @click="toggleWebcam"
              class="dock-curved-btn"
              :class="{ active: isCameraActive }"
              title="Câmera"
            >
              📷
            </button>

            <button
              type="button"
              @click="toggleScreenShare"
              class="dock-curved-btn"
              :class="{ active: isScreenActive }"
              title="Compartilhar Tela"
            >
              🖥️
            </button>
          </div>

          <!-- Textarea Multilinha com Quebra de Linha Real -->
          <div class="dock-input-wrapper">
            <textarea
              ref="chatInputRef"
              v-model="promptText"
              @keydown="handleTextareaKeydown"
              @input="adjustTextareaHeight"
              rows="1"
              placeholder="Mensagem para o JARVIS..."
              class="dock-textarea"
              :disabled="isProcessing"
            ></textarea>
          </div>

          <button
            type="button"
            @click="sendCommand()"
            class="send-curved-btn"
            :disabled="!promptText.trim() || isProcessing"
            title="Enviar mensagem"
          >
            {{ isProcessing ? '⚡' : '➤' }}
          </button>
        </div>
      </footer>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watchEffect, nextTick } from 'vue';

// Composables
import { useAuth } from './composables/useAuth';
import { useEcosystem, AGENT_PALETTE } from './composables/useEcosystem';
import { useMediaStream } from './composables/useMediaStream';
import { useMemoryOrbs } from './composables/useMemoryOrbs';

// Componentes
import ResponseBubble from './components/ResponseBubble.vue';
import MediaPreview from './components/MediaPreview.vue';
import AgentTelemetryBadge from './components/AgentTelemetryBadge.vue';

// Modais
import PasswordModal from './components/modals/PasswordModal.vue';
import AgentToolsPopover from './components/modals/AgentToolsPopover.vue';
import SubNodeInspector from './components/modals/SubNodeInspector.vue';
import MemoryInspector from './components/modals/MemoryInspector.vue';

// 1. Ponte de Vídeo
const mediaPreviewComponent = ref<any>(null);
watchEffect(() => {
  if (mediaPreviewComponent.value?.videoRef) {
    videoElement.value = mediaPreviewComponent.value.videoRef;
  }
});

// 2. Credenciais
async function onSaveCredentials(payload: { email: string; password: string }) {
  newEmailInput.value = payload.email;
  newPasswordInput.value = payload.password;
  await updateAdminCredentials();
}
const sessionId = ref<string>(localStorage.getItem('jarvis_active_session_id') || 'sess_main_admin');

// 3. Módulos
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

// 4. Estados do Chat Multilinha
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
    el.style.height = `${Math.min(el.scrollHeight, 115)}px`;
  });
}

// No PC: Enter envia e Shift+Enter quebra linha. No Celular: Enter quebra linha naturalmente.
function handleTextareaKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    const isMobileDevice = window.innerWidth < 768 || 'ontouchstart' in window;
    if (!isMobileDevice) {
      e.preventDefault();
      sendCommand();
    }
  }
}

// ============================================================================
// 5. MOTOR DE VOZ COMPLETO: RESPOSTA AO CHAMAR "JARVIS" + STT + WHISPER + TTS
// ============================================================================
const isJarvisAwake = ref<boolean>(false);
const isJarvisSpeaking = ref<boolean>(false);
const isRecordingAudio = ref<boolean>(false);
const voiceStatusText = ref<string>('Toque no Globo ou diga "Jarvis"');
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
  if (now - lastChimeTimestamp < 1200 && type === 'wake') return;
  lastChimeTimestamp = now;

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    if (type === 'wake') {
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.09);
    } else {
      osc.frequency.setValueAtTime(659.25, ctx.currentTime);
      osc.frequency.setValueAtTime(523.25, ctx.currentTime + 0.09);
    }

    gain.gain.setValueAtTime(0.09, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
    setTimeout(() => ctx.close().catch(() => {}), 300);
  } catch {}
}

async function ensureMicrophonePermission(): Promise<boolean> {
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      if (!localAudioStream || !localAudioStream.active) {
        localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      return true;
    }
  } catch (err) {
    console.warn('Permissão de áudio bloqueada:', err);
    voiceStatusText.value = '⚠️ Abra via Chrome (https) para liberar o microfone';
    return false;
  }
  return false;
}

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

      voiceStatusText.value = '⚡ Processando voz...';
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
            const spoken = data.text.trim();
            promptText.value = spoken;
            if (/^(oi\s+|ol[aá]\s+)?(jarvis|j[aá]vis)[.!?,\s]*$/i.test(spoken)) {
              const greeting = 'Sim, senhor? Estou ouvindo.';
              lastResponse.value = { agent: 'JARVIS', text: greeting, executionTimeMs: 12 };
              speakJarvisResponse(greeting, () => activateDirectListening());
            } else {
              sendCommand(spoken);
            }
          } else {
            voiceStatusText.value = 'Toque no Globo ou diga "Jarvis"';
          }
        } catch {
          voiceStatusText.value = 'Toque no Globo ou diga "Jarvis"';
        }
      };
    };
    mediaRecorder.start();
    isRecordingAudio.value = true;
  } catch {}
}

function stopWhisperFallbackRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    try { mediaRecorder.stop(); } catch {}
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
    const wakeWordPattern = /(?:oi|ol[aá]|ei|ok|fala|al[oô])?\s*(jarvis|j[aá]vis|jarves|iarvis|jarbas)/i;

    if (!isJarvisAwake.value && wakeWordPattern.test(lower)) {
      isJarvisAwake.value = true;
      playJarvisChime('wake');

      const parts = liveText.split(wakeWordPattern);
      const afterWake = parts.pop()?.replace(/^[,.\s!?-]+/, '').trim() || '';

      if (afterWake.length > 2) {
        speechAccumulatedBuffer = afterWake;
        promptText.value = afterWake;
        adjustTextareaHeight();
        voiceStatusText.value = `🎙️ "${afterWake}"`;
      } else {
        // Chamou apenas "Jarvis" ou "Oi Jarvis": responde verbalmente!
        speechAccumulatedBuffer = '';
        promptText.value = '';
        const greeting = 'Sim, senhor? Estou ouvindo.';
        lastResponse.value = { agent: 'JARVIS', text: greeting, executionTimeMs: 10 };
        voiceStatusText.value = '🔊 "Sim, senhor? Estou ouvindo..."';
        speakJarvisResponse(greeting, () => {
          activateDirectListening();
        });
        return;
      }
    }

    if (isJarvisAwake.value && liveText.length > 1) {
      const cleaned = liveText.replace(wakeWordPattern, '').replace(/^[,.\s!?-]+/, '').trim();
      if (!cleaned) return;

      promptText.value = cleaned;
      voiceStatusText.value = `🎙️ "${cleaned}"`;
      adjustTextareaHeight();

      speechSilenceTimer = setTimeout(() => {
        const finalPrompt = promptText.value.trim();
        if (finalPrompt.length > 1 && !isProcessing.value) {
          playJarvisChime('send');
          voiceStatusText.value = '⚡ Processando comando...';
          stopMicrophoneSession();
          sendCommand(finalPrompt);
        }
      }, 2100);
    }
  };

  rec.onerror = (event: any) => {
    if (['service-not-allowed', 'network'].includes(event.error)) {
      if (isJarvisAwake.value && !isRecordingAudio.value) {
        startWhisperFallbackRecording();
      }
    }
  };

  rec.onend = () => {
    if (isJarvisAwake.value && !isJarvisSpeaking.value) {
      try { rec.start(); } catch {}
    }
  };

  return rec;
}

function activateDirectListening() {
  speechAccumulatedBuffer = '';
  isJarvisAwake.value = true;
  voiceStatusText.value = '🎙️ Ouvindo você... Pode falar';

  if (!recognition) recognition = initSTT();
  try {
    recognition?.start();
  } catch {}
  startWhisperFallbackRecording();

  if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
  speechSilenceTimer = setTimeout(() => {
    if (isJarvisAwake.value && !promptText.value.trim()) {
      stopMicrophoneSession();
      voiceStatusText.value = 'Toque no Globo ou diga "Jarvis"';
    }
  }, 5500);
}

// Clique no Globo 3D ou no Botão de Microfone
async function onJarvisCoreClick() {
  selectedSubNode.value = null;
  selectedMemoryDot.value = null;
  activeAgentForTools.value = null;

  if (isJarvisAwake.value || isJarvisSpeaking.value) {
    stopMicrophoneSession();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    isJarvisSpeaking.value = false;
    voiceStatusText.value = 'Toque no Globo ou diga "Jarvis"';
    return;
  }

  playJarvisChime('wake');
  const hasPerm = await ensureMicrophonePermission();
  if (!hasPerm) {
    const msg = 'Sim, senhor? Para usar a voz no celular, abra pelo Chrome em https://163.176.111.18 ou digite abaixo.';
    lastResponse.value = { agent: 'JARVIS', text: msg, executionTimeMs: 0 };
    speakJarvisResponse('Sim, senhor? Estou pronto.');
    return;
  }

  activateDirectListening();
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

async function speakJarvisResponse(rawText: string, onDone?: () => void) {
  if (isVoiceMuted.value || !rawText) {
    if (onDone) onDone();
    return;
  }

  stopMicrophoneSession();
  isJarvisSpeaking.value = true;

  const cleanText = rawText
    .replace(/```[\s\S]*?```/g, 'bloco de código na tela.')
    .replace(/[*#_`~>|]/g, '')
    .trim();

  const finish = () => {
    isJarvisSpeaking.value = false;
    if (!isJarvisAwake.value) {
      voiceStatusText.value = 'Toque no Globo ou diga "Jarvis"';
    }
    if (onDone) onDone();
  };

  // 1. Tenta o sintetizador neural do backend (/api/v1/audio/speak)
  try {
    const res = await fetch('/api/v1/audio/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleanText, mode: 'auto' })
    });
    const data = await res.json();
    if (data.success && data.audioBase64) {
      const audio = new Audio(`data:${data.mimeType || 'audio/mpeg'};base64,${data.audioBase64}`);
      audio.onended = finish;
      audio.onerror = finish;
      await audio.play();
      return;
    }
  } catch {}

  // 2. Fallback para o sintetizador nativo do navegador
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.06;
      utterance.pitch = 0.95;
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    }, 80);
  } else {
    finish();
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

// ============================================================================
// 6. GLOBO 3D REALISTA DE ALTA DEFINIÇÃO DO JARVIS + GRAFO DE AGENTES
// ============================================================================
const rotationY = ref<number>(0);
const rotationX = ref<number>(0.22);
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

// Malha Geodésica Fibonacci Pré-Calculada para o Globo 3D Realista
const GLOBE_NODES_COUNT = 110;
const globeFibonacciNodes: Array<{ x: number; y: number; z: number; pulseOffset: number }> = [];
const goldenRatio = (1 + Math.sqrt(5)) / 2;
for (let i = 0; i < GLOBE_NODES_COUNT; i++) {
  const theta = (2 * Math.PI * i) / goldenRatio;
  const phi = Math.acos(1 - (2 * (i + 0.5)) / GLOBE_NODES_COUNT);
  globeFibonacciNodes.push({
    x: Math.sin(phi) * Math.cos(theta),
    y: Math.cos(phi),
    z: Math.sin(phi) * Math.sin(theta),
    pulseOffset: Math.random() * Math.PI * 2
  });
}

function resetViewAndSelection() {
  activeAgentForTools.value = null;
  selectedSubNode.value = null;
  selectedMemoryDot.value = null;
  cameraZoom.value = 1.0;
  rotationX.value = 0.22;
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

    const isMobile = width < 768;
    const cx = width * 0.5;
    const cy = height * (isMobile ? 0.45 : 0.48);
    const fov = isMobile ? 540 : 680;

    // Fundo Espacial Profundo com Iluminação Central
    const bgGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, Math.max(width, height) * 0.72);
    bgGrad.addColorStop(0, '#0a192f');
    bgGrad.addColorStop(0.5, '#040914');
    bgGrad.addColorStop(1, '#010307');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const isActiveState = isJarvisAwake.value || isJarvisSpeaking.value || isProcessing.value;
    time += isActiveState ? 0.036 : 0.014;
    if (!isDragging) rotationY.value += isActiveState ? 0.006 : 0.0032;

    const maxSafeRadius = Math.max(95, Math.min(width * 0.5 - (isMobile ? 34 : 65), height * 0.43 - (isMobile ? 38 : 60)));
    // Globo do JARVIS maior e mais imponente no centro
    const coreRadius = Math.min(maxSafeRadius * 0.44, isMobile ? 58 : 88);
    const agentOrbitRadius = Math.min(maxSafeRadius * 0.96, isMobile ? 132 : 240);
    const sharedNodeOrbitRadius = Math.min(maxSafeRadius * 1.22, isMobile ? 160 : 315);

    const voicePulse = isJarvisSpeaking.value
      ? 1 + Math.sin(time * 8) * 0.09 + Math.cos(time * 13) * 0.05
      : isJarvisAwake.value
      ? 1 + Math.sin(time * 5) * 0.06
      : 1 + Math.sin(time * 2) * 0.02;

    const effectiveCoreR = coreRadius * voicePulse;
    const screenCoreR = effectiveCoreR * cameraZoom.value;

    // ========================================================================
    // 1. GLOBO 3D VOLUMÉTRICO REALISTA DO JARVIS (COM PROFUNDIDADE Z-BUFFER)
    // ========================================================================

    // 1.1 Aura Externa Bioluminescente
    ctx.save();
    const outerHalo = ctx.createRadialGradient(cx, cy, screenCoreR * 0.1, cx, cy, screenCoreR * 1.85);
    if (isJarvisAwake.value) {
      outerHalo.addColorStop(0, 'rgba(56, 189, 248, 0.55)');
      outerHalo.addColorStop(0.45, 'rgba(14, 165, 233, 0.22)');
      outerHalo.addColorStop(1, 'rgba(2, 6, 23, 0)');
    } else if (isJarvisSpeaking.value) {
      outerHalo.addColorStop(0, 'rgba(34, 211, 238, 0.65)');
      outerHalo.addColorStop(0.5, 'rgba(6, 182, 212, 0.26)');
      outerHalo.addColorStop(1, 'rgba(2, 6, 23, 0)');
    } else {
      outerHalo.addColorStop(0, 'rgba(14, 165, 233, 0.34)');
      outerHalo.addColorStop(0.5, 'rgba(2, 132, 199, 0.12)');
      outerHalo.addColorStop(1, 'rgba(2, 6, 23, 0)');
    }
    ctx.fillStyle = outerHalo;
    ctx.beginPath();
    ctx.arc(cx, cy, screenCoreR * 1.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 1.2 Esfera de Vidro Escuro / Fresnel 3D Base
    ctx.save();
    const sphereGrad = ctx.createRadialGradient(
      cx - screenCoreR * 0.3,
      cy - screenCoreR * 0.3,
      screenCoreR * 0.08,
      cx,
      cy,
      screenCoreR
    );
    sphereGrad.addColorStop(0, 'rgba(186, 230, 253, 0.42)');
    sphereGrad.addColorStop(0.35, 'rgba(14, 165, 233, 0.22)');
    sphereGrad.addColorStop(0.78, 'rgba(3, 105, 161, 0.32)');
    sphereGrad.addColorStop(1, 'rgba(125, 211, 252, 0.65)');
    ctx.fillStyle = sphereGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, screenCoreR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 1.3 Anéis Giroscópicos 3D Inclinados ao redor do Globo
    const gyroConfigs = [
      { tiltX: 0.65, tiltZ: 0.3, radiusMult: 1.26, speed: 0.7, dash: [8, 6], color: '#38bdf8' },
      { tiltX: -0.55, tiltZ: -0.45, radiusMult: 1.38, speed: -0.5, dash: [18, 10, 4, 10], color: '#0ea5e9' },
      { tiltX: 0.18, tiltZ: 0.85, radiusMult: 1.15, speed: 0.9, dash: [4, 8], color: '#22d3ee' }
    ];

    gyroConfigs.forEach((gyro) => {
      ctx.save();
      ctx.strokeStyle = gyro.color;
      ctx.lineWidth = isActiveState ? 1.5 : 1.1;
      ctx.globalAlpha = isActiveState ? 0.78 : 0.48;
      ctx.setLineDash(gyro.dash);
      ctx.beginPath();
      const ringR = effectiveCoreR * gyro.radiusMult;
      for (let s = 0; s <= 40; s++) {
        const a = (s / 40) * Math.PI * 2 + time * gyro.speed;
        const rx = Math.cos(a) * ringR;
        const ry = Math.sin(a) * ringR * Math.sin(gyro.tiltX);
        const rz = Math.sin(a) * ringR * Math.cos(gyro.tiltZ);
        const p = project3D(rx, ry, rz, cx, cy, fov);
        if (s === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
    });

    // 1.4 Onda de Frequência Reativa à Voz ao Redor do Globo
    ctx.save();
    ctx.strokeStyle = isJarvisAwake.value ? '#7dd3fc' : '#38bdf8';
    ctx.lineWidth = isActiveState ? 1.8 : 1.0;
    ctx.globalAlpha = isActiveState ? 0.85 : 0.35;
    ctx.beginPath();
    const waveSegments = 64;
    for (let s = 0; s <= waveSegments; s++) {
      const angle = (s / waveSegments) * Math.PI * 2;
      const waveAmp = isActiveState
        ? Math.sin(angle * 8 + time * 6) * (screenCoreR * 0.09) + Math.cos(angle * 5 - time * 4) * (screenCoreR * 0.05)
        : Math.sin(angle * 6 + time * 2) * (screenCoreR * 0.025);
      const r = screenCoreR * 1.06 + waveAmp;
      const wx = cx + Math.cos(angle) * r;
      const wy = cy + Math.sin(angle) * r;
      if (s === 0) ctx.moveTo(wx, wy);
      else ctx.lineTo(wx, wy);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // 1.5 Malha Geodésica Fibonacci 3D (Plexus Esférico com Profundidade Real)
    const projectedGlobePts = globeFibonacciNodes.map((n) => {
      const p = project3D(n.x * effectiveCoreR, n.y * effectiveCoreR, n.z * effectiveCoreR, cx, cy, fov);
      return { ...p, pulseOffset: n.pulseOffset };
    });

    // Filamentos da superfície esférica
    ctx.save();
    for (let i = 0; i < projectedGlobePts.length; i++) {
      const p1 = projectedGlobePts[i];
      // Só desenha conexões mais intensas no hemisfério frontal (z < 0 na projeção)
      const depthFactor = Math.max(0.15, Math.min(1, (effectiveCoreR - p1.z) / (effectiveCoreR * 2)));
      for (let j = i + 1; j < projectedGlobePts.length; j++) {
        const p2 = projectedGlobePts[j];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (dist < screenCoreR * 0.36) {
          ctx.strokeStyle = isJarvisAwake.value ? '#7dd3fc' : '#38bdf8';
          ctx.globalAlpha = depthFactor * (1 - dist / (screenCoreR * 0.36)) * (isActiveState ? 0.72 : 0.45);
          ctx.lineWidth = depthFactor * 1.15;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
    }

    // Pontos de luz nodais sobre a superfície do globo
    for (let i = 0; i < projectedGlobePts.length; i++) {
      const pt = projectedGlobePts[i];
      const depthFactor = Math.max(0.2, Math.min(1, (effectiveCoreR - pt.z) / (effectiveCoreR * 2)));
      const nodeSize = (1.1 + depthFactor * 1.6) * cameraZoom.value;
      ctx.fillStyle = depthFactor > 0.65 ? '#e0f2fe' : '#38bdf8';
      ctx.globalAlpha = depthFactor * (0.6 + 0.4 * Math.sin(time * 3 + pt.pulseOffset));
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, nodeSize, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 1.6 Núcleo Energético Interno (Coração de Luz do Globo)
    ctx.save();
    const innerCoreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, screenCoreR * 0.42);
    innerCoreGrad.addColorStop(0, '#ffffff');
    innerCoreGrad.addColorStop(0.4, isJarvisAwake.value ? '#7dd3fc' : '#38bdf8');
    innerCoreGrad.addColorStop(1, 'rgba(2, 132, 199, 0)');
    ctx.fillStyle = innerCoreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, screenCoreR * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ========================================================================
    // 2. BOLINHAS AZUIS DE MEMÓRIA EM ÓRBITA
    // ========================================================================
    drawMemoryOrbsOnCanvas(ctx, cx, cy, rotationY.value);

    // ========================================================================
    // 3. AGENTES ESPECIALISTAS E SUB-NÓS (DESIGN CURVO E MINIMALISTA)
    // ========================================================================
    renderedAgentsHitbox = [];
    renderedSubNodesHitbox = [];
    renderedMemoriesHitbox = [];

    const agentPositionsMap = new Map<any, { ag: any; proj: { x: number; y: number; scale: number }; color: string }>();
    dynamicAgents.value.forEach((ag, idx) => {
      const angle = (idx / Math.max(dynamicAgents.value.length, 1)) * Math.PI * 2 + 0.3;
      const rawProj = project3D(
        Math.cos(angle) * agentOrbitRadius,
        Math.sin(idx * 1.7 + time * 0.45) * (isMobile ? 22 : 34),
        Math.sin(angle) * agentOrbitRadius,
        cx,
        cy,
        fov
      );
      const color = ag.color || AGENT_PALETTE[idx % AGENT_PALETTE.length];
      agentPositionsMap.set(ag.id, { ag, proj: { x: rawProj.x, y: rawProj.y, scale: rawProj.scale }, color });
    });

    // Feixes sinápticos entre o Globo JARVIS e os Agentes
    Array.from(agentPositionsMap.values()).forEach(({ ag, proj: agProj, color }, index) => {
      const isSelected = activeAgentForTools.value?.id === ag.id;
      ctx.save();
      ctx.globalAlpha = isSelected ? 0.85 : 0.38;
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 1.8 : 1.1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const ctrlX = (cx + agProj.x) * 0.5;
      const ctrlY = (cy + agProj.y) * 0.5 - 14;
      ctx.quadraticCurveTo(ctrlX, ctrlY, agProj.x, agProj.y);
      ctx.stroke();
      ctx.restore();

      const agentMemories = memoryDots.value.filter((m) => m.agentId === ag.id || m.agentName === ag.name);
      for (let d = 0; d < Math.min(Math.max(agentMemories.length, 2), 3); d++) {
        const t = (time * 0.18 + d * 0.25 + index * 0.17) % 1;
        const invT = 1 - t;
        const mx = invT * invT * cx + 2 * invT * t * ctrlX + t * t * agProj.x;
        const my = invT * invT * cy + 2 * invT * t * ctrlY + t * t * agProj.y;
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(mx, my, isMobile ? 2.3 : 3.0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (agentMemories[d]) renderedMemoriesHitbox.push({ x: mx, y: my, r: 8, mem: agentMemories[d] });
      }
    });

    // Sub-Nós / Conectores Externos
    const uniqueToolIds = Array.from(
      new Set(dynamicAgents.value.flatMap((ag) => ag.tools || []).map((t: string) => String(t).toLowerCase()))
    );
    uniqueToolIds.forEach((toolId, tIdx) => {
      const meta = getConnectionMeta(toolId);
      const angle = (tIdx / Math.max(uniqueToolIds.length, 1)) * Math.PI * 2 + 0.85;
      const tProj = project3D(
        Math.cos(angle) * sharedNodeOrbitRadius,
        Math.cos(tIdx * 2.1) * (isMobile ? 26 : 44),
        Math.sin(angle) * sharedNodeOrbitRadius,
        cx,
        cy,
        fov
      );
      const nodeR = isMobile ? 9 : 11.5;

      getAgentsUsingTool(toolId).forEach((cAg) => {
        const agEntry = agentPositionsMap.get(cAg.id);
        if (agEntry) {
          ctx.save();
          ctx.globalAlpha = 0.3;
          ctx.strokeStyle = agEntry.color;
          ctx.lineWidth = 0.9;
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.moveTo(agEntry.proj.x, agEntry.proj.y);
          ctx.lineTo(tProj.x, tProj.y);
          ctx.stroke();
          ctx.restore();
        }
      });

      ctx.save();
      ctx.fillStyle = 'rgba(11, 19, 41, 0.92)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(tProj.x, tProj.y, nodeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.font = `${isMobile ? 9 : 11}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(meta.icon || '🔌', tProj.x, tProj.y);
      ctx.restore();

      renderedSubNodesHitbox.push({ x: tProj.x, y: tProj.y, r: nodeR + 5, node: { ...meta, toolId } });
    });

    // Orbes Minimalistas dos Agentes
    Array.from(agentPositionsMap.values()).forEach(({ ag, proj, color }) => {
      const orbR = isMobile ? 16 : 20;
      const isSelected = activeAgentForTools.value?.id === ag.id;
      const isHighlighted = highlightedAgentSlug.value === ag.slug;

      ctx.save();
      ctx.fillStyle = 'rgba(11, 18, 34, 0.92)';
      ctx.strokeStyle = isHighlighted ? highlightedStatusColor.value : color;
      ctx.lineWidth = isHighlighted || isSelected ? 2.2 : 1.4;
      ctx.shadowColor = isHighlighted ? highlightedStatusColor.value : color;
      ctx.shadowBlur = isHighlighted ? 14 : isSelected ? 10 : 5;

      ctx.beginPath();
      ctx.arc(proj.x, proj.y, orbR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.font = `${isMobile ? 12.5 : 15}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(ag.icon || '🤖', proj.x, proj.y);

      if ((ag.tools || []).length > 0) {
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(proj.x + orbR * 0.72, proj.y - orbR * 0.72, isMobile ? 5.5 : 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${isMobile ? 7 : 8}px system-ui`;
        ctx.fillText(String(ag.tools.length), proj.x + orbR * 0.72, proj.y - orbR * 0.72);
      }

      ctx.font = `500 ${isMobile ? 8.5 : 10}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = 'rgba(203, 213, 225, 0.88)';
      const rawName = ag.name || 'Agente';
      const cleanName = rawName.length > 18 ? rawName.slice(0, 16) + '…' : rawName;
      ctx.fillText(cleanName, proj.x, proj.y + orbR + (isMobile ? 9 : 12));
      ctx.restore();

      renderedAgentsHitbox.push({ x: proj.x, y: proj.y, r: orbR + 6, agent: ag });
    });

    animationFrameId = requestAnimationFrame(renderFrame);
  };
  animationFrameId = requestAnimationFrame(renderFrame);
}

// 7. Toque e Mouse
function handleStageTap(clientX: number, clientY: number) {
  const isMobile = (window.innerWidth || 360) < 768;
  const cx = (window.innerWidth || 360) * 0.5;
  const cy = (window.innerHeight || 640) * (isMobile ? 0.45 : 0.48);
  const coreHitRadius = (isMobile ? 58 : 88) * cameraZoom.value * 1.25;

  // Toque no Globo 3D do JARVIS
  if (Math.hypot(clientX - cx, clientY - cy) <= coreHitRadius) {
    onJarvisCoreClick();
    return;
  }

  for (const item of renderedAgentsHitbox) {
    if (Math.hypot(clientX - item.x, clientY - item.y) <= item.r) {
      selectedSubNode.value = null;
      selectedMemoryDot.value = null;
      activeAgentForTools.value = item.agent;
      return;
    }
  }

  for (const sub of renderedSubNodesHitbox) {
    if (Math.hypot(clientX - sub.x, clientY - sub.y) <= sub.r) {
      activeAgentForTools.value = null;
      selectedMemoryDot.value = null;
      selectedSubNode.value = sub.node;
      return;
    }
  }

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

// 8. Envio de Comandos ao Orquestrador
async function sendCommand(overrideText?: string) {
  const textToSend = (typeof overrideText === 'string' ? overrideText : promptText.value).trim();
  if (!textToSend || isProcessing.value) return;

  isProcessing.value = true;
  if (!overrideText) promptText.value = '';
  adjustTextareaHeight();

  let currentWebcamFrame = isCameraActive.value ? captureCurrentVideoFrame() : null;
  if (requiresCameraActivation(textToSend)) {
    voiceStatusText.value = '📷 Ativando visão da câmera...';
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

  const unlockAudioAndMic = async () => {
    if (!recognition) recognition = initSTT();
    try { recognition?.start(); } catch {}
    window.removeEventListener('click', unlockAudioAndMic);
    window.removeEventListener('touchstart', unlockAudioAndMic);
  };
  window.addEventListener('click', unlockAudioAndMic, { once: true });
  window.addEventListener('touchstart', unlockAudioAndMic, { once: true });
});

onUnmounted(() => { stopAllEngines(); });
</script>

<style scoped>
.jarvis-universe {
  position: fixed; inset: 0; width: 100vw; height: 100dvh;
  background: #010307; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif;
  overflow: hidden; user-select: none;
}

/* TOPO MINIMALISTA COM ÍCONES PEQUENOS E BORDAS CURVAS */
.minimal-top-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 45;
  padding: max(env(safe-area-inset-top, 16px), 34px) 14px 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  pointer-events: none;
}

.brand-cluster {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 7px;
}

.core-status-led {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #38bdf8;
  box-shadow: 0 0 8px #38bdf8;
}
.core-status-led.awake {
  background: #f97316;
  box-shadow: 0 0 10px #f97316;
}
.core-status-led.speaking {
  background: #22d3ee;
  box-shadow: 0 0 12px #22d3ee;
}

.brand-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.6px;
  color: #e2e8f0;
}

.metrics-pill {
  font-size: 9.5px;
  color: #64748b;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(56, 189, 248, 0.18);
  padding: 2px 8px;
  border-radius: 999px;
  backdrop-filter: blur(8px);
}

.top-actions {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.curved-icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 11px;
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(56, 189, 248, 0.22);
  color: #cbd5e1;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  cursor: pointer;
  backdrop-filter: blur(10px);
  transition: all 0.2s ease;
}

.curved-icon-btn:hover {
  border-color: #38bdf8;
  color: #ffffff;
  background: rgba(14, 165, 233, 0.2);
}

.curved-icon-btn.highlight {
  border-color: #38bdf8;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.35);
}

.curved-icon-btn.danger:hover {
  border-color: #f87171;
}

/* LOGIN OVERLAY */
.auth-overlay {
  position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center;
  padding: 16px; background: radial-gradient(circle at center, #09192c 0%, #020409 100%);
}
.auth-card {
  width: 100%; max-width: 340px; background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 18px; padding: 22px 18px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8); text-align: center; backdrop-filter: blur(12px);
}
.auth-core-ring {
  width: 48px; height: 48px; margin: 0 auto 10px; border-radius: 50%;
  border: 1.5px dashed #38bdf8; display: flex; align-items: center; justify-content: center;
}
.auth-core-inner { width: 24px; height: 24px; border-radius: 50%; background: radial-gradient(circle, #38bdf8 0%, #0284c7 100%); box-shadow: 0 0 14px #38bdf8; }
.auth-title { margin: 0; font-size: 15px; letter-spacing: 1.5px; color: #f8fafc; }
.auth-subtitle { margin: 4px 0 14px; font-size: 10.5px; color: #94a3b8; }
.auth-form { display: flex; flex-direction: column; gap: 10px; text-align: left; }
.auth-field label { display: block; font-size: 10.5px; color: #cbd5e1; margin-bottom: 4px; }
.auth-field input { width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 10px; border: 1px solid #334155; background: #090d16; color: #ffffff; font-size: 12.5px; }
.auth-error { font-size: 11px; color: #f87171; background: rgba(127, 29, 29, 0.35); padding: 6px 8px; border-radius: 8px; }
.auth-submit-btn { padding: 9px; border-radius: 10px; border: none; background: linear-gradient(135deg, #0284c7, #2563eb); color: #ffffff; font-weight: 600; font-size: 12.5px; cursor: pointer; }

.canvas-stage { position: relative; width: 100%; height: 100%; touch-action: none; }
canvas { display: block; width: 100%; height: 100%; }

/* BADGE DE STATUS ACIMA DO CHAT */
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

/* RODAPÉ E BARRA DE CHAT MULTILINHA COM BORDAS CURVAS */
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
  width: 30px;
  height: 30px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12.5px;
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
  width: 32px;
  height: 30px;
  border-radius: 10px;
  font-size: 12px;
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
