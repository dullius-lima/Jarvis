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

  const applyConnectorRow = (row: any) => {
    const cfg =
      typeof row.config === 'string'
        ? JSON.parse(row.config || '{}')
        : row.config || {};
    connectorName = row.name || row.provider_key || connectorName;
    endpointUrl = (
      cfg.endpoint_url ||
      row.endpoint_url ||
      cfg.base_url ||
      cfg.url ||
      cfg.api_url ||
      endpointUrl ||
      ''
    ).trim();
    httpMethod = (
      cfg.http_method ||
      row.http_method ||
      cfg.method ||
      httpMethod ||
      'GET'
    ).toUpperCase();
    authToken = (
      cfg.auth_token ||
      cfg.api_key ||
      row.api_key ||
      row.auth_token ||
      cfg.token ||
      authToken ||
      ''
    ).trim();
    authType = (cfg.auth_type || 'bearer').toLowerCase();
    queryParamKey = cfg.query_param_key || 'token';
    payloadTemplate = cfg.payload_template || row.payload_template || payloadTemplate || '';
    if (cfg.headers && typeof cfg.headers === 'object') {
      customHeaders = { ...customHeaders, ...cfg.headers };
    }
  };

  // 1. Identifica se recebeu o objeto do Agente/Conector ou o slug de uma Tool
  if (typeof connectorSlugOrAgent === 'object' && connectorSlugOrAgent !== null) {
    applyConnectorRow(connectorSlugOrAgent);
  }

  const rawSlug =
    typeof connectorSlugOrAgent === 'string'
      ? connectorSlugOrAgent
      : connectorSlugOrAgent?.provider_key ||
        connectorSlugOrAgent?.slug ||
        connectorSlugOrAgent?.name ||
        '';
  const cleanSlug = sanitizeToolName(rawSlug);
  if (!connectorName) connectorName = cleanSlug;

  // Sempre confere no PostgreSQL se faltar endpointUrl ou authToken no objeto em memória
  if (!endpointUrl || !authToken) {
    const connRes = await pool
      .query(
        `SELECT * FROM external_connectors 
         WHERE LOWER(provider_key) = $1 
            OR LOWER(provider_key) = $2
            OR LOWER(REPLACE(name, ' ', '_')) = $1
         ORDER BY updated_at DESC LIMIT 1;`,
        [cleanSlug, String(rawSlug).toLowerCase().trim()]
      )
      .catch(() => ({ rows: [] as any[] }));

    if (connRes.rows.length > 0) {
      applyConnectorRow(connRes.rows[0]);
    } else {
      const agRes = await pool
        .query(
          `SELECT * FROM ai_agents WHERE LOWER(slug) = $1 OR LOWER(name) = $2 LIMIT 1;`,
          [cleanSlug, String(rawSlug).toLowerCase().trim()]
        )
        .catch(() => ({ rows: [] as any[] }));
      if (agRes.rows.length > 0) {
        applyConnectorRow(agRes.rows[0]);
      }
    }
  }

  // Fallback caso seja uma tool de cotação/Brapi e a URL tenha ficado em branco
  if (
    !endpointUrl &&
    (cleanSlug.includes('brapi') ||
      cleanSlug.includes('mercado_de_valores') ||
      cleanSlug.includes('cotac'))
  ) {
    endpointUrl = 'https://brapi.dev/api/quote/{{query}}';
  }

  if (!endpointUrl) {
    return {
      error: `Conector ou API "${connectorName}" (${cleanSlug}) não possui Endpoint URL configurada no banco.`
    };
  }

  // 2. Extração inteligente de variáveis (Garante que {{query}} e {{symbol}} recebam o Ticker limpo se for API financeira ou parâmetro curto)
  const cleanBase = (serverBaseUrl || 'http://localhost:3333').replace(/\/+$/, '');
  const combinedText = `${taskArgs?.symbol || ''} ${taskArgs?.ticker || ''} ${taskArgs?.query || ''} ${taskArgs?.task_details || ''} ${userPrompt || ''}`;
  const tickerMatch = combinedText.toUpperCase().match(/\b([A-Z]{4}\d{1,2})\b/);
  const extractedTicker = tickerMatch ? tickerMatch[1] : '';

  const isFinancialOrQuoteApi =
    endpointUrl.includes('brapi.dev') ||
    endpointUrl.includes('/quote/') ||
    cleanSlug.includes('mercado_de_valores') ||
    cleanSlug.includes('brapi');

  const rawQueryArg = String(
    taskArgs?.symbol ||
      taskArgs?.ticker ||
      taskArgs?.query ||
      taskArgs?.param ||
      taskArgs?.id ||
      taskArgs?.task_details ||
      userPrompt ||
      ''
  ).trim();

  // Se for API de cotação (ex: /quote/{{query}}) e encontrou um ticker (ex: AZUL4, PETR4), usa o ticker limpo no lugar da frase inteira!
  const smartQueryVal =
    isFinancialOrQuoteApi && extractedTicker
      ? extractedTicker
      : rawQueryArg;

  const dynamicVars: Record<string, string> = {
    BASE_URL: cleanBase,
    SERVER_IP: cleanBase,
    prompt: userPrompt,
    query: smartQueryVal,
    symbol: extractedTicker || smartQueryVal,
    ticker: extractedTicker || smartQueryVal
  };

  for (const [key, val] of Object.entries(taskArgs || {})) {
    if ((typeof val === 'string' || typeof val === 'number') && String(val).trim() !== '') {
      if ((key === 'query' || key === 'task_details') && isFinancialOrQuoteApi && extractedTicker) {
        continue;
      }
      dynamicVars[key] = String(val).trim();
    }
  }

  // 3. Interpolação de variáveis {{chave}} na URL (suporta {{query}}, {{symbol}}, {{BASE_URL}} ou qualquer {{var}})
  let hadPlaceholderInUrl = false;
  let finalUrl = endpointUrl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, varName) => {
    const key = varName.trim();
    if (key !== 'BASE_URL' && key !== 'SERVER_IP') hadPlaceholderInUrl = true;
    const replacement =
      dynamicVars[key] ?? dynamicVars[key.toLowerCase()] ?? dynamicVars.query ?? '';
    return key === 'BASE_URL' || key === 'SERVER_IP'
      ? replacement
      : encodeURIComponent(replacement);
  });

  // Se for GET sem placeholder {{...}} na URL e tiver parâmetro/ticker, anexa no final do path
  if (!hadPlaceholderInUrl && httpMethod === 'GET') {
    const mainParam = dynamicVars.symbol || taskArgs?.id || taskArgs?.param || '';
    if (mainParam && !finalUrl.endsWith(mainParam) && !finalUrl.includes('?')) {
      finalUrl = `${finalUrl.replace(/\/+$/, '')}/${encodeURIComponent(mainParam)}`;
    }
  }

  // 4. Injeção universal de autenticação (Funciona tanto para Bearer Header quanto para ?token= na Query)
  const cleanToken = authToken.replace(/^Bearer\s+/i, '').trim();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...customHeaders
  };

  if (cleanToken) {
    headers['Authorization'] = `Bearer ${cleanToken}`;
    headers['x-api-key'] = cleanToken;

    const hasTokenInQuery = /[?&](token|apikey|api_key|key)=/i.test(finalUrl);
    if (
      !hasTokenInQuery &&
      (authType === 'query_token' || finalUrl.includes('brapi.dev') || httpMethod === 'GET')
    ) {
      finalUrl += `${finalUrl.includes('?') ? '&' : '?'}${encodeURIComponent(
        queryParamKey
      )}=${encodeURIComponent(cleanToken)}`;
    }
  }

  // 5. Montagem do payload de envio para POST/PUT/PATCH
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
        symbol: dynamicVars.symbol,
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
    success: response.ok,
    connector: connectorName,
    slug: cleanSlug,
    calledUrl: finalUrl.replace(/token=[^&]+/i, 'token=***'),
    httpStatus: response.status,
    authenticatedWithToken: Boolean(cleanToken),
    data: rawData
  };
}

