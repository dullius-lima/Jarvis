<!-- src/frontend/App.vue -->
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

    <!-- 2. ECOSSISTEMA PRINCIPAL 3D -->
    <template v-else>
      <!-- TOPO MINIMALISTA COM ÍCONES CURVOS -->
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

        <!-- Modais e Inspetores -->
        <PasswordModal
          v-if="showPasswordModal"
          :initial-email="loginEmail"
          :feedback="credFeedback"
          @close="showPasswordModal = false"
          @save="onSaveCredentials"
        />

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

        <SubNodeInspector
          :node="selectedSubNode"
          :agents="dynamicAgents"
          :is-linked="isConnectionLinked"
          :get-agents-using="getAgentsUsingTool"
          @close="selectedSubNode = null"
          @toggle-agent="(ag, toolId) => toggleAgentConnection(ag, toolId)"
        />

        <MemoryInspector
          :memory="selectedMemoryDot"
          @close="selectedMemoryDot = null"
        />

        <MediaPreview
          ref="mediaPreviewComponent"
          :is-camera-active="isCameraActive"
          :is-screen-active="isScreenActive"
          @close="stopAllMedia"
        />

        <ResponseBubble :response="lastResponse" @close="lastResponse = null">
          <template #telemetry>
            <AgentTelemetryBadge :telemetry="lastTelemetry" />
          </template>
        </ResponseBubble>
      </div>

      <!-- BARRA DE COMANDO MODULAR -->
      <CommandDock
        ref="commandDockRef"
        v-model="promptText"
        :is-processing="isProcessing"
        :is-jarvis-awake="isJarvisAwake"
        :is-jarvis-speaking="isJarvisSpeaking"
        :is-recording-audio="isRecordingAudio"
        :is-camera-active="isCameraActive"
        :is-screen-active="isScreenActive"
        :voice-status-text="voiceStatusText"
        @toggle-mic="onJarvisCoreClick((t) => promptText = t)"
        @toggle-cam="toggleWebcam"
        @toggle-screen="toggleScreenShare"
        @send="sendCommand()"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watchEffect } from 'vue';

// Composables do Ecossistema
import { useAuth } from './composables/useAuth';
import { useEcosystem } from './composables/useEcosystem';
import { useMediaStream } from './composables/useMediaStream';
import { useMemoryOrbs } from './composables/useMemoryOrbs';
import { useVoiceAndAudio } from './composables/useVoiceAndAudio';
import { useNeuralCanvas } from './composables/useNeuralCanvas';

// Componentes da Interface
import CommandDock from './components/CommandDock.vue';
import ResponseBubble from './components/ResponseBubble.vue';
import MediaPreview from './components/MediaPreview.vue';
import AgentTelemetryBadge from './components/AgentTelemetryBadge.vue';

// Modais
import PasswordModal from './components/modals/PasswordModal.vue';
import AgentToolsPopover from './components/modals/AgentToolsPopover.vue';
import SubNodeInspector from './components/modals/SubNodeInspector.vue';
import MemoryInspector from './components/modals/MemoryInspector.vue';

const sessionId = ref<string>(localStorage.getItem('jarvis_active_session_id') || 'sess_main_admin');
const promptText = ref<string>('');
const isProcessing = ref<boolean>(false);
const lastResponse = ref<{ agent: string; text: string; executionTimeMs?: number } | null>(null);
const neuralCanvas = ref<HTMLCanvasElement | null>(null);
const commandDockRef = ref<any>(null);

// Elementos Ativos de Inspeção
const activeAgentForTools = ref<any | null>(null);
const selectedSubNode = ref<any | null>(null);
const selectedMemoryDot = ref<any | null>(null);

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

// 3. Inicialização dos Composables
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

// Desestruturação de highlightedToolSlugs de useMemoryOrbs
const {
  lastTelemetry, highlightedAgentSlug, highlightedStatusColor,
  highlightedToolSlugs,
  fetchSessionMemoryOrbs, registerAgentExecution, drawMemoryOrbsOnCanvas
} = useMemoryOrbs();

const {
  isJarvisAwake, isJarvisSpeaking, isRecordingAudio, voiceStatusText,
  onJarvisCoreClick, stopMicrophoneSession, speakJarvisResponse, stopAllAudio,
  setupAudioUnlockListener
} = useVoiceAndAudio((spokenText, audioBase64) => {
  sendCommand(spokenText, audioBase64);
});

// Repasse de highlightedToolSlugs para useNeuralCanvas
const {
  cameraZoom, resetView, startNeuralCanvasLoop, stopAnimationLoop,
  onMouseDown, onMouseMove, onMouseUp, onWheel, onTouchStart, onTouchMove, onTouchEnd
} = useNeuralCanvas({
  neuralCanvas,
  dynamicAgents,
  memoryDots,
  getConnectionMeta,
  getAgentsUsingTool,
  drawMemoryOrbsOnCanvas,
  highlightedAgentSlug,
  highlightedStatusColor,
  highlightedToolSlugs,
  isJarvisAwake,
  isJarvisSpeaking,
  isProcessing,
  onSelectAgent: (ag) => { selectedSubNode.value = null; selectedMemoryDot.value = null; activeAgentForTools.value = ag; },
  onSelectSubNode: (sub) => { activeAgentForTools.value = null; selectedMemoryDot.value = null; selectedSubNode.value = sub; },
  onSelectMemory: (mem) => { activeAgentForTools.value = null; selectedSubNode.value = null; selectedMemoryDot.value = mem; },
  onCoreTap: () => onJarvisCoreClick((t) => promptText.value = t)
});

