
<template>
  <section class="tab-section">
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
          <li>O sistema lê automaticamente o ficheiro <code>models.json</code> do GitHub Gist ao abrir ou ao clicar em <strong>Atualizar Modelos do GitHub Gist</strong>.</li>
          <li>Para adicionar um modelo recém-lançado para todos os agentes, basta editar o seu Gist ou escolher <code>✍️ Inserir ID Manual</code>.</li>
        </ul>
      </div>

      <div class="manual-card">
        <h3>🔗 2. Encadeamento de Especialistas (Pipeline)</h3>
        <ul>
          <li v-pre>No modal de qualquer especialista, defina o campo <strong>Próximo Agente na Cadeia (next_agent_slug)</strong> para enviar a resposta automaticamente ao próximo nó.</li>
          <li v-pre>Utilize <code>{{BASE_URL}}</code> nos endpoints para apontar automaticamente para o IP e porta ativos do seu servidor.</li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// Componente estático de documentação operacional
</script>

<style scoped>
.section-header {
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

.manual-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 18px;
}

.manual-card {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 20px;
}

.manual-card h3 {
  margin-top: 0;
  color: #38bdf8;
  font-size: 1.05rem;
}

.manual-card ul {
  padding-left: 20px;
  color: #cbd5e1;
  font-size: 0.88rem;
  line-height: 1.6;
}

.manual-card code {
  background: #020617;
  color: #38bdf8;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.8rem;
}
</style>
