<!-- src/frontend/App.vue -->
<template>
  <div class="jarvis-universe">
    <!-- 1. TELA DE LOGIN / AUTENTICAÇÃO -->
    <div v-if="!isAuthenticated" class="auth-overlay">
      <div class="auth-card">
        <div class="auth-core-ring"><div class="auth-core-inner"></div></div>
        <h1 class="auth-title">JARVIS CORE</h1>
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

        <MediaPreview :remote-active="remoteSensory.active" :remote-modality="remoteSensory.modality" :device-label="remoteSensory.deviceLabel" :identified-name="remoteSensory.identifiedName" :is-familiar="remoteSensory.isFamiliar"
          ref="mediaPreviewComponent"
          :is-camera-active="isCameraActive"
          :is-screen-active="isScreenActive"
          @close="handleCloseMediaPreview"
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
import { registrarFerramentaWebMcp } from "./services/webMcpBridge";
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
  try { const jd = (window as any)?.Capacitor?.Plugins?.JarvisDevice; if (jd?.executeScreenCommand) { const r = await jd.executeScreenCommand({ command: textToSend }); if (r?.handled && r?.reply) { lastResponse.value = { agent: 'JARVIS', text: r.reply, executionTimeMs: 40 }; speakJarvisResponse(r.reply); return; } } } catch {}

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
    await loadEcosystemData(); sessionId.value=localStorage.getItem("jarvis_active_session_id")||sessionId.value;
  sessionId.value = localStorage.getItem('jarvis_active_session_id') || sessionId.value;
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
  await loadEcosystemData(); sessionId.value=localStorage.getItem("jarvis_active_session_id")||sessionId.value;
  sessionId.value = localStorage.getItem('jarvis_active_session_id') || sessionId.value;
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

registrarFerramentaWebMcp({
  name: "abrir_painel_configuracoes",
  description: "Abre o painel de configurações do JARVIS (settings.html) no dispositivo ativo.",
  inputSchema: { type: "object", properties: {} },
  execute: () => {
    window.location.href = "/settings.html";
    return { success: true, mensagem: "Navegando para o painel de configurações." };
  }
});


registrarFerramentaWebMcp({
  name: "trocar_aba_configuracoes",
  description: 'Muda a aba visível no painel APENAS quando o usuário ordenar explicitamente abrir ou navegar para uma aba. NUNCA acione em perguntas informativas.',
  inputSchema: {
    type: "object",
    properties: {
      aba: { type: "string", enum: ["brain", "security", "voices", "agents", "connectors", "memory", "prefs", "manual"] }
    },
    required: ["aba"]
  },
  execute: ({ aba }) => {
    try { localStorage.setItem("jarvis_active_tab", aba); } catch {}
    setTimeout(() => { window.location.href = `/settings.html?aba=${encodeURIComponent(aba)}`; }, 150);
    return { success: true, mensagem: `Abrindo painel na aba ${aba}.` };
  }
});

if (typeof window !== 'undefined' && !(window as any)['__jarvisSensoryHook']) {
  (window as any)['__jarvisSensoryHook'] = true;
  const _f = window.fetch.bind(window);
  window.fetch = async (u: any, o?: any) => {
    const url = typeof u === 'string' ? u : (u && u.url) || '';
    if (url.includes('/api/v1/webhook/ingress') && o && typeof o.body === 'string') {
      try {
        const b = JSON.parse(o.body);
        const t = String(b.prompt || b.message || b.text || b.command || (b.sensorData && b.sensorData.textPrompt) || '');
        const md = navigator.mediaDevices;
        if (!b.webcamFrame && md && md.getUserMedia && /ative\s+a\s+c[aâ]mera|liga\s+a\s+c[aâ]mera|est[aá]\s+me\s+vendo|t[aá]\s+me\s+vendo|consegue\s+me\s+ver/i.test(t)) {
          const st = await md.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
          const v = document.createElement('video'); v.srcObject = st; v.muted = true; await v.play();
          await new Promise(r => setTimeout(r, 350));
          const c = document.createElement('canvas'); c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
          c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height); st.getTracks().forEach(x => x.stop());
          b.webcamFrame = c.toDataURL('image/jpeg', 0.78);
        }
        if (!b.screenFrame && md && (md as any).getDisplayMedia && /veja\s+minha\s+tela|olhe\s+minha\s+tela|visualiz[ae]\s+minha\s+tela|o\s+que\s+est[aá]\s+na\s+tela/i.test(t)) {
          const st = await (md as any).getDisplayMedia({ video: true });
          const v = document.createElement('video'); v.srcObject = st; await v.play();
          await new Promise(r => setTimeout(r, 300));
          const c = document.createElement('canvas'); c.width = v.videoWidth || 1280; c.height = v.videoHeight || 720;
          c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height); st.getTracks().forEach(x => x.stop());
          b.screenFrame = c.toDataURL('image/jpeg', 0.75);
        }
        o = Object.assign({}, o, { body: JSON.stringify(b) });
      } catch (e) {}
    }
    return _f(u, o);
  };
}


const remoteSensory = ref({ active: false, modality: 'camera', deviceLabel: 'Galaxy S25', identifiedName: '', isFamiliar: false });
setInterval(async () => {
  if (typeof document !== 'undefined' && document.hidden) return;
  try {
    const r = await fetch('/api/v1/sensory/status');
    const j = await r.json();
    if (j && j.success) remoteSensory.value = j;
  } catch {}
}, 3000);


async function handleCloseMediaPreview() {
  stopAllMedia();
  if (typeof remoteSensory !== 'undefined' && remoteSensory.value) {
    remoteSensory.value.active = false;
  }
  try { await fetch('/api/v1/sensory/stop', { method: 'POST' }); } catch {}
}


const showDevicePairBox = ref(false);
const devicePairCodeInput = ref('');
const devicePairError = ref('');
const isPairingDevice = ref(false);

async function pairWithDeviceCode() {
  devicePairError.value = '';
  const code = devicePairCodeInput.value.trim().toUpperCase();
  if (!code) { devicePairError.value = 'Informe o código gerado na aba Dispositivos.'; return; }
  isPairingDevice.value = true;
  try {
    const r = await fetch('/api/v1/devices/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairingCode: code,
        platform: 'web',
        deviceType: 'pc',
        modelInfo: navigator.platform || 'Navegador Web'
      })
    });
    const j = await r.json();
    if (j.success && j.deviceToken) {
      localStorage.setItem('jarvis_paired_device_id', j.deviceId);
      localStorage.setItem('jarvis_paired_device_token', j.deviceToken);
      localStorage.setItem('jarvis_paired_device_name', j.customName || 'Dispositivo Web');
      localStorage.setItem('jarvis_authenticated_session', 'true');
      isAuthenticated.value = true;
      await bootAuthenticatedUniverse();
    } else {
      devicePairError.value = j.error || 'Código inválido ou bloqueado.';
    }
  } catch (e: any) {
    devicePairError.value = e.message || 'Erro de conexão.';
  } finally {
    isPairingDevice.value = false;
  }
}

</script>

<style scoped>
.jarvis-universe {
  position: fixed; inset: 0; width: 100vw; height: 100dvh;
  background: #010307; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif;
  overflow: hidden; user-select: none;
}

.minimal-top-bar { padding-top: 26px;
  padding-top: 26px;
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