function normalizeText(str: string): string {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim();
}


export async function executeAutoDiscoveryAndAction(
  connectorConfig: any,
  userPrompt: string,
  payload: Record<string, any> = {},
  serverBaseUrl?: string
) {
  const rawEndpoint = String(connectorConfig.endpoint_url || connectorConfig.url || '').trim();
  const endpointUrl = typeof resolveDynamicUrl === 'function' 
    ? resolveDynamicUrl(rawEndpoint, serverBaseUrl) 
    : rawEndpoint;

  const authToken = String(
    connectorConfig.auth_token ||
    connectorConfig.api_key ||
    connectorConfig.token ||
    ''
  ).trim();

  const promptClean = normalizeText(userPrompt);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (authToken) {
    headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
  }

  // =========================================================================
  // 1. HOME ASSISTANT (Multi-Device Discovery, Scoring de Cômodo e Desambiguação)
  // =========================================================================
  if (
    endpointUrl.includes(':8123/api') ||
    endpointUrl.includes('/api/services') ||
    endpointUrl.includes('/api/states')
  ) {
    const baseUrl = endpointUrl.split('/api')[0];

    // Busca o snapshot real de todos os dispositivos do Home Assistant
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

    // Leitura pura de sensores sem ação física
    const isAction = /(ligar|ligue|acender|acenda|desligar|desligue|apagar|apague|fechar|feche|abrir|abra|iniciar|ajustar)/i.test(
      promptClean
    );
    if (endpointUrl.endsWith('/api/states') && !isAction) {
      return {
        status: 'success',
        mode: 'sensor_reading',
        total_devices: relevantDevices.length,
        devices: relevantDevices
      };
    }

    // Determina a ação (turn_off ou turn_on)
    const isTurnOff = /(desligar|desligue|apagar|apague|fechar|feche|off)/i.test(promptClean);
    const serviceAction = isTurnOff ? 'turn_off' : 'turn_on';

    // Determina a categoria do pedido
    const wantsAC = /(ar|condicionado|clima|split|yarin|ac\b)/i.test(promptClean);
    const wantsLight = /(luz|lampada|iluminacao|led|spot)/i.test(promptClean);
    const wantsAll = /(todos|todas|geral|tudo)/i.test(promptClean);

    // Filtra candidatos pela categoria solicitada
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

    // Caso de comando coletivo: "desligue todos os aparelhos de ar-condicionado"
    if (wantsAll && candidates.length > 0) {
      const results = [];
      for (const dev of candidates) {
        await fetch(`${baseUrl}/api/services/homeassistant/${serviceAction}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ entity_id: dev.entity_id })
        }).catch(() => {});
        results.push({ entity_id: dev.entity_id, name: dev.name });
      }
      return {
        status: 'executed_all',
        action: `homeassistant.${serviceAction}`,
        message: `Comando executado com sucesso em todos os ${results.length} dispositivos encontrados.`,
        devices_affected: results
      };
    }

    // Identificação do dispositivo específico por pontuação de palavras (Cômodo / Nome)
    let targetEntity = payload.entity_id;

    if (!targetEntity && candidates.length > 0) {
      // Palavras de parada para isolar os cômodos e identificadores específicos
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
            score += 15; // Pontua forte palavras do cômodo (ex: quarto, sala, escritorio, suite)
          }
        }

        // Bônus se o nome do aparelho ou cômodo bater exatamente com uma parte da frase
        if (promptClean.includes(normalizeText(dev.name))) {
          score += 30;
        }

        if (score > highestScore) {
          highestScore = score;
          bestMatch = dev;
        }
      }

      // Se só existe 1 ar-condicionado na casa toda, usa ele direto
      if (candidates.length === 1) {
        targetEntity = candidates[0].entity_id;
      } 
      // Se encontrou um dispositivo com pontuação de cômodo clara
      else if (highestScore > 0 && bestMatch) {
        targetEntity = bestMatch.entity_id;
      } 
      // Se existem múltiplos aparelhos e o usuário não especificou o cômodo (ambiguidade)
      else if (candidates.length > 1) {
        return {
          status: 'ambiguous_device',
          message: `Identifiquei ${candidates.length} aparelhos de ar-condicionado. Em qual cômodo você deseja acionar?`,
          options: candidates.map((c) => ({
            entity_id: c.entity_id,
            nome: c.name,
            estado_atual: c.state
          }))
        };
      }
    }

    if (!targetEntity) {
      return {
        status: 'device_not_found',
        message: 'Nenhum dispositivo correspondente foi identificado.',
        available_devices: candidates
      };
    }

    // Dispara a requisição HTTP POST para o Home Assistant
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

  // =========================================================================
  // 2. QUALQUER OUTRA PLATAFORMA (REST, Webhooks, etc.)
  // =========================================================================
  const method = String(connectorConfig.http_method || 'POST').toUpperCase();
  const finalUrl = typeof interpolateApiTemplate === 'function'
    ? interpolateApiTemplate(endpointUrl, userPrompt, payload)
    : endpointUrl;

  const fetchInit: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(15000)
  };

  if (method !== 'GET' && method !== 'HEAD') {
    fetchInit.body = JSON.stringify(payload);
  }

  const res = await fetch(finalUrl, fetchInit);
  return await res.json().catch(async () => ({ status: res.status, text: await res.text() }));
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

  // 1. Gravação em Banco de Dados Autônomo
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

  // 2. RAG Vetorial
  if (
    cleanKey === 'vector_rag' ||
    cleanKey === 'rag_search' ||
    cleanKey === 'consultar_base_rag'
  ) {
    const docs = await searchVectorDocuments(queryValue, 4).catch(() => []);
    return { matches: docs };
  }

  // 3. Comandos Remotos via SSH
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

  // 4. Conectores da Tabela external_connectors ou Tools Customizadas do Painel
  const customConn = connectorsMap?.get(cleanKey);
  const cfg = customConn?.config || {};

  // Suporte a Tool do tipo Code (Script JavaScript puro)
  if ((cfg.tool_type === 'code' || customConn?.category === 'Code Tool') && cfg.code_snippet) {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction('query', 'args', 'env', cfg.code_snippet);
    return await fn(queryValue, args, { BASE_URL: serverBaseUrl });
  }

  // Identificação de Ferramentas HTTP / IoT / Home Assistant / APIs Dinâmicas
  if (
    customConn ||
    cleanKey.includes('home_assistant') ||
    cleanKey.includes('detector') ||
    cleanKey.includes('sensor') ||
    cleanKey.includes('dispositivo')
  ) {
    const targetEndpoint =
      cfg.endpoint_url ||
      customConn?.endpoint_url ||
      args?.endpoint ||
      args?.endpoint_url ||
      (cleanKey.includes('detector')
        ? 'http://163.176.111.18:8123/api/states'
        : 'http://163.176.111.18:8123/api/services/homeassistant/toggle');

    const targetToken =
      cfg.auth_token ||
      cfg.access_token ||
      cfg.api_key ||
      customConn?.auth_token ||
      args?.auth_token ||
      '';

    const targetMethod = cfg.http_method || customConn?.http_method || args?.http_method || 'POST';

    return await executeAutoDiscoveryAndAction(
      {
        endpoint_url: targetEndpoint,
        auth_token: targetToken,
        http_method: targetMethod
      },
      userPrompt,
      { query: queryValue, ...args },
      serverBaseUrl
    );
  }

  // 5. Fallback para endpoints HTTP universais diretos
  if (args?.endpoint && String(args.endpoint).startsWith('http')) {
    return await executeAutoDiscoveryAndAction(
      {
        endpoint_url: args.endpoint,
        auth_token: args.token || args.auth_token,
        http_method: args.method || 'POST'
      },
      userPrompt,
      args,
      serverBaseUrl
    );
  }

  // 6. Fallback para Integração de Protocolos Nativos
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

    // ROTA 1: Nó de Código Puro (Script JS Determinístico)
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
        { ...currentPayload, userPrompt },
        { BASE_URL: serverBaseUrl, PORT: activePort }
      );
    }
    // ROTA 2: Nó Direto de API / Integração Externa (Consumo Universal via executeUniversalApiConnector)
    else if (
      nonLlmTypes.includes(agentType) ||
      (agentType === 'api' && currentAgent.endpoint_url)
    ) {
      const apiResult = await executeUniversalApiConnector(
        currentAgent,
        currentPayload,
        userPrompt,
        serverBaseUrl
      );

      const formattingInstruction = (
        currentAgent.response_instruction ||
        currentAgent.system_prompt ||
        ''
      ).trim();

      stepOutput = {
        extractionInstruction:
          formattingInstruction ||
          'Utilize exclusivamente os dados retornados em apiResponse para responder com precisão.',
        apiResponse: apiResult
      };
    }
    // ROTA 3: Nó Cognitivo (LLM Especialista) com Tools e APIs Vinculadas
    else {
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

      // Pré-execução das APIs vinculadas ao Especialista
      const internalToolsSlugs = [
        'save_to_database',
        'dynamicdatabasetool',
        'vector_rag',
        'rag_search',
        'consultar_base_rag',
        'execute_ssh_command',
        'ssh_terminal',
        'executar_comando_ssh'
      ];

      const externalApiTools = enabledTools.filter(
        (t) => !internalToolsSlugs.includes(sanitizeToolName(t))
      );

      const preFetchedApiData: Record<string, any> = {};
      for (const apiSlug of externalApiTools) {
        try {
          preFetchedApiData[apiSlug] = await executeUniversalApiConnector(
            apiSlug,
            currentPayload,
            userPrompt,
            serverBaseUrl
          );
        } catch (err: any) {
          preFetchedApiData[apiSlug] = { error: err.message };
        }
      }

      const apiContextMessage =
        Object.keys(preFetchedApiData).length > 0
          ? `\n\n[DADOS RETORNADOS EM TEMPO REAL PELAS SUAS APIS/TOOLS]:\n${JSON.stringify(
              preFetchedApiData,
              null,
              2
            )}\nATENÇÃO OBRIGATÓRIA: Responda ao usuário utilizando EXCLUSIVAMENTE os dados reais das APIs acima. NUNCA invente cotações ou dados da sua memória de treinamento.`
          : '';

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
                  action: { type: 'string', description: 'Ação a executar.' },
                  entity_id: { type: 'string', description: 'ID da entidade se aplicável.' },
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
          }${apiContextMessage}\nFerramentas habilitadas para você: ${
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
            subArgs = { query: userPrompt };
          }

          const toolOutput = await executeBoundTool(subFn, subArgs, userPrompt, map, serverBaseUrl);
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
              )}\n\nElabore a resposta final objetiva e estruturada para o usuário baseada nestes dados.`
            }
          ]
        });

        stepOutput = {
          specialist_response: followUpRes?.choices?.[0]?.message?.content || JSON.stringify(subToolResults),
          tools_executed: subToolResults,
          pre_fetched_apis: preFetchedApiData
        };
      } else {
        stepOutput = {
          specialist_response: specChoice?.content || 'Processado pelo especialista.',
          pre_fetched_apis: preFetchedApiData
        };
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
