#!/usr/bin/env bash
set -e

# 1. Garante rota /api/v1/preferences no server.ts com padrão mic_sensitivity = 1.6 (160%)
python3 - << 'PY'
p = "src/server.ts"
s = open(p, "r", encoding="utf-8").read()
if "/api/v1/preferences" not in s:
    route = """
app.get('/api/v1/preferences', (_req, res) => {
  try {
    const fs = require('fs');
    const fp = '/home/ubuntu/meu-n8n-backend/user_preferences.json';
    const data = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf-8')) : { mic_sensitivity: 1.6 };
    if (data.mic_sensitivity === undefined) data.mic_sensitivity = 1.6;
    res.json({ success: true, data });
  } catch (e) { res.json({ success: true, data: { mic_sensitivity: 1.6 } }); }
});
app.post('/api/v1/preferences', (req, res) => {
  try {
    const fs = require('fs');
    const fp = '/home/ubuntu/meu-n8n-backend/user_preferences.json';
    const cur = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf-8')) : {};
    const merged = { ...cur, ...(req.body || {}) };
    if (merged.mic_sensitivity !== undefined) merged.mic_sensitivity = Number(merged.mic_sensitivity);
    fs.writeFileSync(fp, JSON.stringify(merged, null, 2));
    res.json({ success: true, data: merged });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});
"""
    s = s.replace("app.listen(", route + "\napp.listen(", 1)
    open(p, "w", encoding="utf-8").write(s)
PY

# Define sensibilidade inicial calibrada para voz normal (1.6 = 160%)
python3 - << 'PY'
import json, os
fp = "/home/ubuntu/meu-n8n-backend/user_preferences.json"
d = json.load(open(fp)) if os.path.exists(fp) else {}
d["mic_sensitivity"] = 1.6
json.dump(d, open(fp, "w"), indent=2)
PY

