<template>
  <div class="jarvis-universe">
    <!-- TOPO MINIMALISTA -->
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
          v-if="activeAgentForTools || selectedSubNode || selectedMemoryDot"
          @click="clearSelection"
          class="hud-btn-secondary"
          title="Voltar à visão global"
        >
          ✨ Visão Global
        </button>
        <a href="/settings.html" class="hud-settings-btn">
          ⚙️ Configurações &amp; Agentes
        </a>
      </div>
    </header>

    <!-- CANVAS 3D INTERATIVO -->
    <div
      class="canvas-stage"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
      @wheel.prevent="onWheel"
    >
      <canvas ref="neuralCanvas"></canvas>

      <!-- Legenda minimalista -->
      <div class="hud-hint">
        <span>{{ voiceStatusText }}</span>
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
                  <span style="font-size: 10px; color: #94a3b8; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
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
          <p class="popover-help">
            Ligue ou desligue nós fixos neste agente:
          </p>

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
                  <span style="font-size: 10px; color: #94a3b8; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
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
            placeholder="Descrição para a IA (ex: Consulta cotação de ações na B3)"
            style="width: 100%; box-sizing: border-box; margin-bottom: 8px; padding: 7px 10px; background: #090d16; border: 1px solid #334155; border-radius: 6px; color: #fff; font-size: 12px;"
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
            style="width: 100%; box-sizing: border-box; margin-bottom: 10px; padding: 7px 10px; background: #090d16; border: 1px solid #334155; border-radius: 6px; color: #fff; font-size: 12px;"
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
          <label
            v-for="ag in dynamicAgents"
            :key="ag.id"
            class="shared-agent-row"
          >
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
          <strong style="color: #a855f7; font-size: 12.5px;">
            • Sinapse de Memória
          </strong>
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
          :title="isAlwaysListening ? 'Microfone Ativo (Vigília JARVIS)' : 'Ativar Microfone'"
        >
          🎙️
        </button>
        <button
          @click="toggleWebcam"
          :class="['dock-icon-btn', { 'active-cam': isCameraActive }]"
          title="Câmera (Visão)"
        >
          📷
        </button>
        <button
          @click="toggleScreenCapture"
          :class="['dock-icon-btn', { 'active-screen': isScreenActive }]"
          title="Capturar Tela"
        >
          🖥️
        </button>

        <input
          v-model="promptText"
          @keyup.enter="sendCommand()"
          type="text"
          class="dock-input"
          :placeholder="isProcessing ? 'Processando sinapses na LLM...' : 'Diga \'Jarvis\' ou envie uma mensagem...'"
          :disabled="isProcessing"
        />

        <button
          @click="sendCommand()"
          class="dock-send-btn"
          :disabled="isProcessing || !promptText.trim()"
        >
          {{ isProcessing ? '⏳...' : 'Transmitir' }}
        </button>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';

// Catálogo base de conexões salvas no PostgreSQL (/api/v1/connectors)
const DEFAULT_CONNECTIONS = [
  { id: 'brapi_b3', icon: '📈', label: 'Brapi B3 (Ações)', color: '#10b981', http_method: 'GET', endpoint_url: 'https://brapi.dev/api/quote/{{query}}', description: 'Cotação de ações na B3' },
  { id: 'save_to_database', icon: '🗄️', label: 'PostgreSQL Dinâmico', color: '#a855f7', http_method: 'SQL', endpoint_url: 'internal://postgres/dynamic_collections', description: 'Salva dados no banco' },
  { id: 'vector_rag', icon: '📚', label: 'Memória Vetorial RAG', color: '#8b5cf6', http_method: 'RAG', endpoint_url: 'internal://pgvector/search', description: 'Busca semântica em documentos' },
  { id: 'rag_search', icon: '📚', label: 'Busca RAG Vetorial', color: '#8b5cf6', http_method: 'RAG', endpoint_url: 'internal://pgvector/search', description: 'Busca semântica em documentos' },
  { id: 'google_sheets', icon: '📊', label: 'Google Sheets', color: '#22c55e', http_method: 'POST', endpoint_url: 'https://sheets.googleapis.com/v4/spreadsheets', description: 'Planilhas Google' },
  { id: 'gmail', icon: '📧', label: 'Google Gmail', color: '#ef4444', http_method: 'POST', endpoint_url: 'https://gmail.googleapis.com', description: 'Envio e leitura de e-mails' },
  { id: 'gmail_send', icon: '📧', label: 'Gmail Send', color: '#ef4444', http_method: 'POST', endpoint_url: 'https://gmail.googleapis.com', description: 'Envio de e-mails' },
  { id: 'outlook', icon: '📨', label: 'Microsoft Outlook 365', color: '#38bdf8', http_method: 'POST', endpoint_url: 'https://graph.microsoft.com/v1.0/me', description: 'Microsoft 365 E-mail' },
  { id: 'whatsapp', icon: '💬', label: 'WhatsApp Evolution', color: '#10b981', http_method: 'POST', endpoint_url: 'http://localhost:8080/message/sendText', description: 'Mensagens WhatsApp' },
  { id: 'telegram', icon: '✈️', label: 'Telegram Bot', color: '#38bdf8', http_method: 'POST', endpoint_url: 'https://api.telegram.org/bot', description: 'Notificações Telegram' },
  { id: 'home_assistant', icon: '🏠', label: 'Home Assistant IoT', color: '#f59e0b', http_method: 'POST', endpoint_url: 'http://homeassistant.local:8123/api', description: 'Automação residencial' },
  { id: 'notion', icon: '📓', label: 'Notion Workspace', color: '#e2e8f0', http_method: 'GET', endpoint_url: 'https://api.notion.com/v1', description: 'Notas e bancos Notion' },
  { id: 'ssh_terminal', icon: '💻', label: 'SSH Terminal Remoto', color: '#22d3ee', http_method: 'SSH', endpoint_url: 'ssh://servidor:22', description: 'Execução remota via SSH' }
];

interface MemoryDotItem {
  id: string;
  agentId: number | string;
  agentSlug: string;
  agentName: string;
  summary: string;
  seedOffset: number;
}

const savedConnectionsCatalog = ref<any[]>([...DEFAULT_CONNECTIONS]);
const dynamicAgents = ref<any[]>([]);
const memoryDots = ref<MemoryDotItem[]>([]);

