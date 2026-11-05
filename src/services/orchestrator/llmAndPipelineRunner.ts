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

  // 1. Identifica se recebeu o objeto do Agente ou o slug de uma Tool
  if (typeof connectorSlugOrAgent === 'object' && connectorSlugOrAgent !== null) {
    connectorName = connectorSlugOrAgent.name || connectorSlugOrAgent.slug;
    endpointUrl = connectorSlugOrAgent.endpoint_url || '';
    httpMethod = (connectorSlugOrAgent.http_method || 'GET').toUpperCase();
    authToken = (connectorSlugOrAgent.auth_token || connectorSlugOrAgent.api_key || '').trim();
    payloadTemplate = connectorSlugOrAgent.payload_template || connectorSlugOrAgent.code_snippet || '';
  } else {
    const cleanSlug = String(connectorSlugOrAgent).toLowerCase().trim();
    connectorName = cleanSlug;

    // Busca na tabela external_connectors
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
      // Busca na tabela ai_agents
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

  // 2. Extração dinâmica de variáveis (query, symbol, ticker, prompt, etc.)
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

  // 3. Interpolação de variáveis {{chave}} na URL
  let hadPlaceholderInUrl = false;
  let finalUrl = endpointUrl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, varName) => {
    const key = varName.trim();
    if (key !== 'BASE_URL' && key !== 'SERVER_IP') hadPlaceholderInUrl = true;
    const replacement = dynamicVars[key] ?? dynamicVars[key.toLowerCase()] ?? dynamicVars.query ?? '';
    return key === 'BASE_URL' || key === 'SERVER_IP' ? replacement : encodeURIComponent(replacement);
  });

  // Se for GET sem parâmetros na rota e tiver ativo/query, anexa no path
  if (!hadPlaceholderInUrl && httpMethod === 'GET') {
    const mainParam = dynamicVars.symbol || taskArgs?.id || taskArgs?.param || '';
    if (mainParam && !finalUrl.endsWith(mainParam) && !finalUrl.includes('?')) {
      finalUrl = `${finalUrl.replace(/\/+$/, '')}/${encodeURIComponent(mainParam)}`;
    }
  }

  // 4. Injeção universal de autenticação (Headers + Query Parameter)
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

  // Execução via Motor Universal caso seja conector de banco ou API
  const customConn = connectorsMap.get(cleanKey);
  if (customConn || cleanKey.startsWith('brapi')) {
    return await executeUniversalApiConnector(
      customConn || cleanKey,
      args,
      userPrompt,
      serverBaseUrl
    );
  }

  const cfg = customConn?.config || {};
  const isNativeSpecialized =
    cleanKey.includes('home_assistant') ||
    cleanKey.includes('hass') ||
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

  return await executeUniversalApiConnector(cleanKey, args, userPrompt, serverBaseUrl);
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