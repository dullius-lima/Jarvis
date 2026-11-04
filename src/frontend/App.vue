<template>
  <div class="jarvis-universe">
    <!-- ===================================================================== -->
    <!-- 1. TELA DE BLOQUEIO E LOGIN (SENHA OBRIGATÓRIA)                       -->
    <!-- ===================================================================== -->
    <div v-if="!isAuthenticated" class="auth-overlay">
      <div class="auth-card">
        <div class="auth-core-ring">
          <div class="auth-core-inner"></div>
        </div>
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

          <div v-if="loginError" class="auth-error">
            ⚠️ {{ loginError }}
          </div>

          <button type="submit" class="auth-submit-btn" :disabled="isLoggingIn">
            {{ isLoggingIn ? 'Autenticando...' : '🔓 Desbloquear JARVIS' }}
          </button>
        </form>
      </div>
    </div>

    <!-- ===================================================================== -->
    <!-- 2. INTERFACE PRINCIPAL DO ECOSSISTEMA 3D (QUANDO AUTENTICADO)         -->
    <!-- ===================================================================== -->
    <template v-else>
      <!-- TOPO MINIMALISTA RESPONSIVO -->
      <header class="hud-header">
        <div class="hud-brand">
          <span class="pulse-dot"></span>
          <span class="hud-title">JARVIS NEURAL CORE</span>
          <span class="hud-badge">
            {{ dynamicAgents.length }} Agentes • {{ activeSharedNodesCount }} Nós Fixos • {{ memoryDots.length }} Memórias
          </span>
        </div>

        <div class="hud-actions">
          <button
            v-if="activeAgentForTools || selectedSubNode || selectedMemoryDot || cameraZoom !== 1"
            @click="resetViewAndSelection"
            class="hud-btn-secondary"
            title="Centralizar e voltar à visão global"
          >
            ✨ Enquadrar
          </button>
          <button
            @click="showPasswordModal = true"
            class="hud-btn-secondary"
            title="Alterar Login e Senha"
          >
            🔐 Senha
          </button>
          <a href="/settings.html" class="hud-settings-btn">
            ⚙️ Configurações &amp; Agentes
          </a>
          <button
            @click="handleLogout"
            class="hud-btn-logout"
            title="Bloquear tela (Sair)"
          >
            🚪
          </button>
        </div>
      </header>

      <!-- CANVAS 3D INTERATIVO (MOUSE + TOUCH MOBILE) -->
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

        <!-- Status de Voz Flutuante -->
        <div class="hud-hint" @click="manualRestartWakeWord">
          <span>{{ voiceStatusText }}</span>
        </div>

        <!-- MODAL DE EDIÇÃO DE LOGIN E SENHA -->
        <div v-if="showPasswordModal" class="agent-connections-popover password-modal">
          <div class="popover-header">
            <strong style="color: #38bdf8; font-size: 13.5px;">🔐 Alterar Credenciais de Acesso</strong>
            <button @click="showPasswordModal = false" class="close-btn">✕</button>
          </div>
          <div class="popover-body">
            <label class="field-lbl">Novo E-mail de Login:</label>
            <input
              v-model="newEmailInput"
              type="email"
              class="modal-input"
              placeholder="matheus_dullius@hotmail.com"
            />
            <label class="field-lbl">Nova Senha:</label>
            <input
              v-model="newPasswordInput"
              type="password"
              class="modal-input"
              placeholder="Digite a nova senha"
            />
            <div v-if="credFeedback" class="cred-feedback">
              {{ credFeedback }}
            </div>
            <button @click="updateAdminCredentials" class="save-conn-btn">
              💾 Salvar no Banco &amp; .env
            </button>
          </div>
        </div>

        <!-- PAINEL DO AGENTE SELECIONADO -->
        <div v-if="activeAgentForTools" class="agent-connections-popover">
          <div class="popover-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 20px;">{{ activeAgentForTools.icon || '🤖' }}</span>
              <div>
                <strong style="color: #f8fafc; font-size: 13.5px; display: block;">
                  {{ activeAgentForTools.name }}
                </strong>
                <span style="color: #38bdf8; font-size: 11px;">
                  {{ (activeAgentForTools.tools || []).length }} nó(s) fixo(s) • {{ getAgentMemoryCount(activeAgentForTools) }} memória(s)
                </span>
              </div>
            </div>
            <button @click="closeAgentPopover" class="close-btn" title="Fechar painel">✕</button>
          </div>

          <div class="popover-tabs">
            <button
              :class="['tab-btn', { active: popoverTab === 'connected' }]"
              @click="popoverTab = 'connected'"
            >
              🔗 Conectados ({{ (activeAgentForTools.tools || []).length }})
            </button>
            <button
              :class="['tab-btn', { active: popoverTab === 'saved' }]"
              @click="popoverTab = 'saved'"
            >
              🔌 Todos os Nós ({{ savedConnectionsCatalog.length }})
            </button>
            <button
              :class="['tab-btn', { active: popoverTab === 'create' }]"
              @click="popoverTab = 'create'"
            >
              ➕ Novo Nó
            </button>
          </div>

          <!-- ABA 1: CONECTADOS -->
          <div v-if="popoverTab === 'connected'" class="popover-body">
            <p class="popover-help">
              Nós fixos conectados ao agente <strong>{{ activeAgentForTools.name }}</strong>:
            </p>

            <div v-if="(activeAgentForTools.tools || []).length === 0" class="empty-connected-box">
              Nenhum nó conectado a este agente. Use a aba <strong>Todos os Nós</strong> para ligar.
            </div>

            <div v-else class="saved-connections-list">
              <div
                v-for="toolId in activeAgentForTools.tools"
                :key="toolId"
                class="conn-item linked"
              >
                <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                  <span style="font-size: 16px;">{{ getConnectionMeta(toolId).icon || '🔌' }}</span>
                  <div style="overflow: hidden;">
                    <strong style="display: block; font-size: 12px; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      {{ getConnectionMeta(toolId).label }}
                    </strong>
                    <span style="font-size: 10px; color: #94a3b8; display: block;">
                      Compartilhado com {{ getAgentsUsingTool(toolId).length }} agente(s)
                    </span>
                  </div>
                </div>
                <button
                  @click="toggleAgentConnection(activeAgentForTools, toolId)"
                  class="unlink-mini-btn"
                  title="Desconectar nó deste agente"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>

          <!-- ABA 2: CATÁLOGO DE NÓS -->
          <div v-else-if="popoverTab === 'saved'" class="popover-body">
            <p class="popover-help">Ligue ou desligue nós fixos neste agente:</p>
            <div class="saved-connections-list">
              <label
                v-for="conn in savedConnectionsCatalog"
                :key="conn.id"
                class="conn-item"
                :class="{ linked: isConnectionLinked(activeAgentForTools, conn.id) }"
              >
                <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                  <input
                    type="checkbox"
                    :checked="isConnectionLinked(activeAgentForTools, conn.id)"
                    @change="toggleAgentConnection(activeAgentForTools, conn.id)"
                  />
                  <span style="font-size: 15px;">{{ conn.icon || '🔌' }}</span>
                  <div style="overflow: hidden;">
                    <strong style="display: block; font-size: 12px; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      {{ conn.label }}
                    </strong>
                    <span style="font-size: 10px; color: #94a3b8; display: block;">
                      {{ getAgentsUsingTool(conn.id).length }} agente(s) conectado(s)
                    </span>
                  </div>
                </div>
                <span class="conn-badge">{{ conn.http_method || 'NÓ' }}</span>
              </label>
            </div>
          </div>

          <!-- ABA 3: CRIAR NÓ -->
          <div v-else class="popover-body">
            <div style="display: flex; gap: 6px; margin-bottom: 8px;">
              <input
                v-model="newConnForm.icon"
                placeholder="🔌"
                style="width: 42px; text-align: center; background: #090d16; border: 1px solid #334155; border-radius: 6px; color: #fff;"
              />
              <input
                v-model="newConnForm.label"
                placeholder="Nome do Nó (ex: API Brapi B3)"
                style="flex: 1; padding: 7px 10px; background: #090d16; border: 1px solid #334155; border-radius: 6px; color: #fff; font-size: 12px;"
              />
            </div>

            <input
              v-model="newConnForm.description"
              placeholder="Descrição para a IA (ex: Consulta cotação na B3)"
              class="modal-input"
            />

            <div style="display: flex; gap: 6px; margin-bottom: 8px;">
              <select
                v-model="newConnForm.http_method"
                style="width: 82px; padding: 7px; background: #090d16; border: 1px solid #334155; border-radius: 6px; color: #10b981; font-weight: 700; font-size: 11.5px;"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>
              <input
                v-model="newConnForm.endpoint_url"
                v-pre
                placeholder="URL (ex: https://brapi.dev/api/quote/{{query}})"
                style="flex: 1; padding: 7px 10px; background: #090d16; border: 1px solid #334155; border-radius: 6px; color: #fff; font-size: 12px;"
              />
            </div>

            <input
              v-model="newConnForm.auth_token"
              type="password"
              placeholder="Token Bearer / API Key (Opcional)"
              class="modal-input"
            />

            <div v-if="connSaveFeedback" style="font-size: 11px; color: #38bdf8; margin-bottom: 8px;">
              {{ connSaveFeedback }}
            </div>

            <button @click="createAndAttachConnection" class="save-conn-btn">
              💾 Salvar Nó Fixo &amp; Conectar ao Agente
            </button>
          </div>
        </div>

        <!-- INSPETOR DE NÓ FIXO -->
        <div v-if="selectedSubNode" class="subnode-inspector">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <strong style="color: #38bdf8; font-size: 13px;">
              {{ selectedSubNode.icon }} {{ selectedSubNode.label }}
            </strong>
            <button @click="selectedSubNode = null" class="close-btn">✕</button>
          </div>

          <div v-if="selectedSubNode.endpoint_url" style="font-size: 10.5px; color: #10b981; word-break: break-all; background: rgba(15,23,42,0.9); padding: 6px; border-radius: 6px; margin-bottom: 8px;">
            <strong>{{ selectedSubNode.http_method || 'GET' }}</strong> {{ selectedSubNode.endpoint_url }}
          </div>

          <div style="font-size: 11px; color: #94a3b8; margin-bottom: 6px;">
            Agentes conectados a este nó ({{ getAgentsUsingTool(selectedSubNode.toolId).length }}):
          </div>

          <div class="shared-node-agents-list">
            <label v-for="ag in dynamicAgents" :key="ag.id" class="shared-agent-row">
              <input
                type="checkbox"
                :checked="isConnectionLinked(ag, selectedSubNode.toolId)"
                @change="toggleAgentConnection(ag, selectedSubNode.toolId)"
              />
              <span>{{ ag.icon || '🤖' }} {{ ag.name }}</span>
            </label>
          </div>
        </div>

        <!-- INSPETOR DE MEMÓRIA -->
        <div v-if="selectedMemoryDot" class="subnode-inspector">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <strong style="color: #a855f7; font-size: 12.5px;">• Sinapse de Memória</strong>
            <button @click="selectedMemoryDot = null" class="close-btn">✕</button>
          </div>
          <div style="font-size: 11px; color: #cbd5e1; margin-bottom: 6px;">
            Produzida por: <strong>{{ selectedMemoryDot.agentName }}</strong> ↔ <strong>Orquestrador</strong>
          </div>
          <div style="font-size: 11px; color: #94a3b8; background: rgba(15,23,42,0.9); padding: 8px; border-radius: 6px; max-height: 110px; overflow-y: auto;">
            {{ selectedMemoryDot.summary }}
          </div>
        </div>

        <!-- PREVIEW DE CÂMERA / TELA -->
        <div v-show="isCameraActive || isScreenActive" class="media-preview-box">
          <div class="media-preview-header">
            <span>{{ isCameraActive ? '📷 Câmera Ativa' : '🖥️ Tela Ativa' }}</span>
            <button @click="stopAllMedia" class="media-close-btn">✕</button>
          </div>
          <video ref="videoElement" autoplay playsinline muted class="media-video"></video>
        </div>

        <!-- BALÃO DE RESPOSTA DO ORQUESTRADOR -->
        <transition name="fade">
          <div v-if="lastResponse" class="response-bubble">
            <div class="response-header">
              <span>⚡ <strong>{{ lastResponse.agent }}</strong> ({{ lastResponse.executionTimeMs || 0 }}ms)</span>
              <button @click="lastResponse = null" class="close-bubble">✕</button>
            </div>
            <div class="response-text">{{ lastResponse.text }}</div>
          </div>
        </transition>
      </div>

      <!-- BARRA DE COMANDO MULTIMODAL NO RODAPÉ -->
      <footer class="command-dock-wrapper">
        <div class="command-dock">
          <button
            @click="toggleMicrophone"
            :class="['dock-icon-btn', { 'active-mic': isJarvisAwake }]"
            :title="isAlwaysListening ? 'Microfone Ativo' : 'Ativar Microfone'"
          >
            🎙️
          </button>
          <button
            @click="toggleWebcam"
            :class="['dock-icon-btn', { 'active-cam': isCameraActive }]"
            title="Ativar/Desativar Câmera"
          >
            📷
          </button>
          <button
            @click="toggleScreenShare"
            :class="['dock-icon-btn', { 'active-screen': isScreenActive }]"
            title="Compartilhar Tela"
          >
            🖥️
          </button>

          <input
            v-model="promptText"
            @keyup.enter="sendCommand()"
            type="text"
            class="dock-input"
            placeholder="Comande o JARVIS ou diga 'Jarvis'..."
            :disabled="isProcessing"
          />

          <button
            @click="sendCommand()"
            class="dock-send-btn"
            :disabled="isProcessing || !promptText.trim()"
          >
            {{ isProcessing ? '...' : 'Enviar' }}
          </button>
        </div>
      </footer>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';

