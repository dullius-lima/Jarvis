<template>
  <div class="devices-container">
    <div class="devices-header">
      <div>
        <h2>📱 Dispositivos &amp; Códigos de Acesso</h2>
        <p>Gere códigos exclusivos na sua conta principal para vincular celulares, TVs, relógios e computadores.</p>
      </div>
      <button type="button" class="refresh-btn" @click="carregarDispositivos">🔄 Atualizar</button>
    </div>

    <!-- Formulário para gerar novo código de acesso (estilo Home Assistant) -->
    <div class="create-box">
      <h3>➕ Criar Novo Dispositivo / Gerar Código de Acesso</h3>
      <div class="create-grid">
        <div class="form-row">
          <label>Nome do Dispositivo</label>
          <input
            v-model="novo.custom_name"
            type="text"
            placeholder="Ex: Galaxy S25 (Principal), Celular Esposa, TV Sala..."
            class="field-input"
          />
        </div>
        <div class="form-row">
          <label>Tipo de Aparelho</label>
          <select v-model="novo.device_type" class="field-input">
            <option value="phone">📱 Celular</option>
            <option value="tv">📺 Smart TV</option>
            <option value="watch">⌚ Relógio</option>
            <option value="pc">💻 PC / Notebook</option>
            <option value="tablet">📟 Tablet</option>
          </select>
        </div>
        <div class="form-row">
          <label>Perfil / Dono</label>
          <input
            v-model="novo.owner_profile"
            type="text"
            placeholder="Ex: Matheus-Admin, Esposa..."
            class="field-input"
          />
        </div>
      </div>

      <div class="create-footer">
        <label class="check-primary">
          <input type="checkbox" v-model="novo.is_primary" />
          <span>👑 Definir como Dispositivo da Conta Principal (Admin)</span>
        </label>
        <button type="button" class="btn-generate" :disabled="criando" @click="gerarNovoCodigo">
          {{ criando ? 'Gerando...' : '🔑 Gerar Código de Acesso' }}
        </button>
      </div>
      <div v-if="erroCriacao" class="err-msg">{{ erroCriacao }}</div>
    </div>

    <div v-if="dispositivos.length === 0" class="empty-box">
      Nenhum dispositivo cadastrado ainda. Use o quadro acima para gerar o código do seu celular principal e dos demais aparelhos.
    </div>

    <div class="devices-grid">
      <div
        v-for="dev in dispositivos"
        :key="dev.device_id"
        class="device-card"
        :class="{ pending: dev.status === 'awaiting_pair', blocked: dev.status === 'blocked' }"
      >
        <div class="card-top">
          <div class="status-pills">
            <span class="online-pill" :class="{ on: dev.online }">
              {{ dev.online ? '🟢 Online' : '⚫ Offline' }}
            </span>
            <span class="auth-pill" :class="dev.status">
              {{ dev.status === 'approved' ? '✅ Pareado' : dev.status === 'blocked' ? '🚫 Bloqueado' : '⏳ Aguardando Código' }}
            </span>
            <span v-if="dev.is_primary" class="primary-pill">👑 Conta Principal</span>
          </div>
        </div>

        <!-- Caixa com o Código de Acesso para digitar no aparelho -->
        <div class="token-box">
          <div>
            <span class="token-label">CÓDIGO DE ACESSO DO APARELHO</span>
            <div class="token-code">{{ dev.pairing_code || '—' }}</div>
          </div>
          <button type="button" class="btn-copy" @click="copiarCodigo(dev)">
            {{ copiadoId === dev.device_id ? '✅ Copiado!' : '📋 Copiar' }}
          </button>
        </div>

        <div class="meta-line">
          <span>Hardware: <strong>{{ dev.model_info || 'Aguardando 1º acesso' }}</strong></span>
          <span>• ID: <code>{{ dev.device_id }}</code></span>
        </div>

        <div class="form-row">
          <label>Nome do Dispositivo</label>
          <input v-model="dev.custom_name" type="text" class="field-input" />
        </div>

        <div class="two-cols">
          <div class="form-row">
            <label>Tipo</label>
            <select v-model="dev.device_type" class="field-input">
              <option value="phone">📱 Celular</option>
              <option value="tv">📺 Smart TV</option>
              <option value="watch">⌚ Relógio</option>
              <option value="pc">💻 PC / Notebook</option>
              <option value="tablet">📟 Tablet</option>
            </select>
          </div>
          <div class="form-row">
            <label>Perfil / Dono</label>
            <input v-model="dev.owner_profile" type="text" class="field-input" />
          </div>
        </div>

        <div class="actions-row">
          <button type="button" class="btn-save" @click="salvarDispositivo(dev)">💾 Salvar</button>
          <button type="button" class="btn-regen" @click="renovarCodigo(dev)" title="Revoga o acesso atual e gera novo código">🔄 Novo Código</button>
          <button
            v-if="dev.status === 'approved' && !dev.is_primary"
            type="button"
            class="btn-block"
            @click="alterarStatus(dev, 'blocked')"
          >
            🚫 Bloquear
          </button>
          <button
            v-if="dev.status === 'blocked'"
            type="button"
            class="btn-approve"
            @click="alterarStatus(dev, 'approved')"
          >
            ✅ Reativar
          </button>
          <button
            v-if="!dev.is_primary"
            type="button"
            class="btn-del"
            title="Excluir dispositivo"
            @click="excluirDispositivo(dev)"
          >
            🗑️
          </button>
        </div>

        <div v-if="feedback[dev.device_id]" class="feedback-msg">
          {{ feedback[dev.device_id] }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const dispositivos = ref<any[]>([]);
const feedback = ref<Record<string, string>>({});
const copiadoId = ref<string>('');
const criando = ref(false);
const erroCriacao = ref('');
const novo = ref({
  custom_name: '',
  device_type: 'phone',
  owner_profile: 'Matheus-Admin',
  is_primary: true
});
let timer: any = null;

async function carregarDispositivos() {
  try {
    const r = await fetch('/api/v1/devices');
    const j = await r.json();
    if (j.success && Array.isArray(j.data)) {
      const edicoesLocais = new Map(dispositivos.value.map((d) => [d.device_id, d]));
      dispositivos.value = j.data.map((srv: any) => {
        const prev = edicoesLocais.get(srv.device_id);
        return prev ? { ...srv, custom_name: prev.custom_name, device_type: prev.device_type, owner_profile: prev.owner_profile } : srv;
      });
      if (dispositivos.value.some((d) => d.is_primary)) {
        novo.value.is_primary = false;
      }
    }
  } catch {}
}

async function gerarNovoCodigo() {
  erroCriacao.value = '';
  if (!novo.value.custom_name.trim()) {
    erroCriacao.value = 'Digite um nome para o dispositivo (ex: Galaxy S25 Principal).';
    return;
  }
  criando.value = true;
  try {
    const r = await fetch('/api/v1/devices/create-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(novo.value)
    });
    const j = await r.json();
    if (j.success) {
      novo.value.custom_name = '';
      await carregarDispositivos();
    } else {
      erroCriacao.value = j.error || 'Falha ao gerar código.';
    }
  } catch (e: any) {
    erroCriacao.value = e.message;
  } finally {
    criando.value = false;
  }
}

