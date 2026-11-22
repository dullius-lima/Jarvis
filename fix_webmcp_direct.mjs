import fs from 'fs';
import { execSync } from 'child_process';

// 1. Limpar ecos <system> da memória recente
try {
  execSync('sudo -u postgres psql -d postgres -c "DELETE FROM jarvis_chat_memory WHERE content ILIKE \'%Controlador de Interface%\';"', { stdio: 'inherit' });
} catch {}

// 2. Atualizar src/services/orchestratorService.ts diretamente em processWorkflowExecution
const orchPath = 'src/services/orchestratorService.ts';
const backupPath = orchPath + '.bak';
fs.copyFileSync(orchPath, backupPath);

let code = fs.readFileSync(orchPath, 'utf8');
code = code.replace(/\/\/ \[WEBMCP_ORCH_START\][\s\S]*?\/\/ \[WEBMCP_ORCH_END\]\n?/g, '');

if (!code.includes('callWebMcpTool')) {
  code = 'import { callWebMcpTool, listActiveWebMcpTools } from "./webMcpService.js";\n' + code;
}

const helperCode = `// [WEBMCP_ORCH_START]
function _resolverAbaWebMcp(texto: string): string | null {
  const t = String(texto || "").toLowerCase();
  if (t.includes("memória") || t.includes("memoria") || t.includes("memory")) return "memory";
  if (t.includes("conexões") || t.includes("conexoes") || t.includes("conector") || t.includes("iot")) return "connectors";
  if (t.includes("especialista") || t.includes("agente") || t.includes("agents")) return "agents";
  if (t.includes("voz") || t.includes("voices")) return "voices";
  if (t.includes("segurança") || t.includes("seguranca") || t.includes("security") || t.includes("acesso")) return "security";
  if (t.includes("núcleo") || t.includes("nucleo") || t.includes("brain") || t.includes("cérebro")) return "brain";
  if (t.includes("modo") || t.includes("áudio") || t.includes("audio") || t.includes("prefer")) return "prefs";
  if (t.includes("manual") || t.includes("ajuda")) return "manual";
  return null;
}

async function _tentarExecutarWebMcpPorTexto(texto: string): Promise<string | null> {
  const low = String(texto || "").toLowerCase();
  const isSystemTag = low.includes("<system>") && (low.includes("controlador de interface") || low.includes("abrir a aba") || low.includes("mudar a aba"));
  const isUserNav = /(abr[aei]|mud[ae]|vai|ir|mostr[ae]|acess[ae]|naveg[ae]|troc[ae]|acionando)/.test(low)
    && /(aba|painel|configura|mem[oó]ria|conex[oõ]es|especialista|voz|seguran[cç]a|n[uú]cleo|manual)/.test(low);
  if (!isSystemTag && !isUserNav) return null;

  const aba = _resolverAbaWebMcp(texto);
  if (!aba) return null;

  const tools = listActiveWebMcpTools();
  if (!tools.some((x) => x.name === "trocar_aba_configuracoes")) {
    console.warn("[WebMCP] Pedido de aba '" + aba + "' detectado, mas nenhuma aba do navegador está conectada no WS.");
    return null;
  }

  await callWebMcpTool("trocar_aba_configuracoes", { aba });
  return "✅ Abrindo a aba **" + aba + "** no painel de configurações.";
}
// [WEBMCP_ORCH_END]
`;

const procRegex = /(export\s+async\s+function\s+processWorkflowExecution\s*\(([^)]*)\)[^{]*\{)/;
const match = code.match(procRegex);

if (!match) {
  console.error('❌ processWorkflowExecution não encontrada! Funções exportadas:');
  console.log(code.match(/export\s+async\s+function\s+[a-zA-Z0-9_]+/g));
  fs.unlinkSync(backupPath);
  process.exit(1);
}

const rawParams = match[2].split(',').map(p => p.trim().split(':')[0].trim().replace(/\?$/, '')).filter(Boolean);
console.log('🔎 processWorkflowExecution encontrada! Parâmetros:', rawParams);

const entryHook = `// [WEBMCP_ORCH_START]
  try {
    const _argsList: any[] = [${rawParams.join(', ')}];
    const _rawStr = _argsList.map(a => typeof a === "string" ? a : JSON.stringify(a || {})).join(" ");
    const _webMcpOk = await _tentarExecutarWebMcpPorTexto(_rawStr);
    if (_webMcpOk) {
      return {
        success: true,
        response: _webMcpOk,
        reply: _webMcpOk,
        message: _webMcpOk,
        agentTriggered: "Controlador de Interface (WebMCP)",
        data: { response: _webMcpOk, agent: "Controlador de Interface (WebMCP)" }
      } as any;
    }
  } catch (_e: any) {
    console.warn("[WebMCP Entry Hook]", _e?.message || _e);
  }
  // [WEBMCP_ORCH_END]
`;

code = code.replace(match[0], helperCode + '\n' + match[0] + '\n' + entryHook);
fs.writeFileSync(orchPath, code, 'utf8');

try {
  execSync('npm run build', { stdio: 'inherit' });
  fs.unlinkSync(backupPath);
  console.log('✅ Build concluído em processWorkflowExecution!');
  execSync('pm2 restart jarvis --update-env', { stdio: 'inherit' });
} catch (err) {
  console.error('❌ Falha no build, restaurando backup...');
  fs.copyFileSync(backupPath, orchPath);
  fs.unlinkSync(backupPath);
  process.exit(1);
}
