<template>
  <div class="prefs-wrap">
    <section class="glass-card">
      <div class="card-head">
        <div>
          <h3 class="card-title">🎙️ Sensibilidade do Microfone</h3>
          <p class="card-sub">Ajuste ao vivo (aplica no celular em 1,5s sem novo APK)</p>
        </div>
        <span class="pct-pill">{{ Math.round(prefs.mic_sensitivity * 100) }}%</span>
      </div>

      <div class="slider-box">
        <input type="range" min="0.5" max="2.5" step="0.1" v-model.number="prefs.mic_sensitivity" @input="onSliderMove" @change="savePrefs" class="neon-slider" />
        <div class="slider-labels">
          <span>50% • Perto</span>
          <span>160% • Normal</span>
          <span>250% • Longe</span>
        </div>
      </div>

      <div class="presets-grid">
        <button type="button" @click="applyPreset(0.7)" :class="['preset-btn', { active: isPreset(0.7) }]">
          <span class="preset-top">🔇 Anti-Ruído (70%)</span>
          <span class="preset-desc">Sala com TV ou carro</span>
        </button>
        <button type="button" @click="applyPreset(1.3)" :class="['preset-btn', { active: isPreset(1.3) }]">
          <span class="preset-top">⚖️ Equilibrado (130%)</span>
          <span class="preset-desc">Uso padrão na mesa</span>
        </button>
        <button type="button" @click="applyPreset(1.7)" :class="['preset-btn', { active: isPreset(1.7) }]">
          <span class="preset-top">🎙️ Voz Suave (170%)</span>
          <span class="preset-desc">Falar sem elevar a voz</span>
        </button>
        <button type="button" @click="applyPreset(2.3)" :class="['preset-btn', { active: isPreset(2.3) }]">
          <span class="preset-top">📡 Máxima (230%)</span>
          <span class="preset-desc">Do outro lado do quarto</span>
        </button>
      </div>

      <button type="button" @click="savePrefs" class="apply-btn">💾 Aplicar Sensibilidade Agora</button>

      <div class="meter-section">
        <div class="meter-head">
          <span class="meter-label">Teste sua voz agora:</span>
          <button type="button" @click="toggleMicTest" :class="['test-btn', { recording: testingMic }]">
            {{ testingMic ? '⏹️ Parar' : '🎧 Medir Voz' }}
          </button>
        </div>
        <div class="meter-track">
          <div class="meter-fill" :class="{ ready: liveLevel >= 30 }" :style="{ width: Math.min(100, liveLevel) + '%' }"></div>
          <div class="meter-mark"></div>
        </div>
        <p class="meter-hint">{{ liveLevel >= 30 ? '✅ Nível ideal de disparo!' : 'Fale "Jarvis" em tom normal e ultrapasse a marca amarela.' }}</p>
      </div>
    </section>

    <section class="glass-card">
      <h4 class="section-title">⚙️ Modos de Escuta &amp; Áudio</h4>
      <div class="toggle-item" v-for="item in toggleList" :key="item.key">
        <div class="toggle-info">
          <span class="toggle-name">{{ item.title }}</span>
          <span class="toggle-desc">{{ item.desc }}</span>
        </div>
        <label class="switch">
          <input type="checkbox" v-model="prefs[item.key]" @change="savePrefs" />
          <span class="slider-round"></span>
        </label>
      </div>

      <div class="cont-box">
        <div class="cont-head">
          <span>Janela de Conversa Contínua</span>
          <span class="cont-val">{{ prefs.continuous_chat_seconds }}s</span>
        </div>
        <input type="range" min="0" max="30" step="5" v-model.number="prefs.continuous_chat_seconds" @change="savePrefs" class="neon-slider" />
      </div>
    </section>

    <div v-if="statusMsg" class="toast-msg">{{ statusMsg }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const BASE = window.location.origin.includes('localhost') ? 'http://163.176.111.18' : '';
const prefs = ref<any>({
  mic_sensitivity: 1.6,
  listen_screen_off: true,
  listen_only_unlocked: false,
  listen_only_app_open: false,
  push_to_talk_only: false,
  voice_lock_only_registered: false,
  chime_enabled: true,
  silent_text_only: false,
  continuous_chat_seconds: 15
});

const toggleList = [
  { key: 'listen_screen_off', title: 'Escuta com Tela Desligada (24h)', desc: 'Ouvido ativo mesmo com aparelho bloqueado' },
  { key: 'listen_only_unlocked', title: 'Apenas com Celular Desbloqueado', desc: 'Evita disparos dentro do bolso' },
  { key: 'listen_only_app_open', title: 'Áudio Apenas com App Aberto', desc: 'Desliga o microfone em segundo plano' },
  { key: 'push_to_talk_only', title: 'Ativação Apenas por Botão (Push-to-Talk)', desc: 'Desliga chamado automático por voz' },
  { key: 'voice_lock_only_registered', title: '🛡️ Bloqueio Anti-TV (Só Vozes Cadastradas)', desc: 'Ignora vozes não registradas na biometria' },
  { key: 'chime_enabled', title: 'Sinais Sonoros (Bipes de Escuta)', desc: 'Emite bipe curto ao acordar' },
  { key: 'silent_text_only', title: 'Modo Silencioso (Responder Só em Texto)', desc: 'Não emite áudio nos alto-falantes' }
];

const statusMsg = ref('');
const testingMic = ref(false);
const liveLevel = ref(0);
let audioCtx: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let rafId: number | null = null;
let saveTimer: any = null;

onMounted(async () => {
  try {
    const r = await fetch(`${BASE}/api/v1/preferences`);
    const j = await r.json();
    if (j?.data) prefs.value = { ...prefs.value, ...j.data, mic_sensitivity: Number(j.data.mic_sensitivity ?? 1.6) };
  } catch {}
});

function onSliderMove() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(savePrefs, 300);
}