async function copiarCodigo(dev: any) {
  if (!dev.pairing_code) return;
  try {
    await navigator.clipboard.writeText(dev.pairing_code);
  } catch {}
  copiadoId.value = dev.device_id;
  setTimeout(() => { if (copiadoId.value === dev.device_id) copiadoId.value = ''; }, 2500);
}

async function salvarDispositivo(dev: any) {
  feedback.value[dev.device_id] = 'Salvando...';
  try {
    const r = await fetch(`/api/v1/devices/${encodeURIComponent(dev.device_id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        custom_name: dev.custom_name,
        device_type: dev.device_type,
        owner_profile: dev.owner_profile,
        status: dev.status
      })
    });
    const j = await r.json();
    feedback.value[dev.device_id] = j.success ? '✅ Salvo!' : `❌ ${j.error}`;
    setTimeout(() => delete feedback.value[dev.device_id], 2500);
    await carregarDispositivos();
  } catch (e: any) {
    feedback.value[dev.device_id] = `❌ ${e.message}`;
  }
}

async function renovarCodigo(dev: any) {
  if (!confirm(`Gerar um novo código para "${dev.custom_name}"? O aparelho precisará digitar o novo código para reconectar.`)) return;
  const r = await fetch(`/api/v1/devices/${encodeURIComponent(dev.device_id)}/regenerate-code`, { method: 'POST' });
  const j = await r.json();
  if (j.success) {
    feedback.value[dev.device_id] = '🔑 Novo código gerado!';
    await carregarDispositivos();
  }
}

async function alterarStatus(dev: any, novoStatus: 'approved' | 'blocked') {
  dev.status = novoStatus;
  await salvarDispositivo(dev);
}

async function excluirDispositivo(dev: any) {
  if (!confirm(`Excluir "${dev.custom_name}"?`)) return;
  await fetch(`/api/v1/devices/${encodeURIComponent(dev.device_id)}`, { method: 'DELETE' });
  dispositivos.value = dispositivos.value.filter((d) => d.device_id !== dev.device_id);
}

onMounted(() => {
  carregarDispositivos();
  timer = setInterval(carregarDispositivos, 5000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.devices-container { display: flex; flex-direction: column; gap: 16px; color: #f8fafc; }
.devices-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; border-bottom: 1px solid #1e293b; padding-bottom: 14px; }
.devices-header h2 { margin: 0; font-size: 1.25rem; color: #38bdf8; }
.devices-header p { margin: 4px 0 0; font-size: 0.84rem; color: #94a3b8; }
.refresh-btn { background: #1e293b; color: #38bdf8; border: 1px solid #334155; border-radius: 8px; padding: 8px 14px; font-weight: 700; cursor: pointer; }
.create-box { background: #0f172a; border: 1.5px solid #0284c7; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.create-box h3 { margin: 0; font-size: 1rem; color: #38bdf8; }
.create-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
.create-footer { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.check-primary { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; color: #e2e8f0; cursor: pointer; }
.btn-generate { background: linear-gradient(135deg, #0284c7, #2563eb); color: #fff; border: none; border-radius: 8px; padding: 9px 16px; font-weight: 800; cursor: pointer; }
.err-msg { color: #f87171; font-size: 0.8rem; }
.empty-box { padding: 22px; text-align: center; background: #0f172a; border: 1px dashed #334155; border-radius: 12px; color: #94a3b8; font-size: 0.85rem; }
.devices-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); gap: 16px; }
.device-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.device-card.pending { border-color: #f59e0b; }
.device-card.blocked { border-color: #ef4444; opacity: 0.85; }
.status-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.online-pill, .auth-pill, .primary-pill { font-size: 0.72rem; padding: 2px 8px; border-radius: 999px; font-weight: 700; background: #1e293b; color: #94a3b8; }
.online-pill.on { background: rgba(16, 185, 129, 0.15); color: #34d399; }
.auth-pill.approved { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
.auth-pill.awaiting_pair { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
.auth-pill.blocked { background: rgba(239, 68, 68, 0.2); color: #f87171; }
.primary-pill { background: rgba(168, 85, 247, 0.2); color: #d8b4fe; }
.token-box { display: flex; justify-content: space-between; align-items: center; background: #020617; border: 1px dashed #38bdf8; border-radius: 10px; padding: 10px 12px; }
.token-label { display: block; font-size: 0.65rem; letter-spacing: 1px; color: #94a3b8; font-weight: 700; }
.token-code { font-family: monospace; font-size: 1.15rem; font-weight: 900; letter-spacing: 1.5px; color: #22d3ee; margin-top: 2px; }
.btn-copy { background: #1e293b; color: #e0f2FE; border: 1px solid #38bdf8; border-radius: 8px; padding: 6px 10px; font-size: 0.78rem; font-weight: 700; cursor: pointer; }
.meta-line { font-size: 0.76rem; color: #94a3b8; display: flex; gap: 6px; flex-wrap: wrap; }
.form-row { display: flex; flex-direction: column; gap: 4px; }
.form-row label { font-size: 0.75rem; color: #cbd5e1; font-weight: 600; }
.field-input { width: 100%; padding: 8px 10px; background: #020617; border: 1px solid #334155; border-radius: 8px; color: #f8fafc; font-size: 0.84rem; }
.two-cols { display: grid; grid-template-columns: 1fr 1.3fr; gap: 10px; }
.actions-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
.btn-save { flex: 1; padding: 7px 10px; background: #0284c7; color: #fff; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; }
.btn-regen { padding: 7px 10px; background: #1e293b; color: #fcd34d; border: 1px solid #475569; border-radius: 8px; font-weight: 700; cursor: pointer; }
.btn-approve { padding: 7px 10px; background: #10b981; color: #022c22; border: none; border-radius: 8px; font-weight: 800; cursor: pointer; }
.btn-block { padding: 7px 10px; background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid #ef4444; border-radius: 8px; font-weight: 700; cursor: pointer; }
.btn-del { padding: 7px 10px; background: #1e293b; color: #94a3b8; border: 1px solid #334155; border-radius: 8px; cursor: pointer; }
.feedback-msg { font-size: 0.78rem; color: #34d399; background: rgba(16, 185, 129, 0.12); padding: 6px 10px; border-radius: 6px; }
</style>
