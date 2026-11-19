export interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  execute: (args: Record<string, any>) => Promise<any> | any;
}

const registeredTools = new Map<string, WebMcpTool>();
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;

function getWsUrl(): string {
  const isCapacitor =
    window.location.protocol === 'capacitor:' ||
    (window.location.hostname === 'localhost' && !window.location.port);
  if (isCapacitor) {
    return 'wss://163.176.111.18/ws';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function syncToolsWithBackend() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const tools = Array.from(registeredTools.values()).map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema
  }));
  socket.send(JSON.stringify({
    type: 'webmcp:register',
    visible: document.visibilityState === 'visible',
    url: window.location.pathname,
    tools
  }));
}

function bindLifecycleListeners() {
  if (listenersBound || typeof window === 'undefined') return;
  listenersBound = true;

  const reannounce = () => {
    connectBridgeSocket();
    syncToolsWithBackend();
  };

  window.addEventListener('pageshow', reannounce);
  window.addEventListener('focus', reannounce);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reannounce();
  });
}

function connectBridgeSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    socket = new WebSocket(getWsUrl());

    socket.onopen = () => {
      syncToolsWithBackend();
    };

    socket.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'webmcp:discover') {
          syncToolsWithBackend();
          return;
        }
        if (msg.type === 'webmcp:call' && msg.name) {
          const tool = registeredTools.get(msg.name);
          if (!tool) {
            socket?.send(JSON.stringify({
              type: 'webmcp:result',
              callId: msg.callId,
              error: `Ferramenta WebMCP '${msg.name}' não encontrada nesta tela.`
            }));
            return;
          }

          const result = await tool.execute(msg.arguments || {});
          socket?.send(JSON.stringify({
            type: 'webmcp:result',
            callId: msg.callId,
            result
          }));
        }
      } catch (err: any) {
        console.error('[WebMCP] Falha na execução:', err);
      }
    };

    socket.onclose = () => {
      socket = null;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectBridgeSocket, 2000);
    };
  } catch (err) {
    console.warn('[WebMCP] Erro ao abrir WebSocket:', err);
  }
}

export function registrarFerramentaWebMcp(tool: WebMcpTool) {
  registeredTools.set(tool.name, tool);
  bindLifecycleListeners();

  const nav = navigator as any;
  if (nav?.modelContext?.registerTool) {
    try {
      nav.modelContext.registerTool({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        execute: tool.execute
      });
    } catch {}
  }

  connectBridgeSocket();
  syncToolsWithBackend();
}
