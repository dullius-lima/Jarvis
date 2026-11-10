<!-- src/frontend/components/settings/AbaMemoria.vue -->
<template>
  <section class="tab-section">
    <header class="section-header">
      <div>
        <h1>🗂️ Arquitetura de Memória Neural em 3 Níveis</h1>
        <p>Inspecione e gerencie a retenção: Curto Prazo (Sessões), Médio Prazo (Episódica/Projetos) ou Longo Prazo (RAG Permanente).</p>
      </div>

      <div class="actions-row" style="margin: 0;">
        <button
          v-if="nivelMemoriaAtivo === 'medio'"
          @click="exibirModalNovaEpisodica = true"
          class="btn-primary"
        >
          ➕ Nova Memória Episódica
        </button>
        <button
          v-if="nivelMemoriaAtivo === 'longo'"
          @click="carregarMemoriasLongoPrazo"
          class="btn-secondary"
        >
          🔄 Recarregar RAG
        </button>
        <button
          v-if="nivelMemoriaAtivo === 'curto'"
          @click="buscarSessoesDeMemoria"
          class="btn-secondary"
        >
          🔄 Recarregar Sessões
        </button>
      </div>
    </header>

    <!-- SELETOR DAS 3 CAMADAS DE MEMÓRIA -->
    <div class="memory-tier-nav">
      <button
        @click="mudarNivelMemoria('curto')"
        :class="['tier-btn', { active: nivelMemoriaAtivo === 'curto' }]"
      >
        ⚡ Curto Prazo (Sessões Voláteis)
      </button>
      <button
        @click="mudarNivelMemoria('medio')"
        :class="['tier-btn', { active: nivelMemoriaAtivo === 'medio' }]"
      >
        ⏳ Médio Prazo (Episódica / 30 Dias)
      </button>
      <button
        @click="mudarNivelMemoria('longo')"
        :class="['tier-btn', { active: nivelMemoriaAtivo === 'longo' }]"
      >
        🏛️ Longo Prazo (RAG Permanente)
      </button>
    </div>

    <!-- 1. PAINEL DE CURTO PRAZO (SESSÕES DE CHAT / EXISTENTE) -->
    <div v-if="nivelMemoriaAtivo === 'curto'" class="memory-layout">
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

    <!-- 2. PAINEL DE MÉDIO PRAZO (EPISÓDICA / PROJETOS ATIVOS COM EXPIRAÇÃO) -->
    <div v-else-if="nivelMemoriaAtivo === 'medio'" class="card">
      <div class="tier-header-info">
        <div>
          <h3>⏳ Memórias Episódicas de Trabalho</h3>
          <p>Retenção programada para tarefas ativas, hábitos e contextos com expiração automática.</p>
        </div>
        <button @click="carregarMemoriasEpisodicas" class="btn-secondary">🔄 Atualizar Lista</button>
      </div>

      <div v-if="carregandoEpisodicas" class="empty-hint">⏳ Carregando memórias episódicas...</div>
      <div v-else-if="memoriasEpisodicas.length === 0" class="empty-hint">
        Nenhuma memória de médio prazo registrada no momento. Clique em "+ Nova Memória Episódica" acima para registrar.
      </div>

      <div v-else class="episodic-grid">
        <div v-for="item in memoriasEpisodicas" :key="item.id" class="episodic-card">
          <div class="episodic-card-header">
            <div>
              <span class="category-badge">{{ item.categoria || 'tarefa_ativa' }}</span>
              <h4>{{ item.titulo }}</h4>
            </div>
            <span class="expires-badge">⏳ Expira: {{ formatarData(item.expires_at) }}</span>
          </div>

          <p class="episodic-content">{{ item.conteudo }}</p>

          <div class="episodic-actions">
            <button @click="promoverParaLongoPrazo(item)" class="btn-test" title="Promover permanentemente para o RAG">
              🏛️ Promover para Longo Prazo
            </button>
            <button @click="excluirMemoriaEpisodica(item.id)" class="btn-danger">
              🗑️ Excluir
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. PAINEL DE LONGO PRAZO (RAG VETORIAL & PERMANENTE) -->
    <div v-else-if="nivelMemoriaAtivo === 'longo'" class="card">
      <div class="tier-header-info">
        <div>
          <h3>🏛️ Conhecimento Consolidado de Longo Prazo (RAG Permanente)</h3>
          <p>Base permanente de documentos e diretrizes salvos na tabela <code>vector_documents</code> do PostgreSQL.</p>
        </div>
      </div>

      <div v-if="carregandoLongoPrazo" class="empty-hint">⏳ Carregando banco permanente...</div>
      <div v-else-if="memoriasLongoPrazo.length === 0" class="empty-hint">
        Nenhum documento de longo prazo localizado na tabela vector_documents.
      </div>

      <div v-else class="long-term-grid">
        <div v-for="doc in memoriasLongoPrazo" :key="doc.id" class="long-term-card">
          <div class="episodic-card-header">
            <div>
              <span class="category-badge" style="background: rgba(34, 197, 94, 0.15); color: #4ade80;">
                {{ doc.category || 'permanente' }}
              </span>
              <h4>{{ doc.title || 'Documento Permanente #' + doc.id }}</h4>
            </div>
            <small style="color: #64748b;">{{ formatarData(doc.created_at) }}</small>
          </div>

          <p class="episodic-content">{{ doc.content }}</p>

          <div class="episodic-actions">
            <button @click="excluirDocumentoLongoPrazo(doc.id)" class="btn-danger">
              🗑️ Remover do RAG
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL PARA NOVA MEMÓRIA EPISÓDICA (MÉDIO PRAZO) -->
    <div v-if="exibirModalNovaEpisodica" class="modal-backdrop" @click.self="exibirModalNovaEpisodica = false">
      <div class="modal-card" style="max-width: 520px;">
        <div class="modal-header">
          <h2>➕ Nova Memória de Médio Prazo (Episódica)</h2>
          <button @click="exibirModalNovaEpisodica = false" class="close-modal-btn">✕</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label>Título / Assunto</label>
            <input type="text" v-model="novaEpisodica.titulo" class="input-field" placeholder="Ex: Projeto Reforma do Quarto" />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Categoria</label>
              <select v-model="novaEpisodica.categoria" class="input-field">
                <option value="tarefa_ativa">Tarefa Ativa</option>
                <option value="projeto">Projeto em Andamento</option>
                <option value="habito">Hábito / Rotina</option>
                <option value="contexto_semanal">Contexto Semanal</option>
              </select>
            </div>
            <div class="form-group" style="max-width: 140px;">
              <label>Validade (Dias)</label>
              <input type="number" v-model.number="novaEpisodica.dias" min="1" max="180" class="input-field" />
            </div>
          </div>

          <div class="form-group">
            <label>Conteúdo / Fatos a Memorizar</label>
            <textarea v-model="novaEpisodica.conteudo" rows="4" class="input-field" placeholder="Detalhes, orçamentos ou anotações temporárias..."></textarea>
          </div>
        </div>

        <div class="modal-footer">
          <button @click="exibirModalNovaEpisodica = false" class="btn-secondary">Cancelar</button>
          <button @click="salvarNovaMemoriaEpisodica" class="btn-primary">💾 Gravar no Médio Prazo</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';

