// Janela para atualizar e-mail e senha administrativa

<template>
  <div class="agent-connections-popover password-modal">
    <div class="popover-header">
      <strong style="color: #38bdf8; font-size: 13.5px;">🔐 Alterar Credenciais de Acesso</strong>
      <button @click="$emit('close')" class="close-btn" title="Fechar">✕</button>
    </div>
    <div class="popover-body">
      <label class="field-lbl">Novo E-mail de Login:</label>
      <input
        v-model="email"
        type="email"
        class="modal-input"
        placeholder="matheus_dullius@hotmail.com"
      />
      <label class="field-lbl">Nova Senha:</label>
      <input
        v-model="password"
        type="password"
        class="modal-input"
        placeholder="Digite a nova senha"
      />
      <div v-if="feedback" class="cred-feedback">
        {{ feedback }}
      </div>
      <button @click="submit" class="save-conn-btn" :disabled="isSaving">
        {{ isSaving ? 'Salvando...' : '💾 Salvar no Banco & .env' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  initialEmail?: string;
  feedback?: string;
  isSaving?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', payload: { email: string; password: string }): void;
}>();

const email = ref(props.initialEmail || 'matheus_dullius@hotmail.com');
const password = ref('');

function submit() {
  emit('save', {
    email: email.value.trim(),
    password: password.value.trim()
  });
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

.field-lbl {
  display: block;
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 4px;
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
</style>
