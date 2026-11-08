<template>
  <section class="tab-section">
    <header class="section-header">
      <div>
        <h1>🤖 Agentes Especialistas &amp; Terminações Nervosas (SNP)</h1>
        <p>Crie especialistas cognitivos (LLM com chave própria para tokens), nós de API REST, servidores MCP ou scripts JS determinísticos.</p>
      </div>
      <button @click="abrirModalNovoAgente" class="btn-primary">+ Novo Especialista</button>
    </header>

    <div class="agents-grid">
      <div v-for="ag in listaAgentes" :key="ag.id || ag.slug" class="agent-card">
        <div class="agent-card-header">
          <div>
            <span class="agent-type-tag">{{ (ag.agent_type || 'llm').toUpperCase() }}</span>
            <h3>{{ ag.icon || '🤖' }} {{ ag.name }}</h3>
            <code class="slug-code">slug: {{ ag.slug }}</code>
          </div>
          <span :class="['status-dot', ag.is_active !== false ? 'online' : 'offline']"></span>
        </div>

        <p class="agent-desc">{{ ag.description || ag.system_prompt || 'Sem descrição configurada.' }}</p>

        <div class="agent-meta">
          <span v-if="ag.provider && ag.agent_type !== 'code'" class="meta-row">
            🧠 {{ String(ag.provider).toUpperCase() }} ({{ ag.model }})
            <span v-if="ag.api_key" class="key-badge dedicated" title="Consumo isolado: debitado na chave individual deste agente">🔑 Chave Própria</span>
            <span v-else class="key-badge inherited" title="Herda a chave mestre do JARVIS">🔑 Chave do Cérebro</span>
          </span>
          <span v-if="ag.endpoint_url">🌐 {{ ag.endpoint_url }}</span>
          <span v-if="ag.next_agent_slug" class="chain-badge">🔗 Próximo Nó: {{ ag.next_agent_slug }}</span>
        </div>

        <div v-if="Array.isArray(ag.tools) && ag.tools.length" class="tools-chips">
          <span v-for="t in ag.tools" :key="t" class="tool-chip">🛠️ {{ t }}</span>
        </div>

        <div class="agent-card-actions">
          <button @click="abrirModalEditarAgente(ag)" class="btn-secondary">✏️ Editar</button>
          <button @click="excluirAgenteEspecialista(ag)" class="btn-danger">🗑️ Excluir</button>
        </div>
      </div>
    </div>

    <!-- MODAL DE CRIAR / EDITAR AGENTE -->
    <div v-if="exibirModalAgente" class="modal-backdrop" @click.self="exibirModalAgente = false">
      <div class="modal-card">
        <div class="modal-header">
          <h2>
            {{ agenteEmEdicao.id ? `✏️ Editar Agente: ${agenteEmEdicao.name}` : '➕ Criar Novo Agente Especialista' }}
          </h2>
          <button @click="exibirModalAgente = false" class="close-modal-btn">✕</button>
        </div>

        <div class="modal-body">
          <!-- ETAPA 1: IDENTIDADE -->
          <div class="step-section">
            <div class="step-badge">1. Identidade &amp; Papel no Ecossistema</div>

            <div class="form-row">
              <div class="form-group icon-group">
                <label>Ícone</label>
                <input type="text" v-model="agenteEmEdicao.icon" class="input-field icon-input" placeholder="🤖" />
              </div>

              <div class="form-group" style="flex: 2;">
                <label>Nome do Agente Especialista</label>
                <input type="text" v-model="agenteEmEdicao.name" class="input-field" placeholder="Ex: Analista B3, Automação Casa..." />
              </div>

              <div class="form-group" style="flex: 2;">
                <label>Modo de Operação</label>
                <select v-model="agenteEmEdicao.agent_type" class="input-field">
                  <option value="llm">🧠 Agente de IA Cognitivo (LLM + Tools)</option>
                  <option value="code">💻 Nó de Script JavaScript (0 Tokens)</option>
                  <option value="api">🌐 Nó Direto REST API / Webhook</option>
                  <option value="mcp">🔌 Cliente Direto MCP</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label style="color: #38bdf8; font-weight: 700;">
                🎯 Quando o JARVIS deve acionar este Agente? (Descrição para Tool Calling)
              </label>
              <input
                type="text"
                v-model="agenteEmEdicao.description"
                class="input-field"
                placeholder="Ex: Acione quando o usuário pedir cotações da B3, valuation ou análise de ativos."
              />
            </div>
          </div>

          <!-- ETAPA 2A: AGENTE COGNITIVO (LLM COM CHAVE INDIVIDUAL E TESTADOR) -->
          <div v-if="agenteEmEdicao.agent_type === 'llm'" class="step-section">
            <div class="step-badge">2. Cérebro do Agente (LLM, Chave Individual &amp; Prompt)</div>

            <div class="form-row">
              <div class="form-group">
                <label>Provedor de IA do Agente</label>
                <select v-model="agenteEmEdicao.provider" @change="aoMudarProvedorDoAgente" class="input-field">
                  <option value="groq">Groq (LPU Ultra-Rápido)</option>
                  <option value="gemini">Google Gemini (AI Studio)</option>
                  <option value="openai">OpenAI (GPT-4o / o3-mini)</option>
                  <option value="deepseek">DeepSeek (V3 / R1)</option>
                  <option value="openrouter">OpenRouter (Modelos Gratuitos :free)</option>
                  <option value="ollama">Ollama (Local Offline na VM)</option>
                </select>
              </div>

              <div class="form-group">
                <label>Modelo da IA</label>
                <select v-model="agenteEmEdicao.model" class="input-field">
                  <option
                    v-for="mod in modelosDoProvedor(agenteEmEdicao.provider)"
                    :key="mod.value"
                    :value="mod.value"
                  >
                    {{ mod.label }}
                  </option>
                </select>
              </div>

              <div class="form-group" style="max-width: 130px;">
                <label>Temperatura</label>
                <input type="number" step="0.1" min="0" max="1.5" v-model.number="agenteEmEdicao.temperature" class="input-field" />
              </div>
            </div>

            <div v-if="agenteEmEdicao.model === 'CUSTOM_INPUT'" class="form-group">
              <label>✍️ Digite o ID exato do Modelo</label>
              <input type="text" v-model="agenteEmEdicao.custom_model_id" class="input-field" placeholder="Ex: openai/gpt-oss-120b, llama-3.3-70b-versatile..." />
            </div>

            <div class="form-group">
              <label>
                Chave de API Individual deste Agente
                <small style="color: #94a3b8; font-weight: normal;">(Preencha para separar o consumo de tokens deste especialista no console do provedor)</small>
              </label>
              <div class="key-input-container">
                <input
                  type="password"
                  v-model="agenteEmEdicao.api_key"
                  class="input-field"
                  placeholder="gsk_..., AIza..., sk-... (Deixe vazio para herdar a chave do JARVIS)"
                  style="flex: 1;"
                />
                <button
                  type="button"
                  @click="testarIaDoAgente"
                  :disabled="isTestingAgentLlm"
                  class="btn-test"
                  style="padding: 9px 18px; white-space: nowrap;"
                >
                  {{ isTestingAgentLlm ? '⏳ Testando...' : '⚡ Testar IA' }}
                </button>
              </div>
            </div>

            <!-- Feedback Visual do Teste de Conexão da IA -->
            <div
              v-if="agentLlmTestFeedback"
              :class="['llm-test-feedback', agentLlmTestSuccess ? 'success' : 'error']"
            >
              {{ agentLlmTestFeedback }}
            </div>

            <div class="form-group" style="margin-top: 12px;">
              <label>Base URL Customizada (Opcional)</label>
              <input
                type="text"
                v-model="agenteEmEdicao.base_url"
                class="input-field"
                placeholder="Ex: https://api.groq.com/openai/v1 ou http://localhost:11434/v1"
              />
            </div>

            <div class="form-group">
              <label>System Prompt (Regras e Instruções do Especialista)</label>
              <textarea
                v-model="agenteEmEdicao.system_prompt"
                rows="4"
                class="input-field"
                placeholder="Ex: Você é um analista financeiro sênior especialista na B3. Responda em português direto e analítico..."
              ></textarea>
            </div>
          </div>

          <!-- ETAPA 2B: API DIRETA / MCP -->
          <div v-else-if="agenteEmEdicao.agent_type === 'api' || agenteEmEdicao.agent_type === 'mcp'" class="step-section">
            <div class="step-badge">2. Configuração da Requisição Direta ({{ agenteEmEdicao.agent_type.toUpperCase() }})</div>

            <div class="form-row">
              <div v-if="agenteEmEdicao.agent_type === 'api'" class="form-group" style="max-width: 130px;">
                <label>Método HTTP</label>
                <select v-model="agenteEmEdicao.http_method" class="input-field">
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>

              <div class="form-group" style="flex: 1;">
                <label v-pre>Endpoint URL (Aceita {{query}}, {{symbol}}, {{BASE_URL}})</label>
                <input
                  type="text"
                  v-model="agenteEmEdicao.endpoint_url"
                  class="input-field"
                  placeholder="Ex: https://brapi.dev/api/quote/{{symbol}}"
                />
              </div>

              <div class="form-group" style="max-width: 220px;">
                <label>Token Bearer / API Key</label>
                <input type="password" v-model="agenteEmEdicao.auth_token" class="input-field" placeholder="Token opcional..." />
              </div>
            </div>

            <div v-if="agenteEmEdicao.agent_type === 'api' && agenteEmEdicao.http_method !== 'GET'" class="form-group">
              <label v-pre>📦 Parâmetros JSON (Use {{query}} ou {{prompt}})</label>
              <textarea
                v-model="agenteEmEdicao.payload_template"
                rows="2"
                class="input-field"
                placeholder='Ex: {"ticker": "{{symbol}}", "pergunta": "{{query}}"}'
              ></textarea>
            </div>

            <div class="form-group">
              <label style="color: #10b981; font-weight: 700;">
                💬 Instrução de Resposta (Como extrair e apresentar os dados do JSON)
              </label>
              <textarea
                v-model="agenteEmEdicao.system_prompt"
                rows="3"
                class="input-field"
                placeholder="Ex: Extraia o preço atual e dividend yield e apresente de forma direta..."
              ></textarea>
            </div>
          </div>

          <!-- ETAPA 2C: SCRIPT JAVASCRIPT -->
          <div v-else-if="agenteEmEdicao.agent_type === 'code'" class="step-section">
            <div class="step-badge">2. Script JavaScript Determinístico (ZERO TOKENS)</div>
            <div class="form-group">
              <label>Código de Execução (Recebe `payload` e `env`)</label>
              <textarea
                v-model="agenteEmEdicao.code_snippet"
                rows="5"
                class="input-field"
                style="font-family: monospace;"
                placeholder="return { status: 'ok', recebido: payload };"
              ></textarea>
            </div>
          </div>

          <!-- ETAPA 3: FERRAMENTAS CONECTADAS -->
          <div class="step-section">
            <div class="tools-header-row">
              <div>
                <span class="step-badge" style="margin-bottom: 2px;">3. 🛠️ Ferramentas Conectadas</span>
                <p style="font-size: 12px; color: #94a3b8; margin: 4px 0 0 0;">
                  Selecione as tools que este agente tem autorização para disparar.
                </p>
              </div>
              <button
                type="button"
                @click="exibirCriadorDeFerramenta = !exibirCriadorDeFerramenta"
                class="btn-secondary"
              >
                {{ exibirCriadorDeFerramenta ? '✕ Fechar Criador' : '➕ Criar Nova Tool' }}
              </button>
            </div>

            <!-- CRIADOR INLINE DE TOOL -->
            <div v-if="exibirCriadorDeFerramenta" class="inline-tool-creator-box">
              <div class="form-row">
                <div class="form-group icon-group">
                  <label>Ícone</label>
                  <input type="text" v-model="rascunhoNovaFerramenta.icon" class="input-field icon-input" placeholder="🛠️" />
                </div>

                <div class="form-group" style="flex: 2;">
                  <label>Nome da Tool</label>
                  <input
                    type="text"
                    v-model="rascunhoNovaFerramenta.label"
                    class="input-field"
                    placeholder="Ex: Consultar Cotação / Webhook n8n"
                  />
                </div>

                <div class="form-group" style="flex: 1;">
                  <label>Tipo de Arquitetura</label>
                  <select v-model="rascunhoNovaFerramenta.tool_type" class="input-field">
                    <option value="http">🌐 HTTP / REST API</option>
                    <option value="mcp">🔌 Servidor MCP</option>
                    <option value="code">💻 Script JavaScript</option>
                    <option value="ssh">🖥️ Comando SSH</option>
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label>Quando a IA deve usar esta Tool? (Descrição para Tool Calling)</label>
                <input
                  type="text"
                  v-model="rascunhoNovaFerramenta.description"
                  class="input-field"
                  placeholder="Ex: Use para buscar o preço de ativos na B3..."
                />
              </div>

              <div v-if="rascunhoNovaFerramenta.tool_type === 'http'" class="form-row">
                <div class="form-group" style="max-width: 115px;">
                  <label>Método</label>
                  <select v-model="rascunhoNovaFerramenta.http_method" class="input-field" style="color: #10b981; font-weight: 700;">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>

                <div class="form-group" style="flex: 2;">
                  <label v-pre>Endpoint URL (Aceita {{query}}, {{symbol}}, {{BASE_URL}})</label>
                  <input
                    type="text"
                    v-model="rascunhoNovaFerramenta.endpoint_url"
                    class="input-field"
                    placeholder="https://..."
                  />
                </div>

                <div class="form-group" style="flex: 1;">
                  <label>Token Bearer / Key</label>
                  <input type="password" v-model="rascunhoNovaFerramenta.auth_token" class="input-field" placeholder="Token..." />
                </div>
              </div>

              <div v-if="feedbackCriadorFerramenta" style="font-size: 12px; color: #38bdf8; margin-bottom: 8px;">
                {{ feedbackCriadorFerramenta }}
              </div>

              <div class="actions-row" style="justify-content: flex-end;">
                <button type="button" @click="testarRascunhoDeFerramenta" class="btn-test">
                  ⚡ Testar Tool
                </button>
                <button type="button" @click="salvarFerramentaEVincularAoAgente" class="btn-primary">
                  💾 Salvar no Catálogo &amp; Vincular
                </button>
              </div>
            </div>

            <!-- CHECKBOXES DAS TOOLS -->
            <div class="tools-checkbox-grid">
              <div
                v-for="tool in catalogoFerramentasDisponiveis"
                :key="tool.id"
                class="tool-checkbox-card"
                :class="{ selected: Array.isArray(agenteEmEdicao.tools) && agenteEmEdicao.tools.includes(tool.id) }"
              >
                <label class="tool-label-click">
                  <input
                    type="checkbox"
                    :value="tool.id"
                    v-model="agenteEmEdicao.tools"
                  />
                  <span>{{ tool.icon || '🔌' }}</span>
                  <span class="tool-name-text">{{ tool.label }}</span>
                </label>

                <div class="tool-actions-box">
                  <span class="tool-badge-mini">{{ (tool.http_method || tool.tool_type || 'NÓ').toUpperCase() }}</span>
                  <button
                    type="button"
                    title="Excluir Conexão Permanentemente"
                    @click.stop.prevent="excluirConexaoDoCofre(tool.id, tool.label)"
                    class="btn-trash-inline"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- ETAPA 4: ENCADEAMENTO (PIPELINE) & CRON -->
          <div class="step-section">
            <div class="step-badge">4. Encadeamento Pipeline (Node-to-Node) &amp; Agendamento</div>
            <div class="form-row">
              <div class="form-group">
                <label>🔗 Encadear Saída para Próximo Agente (Opcional)</label>
                <select v-model="agenteEmEdicao.next_agent_slug" class="input-field">
                  <option :value="null">-- Nenhum (Retornar direto ao JARVIS) --</option>
                  <option
                    v-for="other in listaAgentes.filter((a) => a.slug !== agenteEmEdicao.slug)"
                    :key="other.slug"
                    :value="other.slug"
                  >
                    ➔ {{ other.name }} ({{ other.slug }})
                  </option>
                </select>
              </div>

              <div class="form-group">
                <label>⏰ Expressão Cron de Agendamento</label>
                <input type="text" v-model="agenteEmEdicao.cron_expression" class="input-field" placeholder="Ex: */15 * * * *" />
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button @click="exibirModalAgente = false" class="btn-secondary">Cancelar</button>
          <button @click="salvarAgenteEspecialista" class="btn-primary">💾 Salvar Especialista</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';