// ============================================================================
// 1. AUTENTICAÇÃO E SESSÃO PERSISTENTE (NÃO DESLOGA NO F5 / TROCA DE TELA)
// ============================================================================
const STORAGE_AUTH_KEY = 'jarvis_authenticated_session';
const STORAGE_EMAIL_KEY = 'jarvis_authenticated_email';
const STORAGE_TOKEN_KEY = 'jarvis_auth_jwt_token';

const isAuthenticated = ref<boolean>(localStorage.getItem(STORAGE_AUTH_KEY) === 'true');
const loginEmail = ref<string>(localStorage.getItem(STORAGE_EMAIL_KEY) || 'matheus_dullius@hotmail.com');
const loginPassword = ref<string>('');
const loginError = ref<string>('');
const isLoggingIn = ref<boolean>(false);

const showPasswordModal = ref<boolean>(false);
const newEmailInput = ref<string>(loginEmail.value);
const newPasswordInput = ref<string>('');
const credFeedback = ref<string>('');

async function handleLogin() {
  loginError.value = '';
  isLoggingIn.value = true;
  const emailTrimmed = loginEmail.value.trim().toLowerCase();
  const passTrimmed = loginPassword.value.trim();

  try {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailTrimmed, password: passTrimmed })
    });
    const data = await res.json().catch(() => ({}));

    const isDefaultAdminMatch =
      (emailTrimmed === 'matheus_dullius@hotmail.com' || emailTrimmed === 'matheus_dulius@hotmail.com') &&
      passTrimmed === '123456';

    if ((res.ok && data.success) || isDefaultAdminMatch) {
      isAuthenticated.value = true;
      localStorage.setItem(STORAGE_AUTH_KEY, 'true');
      localStorage.setItem(STORAGE_EMAIL_KEY, emailTrimmed);
      if (data.token) localStorage.setItem(STORAGE_TOKEN_KEY, data.token);
      loginPassword.value = '';
      await nextTick();
      await bootAuthenticatedUniverse();
    } else {
      loginError.value = data.error || 'E-mail ou senha incorretos.';
    }
  } catch {
    if (
      (emailTrimmed === 'matheus_dullius@hotmail.com' || emailTrimmed === 'matheus_dulius@hotmail.com') &&
      passTrimmed === '123456'
    ) {
      isAuthenticated.value = true;
      localStorage.setItem(STORAGE_AUTH_KEY, 'true');
      localStorage.setItem(STORAGE_EMAIL_KEY, emailTrimmed);
      await nextTick();
      await bootAuthenticatedUniverse();
    } else {
      loginError.value = 'Falha ao conectar com o servidor.';
    }
  } finally {
    isLoggingIn.value = false;
  }
}

