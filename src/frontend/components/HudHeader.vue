//Barra de status superior, contadores e atalhos

<template>
  <header class="hud-header">
    <div class="hud-brand">
      <span class="pulse-dot"></span>
      <span class="hud-title">JARVIS NEURAL CORE</span>
      <span class="hud-badge">
        {{ agentsCount }} Agentes • {{ activeNodesCount }} Nós Fixos • {{ memoriesCount }} Memórias
      </span>
    </div>

    <div class="hud-actions">
      <button
        v-if="hasSelectionOrZoom"
        @click="$emit('reset-view')"
        class="hud-btn-secondary"
        title="Centralizar e voltar à visão global"
      >
        ✨ Enquadrar
      </button>
      <button
        @click="$emit('open-password')"
        class="hud-btn-secondary"
        title="Alterar Login e Senha"
      >
        🔐 Senha
      </button>
      <a href="/settings.html" class="hud-settings-btn">
        ⚙️ Configurações &amp; Agentes
      </a>
      <button
        @click="$emit('logout')"
        class="hud-btn-logout"
        title="Bloquear tela (Sair)"
      >
        🚪
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  agentsCount: number;
  activeNodesCount: number;
  memoriesCount: number;
  hasSelectionOrZoom: boolean;
}>();

defineEmits(['reset-view', 'open-password', 'logout']);
</script>

<style scoped>
.hud-header {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: linear-gradient(180deg, rgba(2, 6, 23, 0.9) 0%, rgba(2, 6, 23, 0) 100%);
  gap: 8px;
  flex-wrap: wrap;
}
.hud-brand { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: #22d3ee; box-shadow: 0 0 10px #22d3ee; }
.hud-title { font-weight: 800; font-size: 13px; letter-spacing: 1.2px; color: #f8fafc; }
.hud-badge { font-size: 11px; color: #38bdf8; background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(56, 189, 248, 0.35); padding: 3px 9px; border-radius: 999px; }
.hud-actions { display: flex; align-items: center; gap: 6px; }
.hud-btn-secondary, .hud-settings-btn, .hud-btn-logout {
  background: rgba(15, 23, 42, 0.88); border: 1px solid #334155; color: #f8fafc;
  padding: 6px 10px; border-radius: 8px; font-size: 11.5px; font-weight: 600;
  text-decoration: none; cursor: pointer;
}
</style>