async function savePrefs() {
  try {
    prefs.value.mic_sensitivity = Number(prefs.value.mic_sensitivity);
    localStorage.setItem('jarvis_mic_sensitivity', String(prefs.value.mic_sensitivity));
    window.dispatchEvent(new CustomEvent('jarvis-prefs-updated', { detail: prefs.value }));
    await fetch(`${BASE}/api/v1/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs.value)
    });
    statusMsg.value = `✅ Sensibilidade ${Math.round(prefs.value.mic_sensitivity * 100)}% aplicada no celular!`;
    setTimeout(() => { statusMsg.value = ''; }, 3000);
  } catch {
    statusMsg.value = '⚠️ Falha de rede ao sincronizar com a VM.';
  }
}

function applyPreset(val: number) { prefs.value.mic_sensitivity = val; savePrefs(); }
function isPreset(val: number) { return Math.abs(Number(prefs.value.mic_sensitivity) - val) < 0.08; }

async function toggleMicTest() {
  if (testingMic.value) { stopMicTest(); return; }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new AudioContext();
    const src = audioCtx.createMediaStreamSource(mediaStream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    testingMic.value = true;
    const tick = () => {
      if (!testingMic.value) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
      liveLevel.value = Math.min(100, Math.sqrt(sum / data.length) * 340 * Number(prefs.value.mic_sensitivity || 1.6));
      rafId = requestAnimationFrame(tick);
    };
    tick();
  } catch { statusMsg.value = '⚠️ Libere o microfone do app para testar na barra.'; }
}

function stopMicTest() {
  testingMic.value = false; liveLevel.value = 0;
  if (rafId) cancelAnimationFrame(rafId);
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
  if (audioCtx) audioCtx.close();
  mediaStream = null; audioCtx = null;
}

onUnmounted(stopMicTest);
</script>

<style scoped>
.prefs-wrap { display: flex; flex-direction: column; gap: 14px; padding: 6px 2px 28px; color: #e2e8f0; font-family: system-ui, -apple-system, sans-serif; }
.glass-card { background: rgba(13, 20, 38, 0.88); border: 1px solid rgba(56, 189, 248, 0.24); border-radius: 16px; padding: 15px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35); }
.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.card-title { margin: 0; font-size: 0.96rem; font-weight: 700; color: #38bdf8; }
.card-sub { margin: 3px 0 0; font-size: 0.74rem; color: #94a3b8; line-height: 1.35; }
.pct-pill { background: rgba(2, 132, 199, 0.22); border: 1px solid rgba(56, 189, 248, 0.45); color: #7dd3fc; font-size: 0.82rem; font-weight: 700; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
.slider-box { margin: 16px 0 14px; }
.neon-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 6px; border-radius: 999px; background: rgba(51, 65, 85, 0.85); outline: none; }
.neon-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #38bdf8; border: 2px solid #0f172a; box-shadow: 0 0 10px rgba(56, 189, 248, 0.75); cursor: pointer; }
.slider-labels { display: flex; justify-content: space-between; margin-top: 7px; font-size: 0.68rem; color: #94a3b8; }
.presets-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
.preset-btn { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 12px; padding: 10px; color: #cbd5e1; text-align: left; cursor: pointer; transition: 0.18s; }
.preset-btn.active { background: rgba(2, 132, 199, 0.22); border-color: #38bdf8; color: #f0f9ff; }
.preset-top { font-size: 0.76rem; font-weight: 700; }
.preset-desc { font-size: 0.67rem; color: #94a3b8; }
.apply-btn { width: 100%; margin-top: 12px; padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(56, 189, 248, 0.45); background: linear-gradient(135deg, #0284c7, #0369a1); color: #fff; font-size: 0.82rem; font-weight: 700; cursor: pointer; }
.meter-section { margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(148, 163, 184, 0.15); }
.meter-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.meter-label { font-size: 0.74rem; color: #cbd5e1; }
.test-btn { background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(56, 189, 248, 0.35); color: #7dd3fc; font-size: 0.72rem; font-weight: 600; padding: 5px 10px; border-radius: 10px; cursor: pointer; }
.test-btn.recording { background: rgba(225, 29, 72, 0.22); border-color: #fb7185; color: #fda4af; }
.meter-track { position: relative; height: 10px; width: 100%; border-radius: 999px; background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(148, 163, 184, 0.16); overflow: hidden; }
.meter-fill { height: 100%; border-radius: 999px; background: #38bdf8; transition: width 0.08s linear; }
.meter-fill.ready { background: #34d399; }
.meter-mark { position: absolute; top: 0; bottom: 0; left: 30%; width: 2px; background: #fbbf24; }
.meter-hint { margin: 6px 0 0; font-size: 0.7rem; color: #94a3b8; }
.section-title { margin: 0 0 10px; font-size: 0.9rem; font-weight: 700; color: #e2e8f0; }
.toggle-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(148, 163, 184, 0.1); }
.toggle-info { display: flex; flex-direction: column; gap: 2px; }
.toggle-name { font-size: 0.81rem; font-weight: 600; color: #f1f5f9; }
.toggle-desc { font-size: 0.69rem; color: #94a3b8; }
.switch { position: relative; display: inline-block; width: 42px; height: 24px; flex-shrink: 0; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider-round { position: absolute; cursor: pointer; inset: 0; background-color: #1e293b; border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 999px; transition: 0.2s; }
.slider-round::before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: #94a3b8; border-radius: 50%; transition: 0.2s; }
.switch input:checked + .slider-round { background-color: rgba(2, 132, 199, 0.45); border-color: #38bdf8; }
.switch input:checked + .slider-round::before { transform: translateX(18px); background-color: #38bdf8; }
.cont-box { padding-top: 12px; }
.cont-head { display: flex; justify-content: space-between; font-size: 0.78rem; margin-bottom: 8px; color: #cbd5e1; }
.cont-val { color: #38bdf8; font-weight: 700; }
.toast-msg { background: rgba(16, 185, 129, 0.16); border: 1px solid rgba(52, 211, 153, 0.45); color: #6ee7b7; border-radius: 12px; padding: 10px; text-align: center; font-size: 0.76rem; font-weight: 600; }
</style>