const ENDPOINTS_PADRAO: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434/v1'
};

const modelosPadrao: Record<string, Array<{ label: string; value: string }>> = {
  groq: [
    { label: '✍️ Inserir ID Manual da Groq', value: 'CUSTOM_INPUT' },
    { label: 'GPT-OSS 120B (Reasoning)', value: 'openai/gpt-oss-120b' },
    { label: 'Llama 3.3 70B Versatile', value: 'llama-3.3-70b-versatile' },
    { label: 'Llama 3.1 8B Instant', value: 'llama-3.1-8b-instant' }
  ],
  gemini: [
    { label: '✍️ Inserir ID Manual do Gemini', value: 'CUSTOM_INPUT' },
    { label: 'Gemini 2.5 Flash (Recomendado)', value: 'gemini-2.5-flash' },
    { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
    { label: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash' },
    { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' }
  ],
  openai: [
    { label: '✍️ Inserir ID Manual da OpenAI', value: 'CUSTOM_INPUT' },
    { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
    { label: 'GPT-4o', value: 'gpt-4o' },
    { label: 'o3-mini (Reasoning)', value: 'o3-mini' }
  ],
  deepseek: [
    { label: '✍️ Inserir ID Manual da DeepSeek', value: 'CUSTOM_INPUT' },
    { label: 'DeepSeek V3 (Chat)', value: 'deepseek-chat' },
    { label: 'DeepSeek R1 (Reasoner)', value: 'deepseek-reasoner' }
  ],
  openrouter: [
    { label: '✍️ Inserir ID Manual do OpenRouter', value: 'CUSTOM_INPUT' },
    { label: 'Llama 3.3 70B Instruct (:free)', value: 'meta-llama/llama-3.3-70b-instruct:free' },
    { label: 'DeepSeek R1 (:free)', value: 'deepseek/deepseek-r1:free' },
    { label: 'DeepSeek V3 (:free)', value: 'deepseek/deepseek-chat:free' },
    { label: 'Gemini 2.0 Flash (:free)', value: 'google/gemini-2.0-flash-exp:free' },
    { label: 'Qwen 2.5 72B Instruct (:free)', value: 'qwen/qwen-2.5-72b-instruct:free' }
  ],
  ollama: [
    { label: '✍️ Inserir ID Manual do Ollama', value: 'CUSTOM_INPUT' },
    { label: 'Llama 3.1 8B (Local)', value: 'llama3.1:8b' },
    { label: 'Qwen 2.5 Coder (Local)', value: 'qwen2.5-coder' },
    { label: 'Mistral 7B (Local)', value: 'mistral' }
  ]
};

const listaAgentes = ref<any[]>([]);
const exibirModalAgente = ref(false);
const editandoAgenteAtivo = ref(false);
const catalogoFerramentasDisponiveis = ref<any[]>([]);
const exibirCriadorDeFerramenta = ref(false);
const feedbackCriadorFerramenta = ref('');

// Estado reativo do testador de conexão da IA do Agente
const isTestingAgentLlm = ref(false);
const agentLlmTestFeedback = ref('');
const agentLlmTestSuccess = ref(false);

const rascunhoNovaFerramenta = reactive({
  icon: '🛠️',
  label: '',
  description: '',
  tool_type: 'http',
  http_method: 'GET',
  endpoint_url: '',
  auth_token: '',
  payload_template: '',
  code_snippet: ''
});

const agenteEmEdicao = ref<any>({
  id: null,
  name: '',
  slug: '',
  icon: '🤖',
  description: '',
  agent_type: 'llm',
  provider: 'groq',
  model: 'llama-3.3-70b-versatile',
  custom_model_id: '',
  temperature: 0.2,
  api_key: '',
  base_url: ENDPOINTS_PADRAO.groq,
  system_prompt: '',
  endpoint_url: '',
  http_method: 'POST',
  auth_token: '',
  payload_template: '',
  code_snippet: 'return { status: "ok", resultado: payload };',
  tools: [] as string[],
  next_agent_slug: null,
  cron_expression: '*/5 * * * *',
  is_active: true
});

function modelosDoProvedor(prov: string) {
  const chave = (prov || 'groq').toLowerCase();
  return modelosPadrao[chave] || [{ label: `✍️ Inserir ID Manual (${chave.toUpperCase()})`, value: 'CUSTOM_INPUT' }];
}

async function testarIaDoAgente() {
  if (!agenteEmEdicao.value) return;
  isTestingAgentLlm.value = true;
  agentLlmTestFeedback.value = '';
  agentLlmTestSuccess.value = false;

  const prov = (agenteEmEdicao.value.provider || 'groq').toLowerCase();
  const modelToTest =
    agenteEmEdicao.value.model === 'CUSTOM_INPUT' && agenteEmEdicao.value.custom_model_id?.trim()
      ? agenteEmEdicao.value.custom_model_id.trim()
      : agenteEmEdicao.value.model;

  try {
    const res = await fetch('/api/v1/brain-config/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: prov,
        model: modelToTest,
        api_key: agenteEmEdicao.value.api_key?.trim() || undefined,
        base_url: agenteEmEdicao.value.base_url?.trim() || undefined
      })
    });
    const json = await res.json();
    if (json.success) {
      agentLlmTestSuccess.value = true;
      agentLlmTestFeedback.value = `🟢 Conexão validada com sucesso! Provedor: ${json.provider?.toUpperCase()} | Modelo: ${json.usedModel || modelToTest}`;
    } else {
      agentLlmTestSuccess.value = false;
      agentLlmTestFeedback.value = `🔴 Erro: ${json.error || 'Credenciais recusadas pelo provedor.'}`;
    }
  } catch (err: any) {
    agentLlmTestSuccess.value = false;
    agentLlmTestFeedback.value = `🔴 Falha de rede: ${err.message}`;
  } finally {
    isTestingAgentLlm.value = false;
  }
}

async function carregarCatalogoDeFerramentas() {
  try {
    const res = await fetch('/api/v1/connectors');
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      catalogoFerramentasDisponiveis.value = json.data.map((item: any) => {
        const id = item.provider_key;
        const cfg = item.config || {};
        return {
          id,
          icon: item.icon || '🔌',
          label: item.name || id,
          description: item.description || cfg.description || '',
          http_method: cfg.http_method || item.http_method || 'GET',
          tool_type: cfg.tool_type || 'http',
          endpoint_url: cfg.endpoint_url || item.endpoint_url || ''
        };
      });
    }
  } catch (err) {
    console.warn('Falha ao carregar catálogo de ferramentas:', err);
  }
}

