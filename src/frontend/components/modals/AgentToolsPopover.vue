<template>
  <div class="agent-connections-popover">
    <div class="popover-header">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 20px;">{{ agent.icon || '🤖' }}</span>
        <div>
          <strong style="color: #f8fafc; font-size: 13.5px; display: block;">
            {{ agent.name }}
          </strong>
          <span style="color: #38bdf8; font-size: 11px;">
            {{ (agent.tools || []).length }} nó(s) fixo(s) • {{ memoryCount }} memória(s)
          </span>
        </div>
      </div>
      <button @click="$emit('close')" class="close-btn" title="Fechar painel">✕</button>
    </div>

    <div class="popover-tabs">
      <button
        :class="['tab-btn', { active: activeTab === 'connected' }]"
        @click="activeTab = 'connected'"
      >
        🔗 Conectados ({{ (agent.tools || []).length }})
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'saved' }]"
        @click="activeTab = 'saved'"
      >
        🔌 Todos os Nós ({{ catalog.length }})
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'create' }]"
        @click="activeTab = 'create'"
      >
        ➕ Novo Nó
      </button>
    </div>

    <!-- ABA 1: CONECTADOS -->
    <div v-if="activeTab === 'connected'" class="popover-body">
      <p class="popover-help">
        Nós fixos conectados a <strong>{{ agent.name }}</strong>:
      </p>

      <div v-if="(agent.tools || []).length === 0" class="empty-connected-box">
        Nenhum nó conectado. Use a aba <strong>Todos os Nós</strong> para ligar.
      </div>

      <div v-else class="saved-connections-list">
        <div
          v-for="toolId in agent.tools"
          :key="toolId"
          class="conn-item linked"
        >
          <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
            <span style="font-size: 16px;">{{ getMeta(toolId).icon || '🔌' }}</span>
            <div style="overflow: hidden;">
              <strong style="display: block; font-size: 12px; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                {{ getMeta(toolId).label }}
              </strong>
              <span style="font-size: 10px; color: #94a3b8; display: block;">
                Compartilhado com {{ getAgentsUsing(toolId).length }} agente(s)
              </span>
            </div>
          </div>
          <button
            @click="$emit('toggle-tool', toolId)"
            class="unlink-mini-btn"
            title="Desconectar nó deste agente"
          >
            ✕
          </button>
        </div>
      </div>
    </div>

    <!-- ABA 2: TODOS OS NÓS -->
    <div v-else-if="activeTab === 'saved'" class="popover-body">
      <p class="popover-help">Ligue ou desligue nós fixos neste agente:</p>
      <div class="saved-connections-list">
        <label
          v-for="conn in catalog"
          :key="conn.id"
          class="conn-item"
          :class="{ linked: isLinked(conn.id) }"
        >
          <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
            <input
              type="checkbox"
              :checked="isLinked(conn.id)"
              @change="$emit('toggle-tool', conn.id)"
            />
            <span style="font-size: 15px;">{{ conn.icon || '🔌' }}</span>
            <div style="overflow: hidden;">
              <strong style="display: block; font-size: 12px; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                {{ conn.label }}
              </strong>
              <span style="font-size: 10px; color: #94a3b8; display: block;">
                {{ getAgentsUsing(conn.id).length }} agente(s) conectado(s)
              </span>
            </div>
          </div>
          <span class="conn-badge">{{ conn.http_method || 'NÓ' }}</span>
        </label>
      </div>
    </div>

    <!-- ABA 3: CRIAR NOVO NÓ -->
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
        placeholder="Descrição para a IA (ex: Consulta cotações na B3)"
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

      <div v-if="feedback" style="font-size: 11px; color: #38bdf8; margin-bottom: 8px;">
        {{ feedback }}
      </div>

      <button @click="submitNewConn" class="save-conn-btn">
        💾 Salvar Nó Fixo &amp; Conectar ao Agente
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  agent: any;
  catalog: any[];
  memoryCount: number;
  feedback: string;
  getMeta: (toolId: string) => any;
  getAgentsUsing: (toolId: string) => any[];
  isLinked: (toolId: string) => boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'toggle-tool', toolId: string): void;
  (e: 'create-tool', form: any): void;
}>();

const activeTab = ref<'connected' | 'saved' | 'create'>('connected');

const newConnForm = ref({
  icon: '🔌',
  label: '',
  description: '',
  http_method: 'GET',
  endpoint_url: '',
  auth_token: ''
});

function submitNewConn() {
  emit('create-tool', { ...newConnForm.value });
  newConnForm.value = {
    icon: '🔌',
    label: '',
    description: '',
    http_method: 'GET',
    endpoint_url: '',
    auth_token: ''
  };
}
</script>

<style scoped>
.agent-connections-popover {
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
  backdrop-filter: blur(12px);
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
.close-btn:hover {
  color: #fff;
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

.empty-connected-box {
  font-size: 11.5px;
  color: #94a3b8;
  padding: 12px;
  text-align: center;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 8px;
  border: 1px dashed #334155;
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
  cursor: pointer;
}

.conn-item.linked {
  border-color: rgba(56, 189, 248, 0.45);
}

.conn-badge {
  font-size: 10px;
  color: #38bdf8;
  background: rgba(15, 23, 42, 0.8);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
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
</style>