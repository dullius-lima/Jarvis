// Motor OpenAI/Groq/Gemini/Ollama e Pipeline de Especialistas
// src/services/orchestrator/llmAndPipelineRunner.ts
import { pool } from '../../config/database.js';
import OpenAI from 'openai';
import { searchVectorDocuments } from '../ragService.js';
import { emitBrainLinkEvent } from '../brainSocketService.js';
import { getEnvRegisteredPort } from '../../controllers/brainConfigController.js';
import { executeProtocolOrIntegration } from '../integrationAndProtocolService.js';
import { executeSshCommand, readRemoteFileViaSshToRag } from '../sshService.js';
import {
  SupportedProtocolOrPlatform,
  interpolateApiTemplate,
  resolveDynamicUrl,
  resolveProviderCredentials,
  sanitizeToolName
} from './brainConfigAndUtils.js';
import { saveToDatabase } from './catalogAndDatabase.js';

function normalizeText(str: string): string {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim();
}

export async function callOpenAICompatibleLLM(options: {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  messages: any[];
  tools?: any[];
  temperature?: number;
}): Promise<any> {
  const creds = resolveProviderCredentials(
    options.provider,
    options.apiKey,
    options.baseUrl,
    options.model
  );

  let provider = creds.provider;
  let apiKey = creds.apiKey;

  if (provider === 'gemini') {
    const requestedModel = (creds.model || 'gemini-2.5-flash').trim();
    const cleanPrimary =
      requestedModel.includes('argon') ||
      requestedModel.includes('3.8') ||
      !requestedModel.startsWith('gemini')
        ? 'gemini-2.5-flash'
        : requestedModel;

    const geminiModelsToTry = Array.from(
      new Set([cleanPrimary, 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'])
    );

    const formattedParts: any[] = [];
    for (const msg of options.messages) {
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            formattedParts.push({ text: `[${msg.role}]: ${part.text}` });
          } else if (part.type === 'image_url' && part.image_url?.url) {
            const cleanBase64 = part.image_url.url.replace(/^data:image\/\w+;base64,/, '');
            formattedParts.push({
              inline_data: { mime_type: 'image/jpeg', data: cleanBase64 }
            });
          }
        }
      } else {
        formattedParts.push({ text: `[${msg.role}]: ${msg.content}` });
      }
    }

    let lastGeminiError = '';
    for (const gemModel of geminiModelsToTry) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${gemModel}:generateContent?key=${apiKey}`;
        const resp = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: formattedParts }],
            generationConfig: { temperature: options.temperature ?? 0.2 }
          }),
          signal: AbortSignal.timeout(25000)
        });

        if (resp.ok) {
          const data: any = await resp.json();
          const contentText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          return {
            choices: [{ message: { content: contentText, role: 'assistant' } }]
          };
        }

        lastGeminiError = await resp.text();
      } catch (err: any) {
        lastGeminiError = err.message;
      }
    }

    const fallbackGroqKey = (
      process.env.GROQ_API_KEY ||
      (process.env.LLM_API_KEY?.startsWith('gsk_') ? process.env.LLM_API_KEY : '') ||
      ''
    ).trim();
    if (fallbackGroqKey) {
      provider = 'groq';
      apiKey = fallbackGroqKey;
    } else {
      throw new Error(`Gemini indisponível no momento: ${lastGeminiError.slice(0, 200)}`);
    }
  }

  const client = new OpenAI({
    apiKey: apiKey || 'ollama',
    baseURL: creds.baseURL,
    timeout: 30000
  });

  const candidateModels =
    provider === 'groq'
      ? Array.from(new Set([creds.model, 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant']))
      : [creds.model];

  let lastError: any = null;

  for (const modelToUse of candidateModels) {
    try {
      const payload: any = {
        model: modelToUse,
        messages: options.messages,
        temperature: options.temperature ?? 0.2
      };

      if (options.tools && options.tools.length > 0) {
        payload.tools = options.tools;
        payload.tool_choice = 'auto';
      }

      return await client.chat.completions.create(payload);
    } catch (err: any) {
      lastError = err;
      const errMsg = String(err?.message || '');
      if (
        options.tools &&
        options.tools.length > 0 &&
        !errMsg.includes('404') &&
        !errMsg.includes('does not exist')
      ) {
        try {
          return await client.chat.completions.create({
            model: modelToUse,
            messages: options.messages,
            temperature: options.temperature ?? 0.2
          });
        } catch (innerErr: any) {
          lastError = innerErr;
        }
      }
    }
  }

  try {
    const modelsResp = await fetch(`${creds.baseURL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000)
    });
    if (modelsResp.ok) {
      const modelsData: any = await modelsResp.json();
      const availableList: string[] = (modelsData?.data || [])
        .map((m: any) => String(m.id || ''))
        .filter(
          (id: string) =>
            id && !id.includes('whisper') && !id.includes('tts') && !id.includes('guard')
        );

      if (availableList.length > 0) {
        return await client.chat.completions.create({
          model: availableList[0],
          messages: options.messages,
          temperature: options.temperature ?? 0.2
        });
      }
    }
  } catch {}

  throw lastError || new Error(`Falha ao comunicar com provedor ${provider.toUpperCase()}`);
}

