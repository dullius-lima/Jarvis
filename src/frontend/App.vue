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
      <HudHeader
        :agents-count="dynamicAgents.length"
        :active-nodes-count="activeSharedNodesCount"
        :memories-count="memoryDots.length"
        :has-selection-or-zoom="Boolean(activeAgentForTools || selectedSubNode || selectedMemoryDot || cameraZoom !== 1)"
        @reset-view="resetViewAndSelection"
        @open-password="showPasswordModal = true"
        @logout="handleLogout(stopAllEngines)"
      />

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

        <!-- Estado de Voz Flutuante -->
        <div class="hud-hint" @click="manualRestartWakeWord" title="Clique para alternar vigília ou microfone">
          <span>{{ voiceStatusText }}</span>
        </div>

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

        <!-- PRÉ-VISUALIZAÇÃO DE VÍDEO (CÂMARA OU ECRÃ) -->
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

      <!-- BARRA DE COMANDO: CHAT MULTILINHA E CONTROLOS -->
      <footer class="command-dock-wrapper">
        <div class="command-dock">
          <div class="dock-controls">
            <!-- Botão Microfone -->
            <button
              type="button"
              @click="toggleMicrophone"
              class="dock-btn mic-btn"
              :class="{ active: isJarvisAwake || isRecognitionActive }"
              :title="isJarvisAwake || isRecognitionActive ? 'Desativar Microfone' : 'Ativar Microfone'"
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

          <!-- Caixa de Texto Multilinha com Auto-Resize (Shift + Enter quebra linha) -->
          <div class="dock-input-wrapper">
            <textarea
              ref="chatInputRef"
              v-model="promptText"
              @keydown.enter.exact.prevent="sendCommand()"
              @keydown.shift.enter.stop
              @input="adjustTextareaHeight"
              rows="1"
              placeholder="Instrução para o JARVIS... (Shift + Enter quebra linha)"
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
            {{ isProcessing ? '⚡' : 'Transmitir' }}
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

// 4. Estados do Canvas e Input Multilinha
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
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  });
}

// ============================================================================
// 5. MOTOR DE VOZ INTEGRADO: 2.2s TOLERÂNCIA A PAUSAS, ZERO DELAY E TTS
// ============================================================================
const isJarvisAwake = ref<boolean>(false);
const isJarvisSpeaking = ref<boolean>(false);
const isRecognitionActive = ref<boolean>(false);
const voiceStatusText = ref<string>('🎙️ Microfone pronto');
const isVoiceMuted = ref<boolean>(false);

let recognition: any = null;
let speechSilenceTimer: any = null;
let speechAccumulatedBuffer = '';
let lastChimeTimestamp = 0;

function playJarvisChime(type: 'wake' | 'send' = 'wake') {
  const now = Date.now();
  if (now - lastChimeTimestamp < 2500 && type === 'wake') return;
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
    setTimeout(() => ctx.close().catch(() => {}), 300);
  } catch {}
}

function initSTT() {
  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    voiceStatusText.value = '⚠️ Web Speech API indisponível';
    return null;
  }

  const rec = new SpeechRecognition();
  rec.lang = 'pt-BR';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onstart = () => {
    isRecognitionActive.value = true;
    voiceStatusText.value = isJarvisAwake.value
      ? '🎙️ Ouvindo... Pode respirar e falar com calma'
      : '🟢 Vigília ativa: diga "Jarvis"...';
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

    // Deteção Wake Word contínua
    if (!isJarvisAwake.value && (lower.includes('jarvis') || lower.includes('jávis'))) {
      const afterWake = liveText.split(/jarvis|jávis/i).pop()?.replace(/^[,.\s!?-]+/, '').trim() || '';
      isJarvisAwake.value = true;
      playJarvisChime('wake');

      if (afterWake.length > 2) {
        speechAccumulatedBuffer = afterWake;
      } else {
        speechAccumulatedBuffer = '';
        voiceStatusText.value = '🎙️ Sim, senhor? Estou a ouvir...';
        return;
      }
    }

    if (isJarvisAwake.value && liveText.length > 1) {
      const cleaned = liveText.replace(/^(jarvis|jávis)[,.\s!?-]*/i, '').trim();
      promptText.value = cleaned;
      voiceStatusText.value = `🎙️ A captar: "${cleaned}"`;
      adjustTextareaHeight();

      // Tolerância de respiração: aguarda 2200ms de silêncio contínuo antes do envio
      speechSilenceTimer = setTimeout(() => {
        const finalPrompt = promptText.value.trim();
        if (finalPrompt.length > 1 && !isProcessing.value) {
          playJarvisChime('send');
          voiceStatusText.value = '⚡ A transmitir comando...';
          stopMicrophoneSession();
          sendCommand(finalPrompt);
        }
      }, 2200);
    }
  };

  rec.onerror = (event: any) => {
    if (event.error !== 'no-speech') {
      if (event.error === 'not-allowed') {
        voiceStatusText.value = '❌ Permissão de microfone negada';
        isRecognitionActive.value = false;
        isJarvisAwake.value = false;
      }
    }
  };

  rec.onend = () => {
    isRecognitionActive.value = false;
    if (isJarvisAwake.value && !isJarvisSpeaking.value) {
      try { rec.start(); } catch {}
    } else if (!isJarvisAwake.value) {
      voiceStatusText.value = '🎙️ Microfone em repouso';
    }
  };

  return rec;
}