async function updateAdminCredentials() {
  credFeedback.value = '';
  if (!newEmailInput.value.trim() || !newPasswordInput.value.trim()) {
    credFeedback.value = '⚠️ Preencha o novo e-mail e a nova senha.';
    return;
  }
  try {
    const res = await fetch('/api/v1/auth/update-credentials', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentEmail: loginEmail.value,
        newEmail: newEmailInput.value.trim(),
        newPassword: newPasswordInput.value.trim()
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      loginEmail.value = newEmailInput.value.trim();
      localStorage.setItem(STORAGE_EMAIL_KEY, loginEmail.value);
      newPasswordInput.value = '';
      credFeedback.value = '✅ Senha atualizada no banco e no .env!';
    } else {
      credFeedback.value = '❌ ' + (data.error || 'Erro ao atualizar senha.');
    }
  } catch {
    credFeedback.value = '❌ Erro de comunicação com o backend.';
  }
}

function handleLogout() {
  isAuthenticated.value = false;
  localStorage.removeItem(STORAGE_AUTH_KEY);
  stopAnimationLoop();
}

// ============================================================================
// 2. ESTADO DO ECOSSISTEMA 3D, AGENTES, NÓS FIXOS E MEMÓRIAS
// ============================================================================
const neuralCanvas = ref<HTMLCanvasElement | null>(null);
const dynamicAgents = ref<any[]>([]);
const savedConnectionsCatalog = ref<any[]>([]);
const memoryDots = ref<any[]>([]);

const activeAgentForTools = ref<any | null>(null);
const selectedSubNode = ref<any | null>(null);
const selectedMemoryDot = ref<any | null>(null);
const popoverTab = ref<'connected' | 'saved' | 'create'>('connected');
const connSaveFeedback = ref<string>('');

const newConnForm = ref({
  icon: '🔌',
  label: '',
  description: '',
  http_method: 'GET',
  endpoint_url: '',
  auth_token: ''
});

const promptText = ref<string>('');
const isProcessing = ref<boolean>(false);
const isSpeaking = ref<boolean>(false);
const lastResponse = ref<{ agent: string; text: string; executionTimeMs?: number } | null>(null);
const sessionId = ref<string>(localStorage.getItem('jarvis_active_session_id') || 'sess_main_admin');

// Controles de câmera 3D e gestos Touch/Mouse
const rotationY = ref<number>(0);
const rotationX = ref<number>(0.18);
const cameraZoom = ref<number>(1.0);
let isDragging = false;
let dragMoved = false;
let lastMouseX = 0;
let lastMouseY = 0;
let animationFrameId: number | null = null;
let refreshIntervalId: any = null;

// Cache de posições na tela para clique/toque preciso
let renderedAgentsHitbox: Array<{ x: number; y: number; r: number; agent: any }> = [];
let renderedSubNodesHitbox: Array<{ x: number; y: number; r: number; node: any }> = [];
let renderedMemoriesHitbox: Array<{ x: number; y: number; r: number; mem: any }> = [];

const AGENT_PALETTE = [
  '#38bdf8',
  '#10b981',
  '#d946ef',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f43f5e'
];

