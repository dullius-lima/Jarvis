<template>
  <section class="kg-cache-wrapper">
    <div class="panel-card">
      <div class="panel-header">
        <div>
          <h3>🕸️ Grafo de Conhecimento Relacional</h3>
          <p class="subtitle">
            Entidades e vínculos salvos pelo JARVIS ({{ nodes.length }} nós · {{ edges.length }} conexões)
          </p>
        </div>
        <div class="header-actions">
          <button @click="showAddForm = !showAddForm" class="btn-secondary">
            {{ showAddForm ? '✕ Fechar' : '➕ Novo' }}
          </button>
          <button @click="carregarTudo" class="btn-primary" :disabled="loading">
            {{ loading ? '⏳' : '🔄 Atualizar' }}
          </button>
        </div>
      </div>

      <div v-if="showAddForm" class="quick-form">
        <input v-model="novoVinculo.source" placeholder="Origem (ex: Matheus)" class="input-dark" />
        <input v-model="novoVinculo.relation" placeholder="Relação (ex: TRABALHA_EM)" class="input-dark" />
        <input v-model="novoVinculo.target" placeholder="Destino (ex: Hospital Unimed)" class="input-dark" />
        <input v-model="novoVinculo.endereco" placeholder="Endereço / atributo opcional" class="input-dark" />
        <button @click="adicionarVinculoManual" class="btn-success">💾 Salvar</button>
      </div>

      <input
        v-model="filtroGrafo"
        type="text"
        placeholder="🔍 Filtrar hospitais, pessoas, endereços ou relações..."
        class="input-dark search-bar"
      />

      <div v-if="edgesFiltradas.length > 0" class="subsection">
        <h4>🔗 Conexões Ativas</h4>
        <div class="list-grid">
          <div v-for="edge in edgesFiltradas" :key="'e-' + edge.id" class="item-card">
            <div class="triplet-line">
              <span class="node-pill">{{ edge.source_label }}</span>
              <span class="rel-badge">--[{{ edge.relation }}]--></span>
              <span class="node-pill target">{{ edge.target_label }}</span>
            </div>
            <div v-if="edge.target_props && Object.keys(edge.target_props).length" class="props-box">
              {{ formatarProps(edge.target_props) }}
            </div>
          </div>
        </div>
      </div>

      <div v-if="nodesFiltrados.length > 0" class="subsection">
        <h4>📍 Nós Registrados</h4>
        <div class="list-grid">
          <div v-for="node in nodesFiltrados" :key="node.entity_key" class="item-card">
            <div class="item-top">
              <div>
                <strong>{{ node.label }}</strong>
                <span class="type-tag">{{ node.entity_type }}</span>
              </div>
              <button @click="excluirNo(node.entity_key, node.label)" class="btn-danger-sm">🗑️</button>
            </div>
            <div v-if="node.properties && Object.keys(node.properties).length" class="props-box">
              {{ formatarProps(node.properties) }}
            </div>
          </div>
        </div>
      </div>

      <p v-if="!loading && nodes.length === 0" class="empty-msg">
        Nenhum nó registrado ainda.
      </p>
    </div>

    <div class="panel-card">
      <div class="panel-header">
        <div>
          <h3>⚡ Cache Semântico de Rotas</h3>
          <p class="subtitle">
            Atalhos diretos sem gastar tokens ({{ routes.length }} rotas · {{ totalHits }} hits)
          </p>
        </div>
        <button v-if="routes.length > 0" @click="limparTodoCache" class="btn-danger">
          🧹 Limpar
        </button>
      </div>

      <div v-if="routes.length > 0" class="list-grid">
        <div v-for="rt in routes" :key="rt.id" class="item-card">
          <div class="item-top">
            <span class="agent-badge">🤖 {{ rt.agent_name || rt.agent_slug }}</span>
            <div class="right-meta">
              <span class="hit-badge">⚡ {{ rt.hit_count }}x</span>
              <button @click="excluirRotaCache(rt.id)" class="btn-danger-sm">🗑️</button>
            </div>
          </div>
          <p class="prompt-sample">"{{ rt.prompt_sample }}"</p>
        </div>
      </div>

      <p v-else-if="!loading" class="empty-msg">
        Nenhuma rota em cache no momento.
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

const loading = ref(false);
const nodes = ref<any[]>([]);
const edges = ref<any[]>([]);
const routes = ref<any[]>([]);
const totalHits = ref(0);
const filtroGrafo = ref('');
const showAddForm = ref(false);
const novoVinculo = ref({ source: '', relation: '', target: '', endereco: '' });

const nodesFiltrados = computed(() => {
  const q = filtroGrafo.value.toLowerCase().trim();
  if (!q) return nodes.value;
  return nodes.value.filter((n) =>
    `${n.label} ${n.entity_type} ${JSON.stringify(n.properties || {})}`.toLowerCase().includes(q)
  );
});

