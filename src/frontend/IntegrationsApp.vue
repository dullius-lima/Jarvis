<template>
  <div class="settings-layout">
    
    <!-- BARRA LATERAL ESQUERDA -->
    <aside class="sidebar">
      <div class="brand">
        <h2>⚡ n8n Core Admin</h2>
        <a href="/" class="back-link">← Voltar ao Dashboard Neural</a>
      </div>

      <nav class="nav-menu">
        <button 
          @click="currentTab = 'agents'" 
          :class="{ active: currentTab === 'agents' }"
          class="nav-item"
        >
          🤖 Agentes & Nós Criados
        </button>

        <button 
          @click="currentTab = 'brain'" 
          :class="{ active: currentTab === 'brain' }"
          class="nav-item"
        >
          🧠 Motor do Cérebro Central
        </button>

        <button 
          @click="currentTab = 'templates'" 
          :class="{ active: currentTab === 'templates' }"
          class="nav-item"
        >
          🔌 Hub de Modelos & Conectores
        </button>
      </nav>

      <div class="sidebar-footer">
        <button v-if="currentTab === 'agents'" @click="openNewAgentModal" class="btn-primary">
          + Criar Novo Agente / Nó
        </button>
      </div>
    </aside>

    <!-- PAINEL CENTRAL DE CONTEÚDO -->
    <main class="content-area">
      
      <!-- ABA 1: LISTAGEM DE NÓS & AGENTES -->
      <section v-if="currentTab === 'agents'">
        <header class="section-header">
          <h1>Agentes & Conectores Ativos no Ecossistema</h1>
          <p>Gerencie todos os nós integrados ao corpo neural (SNC / SNP) com execução via IA, Código ou APIs externas.</p>
        </header>

        <div class="grid-cards">
          <div v-for="agent in agents" :key="agent.id" class="card">
            <div class="card-header">
              <span class="card-icon">{{ agent.icon || '🤖' }}</span>
              <div>
                <h3 class="card-title">{{ agent.name }}</h3>
                <span class="card-subtitle">
                  <span v-if="agent.agent_type === 'code'" class="type-badge code">⚡ Código TypeScript</span>
                  <span v-else-if="agent.agent_type === 'api'" class="type-badge api">🔌 Conector API / HTTP</span>
                  <span v-else class="type-badge llm">🤖 {{ agent.provider || 'openai' }} • {{ agent.model || 'gpt-4o-mini' }}</span>
                </span>
              </div>
            </div>

            <p class="card-desc">{{ agent.description || 'Sem descrição informada.' }}</p>

            <div class="card-footer">
              <span class="badge" :class="{ active: agent.is_active }">
                {{ agent.is_active ? 'Ativo' : 'Inativo' }}
              </span>
              <button @click="editAgent(agent)" class="btn-secondary">Editar Configurações</button>
            </div>
          </div>
        </div>
      </section>

      <!-- ABA 2: MOTOR DO CÉREBRO CENTRAL (SNC) -->
      <section v-if="currentTab === 'brain'">
        <header class="section-header">
          <h1>Configuração da LLM do Cérebro Central (SNC)</h1>
          <p>Escolha qualquer inteligência artificial do mercado para atuar como o cérebro orquestrador do sistema.</p>
        </header>

        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 24px; max-width: 650px;">
          <div class="form-group">
            <label>Provedor Principal</label>
            <select v-model="brainSettings.provider" @change="applyProviderDefaults" class="input-field type-select">
              <option value="groq">Groq (Ultra-Rápido / Free Tier)</option>
              <option value="openai">OpenAI Oficial (GPT-4o, GPT-4o-mini, o3-mini)</option>
              <option value="ollama">Ollama (100% Local / Offline no Servidor)</option>
              <option value="deepseek">DeepSeek Oficial (V3, R1)</option>
              <option value="openrouter">OpenRouter (+200 modelos via 1 endpoint)</option>
              <option value="custom">Endpoint Customizado (vLLM / LM Studio / Proxy)</option>
            </select>
          </div>

          <div class="form-group">
            <label>Modelo Selecionado</label>
            <input type="text" v-model="brainSettings.model" class="input-field" placeholder="ex: llama-3.3-70b-versatile, gpt-4o, deepseek-chat" />
          </div>

          <div class="form-group">
            <label>Chave de API (API Key)</label>
            <input type="password" v-model="brainSettings.api_key" class="input-field" placeholder="Cole aqui a chave de API" />
          </div>

          <div class="form-group">
            <label>Base URL do Provedor</label>
            <input type="text" v-model="brainSettings.base_url" class="input-field" placeholder="https://api.groq.com/openai/v1" />
          </div>

          <div class="form-group">
            <label>Temperatura (Criatividade / Foco)</label>
            <input type="number" step="0.1" min="0" max="1" v-model.number="brainSettings.temperature" class="input-field" />
          </div>

          <button @click="saveBrainSettings" class="btn-primary" style="margin-top: 15px;">
            💾 Salvar e Atualizar Cérebro Central
          </button>
        </div>
      </section>

      <!-- ABA 3: HUB DE CONECTORES EXTERNOS -->
      <section v-if="currentTab === 'templates'">
        <header class="section-header">
          <h1>Hub de Modelos & Conectores Pré-estruturados</h1>
          <p>Conecte integrações externas padronizadas prontas para disparo pelo orquestrador.</p>
        </header>

        <div class="grid-cards">
          <div v-for="tmpl in predefinedTemplates" :key="tmpl.id" class="card">
            <div class="card-header">
              <span class="card-icon">{{ tmpl.icon }}</span>
              <div>
                <h3 class="card-title">{{ tmpl.name }}</h3>
                <span class="card-subtitle">{{ tmpl.category }}</span>
              </div>
            </div>
            <p class="card-desc">{{ tmpl.desc }}</p>
            <div class="card-footer">
              <button @click="applyTemplate(tmpl)" class="btn-secondary">Clonar e Configurar</button>
            </div>
          </div>
        </div>
      </section>

    </main>

    <!-- MODAL EXPANSIVO DE CRIAÇÃO / EDIÇÃO UNIVERSAL -->
    <div v-if="selectedAgent" class="modal-overlay">
      <div class="modal-box">
        
        <div class="modal-header">
          <h3>{{ isNewAgent ? '✨ Criar Novo Agente / Nó' : '⚙️ Configurar: ' + selectedAgent.name }}</h3>
          <button @click="selectedAgent = null" class="btn-close">✕</button>
        </div>

        <!-- 1. IDENTIFICAÇÃO DO NÓ -->
        <div class="form-row">
          <div class="form-group" style="flex: 0 0 65px;">
            <label>Ícone</label>
            <input type="text" v-model="selectedAgent.icon" class="input-field" style="text-align: center; font-size: 1.2rem;" />
          </div>
          <div class="form-group" style="flex: 1;">
            <label>Nome do Agente ou Serviço</label>
            <input type="text" v-model="selectedAgent.name" class="input-field" placeholder="Ex: Analista Financeiro B3, Bot Telegram, Coletor MQTT" />
          </div>
        </div>

        <div class="form-group">
          <label>Identificador Único (Slug para Tool Calling do Cérebro Central)</label>
          <input type="text" v-model="selectedAgent.slug" :disabled="!isNewAgent" class="input-field" placeholder="ex: analista_b3, alert_telegram_http" />
        </div>

        <!-- 2. SELETOR DE ARQUITETURA DO AGENTE -->
        <div class="form-group">
          <label style="color: #38bdf8; font-weight: bold;">Tipo de Execução do Nó</label>
          <select v-model="selectedAgent.agent_type" class="input-field type-select">
            <option value="llm">🤖 Agente Cognitivo (LLM / Raciocínio por IA)</option>
            <option value="code">⚡ Agente Determinístico (Código / Script TypeScript)</option>
            <option value="api">🔌 Agente de Integração Externa (HTTP / Webhook / MQTT / GraphQL)</option>
          </select>
        </div>

        <!-- 3A. OPÇÕES SE FOR IA (LLM) -->
        <div v-if="selectedAgent.agent_type === 'llm'" class="dynamic-panel llm-border">
          <div class="form-row">
            <div class="form-group">
              <label>Provedor de LLM</label>
              <select v-model="selectedAgent.provider" class="input-field">
                <option value="groq">Groq (Ultra-Rápido / Free Tier)</option>
                <option value="openai">OpenAI (GPT-4o, GPT-4o-mini)</option>
                <option value="deepseek">DeepSeek (V3, R1)</option>
                <option value="ollama">Ollama (Local / Offline no Servidor)</option>
                <option value="openrouter">OpenRouter (Acesso a +200 modelos)</option>
                <option value="custom">Endpoint Customizado (vLLM / LM Studio)</option>
              </select>
            </div>

            <div class="form-group">
              <label>Modelo</label>
              <input type="text" v-model="selectedAgent.model" class="input-field" placeholder="ex: llama-3.3-70b-versatile, gpt-4o-mini" />
            </div>
          </div>

          <div class="form-group">
            <label>Chave de API Individual (API Key salva no banco)</label>
            <input type="password" v-model="selectedAgent.api_key" class="input-field" placeholder="sk-... ou gsk_... (opcional para Ollama local)" />
          </div>

          <div class="form-group">
            <label>Base URL Customizada (Opcional)</label>
            <input type="text" v-model="selectedAgent.base_url" class="input-field" placeholder="ex: http://localhost:11434/v1" />
          </div>

          <div class="form-group">
            <label>Diretriz / System Prompt (Personalidade e Regras de Negócio)</label>
            <textarea v-model="selectedAgent.system_prompt" rows="3" class="input-field" placeholder="Você é um especialista em... Responda de forma analítica e objetiva."></textarea>
          </div>
        </div>

        <!-- 3B. OPÇÕES SE FOR CÓDIGO / SCRIPT -->
        <div v-if="selectedAgent.agent_type === 'code'" class="dynamic-panel code-border">
          <div class="form-group">
            <label>Nome do Handler Técnico (src/services/agents/)</label>
            <input type="text" v-model="selectedAgent.script_handler" class="input-field" placeholder="ex: runFinanceAgent, calculateBazin, checkServerDocker" />
          </div>

          <div class="form-group">
            <label>Código do Script em Linha (JavaScript / TypeScript)</label>
            <textarea 
              v-model="selectedAgent.code_snippet" 
              rows="6" 
              class="input-field code-editor" 
              placeholder="// Execute sua rotina lógica aqui sem custos de tokens:&#10;async function execute(input) {&#10;  const result = input.currentPrice * 1.05;&#10;  return { status: 'sucesso', valorCalculado: result };&#10;}"
            ></textarea>
          </div>
          <p class="panel-hint">⚡ Scripts determinísticos rodam em milissegundos com consumo zero de tokens de IA.</p>
        </div>

        <!-- 3C. OPÇÕES SE FOR INTEGRAÇÃO / API -->
        <div v-if="selectedAgent.agent_type === 'api'" class="dynamic-panel api-border">
          <div class="form-row">
            <div class="form-group" style="flex: 0 0 100px;">
              <label>Protocolo</label>
              <select v-model="selectedAgent.http_method" class="input-field">
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="MQTT">MQTT</option>
                <option value="GRAPHQL">GraphQL</option>
              </select>
            </div>

            <div class="form-group" style="flex: 1;">
              <label>Endpoint / URL do Webhook ou Broker</label>
              <input type="text" v-model="selectedAgent.endpoint_url" class="input-field" placeholder="https://api.meuservico.com/v1/... ou mqtt://localhost:1883" />
            </div>
          </div>

          <div class="form-group">
            <label>Cabeçalho de Autorização / Token Bearer (Opcional)</label>
            <input type="password" v-model="selectedAgent.auth_token" class="input-field" placeholder="Bearer eyJhbGciOi..." />
          </div>

          <div class="form-group">
            <label>Payload Padrão (JSON de entrada opcional)</label>
            <textarea v-model="selectedAgent.payload_template" rows="3" class="input-field code-editor" placeholder='{ "event": "alert_trigger", "priority": "high" }'></textarea>
          </div>
        </div>

        <!-- 4. DESCRIÇÃO PARA O CÉREBRO CENTRAL (TOOL-CALLING) -->
        <div class="form-group">
          <label>Quando o Cérebro Central deve acionar este nó? (Descrição da Tool)</label>
          <textarea v-model="selectedAgent.description" rows="2" class="input-field" placeholder="Ex: Acione este nó sempre que o usuário pedir cotação de ativos na B3, auditoria de servidores ou disparar mensagens."></textarea>
        </div>

        <!-- BOTÕES DE AÇÃO -->
        <div class="modal-actions">
          <button @click="selectedAgent = null" class="btn-secondary">Cancelar</button>
          <button @click="saveAgent" class="btn-primary">Salvar Agente / Nó</button>
        </div>

      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const currentTab = ref<'agents' | 'brain' | 'templates'>('agents');