export async function executeUniversalApiConnector(
  connectorSlugOrAgent: string | Record<string, any>,
  taskArgs: Record<string, any>,
  userPrompt: string,
  serverBaseUrl: string
) {
  let endpointUrl = '';
  let httpMethod = 'GET';
  let authToken = '';
  let authType = 'bearer';
  let queryParamKey = 'token';
  let customHeaders: Record<string, string> = {};
  let payloadTemplate = '';
  let connectorName = '';

  if (typeof connectorSlugOrAgent === 'object' && connectorSlugOrAgent !== null) {
    connectorName = connectorSlugOrAgent.name || connectorSlugOrAgent.slug;
    endpointUrl = connectorSlugOrAgent.endpoint_url || '';
    httpMethod = (connectorSlugOrAgent.http_method || 'GET').toUpperCase();
    authToken = (connectorSlugOrAgent.auth_token || connectorSlugOrAgent.api_key || '').trim();
    payloadTemplate = connectorSlugOrAgent.payload_template || connectorSlugOrAgent.code_snippet || '';
  } else {
    const cleanSlug = String(connectorSlugOrAgent).toLowerCase().trim();
    connectorName = cleanSlug;

    const connRes = await pool
      .query(`SELECT * FROM external_connectors WHERE LOWER(provider_key) = $1 LIMIT 1;`, [cleanSlug])
      .catch(() => ({ rows: [] }));

    if (connRes.rows.length > 0) {
      const row = connRes.rows[0];
      const cfg = typeof row.config === 'string' ? JSON.parse(row.config || '{}') : row.config || {};
      connectorName = row.name || cleanSlug;
      endpointUrl = cfg.endpoint_url || cfg.base_url || cfg.url || cfg.api_url || '';
      httpMethod = (cfg.http_method || cfg.method || 'GET').toUpperCase();
      authToken = (cfg.auth_token || cfg.api_key || cfg.token || '').trim();
      authType = (cfg.auth_type || 'bearer').toLowerCase();
      queryParamKey = cfg.query_param_key || 'token';
      payloadTemplate = cfg.payload_template || '';
      if (cfg.headers && typeof cfg.headers === 'object') {
        customHeaders = cfg.headers;
      }
    } else {
      const agRes = await pool
        .query(`SELECT * FROM ai_agents WHERE LOWER(slug) = $1 LIMIT 1;`, [cleanSlug])
        .catch(() => ({ rows: [] }));
      if (agRes.rows.length > 0) {
        const ag = agRes.rows[0];
        connectorName = ag.name || cleanSlug;
        endpointUrl = ag.endpoint_url || '';
        httpMethod = (ag.http_method || 'GET').toUpperCase();
        authToken = (ag.auth_token || ag.api_key || '').trim();
        payloadTemplate = ag.payload_template || ag.code_snippet || '';
      }
    }
  }

  if (!endpointUrl) {
    return { error: `Conector ou API "${connectorName}" não possui Endpoint URL configurada.` };
  }

  const cleanBase = (serverBaseUrl || 'http://localhost:3333').replace(/\/+$/, '');
  const tickerMatch = String(taskArgs?.symbol || taskArgs?.ticker || userPrompt || '')
    .toUpperCase()
    .match(/\b([A-Z]{4}\d{1,2})\b/);

  const dynamicVars: Record<string, string> = {
    BASE_URL: cleanBase,
    SERVER_IP: cleanBase,
    prompt: userPrompt,
    query: String(taskArgs?.query || taskArgs?.task_details || userPrompt || '').trim(),
    symbol: String(taskArgs?.symbol || taskArgs?.ticker || (tickerMatch ? tickerMatch[1] : '')).trim()
  };

  for (const [key, val] of Object.entries(taskArgs || {})) {
    if (typeof val === 'string' || typeof val === 'number') {
      dynamicVars[key] = String(val).trim();
    }
  }

  let hadPlaceholderInUrl = false;
  let finalUrl = endpointUrl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, varName) => {
    const key = varName.trim();
    if (key !== 'BASE_URL' && key !== 'SERVER_IP') hadPlaceholderInUrl = true;
    const replacement = dynamicVars[key] ?? dynamicVars[key.toLowerCase()] ?? dynamicVars.query ?? '';
    return key === 'BASE_URL' || key === 'SERVER_IP' ? replacement : encodeURIComponent(replacement);
  });

  if (!hadPlaceholderInUrl && httpMethod === 'GET') {
    const mainParam = dynamicVars.symbol || taskArgs?.id || taskArgs?.param || '';
    if (mainParam && !finalUrl.endsWith(mainParam) && !finalUrl.includes('?')) {
      finalUrl = `${finalUrl.replace(/\/+$/, '')}/${encodeURIComponent(mainParam)}`;
    }
  }

  const cleanToken = authToken.replace(/^Bearer\s+/i, '').trim();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...customHeaders
  };

  if (cleanToken) {
    headers['Authorization'] = `Bearer ${cleanToken}`;
    if (authType === 'api_key') {
      headers['x-api-key'] = cleanToken;
    }
    const hasTokenInQuery = /[?&](token|apikey|api_key|key)=/i.test(finalUrl);
    if (!hasTokenInQuery && (authType === 'query_token' || finalUrl.includes('brapi.dev') || !finalUrl.includes('?'))) {
      finalUrl += `${finalUrl.includes('?') ? '&' : '?'}${encodeURIComponent(queryParamKey)}=${encodeURIComponent(cleanToken)}`;
    }
  }

  let requestBody: string | undefined = undefined;
  if (httpMethod !== 'GET' && httpMethod !== 'HEAD') {
    if (payloadTemplate && payloadTemplate.trim().startsWith('{')) {
      requestBody = payloadTemplate.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, varName) => {
        return dynamicVars[varName.trim()] ?? dynamicVars.query ?? '';
      });
    } else {
      requestBody = JSON.stringify({
        ...taskArgs,
        query: dynamicVars.query,
        prompt: userPrompt
      });
    }
  }

  const response = await fetch(finalUrl, {
    method: httpMethod,
    headers,
    body: requestBody,
    signal: AbortSignal.timeout(25000)
  });

  const rawData = await response.json().catch(async () => ({ rawText: await response.text() }));

  return {
    connector: connectorName,
    httpStatus: response.status,
    authenticatedWithToken: Boolean(cleanToken),
    data: rawData
  };
}