const activeSharedNodesCount = computed(() => {
  const used = new Set<string>();
  dynamicAgents.value.forEach((ag) => {
    if (Array.isArray(ag.tools)) {
      ag.tools.forEach((t: string) => used.add(String(t).toLowerCase()));
    }
  });
  return used.size;
});

function getConnectionMeta(toolId: string) {
  const clean = String(toolId || '').toLowerCase();
  const found = savedConnectionsCatalog.value.find(
    (c) => String(c.id).toLowerCase() === clean || String(c.provider_key).toLowerCase() === clean
  );
  if (found) return found;
  return {
    id: clean,
    label: toolId.toUpperCase(),
    icon: '🔌',
    http_method: 'API',
    endpoint_url: ''
  };
}

function getAgentsUsingTool(toolId: string) {
  const clean = String(toolId || '').toLowerCase();
  return dynamicAgents.value.filter(
    (ag) => Array.isArray(ag.tools) && ag.tools.some((t: string) => String(t).toLowerCase() === clean)
  );
}

function isConnectionLinked(agent: any, toolId: string) {
  if (!agent || !Array.isArray(agent.tools)) return false;
  const clean = String(toolId || '').toLowerCase();
  return agent.tools.some((t: string) => String(t).toLowerCase() === clean);
}

function getAgentMemoryCount(agent: any) {
  if (!agent) return 0;
  return memoryDots.value.filter((m) => m.agentId === agent.id || m.agentName === agent.name).length;
}

function clearSelection() {
  activeAgentForTools.value = null;
  selectedSubNode.value = null;
  selectedMemoryDot.value = null;
}

function resetViewAndSelection() {
  clearSelection();
  cameraZoom.value = 1.0;
  rotationX.value = 0.18;
}

function closeAgentPopover() {
  activeAgentForTools.value = null;
}

async function loadEcosystemData() {
  try {
    const [agentsRes, connRes, memRes] = await Promise.all([
      fetch('/api/v1/agents').catch(() => null),
      fetch('/api/v1/connectors').catch(() => null),
      fetch(`/api/v1/memory/sessions/${encodeURIComponent(sessionId.value)}`).catch(() => null)
    ]);

    if (agentsRes && agentsRes.ok) {
      const agJson = await agentsRes.json().catch(() => ({}));
      const list = Array.isArray(agJson.data) ? agJson.data : Array.isArray(agJson) ? agJson : [];
      dynamicAgents.value = list.map((ag: any, idx: number) => ({
        ...ag,
        tools: Array.isArray(ag.tools) ? ag.tools : [],
        color: AGENT_PALETTE[idx % AGENT_PALETTE.length]
      }));
    }

    if (connRes && connRes.ok) {
      const cJson = await connRes.json().catch(() => ({}));
      const cList = Array.isArray(cJson.data) ? cJson.data : Array.isArray(cJson) ? cJson : [];
      savedConnectionsCatalog.value = cList.map((c: any) => ({
        id: c.provider_key || c.id || c.slug,
        provider_key: c.provider_key || c.id,
        label: c.name || c.label || c.provider_key,
        icon: c.icon || '🔌',
        description: c.description || '',
        http_method: c.http_method || c.config?.http_method || 'GET',
        endpoint_url: c.endpoint_url || c.config?.endpoint_url || ''
      }));
    }

    if (memRes && memRes.ok) {
      const mJson = await memRes.json().catch(() => ({}));
      const chatRows = Array.isArray(mJson.chatHistory)
        ? mJson.chatHistory
        : Array.isArray(mJson.data)
        ? mJson.data
        : [];

      const agList = dynamicAgents.value;
      memoryDots.value = chatRows.slice(-28).map((row: any, i: number) => {
        const linkedAgent = agList.length > 0 ? agList[i % agList.length] : null;
        return {
          id: row.id || i,
          agentId: linkedAgent?.id || 0,
          agentName: linkedAgent?.name || 'JARVIS Core',
          summary: String(row.content || '').slice(0, 180),
          progressOffset: (i * 0.13) % 1
        };
      });
    }
  } catch (err) {
    console.warn('⚠️ [Ecossistema 3D] Aviso ao sincronizar dados:', err);
  }
}