const activeAgentForTools = ref<any | null>(null);
const selectedSubNode = ref<any | null>(null);
const selectedMemoryDot = ref<MemoryDotItem | null>(null);
const popoverTab = ref<'connected' | 'saved' | 'create'>('connected');
const connSaveFeedback = ref('');

const newConnForm = reactive({
  icon: '🔌',
  label: '',
  description: '',
  http_method: 'GET',
  endpoint_url: '',
  auth_token: ''
});

// Estados multimodais e chat
const promptText = ref('');
const isProcessing = ref(false);
const lastResponse = ref<{ agent: string; text: string; executionTimeMs?: number } | null>(null);
const isCameraActive = ref(false);
const isScreenActive = ref(false);
const videoElement = ref<HTMLVideoElement | null>(null);
let mediaStream: MediaStream | null = null;

// Estados do Canvas 3D
const neuralCanvas = ref<HTMLCanvasElement | null>(null);
let animFrameId = 0;
let rotY = 0.25;
let rotX = 0.18;
let zoom = 1.0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let pointerDownPos = { x: 0, y: 0 };
let corePulseBoost = 0;
let activeTargetSlug: string | null = null;

interface ProjectedHitbox {
  kind: 'core' | 'agent' | 'subnode' | 'memory';
  id: string | number;
  x: number;
  y: number;
  r: number;
  agent?: any;
  subnodeData?: any;
  memoryData?: MemoryDotItem;
}
let hitboxes: ProjectedHitbox[] = [];

const PALETTE = ['#10b981', '#38bdf8', '#d946ef', '#a855f7', '#f59e0b', '#22c55e', '#ec4899'];

function getConnectionMeta(toolId: string) {
  const clean = String(toolId).trim().toLowerCase();
  const found = savedConnectionsCatalog.value.find((c) => c.id.toLowerCase() === clean);
  if (found) return found;
  return {
    id: clean,
    icon: '🔌',
    label: toolId,
    color: '#38bdf8',
    http_method: 'API',
    endpoint_url: ''
  };
}

// ============================================================================
// MOTOR DE VOZ COMPLETO: WAKE WORD ("JARVIS") + STT + SÍNTESE DE VOZ (TTS)
// ============================================================================
const isAlwaysListening = ref<boolean>(true);
const isJarvisAwake = ref<boolean>(false);
const isJarvisSpeaking = ref<boolean>(false);
const isVoiceMuted = ref<boolean>(false);
const voiceStatusText = ref<string>('Vigília ativa: diga "Jarvis"...');

let wakeRecognition: any = null;
let wakeTimeoutId: any = null;

function playJarvisChime(type: 'wake' | 'send' = 'wake') {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    if (type === 'wake') {
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.09);
    } else {
      osc.frequency.setValueAtTime(659.25, ctx.currentTime);
      osc.frequency.setValueAtTime(523.25, ctx.currentTime + 0.09);
    }

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {}
}

function speakJarvisResponse(rawText: string) {
  if (isVoiceMuted.value || !('speechSynthesis' in window) || !rawText) return;

  const cleanText = rawText
    .replace(/```[\s\S]*?```/g, 'bloco de código exibido na tela.')
    .replace(/[*#_`~>|]/g, '')
    .replace(/https?:\/\/\S+/g, 'link disponível na tela')
    .trim();

  if (!cleanText) return;

  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    isJarvisSpeaking.value = true;
    if (wakeRecognition) {
      try {
        wakeRecognition.stop();
      } catch {}
    }

    const sentences = cleanText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanText];
    const voices = window.speechSynthesis.getVoices();
    const ptVoice =
      voices.find((v) => v.lang.includes('pt-BR') && (v.name.includes('Google') || v.name.includes('Antonio') || v.name.includes('Francisca') || v.name.includes('Natural'))) ||
      voices.find((v) => v.lang.includes('pt-BR')) ||
      voices.find((v) => v.lang.startsWith('pt'));

    sentences.forEach((sentence, idx) => {
      const utterance = new SpeechSynthesisUtterance(sentence.trim());
      utterance.lang = 'pt-BR';
      utterance.rate = 1.08;
      utterance.pitch = 1.0;
      if (ptVoice) utterance.voice = ptVoice;

      if (idx === sentences.length - 1) {
        utterance.onend = () => {
          isJarvisSpeaking.value = false;
          restartWakeWordAfterSpeech();
        };
        utterance.onerror = () => {
          isJarvisSpeaking.value = false;
          restartWakeWordAfterSpeech();
        };
      }

      window.speechSynthesis.speak(utterance);
    });
  } catch (err) {
    console.warn('Falha ao sintetizar voz:', err);
    isJarvisSpeaking.value = false;
    restartWakeWordAfterSpeech();
  }
}

function restartWakeWordAfterSpeech() {
  if (isAlwaysListening.value && wakeRecognition) {
    setTimeout(() => {
      try {
        wakeRecognition.start();
        voiceStatusText.value = 'Vigília ativa: diga "Jarvis"...';
      } catch {}
    }, 300);
  }
}