# 2. Cria tela funcional de Sensibilidade (50% a 250%) + Medidor ao Vivo
mkdir -p src/frontend/components/settings
cat << 'EOF' > src/frontend/components/settings/AbaPreferencias.vue
<template>
  <div class="space-y-4 text-slate-100 pb-8">
    <div class="rounded-2xl border border-sky-500/40 bg-slate-900/90 p-4 shadow-lg">
      <div class="flex items-center justify-between mb-1">
        <div>
          <h3 class="text-base font-bold text-sky-400">🎙️ Sensibilidade do Microfone</h3>
          <p class="text-xs text-slate-400">Ajuste ao vivo (aplica no celular em 1,5s sem novo APK)</p>
        </div>
        <span class="rounded-xl bg-sky-500/20 border border-sky-400/50 px-3 py-1 text-sm font-bold text-sky-300">
          {{ Math.round(prefs.mic_sensitivity * 100) }}%
        </span>
      </div>

      <div class="my-4">
        <input
          type="range"
          min="0.5"
          max="2.5"
          step="0.1"
          v-model.number="prefs.mic_sensitivity"
          @input="onSliderMove"
          @change="savePrefs"
          class="w-full accent-sky-400 cursor-pointer h-2.5 bg-slate-700 rounded-lg"
        />
        <div class="flex justify-between text-[11px] text-slate-400 mt-1.5">
          <span>50% (Perto / TV Alta)</span>
          <span>160% (Voz Normal)</span>
          <span>250% (Longe / Sussurro)</span>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 mt-3">
        <button @click="applyPreset(0.7)" :class="presetClass(0.7)" class="rounded-xl border p-2.5 text-left transition">
          <div class="text-xs font-bold">🔇 Anti-Ruído (70%)</div>
          <div class="text-[11px] opacity-75">Sala com TV ou carro</div>
        </button>
        <button @click="applyPreset(1.3)" :class="presetClass(1.3)" class="rounded-xl border p-2.5 text-left transition">
          <div class="text-xs font-bold">⚖️ Equilibrado (130%)</div>
          <div class="text-[11px] opacity-75">Uso padrão na mesa</div>
        </button>
        <button @click="applyPreset(1.7)" :class="presetClass(1.7)" class="rounded-xl border p-2.5 text-left transition">
          <div class="text-xs font-bold">🎙️ Voz Suave (170%)</div>
          <div class="text-[11px] opacity-75">Falar sem elevar a voz</div>
        </button>
        <button @click="applyPreset(2.3)" :class="presetClass(2.3)" class="rounded-xl border p-2.5 text-left transition">
          <div class="text-xs font-bold">📡 Máxima (230%)</div>
          <div class="text-[11px] opacity-75">Do outro lado do quarto</div>
        </button>
      </div>

      <button
        @click="savePrefs"
        class="mt-3 w-full rounded-xl bg-sky-600 hover:bg-sky-500 active:bg-sky-700 py-2.5 text-sm font-bold text-white shadow transition"
      >
        💾 Aplicar Sensibilidade Agora
      </button>

      <!-- Medidor Visual de Calibração -->
      <div class="mt-4 pt-3 border-t border-slate-800">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs text-slate-300">Teste sua voz agora:</span>
          <button
            @click="toggleMicTest"
            class="rounded-xl px-3 py-1 text-xs font-semibold border transition"
            :class="testingMic ? 'bg-rose-500/20 border-rose-400 text-rose-300' : 'bg-slate-800 border-slate-600 text-sky-300'"
          >
            {{ testingMic ? '⏹️ Parar Teste' : '🎧 Medir Minha Voz' }}
          </button>
        </div>
        <div class="relative h-4 w-full rounded-full bg-slate-800 overflow-hidden p-0.5">
          <div
            class="h-full rounded-full transition-all duration-75"
            :class="liveLevel >= 30 ? 'bg-emerald-400' : 'bg-sky-400'"
            :style="{ width: Math.min(100, liveLevel) + '%' }"
          ></div>
          <div class="absolute top-0 bottom-0 left-[30%] w-0.5 bg-amber-400" title="Linha de Disparo"></div>
        </div>
        <p class="text-[11px] text-slate-400 mt-1">
          {{ liveLevel >= 30 ? '✅ Nível excelente! O JARVIS já detecta sua voz nesse tom.' : 'Fale "Jarvis" em tom normal — ultrapasse a linha amarela.' }}
        </p>
      </div>
    </div>

    <!-- Chaves de Comportamento -->
    <div class="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 space-y-3">
      <h4 class="text-sm font-semibold text-slate-200">⚙️ Modos de Escuta & Áudio</h4>

      <label class="flex items-center justify-between cursor-pointer">
        <div>
          <div class="text-sm font-medium">Escuta com Tela Desligada (24h)</div>
          <div class="text-xs text-slate-400">Ouvido ativo mesmo com aparelho bloqueado</div>
        </div>
        <input type="checkbox" v-model="prefs.listen_screen_off" @change="savePrefs" class="h-5 w-5 accent-sky-400" />
      </label>

      <label class="flex items-center justify-between cursor-pointer">
        <div>
          <div class="text-sm font-medium">Apenas com Celular Desbloqueado</div>
          <div class="text-xs text-slate-400">Evita disparos dentro do bolso</div>
        </div>
        <input type="checkbox" v-model="prefs.listen_only_unlocked" @change="savePrefs" class="h-5 w-5 accent-sky-400" />
      </label>

      <label class="flex items-center justify-between cursor-pointer">
        <div>
          <div class="text-sm font-medium">Áudio Apenas com App Aberto</div>
          <div class="text-xs text-slate-400">Desliga o microfone em segundo plano</div>
        </div>
        <input type="checkbox" v-model="prefs.listen_only_app_open" @change="savePrefs" class="h-5 w-5 accent-sky-400" />
      </label>

      <label class="flex items-center justify-between cursor-pointer">
        <div>
          <div class="text-sm font-medium">Ativação Apenas por Botão (Push-to-Talk)</div>
          <div class="text-xs text-slate-400">Desliga chamado automático por voz</div>
        </div>
        <input type="checkbox" v-model="prefs.push_to_talk_only" @change="savePrefs" class="h-5 w-5 accent-sky-400" />
      </label>

      <label class="flex items-center justify-between cursor-pointer">
        <div>
          <div class="text-sm font-medium">Sinais Sonoros (Bipes de Escuta)</div>
          <div class="text-xs text-slate-400">Emite bipe curto ao acordar</div>
        </div>
        <input type="checkbox" v-model="prefs.chime_enabled" @change="savePrefs" class="h-5 w-5 accent-sky-400" />
      </label>

      <label class="flex items-center justify-between cursor-pointer">
        <div>
          <div class="text-sm font-medium">Modo Silencioso (Responder Só em Texto)</div>
          <div class="text-xs text-slate-400">Não emite áudio nos alto-falantes</div>
        </div>
        <input type="checkbox" v-model="prefs.silent_text_only" @change="savePrefs" class="h-5 w-5 accent-sky-400" />
      </label>

      <div class="pt-2 border-t border-slate-800">
        <div class="flex justify-between text-xs mb-1">
          <span>Janela de Conversa Contínua</span>
          <span class="text-sky-400 font-semibold">{{ prefs.continuous_chat_seconds }}s</span>
        </div>
        <input type="range" min="0" max="30" step="5" v-model.number="prefs.continuous_chat_seconds" @change="savePrefs" class="w-full accent-sky-400 h-1.5 bg-slate-700 rounded-lg" />
      </div>
    </div>

    <div v-if="statusMsg" class="rounded-xl bg-emerald-500/15 border border-emerald-500/40 p-2.5 text-center text-xs font-semibold text-emerald-300">
      {{ statusMsg }}
    </div>
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
  chime_enabled: true,
  silent_text_only: false,
  continuous_chat_seconds: 15
});

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
    statusMsg.value = `✅ Sensibilidade ${Math.round(prefs.value.mic_sensitivity * 100)}% salva! Já está valendo no celular.`;
    setTimeout(() => { statusMsg.value = ''; }, 3500);
  } catch {
    statusMsg.value = '⚠️ Falha de rede ao sincronizar com a VM.';
  }
}

function applyPreset(val: number) {
  prefs.value.mic_sensitivity = val;
  savePrefs();
}

function presetClass(val: number) {
  return Math.abs(Number(prefs.value.mic_sensitivity) - val) < 0.08
    ? 'bg-sky-500/25 border-sky-400 text-sky-200'
    : 'bg-slate-800/75 border-slate-700 text-slate-300';
}

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
      const rms = Math.sqrt(sum / data.length);
      liveLevel.value = Math.min(100, rms * 340 * Number(prefs.value.mic_sensitivity || 1.6));
      rafId = requestAnimationFrame(tick);
    };
    tick();
  } catch {
    statusMsg.value = '⚠️ Libere a permissão de microfone do app para testar na barra.';
  }
}

function stopMicTest() {
  testingMic.value = false;
  liveLevel.value = 0;
  if (rafId) cancelAnimationFrame(rafId);
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
  if (audioCtx) audioCtx.close();
  mediaStream = null; audioCtx = null;
}

onUnmounted(stopMicTest);
</script>
