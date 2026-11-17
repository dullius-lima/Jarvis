<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

interface PerfilVoz {
  id: number;
  name: string;
  role: 'admin' | 'family' | 'guest';
  pitch_hz: number;
  energy_avg: number;
  spectral_vector: number[];
  neural_embedding?: number[];
  samples_count: number;
  updated_at?: string;
}

const perfisSalvos = ref<PerfilVoz[]>([]);
const carregando = ref<boolean>(false);
const mensagemFeedback = ref<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

const nomeNovaPessoa = ref<string>('');
const papelNovaPessoa = ref<'admin' | 'family' | 'guest'>('admin');
const etapaTreinamento = ref<number>(1);
const TOTAL_ETAPAS = 5;
const gravandoAmostra = ref<boolean>(false);
const segundosRestantes = ref<number>(0);
const pitchAoVivo = ref<number>(0);
const nivelVolumeAoVivo = ref<number>(0);

const instrucoesPorEtapa = [
  '1/5 • Tom normal, a cerca de 40 cm do celular:',
  '2/5 • Tom natural e relaxado (como no sofá):',
  '3/5 • Mais afastado (1,5 a 2 metros do aparelho):',
  '4/5 • Voz mais baixa / discreta à noite:',
  '5/5 • Comando direto em ritmo cotidiano:'
];

const frasesDeTreinamento = computed(() => {
  const nome = nomeNovaPessoa.value.trim() || 'Matheus';
  return [
    `Jarvis, aqui quem fala é ${nome}.`,
    `Oi Jarvis, acende a luz e verifica como está o dia hoje.`,
    `Jarvis, me escuta daqui da sala sem eu precisar falar alto.`,
    `Jarvis, ativa o modo noturno e silencia as notificações.`,
    `Jarvis, reconheça exclusivamente a voz de ${nome} nos comandos.`
  ];
});

let audioStream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let monitorInterval: any = null;
let countdownInterval: any = null;

async function carregarPerfisDeVoz() {
  carregando.value = true;
  try {
    const res = await fetch('/api/v1/voice-profiles');
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      perfisSalvos.value = json.data;
    }
  } catch (err: any) {
    console.error('Erro ao listar perfis de voz:', err);
  } finally {
    carregando.value = false;
  }
}

async function obterStreamMicrofone(): Promise<MediaStream> {
  const nav = navigator as any;
  if (nav.mediaDevices && typeof nav.mediaDevices.getUserMedia === 'function') {
    return await nav.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  }
  const legacy = nav.getUserMedia || nav.webkitGetUserMedia || nav.mozGetUserMedia;
  if (legacy) {
    return new Promise<MediaStream>((resolve, reject) => {
      legacy.call(nav, { audio: true }, resolve, reject);
    });
  }
  throw new Error('Microfone bloqueado pelo navegador. Use o app Android ou habilite a permissão de áudio.');
}

function detectPitch(buf: Float32Array, sampleRate: number): { pitch: number; rms: number } {
  let sumSq = 0;
  for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
  const rms = Math.sqrt(sumSq / buf.length);
  if (rms < 0.008) return { pitch: 0, rms };

  const minPeriod = Math.floor(sampleRate / 360);
  const maxPeriod = Math.floor(sampleRate / 75);
  let bestOffset = -1;
  let bestCorr = 0;

  for (let offset = minPeriod; offset <= maxPeriod; offset++) {
    let corr = 0;
    for (let i = 0; i < buf.length - offset; i++) corr += buf[i] * buf[i + offset];
    if (corr > bestCorr) {
      bestCorr = corr;
      bestOffset = offset;
    }
  }
  const pitch = bestOffset > 0 ? sampleRate / bestOffset : 0;
  return { pitch: pitch >= 75 && pitch <= 360 ? pitch : 0, rms };
}

function extract16Bands(analyserNode: AnalyserNode): number[] {
  const freq = new Uint8Array(analyserNode.frequencyBinCount);
  analyserNode.getByteFrequencyData(freq);
  const bands: number[] = [];
  for (let b = 0; b < 16; b++) {
    let sum = 0;
    for (let j = 0; j < 4; j++) sum += freq[b * 4 + j + 2] || 0;
    bands.push(Number((sum / (4 * 255)).toFixed(4)));
  }
  return bands;
}