function initWakeWordListener() {
  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    voiceStatusText.value = 'Navegador sem suporte a Web Speech API (use Chrome/Edge).';
    return;
  }

  if (wakeRecognition) {
    try {
      wakeRecognition.stop();
    } catch {}
  }

  wakeRecognition = new SpeechRecognition();
  wakeRecognition.continuous = true;
  wakeRecognition.interimResults = true;
  wakeRecognition.lang = 'pt-BR';

  wakeRecognition.onstart = () => {
    if (!isJarvisAwake.value) {
      voiceStatusText.value = '🟢 Ouvindo gatilho "Jarvis"...';
    }
  };

  wakeRecognition.onresult = (event: any) => {
    if (isJarvisSpeaking.value) return;

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0].transcript.trim();
      const lower = transcript.toLowerCase();

      // Caso 1: Chamou "Jarvis" na frase
      if (lower.includes('jarvis') && !isJarvisAwake.value) {
        const afterWakeWord = transcript.split(/jarvis/i).pop()?.replace(/^[,.\s]+/, '').trim() || '';

        if (result.isFinal && afterWakeWord.length > 2) {
          playJarvisChime('wake');
          voiceStatusText.value = `⚡ Comando: "${afterWakeWord}"`;
          sendCommand(afterWakeWord);
          return;
        }

        if (result.isFinal && afterWakeWord.length <= 2) {
          isJarvisAwake.value = true;
          playJarvisChime('wake');
          voiceStatusText.value = '🎙️ Estou ouvindo! Diga seu comando...';

          if (wakeTimeoutId) clearTimeout(wakeTimeoutId);
          wakeTimeoutId = setTimeout(() => {
            if (isJarvisAwake.value) {
              isJarvisAwake.value = false;
              voiceStatusText.value = '🟢 Ouvindo gatilho "Jarvis"...';
            }
          }, 8000);
          return;
        }
      }

      // Caso 2: Já estava acordado aguardando o comando
      if (isJarvisAwake.value && result.isFinal && transcript.length > 1) {
        const cleanCmd = transcript.replace(/^jarvis[,.\s]*/i, '').trim();
        if (cleanCmd.length > 1) {
          isJarvisAwake.value = false;
          if (wakeTimeoutId) clearTimeout(wakeTimeoutId);
          playJarvisChime('send');
          voiceStatusText.value = `⚡ Processando: "${cleanCmd}"`;
          sendCommand(cleanCmd);
          return;
        }
      }
    }
  };

  wakeRecognition.onerror = (event: any) => {
    if (event.error === 'not-allowed') {
      voiceStatusText.value = '🔴 Microfone bloqueado! Acesse via HTTPS e permita o microfone.';
      isAlwaysListening.value = false;
    }
  };

  wakeRecognition.onend = () => {
    if (isAlwaysListening.value && !isJarvisSpeaking.value) {
      setTimeout(() => {
        try {
          wakeRecognition.start();
        } catch {}
      }, 250);
    }
  };

  try {
    wakeRecognition.start();
  } catch {}
}

function toggleMicrophone() {
  if (!isAlwaysListening.value) {
    isAlwaysListening.value = true;
    initWakeWordListener();
  } else {
    isJarvisAwake.value = true;
    playJarvisChime('wake');
    voiceStatusText.value = '🎙️ Estou ouvindo! Pode falar...';
  }
}

function getAgentsUsingTool(toolId: string) {
  const clean = String(toolId).trim().toLowerCase();
  return dynamicAgents.value.filter(
    (ag) => Array.isArray(ag.tools) && ag.tools.some((t: string) => String(t).trim().toLowerCase() === clean)
  );
}

const fixedSharedNodes = computed(() => {
  const uniqueIds = new Set<string>();
  for (const ag of dynamicAgents.value) {
    if (Array.isArray(ag.tools)) {
      for (const t of ag.tools) {
        if (t) uniqueIds.add(String(t).trim().toLowerCase());
      }
    }
  }
  for (const c of savedConnectionsCatalog.value) {
    if (c.is_enabled) uniqueIds.add(String(c.id).trim().toLowerCase());
  }
  return Array.from(uniqueIds).map((id) => getConnectionMeta(id));
});

const activeSharedNodesCount = computed(() => fixedSharedNodes.value.length);

function getAgentMemoryCount(agent: any) {
  return memoryDots.value.filter(
    (m) => m.agentId === agent.id || m.agentSlug === agent.slug
  ).length;
}

// 1. Carrega dados do ecossistema
async function loadEcosystemData() {
  try {
    const localCustom = JSON.parse(localStorage.getItem('custom_agent_tools_catalog') || '[]');
    for (const item of localCustom) {
      if (!savedConnectionsCatalog.value.some((c) => c.id === item.id)) {
        savedConnectionsCatalog.value.push({
          id: item.id,
          icon: item.icon || '🛠️',
          label: item.label || item.id,
          color: item.color || '#38bdf8',
          http_method: item.http_method || 'API',
          endpoint_url: item.endpoint_url || '',
          description: item.description || ''
        });
      }
    }

    const connRes = await fetch('/api/v1/connectors').catch(() => null);
    if (connRes && connRes.ok) {
      const connJson = await connRes.json();
      if (connJson.success && Array.isArray(connJson.data)) {
        for (const row of connJson.data) {
          const id = row.provider_key;
          const cfg = row.config || {};
          const entry = {
            id,
            icon: row.icon || '🔌',
            label: row.name || id,
            color: '#38bdf8',
            http_method: cfg.http_method || row.http_method || 'GET',
            endpoint_url: cfg.endpoint_url || row.endpoint_url || '',
            description: row.description || cfg.description || '',
            is_enabled: Boolean(row.is_enabled)
          };
          const idx = savedConnectionsCatalog.value.findIndex((c) => c.id === id);
          if (idx >= 0) savedConnectionsCatalog.value[idx] = { ...savedConnectionsCatalog.value[idx], ...entry };
          else savedConnectionsCatalog.value.push(entry);
        }
      }
    }

    const agRes = await fetch('/api/v1/agents');
    const agJson = await agRes.json();
    if (agJson.success && Array.isArray(agJson.data)) {
      dynamicAgents.value = agJson.data.map((ag: any) => ({
        ...ag,
        tools: Array.isArray(ag.tools)
          ? ag.tools
          : typeof ag.tools === 'string'
          ? (() => {
              try {
                return JSON.parse(ag.tools);
              } catch {
                return [];
              }
            })()
          : []
      }));

      if (activeAgentForTools.value) {
        const updated = dynamicAgents.value.find((a) => a.id === activeAgentForTools.value.id);
        if (updated) activeAgentForTools.value = updated;
      }
    }

    await loadMemoryDots();
  } catch (err) {
    console.warn('Erro ao sincronizar ecossistema:', err);
  }
}

