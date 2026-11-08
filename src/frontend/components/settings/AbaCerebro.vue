<template>
  <section class="tab-section">
    <header class="section-header">
      <div>
        <h1>👑 Configuração do Cérebro Central ({{ configuracoesCerebro.agent_name || 'JARVIS' }})</h1>
        <p>Gerencie o Agente Líder, chaves de API multi-provedor e modelos sincronizados via GitHub Gist.</p>
      </div>
      <div class="gist-sync-box">
        <button @click="carregarModelosHomologados(true)" :disabled="sincronizandoGist" class="btn-secondary">
          {{ sincronizandoGist ? '⏳ Sincronizando Gist...' : '🔄 Atualizar Modelos do GitHub Gist' }}
        </button>
        <small class="sync-meta">
          Fonte: <strong>{{ rotuloFonteGist }}</strong>
          <span v-if="ultimaSincronizacao"> ({{ formatarHora(ultimaSincronizacao) }})</span>
        </small>
      </div>
    </header>

    <div class="card brain-card">
      <div class="form-row">
        <div class="form-group">
          <label>Nome do Agente Líder (Núcleo Central)</label>
          <input type="text" v-model="configuracoesCerebro.agent_name" class="input-field" placeholder="JARVIS" />
        </div>

        <div class="form-group">
          <label v-pre>URL Base Local ({{BASE_URL}} / {{SERVER_IP}})</label>
          <input
            type="text"
            v-model="configuracoesCerebro.server_base_url"
            class="input-field"
            placeholder="http://localhost:3333"
          />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Provedor de IA Principal</label>
          <select v-model="configuracoesCerebro.provider" @change="aoMudarProvedorCerebro" class="input-field">
            <option value="groq">Groq (LPU Ultra-Rápido)</option>
            <option value="gemini">Google Gemini Oficial</option>
            <option value="openai">OpenAI Oficial</option>
            <option value="deepseek">DeepSeek Oficial (V3 / R1)</option>
            <option value="openrouter">OpenRouter (Multi-Modelos)</option>
            <option value="ollama">Ollama (100% Local / Offline)</option>
          </select>
        </div>

        <div class="form-group">
          <label>Modelo Homologado (Sincronizado via GitHub Gist)</label>
          <select v-model="opcaoModeloSelecionado" @change="aoMudarModeloCerebro" class="input-field">
            <option
              v-for="mod in modelosDoProvedorAtual(configuracoesCerebro.provider)"
              :key="mod.value"
              :value="mod.value"
            >
              {{ mod.label }}
            </option>
          </select>
        </div>
      </div>

      <!-- Campo para modelo manual -->
      <div v-if="opcaoModeloSelecionado === 'CUSTOM_INPUT'" class="form-group custom-model-box">
        <label>✍️ Digite o ID exato do Modelo ({{ configuracoesCerebro.provider.toUpperCase() }})</label>
        <input
          type="text"
          v-model="configuracoesCerebro.model"
          class="input-field"
          placeholder="Ex: openai/gpt-oss-120b, llama-3.3-70b-versatile, gemini-2.5-flash..."
        />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>
            Chave de API ({{ configuracoesCerebro.provider.toUpperCase() }})
            <span class="saved-badge" v-if="configuracoesCerebro.saved_keys?.[configuracoesCerebro.provider]">🔒 Salva no Cofre</span>
          </label>
          <input
            type="password"
            v-model="configuracoesCerebro.api_key"
            @focus="limparMascaraAoFocar"
            class="input-field"
            placeholder="Cole a chave de API (gsk_..., sk-..., AIza...)"
          />
        </div>

        <div class="form-group">
          <label>Base URL do Provedor</label>
          <input
            type="text"
            v-model="configuracoesCerebro.base_url"
            class="input-field"
            placeholder="https://api.groq.com/openai/v1"
          />
        </div>

        <div class="form-group" style="max-width: 160px;">
          <label>Temperatura ({{ configuracoesCerebro.temperature }})</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="1.5"
            v-model.number="configuracoesCerebro.temperature"
            class="input-field"
          />
        </div>
      </div>

      <div class="form-group">
        <label>System Prompt Permanente do {{ configuracoesCerebro.agent_name || 'JARVIS' }}</label>
        <textarea
          v-model="configuracoesCerebro.system_prompt"
          rows="4"
          class="input-field"
          placeholder="Instruções mestras de orquestração do Cérebro Central..."
        ></textarea>
      </div>

      <div class="actions-row">
        <button @click="testarConexaoIA" :disabled="testandoIA" class="btn-test">
          {{ testandoIA ? '⏳ Validando com a IA...' : '⚡ Testar Conexão da IA' }}
        </button>

        <button @click="salvarConfiguracoesCerebro" :disabled="salvandoCerebro" class="btn-primary">
          {{ salvandoCerebro ? '⏳ Salvando...' : '💾 Salvar Configuração do Cérebro Central' }}
        </button>
      </div>

      <div
        v-if="resultadoTesteIA"
        :class="['alert-box', resultadoTesteIA.success ? 'alert-success' : 'alert-error']"
      >
        {{ resultadoTesteIA.message }}
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// src/frontend/components/settings/AbaCerebro.vue
import { ref, reactive, computed, onMounted } from 'vue';