async function excluirConexaoDoCofre(chaveProvedor: string, nome?: string) {
  if (!confirm(`Deseja realmente EXCLUIR a conexão "${nome || chaveProvedor}" permanentemente?`)) return;

  try {
    const res = await fetch(`/api/v1/connectors/${encodeURIComponent(chaveProvedor)}`, {
      method: 'DELETE'
    });
    const json = await res.json();

    if (json.success) {
      catalogoFerramentasDisponiveis.value = catalogoFerramentasDisponiveis.value.filter(
        (t) => t.id.toLowerCase() !== chaveProvedor.toLowerCase()
      );
      if (Array.isArray(agenteEmEdicao.value.tools)) {
        agenteEmEdicao.value.tools = agenteEmEdicao.value.tools.filter(
          (k: string) => k.toLowerCase() !== chaveProvedor.toLowerCase()
        );
      }
      alert(`🗑️ Conexão "${nome || chaveProvedor}" removida com sucesso!`);
      await buscarAgentesEspecialistas();
    } else {
      alert(`Erro: ${json.error || 'Falha ao excluir conexão'}`);
    }
  } catch (err: any) {
    alert(`Erro de comunicação: ${err.message}`);
  }
}

async function testarRascunhoDeFerramenta() {
  if (rascunhoNovaFerramenta.tool_type !== 'code' && !rascunhoNovaFerramenta.endpoint_url.trim()) {
    feedbackCriadorFerramenta.value = '⚠️ Informe a Endpoint URL ou comando para testar.';
    return;
  }
  feedbackCriadorFerramenta.value = '⏳ Testando requisição da Tool...';
  try {
    const res = await fetch('/api/v1/connectors/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        testQuery: 'PETR4',
        config: {
          tool_type: rascunhoNovaFerramenta.tool_type,
          http_method: rascunhoNovaFerramenta.http_method,
          endpoint_url: rascunhoNovaFerramenta.endpoint_url.trim(),
          auth_token: rascunhoNovaFerramenta.auth_token.trim(),
          payload_template: rascunhoNovaFerramenta.payload_template.trim(),
          code_snippet: rascunhoNovaFerramenta.code_snippet
        }
      })
    });
    const json = await res.json();
    if (json.success) {
      feedbackCriadorFerramenta.value = `🟢 ${json.message || `Tool respondeu HTTP ${json.status || 200} em ${json.latencyMs || 0}ms!`}`;
    } else {
      feedbackCriadorFerramenta.value = `🔴 Erro: ${json.error || 'Status ' + (json.status || 500)}`;
    }
  } catch (err: any) {
    feedbackCriadorFerramenta.value = `🔴 Falha: ${err.message}`;
  }
}