const agents = ref<any[]>([]);
const selectedAgent = ref<any>(null);
const isNewAgent = ref(false);

const brainSettings = ref({
  provider: 'groq',
  model: 'llama-3.3-70b-versatile',
  api_key: '',
  base_url: 'https://api.groq.com/openai/v1',
  temperature: 0.2
});

const defaultEndpoints: Record<string, { url: string; model: string }> = {
  groq: { url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  openai: { url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  ollama: { url: 'http://localhost:11434/v1', model: 'llama3.1:8b' },
  deepseek: { url: 'https://api.deepseek.com', model: 'deepseek-chat' },
  openrouter: { url: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-3.5-sonnet' },
  custom: { url: '', model: '' }
};

const predefinedTemplates = ref([
  { id: 1, name: 'Google Sheets & Drive', category: 'Google Workspace', icon: '📁', desc: 'Leitura e inserção automática de linhas em planilhas do Google.', type: 'api', method: 'POST', endpoint: 'https://sheets.googleapis.com/v4/spreadsheets' },
  { id: 2, name: 'Microsoft 365 & Teams', category: 'Microsoft Office', icon: '📑', desc: 'Disparo de mensagens em canais corporativos e manipulação do OneDrive.', type: 'api', method: 'POST', endpoint: 'https://graph.microsoft.com/v1.0/teams' },
  { id: 3, name: 'Broker MQTT / Home Assistant', category: 'IoT Residencial', icon: '📡', desc: 'Controle de luzes, tomadas e robôs aspiradores via rede MQTT local.', type: 'api', method: 'MQTT', endpoint: 'mqtt://192.168.1.100:1883' },
  { id: 4, name: 'Agente de Finanças (Bazin / B3)', category: 'Script Determinístico', icon: '📈', desc: 'Cálculo de margem de segurança e dividend yield instantâneo em TypeScript.', type: 'code', handler: 'runFinanceAgent' },
  { id: 5, name: 'Monitor de Servidores OCI', category: 'DevOps / SRE', icon: '🛠️', desc: 'Varredura de CPU, RAM e integridade de containers em código nativo.', type: 'code', handler: 'runInfraAgent' },
]);

async function fetchAgents() {
  try {
    const res = await fetch('/api/v1/agents');
    const json = await res.json();
    if (json.success) agents.value = json.data;
  } catch (err) {
    console.error('Falha ao obter lista de agentes:', err);
  }
}

function applyProviderDefaults() {
  const defaults = defaultEndpoints[brainSettings.value.provider];
  if (defaults) {
    if (defaults.url) brainSettings.value.base_url = defaults.url;
    if (defaults.model) brainSettings.value.model = defaults.model;
  }
}

async function fetchBrainSettings() {
  try {
    const res = await fetch('/api/v1/brain-config');
    const json = await res.json();
    if (json.success && json.data) {
      brainSettings.value = json.data;
    }
  } catch (err) {
    console.error('Falha ao obter configuração do Cérebro:', err);
  }
}

async function saveBrainSettings() {
  try {
    const res = await fetch('/api/v1/brain-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(brainSettings.value)
    });
    const json = await res.json();
    if (json.success) {
      alert('🧠 Cérebro Central reconfigurado com sucesso!');
    } else {
      alert('Erro: ' + json.error);
    }
  } catch (err: any) {
    alert('Erro ao salvar: ' + err.message);
  }
}

function openNewAgentModal() {
  isNewAgent.value = true;
  selectedAgent.value = {
    name: '',
    slug: 'node_' + Date.now().toString().slice(-4),
    agent_type: 'llm',
    description: '',
    system_prompt: '',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    api_key: '',
    base_url: '',
    script_handler: '',
    code_snippet: '',
    http_method: 'POST',
    endpoint_url: '',
    auth_token: '',
    payload_template: '',
    icon: '🤖',
    is_active: true
  };
}

function editAgent(agent: any) {
  isNewAgent.value = false;
  selectedAgent.value = { 
    ...agent,
    agent_type: agent.agent_type || (agent.script_handler ? 'code' : (agent.endpoint_url ? 'api' : 'llm'))
  };
}

function applyTemplate(tmpl: any) {
  isNewAgent.value = true;
  selectedAgent.value = {
    name: tmpl.name,
    slug: tmpl.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    agent_type: tmpl.type,
    description: tmpl.desc,
    system_prompt: tmpl.type === 'llm' ? 'Você é um agente especialista...' : '',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    api_key: '',
    base_url: '',
    script_handler: tmpl.handler || '',
    code_snippet: '',
    http_method: tmpl.method || 'POST',
    endpoint_url: tmpl.endpoint || '',
    auth_token: '',
    payload_template: '',
    icon: tmpl.icon,
    is_active: true
  };
}

async function saveAgent() {
  const isCreation = isNewAgent.value;
  const endpoint = isCreation ? '/api/v1/agents' : `/api/v1/agents/${selectedAgent.value.id}`;
  const method = isCreation ? 'POST' : 'PUT';

  try {
    const res = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selectedAgent.value)
    });
    const result = await res.json();
    if (result.success) {
      selectedAgent.value = null;
      await fetchAgents();
    } else {
      alert(result.error || 'Erro ao processar.');
    }
  } catch (err: any) {
    alert(`Erro na requisição: ${err.message}`);
  }
}

