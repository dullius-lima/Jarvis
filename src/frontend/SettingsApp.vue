<template>
  <div class="settings-layout">
    <!-- BARRA LATERAL DE NAVEGAÇÃO -->
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
          @click="currentTab = 'agents'"
          :class="{ active: currentTab === 'agents' }"
          class="nav-item"
        >
          🤖 Especialistas Dinâmicos
        </button>

        <button
          @click="currentTab = 'memory'"
          :class="{ active: currentTab === 'memory' }"
          class="nav-item"
        >
          🗂️ Memória Dinâmica (Sessions)
        </button>

        <button
          @click="currentTab = 'connectors'"
          :class="{ active: currentTab === 'connectors' }"
          class="nav-item"
        >
          🔌 Conexões Externas &amp; IoT
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
            <p>Gerencie o Agente Líder, chaves multi-provedor e modelos sincronizados automaticamente com o seu GitHub Gist.</p>
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

      <!-- =========================================================
           ABA 2: ESPECIALISTAS DINÂMICOS (CRUD + TOOLS + PIPELINE)
           ========================================================= -->
      <section v-if="currentTab === 'agents'" class="tab-section">
        <header class="section-header">
          <div>
            <h1>🤖 Agentes Especialistas &amp; Terminações Nervosas (SNP)</h1>
            <p>Crie especialistas cognitivos (LLM), nós de API REST, servidores MCP ou scripts JS encadeados.</p>
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
              <span v-if="ag.provider">🧠 {{ ag.provider }} ({{ ag.model }})</span>
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
           ABA 3: MEMÓRIA DINÂMICA (SESSION ID)
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
           ABA 4: CONEXÕES EXTERNAS & IOT
           ========================================================= -->
      <section v-if="currentTab === 'connectors'" class="tab-section">
        <header class="section-header">
          <div>
            <h1>🔌 Cofre de Conexões Externas, E-mail, Mensageria &amp; IoT</h1>
            <p>Configure chaves de API e endpoints para Gmail, Outlook, WhatsApp, Telegram, Brapi B3, GitHub e Home Assistant.</p>
          </div>
        </header>

        <div class="agents-grid">
          <div v-for="conn in connectorsList" :key="conn.provider_key" class="agent-card">
            <div class="agent-card-header">
              <div>
                <span class="agent-type-tag">{{ conn.category }}</span>
                <h3>{{ conn.icon }} {{ conn.name }}</h3>
              </div>
              <input type="checkbox" v-model="conn.is_enabled" />
            </div>
            <p class="agent-desc">{{ conn.description }}</p>

            <div class="form-group">
              <label>API Key / Token de Acesso</label>
              <input type="password" v-model="conn.api_key" class="input-field" placeholder="Token ou Senha de App..." />
            </div>

            <div class="form-group">
              <label v-pre>Endpoint / URL (Aceita {{BASE_URL}})</label>
              <input type="text" v-model="conn.endpoint_url" class="input-field" placeholder="https://..." />
            </div>

            <button @click="saveConnector(conn)" class="btn-primary" style="width: 100%;">
              💾 Salvar {{ conn.name }}
            </button>
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
              <div class="form-group" style="max-width: 90px;">
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
                  <option value="llm">🧠 Agente de IA Cognitivo (LLM + Múltiplas Tools)</option>
                  <option value="api">🌐 Nó Direto REST API / Webhook (Com Formatação)</option>
                  <option value="mcp">🔌 Cliente Direto MCP (Model Context Protocol)</option>
                  <option value="code">💻 Nó de Script JavaScript (Determinístico)</option>
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

          <!-- BLOCO 2C: SE FOR NÓ DE SCRIPT JAVASCRIPT -->
          <div v-else-if="editingAgent.agent_type === 'code'" class="step-section">
            <div class="step-badge">2. Script JavaScript / TypeScript Determinístico</div>
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
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <div>
                <span class="step-badge" style="margin-bottom: 2px;">3. 🛠️ Ferramentas (Tools / Nós Fixos) Conectadas a este Agente</span>
                <p style="font-size: 12px; color: #94a3b8; margin: 4px 0 0 0;">
                  Marque os nós existentes (um mesmo nó fixo pode servir vários agentes) ou crie uma nova Tool funcional abaixo.
                </p>
              </div>
              <button
                type="button"
                @click="showInlineToolCreator = !showInlineToolCreator"
                class="btn-secondary"
              >
                {{ showInlineToolCreator ? '✕ Fechar Criador de Tool' : '➕ Criar Nova Tool Funcional' }}
              </button>
            </div>

            <!-- CRIADOR INLINE DE NOVA TOOL FUNCIONAL -->
            <div v-if="showInlineToolCreator" class="inline-tool-creator-box">
              <div class="form-row">
                <div class="form-group" style="max-width: 70px;">
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

              <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button type="button" @click="testCustomToolDraft" class="btn-test">
                  ⚡ Testar Tool
                </button>
                <button type="button" @click="saveCustomToolAndAttach" class="btn-primary">
                  💾 Salvar Tool no Banco &amp; Vincular ao Agente
                </button>
              </div>
            </div>

            <!-- GRADE DE CHECKBOXES DAS TOOLS EXISTENTES -->
            <div class="tools-checkbox-grid">
              <label
                v-for="tool in availableToolsCatalog"
                :key="tool.id"
                class="tool-checkbox-card"
                :class="{ selected: Array.isArray(editingAgent.tools) && editingAgent.tools.includes(tool.id) }"
              >
                <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                  <input
                    type="checkbox"
                    :value="tool.id"
                    v-model="editingAgent.tools"
                  />
                  <span>{{ tool.icon || '🔌' }}</span>
                  <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600;">
                    {{ tool.label }}
                  </span>
                </div>
                <span class="tool-badge-mini">{{ (tool.http_method || tool.tool_type || 'NÓ').toUpperCase() }}</span>
              </label>
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

