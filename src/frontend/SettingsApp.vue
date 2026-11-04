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
          @click="currentTab = 'brain'"
          :class="{ active: currentTab === 'brain' }"
          class="nav-item"
        >
          👑 Núcleo Fixo (JARVIS)
        </button>

        <button
          @click="currentTab = 'security'"
          :class="['nav-btn', { active: currentTab === 'security' }]"
        >
          🔐 4. Login & Senha
        </button>

        <button
          @click="currentTab = 'agents'"
          :class="{ active: currentTab === 'agents' }"
          class="nav-item"
        >
          🤖 Especialistas Dinâmicos
        </button>

        <button
          @click="currentTab = 'connectors'"
          :class="{ active: currentTab === 'connectors' }"
          class="nav-item"
        >
          🔌 Conexões Externas &amp; IoT
        </button>

        <button
          @click="currentTab = 'memory'"
          :class="{ active: currentTab === 'memory' }"
          class="nav-item"
        >
          🗂️ Memória Dinâmica (Sessions)
        </button>

        <button
          @click="currentTab = 'manual'"
          :class="{ active: currentTab === 'manual' }"
          class="nav-item"
        >
          📘 Manual de Operação
        </button>
      </nav>

      <div class="sidebar-footer">
        <a href="/" class="back-link">⬅ Voltar ao Cérebro 3D</a>
      </div>
    </aside>

    <!-- ÁREA DE CONTEÚDO PRINCIPAL -->
    <main class="content-area">
      <!-- =========================================================
           ABA 1: NÚCLEO FIXO (JARVIS) + SINCRONIZAÇÃO GITHUB GIST
           ========================================================= -->
      <section v-if="currentTab === 'brain'" class="tab-section">
        <header class="section-header">
          <div>
            <h1>👑 Configuração do Cérebro Central ({{ brainSettings.agent_name || 'JARVIS' }})</h1>
            <p>Gerencie o Agente Líder, chaves multi-provedor e modelos sincronizados automaticamente com o GitHub Gist.</p>
          </div>
          <div class="gist-sync-box">
            <button @click="loadSupportedModels(true)" :disabled="isSyncingGist" class="btn-secondary">
              {{ isSyncingGist ? '⏳ Sincronizando Gist...' : '🔄 Atualizar Modelos do GitHub Gist' }}
            </button>
            <small class="sync-meta">
              Fonte: <strong>{{ gistSourceLabel }}</strong>
              <span v-if="lastSyncedAt"> ({{ formatTime(lastSyncedAt) }})</span>
            </small>
          </div>
        </header>

        <div class="card brain-card">
          <div class="form-row">
            <div class="form-group">
              <label>Nome do Agente Líder (Núcleo Central)</label>
              <input type="text" v-model="brainSettings.agent_name" class="input-field" placeholder="JARVIS" />
            </div>

            <div class="form-group">
              <label v-pre>URL Base Local ({{BASE_URL}} / {{SERVER_IP}})</label>
              <input
                type="text"
                v-model="brainSettings.server_base_url"
                class="input-field"
                placeholder="http://localhost:3333"
              />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Provedor de IA Principal</label>
              <select v-model="brainSettings.provider" @change="onBrainProviderChange" class="input-field">
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
              <select v-model="selectedBrainModelOption" @change="onBrainModelSelectChange" class="input-field">
                <option
                  v-for="mod in currentProviderModels(brainSettings.provider)"
                  :key="mod.value"
                  :value="mod.value"
                >
                  {{ mod.label }}
                </option>
              </select>
            </div>
          </div>

          <!-- Caixa aberta automaticamente quando escolher CUSTOM_INPUT -->
          <div v-if="selectedBrainModelOption === 'CUSTOM_INPUT'" class="form-group custom-model-box">
            <label>✍️ Digite o ID exato do Modelo ({{ brainSettings.provider.toUpperCase() }})</label>
            <input
              type="text"
              v-model="brainSettings.model"
              class="input-field"
              placeholder="Ex: llama-3.3-70b-versatile, gemini-2.5-flash, gpt-4o..."
            />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>
                Chave de API ({{ brainSettings.provider.toUpperCase() }})
                <span class="saved-badge" v-if="brainSettings.saved_keys?.[brainSettings.provider]">🔒 Salva no Cofre</span>
              </label>
              <input
                type="password"
                v-model="brainSettings.api_key"
                class="input-field"
                placeholder="Cole a API Key deste provedor..."
              />
            </div>

            <div class="form-group">
              <label>Base URL do Provedor</label>
              <input
                type="text"
                v-model="brainSettings.base_url"
                class="input-field"
                placeholder="https://api.groq.com/openai/v1"
              />
            </div>

            <div class="form-group" style="max-width: 160px;">
              <label>Temperatura ({{ brainSettings.temperature }})</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="1.5"
                v-model.number="brainSettings.temperature"
                class="input-field"
              />
            </div>
          </div>

          <div class="form-group">
            <label>System Prompt Permanente do {{ brainSettings.agent_name || 'JARVIS' }}</label>
            <textarea
              v-model="brainSettings.system_prompt"
              rows="4"
              class="input-field"
              placeholder="Instruções mestras de orquestração do Cérebro Central..."
            ></textarea>
          </div>

          <div class="actions-row">
            <button @click="testLLMConnection" :disabled="isTesting" class="btn-test">
              {{ isTesting ? '⏳ Validando com a IA...' : '⚡ Testar Conexão da IA' }}
            </button>

            <button @click="saveBrainSettings" :disabled="isSavingBrain" class="btn-primary">
              {{ isSavingBrain ? '⏳ Salvando...' : '💾 Salvar Configuração do Cérebro Central' }}
            </button>
          </div>

          <div
            v-if="testResult"
            :class="['alert-box', testResult.success ? 'alert-success' : 'alert-error']"
          >
            {{ testResult.message }}
          </div>
        </div>
      </section>

            <!-- ABA 4: ALTERAR LOGIN E SENHA -->
      <section v-if="currentTab === 'security'" class="tab-section">
        <header class="section-header">
          <div>
            <h1>🔐 Segurança & Credenciais de Acesso</h1>
            <p>Altere seu e-mail de login e senha. A alteração é gravada automaticamente no PostgreSQL e no arquivo .env.</p>
          </div>
        </header>

        <div class="config-card" style="max-width: 520px;">
          <div class="form-group">
            <label>E-mail Atual</label>
            <input type="email" v-model="authForm.currentEmail" class="input-field" disabled />
          </div>
          <div class="form-group">
            <label>Novo E-mail de Login</label>
            <input type="email" v-model="authForm.newEmail" class="input-field" placeholder="matheus_dullius@hotmail.com" />
          </div>
          <div class="form-group">
            <label>Nova Senha</label>
            <input type="password" v-model="authForm.newPassword" class="input-field" placeholder="Digite a nova senha (ex: 123456)" />
          </div>

          <div v-if="authFeedback" class="feedback-box" :class="authFeedback.type">
            {{ authFeedback.message }}
          </div>

          <button @click="saveAdminCredentials" class="btn-primary full-width">
            💾 Salvar Novo Login e Senha
          </button>
        </div>
      </section>

      <!-- =========================================================
           ABA 2: ESPECIALISTAS DINÂMICOS (CRUD + TOOLS + PIPELINE)
           ========================================================= -->
      <section v-if="currentTab === 'agents'" class="tab-section">
        <header class="section-header">
          <div>
            <h1>🤖 Agentes Especialistas &amp; Terminações Nervosas (SNP)</h1>
            <p>Crie especialistas cognitivos (LLM), nós de API REST, servidores MCP ou scripts JS determinísticos.</p>
          </div>
          <button @click="openNewAgentModal" class="btn-primary">+ Novo Especialista</button>
        </header>

        <div class="agents-grid">
          <div v-for="ag in agents" :key="ag.id || ag.slug" class="agent-card">
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
              <span v-if="ag.provider && ag.agent_type !== 'code'">🧠 {{ ag.provider }} ({{ ag.model }})</span>
              <span v-if="ag.endpoint_url">🌐 {{ ag.endpoint_url }}</span>
              <span v-if="ag.next_agent_slug" class="chain-badge">🔗 Próximo Nó: {{ ag.next_agent_slug }}</span>
            </div>

            <div v-if="Array.isArray(ag.tools) && ag.tools.length" class="tools-chips">
              <span v-for="t in ag.tools" :key="t" class="tool-chip">🛠️ {{ t }}</span>
            </div>

            <div class="agent-card-actions">
              <button @click="openEditAgentModal(ag)" class="btn-secondary">✏️ Editar</button>
              <button @click="deleteAgent(ag)" class="btn-danger">🗑️ Excluir</button>
            </div>
          </div>
        </div>
      </section>

      <!-- =========================================================
           ABA 3: CONEXÕES EXTERNAS & IOT (COM TESTE E EXCLUSÃO)
           ========================================================= -->
      <section v-if="currentTab === 'connectors'" class="tab-section">
        <header class="section-header">
          <div>
            <h1>🔌 Cofre de Conexões Externas, E-mail, Mensageria &amp; IoT</h1>
            <p>Cadastre, teste em tempo real ou exclua credenciais para Brapi B3, Gmail, Outlook, WhatsApp, Telegram e APIs REST.</p>
          </div>
          <button @click="openNewConnectorModal" class="btn-primary">➕ Nova Conexão Externa</button>
        </header>

        <div class="agents-grid">
          <div v-for="conn in connectorsList" :key="conn.provider_key" class="agent-card">
            <div class="agent-card-header">
              <div>
                <span class="agent-type-tag">{{ conn.category || 'Conector' }}</span>
                <h3>{{ conn.icon || '🔌' }} {{ conn.name }}</h3>
                <code class="slug-code">{{ conn.provider_key }}</code>
              </div>
              <input type="checkbox" v-model="conn.is_enabled" title="Habilitar/Desabilitar" />
            </div>

            <p class="agent-desc">{{ conn.description || 'Sem descrição.' }}</p>

            <div class="form-group">
              <label>API Key / Token de Acesso</label>
              <input type="password" v-model="conn.api_key" class="input-field" placeholder="Token ou Chave..." />
            </div>

            <div class="form-group">
              <label v-pre>Endpoint / URL (Aceita {{BASE_URL}}, {{query}})</label>
              <input type="text" v-model="conn.endpoint_url" class="input-field" placeholder="https://..." />
            </div>

            <div class="agent-card-actions" style="margin-top: 10px;">
              <button @click="testExistingConnector(conn)" class="btn-test" style="flex: 1;">
                ⚡ Testar
              </button>
              <button @click="saveConnector(conn)" class="btn-primary" style="flex: 1;">
                💾 Salvar
              </button>
              <button
                @click="deleteConnectorFromHub(conn.provider_key, conn.name)"
                class="btn-danger"
                title="Excluir Conexão"
              >
                🗑️
              </button>
            </div>

            <div v-if="connFeedback[conn.provider_key]" class="connector-feedback-box">
              {{ connFeedback[conn.provider_key] }}
            </div>
          </div>
        </div>
      </section>

      <!-- =========================================================
           ABA 4: MEMÓRIA DINÂMICA (SESSION ID)
           ========================================================= -->
      <section v-if="currentTab === 'memory'" class="tab-section">
        <header class="section-header">
          <div>
            <h1>🗂️ Memória Conversacional &amp; Contexto por Sessão</h1>
            <p>Inspecione, edite ou exporte as memórias ativas do JARVIS e dos Especialistas.</p>
          </div>
          <button @click="fetchMemorySessions" class="btn-secondary">🔄 Recarregar Sessões</button>
        </header>

        <div class="memory-layout">
          <div class="sessions-list card">
            <h3>Sessões Ativas</h3>
            <div v-if="memorySessions.length === 0" class="empty-hint">Nenhuma sessão registrada ainda.</div>
            <button
              v-for="s in memorySessions"
              :key="s.session_id"
              @click="selectSession(s.session_id)"
              :class="['session-item', { active: selectedSessionId === s.session_id }]"
            >
              <strong>{{ s.session_id }}</strong>
              <small>{{ s.message_count || s.total_messages || 0 }} msg(s)</small>
            </button>
          </div>

          <div class="session-details card">
            <div v-if="!selectedSessionId" class="empty-hint">
              Selecione uma sessão ao lado para inspecionar o histórico.
            </div>
            <div v-else>
              <div class="session-details-header">
                <h3>Histórico: {{ selectedSessionId }}</h3>
                <div class="actions-row" style="margin: 0;">
                  <button @click="exportSessionJson" class="btn-secondary">📥 Exportar JSON</button>
                  <button @click="clearSelectedSession" class="btn-danger">🧹 Limpar Sessão</button>
                </div>
              </div>

              <div class="messages-list">
                <div v-for="msg in sessionMessages" :key="msg.id" class="message-card">
                  <div class="msg-meta">
                    <strong>{{ (msg.role || 'assistant').toUpperCase() }}</strong>
                    <button @click="deleteSingleMessage(msg.id)" class="btn-danger-sm">✕</button>
                  </div>
                  <textarea v-model="msg.content" rows="2" class="input-field"></textarea>
                  <button @click="saveEditedMessage(msg)" class="btn-secondary-sm">💾 Salvar Edição</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- =========================================================
           ABA 5: MANUAL DE OPERAÇÃO
           ========================================================= -->
      <section v-if="currentTab === 'manual'" class="tab-section">
        <header class="section-header">
          <div>
            <h1>📘 Manual de Operação do Ecossistema Neural</h1>
            <p>Guia rápido de atualização automática via GitHub Gist, criação de agentes e variáveis dinâmicas.</p>
          </div>
        </header>

        <div class="manual-grid">
          <div class="manual-card">
            <h3>🔄 1. Atualização Automática via GitHub Gist</h3>
            <ul>
              <li>O sistema lê automaticamente o arquivo <code>models.json</code> do seu GitHub Gist sempre que você abre o painel ou clica em <strong>Atualizar Modelos do GitHub Gist</strong>.</li>
              <li>Para adicionar um modelo recém-lançado para todos os agentes, basta editar seu Gist ou escolher <code>✍️ Inserir ID Manual</code>.</li>
            </ul>
          </div>

          <div class="manual-card">
            <h3>🔗 2. Encadeamento de Especialistas (Pipeline)</h3>
            <ul>
              <li v-pre>No modal de qualquer especialista, defina o campo <strong>Próximo Agente na Cadeia (next_agent_slug)</strong> para enviar a saída automaticamente ao próximo nó.</li>
              <li v-pre>Use <code>{{BASE_URL}}</code> nos endpoints para apontar automaticamente para o IP/Porta ativos do seu backend.</li>
            </ul>
          </div>
        </div>
      </section>
    </main>

    <!-- =========================================================
         MODAL DE CRIAR / EDITAR AGENTE DE IA E SUAS TOOLS (N8N)
         ========================================================= -->
    <div v-if="showAgentModal" class="modal-backdrop" @click.self="showAgentModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <h2>
            {{ editingAgent.id ? `✏️ Editar Agente: ${editingAgent.name}` : '➕ Criar Novo Agente de IA / Especialista' }}
          </h2>
          <button @click="showAgentModal = false" class="close-modal-btn">✕</button>
        </div>

        <div class="modal-body">
          <!-- BLOCO 1: IDENTIDADE E PAPEL DO AGENTE -->
          <div class="step-section">
            <div class="step-badge">1. Identidade &amp; Papel no Ecossistema</div>

            <div class="form-row">
              <div class="form-group icon-group">
                <label>Ícone</label>
                <input type="text" v-model="editingAgent.icon" class="input-field" style="text-align: center; font-size: 18px;" placeholder="🤖" />
              </div>

              <div class="form-group" style="flex: 2;">
                <label>Nome do Agente Especialista</label>
                <input type="text" v-model="editingAgent.name" class="input-field" placeholder="Ex: Analista Financeiro B3, Agente de Infra & IoT..." />
              </div>

              <div class="form-group" style="flex: 2;">
                <label>Modo de Operação do Agente</label>
                <select v-model="editingAgent.agent_type" class="input-field">
                  <option value="code">💻 Nó de Script JavaScript (Determinístico - 0 Tokens)</option>
                  <option value="api">🌐 Nó Direto REST API / Webhook (0 Tokens Subagente)</option>
                  <option value="mcp">🔌 Cliente Direto MCP (Model Context Protocol)</option>
                  <option value="llm">🧠 Agente de IA Cognitivo (LLM + Múltiplas Tools)</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label style="color: #38bdf8; font-weight: 700;">
                🎯 Quando o Orquestrador (JARVIS) deve acionar este Agente? (Descrição para Tool Calling)
              </label>
              <input
                type="text"
                v-model="editingAgent.description"
                class="input-field"
                placeholder="Ex: Acione quando o usuário pedir cotações da B3, valuation Bazin ou análise de ações e FIIs."
              />
            </div>
          </div>

          <!-- BLOCO 2A: SE FOR AGENTE DE IA COGNITIVO (LLM) -->
          <div v-if="editingAgent.agent_type === 'llm'" class="step-section">
            <div class="step-badge">2. Cérebro do Agente (LLM &amp; System Prompt)</div>

            <div class="form-row">
              <div class="form-group">
                <label>Provedor de IA do Agente</label>
                <select v-model="editingAgent.provider" @change="onAgentProviderChange" class="input-field">
                  <option value="groq">Groq (LPU Ultra-Rápido)</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="deepseek">DeepSeek (V3 / R1)</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="ollama">Ollama (Local Offline)</option>
                </select>
              </div>

              <div class="form-group">
                <label>Modelo da IA</label>
                <select v-model="editingAgent.model" class="input-field">
                  <option
                    v-for="mod in currentProviderModels(editingAgent.provider)"
                    :key="mod.value"
                    :value="mod.value"
                  >
                    {{ mod.label }}
                  </option>
                </select>
              </div>

              <div class="form-group" style="max-width: 130px;">
                <label>Temperatura</label>
                <input type="number" step="0.1" min="0" max="1.5" v-model.number="editingAgent.temperature" class="input-field" />
              </div>
            </div>

            <div v-if="editingAgent.model === 'CUSTOM_INPUT'" class="form-group">
              <label>✍️ Digite o ID exato do Modelo</label>
              <input type="text" v-model="editingAgent.custom_model_id" class="input-field" placeholder="Ex: openai/gpt-oss-120b, llama-3.3-70b-versatile..." />
            </div>

            <div class="form-group">
              <label>System Prompt (Regras, Personalidade e Como Usar as Tools Vinculadas)</label>
              <textarea
                v-model="editingAgent.system_prompt"
                rows="4"
                class="input-field"
                placeholder="Ex: Você é um CFO sênior especialista na B3. Use a tool brapi_b3 para consultar cotações reais e calcule o Preço-Teto Bazin..."
              ></textarea>
            </div>
          </div>

          <!-- BLOCO 2B: SE FOR NÓ DIRETO DE API / WEBHOOK OU MCP -->
          <div v-else-if="editingAgent.agent_type === 'api' || editingAgent.agent_type === 'mcp'" class="step-section">
            <div class="step-badge">2. Configuração da Requisição Direta ({{ editingAgent.agent_type.toUpperCase() }})</div>

            <div class="form-row">
              <div v-if="editingAgent.agent_type === 'api'" class="form-group" style="max-width: 130px;">
                <label>Método HTTP</label>
                <select v-model="editingAgent.http_method" class="input-field">
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
                  v-model="editingAgent.endpoint_url"
                  class="input-field"
                  placeholder="Ex: https://brapi.dev/api/quote/{{symbol}} ou http://localhost:8000/mcp"
                />
              </div>

              <div class="form-group" style="max-width: 220px;">
                <label>Token Bearer / API Key (Opcional)</label>
                <input type="password" v-model="editingAgent.auth_token" class="input-field" placeholder="Token..." />
              </div>
            </div>

            <div v-if="editingAgent.agent_type === 'api' && editingAgent.http_method !== 'GET'" class="form-group">
              <label v-pre>📦 O que enviar no Body / Parâmetros JSON? (Use {{query}} ou {{prompt}})</label>
              <textarea
                v-model="editingAgent.payload_template"
                rows="2"
                class="input-field"
                placeholder='Ex: {"ticker": "{{symbol}}", "pergunta": "{{query}}"}'
              ></textarea>
            </div>

            <div class="form-group">
              <label style="color: #10b981; font-weight: 700;">
                💬 O que você quer responder? (Instrução para extrair dados do JSON da API e formatar a resposta)
              </label>
              <textarea
                v-model="editingAgent.system_prompt"
                rows="3"
                class="input-field"
                placeholder="Ex: Extraia o preço atual (regularMarketPrice) e o dividend yield do JSON retornado e apresente em uma tabela executiva."
              ></textarea>
            </div>
          </div>

          <!-- BLOCO 2C: SE FOR NÓ DE SCRIPT JAVASCRIPT DETERMINÍSTICO -->
          <div v-else-if="editingAgent.agent_type === 'code'" class="step-section">
            <div class="step-badge">2. Script JavaScript / TypeScript Determinístico (ZERO TOKENS)</div>
            <div class="form-group">
              <label>Código de Execução (Recebe `payload` e `env`)</label>
              <textarea
                v-model="editingAgent.code_snippet"
                rows="5"
                class="input-field"
                style="font-family: monospace;"
                placeholder="return { status: 'ok', recebido: payload, processadoEm: new Date().toISOString() };"
              ></textarea>
            </div>
          </div>

          <!-- BLOCO 3: FERRAMENTAS (TOOLS / NÓS FIXOS) VINCULADAS A ESTE AGENTE -->
          <div class="step-section">
            <div class="tools-header-row">
              <div>
                <span class="step-badge" style="margin-bottom: 2px;">3. 🛠️ Ferramentas (Tools / Nós Fixos) Conectadas</span>
                <p style="font-size: 12px; color: #94a3b8; margin: 4px 0 0 0;">
                  Selecione as tools que este agente pode usar, ou exclua conexões que não queira mais no botão 🗑️.
                </p>
              </div>
              <button
                type="button"
                @click="showInlineToolCreator = !showInlineToolCreator"
                class="btn-secondary"
              >
                {{ showInlineToolCreator ? '✕ Fechar Criador' : '➕ Criar Nova Tool' }}
              </button>
            </div>

            <!-- CRIADOR INLINE DE NOVA TOOL FUNCIONAL -->
            <div v-if="showInlineToolCreator" class="inline-tool-creator-box">
              <div class="form-row">
                <div class="form-group icon-group">
                  <label>Ícone</label>
                  <input type="text" v-model="newToolDraft.icon" class="input-field" style="text-align: center;" placeholder="🛠️" />
                </div>

                <div class="form-group" style="flex: 2;">
                  <label>Nome da Tool / Nó Fixo</label>
                  <input
                    type="text"
                    v-model="newToolDraft.label"
                    class="input-field"
                    placeholder="Ex: Consultar Cotação Brapi / Disparar Webhook / Executar SSH"
                  />
                </div>

                <div class="form-group" style="flex: 1;">
                  <label>Arquitetura da Tool</label>
                  <select v-model="newToolDraft.tool_type" class="input-field">
                    <option value="http">🌐 HTTP / REST API / Webhook</option>
                    <option value="mcp">🔌 Servidor MCP (JSON-RPC)</option>
                    <option value="code">💻 Script JavaScript (Code Tool)</option>
                    <option value="ssh">🖥️ Comando SSH Remoto</option>
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label>Quando o Agente deve usar esta Tool? (Descrição para a IA)</label>
                <input
                  type="text"
                  v-model="newToolDraft.description"
                  class="input-field"
                  placeholder="Ex: Use para buscar o preço de ações na B3 passando o ticker em query"
                />
              </div>

              <!-- Campos para Tool HTTP / Webhook -->
              <div v-if="newToolDraft.tool_type === 'http'" class="form-row">
                <div class="form-group" style="max-width: 115px;">
                  <label>Método</label>
                  <select v-model="newToolDraft.http_method" class="input-field" style="color: #10b981; font-weight: 700;">
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
                    v-model="newToolDraft.endpoint_url"
                    class="input-field"
                    placeholder="Ex: https://brapi.dev/api/quote/{{query}}"
                  />
                </div>

                <div class="form-group" style="flex: 1;">
                  <label>Token Bearer / API Key (Opcional)</label>
                  <input type="password" v-model="newToolDraft.auth_token" class="input-field" placeholder="Token opcional..." />
                </div>
              </div>

              <!-- Body JSON quando a Tool HTTP for POST ou PUT -->
              <div v-if="newToolDraft.tool_type === 'http' && newToolDraft.http_method !== 'GET'" class="form-group">
                <label v-pre>📦 Body / Payload JSON da Tool (Use {{query}})</label>
                <input
                  type="text"
                  v-model="newToolDraft.payload_template"
                  class="input-field"
                  placeholder='Ex: {"query": "{{query}}", "origem": "jarvis"}'
                />
              </div>

              <!-- Campos para Tool Servidor MCP -->
              <div v-else-if="newToolDraft.tool_type === 'mcp'" class="form-row">
                <div class="form-group" style="flex: 2;">
                  <label>URL do Servidor MCP (JSON-RPC 2.0)</label>
                  <input
                    type="text"
                    v-model="newToolDraft.endpoint_url"
                    class="input-field"
                    placeholder="Ex: http://localhost:8000/mcp"
                  />
                </div>
                <div class="form-group" style="flex: 1;">
                  <label>Token de Autorização MCP (Opcional)</label>
                  <input type="password" v-model="newToolDraft.auth_token" class="input-field" placeholder="Bearer..." />
                </div>
              </div>

              <!-- Campos para Tool Script JS -->
              <div v-else-if="newToolDraft.tool_type === 'code'" class="form-group">
                <label>Código JavaScript da Tool (Recebe `query`, `args`, `env`)</label>
                <textarea
                  v-model="newToolDraft.code_snippet"
                  rows="3"
                  class="input-field"
                  style="font-family: monospace;"
                  placeholder="return { resultado: `Processado para ${query}`, timestamp: Date.now() };"
                ></textarea>
              </div>

              <!-- Campos para Tool SSH -->
              <div v-else-if="newToolDraft.tool_type === 'ssh'" class="form-group">
                <label>Comando SSH Padrão no Servidor OCI / Linux</label>
                <input
                  type="text"
                  v-model="newToolDraft.endpoint_url"
                  class="input-field"
                  placeholder="Ex: docker ps && uptime && df -h /"
                />
              </div>

              <div v-if="toolCreatorFeedback" style="font-size: 12px; color: #38bdf8; margin-bottom: 8px;">
                {{ toolCreatorFeedback }}
              </div>

              <div class="actions-row" style="justify-content: flex-end;">
                <button type="button" @click="testCustomToolDraft" class="btn-test">
                  ⚡ Testar Tool
                </button>
                <button type="button" @click="saveCustomToolAndAttach" class="btn-primary">
                  💾 Salvar no Catálogo &amp; Vincular
                </button>
              </div>
            </div>

            <!-- GRADE DE CHECKBOXES DAS TOOLS EXISTENTES COM BOTÃO DE EXCLUIR CONEXÃO -->
            <div class="tools-checkbox-grid">
              <div
                v-for="tool in availableToolsCatalog"
                :key="tool.id"
                class="tool-checkbox-card"
                :class="{ selected: Array.isArray(editingAgent.tools) && editingAgent.tools.includes(tool.id) }"
              >
                <label class="tool-label-click">
                  <input
                    type="checkbox"
                    :value="tool.id"
                    v-model="editingAgent.tools"
                  />
                  <span>{{ tool.icon || '🔌' }}</span>
                  <span class="tool-name-text">
                    {{ tool.label }}
                  </span>
                </label>

                <div class="tool-actions-box">
                  <span class="tool-badge-mini">{{ (tool.http_method || tool.tool_type || 'NÓ').toUpperCase() }}</span>
                  <button
                    type="button"
                    title="Excluir Conexão Permanentemente"
                    @click.stop.prevent="deleteConnectorFromHub(tool.id, tool.label)"
                    class="btn-trash-inline"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- BLOCO 4: ENCADEAMENTO PIPELINE (NEXT AGENT) & AGENDAMENTO CRON -->
          <div class="step-section">
            <div class="step-badge">4. Encadeamento Pipeline (Node-to-Node) &amp; Gatilhos</div>
            <div class="form-row">
              <div class="form-group">
                <label>🔗 Encadear Saída para Próximo Agente (Opcional)</label>
                <select v-model="editingAgent.next_agent_slug" class="input-field">
                  <option :value="null">-- Nenhum (Retornar direto ao JARVIS) --</option>
                  <option
                    v-for="other in agents.filter((a) => a.slug !== editingAgent.slug)"
                    :key="other.slug"
                    :value="other.slug"
                  >
                    ➔ {{ other.name }} ({{ other.slug }})
                  </option>
                </select>
              </div>

              <div class="form-group">
                <label>⏰ Expressão Cron de Agendamento (Opcional)</label>
                <input type="text" v-model="editingAgent.cron_expression" class="input-field" placeholder="Ex: */15 * * * *" />
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button @click="showAgentModal = false" class="btn-secondary">Cancelar</button>
          <button @click="saveAgent" class="btn-primary">💾 Salvar Especialista</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';