// Inicializa chamando as buscas no ciclo de montagem único
onMounted(() => {
  fetchAgents();
  fetchBrainSettings();
});
</script>

<style scoped>
.settings-layout {
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
  padding: 20px;
  display: flex;
  flex-direction: column;
}
.brand h2 {
  font-size: 1.1rem;
  color: #38bdf8;
  margin: 0 0 6px 0;
}
.back-link {
  color: #94a3b8;
  text-decoration: none;
  font-size: 0.8rem;
  display: block;
  margin-bottom: 24px;
}
.back-link:hover { color: #38bdf8; }
.nav-menu {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}
.nav-item {
  background: transparent;
  border: 1px solid transparent;
  color: #94a3b8;
  padding: 10px 14px;
  border-radius: 8px;
  text-align: left;
  cursor: pointer;
  font-size: 0.88rem;
}
.nav-item.active {
  background: #1e293b;
  color: #38bdf8;
  border-color: #334155;
}
.sidebar-footer { padding-top: 15px; }
.btn-primary {
  width: 100%;
  background: #0284c7;
  color: white;
  border: none;
  padding: 10px;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
}
.btn-secondary {
  background: #1e293b;
  color: #cbd5e1;
  border: 1px solid #334155;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
}
.content-area {
  flex: 1;
  padding: 30px 40px;
  overflow-y: auto;
}
.section-header h1 { margin: 0 0 6px 0; font-size: 1.4rem; color: #f8fafc; }
.section-header p { margin: 0 0 24px 0; color: #94a3b8; font-size: 0.9rem; }
.grid-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}
.card {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 10px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.card-header { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
.card-icon { font-size: 1.6rem; }
.card-title { margin: 0; font-size: 1rem; color: #f8fafc; }
.card-subtitle { font-size: 0.75rem; margin-top: 2px; display: block; }
.type-badge { padding: 2px 6px; border-radius: 4px; font-weight: 500; font-size: 0.7rem; }
.type-badge.llm { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
.type-badge.code { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
.type-badge.api { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
.card-desc { font-size: 0.85rem; color: #94a3b8; line-height: 1.4; margin-bottom: 16px; }
.card-footer { display: flex; justify-content: space-between; align-items: center; }
.badge {
  font-size: 0.7rem;
  padding: 3px 8px;
  border-radius: 12px;
  background: #334155;
  color: #cbd5e1;
}
.badge.active { background: rgba(34, 197, 94, 0.2); color: #22c55e; }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.75);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 50;
}
.modal-box {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 24px;
  width: 580px;
  max-height: 90vh;
  overflow-y: auto;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}
.modal-header h3 { margin: 0; color: #38bdf8; font-size: 1.1rem; }
.btn-close { background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 1.2rem; }
.form-group { margin-bottom: 14px; }
.form-group label { display: block; font-size: 0.78rem; color: #94a3b8; margin-bottom: 4px; }
.input-field {
  width: 100%;
  padding: 8px 10px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 6px;
  color: white;
  box-sizing: border-box;
  font-size: 0.85rem;
}
.type-select { font-weight: bold; background: #0f2744; border-color: #0284c7; }
.dynamic-panel {
  padding: 12px;
  background: #090f1d;
  border-radius: 8px;
  margin-bottom: 14px;
}
.llm-border { border-left: 3px solid #38bdf8; }
.code-border { border-left: 3px solid #22c55e; }
.api-border { border-left: 3px solid #f59e0b; }
.code-editor {
  font-family: monospace;
  background: #020617;
  color: #38bdf8;
  resize: vertical;
}
.panel-hint { font-size: 0.72rem; color: #64748b; margin: 6px 0 0 0; }
.form-row { display: flex; gap: 10px; }
.form-row .form-group { flex: 1; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
</style>