const currentTab = ref<'brain' | 'agents' | 'memory' | 'connectors' | 'manual'>('brain');

// Endpoints padrão por provedor
const DEFAULT_ENDPOINTS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434/v1'
};

// Catálogo reativo sincronizado com o GitHub Gist
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

// Estado do Cérebro Central (JARVIS)
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

const availableToolsCatalog = ref<any[]>([
  { id: 'save_to_database', icon: '🗄️', label: 'DynamicDatabaseTool (Salvar JSON)', description: 'Salva dados em coleção JSON no PostgreSQL', http_method: 'SQL' },
  { id: 'vector_rag', icon: '📚', label: 'Consultar Base RAG (Vetorial)', description: 'Busca semântica de documentos no pgvector', http_method: 'RAG' },
  { id: 'ssh_exec', icon: '💻', label: 'Executar Comando SSH', description: 'Executa comandos remotamente em servidor SSH', http_method: 'SSH' },
  { id: 'http_request', icon: '🌐', label: 'HTTP Request Universal', description: 'Dispara requisições REST externas', http_method: 'HTTP' },
  { id: 'brapi_b3', icon: '📈', label: 'Brapi B3 (Cotações e FIIs)', description: 'Consulta cotações e dividendos na B3', http_method: 'GET', endpoint_url: 'https://brapi.dev/api/quote/{{query}}' },
  { id: 'gmail_send', icon: '📧', label: 'Google Gmail (Enviar/Ler)', description: 'Dispara e lê e-mails via Gmail', http_method: 'POST' },
  { id: 'outlook_mail', icon: '📨', label: 'Microsoft Outlook / 365', description: 'Integração com Microsoft Graph', http_method: 'POST' },
  { id: 'whatsapp_msg', icon: '💬', label: 'WhatsApp Business API', description: 'Envio de mensagens WhatsApp', http_method: 'POST' },
  { id: 'home_assistant', icon: '🏠', label: 'Home Assistant IoT', description: 'Automação residencial e sensores', http_method: 'POST' }
]);