export async function executeBoundTool(
  toolKey: string,
  args: Record<string, any>,
  userPrompt: string,
  connectorsMap: Map<string, any>,
  serverBaseUrl: string
): Promise<any> {
  const cleanKey = sanitizeToolName(toolKey);
  const queryValue = String(args?.query || args?.task_details || args?.input || userPrompt).trim();
  const promptClean = normalizeText(userPrompt);

  if (cleanKey === 'save_to_database' || cleanKey === 'dynamicdatabasetool') {
    return await saveToDatabase({
      collectionName: sanitizeToolName(args?.collectionName || 'jarvis_records'),
      documentData:
        typeof args?.documentData === 'object'
          ? args.documentData
          : { query: queryValue, raw: args },
      decisionReasoning: args?.decisionReasoning || 'Gravado via Tool Calling do Agente'
    });
  }

  if (
    cleanKey === 'vector_rag' ||
    cleanKey === 'rag_search' ||
    cleanKey === 'consultar_base_rag'
  ) {
    const docs = await searchVectorDocuments(queryValue, 4).catch(() => []);
    return { matches: docs };
  }

  if (
    cleanKey === 'execute_ssh_command' ||
    cleanKey === 'ssh_terminal' ||
    cleanKey === 'executar_comando_ssh'
  ) {
    if (args?.remoteFilePath) {
      return await readRemoteFileViaSshToRag({ remoteFilePath: String(args.remoteFilePath) });
    }
    return await executeSshCommand(args?.command || queryValue || 'uptime');
  }

  const customConn = connectorsMap?.get(cleanKey);
  const cfg = customConn?.config || {};

  // Auto-Discovery e Acionamento Integrado para Home Assistant
  const isHomeAssistantTool =
    cleanKey.includes('home_assistant') ||
    cleanKey.includes('detector') ||
    cleanKey.includes('sensor') ||
    cleanKey.includes('dispositivo');

  if (isHomeAssistantTool) {
    const targetEndpoint =
      cfg.endpoint_url ||
      customConn?.endpoint_url ||
      args?.endpoint ||
      (cleanKey.includes('detector')
        ? 'http://163.176.111.18:8123/api/states'
        : 'http://163.176.111.18:8123/api/services/homeassistant/toggle');

    const token =
      cfg.auth_token ||
      cfg.access_token ||
      cfg.api_key ||
      customConn?.auth_token ||
      args?.auth_token ||
      '';

    const baseUrl = String(targetEndpoint).split('/api')[0];
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = String(token).startsWith('Bearer ') ? String(token) : `Bearer ${token}`;
    }

    let relevantDevices: any[] = [];
    try {
      const statesRes = await fetch(`${baseUrl}/api/states`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000)
      });
      const allStates: any[] = await statesRes.json().catch(() => []);

      if (Array.isArray(allStates)) {
        relevantDevices = allStates
          .filter((st) =>
            /^(climate|light|switch|fan|cover|remote|media_player|sensor|binary_sensor|input_boolean)\./.test(
              st.entity_id || ''
            )
          )
          .map((st) => ({
            entity_id: st.entity_id,
            name: st.attributes?.friendly_name || st.entity_id,
            state: st.state,
            temperature: st.attributes?.current_temperature ?? st.attributes?.temperature ?? undefined
          }));
      }
    } catch (err: any) {
      console.warn('⚠️ [HomeAssistant Discovery] Falha ao consultar /api/states:', err.message);
    }

    const isAction = /(ligar|ligue|acender|acenda|desligar|desligue|apagar|apague|fechar|feche|abrir|abra|iniciar|ajustar)/i.test(
      promptClean
    );

    if (String(targetEndpoint).endsWith('/api/states') && !isAction) {
      return {
        status: 'success',
        mode: 'sensor_reading',
        total_devices: relevantDevices.length,
        devices: relevantDevices
      };
    }

    const isTurnOff = /(desligar|desligue|apagar|apague|fechar|feche|off)/i.test(promptClean);
    const serviceAction = isTurnOff ? 'turn_off' : 'turn_on';

    const wantsAC = /(ar|condicionado|clima|split|yarin|ac\b)/i.test(promptClean);
    const wantsLight = /(luz|lampada|iluminacao|led|spot)/i.test(promptClean);

    let candidates = relevantDevices;
    if (wantsAC) {
      candidates = relevantDevices.filter(
        (d) =>
          d.entity_id.startsWith('climate.') ||
          (d.entity_id.startsWith('switch.') && normalizeText(d.name).includes('ar'))
      );
    } else if (wantsLight) {
      candidates = relevantDevices.filter(
        (d) =>
          d.entity_id.startsWith('light.') ||
          (d.entity_id.startsWith('switch.') &&
            (normalizeText(d.name).includes('luz') || normalizeText(d.name).includes('lampada')))
      );
    }

    let targetEntity = args?.entity_id;
    if (!targetEntity && candidates.length > 0) {
      const stopWords = new Set([
        'o', 'a', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas',
        'em', 'para', 'por', 'com', 'um', 'uma', 'uns', 'umas', 'meu', 'minha',
        'ar', 'condicionado', 'clima', 'split', 'luz', 'lampada', 'aparelho', 'dispositivo',
        'ligar', 'ligue', 'desligar', 'desligue', 'acender', 'acenda', 'apagar', 'apague',
        'jarvis', 'favor', 'por'
      ]);

      const userTokens = promptClean
        .split(/\s+/)
        .filter((token) => token.length > 1 && !stopWords.has(token));

      let bestMatch: any = null;
      let highestScore = 0;

      for (const dev of candidates) {
        const fullDevText = `${normalizeText(dev.entity_id)} ${normalizeText(dev.name)}`;
        let score = 0;

        for (const token of userTokens) {
          if (fullDevText.includes(token)) {
            score += 15;
          }
        }

        if (promptClean.includes(normalizeText(dev.name))) {
          score += 30;
        }

        if (score > highestScore) {
          highestScore = score;
          bestMatch = dev;
        }
      }

      if (candidates.length === 1) {
        targetEntity = candidates[0].entity_id;
      } else if (highestScore > 0 && bestMatch) {
        targetEntity = bestMatch.entity_id;
      } else if (candidates.length > 1) {
        return {
          status: 'ambiguous_device',
          message: `Identifiquei ${candidates.length} dispositivos disponíveis. Em qual cômodo deseja acionar?`,
          options: candidates.map((c) => ({
            entity_id: c.entity_id,
            nome: c.name,
            estado_atual: c.state
          }))
        };
      }
    }

    if (targetEntity) {
      const actionUrl = `${baseUrl}/api/services/homeassistant/${serviceAction}`;
      const execRes = await fetch(actionUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ entity_id: targetEntity }),
        signal: AbortSignal.timeout(10000)
      });
      const execData = await execRes.json().catch(() => ({}));
      return {
        status: 'executed',
        action: `homeassistant.${serviceAction}`,
        entity_id: targetEntity,
        http_status: execRes.status,
        result: execData
      };
    }
  }

  const isNativeSpecialized =
    cleanKey.startsWith('brapi') ||
    cleanKey.includes('gmail') ||
    cleanKey.includes('outlook') ||
    cleanKey.includes('telegram') ||
    cleanKey.includes('google_sheets');

  if (isNativeSpecialized) {
    return await executeProtocolOrIntegration(cleanKey, {
      protocol: cleanKey as SupportedProtocolOrPlatform,
      endpoint: cfg.endpoint_url || customConn?.endpoint_url || args?.endpoint,
      method: cfg.http_method || customConn?.http_method || args?.method,
      body: {
        query: queryValue,
        prompt: userPrompt,
        auth_token: cfg.auth_token || cfg.api_key || customConn?.auth_token,
        ...args
      },
      prompt: userPrompt
    });
  }

  if ((cfg.tool_type === 'code' || customConn?.category === 'Code Tool') && cfg.code_snippet) {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction('query', 'args', 'env', cfg.code_snippet);
    return await fn(queryValue, args, { BASE_URL: serverBaseUrl });
  }

  if (cfg.tool_type === 'ssh') {
    return await executeSshCommand(cfg.endpoint_url || queryValue || 'uptime');
  }

  const rawEndpoint =
    cfg.endpoint_url ||
    customConn?.endpoint_url ||
    (cleanKey === 'http_request_universal' ? args?.endpoint || args?.url || queryValue : '');

  if (rawEndpoint && String(rawEndpoint).startsWith('http')) {
    let targetUrl = resolveDynamicUrl(String(rawEndpoint), serverBaseUrl);
    targetUrl = interpolateApiTemplate(targetUrl, userPrompt, { query: queryValue, ...args });

    const method = String(
      cfg.http_method || customConn?.http_method || args?.method || 'GET'
    ).toUpperCase();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };

    const token =
      cfg.auth_token || cfg.api_key || cfg.access_token || customConn?.auth_token;
    if (token) {
      const cleanToken = String(token).replace(/^Bearer\s+/i, '').trim();
      headers['Authorization'] = `Bearer ${cleanToken}`;
    }

    if (cfg.tool_type === 'mcp' || customConn?.agent_type === 'mcp') {
      const mcpRes = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: { name: cleanKey, arguments: { query: queryValue, ...args } }
        }),
        signal: AbortSignal.timeout(15000)
      });
      return await mcpRes.json().catch(() => ({ status: mcpRes.status }));
    }

    const fetchInit: RequestInit = { method, headers, signal: AbortSignal.timeout(15000) };
    if (method !== 'GET' && method !== 'HEAD') {
      if (cfg.payload_template) {
        fetchInit.body = interpolateApiTemplate(String(cfg.payload_template), userPrompt, {
          query: queryValue,
          ...args
        });
      } else {
        fetchInit.body = JSON.stringify({ query: queryValue, ...args });
      }
    }

    const res = await fetch(targetUrl, fetchInit);
    return await res.json().catch(async () => ({ status: res.status, text: await res.text() }));
  }

  return await executeProtocolOrIntegration(cleanKey, {
    protocol: (cleanKey as SupportedProtocolOrPlatform) || 'rest_api',
    endpoint: args?.endpoint,
    method: args?.method || 'POST',
    body: { query: queryValue, ...args },
    prompt: userPrompt
  }).catch((err: any) => ({ error: err.message, tool: cleanKey }));
}

