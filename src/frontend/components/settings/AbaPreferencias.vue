<template>
  <div class="prefs-container">
    <div class="prefs-header">
      <div>
        <h2>🎛️ Modos de Operação &amp; Preferências</h2>
        <p>Escolha como o JARVIS se comporta na tela, no áudio e no consumo de bateria.</p>
      </div>
      <span v-if="statusMsg" class="save-badge">{{ statusMsg }}</span>
    </div>

    <div class="presets-row">
      <button type="button" class="preset-btn" @click="aplicarPerfil('full24h')">⚡ Modo 24h Completo</button>
      <button type="button" class="preset-btn" @click="aplicarPerfil('unlockedOnly')">🔓 Só Celular Desbloqueado</button>
      <button type="button" class="preset-btn" @click="aplicarPerfil('screenOnly')">🔋 Só App Aberto</button>
      <button type="button" class="preset-btn" @click="aplicarPerfil('meeting')">🤫 Reunião / Privacidade</button>
    </div>

    <section class="prefs-card">
      <h3>🔋 Energia &amp; Captação de Áudio</h3>

      <label class="toggle-row">
        <div>
          <strong>Manter áudio ligado com a tela desligada</strong>
          <span>Permite chamar "Jarvis" mesmo com o celular bloqueado no bolso.</span>
        </div>
        <input type="checkbox" v-model="prefs.listen_screen_off" :disabled="prefs.listen_only_app_open || prefs.push_to_talk_only" @change="salvar" />
      </label>

            <label class="toggle-row">
        <div>
          <strong>Funcionar áudio apenas com o celular desbloqueado</strong>
          <span>Pausa o microfone na tela de bloqueio ou no bolso; ouve em qualquer app enquanto estiver desbloqueado.</span>
        </div>
        <input type="checkbox" v-model="prefs.listen_only_unlocked" :disabled="prefs.listen_only_app_open || prefs.push_to_talk_only" @change="aoMudarSoDesbloqueado" />
      </label>

      <label class="toggle-row">
        <div>
          <strong>Funcionar áudio apenas com o aplicativo aberto</strong>
          <span>Pausa o microfone em segundo plano assim que você sai do app.</span>
        </div>
        <input type="checkbox" v-model="prefs.listen_only_app_open" @change="aoMudarSoAppAberto" />
      </label>

      <label class="toggle-row">
        <div>
          <strong>Ativar somente por botão (Push-to-Talk)</strong>
          <span>Desliga a escuta da palavra "Jarvis"; ouve apenas ao tocar no Globo ou botão.</span>
        </div>
        <input type="checkbox" v-model="prefs.push_to_talk_only" @change="salvar" />
      </label>
    </section>

    <section class="prefs-card">
      <h3>🎙️ Diálogo &amp; Sensibilidade</h3>

      <div class="toggle-row">
        <div>
          <strong>Conversa contínua após resposta</strong>
          <span>Mantém o microfone aberto por alguns segundos sem repetir "Jarvis".</span>
        </div>
        <select v-model.number="prefs.continuous_chat_seconds" @change="salvar" class="mini-select">
          <option :value="0">Desativado (Sempre exigir "Jarvis")</option>
          <option :value="15">15 segundos</option>
          <option :value="25">25 segundos</option>
        </select>
      </div>

      <div class="toggle-row">
        <div>
          <strong>Sensibilidade do microfone</strong>
          <span>Ajuste conforme o barulho do ambiente.</span>
        </div>
        <select v-model="prefs.mic_sensitivity" @change="salvar" class="mini-select">
          <option value="high">Alta (Silêncio / Longe)</option>
          <option value="balanced">Equilibrada (Padrão)</option>
          <option value="noisy">Anti-Ruído (TV / Carro)</option>
        </select>
      </div>

      <div class="toggle-row">
        <div>
          <strong>Motor de compreensão (Whisper)</strong>
          <span>Equilibre velocidade na rede móvel ou precisão máxima.</span>
        </div>
        <select v-model="prefs.whisper_model" @change="salvar" class="mini-select">
          <option value="tiny">Ultra-Rápido (tiny)</option>
          <option value="small">Alta Precisão (small)</option>
        </select>
      </div>
    </section>

    <section class="prefs-card">
      <h3>✨ Feedback Visual, Som &amp; Privacidade</h3>

      <label class="toggle-row">
        <div>
          <strong>Brilho luminoso nas bordas da tela</strong>
          <span>Exibe a aura neon ao redor da tela quando o JARVIS é acionado.</span>
        </div>
        <input type="checkbox" v-model="prefs.edge_glow_enabled" @change="salvar" />
      </label>

      <label class="toggle-row">
        <div>
          <strong>Acender tela automaticamente ao chamar</strong>
          <span>Desperta o visor se o celular estiver bloqueado na mesa.</span>
        </div>
        <input type="checkbox" v-model="prefs.wake_screen_on_call" @change="salvar" />
      </label>

      <label class="toggle-row">
        <div>
          <strong>Sinais sonoros de confirmação (Bipes)</strong>
          <span>Emite o bipe curto ao reconhecer o chamado.</span>
        </div>
        <input type="checkbox" v-model="prefs.chime_enabled" @change="salvar" />
      </label>

      <label class="toggle-row">
        <div>
          <strong>Modo silencioso (Responder só por texto)</strong>
          <span>Silencia a voz nos alto-falantes sem desligar os comandos.</span>
        </div>
        <input type="checkbox" v-model="prefs.silent_text_only" @change="salvar" />
      </label>

      <label class="toggle-row">
        <div>
          <strong>Trava de privacidade (Câmera e leitura de tela)</strong>
          <span>Impede abertura automática da câmera e leitura da tela por voz.</span>
        </div>
        <input type="checkbox" v-model="prefs.privacy_lock_camera" @change="salvar" />
      </label>
    </section>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';