// Identificadores alinhados com o <template> do modal
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
  agent_type: 'llm',
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
    const localCustom = JSON.parse(localStorage.getItem('custom_agent_tools_catalog') || '[]');
    for (const item of localCustom) {
      if (!availableToolsCatalog.value.some((t: any) => t.id === item.id)) {
        availableToolsCatalog.value.push({
          id: item.id,
          icon: item.icon || '🛠️',
          label: item.label || item.id,
          description: item.description || '',
          http_method: item.http_method || 'GET',
          tool_type: item.tool_type || 'http',
          endpoint_url: item.endpoint_url || ''
        });
      }
    }

    const res = await fetch('/api/v1/connectors');
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      for (const item of json.data) {
        const id = item.provider_key;
        const cfg = item.config || {};
        const existingIdx = availableToolsCatalog.value.findIndex((t: any) => t.id === id);
        const entry = {
          id,
          icon: item.icon || '🛠️',
          label: item.name || id,
          description: item.description || cfg.description || '',
          http_method: cfg.http_method || item.http_method || 'GET',
          tool_type: cfg.tool_type || 'http',
          endpoint_url: cfg.endpoint_url || item.endpoint_url || ''
        };
        if (existingIdx >= 0) {
          availableToolsCatalog.value[existingIdx] = { ...availableToolsCatalog.value[existingIdx], ...entry };
        } else {
          availableToolsCatalog.value.push(entry);
        }
      }
    }
  } catch (err) {
    console.warn('Falha ao carregar tools customizadas do banco:', err);
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

    const newEntry = {
      id,
      icon: payload.icon,
      label: payload.name,
      description: payload.description,
      http_method: newToolDraft.http_method,
      tool_type: newToolDraft.tool_type,
      endpoint_url: newToolDraft.endpoint_url.trim()
    };

    const idx = availableToolsCatalog.value.findIndex((t: any) => t.id === id);
    if (idx >= 0) {
      availableToolsCatalog.value[idx] = newEntry;
    } else {
      availableToolsCatalog.value.push(newEntry);
    }

    const savedLocal = JSON.parse(localStorage.getItem('custom_agent_tools_catalog') || '[]');
    const filteredLocal = savedLocal.filter((t: any) => t.id !== id);
    filteredLocal.push({ ...newEntry, color: '#38bdf8' });
    localStorage.setItem('custom_agent_tools_catalog', JSON.stringify(filteredLocal));

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
    toolCreatorFeedback.value = `🔴 Erro ao salvar no banco: ${err.message}`;
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
  const list = currentProviderModels('groq');
  const firstMod = list.find((m) => m.value !== 'CUSTOM_INPUT')?.value || 'llama-3.3-70b-versatile';
  editingAgent.value = {
    id: null,
    name: '',
    slug: '',
    icon: '🤖',
    description: '',
    agent_type: 'llm',
    provider: 'groq',
    model: firstMod,
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
    temperature: Number(ag.temperature ?? 0.3),
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

// =========================================================
// CONECTORES EXTERNOS & IOT
// =========================================================
const defaultConnectors = [
  { provider_key: 'gmail', name: 'Google Gmail', category: 'E-mail', icon: '📧', description: 'Leitura e disparo de e-mails via Gmail API / SMTP.', is_enabled: true, api_key: '', endpoint_url: 'https://gmail.googleapis.com' },
  { provider_key: 'outlook', name: 'Microsoft Outlook / 365', category: 'E-mail', icon: '📨', description: 'Integração Microsoft Graph para e-mail e calendário.', is_enabled: true, api_key: '', endpoint_url: 'https://graph.microsoft.com/v1.0' },
  { provider_key: 'whatsapp', name: 'WhatsApp Business / Evolution', category: 'Mensageria', icon: '💬', description: 'Envio e recepção de mensagens via Webhook/API.', is_enabled: true, api_key: '', endpoint_url: '{{BASE_URL}}/api/v1/messaging/whatsapp' },
  { provider_key: 'telegram', name: 'Telegram Bot API', category: 'Mensageria', icon: '✈️', description: 'Notificações em tempo real e comandos via BotFather.', is_enabled: true, api_key: '', endpoint_url: 'https://api.telegram.org' },
  { provider_key: 'brapi_b3', name: 'Brapi B3 (Ações & FIIs)', category: 'Finanças', icon: '📈', description: 'Cotações em tempo real, dividendos e indicadores fundamentalistas da B3.', is_enabled: true, api_key: '', endpoint_url: 'https://brapi.dev/api/quote/{{symbol}}' },
  { provider_key: 'home_assistant', name: 'Home Assistant IoT', category: 'Smart Home', icon: '🏠', description: 'Automação residencial e sensores físicos.', is_enabled: true, api_key: '', endpoint_url: 'http://homeassistant.local:8123/api' }
];

const connectorsList = ref<any[]>([...defaultConnectors]);

async function fetchConnectors() {
  try {
    const res = await fetch('/api/v1/connectors');
    const json = await res.json();
    if (json.success && Array.isArray(json.data) && json.data.length > 0) {
      const map = new Map(defaultConnectors.map((c) => [c.provider_key, { ...c }]));
      for (const row of json.data) {
        const cfg = row.config || {};
        map.set(row.provider_key, {
          ...(map.get(row.provider_key) || {}),
          ...row,
          api_key: row.api_key || cfg.api_key || cfg.auth_token || '',
          endpoint_url: row.endpoint_url || cfg.endpoint_url || ''
        });
      }
      connectorsList.value = Array.from(map.values());
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

    const json = await res.json();
    alert(json.message || 'Conector salvo com sucesso!');
    await fetchConnectors();
    await loadCustomToolsFromBackend();
  } catch (err: any) {
    alert(`Erro ao salvar conector: ${err.message}`);
  }
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR');
  } catch {
    return iso;
  }
}

onMounted(async () => {
  await loadSupportedModels(true);
  await fetchBrainSettings();
  await fetchAgents();
  await fetchMemorySessions();
  await fetchConnectors();
  await loadCustomToolsFromBackend();
});
</script>

<style scoped>
.settings-layout {
  display: flex;
  min-height: 100vh;
  background: #020617;
  color: #f8fafc;
  font-family: system-ui, -apple-system, sans-serif;
}
.sidebar {
  width: 270px;
  background: #090f1d;
  border-right: 1px solid #1e293b;
  padding: 20px;
  display: flex;
  flex-direction: column;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 28px;
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
  font-size: 0.72rem;
  color: #64748b;
}
.nav-menu {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.nav-item {
  background: transparent;
  color: #94a3b8;
  border: 1px solid transparent;
  padding: 11px 14px;
  border-radius: 8px;
  text-align: left;
  cursor: pointer;
  font-size: 0.88rem;
  transition: all 0.2s;
}
.nav-item:hover,
.nav-item.active {
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.3);
  font-weight: 600;
}
.sidebar-footer {
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid #1e293b;
}
.back-link {
  color: #38bdf8;
  text-decoration: none;
  font-size: 0.85rem;
}
.content-area {
  flex: 1;
  padding: 32px;
  overflow-y: auto;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 24px;
}
.section-header h1 {
  margin: 0 0 6px 0;
  font-size: 1.4rem;
  color: #f8fafc;
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
  gap: 4px;
}
.sync-meta {
  font-size: 0.72rem;
  color: #94a3b8;
}
.card {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 24px;
}
.form-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.form-group {
  flex: 1;
  min-width: 220px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-group label {
  font-size: 0.8rem;
  color: #cbd5e1;
  font-weight: 600;
}
.saved-badge {
  color: #4ade80;
  font-size: 0.72rem;
  margin-left: 6px;
}
.input-field {
  background: #020617;
  border: 1px solid #334155;
  color: #f8fafc;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 0.88rem;
}
.custom-model-box {
  background: rgba(56, 189, 248, 0.08);
  border: 1px dashed #38bdf8;
  padding: 12px;
  border-radius: 8px;
}
.actions-row {
  display: flex;
  gap: 12px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.btn-primary {
  background: #0284c7;
  color: white;
  border: none;
  padding: 10px 18px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
}
.btn-secondary {
  background: #1e293b;
  color: #e2e8f0;
  border: 1px solid #334155;
  padding: 9px 14px;
  border-radius: 8px;
  cursor: pointer;
}
.btn-secondary-sm {
  background: #1e293b;
  color: #38bdf8;
  border: 1px solid #334155;
  padding: 5px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.76rem;
}
.btn-test {
  background: #0f766e;
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
}
.btn-danger {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.35);
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
}
.btn-danger-sm {
  background: transparent;
  color: #f87171;
  border: none;
  cursor: pointer;
}
.alert-box {
  margin-top: 16px;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 0.86rem;
}
.alert-success {
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid #22c55e;
  color: #86efac;
}
.alert-error {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid #ef4444;
  color: #fca5a5;
}
.agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
  gap: 18px;
}
.agent-card {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.agent-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.agent-card-header h3 {
  margin: 4px 0;
  font-size: 1.05rem;
}
.agent-type-tag {
  font-size: 0.68rem;
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  padding: 2px 8px;
  border-radius: 12px;
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
  color: #cbd5e1;
}
.chain-badge {
  color: #38bdf8;
  font-weight: 600;
}
.tools-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tool-chip {
  font-size: 0.7rem;
  background: #020617;
  border: 1px solid #334155;
  padding: 2px 8px;
  border-radius: 6px;
}
.agent-card-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
}
.memory-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 18px;
}
.session-item {
  width: 100%;
  background: #020617;
  border: 1px solid #1e293b;
  color: #cbd5e1;
  padding: 10px;
  border-radius: 8px;
  margin-bottom: 8px;
  display: flex;
  justify-content: space-between;
  cursor: pointer;
}
.session-item.active {
  border-color: #38bdf8;
  color: #38bdf8;
}
.session-details-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.message-card {
  background: #020617;
  border: 1px solid #1e293b;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.msg-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #38bdf8;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}
.modal-card {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 14px;
  width: 95%;
  max-width: 860px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}
.modal-header,
.modal-footer {
  padding: 16px 22px;
  border-bottom: 1px solid #1e293b;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-header h2 {
  margin: 0;
  font-size: 1.15rem;
  color: #f8fafc;
}
.close-modal-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.2rem;
  cursor: pointer;
}
.modal-footer {
  border-top: 1px solid #1e293b;
  border-bottom: none;
  justify-content: flex-end;
  gap: 10px;
}
.modal-body {
  padding: 20px 22px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.step-section {
  background: #090f1d;
  border: 1px solid #1e293b;
  border-radius: 10px;
  padding: 16px;
}
.step-badge {
  display: inline-block;
  background: rgba(56, 189, 248, 0.14);
  color: #38bdf8;
  font-size: 0.76rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 6px;
  margin-bottom: 12px;
}
.inline-tool-creator-box {
  background: #020617;
  border: 1px dashed #38bdf8;
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 14px;
}
.tools-checkbox-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 8px;
}
.tool-checkbox-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  background: #020617;
  border: 1px solid #1e293b;
  border-radius: 8px;
  font-size: 0.8rem;
  cursor: pointer;
}
.tool-checkbox-card.selected {
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.1);
}
.tool-badge-mini {
  font-size: 0.65rem;
  background: #1e293b;
  color: #94a3b8;
  padding: 2px 6px;
  border-radius: 4px;
}
.manual-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 18px;
}
.manual-card {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 20px;
  line-height: 1.55;
}
.manual-card h3 {
  margin-top: 0;
  color: #38bdf8;
}
</style>