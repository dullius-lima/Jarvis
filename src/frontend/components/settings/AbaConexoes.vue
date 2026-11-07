<template>
  <section class="tab-section">
    <header class="section-header">
      <div>
        <h1>🔌 Cofre de Conexões Externas, E-mail, Mensageria &amp; IoT</h1>
        <p>Cadastre, teste em tempo real ou exclua credenciais para Brapi B3, Gmail, Outlook, WhatsApp, Telegram e APIs REST.</p>
      </div>
      <button @click="abrirModalNovaConexao" class="btn-primary">➕ Nova Conexão Externa</button>
    </header>

    <div class="agents-grid">
      <div v-for="conn in listaConexoes" :key="conn.provider_key" class="agent-card">
        <div class="agent-card-header">
          <div>
            <span class="agent-type-tag">{{ conn.category || 'Conector' }}</span>
            <h3>{{ conn.icon || '🔌' }} {{ conn.name }}</h3>
            <code class="slug-code">{{ conn.provider_key }}</code>
          </div>
          <input type="checkbox" v-model="conn.is_enabled" title="Habilitar/Desabilitar" />
        </div>

        <p class="agent-desc">{{ conn.description || 'Sem descrição.' }}</p>

        <div class="form-group">
          <label>API Key / Token de Acesso</label>
          <input type="password" v-model="conn.api_key" class="input-field" placeholder="Token ou Chave..." />
        </div>

        <div class="form-group">
          <label v-pre>Endpoint / URL (Aceita {{BASE_URL}}, {{query}})</label>
          <input type="text" v-model="conn.endpoint_url" class="input-field" placeholder="https://..." />
        </div>

        <div class="agent-card-actions">
          <button @click="testarConexaoExistente(conn)" class="btn-test" style="flex: 1;">
            ⚡ Testar
          </button>
          <button @click="salvarConexaoExterna(conn)" class="btn-primary" style="flex: 1;">
            💾 Salvar
          </button>
          <button
            @click="excluirConexaoDoCofre(conn.provider_key, conn.name)"
            class="btn-danger"
            title="Excluir Conexão"
          >
            🗑️
          </button>
        </div>

        <div v-if="feedbackConexoes[conn.provider_key]" class="connector-feedback-box">
          {{ feedbackConexoes[conn.provider_key] }}
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const listaConexoes = ref<any[]>([]);
const feedbackConexoes = ref<Record<string, string>>({});

function abrirModalNovaConexao() {
  const nome = prompt('Nome da nova Conexão Externa (ex: Brapi B3, Home Assistant):');
  if (!nome || !nome.trim()) return;

  const chave = nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const novaConn = {
    provider_key: chave,
    name: nome.trim(),
    category: 'Custom API',
    icon: '🔌',
    description: `Conexão externa ${nome.trim()}`,
    is_enabled: true,
    api_key: '',
    endpoint_url: ''
  };

  salvarConexaoExterna(novaConn);
}

async function buscarConexoesExternas() {
  try {
    const res = await fetch('/api/v1/connectors');
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      listaConexoes.value = json.data.map((row: any) => {
        const cfg = row.config || {};
        return {
          provider_key: row.provider_key,
          name: row.name,
          category: row.category || 'Custom Tool',
          icon: row.icon || '🔌',
          description: row.description || cfg.description || '',
          is_enabled: Boolean(row.is_enabled),
          api_key: row.api_key || cfg.api_key || cfg.auth_token || '',
          endpoint_url: row.endpoint_url || cfg.endpoint_url || ''
        };
      });
    }
  } catch {}
}

async function salvarConexaoExterna(conn: any) {
  try {
    const payload = {
      provider_key: conn.provider_key,
      name: conn.name,
      category: conn.category || 'Connector',
      icon: conn.icon || '🔌',
      description: conn.description || '',
      is_enabled: Boolean(conn.is_enabled),
      config: {
        api_key: conn.api_key || '',
        endpoint_url: conn.endpoint_url || '',
        auth_token: conn.api_key || '',
        description: conn.description || ''
      }
    };

    let res = await fetch('/api/v1/connectors', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok && res.status === 404) {
      res = await fetch('/api/v1/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    feedbackConexoes.value[conn.provider_key] = '💾 Conexão salva com sucesso!';
    setTimeout(() => {
      delete feedbackConexoes.value[conn.provider_key];
    }, 3500);

    await buscarConexoesExternas();
  } catch (err: any) {
    alert(`Erro ao salvar conector: ${err.message}`);
  }
}

async function testarConexaoExistente(conn: any) {
  feedbackConexoes.value[conn.provider_key] = '⏳ Testando conexão...';
  try {
    const res = await fetch('/api/v1/connectors/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider_key: conn.provider_key,
        testQuery: 'PETR4',
        config: {
          endpoint_url: conn.endpoint_url,
          api_key: conn.api_key,
          auth_token: conn.api_key
        }
      })
    });
    const json = await res.json();
    if (json.success) {
      feedbackConexoes.value[conn.provider_key] = `🟢 ${json.message || 'Conexão validada!'}`;
    } else {
      feedbackConexoes.value[conn.provider_key] = `🔴 ${json.error || 'Falha no teste.'}`;
    }
  } catch (err: any) {
    feedbackConexoes.value[conn.provider_key] = `🔴 Erro: ${err.message}`;
  }
}

async function excluirConexaoDoCofre(chaveProvedor: string, nome?: string) {
  if (!confirm(`Deseja realmente EXCLUIR a conexão "${nome || chaveProvedor}" permanentemente?`)) return;

  try {
    const res = await fetch(`/api/v1/connectors/${encodeURIComponent(chaveProvedor)}`, {
      method: 'DELETE'
    });
    const json = await res.json();

    if (json.success) {
      listaConexoes.value = listaConexoes.value.filter(
        (c) => c.provider_key.toLowerCase() !== chaveProvedor.toLowerCase()
      );
      alert(`🗑️ Conexão "${nome || chaveProvedor}" removida com sucesso!`);
    } else {
      alert(`Erro: ${json.error || 'Falha ao excluir conexão'}`);
    }
  } catch (err: any) {
    alert(`Erro de comunicação: ${err.message}`);
  }
}

onMounted(async () => {
  await buscarConexoesExternas();
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

.agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 310px), 1fr));
  gap: 18px;
}

.agent-card {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agent-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.agent-type-tag {
  font-size: 0.68rem;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  font-weight: 700;
}

.slug-code {
  font-size: 0.72rem;
  color: #64748b;
}

.agent-desc {
  font-size: 0.82rem;
  color: #94a3b8;
  margin: 0;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 0.78rem;
  color: #cbd5e1;
  font-weight: 600;
}

.input-field {
  width: 100%;
  padding: 10px 12px;
  background: #020617;
  border: 1px solid #334155;
  border-radius: 8px;
  color: #f8fafc;
  font-size: 0.85rem;
}

.agent-card-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.connector-feedback-box {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
  border: 1px solid #22c55e;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.8rem;
}

.btn-primary {
  background: #0284c7;
  color: white;
  border: none;
  padding: 9px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: bold;
}

.btn-test {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid #10b981;
  padding: 9px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: bold;
}

.btn-danger {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid #ef4444;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
}
</style>