interface AgentItem {
  id?: number;
  name: string;
  slug: string;
  role?: string;
  description: string;
  execution_mode: 'llm' | 'api' | 'mcp' | 'code';
  provider: string;
  model: string;
  api_key?: string;
  base_url?: string;
  auth_type?: string;
  auth_token?: string;
  payload_template?: string;
  code_snippet?: string;
  system_prompt: string;
  tools: string[];
  next_agent_slug?: string;
  schedule_cron?: string;
  schedule_enabled?: boolean;
  is_error_trigger?: boolean;
}

const currentTab = ref<'brain' | 'agents' | 'connectors' | 'memory' | 'manual'>('brain');

const DEFAULT_ENDPOINTS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com',
  ollama: 'http://localhost:11434/v1',
  openrouter: 'https://openrouter.ai/api/v1'
};

if (localStorage.getItem('jarvis_authenticated_session') !== 'true') {
  window.location.href = '/';
}

// Mantém a aba que você estava olhando salva mesmo se sair do navegador ou der F5
const savedTab = (localStorage.getItem('jarvis_settings_tab') as any) || 'jarvis';
const currentTab = ref<'jarvis' | 'specialists' | 'memory' | 'security'>(savedTab);

watch(currentTab, (newTab) => {
  localStorage.setItem('jarvis_settings_tab', newTab);
});