async function salvarFerramentaEVincularAoAgente() {
  if (!rascunhoNovaFerramenta.label.trim()) {
    feedbackCriadorFerramenta.value = '⚠️ Digite um nome para a Ferramenta.';
    return;
  }

  const id = rascunhoNovaFerramenta.label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const payload = {
    provider_key: id,
    name: rascunhoNovaFerramenta.label.trim(),
    category: rascunhoNovaFerramenta.tool_type === 'mcp' ? 'MCP Tool' : 'Custom API Tool',
    icon: rascunhoNovaFerramenta.icon || '🛠️',
    description:
      rascunhoNovaFerramenta.description.trim() ||
      `Executa a ferramenta ${rascunhoNovaFerramenta.label.trim()}`,
    is_enabled: true,
    config: {
      tool_type: rascunhoNovaFerramenta.tool_type,
      http_method: rascunhoNovaFerramenta.http_method,
      endpoint_url: rascunhoNovaFerramenta.endpoint_url.trim(),
      auth_token: rascunhoNovaFerramenta.auth_token.trim(),
      payload_template: rascunhoNovaFerramenta.payload_template.trim(),
      code_snippet: rascunhoNovaFerramenta.code_snippet,
      description: rascunhoNovaFerramenta.description.trim()
    }
  };

  try {
    let res = await fetch('/api/v1/connectors', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok && res.status === 404) {
      res = await fetch('/api/v1/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    await carregarCatalogoDeFerramentas();

    if (agenteEmEdicao.value) {
      if (!Array.isArray(agenteEmEdicao.value.tools)) agenteEmEdicao.value.tools = [];
      if (!agenteEmEdicao.value.tools.includes(id)) {
        agenteEmEdicao.value.tools.push(id);
      }
    }

    rascunhoNovaFerramenta.label = '';
    rascunhoNovaFerramenta.description = '';
    rascunhoNovaFerramenta.endpoint_url = '';
    rascunhoNovaFerramenta.auth_token = '';
    rascunhoNovaFerramenta.payload_template = '';
    rascunhoNovaFerramenta.code_snippet = '';
    feedbackCriadorFerramenta.value = '';
    exibirCriadorDeFerramenta.value = false;
  } catch (err: any) {
    feedbackCriadorFerramenta.value = `🔴 Erro ao salvar: ${err.message}`;
  }
}

async function buscarAgentesEspecialistas() {
  try {
    const res = await fetch('/api/v1/agents');
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      listaAgentes.value = json.data.map((ag: any) => ({
        ...ag,
        tools: Array.isArray(ag.tools)
          ? ag.tools
          : typeof ag.tools === 'string'
          ? (() => {
              try {
                return JSON.parse(ag.tools);
              } catch {
                return [];
              }
            })()
          : []
      }));
    }
  } catch (err) {
    console.error('Erro ao carregar especialistas:', err);
  }
}

function abrirModalNovoAgente() {
  editandoAgenteAtivo.value = false;
  agentLlmTestFeedback.value = '';
  agentLlmTestSuccess.value = false;
  isTestingAgentLlm.value = false;

  agenteEmEdicao.value = {
    id: null,
    name: '',
    slug: '',
    icon: '🤖',
    description: '',
    agent_type: 'llm',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    custom_model_id: '',
    temperature: 0.2,
    api_key: '',
    base_url: ENDPOINTS_PADRAO.groq,
    system_prompt: '',
    endpoint_url: '',
    http_method: 'POST',
    auth_token: '',
    payload_template: '',
    code_snippet: 'return { status: "ok", resultado: payload };',
    tools: [] as string[],
    next_agent_slug: null,
    cron_expression: '*/5 * * * *',
    is_active: true
  };
  exibirModalAgente.value = true;
}

function abrirModalEditarAgente(ag: any) {
  editandoAgenteAtivo.value = true;
  agentLlmTestFeedback.value = '';
  agentLlmTestSuccess.value = false;
  isTestingAgentLlm.value = false;

  const prov = ag.provider || 'groq';
  const lista = modelosDoProvedor(prov);
  const existe = lista.some((m) => m.value === ag.model && m.value !== 'CUSTOM_INPUT');

  agenteEmEdicao.value = {
    ...ag,
    icon: ag.icon || '🤖',
    agent_type: ag.agent_type || 'llm',
    provider: prov,
    model: existe ? ag.model : 'CUSTOM_INPUT',
    custom_model_id: existe ? '' : ag.model || '',
    temperature: Number(ag.temperature ?? 0.2),
    api_key: ag.api_key || '',
    base_url: ag.base_url || ENDPOINTS_PADRAO[prov] || '',
    tools: Array.isArray(ag.tools) ? [...ag.tools] : [],
    next_agent_slug: ag.next_agent_slug || null,
    cron_expression: ag.cron_expression || '*/5 * * * *'
  };
  exibirModalAgente.value = true;
}

function aoMudarProvedorDoAgente() {
  const prov = (agenteEmEdicao.value.provider || 'groq').toLowerCase();
  agenteEmEdicao.value.base_url = ENDPOINTS_PADRAO[prov] || ENDPOINTS_PADRAO.groq;
  const lista = modelosDoProvedor(prov);
  const primeiroValido = lista.find((m) => m.value !== 'CUSTOM_INPUT');
  if (primeiroValido) {
    agenteEmEdicao.value.model = primeiroValido.value;
  } else {
    agenteEmEdicao.value.model = 'CUSTOM_INPUT';
  }
  agentLlmTestFeedback.value = '';
}

async function salvarAgenteEspecialista() {
  try {
    if (!agenteEmEdicao.value.name?.trim()) {
      alert('Informe o nome do especialista.');
      return;
    }
    if (!agenteEmEdicao.value.slug?.trim()) {
      agenteEmEdicao.value.slug = agenteEmEdicao.value.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
    }

    const modeloFinal =
      agenteEmEdicao.value.model === 'CUSTOM_INPUT' && agenteEmEdicao.value.custom_model_id?.trim()
        ? agenteEmEdicao.value.custom_model_id.trim()
        : agenteEmEdicao.value.model;

    const payload = {
      ...agenteEmEdicao.value,
      model: modeloFinal,
      api_key: agenteEmEdicao.value.api_key?.trim() || null,
      base_url: agenteEmEdicao.value.base_url?.trim() || null,
      response_instruction: agenteEmEdicao.value.system_prompt
    };

    const isEdit = editandoAgenteAtivo.value && agenteEmEdicao.value.id;
    const url = isEdit ? `/api/v1/agents/${agenteEmEdicao.value.id}` : '/api/v1/agents';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (json.success) {
      exibirModalAgente.value = false;
      await buscarAgentesEspecialistas();
    } else {
      alert(`Erro ao salvar especialista: ${json.error}`);
    }
  } catch (err: any) {
    alert(`Falha ao salvar especialista: ${err.message}`);
  }
}

async function excluirAgenteEspecialista(ag: any) {
  if (!confirm(`Deseja realmente excluir o especialista "${ag.name}"?`)) return;
  try {
    await fetch(`/api/v1/agents/${ag.id || ag.slug}`, { method: 'DELETE' });
    await buscarAgentesEspecialistas();
  } catch (err) {
    console.error('Erro ao excluir agente:', err);
  }
}

onMounted(async () => {
  await buscarAgentesEspecialistas();
  await carregarCatalogoDeFerramentas();
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
}

.section-header p {
  margin: 0;
  color: #94a3b8;
  font-size: 0.88rem;
}

.agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 310px), 1fr));
  gap: 18px;
}