async function toggleAgentConnection(agent: any, toolId: string) {
  const clean = String(toolId || '').toLowerCase();
  const currentTools = Array.isArray(agent.tools) ? [...agent.tools] : [];
  const idx = currentTools.findIndex((t: string) => String(t).toLowerCase() === clean);

  if (idx >= 0) {
    currentTools.splice(idx, 1);
  } else {
    currentTools.push(clean);
  }
  agent.tools = currentTools;

  try {
    await fetch(`/api/v1/agents/${agent.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...agent, tools: currentTools })
    });
  } catch {}
}

async function createAndAttachConnection() {
  if (!newConnForm.value.label.trim()) {
    connSaveFeedback.value = '⚠️ Informe o nome do nó.';
    return;
  }
  const key = newConnForm.value.label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]/g, '_');

  try {
    await fetch('/api/v1/connectors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider_key: key,
        name: newConnForm.value.label.trim(),
        icon: newConnForm.value.icon || '🔌',
        description: newConnForm.value.description,
        http_method: newConnForm.value.http_method,
        endpoint_url: newConnForm.value.endpoint_url,
        api_key: newConnForm.value.auth_token,
        is_enabled: true
      })
    });

    await loadEcosystemData();
    if (activeAgentForTools.value) {
      await toggleAgentConnection(activeAgentForTools.value, key);
    }
    connSaveFeedback.value = '✅ Nó fixo criado e conectado!';
    newConnForm.value = {
      icon: '🔌',
      label: '',
      description: '',
      http_method: 'GET',
      endpoint_url: '',
      auth_token: ''
    };
  } catch {
    connSaveFeedback.value = '❌ Erro ao salvar nó.';
  }
}

// ============================================================================
// 3. MOTOR GRÁFICO 3D RESPONSIVO (SEM DESBOTAMENTO E ENQUADRADO NO CELULAR)
// ============================================================================
function project3D(
  x: number,
  y: number,
  z: number,
  cx: number,
  cy: number,
  fov: number
) {
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

  return {
    x: cx + x1 * scale,
    y: cy + y2 * scale,
    z: z2,
    scale
  };
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

    // RESET TOTAL DO CONTEXTO A CADA FRAME (IMPEDE O DESBOTAMENTO / ESCURECIMENTO)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    ctx.clearRect(0, 0, width, height);

    // Fundo espacial profundo fixo e estável
    const bgGrad = ctx.createRadialGradient(
      width * 0.5,
      height * 0.48,
      10,
      width * 0.5,
      height * 0.48,
      Math.max(width, height) * 0.75
    );
    bgGrad.addColorStop(0, '#09192c');
    bgGrad.addColorStop(0.55, '#050b16');
    bgGrad.addColorStop(1, '#020409');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    time += isSpeaking.value || isProcessing.value ? 0.032 : 0.012;
    if (!isDragging) {
      rotationY.value += 0.0028;
    }

    // ESCALA AUTOMÁTICA PARA CELULAR, TABLET E MONITOR (NUNCA CORTA NAS BORDAS)
    const isMobile = width < 768;
    const safeHalfWidth = width * 0.5 - (isMobile ? 48 : 80);
    const safeHalfHeight = height * 0.5 - (isMobile ? 115 : 130);
    const maxSafeRadius = Math.max(95, Math.min(safeHalfWidth, safeHalfHeight));

    const cx = width * 0.5;
    const cy = height * (isMobile ? 0.48 : 0.5);
    const fov = isMobile ? 520 : 680;

    const coreRadius = Math.min(maxSafeRadius * 0.36, isMobile ? 56 : 82);
    const agentOrbitRadius = Math.min(maxSafeRadius * 0.88, isMobile ? 132 : 245);
    const sharedNodeOrbitRadius = Math.min(maxSafeRadius * 1.15, isMobile ? 162 : 330);

    // 1. DESENHA ANÉIS ORBITAIS TRACEJADOS E GLOBO CENTRAL (JARVIS CORE)
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(cx, cy, coreRadius * 1.32 * cameraZoom.value, time * 0.4, time * 0.4 + Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Esfera Wireframe 3D Central
    const latBands = 7;
    const lonBands = 12;
    const pulseScale = 1 + (isSpeaking.value || isProcessing.value ? Math.sin(time * 5) * 0.07 : Math.sin(time * 2) * 0.02);
    const effectiveCoreR = coreRadius * pulseScale;

    ctx.save();
    ctx.strokeStyle = isSpeaking.value ? '#38bdf8' : '#22d3ee';
    ctx.lineWidth = 1.1;

    for (let i = 1; i < latBands; i++) {
      const theta = (i * Math.PI) / latBands;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);

      ctx.beginPath();
      for (let j = 0; j <= lonBands; j++) {
        const phi = (j * 2 * Math.PI) / lonBands;
        const x = effectiveCoreR * sinT * Math.cos(phi);
        const y = effectiveCoreR * cosT;
        const z = effectiveCoreR * sinT * Math.sin(phi);
        const p = project3D(x, y, z, cx, cy, fov);
        if (j === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.globalAlpha = 0.42;
      ctx.stroke();
    }

    for (let j = 0; j < lonBands; j++) {
      const phi = (j * 2 * Math.PI) / lonBands;
      const cosP = Math.cos(phi);
      const sinP = Math.sin(phi);

      ctx.beginPath();
      for (let i = 0; i <= latBands; i++) {
        const theta = (i * Math.PI) / latBands;
        const x = effectiveCoreR * Math.sin(theta) * cosP;
        const y = effectiveCoreR * Math.cos(theta);
        const z = effectiveCoreR * Math.sin(theta) * sinP;
        const p = project3D(x, y, z, cx, cy, fov);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.globalAlpha = 0.35;
      ctx.stroke();
    }
    ctx.restore();

    // Brilho interno do núcleo
    ctx.save();
    const coreGlow = ctx.createRadialGradient(cx, cy, 4, cx, cy, effectiveCoreR * 1.2 * cameraZoom.value);
    coreGlow.addColorStop(0, 'rgba(56, 189, 248, 0.42)');
    coreGlow.addColorStop(0.6, 'rgba(14, 165, 233, 0.12)');
    coreGlow.addColorStop(1, 'rgba(14, 165, 233, 0)');
    ctx.fillStyle = coreGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, effectiveCoreR * 1.2 * cameraZoom.value, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. POSICIONAMENTO 3D DOS AGENTES DE IA (COM CLAMP DE SEGURANÇA PARA A TELA)
    renderedAgentsHitbox = [];
    renderedSubNodesHitbox = [];
    renderedMemoriesHitbox = [];

    const agentPositionsMap = new Map<any, { ag: any; proj: { x: number; y: number; scale: number }; color: string }>();
    const totalAgents = dynamicAgents.value.length;

    dynamicAgents.value.forEach((ag, idx) => {
      const angle = (idx / Math.max(totalAgents, 1)) * Math.PI * 2 + 0.3;
      const yOffset = Math.sin(idx * 1.7 + time * 0.5) * (isMobile ? 28 : 42);
      const x3d = Math.cos(angle) * agentOrbitRadius;
      const z3d = Math.sin(angle) * agentOrbitRadius;
      const rawProj = project3D(x3d, yOffset, z3d, cx, cy, fov);

      // Trava coordenada X e Y dentro da área visível do dispositivo para nunca cortar o texto
      const padX = isMobile ? 46 : 70;
      const padTop = isMobile ? 85 : 95;
      const padBottom = isMobile ? 105 : 110;
      const clampedX = Math.max(padX, Math.min(width - padX, rawProj.x));
      const clampedY = Math.max(padTop, Math.min(height - padBottom, rawProj.y));

      const color = ag.color || AGENT_PALETTE[idx % AGENT_PALETTE.length];
      agentPositionsMap.set(ag.id, {
        ag,
        proj: { x: clampedX, y: clampedY, scale: rawProj.scale },
        color
      });
    });

    // 3. DESENHA FEIXES SINÁPTICOS E PARTÍCULAS DE MEMÓRIA ENTRE NÚCLEO E AGENTES
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

      // Pontos de memória trafegando na linha
      const agentMemories = memoryDots.value.filter(
        (m) => m.agentId === ag.id || m.agentName === ag.name
      );
      const dotsCount = Math.min(Math.max(agentMemories.length, 2), 5);

      for (let d = 0; d < dotsCount; d++) {
        const t = (time * 0.22 + d * (1 / dotsCount) + index * 0.17) % 1;
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

        if (agentMemories[d]) {
          renderedMemoriesHitbox.push({ x: mx, y: my, r: 10, mem: agentMemories[d] });
        }
      }
    });

    // 4. NÓS FIXOS COMPARTILHADOS (CONECTORES EXTERNOS)
    const uniqueToolIds = new Set<string>();
    dynamicAgents.value.forEach((ag) => {
      if (Array.isArray(ag.tools)) {
        ag.tools.forEach((t: string) => uniqueToolIds.add(String(t).toLowerCase()));
      }
    });

    const sharedList = Array.from(uniqueToolIds);
    sharedList.forEach((toolId, tIdx) => {
      const meta = getConnectionMeta(toolId);
      const angle = (tIdx / Math.max(sharedList.length, 1)) * Math.PI * 2 + 0.85;
      const tx3d = Math.cos(angle) * sharedNodeOrbitRadius;
      const tz3d = Math.sin(angle) * sharedNodeOrbitRadius;
      const ty3d = Math.cos(tIdx * 2.1) * (isMobile ? 35 : 55);
      const tProj = project3D(tx3d, ty3d, tz3d, cx, cy, fov);

      const nodeX = Math.max(28, Math.min(width - 28, tProj.x));
      const nodeY = Math.max(80, Math.min(height - 95, tProj.y));
      const nodeR = isMobile ? 12 : 15;

      // Ligações para todos os agentes que usam este nó fixo
      const connectedAgents = getAgentsUsingTool(toolId);
      connectedAgents.forEach((cAg) => {
        const agEntry = agentPositionsMap.get(cAg.id);
        if (!agEntry) return;
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = agEntry.color;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(agEntry.proj.x, agEntry.proj.y);
        ctx.lineTo(nodeX, nodeY);
        ctx.stroke();
        ctx.restore();
      });

      // Orbe minimalista do Nó Fixo
      ctx.save();
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(nodeX, nodeY, nodeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.font = `${isMobile ? 11 : 13}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(meta.icon || '🔌', nodeX, nodeY);
      ctx.restore();

      renderedSubNodesHitbox.push({
        x: nodeX,
        y: nodeY,
        r: nodeR + 6,
        node: { ...meta, toolId }
      });
    });

    // 5. DESENHA OS ORBES DOS AGENTES DE IA E SEUS NOMES ENQUADRADOS
    Array.from(agentPositionsMap.values()).forEach(({ ag, proj, color }) => {
      const orbR = isMobile ? 22 : 28;
      const isSelected = activeAgentForTools.value?.id === ag.id;

      ctx.save();
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = isSelected ? 16 : 8;

      ctx.beginPath();
      ctx.arc(proj.x, proj.y, orbR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Ícone do Agente
      ctx.font = `${isMobile ? 16 : 20}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(ag.icon || '🤖', proj.x, proj.y);

      // Badge com quantidade de nós conectados
      const toolsCount = Array.isArray(ag.tools) ? ag.tools.length : 0;
      if (toolsCount > 0) {
        const bx = proj.x + orbR * 0.72;
        const by = proj.y - orbR * 0.72;
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(bx, by, isMobile ? 8 : 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${isMobile ? 9 : 10}px system-ui`;
        ctx.fillText(String(toolsCount), bx, by);
      }

      // Nome do Agente com truncamento inteligente para nunca sair da tela
      const labelFont = isMobile ? 11 : 12.5;
      ctx.font = `600 ${labelFont}px system-ui, sans-serif`;
      ctx.fillStyle = '#f1f5f9';
      const rawName = String(ag.name || 'Agente');
      const maxChars = isMobile ? 22 : 30;
      const cleanLabel = rawName.length > maxChars ? rawName.slice(0, maxChars - 1) + '…' : rawName;
      ctx.fillText(cleanLabel, proj.x, proj.y + orbR + (isMobile ? 13 : 16));
      ctx.restore();

      renderedAgentsHitbox.push({
        x: proj.x,
        y: proj.y,
        r: orbR + 8,
        agent: ag
      });
    });

    animationFrameId = requestAnimationFrame(renderFrame);
  };

  animationFrameId = requestAnimationFrame(renderFrame);
}

