import fs from 'fs';
import { execSync } from 'child_process';

const targetFiles = [
  'src/services/webMcpService.ts',
  'src/services/orchestrator/montadorPromptEConexoes.ts',
  'src/services/orchestrator/despachanteFerramentas.ts',
  'src/services/orchestrator/llmAndPipelineRunner.ts',
  'src/services/orchestratorService.ts'
].filter(f => fs.existsSync(f));

for (const f of targetFiles) fs.copyFileSync(f, f + '.bak');

try {
  // 1. Limpar frases narradas anteriores da memória recente
  try {
    execSync(
      `sudo -u postgres psql -d postgres -c "DELETE FROM jarvis_chat_memory WHERE content ILIKE '%Controlador de Interface%' OR content ILIKE '%abrir a aba de Memória%';"`,
      { stdio: 'inherit' }
    );
  } catch {}

  // 2. Atualizar src/services/webMcpService.ts com descoberta ativa imediata e resolvedor universal por schema
  const webMcpServiceCode = `import type { Request, Response } from 'express';

export interface WebMcpToolMeta {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

interface SessionEntry {
  tools: WebMcpToolMeta[];
  url: string;
  visible: boolean;
  updatedAt: number;
}

interface PendingCall {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timer: NodeJS.Timeout;
}

const activeSessions = new Map<any, SessionEntry>();
const pendingCalls = new Map<string, PendingCall>();
let boundWss: any = null;
let discoverWaiters: Array<() => void> = [];

export function bindWebMcpWss(wss: any) {
  boundWss = wss;
}

export async function ensureActiveWebMcpTools(waitMs = 350): Promise<WebMcpToolMeta[]> {
  const current = listActiveWebMcpTools();
  if (current.length > 0) return current;

  if (boundWss && boundWss.clients) {
    let sent = 0;
    for (const client of boundWss.clients) {
      if (client.readyState === 1) {
        try {
          client.send(JSON.stringify({ type: 'webmcp:discover' }));
          sent++;
        } catch {}
      }
    }
    if (sent > 0) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          discoverWaiters = discoverWaiters.filter((fn) => fn !== done);
          resolve();
        }, waitMs);
        const done = () => {
          clearTimeout(timer);
          resolve();
        };
        discoverWaiters.push(done);
      });
    }
  }
  return listActiveWebMcpTools();
}

export function handleWebMcpSocketMessage(ws: any, msg: any): boolean {
  if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('webmcp:')) {
    return false;
  }

  if (msg.type === 'webmcp:register' && Array.isArray(msg.tools)) {
    activeSessions.delete(ws);
    activeSessions.set(ws, {
      tools: msg.tools,
      url: String(msg.url || '/'),
      visible: msg.visible !== false,
      updatedAt: Date.now()
    });
    console.log(\`🌐 [WebMCP] Tela conectada (\${msg.url || '/'}) com \${msg.tools.length} tool(s): \${msg.tools.map((t: any) => t.name).join(', ')}\`);
    while (discoverWaiters.length > 0) {
      const fn = discoverWaiters.shift();
      try { fn?.(); } catch {}
    }
    return true;
  }

  if (msg.type === 'webmcp:result' && msg.callId) {
    const pending = pendingCalls.get(msg.callId);
    if (pending) {
      clearTimeout(pending.timer);
      pendingCalls.delete(msg.callId);
      if (msg.error) pending.reject(new Error(msg.error));
      else pending.resolve(msg.result);
    }
    return true;
  }

  return true;
}

export function unregisterWebMcpClient(ws: any) {
  activeSessions.delete(ws);
}

export function listActiveWebMcpTools(): WebMcpToolMeta[] {
  const map = new Map<string, WebMcpToolMeta>();
  for (const [ws, entry] of activeSessions.entries()) {
    if (ws.readyState !== 1) {
      activeSessions.delete(ws);
      continue;
    }
    for (const t of entry.tools) {
      map.set(t.name, t);
    }
  }
  return Array.from(map.values());
}

function sendCallToSocket(targetWs: any, name: string, args: Record<string, any>, timeoutMs: number): Promise<any> {
  const callId = \`wmcp_\${Date.now()}_\${Math.random().toString(36).slice(2, 7)}\`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCalls.delete(callId);
      reject(new Error(\`Timeout na aba para '\${name}'.\`));
    }, timeoutMs);

    pendingCalls.set(callId, { resolve, reject, timer });
    try {
      targetWs.send(JSON.stringify({
        type: 'webmcp:call',
        callId,
        name,
        arguments: args
      }));
    } catch (err) {
      clearTimeout(timer);
      pendingCalls.delete(callId);
      reject(err);
    }
  });
}

export async function callWebMcpTool(name: string, args: Record<string, any> = {}, timeoutMs = 4500): Promise<any> {
  await ensureActiveWebMcpTools(300);

  // Ordena priorizando abas visíveis e mais recentes
  const entries = Array.from(activeSessions.entries())
    .filter(([ws, entry]) => {
      if (ws.readyState !== 1) {
        activeSessions.delete(ws);
        return false;
      }
      return entry.tools.some((t) => t.name === name);
    })
    .sort((a, b) => {
      if (a[1].visible !== b[1].visible) return a[1].visible ? -1 : 1;
      return b[1].updatedAt - a[1].updatedAt;
    });

  if (entries.length === 0) {
    throw new Error(\`Nenhuma tela ativa com a ferramenta WebMCP '\${name}' conectada no momento.\`);
  }

  let lastError: any = null;
  for (const [ws] of entries) {
    try {
      return await sendCallToSocket(ws, name, args, timeoutMs);
    } catch (err) {
      lastError = err;
      activeSessions.delete(ws);
    }
  }

  throw lastError || new Error(\`Falha ao executar '\${name}' nas abas conectadas.\`);
}

function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '');
}

const VALUE_ALIASES: Record<string, string[]> = {
  memory: ['memoria', 'memorias', 'sessao', 'sessoes'],
  connectors: ['conexao', 'conexoes', 'conector', 'iot', 'integracao'],
  agents: ['agente', 'agentes', 'especialista', 'especialistas'],
  voices: ['voz', 'vozes', 'audio', 'biometria'],
  security: ['seguranca', 'acesso', 'senha', 'token'],
  brain: ['nucleo', 'cerebro', 'llm', 'modelo'],
  prefs: ['modo', 'modos', 'preferencia', 'preferencias'],
  manual: ['manual', 'ajuda', 'documentacao']
};

/**
 * Resolvedor universal orientado pelo schema vivo (tools/list) do WebMCP.
 * Funciona para QUALQUER ferramenta registada no frontend sem nomes fixos.
 */
export async function tryUniversalWebMcpAutoExec(
  userText: string,
  llmReply = ''
): Promise<{ toolName: string; args: Record<string, any>; result: any } | null> {
  const tools = await ensureActiveWebMcpTools(350);
  if (tools.length === 0) return null;

  const uNorm = norm(userText);
  const rNorm = norm(llmReply);
  const combined = \`\${uNorm} \${rNorm}\`.trim();

  // Verifica se o pedido ou a resposta da LLM indicam uma intenção de ação na interface
  const hasUiIntent =
    /(abr[aei]|abrir|mud[ae]|mudar|vai|ir|mostr[ae]|mostrar|acess[ae]|acessar|naveg[ae]|navegar|troc[ae]|trocar|volt[ae]|voltar|fech[ae]|fechar|foc[ae]|focar|filtr[ae]|filtrar|acionando|controlador de interface|webmcp)/.test(
      combined
    );
  if (!hasUiIntent) return null;

  let bestTool: WebMcpToolMeta | null = null;
  let bestScore = 0;

  for (const tool of tools) {
    let score = 0;
    const metaWords = norm(\`\${tool.name.replace(/_/g, ' ')} \${tool.description}\`)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4);

    for (const w of metaWords) {
      if (combined.includes(w)) score += 2;
    }

    const props = tool.inputSchema?.properties || {};
    for (const propDef of Object.values(props) as any[]) {
      if (Array.isArray(propDef?.enum)) {
        for (const ev of propDef.enum) {
          const evN = norm(ev);
          const aliases = VALUE_ALIASES[evN] || [evN];
          if (aliases.some((a) => combined.includes(a))) {
            score += 6;
          }
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestTool = tool;
    }
  }

  // Exige pontuação mínima para não disparar em conversas comuns
  if (!bestTool || bestScore < 4) return null;

  const builtArgs: Record<string, any> = {};
  const props = bestTool.inputSchema?.properties || {};
  for (const [propKey, propDef] of Object.entries(props) as [string, any][]) {
    if (Array.isArray(propDef?.enum)) {
      for (const ev of propDef.enum) {
        const evN = norm(ev);
        const aliases = VALUE_ALIASES[evN] || [evN];
        if (aliases.some((a) => combined.includes(a))) {
          builtArgs[propKey] = ev;
          break;
        }
      }
    } else if (propDef?.type === 'string') {
      builtArgs[propKey] = userText;
    }
  }

  console.log(\`⚡ [WebMCP AutoExec] Executando '\${bestTool.name}' com args:\`, builtArgs);
  const result = await callWebMcpTool(bestTool.name, builtArgs);
  return { toolName: bestTool.name, args: builtArgs, result };
}

export async function handleWebMcpJsonRpc(req: Request, res: Response) {
  const { id, method, params } = req.body || {};

  if (method === 'tools/list') {
    const tools = await ensureActiveWebMcpTools(300);
    return res.json({
      jsonrpc: '2.0',
      id: id ?? 1,
      result: { tools }
    });
  }

  if (method === 'tools/call') {
    try {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      const result = await callWebMcpTool(toolName, toolArgs);
      return res.json({
        jsonrpc: '2.0',
        id: id ?? 1,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result
        }
      });
    } catch (err: any) {
      return res.json({
        jsonrpc: '2.0',
        id: id ?? 1,
        error: { code: -32000, message: err.message }
      });
    }
  }

  return res.status(400).json({
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code: -32601, message: \`Método não suportado: \${method}\` }
  });
}
`;
  fs.writeFileSync('src/services/webMcpService.ts', webMcpServiceCode, 'utf8');
  console.log('✅ webMcpService.ts atualizado (universal schema-driven)');

  // 3. Injetar ferramentas WebMCP ativas diretamente no montadorPromptEConexoes.ts
  const montPath = 'src/services/orchestrator/montadorPromptEConexoes.ts';
  if (fs.existsSync(montPath)) {
    let mCode = fs.readFileSync(montPath, 'utf8');
    mCode = mCode.replace(/\/\/ \[WEBMCP_MONTADOR_START\][\s\S]*?\/\/ \[WEBMCP_MONTADOR_END\]\n?/g, '');
    if (!mCode.includes('ensureActiveWebMcpTools')) {
      mCode = `import { ensureActiveWebMcpTools } from "../webMcpService.js";\n` + mCode;
    }
    mCode = mCode.replace(/\bconst\s+promptSistemaCompleto\b/, 'let promptSistemaCompleto');

    // Encontra o return { ... tools ... } dentro do montador
    const retMatch = mCode.match(/return\s*\{[\s\S]*?\btools\b[\s\S]*?\};/);
    if (retMatch) {
      const injectMont = `// [WEBMCP_MONTADOR_START]
  try {
    const _liveWmcp = await ensureActiveWebMcpTools(300);
    if (_liveWmcp.length > 0 && Array.isArray(tools)) {
      for (const _wt of _liveWmcp) {
        const _wName = sanitizeToolName(_wt.name);
        if (!tools.some((t: any) => t?.function?.name === _wName)) {
          tools.push({
            type: 'function',
            function: {
              name: _wName,
              description: \`[Interface Aberta / WebMCP] \${_wt.description}\`,
              parameters: (_wt.inputSchema && Object.keys(_wt.inputSchema).length > 0)
                ? _wt.inputSchema
                : { type: 'object', properties: {} }
            }
          });
        }
      }
      if (typeof promptSistemaCompleto === 'string') {
        promptSistemaCompleto += \`\\n\\n[FERRAMENTAS DE TELA ATIVAS (WEBMCP)]:\\n\${_liveWmcp.map(t => \`- \${sanitizeToolName(t.name)}: \${t.description}\`).join('\\n')}\\nREGRA CRÍTICA: Para executar qualquer ação visual na interface acima, CHAME A FERRAMENTA NATIVA correspondente. Nunca responda apenas "Vou abrir..." em texto sem chamar a ferramenta.\`;
      }
    }
  } catch {}
  // [WEBMCP_MONTADOR_END]\n  `;
      mCode = mCode.replace(retMatch[0], injectMont + retMatch[0]);
      fs.writeFileSync(montPath, mCode, 'utf8');
      console.log('✅ montadorPromptEConexoes.ts atualizado (tools WebMCP na lista nativa da LLM)');
    } else {
      console.log('⚠️ Estrutura de return em montadorPromptEConexoes.ts:', mCode.slice(-500));
    }
  }

  // 4. Injetar execução direta de qualquer tool WebMCP no despachanteFerramentas.ts
  const despPath = 'src/services/orchestrator/despachanteFerramentas.ts';
  if (fs.existsSync(despPath)) {
    let dCode = fs.readFileSync(despPath, 'utf8');
    dCode = dCode.replace(/\/\/ \[WEBMCP_DESP_START\][\s\S]*?\/\/ \[WEBMCP_DESP_END\]\n?/g, '');
    if (!dCode.includes('callWebMcpTool')) {
      dCode = `import { callWebMcpTool, listActiveWebMcpTools } from "../webMcpService.js";\n` + dCode;
    }

    const fnLineMatch = dCode.match(/const\s+fnName\s*=\s*sanitizeToolName\([^;]+;\s*/);
    const tcVarMatch = dCode.match(/for\s*\(\s*const\s+(\w+)\s+of\s+/);
    const argsVarMatch = dCode.match(/const\s+(parsedArgs|args)\s*=/);
    const resArrMatch = dCode.match(/(\w+)\.push\(\{\s*role:\s*['"]tool['"]/);

    if (fnLineMatch && tcVarMatch && resArrMatch) {
      const tcVar = tcVarMatch[1];
      const argsVar = argsVarMatch ? argsVarMatch[1] : '{}';
      const resArr = resArrMatch[1];
      const despHook = `${fnLineMatch[0]}// [WEBMCP_DESP_START]
      const _matchedWmcp = listActiveWebMcpTools().find((wt) => sanitizeToolName(wt.name) === fnName);
      if (_matchedWmcp) {
        const _wmcpRes = await callWebMcpTool(_matchedWmcp.name, typeof ${argsVar} === 'object' && ${argsVar} ? ${argsVar} : {});
        ${resArr}.push({ role: 'tool', tool_call_id: ${tcVar}.id, content: JSON.stringify(_wmcpRes) });
        continue;
      }
      // [WEBMCP_DESP_END]\n      `;
      dCode = dCode.replace(fnLineMatch[0], despHook);
      fs.writeFileSync(despPath, dCode, 'utf8');
      console.log(`✅ despachanteFerramentas.ts atualizado (loop var: ${tcVar}, resArr: ${resArr})`);
    } else {
      console.log('⚠️ Padrão de despachanteFerramentas.ts:', {
        fnLine: !!fnLineMatch,
        tcVar: tcVarMatch?.[1],
        resArr: resArrMatch?.[1]
      });
    }
  }

  // 5. Injetar execução universal no ponto exato antes do retorno do TRY em orchestratorService.ts
  const orchPath = 'src/services/orchestratorService.ts';
  let oCode = fs.readFileSync(orchPath, 'utf8');
  oCode = oCode.replace(/\/\/ \[WEBMCP_FINAL_FALLBACK_START\][\s\S]*?\/\/ \[WEBMCP_FINAL_FALLBACK_END\]\n?/g, '');
  oCode = oCode.replace(/\/\/ \[WEBMCP_DYNAMIC_ORCH_START\][\s\S]*?\/\/ \[WEBMCP_DYNAMIC_ORCH_END\]\n?/g, '');
  oCode = oCode.replace(/\/\/ \[WEBMCP_ORCH_START\][\s\S]*?\/\/ \[WEBMCP_ORCH_END\]\n?/g, '');
  oCode = oCode.replace(
    /import\s*\{[^}]*webMcpService[^}]*\}\s*from\s*["']\.\/webMcpService\.js["'];?\n?/g,
    ''
  );
  oCode = `import { tryUniversalWebMcpAutoExec } from "./webMcpService.js";\n` + oCode;
  oCode = oCode.replace(/\bconst\s+textoRespostaFinal\b/, 'let textoRespostaFinal');

  // Localiza o return { ... } que vem ANTES do bloco catch (dentro do try principal!)
  const catchIdx = oCode.indexOf('} catch');
  const trySlice = catchIdx !== -1 ? oCode.slice(0, catchIdx) : oCode;
  const tryRetIdx = trySlice.lastIndexOf('return {');

  if (tryRetIdx !== -1) {
    // Descobre automaticamente o nome da variável do prompt do usuário no arquivo
    const promptVarMatch = trySlice.match(/\b(promptUsuario|userPrompt|textoPrompt|mensagemUsuario|textPrompt)\b/);
    const promptVar = promptVarMatch ? promptVarMatch[1] : '""';
    const hasTextoFinal = trySlice.includes('textoRespostaFinal');

    console.log('🔎 Ponto de injeção no TRY do orchestratorService.ts:', {
      tryRetIdx,
      promptVar,
      hasTextoFinal
    });

    const universalHook = `// [WEBMCP_FINAL_FALLBACK_START]
    try {
      const _wmcpAuto = await tryUniversalWebMcpAutoExec(
        String(${promptVar} || ''),
        ${hasTextoFinal ? 'String(textoRespostaFinal || "")' : '""'}
      );
      if (_wmcpAuto) {
        ${hasTextoFinal ? 'textoRespostaFinal = `✅ Ação executada na interface (${_wmcpAuto.toolName}).`;' : ''}
      }
    } catch (_wmcpErr: any) {
      console.warn('[WebMCP AutoExec]', _wmcpErr?.message || _wmcpErr);
    }
    // [WEBMCP_FINAL_FALLBACK_END]\n    `;

    oCode = oCode.slice(0, tryRetIdx) + universalHook + oCode.slice(tryRetIdx);
    fs.writeFileSync(orchPath, oCode, 'utf8');
    console.log('✅ orchestratorService.ts atualizado DENTRO do bloco try!');
  } else {
    console.log('⚠️ Não encontrou return { antes do catch em orchestratorService.ts');
  }

  // 6. Compilar backend e reiniciar
  execSync('npm run build', { stdio: 'inherit' });
  for (const f of targetFiles) fs.unlinkSync(f + '.bak');
  execSync('pm2 restart jarvis --update-env', { stdio: 'inherit' });
  console.log('🚀 WebMCP Universal v2 compilado e ativo!');
} catch (err) {
  console.error('❌ Erro no build, restaurando backups...', err);
  for (const f of targetFiles) {
    if (fs.existsSync(f + '.bak')) {
      fs.copyFileSync(f + '.bak', f);
      fs.unlinkSync(f + '.bak');
    }
  }
  process.exit(1);
}