.agent-card {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agent-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.agent-type-tag {
  font-size: 0.68rem;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  font-weight: 700;
}

.slug-code {
  font-size: 0.72rem;
  color: #64748b;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.status-dot.online {
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
}

.status-dot.offline {
  background: #64748b;
}

.agent-desc {
  font-size: 0.82rem;
  color: #94a3b8;
  margin: 0;
}

.agent-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.76rem;
  background: #020617;
  padding: 8px 10px;
  border-radius: 6px;
  color: #cbd5e1;
  word-break: break-all;
}

.meta-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.key-badge {
  font-size: 0.68rem;
  padding: 2px 7px;
  border-radius: 4px;
  font-weight: 600;
}

.key-badge.dedicated {
  background: rgba(34, 197, 94, 0.18);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.4);
}

.key-badge.inherited {
  background: rgba(148, 163, 184, 0.15);
  color: #94a3b8;
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.tools-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tool-chip {
  font-size: 0.7rem;
  background: #1e293b;
  color: #38bdf8;
  padding: 3px 8px;
  border-radius: 6px;
}

.agent-card-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.78);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 12px;
  z-index: 100;
}

.modal-card {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 12px;
  width: 100%;
  max-width: 760px;
  max-height: 92dvh;
  display: flex;
  flex-direction: column;
}