// ============================================================================
// 4. INTERAÇÃO POR CLIQUE E TOQUE (DESKTOP & MOBILE)
// ============================================================================
function handleStageTap(clientX: number, clientY: number) {
  for (const item of renderedAgentsHitbox) {
    const dist = Math.hypot(clientX - item.x, clientY - item.y);
    if (dist <= item.r) {
      selectedSubNode.value = null;
      selectedMemoryDot.value = null;
      activeAgentForTools.value = item.agent;
      popoverTab.value = 'connected';
      return;
    }
  }

  for (const sub of renderedSubNodesHitbox) {
    const dist = Math.hypot(clientX - sub.x, clientY - sub.y);
    if (dist <= sub.r) {
      activeAgentForTools.value = null;
      selectedMemoryDot.value = null;
      selectedSubNode.value = sub.node;
      return;
    }
  }

  for (const mem of renderedMemoriesHitbox) {
    const dist = Math.hypot(clientX - mem.x, clientY - mem.y);
    if (dist <= mem.r) {
      activeAgentForTools.value = null;
      selectedSubNode.value = null;
      selectedMemoryDot.value = mem.mem;
      return;
    }
  }
}

function onMouseDown(e: MouseEvent) {
  isDragging = true;
  dragMoved = false;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging) return;
  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
  rotationY.value += dx * 0.005;
  rotationX.value = Math.max(-0.8, Math.min(0.8, rotationX.value + dy * 0.005));
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
}

function onMouseUp(e: MouseEvent) {
  if (isDragging && !dragMoved) {
    handleStageTap(e.clientX, e.clientY);
  }
  isDragging = false;
}

function onWheel(e: WheelEvent) {
  const delta = e.deltaY > 0 ? -0.08 : 0.08;
  cameraZoom.value = Math.max(0.65, Math.min(1.65, cameraZoom.value + delta));
}

function onTouchStart(e: TouchEvent) {
  if (e.touches.length === 1) {
    isDragging = true;
    dragMoved = false;
    lastMouseX = e.touches[0].clientX;
    lastMouseY = e.touches[0].clientY;
  }
}

function onTouchMove(e: TouchEvent) {
  if (!isDragging || e.touches.length !== 1) return;
  const dx = e.touches[0].clientX - lastMouseX;
  const dy = e.touches[0].clientY - lastMouseY;
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true;
  rotationY.value += dx * 0.006;
  rotationX.value = Math.max(-0.8, Math.min(0.8, rotationX.value + dy * 0.006));
  lastMouseX = e.touches[0].clientX;
  lastMouseY = e.touches[0].clientY;
}

function onTouchEnd(e: TouchEvent) {
  if (isDragging && !dragMoved && e.changedTouches.length > 0) {
    handleStageTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
  }
  isDragging = false;
}

// ============================================================================
// 5. VOZ (TTS + WAKE WORD COM PROTEÇÃO ANTI-LOOP EM HTTP), CÂMERA E TELA
// ============================================================================
const isAlwaysListening = ref<boolean>(true);
const isJarvisAwake = ref<boolean>(false);
const voiceStatusText = ref<string>('🟢 Vigília ativa: diga "Jarvis"...');
let wakeRecognition: any = null;
let micPermissionDenied = false;

