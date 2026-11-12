// src/services/orchestrator/executorConectorApi.ts
import { pool } from '../../config/database.js';
import { limparMascaraChave } from './motorInferencaLLM.js';
import { obterTokenAcessoGoogle } from '../integrationService.js';

export async function executarConectorApiUniversal(
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
    connectorName = connectorSlugOrAgent.name || connectorSlugOrAgent.slug || 'custom_connector';
    endpointUrl =
      taskArgs?.url ||
      taskArgs?.endpoint ||
      connectorSlugOrAgent.endpoint_url ||
      connectorSlugOrAgent.config?.endpoint_url ||
      '';
    httpMethod = (
      taskArgs?.method ||
      connectorSlugOrAgent.http_method ||
      connectorSlugOrAgent.config?.http_method ||
      'GET'
    ).toUpperCase();
    authToken = (
      connectorSlugOrAgent.auth_token ||
      connectorSlugOrAgent.api_key ||
      connectorSlugOrAgent.config?.auth_token ||
      connectorSlugOrAgent.config?.api_key ||
      ''
    ).trim();
    payloadTemplate =
      connectorSlugOrAgent.payload_template ||
      connectorSlugOrAgent.code_snippet ||
      connectorSlugOrAgent.config?.payload_template ||
      '';
    if (connectorSlugOrAgent.config?.headers) {
      customHeaders = { ...connectorSlugOrAgent.config.headers };
    }
  } else {
    const cleanSlug = String(connectorSlugOrAgent).toLowerCase().trim();
    connectorName = cleanSlug;

    const connRes = await pool
      .query(`SELECT * FROM external_connectors WHERE LOWER(provider_key) = $1 LIMIT 1;`, [
        cleanSlug
      ])
      .catch(() => ({ rows: [] as any[] }));

    if (connRes.rows.length > 0) {
      const row = connRes.rows[0];
      const cfg =
        typeof row.config === 'string' ? JSON.parse(row.config || '{}') : row.config || {};
      connectorName = row.name || cleanSlug;
      endpointUrl =
        taskArgs?.url ||
        taskArgs?.endpoint ||
        cfg.endpoint_url ||
        cfg.base_url ||
        cfg.url ||
        row.endpoint_url ||
        '';
      httpMethod = (
        taskArgs?.method ||
        cfg.http_method ||
        cfg.method ||
        row.http_method ||
        'GET'
      ).toUpperCase();
      authToken = (cfg.auth_token || cfg.api_key || cfg.token || row.api_key || '').trim();
      authType = (cfg.auth_type || 'bearer').toLowerCase();
      queryParamKey = cfg.query_param_key || 'token';
      payloadTemplate = cfg.payload_template || '';
      if (cfg.headers && typeof cfg.headers === 'object') customHeaders = cfg.headers;
    } else {
      const agRes = await pool
        .query(`SELECT * FROM ai_agents WHERE LOWER(slug) = $1 LIMIT 1;`, [cleanSlug])
        .catch(() => ({ rows: [] as any[] }));
      if (agRes.rows.length > 0) {
        const ag = agRes.rows[0];
        connectorName = ag.name || cleanSlug;
        endpointUrl = taskArgs?.url || taskArgs?.endpoint || ag.endpoint_url || '';
        httpMethod = (taskArgs?.method || ag.http_method || 'GET').toUpperCase();
        authToken = (ag.auth_token || ag.api_key || '').trim();
        payloadTemplate = ag.payload_template || ag.code_snippet || '';
      } else if (taskArgs?.url || taskArgs?.endpoint) {
        // Permite chamada HTTP Universal direta mesmo sem registro prévio
        endpointUrl = String(taskArgs.url || taskArgs.endpoint).trim();
        httpMethod = String(taskArgs.method || 'GET').toUpperCase();
        authToken = String(taskArgs.auth_token || '').trim();
      }
    }
  }

  if (!endpointUrl) {
    return { error: `Conector ou API "${connectorName}" não possui Endpoint URL configurada.` };
  }

  const baseLimpa = (serverBaseUrl || 'http://localhost:3333').replace(/\/+$/, '');

  if (endpointUrl.startsWith('/')) {
    endpointUrl = `${baseLimpa}${endpointUrl}`;
  }

  const tickerFonte = String(
    taskArgs?.symbol || taskArgs?.ticker || taskArgs?.query || userPrompt || ''
  ).toUpperCase();
  const tickerMatch = tickerFonte.match(/\b([A-Z]{4}\d{1,2})\b/);

  const variaveisDinamicas: Record<string, string> = {
    BASE_URL: baseLimpa,
    SERVER_IP: baseLimpa,
    prompt: userPrompt,
    query: String(
      taskArgs?.query || taskArgs?.symbol || taskArgs?.task_details || userPrompt || ''
    ).trim(),
    symbol: String(
      taskArgs?.symbol || taskArgs?.ticker || (tickerMatch ? tickerMatch[1] : taskArgs?.query || '')
    ).trim()
  };

  for (const [chave, val] of Object.entries(taskArgs || {})) {
    if (typeof val === 'string' || typeof val === 'number') {
      variaveisDinamicas[chave] = String(val).trim();
    }
  }

  let tevePlaceholder = false;
  let urlFinal = endpointUrl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, varName) => {
    const k = varName.trim();
    if (k !== 'BASE_URL' && k !== 'SERVER_IP') tevePlaceholder = true;
    const subst =
      variaveisDinamicas[k] ??
      variaveisDinamicas[k.toLowerCase()] ??
      variaveisDinamicas.query ??
      '';
    return k === 'BASE_URL' || k === 'SERVER_IP' ? subst : encodeURIComponent(subst);
  });

  if (!tevePlaceholder && httpMethod === 'GET' && urlFinal.includes('brapi.dev')) {
    const paramPrincipal = variaveisDinamicas.symbol || taskArgs?.id || taskArgs?.param || '';
    if (paramPrincipal && !urlFinal.endsWith(paramPrincipal) && !urlFinal.includes('?')) {
      urlFinal = `${urlFinal.replace(/\/+$/, '')}/${encodeURIComponent(paramPrincipal)}`;
    }
  }

  // Anexa queryParams explícitos se enviados pela LLM
  if (taskArgs?.queryParams && typeof taskArgs.queryParams === 'object') {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(taskArgs.queryParams)) {
      if (v !== undefined && v !== null) sp.append(k, String(v));
    }
    const qs = sp.toString();
    if (qs) urlFinal += (urlFinal.includes('?') ? '&' : '?') + qs;
  }

  let tokenLimpo = limparMascaraChave(authToken);

  // Se for chamada para APIs do Google sem token explícito, renova automaticamente via OAuth2
  if (!tokenLimpo && urlFinal.includes('googleapis.com')) {
    try {
      tokenLimpo = await obterTokenAcessoGoogle();
    } catch {}
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...customHeaders,
    ...(taskArgs?.headers && typeof taskArgs.headers === 'object' ? taskArgs.headers : {})
  };

  if (tokenLimpo) {
    headers['Authorization'] = tokenLimpo.startsWith('Bearer ')
      ? tokenLimpo
      : `Bearer ${tokenLimpo}`;
    if (authType === 'api_key') {
      headers['x-api-key'] = tokenLimpo;
    }
    const jaTemTokenNaUrl = /[?&](token|apikey|api_key|key)=/i.test(urlFinal);
    const deveAnexarTokenNaQuery =
      authType === 'query_token' ||
      urlFinal.includes('brapi.dev') ||
      urlFinal.includes('finnhub.io');
    if (!jaTemTokenNaUrl && deveAnexarTokenNaQuery) {
      const sep = urlFinal.includes('?') ? '&' : '?';
      urlFinal = `${urlFinal}${sep}${encodeURIComponent(queryParamKey)}=${encodeURIComponent(
        tokenLimpo
      )}`;
    }
  }

  let corpoRequisicao: string | undefined = undefined;
  if (httpMethod !== 'GET' && httpMethod !== 'HEAD') {
    if (taskArgs?.body || taskArgs?.bodyData || taskArgs?.service_data || taskArgs?.params) {
      const objCorpo =
        taskArgs.body || taskArgs.bodyData || taskArgs.service_data || taskArgs.params;
      corpoRequisicao = typeof objCorpo === 'string' ? objCorpo : JSON.stringify(objCorpo);
    } else if (payloadTemplate && payloadTemplate.trim().length > 0) {
      corpoRequisicao = payloadTemplate.replace(
        /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
        (_m, varName) => variaveisDinamicas[varName.trim()] ?? ''
      );
    } else {
      corpoRequisicao = JSON.stringify(taskArgs);
    }
  }

  try {
    const resposta = await fetch(urlFinal, {
      method: httpMethod,
      headers,
      body: corpoRequisicao,
      signal: AbortSignal.timeout(15000)
    });

    const rawText = await resposta.text();
    let dadosBrutos: any;
    try {
      dadosBrutos = JSON.parse(rawText);
    } catch {
      dadosBrutos = { rawText };
    }

    return {
      connector: connectorName,
      status: resposta.status,
      ok: resposta.ok,
      url: urlFinal,
      data: dadosBrutos
    };
  } catch (err: any) {
    return {
      connector: connectorName,
      ok: false,
      error: `Falha ao chamar endpoint (${urlFinal}): ${err.message}`
    };
  }
}

export const executeUniversalApiConnector = executarConectorApiUniversal;
export default { executarConectorApiUniversal, executeUniversalApiConnector };
