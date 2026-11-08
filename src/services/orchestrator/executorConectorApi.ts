// src/services/orchestrator/executorConectorApi.ts
import { pool } from '../../config/database.js';
import { limparMascaraChave } from './motorInferencaLLM.js';

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
      .catch(() => ({ rows: [] as any[] }));

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
      if (cfg.headers && typeof cfg.headers === 'object') customHeaders = cfg.headers;
    } else {
      const agRes = await pool
        .query(`SELECT * FROM ai_agents WHERE LOWER(slug) = $1 LIMIT 1;`, [cleanSlug])
        .catch(() => ({ rows: [] as any[] }));
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

  const baseLimpa = (serverBaseUrl || 'http://localhost:3333').replace(/\/+$/, '');

  // Expande endpoints com caminhos relativos
  if (endpointUrl.startsWith('/')) {
    endpointUrl = `${baseLimpa}${endpointUrl}`;
  }

  const tickerFonte = String(taskArgs?.symbol || taskArgs?.ticker || taskArgs?.query || userPrompt || '').toUpperCase();
  const tickerMatch = tickerFonte.match(/\b([A-Z]{4}\d{1,2})\b/);

  const variaveisDinamicas: Record<string, string> = {
    BASE_URL: baseLimpa,
    SERVER_IP: baseLimpa,
    prompt: userPrompt,
    query: String(taskArgs?.query || taskArgs?.symbol || taskArgs?.task_details || userPrompt || '').trim(),
    symbol: String(taskArgs?.symbol || taskArgs?.ticker || (tickerMatch ? tickerMatch[1] : taskArgs?.query || '')).trim()
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

  if (!tevePlaceholder && httpMethod === 'GET') {
    const paramPrincipal = variaveisDinamicas.symbol || taskArgs?.id || taskArgs?.param || '';
    if (paramPrincipal && !urlFinal.endsWith(paramPrincipal) && !urlFinal.includes('?')) {
      urlFinal = `${urlFinal.replace(/\/+$/, '')}/${encodeURIComponent(paramPrincipal)}`;
    }
  }

  const tokenLimpo = limparMascaraChave(authToken);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...customHeaders
  };

  if (tokenLimpo) {
    headers['Authorization'] = `Bearer ${tokenLimpo}`;
    if (authType === 'api_key') {
      headers['x-api-key'] = tokenLimpo;
    }
    const jaTemTokenNaUrl = /[?&](token|apikey|api_key|key)=/i.test(urlFinal);
    const deveAnexarTokenNaQuery = authType === 'query_token' || urlFinal.includes('brapi.dev');
    if (!jaTemTokenNaUrl && deveAnexarTokenNaQuery) {
      urlFinal += `${urlFinal.includes('?') ? '&' : '?'}${encodeURIComponent(queryParamKey)}=${encodeURIComponent(tokenLimpo)}`;
    }
  }

  let requestBody: string | undefined = undefined;
  if (httpMethod !== 'GET' && httpMethod !== 'HEAD') {
    if (payloadTemplate && payloadTemplate.trim().startsWith('{')) {
      requestBody = payloadTemplate.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, varName) => {
        const k = varName.trim();
        return (
          variaveisDinamicas[k] ??
          variaveisDinamicas[k.toLowerCase()] ??
          variaveisDinamicas.query ??
          ''
        );
      });
    } else {
      requestBody = JSON.stringify({
        ...taskArgs,
        query: variaveisDinamicas.query,
        prompt: userPrompt
      });
    }
  }

  try {
    const resposta = await fetch(urlFinal, {
      method: httpMethod,
      headers,
      body: requestBody,
      signal: AbortSignal.timeout(15000)
    });

    // Leitura única e protegida do stream de resposta
    const rawText = await resposta.text();
    let dadosBrutos: any;
    try {
      dadosBrutos = JSON.parse(rawText);
    } catch {
      dadosBrutos = { rawText };
    }

    return {
      connector: connectorName,
      httpStatus: resposta.status,
      success: resposta.ok,
      authenticatedWithToken: Boolean(tokenLimpo),
      data: dadosBrutos
    };
  } catch (err: any) {
    return {
      error: `Falha na requisição ao conector "${connectorName}": ${err.message}`,
      connector: connectorName,
      httpStatus: 500,
      success: false
    };
  }
}

export const executeUniversalApiConnector = executarConectorApiUniversal;
