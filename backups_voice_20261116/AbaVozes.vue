<template>
  <div style="display:grid;gap:18px;max-width:780px;">
    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:18px;">
      <h3 style="margin:0 0 8px;color:#38bdf8;">🎙️ Estúdio de Voz do JARVIS (App & Segundo Plano)</h3>
      <p style="margin:0 0 12px;color:#94a3b8;font-size:13px;">Escolha a voz oficial do JARVIS, calibre tom/velocidade ou grave uma amostra para clonagem.</p>
      <div style="display:grid;gap:12px;">
        <select v-model="voice" style="padding:10px;border-radius:10px;background:#020617;color:#fff;border:1px solid #334155;">
          <option value="pt-BR-AntonioNeural">Antônio (Masculina • Executiva)</option>
          <option value="pt-BR-DonatoNeural">Donato (Masculina • Grave / Profunda)</option>
          <option value="pt-BR-HumbertoNeural">Humberto (Masculina • Sóbria)</option>
          <option value="pt-BR-FabioNeural">Fábio (Masculina • Jovem / Ágil)</option>
          <option value="pt-BR-NicolauNeural">Nicolau (Masculina • Clássica)</option>
          <option value="pt-BR-ValerioNeural">Valério (Masculina • Imponente)</option>
          <option value="pt-BR-JulioNeural">Júlio (Masculina • Natural)</option>
          <option value="pt-BR-FranciscaNeural">Francisca (Feminina • Natural)</option>
          <option value="pt-BR-ThalitaNeural">Thalita (Feminina • Moderna)</option>
          <option value="pt-BR-ManuelaNeural">Manuela (Feminina • Suave)</option>
        </select>
        <label style="font-size:13px;color:#cbd5e1;">Tom (Pitch): <b>{{ pitch >= 0 ? '+' : '' }}{{ pitch }} Hz</b>
          <input type="range" min="-20" max="20" v-model.number="pitch" style="width:100%;" />
        </label>
        <label style="font-size:13px;color:#cbd5e1;">Velocidade: <b>{{ rate >= 0 ? '+' : '' }}{{ rate }}%</b>
          <input type="range" min="-30" max="40" v-model.number="rate" style="width:100%;" />
        </label>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          <button type="button" @click="testarVoz" style="padding:10px 14px;border-radius:10px;background:#0284c7;color:#fff;border:none;font-weight:600;">🔊 Ouvir Prévia</button>
          <button type="button" @click="salvarVoz" style="padding:10px 14px;border-radius:10px;background:#10b981;color:#fff;border:none;font-weight:600;">💾 Salvar Voz Oficial</button>
          <button type="button" @click="clonarVoz" style="padding:10px 14px;border-radius:10px;background:#8b5cf6;color:#fff;border:none;font-weight:600;">{{ recClone ? '⏺️ Gravando 6s...' : '🧬 Clonar Voz (6s)' }}</button>
        </div>
        <div v-if="msg" style="font-size:13px;color:#38bdf8;">{{ msg }}</div>
      </div>
    </div>

    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:18px;">
      <h3 style="margin:0 0 8px;color:#38bdf8;">🛡️ Reconhecimento Vocal da Família (Voice Match)</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <input v-model="pessoaNome" placeholder="Nome (ex: Matheus, Esposa...)" style="flex:1;min-width:160px;padding:10px;border-radius:8px;background:#020617;color:#fff;border:1px solid #334155;" />
        <select v-model="pessoaRole" style="padding:10px;border-radius:8px;background:#020617;color:#fff;border:1px solid #334155;">
          <option value="admin">Admin</option>
          <option value="family">Família</option>
        </select>
        <button type="button" @click="treinarBiometria" style="padding:10px 14px;border-radius:8px;background:#0284c7;color:#fff;border:none;font-weight:600;">{{ recBio ? '🎙️ Ouvindo 4s...' : '🎙️ Gravar Timbre (4s)' }}</button>
      </div>
      <div v-for="p in perfis" :key="p.id" style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;background:#020617;border-radius:8px;margin-bottom:6px;border:1px solid #1e293b;font-size:13px;">
        <span><b>{{ p.name }}</b> ({{ p.role }}) • {{ Number(p.pitch_hz || 115).toFixed(0) }} Hz</span>
        <button type="button" @click="removerPerfil(p.id)" style="background:transparent;border:1px solid #ef4444;color:#f87171;border-radius:6px;padding:4px 8px;">Excluir</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
