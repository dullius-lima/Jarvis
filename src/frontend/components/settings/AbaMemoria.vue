<template>
  <section class="tab-section">
    <header class="section-header">
      <div>
        <h1>🗂️ Memória Conversacional &amp; Contexto por Sessão</h1>
        <p>Inspecione, edite ou exporte as memórias ativas do JARVIS e dos Especialistas.</p>
      </div>
      <button @click="buscarSessoesDeMemoria" class="btn-secondary">🔄 Recarregar Sessões</button>
    </header>

    <div class="memory-layout">
      <!-- LISTA DE SESSÕES -->
      <div class="sessions-list card">
        <h3>Sessões Ativas</h3>
        <div v-if="sessoesMemoria.length === 0" class="empty-hint">Nenhuma sessão registrada ainda.</div>
        <button
          v-for="s in sessoesMemoria"
          :key="s.session_id"
          @click="selecionarSessaoDeMemoria(s.session_id)"
          :class="['session-item', { active: idSessaoSelecionada === s.session_id }]"
        >
          <strong>{{ s.session_id }}</strong>
          <small>{{ s.message_count || s.total_messages || 0 }} msg(s)</small>
        </button>
      </div>

      <!-- DETALHES DA SESSÃO SELECIONADA -->
      <div class="session-details card">
        <div v-if="!idSessaoSelecionada" class="empty-hint">
          Selecione uma sessão ao lado para inspecionar o histórico.
        </div>
        <div v-else>
          <div class="session-details-header">
            <h3>Histórico: {{ idSessaoSelecionada }}</h3>
            <div class="actions-row" style="margin: 0;">
              <button @click="exportarSessaoParaJson" class="btn-secondary">📥 Exportar JSON</button>
              <button @click="limparSessaoSelecionada" class="btn-danger">🧹 Limpar Sessão</button>
            </div>
          </div>

          <div class="messages-list">
            <div v-for="msg in mensagensDaSessao" :key="msg.id" class="message-card">
              <div class="msg-meta">
                <strong>{{ (msg.role || 'assistant').toUpperCase() }}</strong>
                <button @click="excluirMensagemIndividual(msg.id)" class="btn-danger-sm">✕</button>
              </div>
              <textarea v-model="msg.content" rows="2" class="input-field"></textarea>
              <button @click="salvarMensagemEditada(msg)" class="btn-secondary-sm">💾 Salvar Edição</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const sessoesMemoria = ref<any[]>([]);
const idSessaoSelecionada = ref<string | null>(null);
const mensagensDaSessao = ref<any[]>([]);

async function buscarSessoesDeMemoria() {
  try {
    const res = await fetch('/api/v1/memory/sessions');
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      sessoesMemoria.value = json.data;
    }
  } catch {}
}

async function selecionarSessaoDeMemoria(sessionId: string) {
  idSessaoSelecionada.value = sessionId;
  try {
    const res = await fetch(`/api/v1/memory/sessions/${encodeURIComponent(sessionId)}`);
    const json = await res.json();
    mensagensDaSessao.value = Array.isArray(json.data)
      ? json.data
      : json.data?.messages || json.chatHistory || json.messages || [];
  } catch {}
}

async function salvarMensagemEditada(msg: any) {
  await fetch(`/api/v1/memory/messages/${msg.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: msg.content })
  });
}

async function excluirMensagemIndividual(id: number) {
  await fetch(`/api/v1/memory/messages/${id}`, { method: 'DELETE' });
  if (idSessaoSelecionada.value) await selecionarSessaoDeMemoria(idSessaoSelecionada.value);
}

async function limparSessaoSelecionada() {
  if (!idSessaoSelecionada.value) return;
  await fetch(`/api/v1/memory/sessions/${encodeURIComponent(idSessaoSelecionada.value)}`, {
    method: 'DELETE'
  });
  idSessaoSelecionada.value = null;
  mensagensDaSessao.value = [];
  await buscarSessoesDeMemoria();
}

function exportarSessaoParaJson() {
  const blob = new Blob([JSON.stringify(mensagensDaSessao.value, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `session_${idSessaoSelecionada.value}.json`;
  a.click();
}

onMounted(async () => {
  await buscarSessoesDeMemoria();
});
</script>

<style scoped>
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 24px;
  border-bottom: 1px solid #1e293b;
  padding-bottom: 16px;
}

.section-header h1 {
  margin: 0 0 6px 0;
  font-size: 1.35rem;
}

.section-header p {
  margin: 0;
  color: #94a3b8;
  font-size: 0.88rem;
}

.memory-layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 20px;
}

.card {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 18px;
}

.session-item {
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: #020617;
  border: 1px solid #1e293b;
  border-radius: 8px;
  color: #f8fafc;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.session-item.active {
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.1);
}

.session-item small {
  color: #64748b;
  font-size: 0.7rem;
}

.session-details-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message-card {
  background: #020617;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.msg-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.input-field {
  width: 100%;
  padding: 8px 10px;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  color: #f8fafc;
  font-size: 0.85rem;
}

.actions-row {
  display: flex;
  gap: 10px;
}

.btn-secondary {
  background: #1e293b;
  color: #e2e8f0;
  border: 1px solid #334155;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
}

.btn-secondary-sm {
  align-self: flex-end;
  background: #0284c7;
  color: white;
  border: none;
  padding: 5px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.75rem;
}

.btn-danger {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid #ef4444;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
}

.btn-danger-sm {
  background: transparent;
  color: #f87171;
  border: 1px solid #ef4444;
  padding: 2px 7px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.75rem;
}

.empty-hint {
  color: #64748b;
  font-size: 0.85rem;
  padding: 15px 0;
}

@media (max-width: 1024px) {
  .memory-layout {
    grid-template-columns: 1fr;
  }
}
</style>