const statusMsg = ref('');
const prefs = reactive({
  listen_screen_off: true,
  listen_only_unlocked: false,
  listen_only_app_open: false,
  push_to_talk_only: false,
  continuous_chat_seconds: 0,
  mic_sensitivity: 'balanced',
  silent_text_only: false,
  edge_glow_enabled: true,
  wake_screen_on_call: true,
  chime_enabled: true,
  privacy_lock_camera: false,
  whisper_model: 'small'
});

onMounted(async () => {
  try {
    const r = await fetch('/api/v1/preferences');
    const j = await r.json();
    if (j.success && j.data) Object.assign(prefs, j.data);
  } catch {}
});

function aoMudarSoDesbloqueado() {
  if (prefs.listen_only_unlocked) prefs.listen_screen_off = false;
  salvar();
}

function aoMudarSoAppAberto() {
  if (prefs.listen_only_app_open) {
    prefs.listen_screen_off = false;
    prefs.listen_only_unlocked = false;
  }
  salvar();
}

function aplicarPerfil(tipo: 'full24h' | 'unlockedOnly' | 'screenOnly' | 'meeting') {
  if (tipo === 'full24h') {
    Object.assign(prefs, {
      listen_screen_off: true,
      listen_only_unlocked: false,
      listen_only_app_open: false,
      push_to_talk_only: false,
      silent_text_only: false,
      edge_glow_enabled: true,
      chime_enabled: true
    });
  } else if (tipo === 'unlockedOnly') {
    Object.assign(prefs, {
      listen_screen_off: false,
      listen_only_unlocked: true,
      listen_only_app_open: false,
      push_to_talk_only: false,
      wake_screen_on_call: false
    });
  } else if (tipo === 'screenOnly') {
    Object.assign(prefs, {
      listen_screen_off: false,
      listen_only_app_open: true,
      push_to_talk_only: false,
      wake_screen_on_call: false
    });
  } else if (tipo === 'meeting') {
    Object.assign(prefs, {
      listen_screen_off: false,
      listen_only_app_open: true,
      push_to_talk_only: true,
      silent_text_only: true,
      chime_enabled: false,
      privacy_lock_camera: true
    });
  }
  salvar();
}

async function salvar() {
  statusMsg.value = 'Salvando...';
  try {
    await fetch('/api/v1/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs)
    });
    localStorage.setItem('jarvis_user_prefs', JSON.stringify(prefs));
    statusMsg.value = '✅ Aplicado';
    setTimeout(() => (statusMsg.value = ''), 2000);
  } catch {
    statusMsg.value = '⚠️ Erro ao salvar';
  }
}
</script>

<style scoped>
.prefs-container { display: flex; flex-direction: column; gap: 14px; color: #e2e8f0; }
.prefs-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.prefs-header h2 { margin: 0; font-size: 1.15rem; color: #38bdf8; }
.prefs-header p { margin: 2px 0 0; font-size: 0.82rem; color: #94a3b8; }
.save-badge { background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #34d399; padding: 4px 10px; border-radius: 999px; font-size: 0.78rem; }
.presets-row { display: flex; gap: 8px; flex-wrap: wrap; }
.preset-btn { background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.35); color: #e0f2fe; padding: 7px 12px; border-radius: 10px; font-size: 0.8rem; cursor: pointer; }
.preset-btn:hover { background: rgba(56, 189, 248, 0.25); }
.prefs-card { background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(148, 163, 184, 0.16); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.prefs-card h3 { margin: 0 0 4px; font-size: 0.92rem; color: #7dd3fc; }
.toggle-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-top: 8px; border-top: 1px solid rgba(148, 163, 184, 0.08); cursor: pointer; }
.toggle-row:first-of-type { border-top: none; padding-top: 0; }
.toggle-row strong { display: block; font-size: 0.86rem; color: #f1f5f9; }
.toggle-row span { display: block; font-size: 0.76rem; color: #94a3b8; margin-top: 2px; }
.toggle-row input[type="checkbox"] { width: 20px; height: 20px; accent-color: #38bdf8; cursor: pointer; flex-shrink: 0; }
.mini-select { background: #0f172a; color: #e2e8f0; border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 8px; padding: 6px 8px; font-size: 0.8rem; max-width: 195px; }
</style>