export async function executeSpecialistPipeline(
  initialAgent: any,
  taskArgs: Record<string, any>,
  sessionId: string,
  identityToken: string,
  conversationThread: Array<{ role: string; content: string }>,
  serverBaseUrl: string,
  userPrompt = '',
  brainConfig?: any,
  connectorsMap?: Map<string, any>
) {
  let currentAgent = initialAgent;
  let currentPayload: any = { ...taskArgs, sessionId, identityToken };
  let hopCount = 0;
  const MAX_HOPS = 5;
  const executionChain: Array<{
    agentSlug: string;
    agentName: string;
    agentType?: string;
    responseInstruction?: string;
    output: any;
  }> = [];

  const nonLlmTypes = [
    'api',
    'mcp',
    'graphql',
    'amqp',
    'kafka',
    'imap',
    'ftp',
    'sftp',
    'whatsapp',
    'google_workspace',
    'outlook'
  ];

  const map = connectorsMap || new Map<string, any>();

  while (currentAgent && hopCount < MAX_HOPS) {
    hopCount++;

    try {
      emitBrainLinkEvent({
        axon_id: `axon_${currentAgent.slug}`,
        source_dendrite:
          hopCount === 1
            ? 'jarvis_core'
            : executionChain[executionChain.length - 1].agentSlug,
        target_dendrite: currentAgent.slug,
        direction: 'FORWARD',
        neurotransmitter_type: 'ADRENALINA',
        intensity: 0.95,
        metadata: { agentName: currentAgent.name, hop: hopCount }
      } as any);
    } catch {}

    let stepOutput: any = null;
    const agentType = (currentAgent.agent_type || 'llm').toLowerCase();
    const promptText =
      typeof currentPayload === 'string'
        ? currentPayload
        : currentPayload?.task_details || currentPayload?.query || userPrompt;

    if (
      agentType === 'code' &&
      (currentAgent.code_snippet || currentAgent.script_code)
    ) {
      const codeToRun = currentAgent.code_snippet || currentAgent.script_code;
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const fn = new AsyncFunction('payload', 'env', codeToRun);
      let activePort = 3333;
      try {
        activePort =
          typeof getEnvRegisteredPort === 'function' ? getEnvRegisteredPort() : 3333;
      } catch {
        activePort = 3333;
      }
      stepOutput = await fn(
        { ...currentPayload, query: promptText, userPrompt },
        { BASE_URL: serverBaseUrl, PORT: activePort }
      );
    } else if (
      nonLlmTypes.includes(agentType) ||
      (agentType === 'api' && currentAgent.endpoint_url)
    ) {
      const rawUrl = resolveDynamicUrl(currentAgent.endpoint_url || '', serverBaseUrl);
      const targetUrl = interpolateApiTemplate(rawUrl, userPrompt, currentPayload);
      const protocolToUse = (
        agentType === 'api' ? 'rest_api' : agentType
      ) as SupportedProtocolOrPlatform;

      let customBodyParams: Record<string, any> = {};
      const bodyTemplate = currentAgent.payload_template || currentAgent.code_snippet;
      if (bodyTemplate && String(bodyTemplate).trim().startsWith('{')) {
        try {
          const interpolatedJson = interpolateApiTemplate(
            String(bodyTemplate),
            userPrompt,
            currentPayload
          );
          customBodyParams = JSON.parse(interpolatedJson);
        } catch {
          customBodyParams = { raw_payload: bodyTemplate };
        }
      }

      const rawApiResult = await executeProtocolOrIntegration(currentAgent, {
        protocol: protocolToUse,
        endpoint: targetUrl,
        method: currentAgent.http_method || 'GET',
        body: {
          ...(currentAgent.protocol_config || {}),
          ...currentPayload,
          ...customBodyParams
        },
        prompt: userPrompt
      });

      const formattingInstruction = (
        currentAgent.response_instruction ||
        currentAgent.system_prompt ||
        ''
      ).trim();

      stepOutput = {
        extractionInstruction:
          formattingInstruction ||
          'Extraia os dados principais do JSON retornado e apresente ao usuário.',
        apiResponse: rawApiResult
      };
    } else {
      let enabledTools: string[] = [];
      if (Array.isArray(currentAgent.tools)) {
        enabledTools = currentAgent.tools;
      } else if (typeof currentAgent.tools === 'string') {
        try {
          enabledTools = JSON.parse(currentAgent.tools || '[]');
        } catch {
          enabledTools = [];
        }
      }

      const specialistTools: OpenAI.Chat.Completions.ChatCompletionTool[] =
        enabledTools.map((tId: string) => {
          const cleanId = sanitizeToolName(tId);
          const conn = map.get(cleanId);
          const desc =
            conn?.description ||
            conn?.config?.description ||
            `Executa a ferramenta ${conn?.name || cleanId}.`;

          return {
            type: 'function',
            function: {
              name: cleanId,
              description: desc,
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Consulta, ticker (ex: PETR4) ou comando principal.' },
                  symbol: { type: 'string', description: 'Código do ativo/ticker da B3 (ex: PETR4, VALE3).' },
                  action: { type: 'string', description: 'Ação a executar (ex: turn_on, turn_off, toggle, states).' },
                  entity_id: { type: 'string', description: 'ID da entidade no Home Assistant (ex: light.varanda).' },
                  to: { type: 'string', description: 'Destinatário.' },
                  subject: { type: 'string', description: 'Assunto.' },
                  body: { type: 'string', description: 'Conteúdo.' },
                  task_details: { type: 'string', description: 'Detalhes complementares da tarefa.' }
                }
              }
            }
          };
        });

      const specialistMessages: any[] = [
        {
          role: 'system',
          content: `${
            currentAgent.system_prompt || `Você é o especialista ${currentAgent.name}.`
          }\nFerramentas habilitadas para você: ${
            enabledTools.length > 0 ? enabledTools.join(', ') : 'Nenhuma'
          }.`
        },
        ...conversationThread.slice(-6),
        {
          role: 'user',
          content: `Pedido do Usuário: "${userPrompt}"\nContexto e Parâmetros: ${JSON.stringify(
            currentPayload
          )}`
        }
      ];

      const llmRes: any = await callOpenAICompatibleLLM({
        provider: currentAgent.provider || brainConfig?.provider || 'groq',
        model: currentAgent.model || brainConfig?.model || 'llama-3.3-70b-versatile',
        apiKey: currentAgent.api_key || brainConfig?.api_key || '',
        baseUrl: currentAgent.base_url || brainConfig?.base_url || '',
        messages: specialistMessages,
        tools: specialistTools.length > 0 ? specialistTools : undefined,
        temperature: Number(currentAgent.temperature ?? 0.3)
      });

      const specChoice = llmRes?.choices?.[0]?.message;

      if (Array.isArray(specChoice?.tool_calls) && specChoice.tool_calls.length > 0) {
        const subToolResults: any[] = [];
        for (const subCall of specChoice.tool_calls) {
          const subFn = (subCall as any).function?.name;
          let subArgs: any = {};
          try {
            subArgs = JSON.parse((subCall as any).function?.arguments || '{}');
          } catch {
            subArgs = { query: promptText };
          }

          const toolOutput = await executeBoundTool(subFn, subArgs, promptText, map, serverBaseUrl);
          subToolResults.push({ tool: subFn, output: toolOutput });
        }

        const followUpRes: any = await callOpenAICompatibleLLM({
          provider: currentAgent.provider || brainConfig?.provider || 'groq',
          model: currentAgent.model || brainConfig?.model || 'llama-3.3-70b-versatile',
          apiKey: currentAgent.api_key || brainConfig?.api_key || '',
          baseUrl: currentAgent.base_url || brainConfig?.base_url || '',
          messages: [
            ...specialistMessages,
            {
              role: 'user',
              content: `Resultado das Tools executadas:\n${JSON.stringify(
                subToolResults
              )}\n\nElabore a resposta final objetiva e estruturada para o usuário.`
            }
          ]
        });

        stepOutput =
          followUpRes?.choices?.[0]?.message?.content || JSON.stringify(subToolResults);
      } else {
        const rawContent = specChoice?.content || 'Processado pelo especialista.';

        // Intercepta e executa ferramentas caso o modelo retorne JSON cru em texto
        if (rawContent.includes('"action"') || rawContent.includes('invoke_tool') || rawContent.includes('home_')) {
          try {
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              const toolToRun = sanitizeToolName(
                parsed.parameters?.slug ||
                parsed.parameters?.tool ||
                parsed.action ||
                parsed.tool ||
                'home_assistant_acionar_dispositivos'
              );
              const toolArgs = parsed.parameters || parsed.payload || {};

              const toolOutput = await executeBoundTool(toolToRun, toolArgs, userPrompt, map, serverBaseUrl);

              let friendlyText = '';
              if (toolOutput?.status === 'executed') {
                friendlyText = `Dispositivo acionado com sucesso (${toolOutput.entity_id || 'Home Assistant'}).`;
              } else if (toolOutput?.message) {
                friendlyText = toolOutput.message;
              } else {
                friendlyText = `Comando executado com sucesso pelo Assistente Residencial.`;
              }

              stepOutput = {
                specialist_response: friendlyText,
                tools_executed: [{ tool: toolToRun, output: toolOutput }]
              };
            } else {
              stepOutput = rawContent;
            }
          } catch {
            stepOutput = rawContent;
          }
        } else {
          stepOutput = rawContent;
        }
      }
    }

    await pool
      .query(
        `CREATE TABLE IF NOT EXISTS specialist_context_memory (
          id SERIAL PRIMARY KEY,
          session_id VARCHAR(120) NOT NULL,
          specialist_slug VARCHAR(100) NOT NULL,
          context_data JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );`
      )
      .catch(() => {});

    await pool
      .query(
        `INSERT INTO specialist_context_memory (session_id, specialist_slug, context_data)
         VALUES ($1, $2, $3);`,
        [
          sessionId,
          currentAgent.slug,
          JSON.stringify({ lastInput: currentPayload, lastOutput: stepOutput })
        ]
      )
      .catch(() => {});

    executionChain.push({
      agentSlug: currentAgent.slug,
      agentName: currentAgent.name,
      agentType,
      responseInstruction: currentAgent.system_prompt || undefined,
      output: stepOutput
    });

    currentPayload = {
      previousAgent: currentAgent.slug,
      previousOutput: stepOutput,
      originalArgs: taskArgs
    };

    if (
      currentAgent.next_agent_slug &&
      currentAgent.next_agent_slug !== currentAgent.slug
    ) {
      const nextRes = await pool.query(
        `SELECT * FROM ai_agents WHERE slug = $1 AND is_active = true LIMIT 1;`,
        [currentAgent.next_agent_slug]
      );
      currentAgent = nextRes.rows[0] || null;
    } else {
      currentAgent = null;
    }
  }

  return executionChain;
}

export const executeSpecialistNode = executeSpecialistPipeline;
export const executeAgentChain = executeSpecialistPipeline;
