<template>
  <section class="tab-section">
    <header class="section-header">
      <div>
        <h1>📘 Manual de Operação, Modelos de IA & Cascata Económica</h1>
        <p>Guia oficial de escolha de modelos para o Orquestrador (SNC) e Subagentes (SNP), failover automático de créditos e operação do sistema.</p>
      </div>
    </header>

    <div class="manual-grid">
      <div class="manual-card full-width">
        <h3>🧠 1. Qual Modelo Usar: Orquestrador (SNC) vs. Subagentes (SNP)</h3>
        <p class="desc">
          O <strong>Orquestrador Central (JARVIS)</strong> precisa de <strong>baixa latência</strong> e <strong>precisão em Tool Calling</strong> para decidir rápido qual especialista acionar. Já os <strong>Subagentes</strong> devem ser escolhidos conforme a complexidade da tarefa e o custo por token.
        </p>

        <div class="table-wrap">
          <table class="models-table">
            <thead>
              <tr>
                <th>Modelo / Tipo</th>
                <th>Provedor</th>
                <th>Custo / Perfil</th>
                <th>Indicação no Orquestrador (SNC)</th>
                <th>Indicação nos Subagentes (SNP)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>code</code> / <code>api</code> / <code>mcp</code></td>
                <td>Nativo / Local</td>
                <td><span class="badge free">R$ 0,00 (0 Tokens)</span></td>
                <td>Não aplicável (SNC exige LLM).</td>
                <td><strong>🥇 1ª Escolha:</strong> Cálculos Bazin/B3, SQL, Home Assistant, Brapi, rotas REST e servidores MCP.</td>
              </tr>
              <tr>
                <td><code>gemini-3.8-flash</code></td>
                <td>Google Gemini</td>
                <td><span class="badge free">Cota Gratuita Diária</span></td>
                <td><strong>🥇 Ideal Custo Zero:</strong> Modelo Flash oficial vigente do Google, rápido e com suporte a tools.</td>
                <td><strong>✅ Ideal:</strong> Leitura de documentos longos (RAG/PDF), resumos, visão multimodal e triagem.</td>
              </tr>
              <tr>
                <td><code>openai/gpt-oss-120b</code></td>
                <td>Groq</td>
                <td><span class="badge mid">Ativo na Organização Groq</span></td>
                <td><strong>🥇 Principal na Groq:</strong> Modelo habilitado na sua conta Groq, responde em ~0,7s–1,0s com alta inteligência.</td>
                <td><strong>✅ Ideal:</strong> Análise financeira, jurídico, WhatsApp, SQL, redação executiva e síntese de dados.</td>
              </tr>
              <tr>
                <td><code>openai/gpt-oss-20b</code></td>
                <td>Groq</td>
                <td><span class="badge cheap">Ultra-Barato (Requer liberação)</span></td>
                <td><strong>⚠️ Opcional:</strong> Só usar após habilitar em <code>console.groq.com/settings/limits</code>.</td>
                <td><strong>⚠️ Opcional:</strong> Subagentes leves (após desbloqueio na organização Groq).</td>
              </tr>
              <tr>
                <td><code>deepseek-chat</code> (V3)</td>
                <td>DeepSeek</td>
                <td><span class="badge cheap">Frações de Centavo</span></td>
                <td><strong>✅ Alternativa:</strong> Excelente custo-benefício quando cota do Gemini/Groq acabar.</td>
                <td><strong>🥇 Ideal:</strong> Geração de scripts JS/TS, análise de código e relatórios detalhados.</td>
              </tr>
              <tr>
                <td><code>gpt-4o-mini</code></td>
                <td>OpenAI</td>
                <td><span class="badge cheap">Económico Estável</span></td>
                <td><strong>✅ Excelente:</strong> Altíssima estabilidade em Tool Calling multi-etapas.</td>
                <td><strong>✅ Ideal:</strong> Subagentes críticos que exigem JSON estrito sem falhas.</td>
              </tr>
              <tr>
                <td><code>gpt-4o</code> / <code>claude-3.5-sonnet</code></td>
                <td>OpenAI / OpenRouter</td>
                <td><span class="badge premium">Alto Custo (Premium)</span></td>
                <td><strong>⚠️ Reserva:</strong> Usar apenas como último degrau de failover.</td>
                <td><strong>✅ Específico:</strong> Tarefas de altíssima complexidade criativa ou técnica.</td>
              </tr>
              <tr>
                <td><code>llama3.1:8b</code></td>
                <td>Ollama Local</td>
                <td><span class="badge free">100% Offline</span></td>
                <td><strong>⚠️ Contingência:</strong> Usar se a internet externa cair.</td>
                <td><strong>⚠️ Contingência:</strong> Processamento privado sem envio de dados à nuvem.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="manual-card">
        <h3>💸 2. Cascata Automática de Créditos (Failover Económico)</h3>
        <ul>
          <li><strong>Liberdade Total de Modelo:</strong> O sistema executa <strong>exatamente</strong> o modelo que você escolheu ou digitou manualmente, sem sobrescrever.</li>
          <li><strong>Troca Automática ao Acabar Créditos/Cota:</strong> Se o modelo atual retornar erro de crédito esgotado (<code>402</code>), bloqueio (<code>403</code>), cota/taxa (<code>429</code>) ou indisponibilidade (<code>404</code>), o roteador migra automaticamente para o próximo provedor com chave salva no Cofre, do <strong>mais barato para o mais caro</strong>:</li>
        </ul>
        <ol class="ladder-list">
          <li><code>gemini / gemini-3.8-flash</code> (Cota gratuita diária Google)</li>
          <li><code>groq / openai/gpt-oss-120b</code> (Modelo ativo na sua conta Groq)</li>
          <li><code>groq / qwen/qwen3.8-27b</code></li>
          <li><code>groq / openai/gpt-oss-20b</code> (caso habilite na org Groq)</li>
          <li><code>deepseek / deepseek-chat</code> (DeepSeek V3)</li>
          <li><code>openai / gpt-4o-mini</code></li>
          <li><code>gemini / gemini-3.8-pro</code></li>
          <li><code>openrouter / deepseek/deepseek-chat</code></li>
          <li><code>openrouter / anthropic/claude-3.5-sonnet</code></li>
          <li><code>openai / gpt-4o</code> (Reserva premium)</li>
        </ol>
      </div>

      <div class="manual-card">
        <h3>🔑 3. Como Deixar o Failover Sempre Pronto</h3>
        <ul>
          <li><strong>Salve suas chaves uma vez:</strong> Na aba <strong>🧠 Cérebro Central</strong>, ao testar e salvar uma chave de cada provedor (ex: Google Gemini e Groq), ela fica guardada no <strong>Cofre (<code>saved_keys</code>)</strong> mesmo quando você alterna o provedor principal.</li>
          <li><strong>Qualquer Modelo Novo no Dia do Lançamento:</strong> Selecione <code>✍️ Inserir ID Manual...</code> e escreva o ID oficial do provedor — o backend aceita sem precisar atualizar código.</li>
          <li v-pre><strong>Encadeamento & Endpoints:</strong> Use <code>next_agent_slug</code> para ligar subagentes em sequência e <code>{{BASE_URL}}</code> para apontar automaticamente para o servidor ativo.</li>
        </ul>
      </div>
      <div class="manual-card">
        <h3>🔄 4. Atualização Automática de Modelos via GitHub Gist</h3>
        <ul>
          <li><strong>Sincronização Direta:</strong> Ao abrir as configurações ou clicar em <strong>Atualizar Modelos do GitHub Gist</strong>, o sistema lê <code>models.json</code> sem cache (URL sem hash de revisão) e atualiza a lista automaticamente.</li>
          <li><strong>Novos Modelos sem Mexer no Código:</strong> Basta adicionar o objeto <code>{ "label": "...", "value": "..." }</code> no seu Gist ou usar <code>✍️ Inserir ID Manual...</code> para testar no mesmo segundo.</li>
        </ul>
      </div>

      <div class="manual-card">
        <h3>📲 5. Atualização Automática do App (Live Server)</h3>
        <ul>
          <li><strong>Atualiza Sozinho (Sem Novo APK):</strong> Alterações em telas (<code>.vue</code>), rotas da API, orquestrador, prompts, chaves e subagentes refletem na hora no celular/TV assim que o servidor reinicia (<code>npm run build && pm2 restart all</code>).</li>
          <li><strong>Quando Reinstalar APK:</strong> Apenas se alterar permissões nativas no <code>AndroidManifest.xml</code>, plugins Java/Kotlin em <code>android/</code> ou o endereço <code>server.url</code> em <code>capacitor.config.json</code>.</li>
        </ul>
      </div>
    
    <section class="sens-manual-card">
      <h3>🎙️ Guia de Sensibilidade do Microfone (50% a 250%)</h3>
      <p class="sens-manual-desc">
        O controle deslizante em <strong>Sensibilidade &amp; Áudio</strong> calibra em tempo real o ganho vocal e o piso de disparo do celular (filtro 300 Hz – 3.400 Hz), sem precisar reinstalar o aplicativo:
      </p>
      <div class="sens-grid">
        <div class="sens-item">
          <span class="sens-badge">50% a 80% • Anti-Ruído</span>
          <strong>Ambiente barulhento (Recomendado: 70%)</strong>
          <p>Indicado para sala com TV alta, música, ar-condicionado forte ou carro. Exige falar mais perto do celular (até 50 cm), evitando disparos acidentais.</p>
        </div>
        <div class="sens-item">
          <span class="sens-badge">90% a 130% • Equilibrado</span>
          <strong>Uso diário na mesa (Recomendado: 130%)</strong>
          <p>Calibragem padrão para escritório ou ambientes com ruído moderado, captando voz em tom normal entre 0,5 m e 1,5 m de distância.</p>
        </div>
        <div class="sens-item">
          <span class="sens-badge">140% a 180% • Voz Suave</span>
          <strong>Quarto ou sala tranquila (Recomendado: 160%–170%)</strong>
          <p>Permite chamar o JARVIS em tom natural ou baixo sem elevar a voz, cobrindo de 1,5 m a 3 metros em ambientes silenciosos.</p>
        </div>
        <div class="sens-item">
          <span class="sens-badge">190% a 250% • Máxima</span>
          <strong>Longo alcance ou sussurro (Recomendado: 230%)</strong>
          <p>Capta comandos do outro lado do cômodo (3 m a 5 m) ou em voz bem baixa à noite. Combine com o <em>Bloqueio Anti-TV</em> se houver pessoas falando perto.</p>
        </div>
      </div>
    </section>

  </div>
  </section>