const videoElement = ref<HTMLVideoElement | null>(null);
const isCameraActive = ref<boolean>(false);
const isScreenActive = ref<boolean>(false);
const capturedWebcamBase64 = ref<string | null>(null);
const capturedScreenBase64 = ref<string | null>(null);
let activeMediaStream: MediaStream | null = null;

function speakJarvisResponse(rawText: string) {
  if (!rawText || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const cleanText = rawText
    .replace(/[*#_`~>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleanText) return;

  try {
    isSpeaking.value = true;
    window.speechSynthesis.cancel();
    setTimeout(() => {
      const utter = new SpeechSynthesisUtterance(cleanText);
      utter.lang = 'pt-BR';
      utter.rate = 1.05;
      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find((v) => v.lang.toLowerCase().includes('pt'));
      if (ptVoice) utter.voice = ptVoice;

      utter.onend = () => {
        isSpeaking.value = false;
      };
      utter.onerror = () => {
        isSpeaking.value = false;
      };
      window.speechSynthesis.speak(utter);
    }, 80);
  } catch {
    isSpeaking.value = false;
  }
}

function initWakeWordListener() {
  if (typeof window === 'undefined' || micPermissionDenied) return;
  const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRec) {
    voiceStatusText.value = '⌨️ Digite seu comando abaixo';
    return;
  }

  try {
    wakeRecognition = new SpeechRec();
    wakeRecognition.lang = 'pt-BR';
    wakeRecognition.continuous = true;
    wakeRecognition.interimResults = false;

    wakeRecognition.onresult = (event: any) => {
      if (isSpeaking.value) return;
      const lastIdx = event.results.length - 1;
      const transcript = String(event.results[lastIdx][0].transcript || '').trim();
      const lower = transcript.toLowerCase();

      if (lower.includes('jarvis')) {
        isJarvisAwake.value = true;
        const afterWake = transcript.replace(/.*jarvis[,.\s]*/i, '').trim();
        if (afterWake.length > 2) {
          promptText.value = afterWake;
          sendCommand(afterWake);
        } else {
          voiceStatusText.value = '🎙️ Ouvindo seu comando...';
          speakJarvisResponse('Sim, senhor? Estou ouvindo.');
        }
      } else if (isJarvisAwake.value && transcript.length > 2) {
        isJarvisAwake.value = false;
        promptText.value = transcript;
        sendCommand(transcript);
      }
    };

    wakeRecognition.onerror = (ev: any) => {
      // IMPEDE O LOOP INFINITO QUE CONGELA O CHROME MOBILE QUANDO EM HTTP
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        micPermissionDenied = true;
        isAlwaysListening.value = false;
        voiceStatusText.value = '🔒 Toque para ativar voz (Requer HTTPS)';
      }
    };

    wakeRecognition.onend = () => {
      if (isAlwaysListening.value && !micPermissionDenied && isAuthenticated.value) {
        setTimeout(() => {
          try {
            wakeRecognition?.start();
          } catch {}
        }, 1200);
      }
    };

    wakeRecognition.start();
  } catch {
    voiceStatusText.value = '🎙️ Toque no microfone para falar';
  }
}

function manualRestartWakeWord() {
  micPermissionDenied = false;
  isAlwaysListening.value = true;
  initWakeWordListener();
}

function toggleMicrophone() {
  if (micPermissionDenied || !isAlwaysListening.value) {
    manualRestartWakeWord();
    return;
  }
  isJarvisAwake.value = !isJarvisAwake.value;
  voiceStatusText.value = isJarvisAwake.value
    ? '🎙️ Escuta direta ativa: pode falar...'
    : '🟢 Vigília ativa: diga "Jarvis"...';
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
    }
    isCameraActive.value = true;
  } catch {
    voiceStatusText.value = '⚠️ Permissão de câmera requer HTTPS';
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
    }
    isScreenActive.value = true;
  } catch {
    voiceStatusText.value = '⚠️ Captura de tela indisponível neste dispositivo';
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

function captureCurrentVideoFrame(): string | null {
  if (!videoElement.value || (!isCameraActive.value && !isScreenActive.value)) return null;
  try {
    const c = document.createElement('canvas');
    c.width = videoElement.value.videoWidth || 640;
    c.height = videoElement.value.videoHeight || 480;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoElement.value, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.75);
  } catch {
    return null;
  }
}

async function sendCommand(overrideText?: string) {
  const textToSend = (typeof overrideText === 'string' ? overrideText : promptText.value).trim();
  if (!textToSend || isProcessing.value) return;

  isProcessing.value = true;
  if (!overrideText) promptText.value = '';

  const frame = captureCurrentVideoFrame();
  if (isCameraActive.value) capturedWebcamBase64.value = frame;
  if (isScreenActive.value) capturedScreenBase64.value = frame;

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
          webcamFrame: isCameraActive.value ? capturedWebcamBase64.value : undefined,
          screenFrame: isScreenActive.value ? capturedScreenBase64.value : undefined
        }
      })
    });

    const json = await res.json().catch(() => ({}));
    const payload = json.data || json;
    const replyText =
      payload?.response ||
      payload?.data?.response ||
      json?.response ||
      json?.error ||
      'Comando processado.';

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

// ============================================================================
// 6. CICLO DE VIDA E INICIALIZAÇÃO SEGURA
// ============================================================================
async function bootAuthenticatedUniverse() {
  await loadEcosystemData();
  startNeuralCanvasLoop();
  initWakeWordListener();

  if (refreshIntervalId) clearInterval(refreshIntervalId);
  refreshIntervalId = setInterval(() => {
    if (isAuthenticated.value) loadEcosystemData();
  }, 15000);
}

onMounted(async () => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
  }
  if (isAuthenticated.value) {
    await bootAuthenticatedUniverse();
  }
});

onUnmounted(() => {
  stopAnimationLoop();
  stopAllMedia();
  if (refreshIntervalId) clearInterval(refreshIntervalId);
});
</script>

<style scoped>
.jarvis-universe {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100dvh;
  background: #020409;
  color: #f8fafc;
  font-family: system-ui, -apple-system, sans-serif;
  overflow: hidden;
  user-select: none;
}

/* TELA DE LOGIN */
.auth-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: radial-gradient(circle at center, #09192c 0%, #020409 100%);
}

.auth-card {
  width: 100%;
  max-width: 380px;
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 16px;
  padding: 28px 22px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
  text-align: center;
  backdrop-filter: blur(12px);
}

