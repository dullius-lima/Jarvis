<!-- src/frontend/views/BrainDashboard.vue -->
<template>
  <div class="brain-dashboard">
    <!-- BARRA LATERAL EXPANSÍVEL -->
    <aside :class="['sidebar', { collapsed: !isSidebarExpanded }]">
      <div class="sidebar-header">
        <button class="toggle-btn" @click="isSidebarExpanded = !isSidebarExpanded">
          {{ isSidebarExpanded ? '◀ Recolher' : '▶' }}
        </button>
        <span v-if="isSidebarExpanded" class="sidebar-title">🧠 Terminações Nervosas</span>
      </div>

      <ul class="node-list">
        <li
          v-for="node in terminalNodes"
          :key="node.id"
          class="node-item"
          @click="openNodeConfig(node)"
        >
          <span class="node-icon">{{ node.icon }}</span>
          <div v-if="isSidebarExpanded" class="node-details">
            <strong>{{ node.name }}</strong>
            <small>{{ node.paramValue }}</small>
          </div>
        </li>
      </ul>

      <div v-if="isSidebarExpanded" class="sidebar-footer">
        <a href="/settings.html" class="hub-link">⚙️ Abrir Central de Integrações</a>
      </div>
    </aside>

    <!-- ÁREA PRINCIPAL DO CÉREBRO E SINCRONIZAÇÃO -->
    <main class="main-area">
      <header class="top-bar">
        <h2>Ecossistema Neural — Sincronização em Curso</h2>
        <span class="sync-badge">🟢 Online & Sincronizado</span>
      </header>

      <div class="brain-stage">
        <div class="central-core">
          <div class="core-pulse">🧠</div>
          <p>Cérebro Central (JARVIS)</p>
        </div>

        <!-- Modal/Drawer de Configuração Rápida do Nó -->
        <div v-if="activeConfigNode" class="config-drawer">
          <div class="drawer-top">
            <h3>{{ activeConfigNode.icon }} {{ activeConfigNode.name }}</h3>
            <button @click="activeConfigNode = null">✖</button>
          </div>
          <label>Parâmetro Operacional:</label>
          <input v-model="activeConfigNode.paramValue" type="text" />
          <button class="save-btn" @click="activeConfigNode = null">Guardar</button>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref as vueRef } from 'vue';

const isSidebarExpanded = vueRef(true);
const activeConfigNode = vueRef<any>(null);

const terminalNodes = vueRef([
  { id: 1, name: 'Camada Sensorial (Voz/Visão)', icon: '🎤👁️', paramValue: 'Ativo - Whisper & Visão' },
  { id: 2, name: 'Analista Financeiro', icon: '📈', paramValue: 'Monitorando Ativos B3' },
  { id: 3, name: 'Memória Vetorial (RAG)', icon: '📚🧠', paramValue: 'PostgreSQL pgvector' },
  { id: 4, name: 'Home Assistant & IoT', icon: '🏠📡', paramValue: 'MQTT / REST Conectado' }
]);

function openNodeConfig(node: any) {
  activeConfigNode.value = node;
}
</script>

<style scoped>
.brain-dashboard {
  display: flex;
  height: 100vh;
  background: #070913;
  color: #f8fafc;
  font-family: system-ui, sans-serif;
}
.sidebar {
  width: 280px;
  background: #0f172a;
  border-right: 1px solid #1e293b;
  padding: 14px;
  display: flex;
  flex-direction: column;
  transition: width 0.25s ease;
}
.sidebar.collapsed {
  width: 68px;
}
.sidebar-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.toggle-btn {
  background: #1e293b;
  color: #38bdf8;
  border: 1px solid #334155;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
}
.sidebar-title {
  font-weight: 700;
  font-size: 0.9rem;
  color: #38bdf8;
}
.node-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}
.node-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  cursor: pointer;
}
.node-details strong {
  display: block;
  font-size: 0.8rem;
}
.node-details small {
  color: #94a3b8;
  font-size: 0.7rem;
}
.hub-link {
  color: #4ade80;
  text-decoration: none;
  font-size: 0.8rem;
}
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.top-bar {
  padding: 14px 24px;
  background: #0f172a;
  border-bottom: 1px solid #1e293b;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.top-bar h2 {
  margin: 0;
  font-size: 1rem;
}
.sync-badge {
  font-size: 0.8rem;
  color: #4ade80;
}
.brain-stage {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.central-core {
  text-align: center;
}
.core-pulse {
  font-size: 3.5rem;
}
.config-drawer {
  position: absolute;
  right: 20px;
  top: 20px;
  width: 300px;
  background: #0f172a;
  border: 1px solid #38bdf8;
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.drawer-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.config-drawer input {
  padding: 8px;
  background: #1e293b;
  border: 1px solid #334155;
  color: #fff;
  border-radius: 6px;
}
.save-btn {
  background: #0284c7;
  color: #fff;
  border: none;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}
</style>