const edgesFiltradas = computed(() => {
  const q = filtroGrafo.value.toLowerCase().trim();
  if (!q) return edges.value;
  return edges.value.filter((e) =>
    `${e.source_label} ${e.relation} ${e.target_label}`.toLowerCase().includes(q)
  );
});

function formatarProps(props: Record<string, any>): string {
  return Object.entries(props)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' · ');
}

async function carregarTudo() {
  loading.value = true;
  try {
    const [kgResp, rcResp] = await Promise.all([
      fetch('/api/v1/knowledge-graph').then((r) => r.json()).catch(() => ({})),
      fetch('/api/v1/route-cache').then((r) => r.json()).catch(() => ({}))
    ]);
    if (kgResp?.success) {
      nodes.value = kgResp.nodes || [];
      edges.value = kgResp.edges || [];
    }
    if (rcResp?.success) {
      routes.value = rcResp.routes || [];
      totalHits.value = rcResp.stats?.totalHits || 0;
    }
  } finally {
    loading.value = false;
  }
}

async function adicionarVinculoManual() {
  if (!novoVinculo.value.source.trim() || !novoVinculo.value.target.trim()) return;
  await fetch('/api/v1/knowledge-graph', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: novoVinculo.value.source.trim(),
      relation: novoVinculo.value.relation.trim() || 'relacionado_a',
      target: novoVinculo.value.target.trim(),
      targetProps: novoVinculo.value.endereco.trim() ? { endereco: novoVinculo.value.endereco.trim() } : {}
    })
  });
  novoVinculo.value = { source: '', relation: '', target: '', endereco: '' };
  showAddForm.value = false;
  await carregarTudo();
}

async function excluirNo(entityKey: string, label: string) {
  if (!confirm(`Remover "${label}" do grafo?`)) return;
  await fetch(`/api/v1/knowledge-graph/nodes/${encodeURIComponent(entityKey)}`, { method: 'DELETE' });
  await carregarTudo();
}

async function excluirRotaCache(id: number) {
  await fetch(`/api/v1/route-cache/${id}`, { method: 'DELETE' });
  await carregarTudo();
}

async function limparTodoCache() {
  if (!confirm('Limpar todas as rotas do Cache Semântico?')) return;
  await fetch('/api/v1/route-cache', { method: 'DELETE' });
  await carregarTudo();
}

onMounted(carregarTudo);
</script>

<style scoped>
.kg-cache-wrapper { display: flex; flex-direction: column; gap: 16px; margin: 18px 0; }
.panel-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 16px; }
.panel-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.panel-header h3 { margin: 0; font-size: 1rem; color: #38bdf8; }
.subtitle { margin: 4px 0 0 0; font-size: 0.78rem; color: #94a3b8; }
.header-actions { display: flex; gap: 8px; }
.subsection { margin-top: 14px; }
.subsection h4 { margin: 0 0 8px 0; font-size: 0.8rem; color: #cbd5e1; text-transform: uppercase; }
.quick-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-bottom: 12px; padding: 10px; background: #070b14; border-radius: 8px; border: 1px solid #334155; }
.input-dark { background: #070b14; border: 1px solid #334155; color: #f8fafc; padding: 8px 10px; border-radius: 6px; font-size: 0.82rem; width: 100%; }
.search-bar { margin-bottom: 8px; }
.list-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
.item-card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
.item-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.triplet-line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 0.82rem; }
.node-pill { background: #0f172a; color: #f8fafc; padding: 2px 8px; border-radius: 6px; border: 1px solid #475569; font-weight: 600; }
.node-pill.target { border-color: #38bdf8; color: #38bdf8; }
.rel-badge { font-family: monospace; font-size: 0.75rem; color: #22c55e; }
.type-tag { margin-left: 6px; font-size: 0.7rem; background: #0f172a; color: #38bdf8; padding: 2px 6px; border-radius: 4px; }
.props-box { font-size: 0.76rem; color: #cbd5e1; background: rgba(15, 23, 42, 0.7); padding: 6px 8px; border-radius: 6px; }
.agent-badge { font-size: 0.8rem; font-weight: 600; color: #38bdf8; }
.right-meta { display: flex; align-items: center; gap: 6px; }
.hit-badge { font-size: 0.72rem; background: rgba(34, 197, 94, 0.15); color: #4ade80; padding: 2px 7px; border-radius: 999px; }
.prompt-sample { margin: 0; font-size: 0.8rem; color: #e2e8f0; font-style: italic; }
.empty-msg { font-size: 0.82rem; color: #64748b; margin: 6px 0 0 0; }
.btn-primary { background: #0284c7; color: #fff; border: none; padding: 7px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600; }
.btn-secondary { background: #1e293b; color: #38bdf8; border: 1px solid #38bdf8; padding: 7px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600; }
.btn-success { background: #16a34a; color: #fff; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600; }
.btn-danger { background: rgba(239, 68, 68, 0.18); color: #f87171; border: 1px solid #ef4444; padding: 7px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 600; }
.btn-danger-sm { background: transparent; border: none; cursor: pointer; font-size: 0.85rem; }
</style>