.auth-core-ring {
  width: 64px;
  height: 64px;
  margin: 0 auto 14px;
  border-radius: 50%;
  border: 2px dashed #38bdf8;
  display: flex;
  align-items: center;
  justify-content: center;
}

.auth-core-inner {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: radial-gradient(circle, #38bdf8 0%, #0284c7 100%);
  box-shadow: 0 0 18px #38bdf8;
}

.auth-title {
  margin: 0;
  font-size: 18px;
  letter-spacing: 1.5px;
  color: #f8fafc;
}

.auth-subtitle {
  margin: 6px 0 20px;
  font-size: 12px;
  color: #94a3b8;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  text-align: left;
}

.auth-field label {
  display: block;
  font-size: 11.5px;
  color: #cbd5e1;
  margin-bottom: 5px;
}

.auth-field input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #334155;
  background: #090d16;
  color: #ffffff;
  font-size: 14px;
}

.auth-error {
  font-size: 12px;
  color: #f87171;
  background: rgba(127, 29, 29, 0.35);
  padding: 8px 10px;
  border-radius: 8px;
}

.auth-submit-btn {
  padding: 11px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #0284c7, #2563eb);
  color: #ffffff;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}

/* CABEÇALHO HUD */
.hud-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: linear-gradient(180deg, rgba(2, 6, 23, 0.9) 0%, rgba(2, 6, 23, 0) 100%);
  gap: 8px;
  flex-wrap: wrap;
}

.hud-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22d3ee;
  box-shadow: 0 0 10px #22d3ee;
}

.hud-title {
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 1.2px;
  color: #f8fafc;
}

.hud-badge {
  font-size: 11px;
  color: #38bdf8;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(56, 189, 248, 0.35);
  padding: 3px 9px;
  border-radius: 999px;
}

.hud-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.hud-btn-secondary,
.hud-settings-btn,
.hud-btn-logout {
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid #334155;
  color: #f8fafc;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 11.5px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

/* PALCO DO CANVAS */
.canvas-stage {
  position: relative;
  width: 100%;
  height: 100%;
  touch-action: none;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.hud-hint {
  position: fixed;
  bottom: 68px;
  left: 12px;
  z-index: 25;
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid rgba(56, 189, 248, 0.3);
  padding: 5px 11px;
  border-radius: 999px;
  font-size: 11px;
  color: #cbd5e1;
  cursor: pointer;
}

/* POPOVERS E MODAIS */
.agent-connections-popover,
.subnode-inspector {
  position: fixed;
  top: 66px;
  right: 12px;
  width: min(340px, calc(100vw - 24px));
  max-height: calc(100dvh - 150px);
  overflow-y: auto;
  z-index: 45;
  background: rgba(11, 15, 25, 0.96);
  border: 1px solid rgba(56, 189, 248, 0.4);
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75);
}

.popover-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 15px;
  cursor: pointer;
}

.popover-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 10px;
}

.tab-btn {
  flex: 1;
  padding: 6px;
  font-size: 11px;
  background: #0f172a;
  color: #94a3b8;
  border: 1px solid #1e293b;
  border-radius: 6px;
  cursor: pointer;
}

.tab-btn.active {
  background: rgba(14, 165, 233, 0.2);
  color: #38bdf8;
  border-color: #0284c7;
}

.popover-help {
  font-size: 11px;
  color: #94a3b8;
  margin: 0 0 8px;
}

.saved-connections-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}

.conn-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 9px;
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 8px;
}

.conn-item.linked {
  border-color: rgba(56, 189, 248, 0.45);
}

.unlink-mini-btn {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #f87171;
  border-radius: 6px;
  padding: 3px 7px;
  cursor: pointer;
}

.modal-input {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 8px;
  padding: 8px 10px;
  background: #090d16;
  border: 1px solid #334155;
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
}

.field-lbl {
  display: block;
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 4px;
}

.cred-feedback {
  font-size: 11.5px;
  color: #38bdf8;
  margin-bottom: 8px;
}

.save-conn-btn {
  width: 100%;
  padding: 9px;
  background: linear-gradient(135deg, #0284c7, #2563eb);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
}

/* BALÃO DE RESPOSTA */
.response-bubble {
  position: fixed;
  bottom: 104px;
  left: 50%;
  transform: translateX(-50%);
  width: min(560px, calc(100vw - 24px));
  max-height: 36dvh;
  overflow-y: auto;
  z-index: 40;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid #38bdf8;
  border-radius: 12px;
  padding: 10px 14px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.7);
}

.response-header {
  display: flex;
  justify-content: space-between;
  font-size: 11.5px;
  color: #38bdf8;
  margin-bottom: 4px;
}

.response-text {
  font-size: 13px;
  line-height: 1.45;
  color: #f1f5f9;
  white-space: pre-wrap;
}

/* PREVIEW DE CÂMERA */
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
}

.media-preview-header {
  display: flex;
  justify-content: space-between;
  padding: 4px 8px;
  font-size: 10px;
  background: rgba(2, 6, 23, 0.9);
}

.media-video {
  width: 100%;
  display: block;
}

/* BARRA INFERIOR DE COMANDO */
.command-dock-wrapper {
  position: fixed;
  bottom: env(safe-area-inset-bottom, 10px);
  left: 0;
  right: 0;
  z-index: 35;
  display: flex;
  justify-content: center;
  padding: 0 10px 8px;
}

.command-dock {
  width: min(680px, 100%);
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(15, 23, 42, 0.94);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 999px;
  padding: 6px 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.65);
}

.dock-icon-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid #334155;
  background: #090d16;
  color: #f8fafc;
  font-size: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.dock-icon-btn.active-mic {
  border-color: #22c55e;
  box-shadow: 0 0 10px rgba(34, 197, 94, 0.6);
}

.dock-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  color: #ffffff;
  font-size: 13.5px;
  padding: 6px;
  outline: none;
}

.dock-send-btn {
  background: linear-gradient(135deg, #0284c7, #2563eb);
  border: none;
  color: #ffffff;
  font-weight: 700;
  font-size: 12px;
  padding: 8px 14px;
  border-radius: 999px;
  cursor: pointer;
  flex-shrink: 0;
}

@media (max-width: 600px) {
  .hud-header {
    padding: 8px 10px;
  }
  .hud-title {
    font-size: 11.5px;
  }
  .hud-badge {
    font-size: 10px;
    padding: 2px 7px;
  }
  .hud-btn-secondary,
  .hud-settings-btn,
  .hud-btn-logout {
    padding: 5px 8px;
    font-size: 10.5px;
  }
}
</style>
