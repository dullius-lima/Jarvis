// src/services/mcpHfService.ts

export interface HuggingFaceRequestPayload {
  model: string;
  apiKey?: string;
  prompt: string;
  parameters?: Record<string, any>;
  timeoutMs?: number;
}

export interface McpServerRequestPayload {
  serverUrl: string; // Ex: http://localhost:8000/mcp ou http://127.0.0.1:3001/rpc
  toolName?: string;
  method?: string;
  params?: Record<string, any>;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Executa inferência em modelos hospedados no Hugging Face Hub
 */
export async function queryHuggingFaceModel({
  model,
  apiKey,
  prompt,
  parameters = {},
  timeoutMs = 30000
}: HuggingFaceRequestPayload): Promise<string> {
  const token = apiKey || process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || '';
  const url = `https://api-inference.huggingface.co/models/${model}`;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-wait-for-model': 'true' // Garante que a API aguarde o carregamento se o modelo estiver em cold start
  };

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: 500,
        temperature: 0.3,
        return_full_text: false,
        ...parameters
      }
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`[Hugging Face Error] Status ${response.status}: ${errorText}`);
  }

  const result = await response.json();

  // Tratamento dos diferentes formatos de retorno do Hub Hugging Face
  if (Array.isArray(result) && result[0]?.generated_text) {
    return result[0].generated_text.trim();
  }

  if (result && typeof result === 'object' && 'generated_text' in result) {
    return String(result.generated_text).trim();
  }

  return typeof result === 'string' ? result.trim() : JSON.stringify(result);
}

/**
 * Executa chamadas de ferramentas e comandos em servidores Model Context Protocol (MCP)
 */
export async function executeMcpToolCall({
  serverUrl,
  toolName,
  method = 'tools/call',
  params = {},
  headers = {},
  timeoutMs = 30000
}: McpServerRequestPayload): Promise<any> {
  // Monta o payload conforme a especificação JSON-RPC 2.0 do MCP
  const mcpRpcPayload: Record<string, any> = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: method
  };

  if (method === 'tools/call') {
    mcpRpcPayload.params = {
      name: toolName,
      arguments: params
    };
  } else if (Object.keys(params).length > 0) {
    mcpRpcPayload.params = params;
  }

  const response = await fetch(serverUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(mcpRpcPayload),
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`[MCP Server Error] Status ${response.status}: ${errText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`[MCP RPC Error]: ${data.error.message || JSON.stringify(data.error)}`);
  }

  const result = data.result;

  // Unifica e extrai automaticamente o texto retornado no formato padrão do MCP ({ content: [{ type: 'text', text }] })
  if (result && Array.isArray(result.content)) {
    const textPieces = result.content
      .filter((item: any) => item.type === 'text' && item.text)
      .map((item: any) => item.text);

    if (textPieces.length > 0) {
      return textPieces.join('\n');
    }
  }

  return result !== undefined ? result : data;
}

/**
 * Consulta as ferramentas disponíveis em um servidor MCP
 */
export async function listMcpTools(serverUrl: string, headers: Record<string, string> = {}): Promise<any[]> {
  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/list',
    params: {}
  };

  const response = await fetch(serverUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`[MCP tools/list Error]: Status ${response.status}`);
  }

  const data = await response.json();
  return data.result?.tools || [];
}