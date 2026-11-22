import type { Request, Response } from 'express';

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
    console.log(`🌐 [WebMCP] Tela conectada (${msg.url || '/'}) com ${msg.tools.length} tool(s): ${msg.tools.map((t: any) => t.name).join(', ')}`);
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
  const callId = `wmcp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCalls.delete(callId);
      reject(new Error(`Timeout na aba para '${name}'.`));
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
    throw new Error(`Nenhuma tela ativa com a ferramenta WebMCP '${name}' conectada no momento.`);
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

  throw lastError || new Error(`Falha ao executar '${name}' nas abas conectadas.`);
}

function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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

export async function tryUniversalWebMcpAutoExec(
  userText: string,
  llmReply = ''
): Promise<{ toolName: string; args: Record<string, any>; result: any } | null> {
  const tools = await ensureActiveWebMcpTools(350);
  if (tools.length === 0) return null;

  // 1. Prioridade máxima: interpreta blocos XML <tool_call> emitidos em texto por qualquer LLM
  const xmlBlocks = Array.from(String(llmReply || '').matchAll(/<tool_call>([\s\S]*?)<\/tool_call>/gi));
  for (const match of xmlBlocks) {
    const inner = String(match[1] || '').trim();
    let rawName = '';
    let parsedArgs: Record<string, any> = {};

    if (inner.startsWith('{')) {
      try {
        const obj = JSON.parse(inner);
        rawName = String(obj.name || obj.tool || obj.tool_name || obj.function || '').trim();
        const rawArgs = obj.arguments ?? obj.args ?? obj.params ?? obj.parameters ?? {};
        parsedArgs = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
      } catch {}
    } else {
      const braceIdx = inner.indexOf('{');
      if (braceIdx !== -1) {
        rawName = inner.slice(0, braceIdx).trim().replace(/\(.*$/, '').trim();
        const jsonPart = inner.slice(braceIdx).replace(/\)\s*$/, '').trim();
        try {
          parsedArgs = JSON.parse(jsonPart);
        } catch {}
      } else {
        rawName = inner.replace(/\(\s*\)\s*$/, '').trim();
      }
    }

    if (rawName) {
      const cleanRaw = rawName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      const matched = tools.find(
        (t) =>
          t.name === rawName ||
          t.name.toLowerCase() === rawName.toLowerCase() ||
          t.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_') === cleanRaw
      );
      if (matched) {
        console.log(`⚡ [WebMCP XML] Executando '${matched.name}' com args:`, parsedArgs);
        const result = await callWebMcpTool(matched.name, parsedArgs || {});
        return { toolName: matched.name, args: parsedArgs || {}, result };
      }
    }
  }

  // 2. Contingência semântica orientada pelo inputSchema vivo
  const uNorm = norm(userText);
  const rNorm = norm(llmReply);
  const combined = `${uNorm} ${rNorm}`.trim();

  const hasUiIntent =
    /(abr[aei]|abrir|mud[ae]|mudar|vai|ir|mostr[ae]|mostrar|acess[ae]|acessar|naveg[ae]|navegar|troc[ae]|trocar|volt[ae]|voltar|fech[ae]|fechar|foc[ae]|focar|filtr[ae]|filtrar|acionando|controlador de interface|webmcp)/.test(
      combined
    );
  if (!hasUiIntent) return null;

  let bestTool: WebMcpToolMeta | null = null;
  let bestScore = 0;

  for (const tool of tools) {
    let score = 0;
    const metaWords = norm(`${tool.name.replace(/_/g, ' ')} ${tool.description}`)
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

  console.log(`⚡ [WebMCP AutoExec] Executando '${bestTool.name}' com args:`, builtArgs);
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
    error: { code: -32601, message: `Método não suportado: ${method}` }
  });
}