</template>

<script setup lang="ts">
</script>

<style scoped>
.section-header { margin-bottom: 24px; border-bottom: 1px solid #1e293b; padding-bottom: 16px; }
.section-header h1 { margin: 0 0 6px 0; font-size: 1.35rem; }
.section-header p { margin: 0; color: #94a3b8; font-size: 0.88rem; }
.manual-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 18px; }
.manual-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; }
.manual-card.full-width { grid-column: 1 / -1; }
.manual-card h3 { margin-top: 0; color: #38bdf8; font-size: 1.05rem; }
.desc { color: #cbd5e1; font-size: 0.88rem; line-height: 1.5; margin-bottom: 14px; }
.table-wrap { overflow-x: auto; }
.models-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; color: #e2e8f0; }
.models-table th, .models-table td { border: 1px solid #1e293b; padding: 9px 10px; text-align: left; vertical-align: top; }
.models-table th { background: #020617; color: #38bdf8; font-weight: 600; }
.models-table tr:nth-child(even) { background: rgba(15, 23, 42, 0.6); }
.badge { display: inline-block; padding: 2px 7px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; }
.badge.free { background: rgba(16, 185, 129, 0.18); color: #34d399; }
.badge.cheap { background: rgba(56, 189, 248, 0.18); color: #38bdf8; }
.badge.mid { background: rgba(245, 158, 11, 0.18); color: #fbbf24; }
.badge.premium { background: rgba(244, 63, 94, 0.18); color: #fb7185; }
.manual-card ul, .ladder-list { padding-left: 20px; color: #cbd5e1; font-size: 0.86rem; line-height: 1.6; }
.manual-card code { background: #020617; color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-size: 0.78rem; }

.sens-manual-card { margin-top: 18px; background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 14px; padding: 16px; color: #f1f5f9; }
.sens-manual-card h3 { margin: 0 0 6px; font-size: 1rem; color: #38bdf8; }
.sens-manual-desc { font-size: 0.84rem; color: #94a3b8; margin: 0 0 12px; line-height: 1.45; }
.sens-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
.sens-item { background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(148, 163, 184, 0.18); border-radius: 10px; padding: 11px; display: flex; flex-direction: column; gap: 4px; }
.sens-badge { align-self: flex-start; background: rgba(2, 132, 199, 0.22); border: 1px solid rgba(56, 189, 248, 0.45); color: #7dd3fc; font-size: 0.74rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
.sens-item strong { font-size: 0.86rem; color: #e2e8f0; margin-top: 2px; }
.sens-item p { margin: 0; font-size: 0.78rem; color: #94a3b8; line-height: 1.4; }

</style>