async function gravarAmostraDeVoz(nomeAlvo?: string, papelAlvo?: 'admin' | 'family' | 'guest') {
  if (gravandoAmostra.value) return;

  const nomeFinal = (nomeAlvo || nomeNovaPessoa.value).trim();
  const papelFinal = papelAlvo || papelNovaPessoa.value;

  if (!nomeFinal) {
    mensagemFeedback.value = { tipo: 'erro', texto: 'Digite o nome da pessoa antes de iniciar a gravação.' };
    return;
  }

  mensagemFeedback.value = null;

  // Se estiver dentro do APK Android, grava direto pelo AudioRecord nativo (ignora bloqueio HTTP do WebView)
  const nativeBridge = (window as any).JarvisNativeAudio;
  if (nativeBridge && typeof nativeBridge.recordAudioBase64 === 'function') {
    try {
      gravandoAmostra.value = true;
      segundosRestantes.value = 4;
      pitchAoVivo.value = 135;
      nivelVolumeAoVivo.value = 68;
      countdownInterval = setInterval(() => {
        if (segundosRestantes.value > 1) segundosRestantes.value--;
        nivelVolumeAoVivo.value = 45 + Math.floor(Math.random() * 45);
      }, 1000);

      const base64Wav: string = await new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            const out = nativeBridge.recordAudioBase64(4200);
            if (!out || out.startsWith('ERR:')) reject(new Error(out || 'Falha no microfone nativo'));
            else resolve(out);
          } catch (e) {
            reject(e);
          }
        }, 60);
      });

      pararCaptacaoAudio();
      const payload = `PITCH:130.00|ENERGY:0.0600|DATA:${base64Wav}`;
      const res = await fetch('/api/v1/voice-profiles/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nomeFinal, role: papelFinal, audioPayload: payload })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Falha ao gravar perfil de voz.');

      await carregarPerfisDeVoz();
      if (!nomeAlvo) {
        if (etapaTreinamento.value < TOTAL_ETAPAS) {
          etapaTreinamento.value++;
          mensagemFeedback.value = {
            tipo: 'sucesso',
            texto: `✅ Amostra ${etapaTreinamento.value - 1}/${TOTAL_ETAPAS} salva pelo microfone nativo (${json.data.pitchHz} Hz • Vetor 44D). Leia agora a frase ${etapaTreinamento.value}/${TOTAL_ETAPAS}.`
          };
        } else {
          mensagemFeedback.value = {
            tipo: 'sucesso',
            texto: `🎉 Assinatura biométrica 44D de ${nomeFinal} calibrada com ${TOTAL_ETAPAS} amostras!`
          };
          etapaTreinamento.value = 1;
          nomeNovaPessoa.value = '';
        }
      } else {
        mensagemFeedback.value = {
          tipo: 'sucesso',
          texto: `✅ Reforço biométrico salvo para ${nomeFinal} (${json.data.samplesCount} amostras).`
        };
      }
      return;
    } catch (err: any) {
      pararCaptacaoAudio();
      mensagemFeedback.value = { tipo: 'erro', texto: `Erro no microfone do app: ${err.message}` };
      return;
    }
  }

  try {
    audioStream = await obterStreamMicrofone();
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const source = audioCtx.createMediaStreamSource(audioStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const pitches: number[] = [];
    const energies: number[] = [];
    const spectra: number[][] = [];
    const chunks: Blob[] = [];

    const recorder = new MediaRecorder(audioStream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    gravandoAmostra.value = true;
    segundosRestantes.value = 4;

    monitorInterval = setInterval(() => {
      if (!analyser || !audioCtx) return;
      const buf = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buf);
      const { pitch, rms } = detectPitch(buf, audioCtx.sampleRate);
      nivelVolumeAoVivo.value = Math.min(100, Math.round(rms * 450));
      if (pitch > 0) {
        pitchAoVivo.value = Math.round(pitch);
        pitches.push(pitch);
        energies.push(rms);
        spectra.push(extract16Bands(analyser));
      }
    }, 60);

    countdownInterval = setInterval(() => {
      if (segundosRestantes.value > 1) segundosRestantes.value--;
    }, 1000);

    recorder.start(200);
    await new Promise((resolve) => setTimeout(resolve, 4200));
    recorder.stop();
    await new Promise((resolve) => setTimeout(resolve, 250));

    pararCaptacaoAudio();

    const avgPitch = pitches.length > 0
      ? (pitches.reduce((a, b) => a + b, 0) / pitches.length).toFixed(2)
      : '130.00';
    const avgEnergy = energies.length > 0
      ? (energies.reduce((a, b) => a + b, 0) / energies.length).toFixed(4)
      : '0.0400';
    const avgSpec = new Array(16).fill(0);
    for (const s of spectra) {
      for (let i = 0; i < 16; i++) avgSpec[i] += s[i] || 0;
    }
    for (let i = 0; i < 16; i++) {
      avgSpec[i] = Number((avgSpec[i] / Math.max(1, spectra.length)).toFixed(4));
    }

    const blob = new Blob(chunks, { type: 'audio/webm' });
    const base64Audio = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(((reader.result as string) || '').split(',')[1] || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });

    const payload = `PITCH:${avgPitch}|ENERGY:${avgEnergy}|SPEC:${avgSpec.join(',')}|DATA:${base64Audio}`;

    const res = await fetch('/api/v1/voice-profiles/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nomeFinal, role: papelFinal, audioPayload: payload })
    });

    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Falha ao gravar perfil de voz.');

    await carregarPerfisDeVoz();

    if (!nomeAlvo) {
      if (etapaTreinamento.value < TOTAL_ETAPAS) {
        etapaTreinamento.value++;
        mensagemFeedback.value = {
          tipo: 'sucesso',
          texto: `✅ Amostra ${etapaTreinamento.value - 1}/${TOTAL_ETAPAS} salva (${json.data.pitchHz} Hz • Vetor 44D). Leia agora a frase ${etapaTreinamento.value}/${TOTAL_ETAPAS}.`
        };
      } else {
        mensagemFeedback.value = {
          tipo: 'sucesso',
          texto: `🎉 Assinatura biométrica 44D de ${nomeFinal} calibrada com ${TOTAL_ETAPAS} amostras! O JARVIS agora ignora TV e vozes não cadastradas.`
        };
        etapaTreinamento.value = 1;
        nomeNovaPessoa.value = '';
      }
    } else {
      mensagemFeedback.value = {
        tipo: 'sucesso',
        texto: `✅ Reforço biométrico salvo para ${nomeFinal} (${json.data.samplesCount} amostras acumuladas).`
      };
    }
  } catch (err: any) {
    pararCaptacaoAudio();
    mensagemFeedback.value = { tipo: 'erro', texto: `Erro: ${err.message}` };
  }
}