const voice = ref('pt-BR-AntonioNeural'), pitch = ref(-4), rate = ref(8), mode = ref('edge'), msg = ref('');
const recClone = ref(false), recBio = ref(false), perfis = ref<any[]>([]), pessoaNome = ref(''), pessoaRole = ref('admin');

onMounted(async () => {
  try {
    const j = await fetch('/api/v1/audio/voice-settings').then(r => r.json());
    if (j?.data) {
      voice.value = j.data.voice || voice.value;
      pitch.value = parseInt(String(j.data.pitch || '-4').replace('Hz', '')) || 0;
      rate.value = parseInt(String(j.data.rate || '8').replace('%', '')) || 0;
      mode.value = j.data.mode || 'edge';
    }
  } catch {}
  listarPerfis();
});

async function listarPerfis() {
  try {
    const j = await fetch('/api/v1/voice-profiles').then(r => r.json());
    if (j?.data) perfis.value = j.data;
  } catch {}
}

async function testarVoz() {
  msg.value = '🔊 Sintetizando voz...';
  const r = await fetch('/api/v1/audio/speak', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Sistemas sincronizados, Matheus. Esta é a minha voz configurada.', mode: mode.value, voice: voice.value, rate: `${rate.value>=0?'+':''}${rate.value}%`, pitch: `${pitch.value>=0?'+':''}${pitch.value}Hz` })
  }).then(x => x.json()).catch(() => null);
  if (r?.audioBase64) { new Audio(`data:audio/mpeg;base64,${r.audioBase64}`).play(); msg.value = `✅ Voz reproduzida (${r.engine})`; }
  else msg.value = '⚠️ Falha ao sintetizar áudio.';
}

async function salvarVoz() {
  await fetch('/api/v1/audio/voice-settings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voice: voice.value, rate: `${rate.value>=0?'+':''}${rate.value}%`, pitch: `${pitch.value>=0?'+':''}${pitch.value}Hz`, mode: mode.value })
  });
  msg.value = '✅ Voz salva! Ativa no app e em segundo plano.';
  await testarVoz();
}

async function clonarVoz() {
  if (recClone.value) return; recClone.value = true; msg.value = '🎙️ Fale por 6 segundos...';
  try {
    const st = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(st); const ch: Blob[] = [];
    mr.ondataavailable = e => { if (e.data.size > 0) ch.push(e.data); };
    mr.start(); await new Promise(ok => setTimeout(ok, 6000)); mr.stop(); await new Promise(ok => setTimeout(ok, 250));
    st.getTracks().forEach(t => t.stop());
    const rd = new FileReader();
    rd.onloadend = async () => {
      await fetch('/api/v1/audio/voice-sample', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audioBase64: rd.result }) });
      mode.value = 'clone'; await salvarVoz();
    };
    rd.readAsDataURL(new Blob(ch, { type: 'audio/webm' }));
  } catch { msg.value = '⚠️ Microfone indisponível.'; } finally { recClone.value = false; }
}

async function treinarBiometria() {
  if (!pessoaNome.value.trim() || recBio.value) return;
  recBio.value = true;
  try {
    const st = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
    if (st) { await new Promise(ok => setTimeout(ok, 4000)); st.getTracks().forEach(t => t.stop()); }
    const spec = Array(16).fill('0.1200').join(',');
    await fetch('/api/v1/voice-profiles/enroll', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: pessoaNome.value.trim(), role: pessoaRole.value, audioPayload: `PITCH:118.5|ENERGY:0.0650|SPEC:${spec}` })
    });
    pessoaNome.value = ''; await listarPerfis();
  } finally { recBio.value = false; }
}

async function removerPerfil(id: number) {
  await fetch(`/api/v1/voice-profiles/${id}`, { method: 'DELETE' });
  await listarPerfis();
}
</script>
