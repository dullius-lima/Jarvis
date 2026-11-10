<template>
  <div class="settings-layout">
    <!-- BARRA LATERAL / CABEÇALHO RESPONSIVO -->
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-icon">🧠</span>
        <div>
          <h2>JARVIS Core</h2>
          <span class="badge-sub">Painel Neural &amp; n8n</span>
        </div>
      </div>

      <nav class="nav-menu">
        <button
          @click="abaAtiva = 'brain'"
          :class="{ active: abaAtiva === 'brain' }"
          class="nav-item"
        >
          👑 Núcleo Fixo (JARVIS)
        </button>

        <button
          @click="abaAtiva = 'security'"
          :class="['nav-btn', { active: abaAtiva === 'security' }]"
        >
          🔐 Segurança &amp; Acesso
        </button>

        <button
          @click="abaAtiva = 'voices'"
          :class="{ active: abaAtiva === 'voices' }"
          class="nav-item"
        >
          🎙️ Vozes &amp; Voice Match
        </button>

        <button
          @click="abaAtiva = 'agents'"
          :class="{ active: abaAtiva === 'agents' }"
          class="nav-item"
        >
          🤖 Especialistas Dinâmicos
        </button>

        <button
          @click="abaAtiva = 'connectors'"
          :class="{ active: abaAtiva === 'connectors' }"
          class="nav-item"
        >
          🔌 Conexões Externas &amp; IoT
        </button>

        <button
          @click="abaAtiva = 'memory'"
          :class="{ active: abaAtiva === 'memory' }"
          class="nav-item"
        >
          🗂️ Memória Dinâmica (Sessões)
        </button>

        <button
          @click="abaAtiva = 'manual'"
          :class="{ active: abaAtiva === 'manual' }"
          class="nav-item"
        >
          📘 Manual de Operação
        </button>
      </nav>

      <div class="sidebar-footer">
        <a href="/" class="back-link">⬅ Voltar ao Cérebro 3D</a>
      </div>
    </aside>

    <!-- ÁREA DE CONTEÚDO PRINCIPAL (MODULARIZADA) -->
    <main class="content-area">
      <AbaCerebro v-if="abaAtiva === 'brain'" />
      <AbaSeguranca v-else-if="abaAtiva === 'security'" />
      <AbaVozes v-else-if="abaAtiva === 'voices'" />
      <AbaAgentes v-else-if="abaAtiva === 'agents'" />
      <AbaConexoes v-else-if="abaAtiva === 'connectors'" />
      <AbaMemoria v-else-if="abaAtiva === 'memory'" />
      <AbaManual v-else-if="abaAtiva === 'manual'" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

// IMPORTAÇÃO DOS COMPONENTES MODULARES
import AbaCerebro from './components/settings/AbaCerebro.vue';
import AbaSeguranca from './components/settings/AbaSeguranca.vue';
import AbaVozes from './components/settings/AbaVozes.vue';
import AbaAgentes from './components/settings/AbaAgentes.vue';
import AbaConexoes from './components/settings/AbaConexoes.vue';
import AbaMemoria from './components/settings/AbaMemoria.vue';
import AbaManual from './components/settings/AbaManual.vue';

// NOTA: A verificação de login foi desativada abaixo para permitir
// que você abra o settings.html diretamente sem ser redirecionado para a tela principal (/)!
// if (localStorage.getItem('jarvis_authenticated_session') !== 'true') {
//   window.location.href = '/';
// }

type TipoAba = 'brain' | 'security' | 'voices' | 'agents' | 'connectors' | 'memory' | 'manual';
const abasValidas: TipoAba[] = ['brain', 'security', 'voices', 'agents', 'connectors', 'memory', 'manual'];
const abaSalva = localStorage.getItem('jarvis_settings_tab') as TipoAba;
const abaInicial: TipoAba = abasValidas.includes(abaSalva) ? abaSalva : 'brain';

const abaAtiva = ref<TipoAba>(abaInicial);

watch(abaAtiva, (novaAba) => {
  localStorage.setItem('jarvis_settings_tab', novaAba);
});
</script>

<style scoped>
* {
  box-sizing: border-box;
}

.settings-layout {
  display: flex;
  min-height: 100dvh;
  width: 100%;
  max-width: 100vw;
  overflow-x: hidden;
  background: #070913;
  color: #f8fafc;
  font-family: system-ui, -apple-system, sans-serif;
}

.sidebar {
  width: 280px;
  flex-shrink: 0;
  background: #0f172a;
  border-right: 1px solid #1e293b;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-icon {
  font-size: 2rem;
}

.brand h2 {
  margin: 0;
  font-size: 1.15rem;
  color: #38bdf8;
}

.badge-sub {
  margin: 0;
  font-size: 0.75rem;
  color: #94a3b8;
}

.nav-menu {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nav-btn, .nav-item {
  text-align: left;
  padding: 12px 14px;
  background: transparent;
  color: #cbd5e1;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.nav-btn:hover, .nav-item:hover {
  background: #1e293b;
}

.nav-btn.active, .nav-item.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: #38bdf8;
  color: #38bdf8;
}

.sidebar-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.back-link {
  text-align: center;
  padding: 10px;
  background: #1e293b;
  color: #38bdf8;
  text-decoration: none;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: bold;
}

.content-area {
  flex: 1;
  min-width: 0;
  padding: 28px;
  overflow-y: auto;
  overflow-x: hidden;
}

@media (max-width: 768px) {
  .settings-layout {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid #1e293b;
    padding: 12px 14px;
    gap: 12px;
  }

  .brand {
    justify-content: space-between;
  }

  .nav-menu {
    flex-direction: row;
    overflow-x: auto;
    padding-bottom: 4px;
    gap: 8px;
    -webkit-overflow-scrolling: touch;
  }

  .nav-btn, .nav-item {
    white-space: nowrap;
    padding: 9px 12px;
    font-size: 0.78rem;
    flex-shrink: 0;
  }

  .sidebar-footer {
    margin-top: 0;
  }

  .back-link {
    width: 100%;
    padding: 8px;
    font-size: 0.8rem;
  }

  .content-area {
    padding: 14px;
  }
}
</style>
