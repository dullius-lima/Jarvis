<template>
  <section class="tab-section">
    <header class="section-header">
      <div>
        <h1>🔐 Segurança &amp; Credenciais de Acesso</h1>
        <p>Altere seu e-mail de login e senha. A alteração é gravada no PostgreSQL e no arquivo .env.</p>
      </div>
    </header>

    <div class="config-card">
      <div class="form-group">
        <label>E-mail Atual</label>
        <input type="email" v-model="formularioSeguranca.currentEmail" class="input-field" disabled />
      </div>

      <div class="form-group">
        <label>Novo E-mail de Login</label>
        <input
          type="email"
          v-model="formularioSeguranca.newEmail"
          class="input-field"
          placeholder="matheus_dulius@hotmail.com"
        />
      </div>

      <div class="form-group">
        <label>Nova Senha</label>
        <input
          type="password"
          v-model="formularioSeguranca.newPassword"
          class="input-field"
          placeholder="Digite a nova senha"
        />
      </div>

      <div v-if="feedbackSeguranca" class="feedback-box" :class="feedbackSeguranca.type">
        {{ feedbackSeguranca.message }}
      </div>

      <button @click="salvarCredenciaisAcesso" class="btn-primary full-width">
        💾 Salvar Novo Login e Senha
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';

const formularioSeguranca = reactive({
  currentEmail: localStorage.getItem('jarvis_authenticated_email') || 'matheus_dulius@hotmail.com',
  newEmail: '',
  newPassword: ''
});

const feedbackSeguranca = ref<{ type: string; message: string } | null>(null);

async function salvarCredenciaisAcesso() {
  feedbackSeguranca.value = null;
  try {
    const res = await fetch('/api/v1/auth/update-credentials', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentEmail: formularioSeguranca.currentEmail,
        newEmail: formularioSeguranca.newEmail,
        newPassword: formularioSeguranca.newPassword
      })
    });
    const data = await res.json();
    if (data.success) {
      formularioSeguranca.currentEmail =
        data.newEmail || formularioSeguranca.newEmail || formularioSeguranca.currentEmail;
      localStorage.setItem('jarvis_authenticated_email', formularioSeguranca.currentEmail);
      formularioSeguranca.newPassword = '';
      feedbackSeguranca.value = {
        type: 'success',
        message: '✅ Login e senha salvos no Banco e no .env com sucesso!'
      };
    } else {
      feedbackSeguranca.value = {
        type: 'error',
        message: '❌ ' + (data.error || 'Falha ao atualizar credenciais.')
      };
    }
  } catch (err: any) {
    feedbackSeguranca.value = { type: 'error', message: '❌ Erro: ' + err.message };
  }
}
</script>

<style scoped>
.section-header {
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

.config-card {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 24px;
  max-width: 520px;
}

.form-group {
  margin-bottom: 14px;
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

.full-width {
  width: 100%;
  margin-top: 14px;
}

.btn-primary {
  background: #0284c7;
  color: white;
  border: none;
  padding: 10px 18px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: bold;
}

.feedback-box {
  padding: 10px;
  border-radius: 6px;
  margin-top: 10px;
  font-size: 0.82rem;
}

.feedback-box.success {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
  border: 1px solid #22c55e;
}

.feedback-box.error {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid #ef4444;
}
</style>