async function loadMemoryDots() {
  const loadedDots: MemoryDotItem[] = [];
  try {
    const sessRes = await fetch('/api/v1/memory/sessions/main_neural_session').catch(() => null);
    if (sessRes && sessRes.ok) {
      const sessJson = await sessRes.json();
      const specCtx = Array.isArray(sessJson.specialistContext) ? sessJson.specialistContext : [];
      const chatHist = Array.isArray(sessJson.chatHistory) ? sessJson.chatHistory : [];

      specCtx.slice(0, 18).forEach((item: any, idx: number) => {
        const matchedAg =
          dynamicAgents.value.find((a) => a.slug === item.specialist_slug) ||
          dynamicAgents.value[idx % Math.max(1, dynamicAgents.value.length)];
        if (matchedAg) {
          loadedDots.push({
            id: `spec_mem_${item.id || idx}`,
            agentId: matchedAg.id,
            agentSlug: matchedAg.slug,
            agentName: matchedAg.name,
            summary:
              typeof item.context_data === 'string'
                ? item.context_data.slice(0, 160)
                : JSON.stringify(item.context_data || {}).slice(0, 160),
            seedOffset: idx * 1.37
          });
        }
      });

      const assistantMsgs = chatHist.filter((m: any) => m.role === 'assistant').slice(-10);
      assistantMsgs.forEach((msg: any, idx: number) => {
        const targetAg = dynamicAgents.value[idx % Math.max(1, dynamicAgents.value.length)];
        if (targetAg) {
          loadedDots.push({
            id: `chat_mem_${msg.id || idx}`,
            agentId: targetAg.id,
            agentSlug: targetAg.slug,
            agentName: targetAg.name,
            summary: String(msg.content || '').slice(0, 160),
            seedOffset: (idx + 5) * 2.13
          });
        }
      });
    }
  } catch {}

  if (loadedDots.length === 0 && dynamicAgents.value.length > 0) {
    dynamicAgents.value.forEach((ag, idx) => {
      loadedDots.push(
        {
          id: `init_mem_${ag.id}_1`,
          agentId: ag.id,
          agentSlug: ag.slug,
          agentName: ag.name,
          summary: `Memória sináptica ativa do agente ${ag.name} sincronizada com o Orquestrador.`,
          seedOffset: idx * 1.9 + 0.4
        },
        {
          id: `init_mem_${ag.id}_2`,
          agentId: ag.id,
          agentSlug: ag.slug,
          agentName: ag.name,
          summary: `Registro vetorial indexado por ${ag.name} no banco PostgreSQL.`,
          seedOffset: idx * 2.7 + 1.2
        }
      );
    });
  }

  memoryDots.value = loadedDots;
}

function isConnectionLinked(agent: any, connId: string): boolean {
  const clean = String(connId).trim().toLowerCase();
  return (
    Array.isArray(agent.tools) &&
    agent.tools.some((t: string) => String(t).trim().toLowerCase() === clean)
  );
}