type NivelMemoria = 'curto' | 'medio' | 'longo';
const nivelMemoriaAtivo = ref<NivelMemoria>('curto');

function mudarNivelMemoria(nivel: NivelMemoria) {
  nivelMemoriaAtivo.value = nivel;
  if (nivel === 'curto') buscarSessoesDeMemoria();
  if (nivel === 'medio') carregarMemoriasEpisodicas();
  if (nivel === 'longo') carregarMemoriasLongoPrazo();
}

// 1. Curto Prazo (Sessões)
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
  await fetch(`/api/v1/memory/sessions/${encodeURIComponent(idSessaoSelecionada.value)}`, { method: 'DELETE' });
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

// 2. Médio Prazo (Episódica)
const memoriasEpisodicas = ref<any[]>([]);
const carregandoEpisodicas = ref(false);
const exibirModalNovaEpisodica = ref(false);
const novaEpisodica = reactive({
  titulo: '',
  conteudo: '',
  categoria: 'tarefa_ativa',
  dias: 30
});

async function carregarMemoriasEpisodicas() {
  carregandoEpisodicas.value = true;
  try {
    const res = await fetch('/api/v1/connectors/query-db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'SELECT id, titulo, categoria, conteudo, created_at, expires_at FROM jarvis_episodic_memory ORDER BY created_at DESC LIMIT 50;'
      })
    });
    const json = await res.json();
    memoriasEpisodicas.value = json.rows || json.data || [];
  } catch (err) {
    console.warn('Falha ao buscar memórias episódicas:', err);
  } finally {
    carregandoEpisodicas.value = false;
  }
}