function resetViewAndSelection() {
  activeAgentForTools.value = null;
  selectedSubNode.value = null;
  selectedMemoryDot.value = null;
  resetView();
}

// 4. Envio de Comandos Unificado (Texto e Voz Desacoplados para Nunca Travar a UI)
let isVoiceRequestInFlight = false;

// 4. Envio de Comandos Unificado (Com trava de concorrência para Voz e Texto)
async function sendCommand(overrideText?: string, audioSnippetBase64?: string) {
  const textToSend = (typeof overrideText === 'string' ? overrideText : promptText.value).trim();
  if (!textToSend) return;

  const isBackgroundVoiceCheck =
    textToSend === '__WAKE_WORD_CHECK__' || textToSend === '__VAD_AUDIO_ONLY__';

  if (isBackgroundVoiceCheck) {
    // Impede empilhamento de requisições de áudio enquanto o backend ou o TTS ainda está ativo
    if (isVoiceRequestInFlight || isProcessing.value || isJarvisSpeaking.value) return;
    isVoiceRequestInFlight = true;
  } else {
    if (isProcessing.value) return;
    isProcessing.value = true;
    if (!overrideText) promptText.value = '';
    if (commandDockRef.value?.resetHeight) commandDockRef.value.resetHeight();
  }

  let currentWebcamFrame = isCameraActive.value ? captureCurrentVideoFrame() : null;
  if (!isBackgroundVoiceCheck && requiresCameraActivation(textToSend)) {
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
          screenFrame: screenFrame || undefined,
          audioBase64: audioSnippetBase64 || undefined
        }
      })
    });

    const json = await res.json().catch(() => ({}));
    const payload = json.data || json;

    // Se foi apenas conversa alheia ou ruído sem a palavra "Jarvis", ignora em silêncio
    if (payload?.silentIgnore || json?.silentIgnore || payload?.ignored) {
      if (!isJarvisAwake.value) {
        voiceStatusText.value = '🟢 Vigília Ativa: Diga "Jarvis"...';
      }
      return;
    }

    registerAgentExecution(json);

    const replyText =
      payload?.response ||
      payload?.data?.response ||
      json?.response ||
      (json?.error ? `⚠️ Falha: ${json.error}` : null) ||
      (json?.message ? `⚠️ Detalhe: ${json.message}` : null) ||
      'O sistema não retornou uma resposta textual. Verifique os logs do modelo.';

    lastResponse.value = {
      agent: payload?.agent || json?.agent || 'JARVIS',
      text: replyText,
      executionTimeMs: payload?.executionTimeMs || json?.executionTimeMs || 0
    };

    const shouldKeepAwake = Boolean(
      payload?.keepAwake || json?.keepAwake || isBackgroundVoiceCheck
    );

    speakJarvisResponse(replyText, shouldKeepAwake);
    await loadEcosystemData();
  } catch (err: any) {
    if (!isBackgroundVoiceCheck) {
      console.error('Falha no envio do comando:', err);
      const msg = 'Erro de comunicação com o núcleo do JARVIS.';
      lastResponse.value = { agent: 'JARVIS', text: msg, executionTimeMs: 0 };
      speakJarvisResponse(msg, false);
    } else {
      voiceStatusText.value = '🟢 Vigília Ativa: Diga "Jarvis"...';
    }
  } finally {
    if (isBackgroundVoiceCheck) {
      isVoiceRequestInFlight = false;
    } else {
      isProcessing.value = false;
    }
  }
}

let refreshIntervalId: any = null;

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
  setupAudioUnlockListener();
});

onUnmounted(() => { stopAllEngines(); });
</script>

<style scoped>
.jarvis-universe {
  position: fixed; inset: 0; width: 100vw; height: 100dvh;
  background: #010307; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif;
  overflow: hidden; user-select: none;
}

.minimal-top-bar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 45;
  padding: max(env(safe-area-inset-top, 16px), 32px) 14px 8px;
  display: flex; justify-content: space-between; align-items: center;
  pointer-events: none;
}

.brand-cluster { pointer-events: auto; display: flex; flex-direction: column; gap: 3px; }
.brand-row { display: flex; align-items: center; gap: 7px; }

.core-status-led {
  width: 7px; height: 7px; border-radius: 50%;
  background: #38bdf8; box-shadow: 0 0 8px #38bdf8;
}
.core-status-led.awake { background: #f97316; box-shadow: 0 0 10px #f97316; }
.core-status-led.speaking { background: #22d3ee; box-shadow: 0 0 12px #22d3ee; }

.brand-title { font-size: 11px; font-weight: 700; letter-spacing: 1.6px; color: #e2e8f0; }

.metrics-pill {
  font-size: 9.5px; color: #64748b; background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(56, 189, 248, 0.18); padding: 2px 8px; border-radius: 999px;
  backdrop-filter: blur(8px);
}

.top-actions { pointer-events: auto; display: flex; align-items: center; gap: 6px; }

.curved-icon-btn {
  width: 32px; height: 32px; border-radius: 11px;
  background: rgba(15, 23, 42, 0.72); border: 1px solid rgba(56, 189, 248, 0.22);
  color: #cbd5e1; font-size: 13px; display: flex; align-items: center; justify-content: center;
  text-decoration: none; cursor: pointer; backdrop-filter: blur(10px); transition: all 0.2s ease;
}
.curved-icon-btn:hover { border-color: #38bdf8; color: #ffffff; background: rgba(14, 165, 233, 0.2); }
.curved-icon-btn.highlight { border-color: #38bdf8; box-shadow: 0 0 10px rgba(56, 189, 248, 0.35); }
.curved-icon-btn.danger:hover { border-color: #f87171; }

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
</style>