async function toggleAgentConnection(agent: any, connId: string) {
  if (!Array.isArray(agent.tools)) agent.tools = [];
  const clean = String(connId).trim().toLowerCase();
  const idx = agent.tools.findIndex((t: string) => String(t).trim().toLowerCase() === clean);
  if (idx >= 0) {
    agent.tools.splice(idx, 1);
  } else {
    agent.tools.push(connId);
  }

  await fetch(`/api/v1/agents/${agent.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...agent, tools: agent.tools })
  }).catch(() => {});
}

async function createAndAttachConnection() {
  if (!newConnForm.label.trim()) {
    connSaveFeedback.value = '⚠️ Informe um nome para o nó.';
    return;
  }

  const id = newConnForm.label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const payload = {
    provider_key: id,
    name: newConnForm.label.trim(),
    category: 'Custom Node',
    icon: newConnForm.icon || '🔌',
    description: newConnForm.description.trim() || `Conexão ${newConnForm.label.trim()}`,
    is_enabled: true,
    config: {
      http_method: newConnForm.http_method,
      endpoint_url: newConnForm.endpoint_url.trim(),
      auth_token: newConnForm.auth_token.trim(),
      description: newConnForm.description.trim()
    }
  };

  try {
    await fetch('/api/v1/connectors', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const newCatalogItem = {
      id,
      icon: payload.icon,
      label: payload.name,
      color: '#38bdf8',
      http_method: newConnForm.http_method,
      endpoint_url: newConnForm.endpoint_url.trim(),
      description: payload.description,
      is_enabled: true
    };

    const existingIdx = savedConnectionsCatalog.value.findIndex((c) => c.id === id);
    if (existingIdx >= 0) savedConnectionsCatalog.value[existingIdx] = newCatalogItem;
    else savedConnectionsCatalog.value.push(newCatalogItem);

    const localSaved = JSON.parse(localStorage.getItem('custom_agent_tools_catalog') || '[]');
    localStorage.setItem(
      'custom_agent_tools_catalog',
      JSON.stringify([...localSaved.filter((x: any) => x.id !== id), newCatalogItem])
    );

    if (activeAgentForTools.value) {
      if (!isConnectionLinked(activeAgentForTools.value, id)) {
        await toggleAgentConnection(activeAgentForTools.value, id);
      }
    }

    newConnForm.label = '';
    newConnForm.description = '';
    newConnForm.endpoint_url = '';
    newConnForm.auth_token = '';
    connSaveFeedback.value = '✅ Nó fixo salvo e conectado ao agente!';
    setTimeout(() => {
      connSaveFeedback.value = '';
      popoverTab.value = 'connected';
    }, 900);
  } catch (err: any) {
    connSaveFeedback.value = `🔴 Erro: ${err.message}`;
  }
}

function closeAgentPopover() {
  activeAgentForTools.value = null;
}

function clearSelection() {
  activeAgentForTools.value = null;
  selectedSubNode.value = null;
  selectedMemoryDot.value = null;
}

// ============================================================================
// MOTOR 3D
// ============================================================================
function project3D(x: number, y: number, z: number, cx: number, cy: number) {
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  const x1 = x * cosY - z * sinY;
  const z1 = z * cosY + x * sinY;

  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);
  const y2 = y * cosX - z1 * sinX;
  const z2 = z1 * cosX + y * sinX;

  const fov = 780 * zoom;
  const scale = fov / Math.max(200, fov + z2);
  return {
    x: cx + x1 * scale,
    y: cy + y2 * scale,
    z: z2,
    scale
  };
}

function drawCurvedSynapse(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  time: number,
  isHighlighted: boolean,
  dashed = false,
  dimmed = false,
  curveBend = 0.14
) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const cx = mx - dy * curveBend;
  const cy = my + dx * curveBend;

  ctx.save();
  ctx.beginPath();
  if (dashed) ctx.setLineDash([4, 5]);
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cx, cy, x2, y2);
  ctx.strokeStyle = color;
  ctx.globalAlpha = dimmed ? 0.12 : isHighlighted ? 0.88 : 0.38;
  ctx.lineWidth = isHighlighted ? 2.1 : 1.2;
  ctx.shadowColor = color;
  ctx.shadowBlur = isHighlighted ? 12 : 4;
  ctx.stroke();

  if (!dimmed) {
    const t = (time * (isHighlighted ? 0.85 : 0.3)) % 1;
    const px = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2;
    const py = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2;

    ctx.beginPath();
    ctx.arc(px, py, isHighlighted ? 3.5 : 2.1, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = color;
    ctx.shadowBlur = 9;
    ctx.globalAlpha = isHighlighted ? 0.95 : 0.7;
    ctx.fill();
  }
  ctx.restore();
}

function startNeuralLoop() {
  const canvas = neuralCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener('resize', resize);

  const render = (now: number) => {
    const time = now * 0.001;
    if (!isDragging) {
      rotY += 0.0012;
    }
    if (corePulseBoost > 0) corePulseBoost = Math.max(0, corePulseBoost - 0.02);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2 - 18;

    hitboxes = [];

    // Núcleo
    const coreProj = project3D(0, 0, 0, cx, cy);
    const coreRadius = (60 + Math.sin(time * 2.5) * 3 + corePulseBoost * 18) * coreProj.scale;

    const auraGrad = ctx.createRadialGradient(
      coreProj.x,
      coreProj.y,
      coreRadius * 0.2,
      coreProj.x,
      coreProj.y,
      coreRadius * 2.1
    );
    auraGrad.addColorStop(0, 'rgba(56, 189, 248, 0.42)');
    auraGrad.addColorStop(0.5, 'rgba(6, 182, 212, 0.14)');
    auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(coreProj.x, coreProj.y, coreRadius * 2.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(coreProj.x, coreProj.y);
    ctx.rotate(time * 0.35);
    const segments = 36;
    for (let i = 0; i < segments; i++) {
      const a1 = (i / segments) * Math.PI * 2;
      const a2 = a1 + (Math.PI * 2) / (segments * 1.6);
      ctx.beginPath();
      ctx.arc(0, 0, coreRadius * 1.25, a1, a2);
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
      ctx.lineWidth = 3.8 * coreProj.scale;
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(165, 243, 252, 0.65)';
    ctx.lineWidth = 1;
    const latLines = 6;
    const lonLines = 10;
    for (let i = 1; i < latLines; i++) {
      const phi = (i / latLines) * Math.PI;
      ctx.beginPath();
      for (let j = 0; j <= 36; j++) {
        const theta = (j / 36) * Math.PI * 2;
        const sx = (coreRadius * 0.85) / coreProj.scale * Math.sin(phi) * Math.cos(theta);
        const sy = (coreRadius * 0.85) / coreProj.scale * Math.cos(phi);
        const sz = (coreRadius * 0.85) / coreProj.scale * Math.sin(phi) * Math.sin(theta);
        const p = project3D(sx, sy, sz, cx, cy);
        if (j === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    for (let j = 0; j < lonLines; j++) {
      const theta = (j / lonLines) * Math.PI;
      ctx.beginPath();
      for (let i = 0; i <= 36; i++) {
        const phi = (i / 36) * Math.PI * 2;
        const sx = (coreRadius * 0.85) / coreProj.scale * Math.sin(phi) * Math.cos(theta);
        const sy = (coreRadius * 0.85) / coreProj.scale * Math.cos(phi);
        const sz = (coreRadius * 0.85) / coreProj.scale * Math.sin(phi) * Math.sin(theta);
        const p = project3D(sx, sy, sz, cx, cy);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.restore();

    hitboxes.push({
      kind: 'core',
      id: 'jarvis_core',
      x: coreProj.x,
      y: coreProj.y,
      r: coreRadius * 1.15
    });

    // Posições dos Agentes
    const agents = dynamicAgents.value;
    const totalAgents = agents.length;
    const agentOrbitRadius = 215;
    const hasSelectedAgent = Boolean(activeAgentForTools.value);
    const hasSelectedSubNode = Boolean(selectedSubNode.value);

    const agentPositionsMap = new Map<number | string, {
      ag: any;
      ax: number;
      ay: number;
      az: number;
      proj: { x: number; y: number; z: number; scale: number };
      color: string;
      angle: number;
    }>();

    agents.forEach((ag, index) => {
      const angle = (index / Math.max(1, totalAgents)) * Math.PI * 2;
      const ax = Math.cos(angle) * agentOrbitRadius;
      const ay = Math.sin(angle * 2) * 45;
      const az = Math.sin(angle) * agentOrbitRadius;
      const proj = project3D(ax, ay, az, cx, cy);
      const color = PALETTE[index % PALETTE.length];

      agentPositionsMap.set(ag.id, { ag, ax, ay, az, proj, color, angle });
    });

    // Memórias
    memoryDots.value.forEach((mem, mIdx) => {
      const parentInfo = agentPositionsMap.get(mem.agentId);
      if (!parentInfo) return;

      const sideOffset = Math.sin(mem.seedOffset + mIdx * 1.7) * 36;
      const verticalOffset = Math.cos(mem.seedOffset * 1.3 + mIdx) * 32;
      const perpAngle = parentInfo.angle + Math.PI / 2;

      const mx = parentInfo.ax * 0.52 + Math.cos(perpAngle) * sideOffset;
      const my = parentInfo.ay * 0.52 + verticalOffset;
      const mz = parentInfo.az * 0.52 + Math.sin(perpAngle) * sideOffset;

      const memProj = project3D(mx, my, mz, cx, cy);
      const isParentSelected = activeAgentForTools.value?.id === parentInfo.ag.id;
      const isMemSelected = selectedMemoryDot.value?.id === mem.id;
      const isDimmed = (hasSelectedAgent && !isParentSelected) || hasSelectedSubNode;

      drawCurvedSynapse(
        ctx,
        parentInfo.proj.x,
        parentInfo.proj.y,
        memProj.x,
        memProj.y,
        parentInfo.color,
        time * 0.9 + mIdx * 0.3,
        isParentSelected || isMemSelected,
        true,
        isDimmed,
        0.1
      );

      drawCurvedSynapse(
        ctx,
        memProj.x,
        memProj.y,
        coreProj.x,
        coreProj.y,
        '#38bdf8',
        time * 1.1 + mIdx * 0.4,
        isParentSelected || isMemSelected,
        true,
        isDimmed,
        0.1
      );

      const dotR = (isMemSelected ? 5.5 : 3.6) * memProj.scale;
      ctx.save();
      ctx.globalAlpha = isDimmed ? 0.22 : 0.95;
      ctx.beginPath();
      ctx.arc(memProj.x, memProj.y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = isMemSelected ? '#ffffff' : '#a5f3fc';
      ctx.shadowColor = parentInfo.color;
      ctx.shadowBlur = isParentSelected || isMemSelected ? 14 : 8;
      ctx.fill();
      ctx.restore();

      hitboxes.push({
        kind: 'memory',
        id: mem.id,
        x: memProj.x,
        y: memProj.y,
        r: dotR + 6,
        memoryData: mem
      });
    });

    // Nós Compartilhados Fixos
    const sharedNodes = fixedSharedNodes.value;
    const totalShared = sharedNodes.length;
    const outerNodeRadius = 355;

    sharedNodes.forEach((nodeMeta, nIdx) => {
      const nAngle = (nIdx / Math.max(1, totalShared)) * Math.PI * 2 + 0.22;
      const nx = Math.cos(nAngle) * outerNodeRadius;
      const ny = Math.cos(nAngle * 3) * 68;
      const nz = Math.sin(nAngle) * outerNodeRadius;

      const subProj = project3D(nx, ny, nz, cx, cy);
      const connectedAgents = getAgentsUsingTool(nodeMeta.id);

      const isSubNodeSelected = selectedSubNode.value?.toolId === nodeMeta.id;
      const isLinkedToSelectedAgent =
        hasSelectedAgent && isConnectionLinked(activeAgentForTools.value, nodeMeta.id);
      const isDimmed =
        (hasSelectedAgent && !isLinkedToSelectedAgent) ||
        (hasSelectedSubNode && !isSubNodeSelected);

      connectedAgents.forEach((ag, linkIdx) => {
        const agInfo = agentPositionsMap.get(ag.id);
        if (!agInfo) return;

        const highlightLine =
          isSubNodeSelected ||
          activeAgentForTools.value?.id === ag.id ||
          activeTargetSlug === ag.slug;

        const dimLine =
          (hasSelectedAgent && activeAgentForTools.value?.id !== ag.id) ||
          (hasSelectedSubNode && !isSubNodeSelected);

        drawCurvedSynapse(
          ctx,
          agInfo.proj.x,
          agInfo.proj.y,
          subProj.x,
          subProj.y,
          agInfo.color,
          time * 1.15 + nIdx * 0.2 + linkIdx * 0.35,
          highlightLine,
          true,
          dimLine,
          0.16
        );
      });

      const subNodeR = (isSubNodeSelected || isLinkedToSelectedAgent ? 16 : 13.5) * subProj.scale;
      ctx.save();
      ctx.globalAlpha = isDimmed ? 0.25 : 0.96;
      ctx.beginPath();
      ctx.arc(subProj.x, subProj.y, subNodeR, 0, Math.PI * 2);
      ctx.fillStyle = '#090d16';
      ctx.fill();
      ctx.lineWidth = isSubNodeSelected || isLinkedToSelectedAgent ? 2.2 : 1.5;
      ctx.strokeStyle = nodeMeta.color || '#38bdf8';
      ctx.shadowColor = nodeMeta.color || '#38bdf8';
      ctx.shadowBlur = isSubNodeSelected || isLinkedToSelectedAgent ? 14 : 6;
      ctx.stroke();

      ctx.font = `${Math.round((isSubNodeSelected ? 11.5 : 10) * subProj.scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(nodeMeta.icon || '🔌', subProj.x, subProj.y);

      if (connectedAgents.length > 1) {
        const bx = subProj.x + subNodeR * 0.72;
        const by = subProj.y - subNodeR * 0.72;
        ctx.beginPath();
        ctx.arc(bx, by, 6.5 * subProj.scale, 0, Math.PI * 2);
        ctx.fillStyle = '#10b981';
        ctx.fill();
        ctx.font = `bold ${Math.round(7.5 * subProj.scale)}px sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(String(connectedAgents.length), bx, by);
      }
      ctx.restore();

      hitboxes.push({
        kind: 'subnode',
        id: `fixed_node_${nodeMeta.id}`,
        x: subProj.x,
        y: subProj.y,
        r: subNodeR + 6,
        subnodeData: {
          ...nodeMeta,
          toolId: nodeMeta.id
        }
      });
    });

    // Render dos Agentes
    Array.from(agentPositionsMap.values()).forEach(({ ag, proj: agProj, color }, index) => {
      const isSelected = activeAgentForTools.value?.id === ag.id;
      const isTriggered = activeTargetSlug === ag.slug;
      const isConnectedToSelectedSub =
        hasSelectedSubNode && isConnectionLinked(ag, selectedSubNode.value.toolId);
      const isDimmed =
        (hasSelectedAgent && !isSelected) ||
        (hasSelectedSubNode && !isConnectedToSelectedSub);

      drawCurvedSynapse(
        ctx,
        coreProj.x,
        coreProj.y,
        agProj.x,
        agProj.y,
        color,
        time + index * 0.25,
        isSelected || isTriggered || isConnectedToSelectedSub,
        false,
        isDimmed
      );

      const agR = (isSelected ? 29 : 24.5) * agProj.scale;
      const agentTools: string[] = Array.isArray(ag.tools) ? ag.tools : [];

      ctx.save();
      ctx.globalAlpha = isDimmed ? 0.35 : 1;

      ctx.beginPath();
      ctx.arc(agProj.x, agProj.y, agR + 5 * agProj.scale, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.globalAlpha = isDimmed ? 0.15 : isSelected ? 0.85 : 0.35;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(agProj.x, agProj.y, agR, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.globalAlpha = isDimmed ? 0.45 : 0.95;
      ctx.fill();
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = isSelected ? 20 : 10;
      ctx.stroke();

      ctx.font = `${Math.round(17 * agProj.scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ag.icon || '🤖', agProj.x, agProj.y);

      if (agentTools.length > 0) {
        const bx = agProj.x + agR * 0.72;
        const by = agProj.y - agR * 0.72;
        ctx.beginPath();
        ctx.arc(bx, by, 8.5 * agProj.scale, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? '#10b981' : '#0284c7';
        ctx.fill();
        ctx.font = `bold ${Math.round(9 * agProj.scale)}px sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(String(agentTools.length), bx, by);
      }

      ctx.font = `600 ${Math.round(11.5 * agProj.scale)}px system-ui, sans-serif`;
      ctx.fillStyle = isSelected ? '#38bdf8' : '#f8fafc';
      ctx.fillText(ag.name, agProj.x, agProj.y + agR + 14 * agProj.scale);
      ctx.restore();

      hitboxes.push({
        kind: 'agent',
        id: ag.id,
        x: agProj.x,
        y: agProj.y,
        r: agR + 8,
        agent: ag
      });
    });

    animFrameId = requestAnimationFrame(render);
  };

  animFrameId = requestAnimationFrame(render);
}

// Mouse Interativo
function onMouseDown(e: MouseEvent) {
  isDragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  pointerDownPos = { x: e.clientX, y: e.clientY };
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  rotY += dx * 0.005;
  rotX = Math.max(-1.1, Math.min(1.1, rotX + dy * 0.005));
  dragStartX = e.clientX;
  dragStartY = e.clientY;
}

function onMouseUp(e: MouseEvent) {
  if (!isDragging) return;
  isDragging = false;

  const movedDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
  if (movedDist > 6) return;

  const rect = neuralCanvas.value?.getBoundingClientRect();
  if (!rect) return;
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  for (let i = hitboxes.length - 1; i >= 0; i--) {
    const h = hitboxes[i];
    if (Math.hypot(clickX - h.x, clickY - h.y) <= h.r) {
      if (h.kind === 'memory' && h.memoryData) {
        selectedSubNode.value = null;
        selectedMemoryDot.value = h.memoryData;
        return;
      }
      if (h.kind === 'subnode') {
        selectedMemoryDot.value = null;
        activeAgentForTools.value = null;
        selectedSubNode.value =
          selectedSubNode.value?.toolId === h.subnodeData.toolId ? null : h.subnodeData;
        return;
      }
      if (h.kind === 'agent' && h.agent) {
        selectedSubNode.value = null;
        selectedMemoryDot.value = null;
        if (activeAgentForTools.value?.id === h.agent.id) {
          activeAgentForTools.value = null;
        } else {
          activeAgentForTools.value = h.agent;
          popoverTab.value = 'connected';
        }
        return;
      }
      if (h.kind === 'core') {
        clearSelection();
        return;
      }
    }
  }
}

function onWheel(e: WheelEvent) {
  zoom = Math.max(0.55, Math.min(1.85, zoom - e.deltaY * 0.0008));
}

// ============================================================================
// DISPARO DE COMANDO UNIFICADO COM SÍNTESE DE VOZ
// ============================================================================
async function sendCommand(overrideText?: string) {
  const textToSend = (overrideText || promptText.value || '').trim();
  if (!textToSend || isProcessing.value) return;

  promptText.value = '';
  isProcessing.value = true;
  corePulseBoost = 1.5;

  try {
    const res = await fetch('/api/v1/webhook/ingress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identityToken: 'Matheus-Admin',
        sessionId: 'main_neural_session',
        prompt: textToSend,
        sensorData: {
          prompt: textToSend,
          textPrompt: textToSend
        }
      })
    });

    const json = await res.json();
    const payload = json.data || json;

    if (!res.ok || json.success === false || payload.success === false) {
      const errMsg = payload.response || json.error || payload.error || 'Falha ao processar comando.';
      lastResponse.value = {
        agent: payload.agent || 'JARVIS (Aviso)',
        text: errMsg,
        executionTimeMs: json.executionTimeMs || payload.executionTimeMs || 0
      };
      speakJarvisResponse(errMsg);
      return;
    }

    let producerAgent = dynamicAgents.value[0];
    if (payload.agentId) {
      activeTargetSlug = String(payload.agentId);
      const triggered = dynamicAgents.value.find(
        (a) => a.slug === payload.agentId || a.id === payload.agentId
      );
      if (triggered) {
        producerAgent = triggered;
        activeAgentForTools.value = triggered;
        popoverTab.value = 'connected';
      }
    }

    const responseText = payload.response || payload.output || 'Comando processado com sucesso.';
    lastResponse.value = {
      agent: payload.agent || 'JARVIS',
      text: responseText,
      executionTimeMs: payload.executionTimeMs || json.executionTimeMs || 0
    };

    // Dispara a fala em voz alta
    speakJarvisResponse(responseText);

    await loadEcosystemData();

    if (producerAgent) {
      memoryDots.value.push({
        id: `live_mem_${Date.now()}`,
        agentId: producerAgent.id,
        agentSlug: producerAgent.slug,
        agentName: producerAgent.name,
        summary: String(responseText).slice(0, 160),
        seedOffset: memoryDots.value.length * 1.65 + 0.5
      });
    }

    corePulseBoost = 2.0;
  } catch (err: any) {
    const errText = `Erro de comunicação com o backend: ${err.message}`;
    lastResponse.value = {
      agent: 'Sistema Nervoso Central',
      text: errText
    };
    speakJarvisResponse(errText);
  } finally {
    isProcessing.value = false;
  }
}

async function toggleWebcam() {
  if (isCameraActive.value) {
    stopAllMedia();
    return;
  }
  stopAllMedia();
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    if (videoElement.value) videoElement.value.srcObject = mediaStream;
    isCameraActive.value = true;
  } catch (err: any) {
    alert('Não foi possível acessar a câmera: ' + err.message);
  }
}

async function toggleScreenCapture() {
  if (isScreenActive.value) {
    stopAllMedia();
    return;
  }
  stopAllMedia();
  try {
    mediaStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    if (videoElement.value) videoElement.value.srcObject = mediaStream;
    isScreenActive.value = true;
  } catch (err: any) {
    console.warn('Captura de tela cancelada:', err.message);
  }
}

function stopAllMedia() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  isCameraActive.value = false;
  isScreenActive.value = false;
}

onMounted(async () => {
  await loadEcosystemData();
  startNeuralLoop();

  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }
  initWakeWordListener();

  window.addEventListener(
    'click',
    () => {
      if ('speechSynthesis' in window) window.speechSynthesis.resume();
      if (isAlwaysListening.value && wakeRecognition) {
        try {
          wakeRecognition.start();
        } catch {}
      }
    },
    { once: true }
  );
});

onBeforeUnmount(() => {
  cancelAnimationFrame(animFrameId);
  stopAllMedia();
  if (wakeRecognition) {
    try {
      wakeRecognition.stop();
    } catch {}
  }
});
</script>

<style scoped>
.jarvis-universe {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: radial-gradient(circle at center, #081226 0%, #03060c 75%, #010206 100%);
  color: #f8fafc;
  font-family: system-ui, -apple-system, sans-serif;
}

.hud-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 14px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 20;
  pointer-events: none;
}

.hud-brand,
.hud-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  pointer-events: auto;
}

.pulse-dot {
  width: 9px;
  height: 9px;
  background: #22d3ee;
  border-radius: 50%;
  box-shadow: 0 0 12px #22d3ee;
}

.hud-title {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #e2e8f0;
}

.hud-badge {
  font-size: 11px;
  color: #38bdf8;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(56, 189, 248, 0.3);
  padding: 4px 10px;
  border-radius: 999px;
}

.hud-btn-secondary {
  background: rgba(15, 23, 42, 0.85);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.4);
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.hud-settings-btn {
  background: rgba(15, 23, 42, 0.85);
  color: #f8fafc;
  text-decoration: none;
  border: 1px solid #334155;
  padding: 8px 16px;
  border-radius: 10px;
  font-size: 12.5px;
  font-weight: 600;
  transition: all 0.2s;
}
.hud-settings-btn:hover {
  border-color: #38bdf8;
  color: #38bdf8;
}

.canvas-stage {
  position: relative;
  width: 100%;
  height: 100%;
  cursor: grab;
}
.canvas-stage:active {
  cursor: grabbing;
}

.hud-hint {
  position: absolute;
  bottom: 84px;
  left: 24px;
  font-size: 11.5px;
  color: #38bdf8;
  background: rgba(9, 13, 22, 0.75);
  border: 1px solid rgba(51, 65, 85, 0.5);
  padding: 6px 12px;
  border-radius: 8px;
  pointer-events: none;
}

.agent-connections-popover {
  position: absolute;
  top: 68px;
  right: 24px;
  width: 350px;
  max-height: calc(100vh - 170px);
  background: rgba(11, 17, 32, 0.94);
  backdrop-filter: blur(14px);
  border: 1px solid #1e293b;
  border-radius: 14px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  z-index: 30;
  overflow: hidden;
}

.popover-header {
  padding: 14px 16px;
  border-bottom: 1px solid #1e293b;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.popover-tabs {
  display: flex;
  background: #090d16;
  border-bottom: 1px solid #1e293b;
}

.tab-btn {
  flex: 1;
  padding: 9px 6px;
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.tab-btn.active {
  color: #38bdf8;
  border-bottom-color: #38bdf8;
  background: rgba(56, 189, 248, 0.06);
}

.popover-body {
  padding: 14px;
  overflow-y: auto;
}

.popover-help {
  font-size: 11.5px;
  color: #94a3b8;
  margin: 0 0 10px 0;
}

.empty-connected-box {
  padding: 14px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.7);
  border: 1px dashed #334155;
  color: #94a3b8;
  font-size: 11.5px;
  text-align: center;
}

.saved-connections-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  max-height: 340px;
  overflow-y: auto;
}

.conn-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(30, 41, 59, 0.55);
  border: 1px solid rgba(51, 65, 85, 0.6);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.conn-item.linked {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.12);
}

.unlink-mini-btn {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
  border-radius: 6px;
  padding: 2px 7px;
  font-size: 11px;
  cursor: pointer;
}

.conn-badge {
  font-size: 9.5px;
  font-weight: 700;
  color: #38bdf8;
  background: rgba(14, 165, 233, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
}

.save-conn-btn {
  width: 100%;
  padding: 9px;
  background: #0284c7;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.subnode-inspector {
  position: absolute;
  bottom: 92px;
  right: 24px;
  width: 300px;
  background: rgba(11, 17, 32, 0.95);
  border: 1px solid #38bdf8;
  border-radius: 12px;
  padding: 12px 14px;
  z-index: 30;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.65);
}

.shared-node-agents-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 150px;
  overflow-y: auto;
}

.shared-agent-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: #e2e8f0;
  padding: 5px 8px;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 6px;
  cursor: pointer;
}

.close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 14px;
  cursor: pointer;
}

.command-dock-wrapper {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: min(760px, 92vw);
  z-index: 25;
}

.command-dock {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(11, 17, 32, 0.9);
  backdrop-filter: blur(16px);
  border: 1px solid #1e293b;
  padding: 8px 10px;
  border-radius: 16px;
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.65);
}

.dock-icon-btn {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: 1px solid #334155;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 16px;
  cursor: pointer;
}
.active-mic {
  border-color: #22c55e;
  box-shadow: 0 0 12px rgba(34, 197, 94, 0.6);
}
.active-cam,
.active-screen {
  border-color: #22c55e;
  box-shadow: 0 0 12px rgba(34, 197, 94, 0.5);
}

.dock-input {
  flex: 1;
  background: transparent;
  border: none;
  color: #f8fafc;
  font-size: 13.5px;
  padding: 8px 10px;
  outline: none;
}

.dock-send-btn {
  background: linear-gradient(135deg, #0284c7, #2563eb);
  color: white;
  border: none;
  padding: 9px 18px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}

.response-bubble {
  position: absolute;
  bottom: 92px;
  left: 50%;
  transform: translateX(-50%);
  width: min(720px, 90vw);
  max-height: 240px;
  overflow-y: auto;
  background: rgba(11, 17, 32, 0.95);
  border: 1px solid #0284c7;
  border-radius: 14px;
  padding: 14px 18px;
  z-index: 28;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75);
}
.response-header {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #38bdf8;
  margin-bottom: 6px;
}
.response-text {
  font-size: 13px;
  line-height: 1.5;
  color: #e2e8f0;
  white-space: pre-wrap;
}
.close-bubble {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
}

.media-preview-box {
  position: absolute;
  top: 70px;
  left: 24px;
  width: 240px;
  background: rgba(11, 17, 32, 0.92);
  border: 1px solid #334155;
  border-radius: 10px;
  overflow: hidden;
  z-index: 25;
}
.media-preview-header {
  padding: 6px 10px;
  font-size: 11px;
  display: flex;
  justify-content: space-between;
  background: #0f172a;
}
.media-video {
  width: 100%;
  display: block;
}
.media-close-btn {
  background: none;
  border: none;
  color: #ef4444;
  cursor: pointer;
}
</style>