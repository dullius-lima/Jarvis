import fs from 'fs';
import { execSync } from 'child_process';

// 1. Registar WebMCP também na tela principal (App.vue)
const appPath = 'src/frontend/App.vue';
let appVue = fs.readFileSync(appPath, 'utf8');

if (!appVue.includes('registrarFerramentaWebMcp')) {
  appVue = appVue.replace(
    /(<script setup[^>]*>)/,
    `$1\nimport { registrarFerramentaWebMcp } from "./services/webMcpBridge";`
  );
}

if (!appVue.includes('trocar_aba_configuracoes')) {
  const homeTool = `
registrarFerramentaWebMcp({
  name: "trocar_aba_configuracoes",
  description: "Abre o painel de configurações do JARVIS diretamente na aba solicitada (brain, security, voices, agents, connectors, memory, prefs, manual).",
  inputSchema: {
    type: "object",
    properties: {
      aba: { type: "string", enum: ["brain", "security", "voices", "agents", "connectors", "memory", "prefs", "manual"] }
    },
    required: ["aba"]
  },
  execute: ({ aba }) => {
    try { localStorage.setItem("jarvis_active_tab", aba); } catch {}
    window.location.href = \`/settings.html?aba=\${encodeURIComponent(aba)}\`;
    return { success: true, mensagem: \`Abrindo painel na aba \${aba}.\` };
  }
});
`;
  const closeIdx = appVue.lastIndexOf('</script>');
  appVue = appVue.slice(0, closeIdx) + homeTool + appVue.slice(closeIdx);
  fs.writeFileSync(appPath, appVue, 'utf8');
  console.log('✅ Ferramenta WebMCP adicionada em src/frontend/App.vue');
}

// 2. Garantir que SettingsApp.vue abre na aba recebida via ?aba=...
const setPath = 'src/frontend/SettingsApp.vue';
let setVue = fs.readFileSync(setPath, 'utf8');
if (!setVue.includes('URLSearchParams')) {
  const tabMatch = setVue.match(/const\s+(abaAtiva|activeTab|abaAtual|currentTab)\s*=\s*ref[^;]+;/);
  if (tabMatch) {
    const varName = tabMatch[1];
    const urlSync = `\nconst _urlAba = new URLSearchParams(window.location.search).get("aba");\nif (_urlAba) { ${varName}.value = _urlAba as any; }\n`;
    setVue = setVue.replace(tabMatch[0], tabMatch[0] + urlSync);
    fs.writeFileSync(setPath, setVue, 'utf8');
    console.log('✅ Leitura de ?aba= adicionada em src/frontend/SettingsApp.vue');
  }
}

// 3. Reforçar descrição e prompt do Controlador de Interface no PostgreSQL
const sql = `
UPDATE ai_agents
SET
  description = 'Acione OBRIGATORIAMENTE sempre que o usuário pedir para abrir, mudar, navegar ou ir para qualquer aba ou tela do painel de configurações (Núcleo, Segurança, Vozes, Especialistas, Conexões, Memória, Modos e Áudio, Manual).',
  system_prompt = 'Você é o Controlador de Interface do JARVIS. Nunca escreva tags <system> na resposta. Sempre que o usuário pedir para abrir ou mudar de aba no painel, invoque imediatamente a ferramenta conectada webmcp_jarvis com {"tool_name":"trocar_aba_configuracoes","arguments":{"aba":"VALOR"}} onde VALOR deve ser exatamente um destes: brain, security, voices, agents, connectors, memory, prefs, manual. Após acionar a ferramenta, confirme em uma frase curta.'
WHERE name ILIKE '%Controlador%Interface%' OR slug ILIKE '%controlador%interface%' OR allowed_tools::text ILIKE '%webmcp_jarvis%';
`;
execSync(`sudo -u postgres psql -d postgres -c ${JSON.stringify(sql)}`, { stdio: 'inherit' });

// 4. Compilar frontend e reiniciar serviços
execSync('npm run build:frontend', { stdio: 'inherit' });
execSync('pm2 restart all --update-env', { stdio: 'inherit' });