async function salvarNovaMemoriaEpisodica() {
  if (!novaEpisodica.titulo.trim() || !novaEpisodica.conteudo.trim()) {
    alert('Informe o título e o conteúdo.');
    return;
  }
  try {
    await fetch('/api/v1/connectors/query-db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `INSERT INTO jarvis_episodic_memory (categoria, titulo, conteudo, expires_at)
                VALUES ($1, $2, $3, NOW() + ($4 || ' days')::interval);`,
        params: [novaEpisodica.categoria, novaEpisodica.titulo.trim(), novaEpisodica.conteudo.trim(), novaEpisodica.dias]
      })
    });
    novaEpisodica.titulo = '';
    novaEpisodica.conteudo = '';
    exibirModalNovaEpisodica.value = false;
    await carregarMemoriasEpisodicas();
  } catch (err: any) {
    alert('Erro ao gravar: ' + err.message);
  }
}

async function promoverParaLongoPrazo(item: any) {
  if (!confirm(`Deseja promover permanentemente "${item.titulo}" para o RAG (Longo Prazo)?`)) return;
  try {
    await fetch('/api/v1/connectors/query-db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `INSERT INTO vector_documents (title, content, category) VALUES ($1, $2, 'permanente');`,
        params: [item.titulo, item.conteudo]
      })
    });
    alert('🏛️ Informação promovida com sucesso para a memória definitiva!');
  } catch (err: any) {
    alert('Erro ao promover: ' + err.message);
  }
}

async function excluirMemoriaEpisodica(id: number) {
  if (!confirm('Deseja excluir esta memória episódica?')) return;
  try {
    await fetch('/api/v1/connectors/query-db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'DELETE FROM jarvis_episodic_memory WHERE id = $1;',
        params: [id]
      })
    });
    await carregarMemoriasEpisodicas();
  } catch (err: any) {
    alert('Falha ao excluir: ' + err.message);
  }
}

// 3. Longo Prazo (RAG Permanente)
const memoriasLongoPrazo = ref<any[]>([]);
const carregandoLongoPrazo = ref(false);

async function carregarMemoriasLongoPrazo() {
  carregandoLongoPrazo.value = true;
  try {
    const res = await fetch('/api/v1/connectors/query-db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'SELECT id, title, category, content, created_at FROM vector_documents ORDER BY created_at DESC LIMIT 50;'
      })
    });
    const json = await res.json();
    memoriasLongoPrazo.value = json.rows || json.data || [];
  } catch (err) {
    console.warn('Falha ao buscar memórias de longo prazo:', err);
  } finally {
    carregandoLongoPrazo.value = false;
  }
}

async function excluirDocumentoLongoPrazo(id: number) {
  if (!confirm('Deseja remover este registro do RAG?')) return;
  try {
    await fetch('/api/v1/connectors/query-db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'DELETE FROM vector_documents WHERE id = $1;',
        params: [id]
      })
    });
    await carregarMemoriasLongoPrazo();
  } catch (err: any) {
    alert('Falha ao excluir: ' + err.message);
  }
}

function formatarData(dt: string) {
  if (!dt) return '-';
  try {
    return new Date(dt).toLocaleDateString('pt-BR');
  } catch {
    return dt;
  }
}

onMounted(async () => {
  await buscarSessoesDeMemoria();
});
</script>

<style scoped>
* { box-sizing: border-box; }
.section-header { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; border-bottom: 1px solid #1e293b; padding-bottom: 16px; }
.section-header h1 { margin: 0 0 6px 0; font-size: 1.35rem; }
.section-header p { margin: 0; color: #94a3b8; font-size: 0.88rem; }
.card { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 18px; }

/* SELETOR DAS 3 CAMADAS */
.memory-tier-nav { display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid #1e293b; padding-bottom: 12px; flex-wrap: wrap; }
.tier-btn { padding: 10px 16px; background: #0f172a; border: 1px solid #334155; border-radius: 8px; color: #cbd5e1; cursor: pointer; font-weight: bold; font-size: 0.85rem; }
.tier-btn.active { background: rgba(56, 189, 248, 0.15); border-color: #38bdf8; color: #38bdf8; }

.tier-header-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.tier-header-info h3 { margin: 0 0 4px 0; font-size: 1.1rem; }
.tier-header-info p { margin: 0; color: #94a3b8; font-size: 0.82rem; }

.memory-layout { display: grid; grid-template-columns: 300px 1fr; gap: 20px; }
.session-item { width: 100%; text-align: left; padding: 10px 12px; margin-bottom: 8px; background: #020617; border: 1px solid #1e293b; border-radius: 8px; color: #f8fafc; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
.session-item.active { border-color: #38bdf8; background: rgba(56, 189, 248, 0.1); }
.session-item small { color: #64748b; font-size: 0.7rem; }
.session-details-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }

.messages-list { display: flex; flex-direction: column; gap: 12px; }
.message-card { background: #020617; border: 1px solid #1e293b; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.msg-meta { display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; color: #38bdf8; }

.episodic-grid, .long-term-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 310px), 1fr)); gap: 16px; }
.episodic-card, .long-term-card { background: #020617; border: 1px solid #1e293b; border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.episodic-card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.category-badge { font-size: 0.68rem; padding: 2px 7px; border-radius: 4px; background: rgba(245, 158, 11, 0.15); color: #fbbf24; font-weight: bold; }
.expires-badge { font-size: 0.72rem; color: #f59e0b; }
.episodic-content { font-size: 0.85rem; color: #cbd5e1; margin: 0; line-height: 1.4; white-space: pre-wrap; }
.episodic-actions { display: flex; gap: 8px; margin-top: auto; }

.form-group { margin-bottom: 14px; display: flex; flex-direction: column; gap: 6px; }
.form-row { display: flex; gap: 12px; flex-wrap: wrap; }
.form-group label { font-size: 0.78rem; color: #cbd5e1; font-weight: 600; }
.input-field { width: 100%; padding: 8px 10px; background: #020617; border: 1px solid #334155; border-radius: 6px; color: #f8fafc; font-size: 0.85rem; }
.actions-row { display: flex; gap: 10px; }

.btn-primary { background: #0284c7; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.82rem; }
.btn-secondary { background: #1e293b; color: #e2e8f0; border: 1px solid #334155; padding: 7px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; }
.btn-danger { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid #ef4444; padding: 7px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; }
.btn-test { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid #10b981; padding: 7px 12px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.8rem; }
.btn-secondary-sm { background: #1e293b; color: #e2e8f0; border: 1px solid #334155; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; align-self: flex-start; }
.btn-danger-sm { background: transparent; color: #f87171; border: none; cursor: pointer; font-size: 0.85rem; }
.empty-hint { color: #64748b; font-size: 0.85rem; padding: 15px 0; }

.modal-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.78); display: flex; justify-content: center; align-items: center; padding: 12px; z-index: 100; }
.modal-card { background: #0f172a; border: 1px solid #334155; border-radius: 12px; width: 100%; max-height: 92dvh; display: flex; flex-direction: column; }
.modal-header, .modal-footer { padding: 14px 18px; border-bottom: 1px solid #1e293b; display: flex; justify-content: space-between; align-items: center; }
.modal-footer { border-top: 1px solid #1e293b; border-bottom: none; justify-content: flex-end; gap: 10px; }
.modal-body { padding: 18px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
.close-modal-btn { background: none; border: none; color: #94a3b8; font-size: 1.2rem; cursor: pointer; }

@media (max-width: 768px) {
  .memory-layout { grid-template-columns: 1fr; }
}
</style>