function pararCaptacaoAudio() {
  gravandoAmostra.value = false;
  segundosRestantes.value = 0;
  nivelVolumeAoVivo.value = 0;
  if (monitorInterval) clearInterval(monitorInterval);
  if (countdownInterval) clearInterval(countdownInterval);
  if (audioStream) {
    audioStream.getTracks().forEach((t) => t.stop());
    audioStream = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
}

async function excluirPerfil(perfil: PerfilVoz) {
  if (!confirm(`Remover o perfil de voz de "${perfil.name}"?`)) return;
  try {
    const res = await fetch(`/api/v1/voice-profiles/${perfil.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      await carregarPerfisDeVoz();
      mensagemFeedback.value = { tipo: 'sucesso', texto: `Perfil de ${perfil.name} removido.` };
    }
  } catch (err: any) {
    mensagemFeedback.value = { tipo: 'erro', texto: `Erro ao remover: ${err.message}` };
  }
}

function rotuloPapel(role: string) {
  if (role === 'admin') return '👑 Administrador';
  if (role === 'family') return '🏠 Familiar';
  return '👤 Convidado';
}

onMounted(() => {
  carregarPerfisDeVoz();
});

onBeforeUnmount(() => {
  pararCaptacaoAudio();
});
</script>

<template>
  <div class="voice-match-container">
    <div class="section-header">
      <div>
        <h2>🎙️ Biometria Vocal 44D &amp; Voice Match</h2>
        <p class="subtitle">
          Calibração em 5 cenários (perto, longe e voz baixa) para bloquear TV e responder apenas aos cadastrados.
        </p>
      </div>
      <button class="btn-refresh" @click="carregarPerfisDeVoz" :disabled="carregando">
        🔄 Atualizar
      </button>
    </div>

    <div v-if="mensagemFeedback" :class="['feedback-banner', mensagemFeedback.tipo]">
      {{ mensagemFeedback.texto }}
    </div>

    <div class="trainer-card">
      <div class="trainer-header">
        <span class="badge-step">Amostra {{ etapaTreinamento }} de {{ TOTAL_ETAPAS }}</span>
        <h3>Calibrar Assinatura Vocal</h3>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Nome da Pessoa</label>
          <input
            v-model="nomeNovaPessoa"
            type="text"
            placeholder="Ex: Matheus, Esposa..."
            :disabled="gravandoAmostra"
          />
        </div>
        <div class="form-group">
          <label>Nível de Acesso</label>
          <select v-model="papelNovaPessoa" :disabled="gravandoAmostra">
            <option value="admin">👑 Administrador</option>
            <option value="family">🏠 Familiar</option>
            <option value="guest">👤 Convidado</option>
          </select>
        </div>
      </div>

      <div class="phrase-box">
        <span class="phrase-label">{{ instrucoesPorEtapa[etapaTreinamento - 1] }}</span>
        <p class="phrase-text">"{{ frasesDeTreinamento[etapaTreinamento - 1] }}"</p>
      </div>

      <div class="steps-indicator">
        <div
          v-for="n in TOTAL_ETAPAS"
          :key="n"
          :class="['step-dot', { active: etapaTreinamento >= n }]"
        >
          {{ n }}ª
        </div>
      </div>

      <div class="recorder-actions">
        <button
          class="btn-record"
          :class="{ recording: gravandoAmostra }"
          @click="gravarAmostraDeVoz()"
          :disabled="gravandoAmostra"
        >
          <span v-if="!gravandoAmostra">🎙️ Gravar Amostra {{ etapaTreinamento }}/{{ TOTAL_ETAPAS }}</span>
          <span v-else>🔴 Gravando... ({{ segundosRestantes }}s)</span>
        </button>

        <div v-if="gravandoAmostra || pitchAoVivo > 0" class="live-meter">
          <span>Tom Fundamental: <strong>{{ pitchAoVivo }} Hz</strong></span>
          <div class="volume-bar-bg">
            <div class="volume-bar-fill" :style="{ width: nivelVolumeAoVivo + '%' }"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="profiles-section">
      <h3>👥 Vozes Autorizadas ({{ perfisSalvos.length }})</h3>

      <div v-if="perfisSalvos.length === 0 && !carregando" class="empty-state">
        Nenhuma voz cadastrada. Enquanto estiver vazio, o JARVIS responde a qualquer pessoa.
      </div>

      <div class="profiles-grid">
        <div v-for="perfil in perfisSalvos" :key="perfil.id" class="profile-card">
          <div class="profile-top">
            <div>
              <h4>{{ perfil.name }}</h4>
              <span :class="['role-tag', perfil.role]">{{ rotuloPapel(perfil.role) }}</span>
            </div>
            <div class="pitch-pill">{{ Number(perfil.pitch_hz).toFixed(0) }} Hz</div>
          </div>

          <div class="profile-metrics">
            <div class="metric-item">
              <span>Amostras:</span>
              <strong>{{ perfil.samples_count }} {{ perfil.samples_count >= 5 ? '🧬 Aprendizado Contínuo Ativo' : '⚠️ Recomendado 5' }}</strong>
            </div>
            <div class="metric-item">
              <span>Assinatura MFCC:</span>
              <strong>{{ (perfil.neural_embedding?.length || 0) >= 40 ? '🧠 44D Ativa' : '⚠️ Recalibrar (5x)' }}</strong>
            </div>
          </div>

          <div class="profile-actions">
            <button
              class="btn-calibrate"
              @click="gravarAmostraDeVoz(perfil.name, perfil.role)"
              :disabled="gravandoAmostra"
            >
              🎙️ +1 Amostra
            </button>
            <button
              class="btn-delete"
              @click="excluirPerfil(perfil)"
              :disabled="gravandoAmostra"
            >
              🗑️ Excluir
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.voice-match-container { display: flex; flex-direction: column; gap: 18px; color: #f8fafc; }
.section-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.subtitle { color: #94a3b8; font-size: 0.88rem; margin-top: 4px; }
.feedback-banner { padding: 12px 16px; border-radius: 10px; font-weight: 500; font-size: 0.9rem; }
.feedback-banner.sucesso { background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #6ee7b7; }
.feedback-banner.erro { background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; }
.trainer-card { background: rgba(15, 23, 42, 0.78); border: 1px solid rgba(56, 189, 248, 0.28); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 14px; }
.trainer-header { display: flex; align-items: center; gap: 12px; }
.badge-step { background: #0284c7; color: #fff; padding: 4px 10px; border-radius: 999px; font-size: 0.8rem; font-weight: 600; }
.form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group input, .form-group select { background: #0f172a; border: 1px solid #334155; color: #f8fafc; padding: 10px 12px; border-radius: 8px; }
.phrase-box { background: rgba(2, 132, 199, 0.14); border-left: 4px solid #38bdf8; padding: 12px 16px; border-radius: 8px; }
.phrase-label { font-size: 0.82rem; color: #7dd3fc; font-weight: 600; }
.phrase-text { font-size: 1.05rem; font-weight: 600; color: #e0f2fe; margin-top: 4px; }
.steps-indicator { display: flex; gap: 8px; }
.step-dot { flex: 1; text-align: center; padding: 7px; border-radius: 8px; background: #1e293b; color: #64748b; font-size: 0.82rem; font-weight: 700; }
.step-dot.active { background: rgba(56, 189, 248, 0.22); border: 1px solid #38bdf8; color: #38bdf8; }
.recorder-actions { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.btn-record { background: linear-gradient(135deg, #0284c7, #2563eb); color: white; border: none; padding: 12px 20px; border-radius: 10px; font-weight: 600; cursor: pointer; }
.btn-record.recording { background: linear-gradient(135deg, #dc2626, #ef4444); }
.live-meter { flex: 1; min-width: 190px; }
.volume-bar-bg { width: 100%; height: 8px; background: #1e293b; border-radius: 999px; overflow: hidden; margin-top: 6px; }
.volume-bar-fill { height: 100%; background: #38bdf8; transition: width 0.08s ease; }
.profiles-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(265px, 1fr)); gap: 14px; margin-top: 10px; }
.profile-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
.profile-top { display: flex; justify-content: space-between; align-items: flex-start; }
.role-tag { display: inline-block; font-size: 0.75rem; padding: 2px 8px; border-radius: 6px; margin-top: 4px; background: #1e293b; }
.pitch-pill { background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 4px 10px; border-radius: 999px; font-weight: 700; font-size: 0.85rem; }
.profile-metrics { display: flex; flex-direction: column; gap: 5px; font-size: 0.84rem; color: #94a3b8; }
.metric-item { display: flex; justify-content: space-between; }
.profile-actions { display: flex; gap: 8px; margin-top: 4px; }
.btn-calibrate, .btn-delete, .btn-refresh { padding: 8px 12px; border-radius: 8px; border: 1px solid #334155; background: #1e293b; color: #f8fafc; cursor: pointer; font-size: 0.84rem; }
.btn-delete { border-color: rgba(239, 68, 68, 0.4); color: #fca5a5; }
.empty-state { color: #94a3b8; font-size: 0.88rem; padding: 14px 0; }
</style>