// 1. Estados Reativos de Carregamento e Feedback (Sem duplicações)
const salvandoCerebro = ref<boolean>(false);
const testandoConexao = ref<boolean>(false);
const testandoIA = testandoConexao; // Alias de retrocompatibilidade

const feedbackSalvamento = ref<{ tipo: 'sucesso' | 'erro'; mensagem: string } | null>(null);
const resultadoTesteIA = ref<{ success: boolean; message: string } | null>(null);
const testResult = ref<{ success: boolean; message: string } | null>(null);

// 2. Endpoints Padrão dos Provedores
const ENDPOINTS_PADRAO: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434/v1'
};

// 3. Catálogo de Modelos Homologados
const modelosHomologados = ref<Record<string, Array<{ label: string; value: string }>>>({
  groq: [
    { label: 'Llama 3.3 70B Versatile (Recomendado)', value: 'llama-3.3-70b-versatile' },
    { label: 'GPT-OSS 120B (Reasoning)', value: 'openai/gpt-oss-120b' },
    { label: '✍️ Inserir ID Manual da Groq', value: 'CUSTOM_INPUT' }
  ],
  gemini: [
    { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
    { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
    { label: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash' },
    { label: '✍️ Inserir ID Manual do Gemini', value: 'CUSTOM_INPUT' }
  ],
  openai: [
    { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
    { label: 'GPT-4o', value: 'gpt-4o' },
    { label: '✍️ Inserir ID Manual da OpenAI', value: 'CUSTOM_INPUT' }
  ],
  deepseek: [
    { label: 'DeepSeek V3 (Chat)', value: 'deepseek-chat' },
    { label: 'DeepSeek R1 (Reasoner)', value: 'deepseek-reasoner' },
    { label: '✍️ Inserir ID Manual da DeepSeek', value: 'CUSTOM_INPUT' }
  ]
});

// 4. Sincronização via Gist
const sincronizandoGist = ref(false);
const fonteGist = ref('local');
const ultimaSincronizacao = ref<string | null>(null);

const rotuloFonteGist = computed(() => {
  if (fonteGist.value === 'github_gist') return 'GitHub Gist (Ao Vivo)';
  if (fonteGist.value === 'github_gist_cache') return 'GitHub Gist (Cache)';
  return 'Catálogo Local Homologado';
});

// 5. Configuração Principal do JARVIS
const configuracoesCerebro = ref<any>({
  agent_name: 'JARVIS',
  provider: 'groq',
  model: 'llama-3.3-70b-versatile',
  api_key: '',
  base_url: ENDPOINTS_PADRAO.groq,
  temperature: 0.2,
  server_base_url: 'http://localhost:3333',
  system_prompt: 'Você é o JARVIS, o Cérebro Central e Agente Líder permanente do sistema.',
  saved_keys: {}
});

const opcaoModeloSelecionado = ref('llama-3.3-70b-versatile');
const modeloCustomizado = ref('');

// 6. Helpers de Manipulação de Modelos
function modelosDoProvedorAtual(provedor: string) {
  const chave = (provedor || 'groq').toLowerCase();
  return (
    modelosHomologados.value[chave] || [
      { label: `✍️ Inserir ID Manual (${chave.toUpperCase()})`, value: 'CUSTOM_INPUT' }
    ]
  );
}

function sincronizarSelecaoModelo() {
  const lista = modelosDoProvedorAtual(configuracoesCerebro.value.provider);
  const modeloAtual = configuracoesCerebro.value.model;
  const existeNoCatalogo = lista.some(
    (m) => m.value === modeloAtual && m.value !== 'CUSTOM_INPUT'
  );

  if (existeNoCatalogo) {
    opcaoModeloSelecionado.value = modeloAtual;
    modeloCustomizado.value = '';
  } else if (modeloAtual) {
    opcaoModeloSelecionado.value = 'CUSTOM_INPUT';
    modeloCustomizado.value = modeloAtual;
  } else {
    opcaoModeloSelecionado.value = 'CUSTOM_INPUT';
    modeloCustomizado.value = '';
  }
}

function limparMascaraAoFocar() {
  if (
    configuracoesCerebro.value.api_key &&
    /[•*]/.test(configuracoesCerebro.value.api_key)
  ) {
    configuracoesCerebro.value.api_key = '';
  }
}

function aoMudarProvedorCerebro() {
  const prov = (configuracoesCerebro.value.provider || 'groq').toLowerCase();
  configuracoesCerebro.value.base_url = ENDPOINTS_PADRAO[prov] || ENDPOINTS_PADRAO.groq;
  configuracoesCerebro.value.api_key = configuracoesCerebro.value.saved_keys?.[prov] || '';

  const lista = modelosDoProvedorAtual(prov);
  const primeiroValido = lista.find((m) => m.value !== 'CUSTOM_INPUT');
  if (primeiroValido) {
    configuracoesCerebro.value.model = primeiroValido.value;
    opcaoModeloSelecionado.value = primeiroValido.value;
    modeloCustomizado.value = '';
  } else {
    opcaoModeloSelecionado.value = 'CUSTOM_INPUT';
    modeloCustomizado.value = '';
  }

  resultadoTesteIA.value = null;
  feedbackSalvamento.value = null;
  testResult.value = null;
}

function aoMudarModeloCerebro() {
  if (opcaoModeloSelecionado.value && opcaoModeloSelecionado.value !== 'CUSTOM_INPUT') {
    configuracoesCerebro.value.model = opcaoModeloSelecionado.value;
  } else if (opcaoModeloSelecionado.value === 'CUSTOM_INPUT' && modeloCustomizado.value) {
    configuracoesCerebro.value.model = modeloCustomizado.value.trim();
  }
}

// 7. Chamadas de API ao Servidor (Rotas Relativas)
async function carregarModelosHomologados(forcarAtualizacao = false) {
  sincronizandoGist.value = true;
  try {
    const res = await fetch(`/api/v1/brain-config/models${forcarAtualizacao ? '?refresh=true' : ''}`);
    const data = await res.json();
    const novosModelos = data.models || data.catalog;
    if (novosModelos && typeof novosModelos === 'object') {
      modelosHomologados.value = novosModelos;
      fonteGist.value = data.source || 'github_gist';
      ultimaSincronizacao.value = data.syncedAt || new Date().toISOString();
    }
    if (data.endpoints) {
      Object.assign(ENDPOINTS_PADRAO, data.endpoints);
    }
    sincronizarSelecaoModelo();
  } catch (err) {
    console.warn('Aviso ao sincronizar modelos:', err);
  } finally {
    sincronizandoGist.value = false;
  }
}

async function buscarConfiguracoesCerebro() {
  try {
    const res = await fetch('/api/v1/brain-config');
    const json = await res.json();
    if (json.success && json.data) {
      configuracoesCerebro.value = {
        ...configuracoesCerebro.value,
        ...json.data,
        saved_keys: json.data.saved_keys || {}
      };

      if (configuracoesCerebro.value.system_prompt) {
        configuracoesCerebro.value.system_prompt = configuracoesCerebro.value.system_prompt
          .replace(/^"|"$/g, '')
          .replace(/\\"/g, '"');
      }

      sincronizarSelecaoModelo();
    }
  } catch (err) {
    console.error('Erro ao buscar configuração do cérebro:', err);
  }
}

async function testarConexaoIA() {
  testandoConexao.value = true;
  feedbackSalvamento.value = null;
  resultadoTesteIA.value = null;
  testResult.value = null;

  try {
    const modeloFinal =
      opcaoModeloSelecionado.value === 'CUSTOM_INPUT'
        ? modeloCustomizado.value.trim()
        : opcaoModeloSelecionado.value;

    const payload = {
      provider: configuracoesCerebro.value.provider || 'groq',
      model: modeloFinal || configuracoesCerebro.value.model || 'llama-3.3-70b-versatile',
      api_key: configuracoesCerebro.value.api_key || '',
      base_url: configuracoesCerebro.value.base_url || '',
      temperature: Number(configuracoesCerebro.value.temperature ?? 0.2)
    };

    const res = await fetch('/api/v1/brain-config/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const json = await res.json().catch(() => ({}));

    if (res.ok && json.success) {
      const msg = '⚡ Conexão com o provedor estabelecida com sucesso!';
      feedbackSalvamento.value = { tipo: 'sucesso', mensagem: msg };
      resultadoTesteIA.value = { success: true, message: msg };
      testResult.value = { success: true, message: msg };
    } else {
      const msg = `❌ Erro no teste: ${json.error || 'Falha na resposta da API'}`;
      feedbackSalvamento.value = { tipo: 'erro', mensagem: msg };
      resultadoTesteIA.value = { success: false, message: msg };
      testResult.value = { success: false, message: msg };
    }
  } catch (err: any) {
    const msg = `❌ Erro de rede: ${err.message}`;
    feedbackSalvamento.value = { tipo: 'erro', mensagem: msg };
    resultadoTesteIA.value = { success: false, message: msg };
    testResult.value = { success: false, message: msg };
  } finally {
    testandoConexao.value = false;
  }
}

async function salvarConfiguracoesCerebro() {
  salvandoCerebro.value = true;
  feedbackSalvamento.value = null;
  resultadoTesteIA.value = null;
  testResult.value = null;

  try {
    const modeloFinal =
      opcaoModeloSelecionado.value === 'CUSTOM_INPUT'
        ? modeloCustomizado.value.trim()
        : opcaoModeloSelecionado.value;

    const promptLimpo = (configuracoesCerebro.value.system_prompt || '')
      .replace(/^"|"$/g, '')
      .replace(/\\"/g, '"');

    const payload = {
      agent_name: configuracoesCerebro.value.agent_name || 'JARVIS',
      provider: configuracoesCerebro.value.provider || 'groq',
      model: modeloFinal || configuracoesCerebro.value.model || 'llama-3.3-70b-versatile',
      api_key: configuracoesCerebro.value.api_key || '',
      base_url: configuracoesCerebro.value.base_url || '',
      server_base_url: configuracoesCerebro.value.server_base_url || 'http://localhost:3333',
      temperature: Number(configuracoesCerebro.value.temperature ?? 0.2),
      system_prompt: promptLimpo
    };

    const res = await fetch('/api/v1/brain-config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const json = await res.json().catch(() => ({}));

    if (res.ok && (json.success || json.data)) {
      const msg = '💾 Configurações do JARVIS salvas e aplicadas com sucesso!';
      feedbackSalvamento.value = { tipo: 'sucesso', mensagem: msg };
      testResult.value = { success: true, message: msg };
    } else {
      throw new Error(json.error || `HTTP ${res.status}: Servidor rejeitou a atualização`);
    }
  } catch (err: any) {
    console.error('Falha ao salvar Cérebro Central:', err);
    const msg = `❌ Erro ao salvar: ${err.message}`;
    feedbackSalvamento.value = { tipo: 'erro', mensagem: msg };
    testResult.value = { success: false, message: msg };
  } finally {
    salvandoCerebro.value = false;
  }
}

function formatarHora(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR');
  } catch {
    return iso;
  }
}

onMounted(async () => {
  await carregarModelosHomologados(true);
  await buscarConfiguracoesCerebro();
});
</script>

<style scoped>
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 24px;
  border-bottom: 1px solid #1e293b;
  padding-bottom: 16px;
}

.section-header h1 {
  margin: 0 0 6px 0;
  font-size: 1.35rem;
  line-height: 1.25;
}

.section-header p {
  margin: 0;
  color: #94a3b8;
  font-size: 0.88rem;
}

.gist-sync-box {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.sync-meta {
  color: #94a3b8;
  font-size: 0.75rem;
}

.card {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 20px;
}

.form-group {
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.form-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
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

.saved-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.68rem;
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}

.custom-model-box {
  background: rgba(56, 189, 248, 0.08);
  border: 1px dashed #38bdf8;
  border-radius: 8px;
  padding: 12px;
}

.actions-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 16px;
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

.btn-test {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid #10b981;
  padding: 10px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: bold;
}

.btn-secondary {
  background: #1e293b;
  color: #e2e8f0;
  border: 1px solid #334155;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
}

.alert-box {
  padding: 10px 14px;
  border-radius: 6px;
  margin-top: 14px;
  font-size: 0.82rem;
}

.alert-success {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
  border: 1px solid #22c55e;
}

.alert-error {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid #ef4444;
}

@media (max-width: 768px) {
  .section-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .gist-sync-box {
    align-items: flex-start;
    width: 100%;
  }
  .form-row {
    flex-direction: column;
    gap: 0;
  }
}
</style>