.modal-header, .modal-footer {
  padding: 14px 18px;
  border-bottom: 1px solid #1e293b;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-footer {
  border-top: 1px solid #1e293b;
  border-bottom: none;
  justify-content: flex-end;
  gap: 10px;
}

.modal-body {
  padding: 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.step-section {
  background: #020617;
  border: 1px solid #1e293b;
  border-radius: 10px;
  padding: 14px;
}

.step-badge {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 700;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
  padding: 4px 10px;
  border-radius: 6px;
  margin-bottom: 12px;
}

.key-input-container {
  display: flex;
  gap: 8px;
  align-items: center;
}

.llm-test-feedback {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 500;
}

.llm-test-feedback.success {
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.4);
  color: #4ade80;
}

.llm-test-feedback.error {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #f87171;
}

.tools-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}

.inline-tool-creator-box {
  background: #0f172a;
  border: 1px dashed #38bdf8;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}

.tools-checkbox-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}

.tool-checkbox-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 8px;
}

.tool-checkbox-card.selected {
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.1);
}

.tool-label-click {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 0.8rem;
  overflow: hidden;
}

.tool-actions-box {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tool-badge-mini {
  font-size: 0.65rem;
  color: #94a3b8;
}

.btn-trash-inline {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
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

.icon-input {
  text-align: center;
  font-size: 18px;
}

.actions-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.btn-primary {
  background: #0284c7;
  color: white;
  border: none;
  padding: 9px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: bold;
}

.btn-test {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid #10b981;
  padding: 9px 14px;
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

.btn-danger {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid #ef4444;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
}

.close-modal-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.2rem;
  cursor: pointer;
}
</style>