function toggleMicrophone() {
  if (isRecognitionActive.value || isJarvisAwake.value) {
    stopMicrophoneSession();
    voiceStatusText.value = '🎙️ Microfone desligado';
    return;
  }

  speechAccumulatedBuffer = '';
  promptText.value = '';
  adjustTextareaHeight();
  isJarvisAwake.value = true;
  playJarvisChime('wake');

  if (!recognition) recognition = initSTT();
  try {
    recognition.start();
  } catch {
    try { recognition.stop(); recognition.start(); } catch {}
  }
}

function stopMicrophoneSession() {
  if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
  isJarvisAwake.value = false;
  isRecognitionActive.value = false;
  speechAccumulatedBuffer = '';
  if (recognition) {
    try { recognition.stop(); } catch {}
  }
}

function manualRestartWakeWord() {
  stopMicrophoneSession();
  toggleMicrophone();
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
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

// 6. Câmara 3D e Renderização no Canvas
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

    const bgGrad = ctx.createRadialGradient(width * 0.5, height * 0.48, 10, width * 0.5, height * 0.48, Math.max(width, height) * 0.75);
    bgGrad.addColorStop(0, '#09192c');
    bgGrad.addColorStop(0.55, '#050b16');
    bgGrad.addColorStop(1, '#020409');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    time += isJarvisSpeaking.value || isProcessing.value ? 0.032 : 0.012;
    if (!isDragging) rotationY.value += 0.0028;

    const isMobile = width < 768;
    const cx = width * 0.5;
    const cy = height * (isMobile ? 0.48 : 0.5);
    const fov = isMobile ? 520 : 680;
    const maxSafeRadius = Math.max(95, Math.min(width * 0.5 - (isMobile ? 48 : 80), height * 0.5 - (isMobile ? 115 : 130)));
    const coreRadius = Math.min(maxSafeRadius * 0.36, isMobile ? 56 : 82);
    const agentOrbitRadius = Math.min(maxSafeRadius * 0.88, isMobile ? 132 : 245);
    const sharedNodeOrbitRadius = Math.min(maxSafeRadius * 1.15, isMobile ? 162 : 330);

    // Anel orbital central
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(cx, cy, coreRadius * 1.32 * cameraZoom.value, time * 0.4, time * 0.4 + Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Wireframe 3D Central
    const effectiveCoreR = coreRadius * (1 + (isJarvisSpeaking.value || isProcessing.value ? Math.sin(time * 5) * 0.07 : Math.sin(time * 2) * 0.02));
    ctx.save();
    ctx.strokeStyle = isJarvisSpeaking.value ? '#38bdf8' : '#22d3ee';
    ctx.lineWidth = 1.1;
    for (let i = 1; i < 7; i++) {
      const theta = (i * Math.PI) / 7;
      ctx.beginPath();
      for (let j = 0; j <= 12; j++) {
        const phi = (j * 2 * Math.PI) / 12;
        const p = project3D(effectiveCoreR * Math.sin(theta) * Math.cos(phi), effectiveCoreR * Math.cos(theta), effectiveCoreR * Math.sin(theta) * Math.sin(phi), cx, cy, fov);
        if (j === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.globalAlpha = 0.42;
      ctx.stroke();
    }
    ctx.restore();

    // Orbes de Memória
    drawMemoryOrbsOnCanvas(ctx, cx, cy, rotationY.value);

    // Mapeamento e desenho de agentes e conectores
    renderedAgentsHitbox = [];
    renderedSubNodesHitbox = [];
    renderedMemoriesHitbox = [];

    const agentPositionsMap = new Map<any, { ag: any; proj: { x: number; y: number; scale: number }; color: string }>();
    dynamicAgents.value.forEach((ag, idx) => {
      const angle = (idx / Math.max(dynamicAgents.value.length, 1)) * Math.PI * 2 + 0.3;
      const rawProj = project3D(Math.cos(angle) * agentOrbitRadius, Math.sin(idx * 1.7 + time * 0.5) * (isMobile ? 28 : 42), Math.sin(angle) * agentOrbitRadius, cx, cy, fov);
      const color = ag.color || AGENT_PALETTE[idx % AGENT_PALETTE.length];
      agentPositionsMap.set(ag.id, { ag, proj: { x: rawProj.x, y: rawProj.y, scale: rawProj.scale }, color });
    });

    // Feixes sinápticos e memórias em trânsito
    Array.from(agentPositionsMap.values()).forEach(({ ag, proj: agProj, color }, index) => {
      const isSelected = activeAgentForTools.value?.id === ag.id;
      ctx.save();
      ctx.globalAlpha = isSelected ? 0.95 : 0.55;
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 2.4 : 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const ctrlX = (cx + agProj.x) * 0.5;
      const ctrlY = (cy + agProj.y) * 0.5 - 18;
      ctx.quadraticCurveTo(ctrlX, ctrlY, agProj.x, agProj.y);
      ctx.stroke();
      ctx.restore();

      const agentMemories = memoryDots.value.filter((m) => m.agentId === ag.id || m.agentName === ag.name);
      for (let d = 0; d < Math.min(Math.max(agentMemories.length, 2), 5); d++) {
        const t = (time * 0.22 + d * 0.2 + index * 0.17) % 1;
        const invT = 1 - t;
        const mx = invT * invT * cx + 2 * invT * t * ctrlX + t * t * agProj.x;
        const my = invT * invT * cy + 2 * invT * t * ctrlY + t * t * agProj.y;
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(mx, my, isMobile ? 3 : 3.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (agentMemories[d]) renderedMemoriesHitbox.push({ x: mx, y: my, r: 10, mem: agentMemories[d] });
      }
    });

    // Nós de Conectores Externos
    const uniqueToolIds = Array.from(new Set(dynamicAgents.value.flatMap((ag) => ag.tools || []).map((t: string) => String(t).toLowerCase())));
    uniqueToolIds.forEach((toolId, tIdx) => {
      const meta = getConnectionMeta(toolId);
      const angle = (tIdx / Math.max(uniqueToolIds.length, 1)) * Math.PI * 2 + 0.85;
      const tProj = project3D(Math.cos(angle) * sharedNodeOrbitRadius, Math.cos(tIdx * 2.1) * (isMobile ? 35 : 55), Math.sin(angle) * sharedNodeOrbitRadius, cx, cy, fov);
      const nodeR = isMobile ? 12 : 15;

      getAgentsUsingTool(toolId).forEach((cAg) => {
        const agEntry = agentPositionsMap.get(cAg.id);
        if (agEntry) {
          ctx.save();
          ctx.globalAlpha = 0.45;
          ctx.strokeStyle = agEntry.color;
          ctx.lineWidth = 1.2;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(agEntry.proj.x, agEntry.proj.y);
          ctx.lineTo(tProj.x, tProj.y);
          ctx.stroke();
          ctx.restore();
        }
      });

      ctx.save();
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(tProj.x, tProj.y, nodeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.font = `${isMobile ? 11 : 13}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(meta.icon || '🔌', tProj.x, tProj.y);
      ctx.restore();

      renderedSubNodesHitbox.push({ x: tProj.x, y: tProj.y, r: nodeR + 6, node: { ...meta, toolId } });
    });

    // Orbes dos Agentes
    Array.from(agentPositionsMap.values()).forEach(({ ag, proj, color }) => {
      const orbR = isMobile ? 22 : 28;
      const isSelected = activeAgentForTools.value?.id === ag.id;
      const isHighlighted = highlightedAgentSlug.value === ag.slug;

      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = isHighlighted ? highlightedStatusColor.value : color;
      ctx.lineWidth = isHighlighted || isSelected ? 3 : 2;
      ctx.shadowColor = isHighlighted ? highlightedStatusColor.value : color;
      ctx.shadowBlur = isHighlighted ? 20 : isSelected ? 16 : 8;

      ctx.beginPath();
      ctx.arc(proj.x, proj.y, orbR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.font = `${isMobile ? 16 : 20}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(ag.icon || '🤖', proj.x, proj.y);

      if ((ag.tools || []).length > 0) {
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(proj.x + orbR * 0.72, proj.y - orbR * 0.72, isMobile ? 8 : 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${isMobile ? 9 : 10}px system-ui`;
        ctx.fillText(String(ag.tools.length), proj.x + orbR * 0.72, proj.y - orbR * 0.72);
      }

      ctx.font = `600 ${isMobile ? 11 : 12.5}px system-ui, sans-serif`;
      ctx.fillStyle = '#f1f5f9';
      ctx.fillText(ag.name || 'Agente', proj.x, proj.y + orbR + (isMobile ? 13 : 16));
      ctx.restore();

      renderedAgentsHitbox.push({ x: proj.x, y: proj.y, r: orbR + 8, agent: ag });
    });

    animationFrameId = requestAnimationFrame(renderFrame);
  };
  animationFrameId = requestAnimationFrame(renderFrame);
}

// 7. Interações de Toque e Rato
function handleStageTap(clientX: number, clientY: number) {
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
});

onUnmounted(() => { stopAllEngines(); });
</script>

<style scoped>
.jarvis-universe {
  position: fixed; inset: 0; width: 100vw; height: 100dvh;
  background: #020409; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif;
  overflow: hidden; user-select: none;
}
.auth-overlay {
  position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center;
  padding: 16px; background: radial-gradient(circle at center, #09192c 0%, #020409 100%);
}
.auth-card {
  width: 100%; max-width: 380px; background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 16px; padding: 28px 22px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8); text-align: center; backdrop-filter: blur(12px);
}
.auth-core-ring {
  width: 64px; height: 64px; margin: 0 auto 14px; border-radius: 50%;
  border: 2px dashed #38bdf8; display: flex; align-items: center; justify-content: center;
}
.auth-core-inner { width: 36px; height: 36px; border-radius: 50%; background: radial-gradient(circle, #38bdf8 0%, #0284c7 100%); box-shadow: 0 0 18px #38bdf8; }
.auth-title { margin: 0; font-size: 18px; letter-spacing: 1.5px; color: #f8fafc; }
.auth-subtitle { margin: 6px 0 20px; font-size: 12px; color: #94a3b8; }
.auth-form { display: flex; flex-direction: column; gap: 14px; text-align: left; }
.auth-field label { display: block; font-size: 11.5px; color: #cbd5e1; margin-bottom: 5px; }
.auth-field input { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; border: 1px solid #334155; background: #090d16; color: #ffffff; font-size: 14px; }
.auth-error { font-size: 12px; color: #f87171; background: rgba(127, 29, 29, 0.35); padding: 8px 10px; border-radius: 8px; }
.auth-submit-btn { padding: 11px; border-radius: 8px; border: none; background: linear-gradient(135deg, #0284c7, #2563eb); color: #ffffff; font-weight: 700; font-size: 14px; cursor: pointer; }

.canvas-stage { position: relative; width: 100%; height: 100%; touch-action: none; }
canvas { display: block; width: 100%; height: 100%; }

.hud-hint {
  position: fixed; bottom: 76px; left: 16px; z-index: 45; background: rgba(15, 23, 42, 0.88);
  border: 1px solid rgba(56, 189, 248, 0.35); padding: 6px 14px; border-radius: 999px;
  font-size: 11.5px; color: #cbd5e1; cursor: pointer; backdrop-filter: blur(8px);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
}

.command-dock-wrapper {
  position: fixed;
  bottom: env(safe-area-inset-bottom, 16px);
  left: 0;
  right: 0;
  z-index: 50;
  display: flex;
  justify-content: center;
  padding: 0 12px;
  pointer-events: none;
}

.command-dock {
  pointer-events: auto;
  width: min(720px, 100%);
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: rgba(15, 23, 42, 0.94);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 20px;
  padding: 8px 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(12px);
  box-sizing: border-box;
}

.dock-controls {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 2px;
}

.dock-btn {
  background: rgba(30, 41, 59, 0.85);
  border: 1px solid #334155;
  color: #f8fafc;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.dock-btn:hover {
  border-color: #38bdf8;
  background: #1e293b;
}

.dock-btn.active {
  background: #0284c7;
  border-color: #38bdf8;
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.5);
}

.mic-btn.active {
  background: #ea580c;
  border-color: #f97316;
  box-shadow: 0 0 12px rgba(234, 88, 12, 0.6);
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
  font-size: 13.5px;
  font-family: inherit;
  line-height: 1.45;
  resize: none;
  max-height: 120px;
  min-height: 24px;
  padding: 6px 4px;
  box-sizing: border-box;
  overflow-y: auto;
}

.dock-textarea::placeholder {
  color: #64748b;
  font-size: 13px;
}

.send-btn {
  background: linear-gradient(135deg, #0284c7, #2563eb);
  color: #ffffff;
  border: none;
  border-radius: 14px;
  padding: 8px 16px;
  font-size: 12.5px;
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

/* Response bubble */
.response-bubble {
  position: fixed; bottom: 104px; left: 50%; transform: translateX(-50%);
  width: min(560px, calc(100vw - 24px)); max-height: 36dvh; overflow-y: auto;
  z-index: 40; background: rgba(15, 23, 42, 0.95); border: 1px solid #38bdf8;
  border-radius: 12px; padding: 10px 14px; box-shadow: 0 12px 30px rgba(0, 0, 0, 0.7);
}
.response-header { display: flex; justify-content: space-between; font-size: 11.5px; color: #38bdf8; margin-bottom: 4px; }
.response-text { font-size: 13px; line-height: 1.45; color: #f1f5f9; white-space: pre-wrap; }
.close-bubble { background: transparent; border: none; color: #94a3b8; cursor: pointer; }
</style>