// Estado para edição de Login e Senha na aba Segurança
const authForm = ref({
  currentEmail: localStorage.getItem('jarvis_authenticated_email') || 'matheus_dullius@hotmail.com',
  newEmail: localStorage.getItem('jarvis_authenticated_email') || 'matheus_dullius@hotmail.com',
  newPassword: ''
});
const authFeedback = ref<{ type: 'success' | 'error'; message: string } | null>(null);

async function saveAdminCredentials() {
  authFeedback.value = null;
  try {
    const res = await fetch('/api/v1/auth/update-credentials', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authForm.value)
    });
    const data = await res.json();
    if (data.success) {
      authForm.value.currentEmail = data.newEmail;
      localStorage.setItem('jarvis_authenticated_email', data.newEmail);
      authForm.value.newPassword = '';
      authFeedback.value = { type: 'success', message: '✅ Login e senha salvos no Banco e no .env!' };
    } else {
      authFeedback.value = { type: 'error', message: '❌ ' + data.error };
    }
  } catch (err: any) {
    authFeedback.value = { type: 'error', message: '❌ Erro: ' + err.message };
  }
}

const supportedModels = ref<Record<string, Array<{ label: string; value: string }>>>({
  groq: [
    { label: '✍️ Inserir ID Manual da Groq', value: 'CUSTOM_INPUT' },
    { label: 'Llama 3.3 70B Versatile', value: 'llama-3.3-70b-versatile' },
    { label: 'Llama 3.1 8B Instant', value: 'llama-3.1-8b-instant' }
  ],
  gemini: [
    { label: '✍️ Inserir ID Manual do Gemini', value: 'CUSTOM_INPUT' },
    { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
    { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
    { label: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash' }
  ],
  openai: [
    { label: '✍️ Inserir ID Manual da OpenAI', value: 'CUSTOM_INPUT' },
    { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
    { label: 'GPT-4o', value: 'gpt-4o' }
  ],
  deepseek: [
    { label: '✍️ Inserir ID Manual da DeepSeek', value: 'CUSTOM_INPUT' },
    { label: 'DeepSeek V3 (Chat)', value: 'deepseek-chat' },
    { label: 'DeepSeek R1 (Reasoner)', value: 'deepseek-reasoner' }
  ]
});

const isSyncingGist = ref(false);
const gistSource = ref('local');
const lastSyncedAt = ref<string | null>(null);

const gistSourceLabel = computed(() => {
  if (gistSource.value === 'github_gist') return 'GitHub Gist (Ao Vivo)';
  if (gistSource.value === 'github_gist_cache') return 'GitHub Gist (Cache)';
  return 'Catálogo Local (Fallback)';
});

const brainSettings = ref<any>({
  agent_name: 'JARVIS',
  provider: 'groq',
  model: 'llama-3.3-70b-versatile',
  api_key: '',
  base_url: DEFAULT_ENDPOINTS.groq,
  temperature: 0.2,
  server_base_url: 'http://localhost:3333',
  system_prompt: 'Você é o JARVIS, o Cérebro Central e Agente Líder permanente do sistema.',
  saved_keys: {}
});

const selectedBrainModelOption = ref('llama-3.3-70b-versatile');
const isTesting = ref(false);
const isSavingBrain = ref(false);
const testResult = ref<{ success: boolean; message: string } | null>(null);

function currentProviderModels(provider: string) {
  const key = (provider || 'groq').toLowerCase();
  return (
    supportedModels.value[key] || [
      { label: `✍️ Inserir ID Manual (${key.toUpperCase()})`, value: 'CUSTOM_INPUT' }
    ]
  );
}

function syncBrainModelSelection() {
  const list = currentProviderModels(brainSettings.value.provider);
  const existsInCatalog = list.some(
    (m) => m.value === brainSettings.value.model && m.value !== 'CUSTOM_INPUT'
  );
  selectedBrainModelOption.value = existsInCatalog ? brainSettings.value.model : 'CUSTOM_INPUT';
}

async function loadSupportedModels(forceRefresh = false) {
  isSyncingGist.value = true;
  try {
    const res = await fetch(`/api/v1/brain-config/models${forceRefresh ? '?refresh=true' : ''}`);
    const data = await res.json();
    const incomingModels = data.models || data.catalog;
    if (incomingModels && typeof incomingModels === 'object') {
      supportedModels.value = incomingModels;
      gistSource.value = data.source || 'github_gist';
      lastSyncedAt.value = data.syncedAt || new Date().toISOString();
    }
    if (data.endpoints) {
      Object.assign(DEFAULT_ENDPOINTS, data.endpoints);
    }
    syncBrainModelSelection();
  } catch (err) {
    console.warn('Falha ao sincronizar modelos:', err);
  } finally {
    isSyncingGist.value = false;
  }
}

async function fetchBrainSettings() {
  try {
    const res = await fetch('/api/v1/brain-config');
    const json = await res.json();
    if (json.success && json.data) {
      brainSettings.value = {
        ...brainSettings.value,
        ...json.data,
        saved_keys: json.data.saved_keys || {}
      };
      syncBrainModelSelection();
    }
  } catch (err) {
    console.error('Erro ao buscar configuração do cérebro:', err);
  }
}

function onBrainProviderChange() {
  const prov = (brainSettings.value.provider || 'groq').toLowerCase();
  brainSettings.value.base_url = DEFAULT_ENDPOINTS[prov] || DEFAULT_ENDPOINTS.groq;
  brainSettings.value.api_key = brainSettings.value.saved_keys?.[prov] || '';

  const list = currentProviderModels(prov);
  const firstValid = list.find((m) => m.value !== 'CUSTOM_INPUT');
  if (firstValid) {
    brainSettings.value.model = firstValid.value;
    selectedBrainModelOption.value = firstValid.value;
  } else {
    selectedBrainModelOption.value = 'CUSTOM_INPUT';
  }
  testResult.value = null;
}

function onBrainModelSelectChange() {
  if (selectedBrainModelOption.value !== 'CUSTOM_INPUT') {
    brainSettings.value.model = selectedBrainModelOption.value;
  }
}

async function testLLMConnection() {
  isTesting.value = true;
  testResult.value = null;
  try {
    const res = await fetch('/api/v1/brain-config/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(brainSettings.value)
    });
    const json = await res.json();
    if (json.success) {
      if (json.usedModel && json.usedModel !== brainSettings.value.model) {
        brainSettings.value.model = json.usedModel;
        syncBrainModelSelection();
      }
      testResult.value = { success: true, message: `✅ ${json.message}` };
    } else {
      testResult.value = { success: false, message: `❌ ${json.error || 'Falha ao validar conexão.'}` };
    }
  } catch (err: any) {
    testResult.value = { success: false, message: `❌ Erro de comunicação: ${err.message}` };
  } finally {
    isTesting.value = false;
  }
}

async function saveBrainSettings() {
  isSavingBrain.value = true;
  testResult.value = null;
  try {
    const prov = brainSettings.value.provider.toLowerCase();
    if (!brainSettings.value.saved_keys) brainSettings.value.saved_keys = {};
    if (brainSettings.value.api_key) {
      brainSettings.value.saved_keys[prov] = brainSettings.value.api_key;
    }

    const res = await fetch('/api/v1/brain-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(brainSettings.value)
    });
    const json = await res.json();
    if (json.success) {
      brainSettings.value = { ...brainSettings.value, ...json.data };
      syncBrainModelSelection();
      testResult.value = { success: true, message: `💾 ${json.message}` };
    } else {
      testResult.value = { success: false, message: `❌ ${json.error}` };
    }
  } catch (err: any) {
    testResult.value = { success: false, message: `❌ Erro ao salvar: ${err.message}` };
  } finally {
    isSavingBrain.value = false;
  }
}

// =========================================================
// GESTÃO DE AGENTES ESPECIALISTAS & TOOLS
// =========================================================
const agents = ref<any[]>([]);
const showAgentModal = ref(false);
const isEditingAgent = ref(false);
const availableToolsCatalog = ref<any[]>([]);

const showInlineToolCreator = ref(false);
const toolCreatorFeedback = ref('');

const newToolDraft = reactive({
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

const editingAgent = ref<any>({
  id: null,
  name: '',
  slug: '',
  icon: '🤖',
  description: '',
  agent_type: 'code',
  provider: 'groq',
  model: 'llama-3.3-70b-versatile',
  custom_model_id: '',
  temperature: 0.3,
  api_key: '',
  base_url: DEFAULT_ENDPOINTS.groq,
  system_prompt: '',
  endpoint_url: '',
  http_method: 'POST',
  auth_token: '',
  payload_template: '',
  code_snippet: '',
  tools: [] as string[],
  next_agent_slug: null,
  cron_expression: '*/5 * * * *',
  is_active: true
});

async function loadCustomToolsFromBackend() {
  try {
    const res = await fetch('/api/v1/connectors');
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      availableToolsCatalog.value = json.data.map((item: any) => {
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
    console.warn('Falha ao carregar tools dinâmicas:', err);
  }
}

async function deleteConnectorFromHub(providerKey: string, name?: string) {
  if (!confirm(`Deseja realmente EXCLUIR a conexão "${name || providerKey}" permanentemente?`)) return;

  try {
    const res = await fetch(`/api/v1/connectors/${encodeURIComponent(providerKey)}`, {
      method: 'DELETE'
    });
    const json = await res.json();

    if (json.success) {
      availableToolsCatalog.value = availableToolsCatalog.value.filter(
        (t) => t.id.toLowerCase() !== providerKey.toLowerCase()
      );
      connectorsList.value = connectorsList.value.filter(
        (c) => c.provider_key.toLowerCase() !== providerKey.toLowerCase()
      );
      if (Array.isArray(editingAgent.value.tools)) {
        editingAgent.value.tools = editingAgent.value.tools.filter(
          (k: string) => k.toLowerCase() !== providerKey.toLowerCase()
        );
      }
      alert(`🗑️ Conexão "${name || providerKey}" removida com sucesso!`);
      await fetchAgents();
    } else {
      alert(`Erro: ${json.error || 'Falha ao excluir conexão'}`);
    }
  } catch (err: any) {
    alert(`Erro de comunicação: ${err.message}`);
  }
}

async function testCustomToolDraft() {
  if (newToolDraft.tool_type !== 'code' && !newToolDraft.endpoint_url.trim()) {
    toolCreatorFeedback.value = '⚠️ Informe a Endpoint URL ou comando para testar.';
    return;
  }
  toolCreatorFeedback.value = '⏳ Testando requisição da Tool...';
  try {
    const res = await fetch('/api/v1/connectors/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        testQuery: 'PETR4',
        config: {
          tool_type: newToolDraft.tool_type,
          http_method: newToolDraft.http_method,
          endpoint_url: newToolDraft.endpoint_url.trim(),
          auth_token: newToolDraft.auth_token.trim(),
          payload_template: newToolDraft.payload_template.trim(),
          code_snippet: newToolDraft.code_snippet
        }
      })
    });
    const json = await res.json();
    if (json.success) {
      toolCreatorFeedback.value = `🟢 ${json.message || `Tool respondeu HTTP ${json.status || 200} em ${json.latencyMs || 0}ms!`}`;
    } else {
      toolCreatorFeedback.value = `🔴 Erro: ${json.error || 'Status ' + (json.status || 500)}`;
    }
  } catch (err: any) {
    toolCreatorFeedback.value = `🔴 Falha: ${err.message}`;
  }
}

async function saveCustomToolAndAttach() {
  if (!newToolDraft.label.trim()) {
    toolCreatorFeedback.value = '⚠️ Digite um nome para a Tool.';
    return;
  }

  const id = newToolDraft.label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const payload = {
    provider_key: id,
    name: newToolDraft.label.trim(),
    category: newToolDraft.tool_type === 'mcp' ? 'MCP Tool' : 'Custom API Tool',
    icon: newToolDraft.icon || '🛠️',
    description:
      newToolDraft.description.trim() ||
      `Executa a ferramenta ${newToolDraft.label.trim()} (${newToolDraft.endpoint_url.trim()})`,
    is_enabled: true,
    config: {
      tool_type: newToolDraft.tool_type,
      http_method: newToolDraft.http_method,
      endpoint_url: newToolDraft.endpoint_url.trim(),
      auth_token: newToolDraft.auth_token.trim(),
      payload_template: newToolDraft.payload_template.trim(),
      code_snippet: newToolDraft.code_snippet,
      description: newToolDraft.description.trim()
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

    await loadCustomToolsFromBackend();
    await fetchConnectors();

    if (editingAgent.value) {
      if (!Array.isArray(editingAgent.value.tools)) editingAgent.value.tools = [];
      if (!editingAgent.value.tools.includes(id)) {
        editingAgent.value.tools.push(id);
      }
    }

    newToolDraft.label = '';
    newToolDraft.description = '';
    newToolDraft.endpoint_url = '';
    newToolDraft.auth_token = '';
    newToolDraft.payload_template = '';
    newToolDraft.code_snippet = '';
    toolCreatorFeedback.value = '';
    showInlineToolCreator.value = false;
  } catch (err: any) {
    toolCreatorFeedback.value = `🔴 Erro ao salvar: ${err.message}`;
  }
}

async function fetchAgents() {
  try {
    const res = await fetch('/api/v1/agents');
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      agents.value = json.data.map((ag: any) => ({
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
    console.error('Erro ao carregar agentes:', err);
  }
}

function openNewAgentModal() {
  isEditingAgent.value = false;
  editingAgent.value = {
    id: null,
    name: '',
    slug: '',
    icon: '💻',
    description: '',
    agent_type: 'code',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    custom_model_id: '',
    temperature: 0.2,
    api_key: '',
    base_url: DEFAULT_ENDPOINTS.groq,
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
  showAgentModal.value = true;
}

function openEditAgentModal(ag: any) {
  isEditingAgent.value = true;
  const prov = ag.provider || 'groq';
  const list = currentProviderModels(prov);
  const exists = list.some((m) => m.value === ag.model && m.value !== 'CUSTOM_INPUT');

  editingAgent.value = {
    ...ag,
    icon: ag.icon || '🤖',
    provider: prov,
    model: exists ? ag.model : 'CUSTOM_INPUT',
    custom_model_id: exists ? '' : ag.model || '',
    temperature: Number(ag.temperature ?? 0.2),
    tools: Array.isArray(ag.tools) ? [...ag.tools] : [],
    next_agent_slug: ag.next_agent_slug || null,
    cron_expression: ag.cron_expression || '*/5 * * * *'
  };
  showAgentModal.value = true;
}

function onAgentProviderChange() {
  const prov = (editingAgent.value.provider || 'groq').toLowerCase();
  editingAgent.value.base_url = DEFAULT_ENDPOINTS[prov] || DEFAULT_ENDPOINTS.groq;
  const list = currentProviderModels(prov);
  const firstValid = list.find((m) => m.value !== 'CUSTOM_INPUT');
  if (firstValid) {
    editingAgent.value.model = firstValid.value;
  } else {
    editingAgent.value.model = 'CUSTOM_INPUT';
  }
}

async function saveAgent() {
  try {
    if (!editingAgent.value.name?.trim()) {
      alert('Informe o nome do especialista.');
      return;
    }
    if (!editingAgent.value.slug?.trim()) {
      editingAgent.value.slug = editingAgent.value.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
    }

    const finalModel =
      editingAgent.value.model === 'CUSTOM_INPUT' && editingAgent.value.custom_model_id?.trim()
        ? editingAgent.value.custom_model_id.trim()
        : editingAgent.value.model;

    const payload = {
      ...editingAgent.value,
      model: finalModel,
      response_instruction: editingAgent.value.system_prompt
    };

    const isEdit = isEditingAgent.value && editingAgent.value.id;
    const url = isEdit ? `/api/v1/agents/${editingAgent.value.id}` : '/api/v1/agents';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (json.success) {
      showAgentModal.value = false;
      await fetchAgents();
    } else {
      alert(`Erro ao salvar agente: ${json.error}`);
    }
  } catch (err: any) {
    alert(`Falha ao salvar especialista: ${err.message}`);
  }
}

async function deleteAgent(ag: any) {
  if (!confirm(`Deseja realmente excluir o especialista "${ag.name}"?`)) return;
  try {
    await fetch(`/api/v1/agents/${ag.id || ag.slug}`, { method: 'DELETE' });
    await fetchAgents();
  } catch (err) {
    console.error('Erro ao excluir agente:', err);
  }
}

// =========================================================
// CONEXÕES EXTERNAS & IOT
// =========================================================
const connectorsList = ref<any[]>([]);
const connFeedback = ref<Record<string, string>>({});

function openNewConnectorModal() {
  const name = prompt('Nome da nova Conexão Externa (ex: CoinGecko API, Webhook n8n):');
  if (!name || !name.trim()) return;

  const key = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const newConn = {
    provider_key: key,
    name: name.trim(),
    category: 'Custom API',
    icon: '🔌',
    description: `Conexão externa ${name.trim()}`,
    is_enabled: true,
    api_key: '',
    endpoint_url: ''
  };

  saveConnector(newConn);
}

async function fetchConnectors() {
  try {
    const res = await fetch('/api/v1/connectors');
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      connectorsList.value = json.data.map((row: any) => {
        const cfg = row.config || {};
        return {
          provider_key: row.provider_key,
          name: row.name,
          category: row.category || 'Custom Tool',
          icon: row.icon || '🔌',
          description: row.description || cfg.description || '',
          is_enabled: Boolean(row.is_enabled),
          api_key: row.api_key || cfg.api_key || cfg.auth_token || '',
          endpoint_url: row.endpoint_url || cfg.endpoint_url || ''
        };
      });
    }
  } catch {}
}

async function saveConnector(conn: any) {
  try {
    const payload = {
      provider_key: conn.provider_key,
      name: conn.name,
      category: conn.category || 'Connector',
      icon: conn.icon || '🔌',
      description: conn.description || '',
      is_enabled: Boolean(conn.is_enabled),
      config: {
        api_key: conn.api_key || '',
        endpoint_url: conn.endpoint_url || '',
        auth_token: conn.api_key || '',
        description: conn.description || ''
      }
    };

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

    connFeedback.value[conn.provider_key] = '💾 Conexão salva com sucesso!';
    setTimeout(() => {
      delete connFeedback.value[conn.provider_key];
    }, 3500);

    await fetchConnectors();
    await loadCustomToolsFromBackend();
  } catch (err: any) {
    alert(`Erro ao salvar conector: ${err.message}`);
  }
}

async function testExistingConnector(conn: any) {
  connFeedback.value[conn.provider_key] = '⏳ Testando conexão...';
  try {
    const res = await fetch('/api/v1/connectors/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider_key: conn.provider_key,
        testQuery: 'PETR4',
        config: {
          endpoint_url: conn.endpoint_url,
          api_key: conn.api_key,
          auth_token: conn.api_key
        }
      })
    });
    const json = await res.json();
    if (json.success) {
      connFeedback.value[conn.provider_key] = `🟢 ${json.message || 'Conexão validada!'}`;
    } else {
      connFeedback.value[conn.provider_key] = `🔴 ${json.error || 'Falha no teste.'}`;
    }
  } catch (err: any) {
    connFeedback.value[conn.provider_key] = `🔴 Erro: ${err.message}`;
  }
}

// =========================================================
// MEMÓRIA DINÂMICA (SESSIONS)
// =========================================================
const memorySessions = ref<any[]>([]);
const selectedSessionId = ref<string | null>(null);
const sessionMessages = ref<any[]>([]);

async function fetchMemorySessions() {
  try {
    const res = await fetch('/api/v1/memory/sessions');
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      memorySessions.value = json.data;
    }
  } catch {}
}

async function selectSession(sessionId: string) {
  selectedSessionId.value = sessionId;
  try {
    const res = await fetch(`/api/v1/memory/sessions/${encodeURIComponent(sessionId)}`);
    const json = await res.json();
    sessionMessages.value = Array.isArray(json.data)
      ? json.data
      : json.data?.messages || json.chatHistory || json.messages || [];
  } catch {}
}

async function saveEditedMessage(msg: any) {
  await fetch(`/api/v1/memory/messages/${msg.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: msg.content })
  });
}

async function deleteSingleMessage(id: number) {
  await fetch(`/api/v1/memory/messages/${id}`, { method: 'DELETE' });
  if (selectedSessionId.value) await selectSession(selectedSessionId.value);
}

async function clearSelectedSession() {
  if (!selectedSessionId.value) return;
  await fetch(`/api/v1/memory/sessions/${encodeURIComponent(selectedSessionId.value)}`, {
    method: 'DELETE'
  });
  selectedSessionId.value = null;
  sessionMessages.value = [];
  await fetchMemorySessions();
}

function exportSessionJson() {
  const blob = new Blob([JSON.stringify(sessionMessages.value, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `session_${selectedSessionId.value}.json`;
  a.click();
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR');
  } catch {
    return iso;
  }
}

// Aliases de compatibilidade segura para ações de conectores
async function deleteConnectorConfig(providerKey: string) {
  return deleteConnectorFromHub(providerKey);
}

async function saveConnectorConfig(connector: any) {
  return saveConnector(connector);
}

// Herança automática de credenciais do conector no Agente caso necessário
function onAgentToolToggle(toolSlug: string, isChecked: boolean) {
  if (!editingAgent.value) return;
  if (!Array.isArray(editingAgent.value.tools)) {
    editingAgent.value.tools = [];
  }

  if (isChecked) {
    if (!editingAgent.value.tools.includes(toolSlug)) {
      editingAgent.value.tools.push(toolSlug);
    }
    const conn = connectorsList.value.find((c: any) => (c.provider_key || c.slug) === toolSlug);
    if (conn) {
      if (!editingAgent.value.auth_token) {
        editingAgent.value.auth_token = conn.api_key || '';
      }
      if (!editingAgent.value.endpoint_url) {
        editingAgent.value.endpoint_url = conn.endpoint_url || '';
      }
    }
  } else {
    editingAgent.value.tools = editingAgent.value.tools.filter((t: string) => t !== toolSlug);
  }
}

onMounted(async () => {
  await loadSupportedModels(true);
  await fetchBrainSettings();
  await fetchAgents();
  await fetchConnectors();
  await loadCustomToolsFromBackend();
  await fetchMemorySessions();
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

.brand p, .badge-sub {
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

.env-badge {
  background: #020617;
  border: 1px solid #1e293b;
  padding: 10px;
  border-radius: 8px;
  font-size: 0.72rem;
}

.env-badge span {
  display: block;
  color: #64748b;
}

.env-badge strong {
  color: #22c55e;
  word-break: break-all;
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

.status-pill.online {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
  border: 1px solid #22c55e;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: bold;
  white-space: nowrap;
}

.card-grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 24px;
}

.config-card {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 20px;
  min-width: 0;
}

.config-card h3 {
  margin-top: 0;
  color: #38bdf8;
}

.card-hint {
  font-size: 0.8rem;
  color: #94a3b8;
  margin-bottom: 18px;
}

.form-group {
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
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

.code-font {
  font-family: monospace;
  line-height: 1.4;
}

.field-help {
  font-size: 0.73rem;
  color: #64748b;
  word-break: break-word;
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

.full-width {
  width: 100%;
  margin-top: 10px;
}

.specialists-grid, .agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 310px), 1fr));
  gap: 18px;
}

.specialist-card {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.spec-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}

.spec-title {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.spec-icon {
  font-size: 1.6rem;
}

.spec-title h3 {
  margin: 0;
  font-size: 1rem;
  word-break: break-word;
}

.spec-slug {
  font-size: 0.72rem;
  color: #64748b;
  word-break: break-all;
}

.badge-type {
  font-size: 0.7rem;
  padding: 4px 8px;
  border-radius: 6px;
  background: #1e293b;
  color: #38bdf8;
  white-space: nowrap;
}

.spec-desc {
  font-size: 0.82rem;
  color: #94a3b8;
  margin: 0;
}

.spec-meta {
  font-size: 0.76rem;
  background: #020617;
  padding: 8px 10px;
  border-radius: 6px;
  color: #cbd5e1;
  word-break: break-all;
}

.spec-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
  flex-wrap: wrap;
}

.memory-workspace, .memory-layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 20px;
}

.sessions-list-panel, .session-detail-panel {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 18px;
  min-width: 0;
}

.session-ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.session-item {
  padding: 10px 12px;
  background: #020617;
  border: 1px solid #1e293b;
  border-radius: 8px;
  cursor: pointer;
}

.session-item.active {
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.1);
}

.session-item div {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
  gap: 6px;
  word-break: break-all;
}

.session-item small {
  color: #64748b;
  font-size: 0.7rem;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.memory-msg-card {
  background: #020617;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 12px;
}

.msg-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}

.role-badge {
  font-size: 0.7rem;
  font-weight: bold;
  padding: 2px 8px;
  border-radius: 4px;
}

.role-badge.user {
  background: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
}

.role-badge.assistant {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}

.msg-textarea {
  width: 100%;
  margin-bottom: 8px;
}

.msg-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.btn-small-save {
  background: #0284c7;
  color: white;
  border: none;
  padding: 5px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.75rem;
}

.btn-small-del {
  background: transparent;
  color: #f87171;
  border: 1px solid #ef4444;
  padding: 5px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.75rem;
}

.ctx-card {
  background: #020617;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
}

.ctx-card pre {
  margin: 6px 0 0 0;
  font-size: 0.75rem;
  color: #38bdf8;
  overflow-x: auto;
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

.modal-card, .modal-window {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 12px;
  width: 100%;
  max-width: 680px;
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
  gap: 10px;
  flex-wrap: wrap;
}

.modal-footer {
  border-top: 1px solid #1e293b;
  border-bottom: none;
  justify-content: flex-end;
}

.modal-body {
  padding: 18px;
  overflow-y: auto;
}

.sub-panel {
  background: #020617;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 14px;
  margin-top: 10px;
}

.sub-panel h4 {
  margin: 0 0 12px 0;
  color: #38bdf8;
}

.feedback-box {
  padding: 10px;
  border-radius: 6px;
  margin-bottom: 10px;
  font-size: 0.82rem;
}

.feedback-box.success {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
  border: 1px solid #22c55e;
}

.feedback-box.error {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid #ef4444;
}

.empty-hint {
  color: #64748b;
  font-size: 0.85rem;
  padding: 15px 0;
}

.close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.2rem;
  cursor: pointer;
}

/* =========================================================
   RESPONSIVIDADE COMPLETA (TABLETS E CELULARES)
   ========================================================= */
@media (max-width: 1024px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
  .memory-workspace, .memory-layout {
    grid-template-columns: 1fr;
  }
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
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .env-badge {
    display: none; /* Oculta badge de IP na barra do celular para ganhar espaço */
  }

  .back-link {
    width: 100%;
    padding: 8px;
    font-size: 0.8rem;
  }

  .content-area {
    padding: 14px;
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .section-header button,
  .section-header > div:last-child {
    width: 100%;
  }

  .form-row {
    flex-direction: column;
    gap: 0;
  }

  .form-row .form-group {
    width: 100% !important;
  }

  .specialists-grid, .agents-grid, .manual-grid {
    grid-template-columns: 1fr !important;
  }

  .spec-actions button {
    flex: 1;
  }

  .modal-card, .modal-window {
    width: 100% !important;
    max-width: 100% !important;
    max-height: 95dvh;
  }

  .modal-body {
    padding: 14px;
  }
}
</style>
