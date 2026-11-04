// src/services/integrationService.ts
import { pool } from '../config/database.js';
import { executeMcpToolCall } from './mcpHfService.js';

export interface IntegrationRequestPayload {
  providerKey: string;
  action?: string;
  payload?: any;
}

function sanitizeKey(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Extrai um ticker válido da B3 (ex: PETR4, VALE3, KLBN11) mesmo se a IA enviar uma frase inteira
 */
export function extractCleanTicker(rawInput: string): string {
  const str = String(rawInput || '').trim();
  const match = str.toUpperCase().match(/\b([A-Z]{4}\d{1,2})\b/);
  if (match && match[1]) return match[1];
  return str.split(/\s+/)[0]?.toUpperCase() || 'PETR4';
}

/**
 * Busca a configuração e o token do conector no banco (com suporte a aliases como brapi_b3 -> brapi)
 */
export async function getConnectorConfig(providerKey: string): Promise<Record<string, any>> {
  const clean = sanitizeKey(providerKey);
  const aliases = [clean];
  if (clean.startsWith('brapi')) aliases.push('brapi', 'brapi_b3', 'brapi_quote');
  if (clean.includes('home_assistant') || clean.includes('hass')) aliases.push('home_assistant');
  if (clean.includes('gmail')) aliases.push('gmail', 'google_gmail');
  if (clean.includes('outlook')) aliases.push('outlook', 'microsoft_outlook');
  if (clean.includes('telegram')) aliases.push('telegram', 'telegram_bot');
  if (clean.includes('whatsapp')) aliases.push('whatsapp', 'whatsapp_evolution');

  try {
    const res = await pool.query(
      'SELECT * FROM external_connectors WHERE LOWER(provider_key) = ANY($1) ORDER BY updated_at DESC LIMIT 1;',
      [aliases]
    );
    if (res.rows.length > 0) {
      const row = res.rows[0];
      const cfg =
        typeof row.config === 'string'
          ? JSON.parse(row.config || '{}')
          : row.config || {};
      return {
        ...cfg,
        provider_key: row.provider_key,
        endpoint_url: (cfg.endpoint_url || row.endpoint_url || '').trim(),
        http_method: (cfg.http_method || row.http_method || 'GET').toUpperCase(),
        api_key: (cfg.api_key || cfg.auth_token || row.api_key || '').trim(),
        auth_token: (cfg.auth_token || cfg.api_key || row.api_key || '').trim(),
        is_enabled: row.is_enabled ?? true
      };
    }
  } catch (err: any) {
    console.warn(`⚠️ [Integration Service] Fallback de ambiente para ${providerKey}:`, err.message);
  }
  return {};
}

export async function executeExternalConnector({
  providerKey,
  action = 'execute',
  payload = {}
}: IntegrationRequestPayload): Promise<any> {
  const rawKey = sanitizeKey(providerKey);
  const config = await getConnectorConfig(rawKey);
  const token = (
    payload?.auth_token ||
    payload?.api_key ||
    config.auth_token ||
    config.api_key ||
    config.access_token ||
    ''
  )
    .replace(/^Bearer\s+/i, '')
    .trim();

  // Normaliza chave para os switches nativos
  const key = rawKey.startsWith('brapi')
    ? 'brapi'
    : rawKey.includes('home_assistant') || rawKey.includes('hass')
    ? 'home_assistant'
    : rawKey.includes('gmail')
    ? 'gmail'
    : rawKey.includes('outlook')
    ? 'outlook'
    : rawKey.includes('telegram')
    ? 'telegram'
    : rawKey;

  switch (key) {
    case 'brapi': {
      const rawTicker =
        payload.symbol || payload.ticker || payload.query || payload.task_details || 'PETR4';
      const ticker = extractCleanTicker(rawTicker);
      const brapiToken = token || process.env.BRAPI_API_KEY || process.env.BRAPI_TOKEN || '';

      const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}${
        brapiToken ? `?token=${encodeURIComponent(brapiToken)}` : ''
      }`;
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (brapiToken) {
        headers['Authorization'] = `Bearer ${brapiToken}`;
      }

      const res = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(
          data.message || `Erro HTTP ${res.status} ao consultar ticker ${ticker} na Brapi.`
        );
      }
      return data;
    }

    case 'home_assistant': {
      let rawHaUrl = (
        payload.endpoint ||
        config.endpoint_url ||
        process.env.HOME_ASSISTANT_URL ||
        'http://localhost:8123'
      )
        .trim()
        .replace(/\/+$/, '');

      // Garante que a URL base termine exatamente em /api (mesmo se o usuário digitou só a porta 8123 ou /api/states)
      rawHaUrl = rawHaUrl.replace(/\/api(\/states|\/services.*)?$/i, '');
      const haBaseApi = `${rawHaUrl}/api`;

      const haToken = token || (process.env.HOME_ASSISTANT_TOKEN || '').trim();
      if (!haToken) {
        throw new Error(
          'Token Long-Lived do Home Assistant não configurado. Informe o token na aba Conexões Externas ou no Agente.'
        );
      }

      const headers = {
        Authorization: `Bearer ${haToken}`,
        'Content-Type': 'application/json'
      };

      const act = String(
        payload.action || action || payload.service || ''
      )
        .toLowerCase()
        .trim();
      const entityId = String(
        payload.entity_id || payload.entityId || payload.target || ''
      ).trim();

      // Detecta se é uma chamada de serviço (ex: turn_on, turn_off, toggle, light/turn_on)
      const isServiceAction =
        act === 'turn_on' ||
        act === 'turn_off' ||
        act === 'toggle' ||
        act.includes('/') ||
        Boolean(payload.domain && payload.service);

      if (isServiceAction) {
        let domain = payload.domain || '';
        let service = payload.service || act;

        if (service.includes('/')) {
          const parts = service.split('/');
          domain = parts[0].replace(/^services$/i, '') || domain;
          service = parts[parts.length - 1];
        }
        if (!domain && entityId.includes('.')) {
          domain = entityId.split('.')[0];
        }
        if (!domain) domain = 'homeassistant';

        const serviceUrl = `${haBaseApi}/services/${domain}/${service}`;
        const bodyObj: Record<string, any> = {
          ...(typeof payload.entityData === 'object' ? payload.entityData : {}),
          ...(typeof payload.data === 'object' ? payload.data : {})
        };
        if (entityId) {
          bodyObj.entity_id = entityId;
        }

        const res = await fetch(serviceUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(bodyObj),
          signal: AbortSignal.timeout(12000)
        });
        const data = await res.json().catch(async () => ({ raw: await res.text() }));
        if (!res.ok) {
          throw new Error(
            `Home Assistant retornou HTTP ${res.status} em ${serviceUrl}: ${JSON.stringify(data)}`
          );
        }
        return {
          success: true,
          provider: 'home_assistant',
          action: `${domain}.${service}`,
          entity_id: entityId || 'all',
          data
        };
      }

      // Caso contrário, consulta o estado de uma entidade específica ou lista os sensores ativos
      const stateUrl = entityId
        ? `${haBaseApi}/states/${encodeURIComponent(entityId)}`
        : `${haBaseApi}/states`;

      const res = await fetch(stateUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(12000)
      });
      const data: any = await res.json().catch(async () => ({ raw: await res.text() }));
      if (!res.ok) {
        throw new Error(
          `Falha ao consultar Home Assistant (HTTP ${res.status}) em ${stateUrl}. Verifique IP/Porta e Token.`
        );
      }

      // Se listou todos os estados e há um filtro em query, filtra as entidades relevantes para economizar tokens
      if (Array.isArray(data) && (payload.query || payload.task_details)) {
        const q = String(payload.query || payload.task_details)
          .toLowerCase()
          .trim();
        const keywords = q
          .split(/\s+/)
          .filter((w) => w.length > 2 && !['qual', 'como', 'está', 'estado', 'home', 'assistant'].includes(w));
        if (keywords.length > 0) {
          const filtered = data.filter((item: any) => {
            const eid = String(item.entity_id || '').toLowerCase();
            const fname = String(item.attributes?.friendly_name || '').toLowerCase();
            return keywords.some((kw) => eid.includes(kw) || fname.includes(kw));
          });
          if (filtered.length > 0 && filtered.length <= 25) {
            return { success: true, totalMatched: filtered.length, states: filtered };
          }
        }
        return {
          success: true,
          totalEntities: data.length,
          sampleStates: data.slice(0, 30).map((s: any) => ({
            entity_id: s.entity_id,
            state: s.state,
            name: s.attributes?.friendly_name
          }))
        };
      }

      return data;
    }

    case 'outlook': {
      const accessToken = token || process.env.OUTLOOK_ACCESS_TOKEN || '';
      const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: payload.message || {
            subject: payload.subject || 'Notificação JARVIS',
            body: { contentType: 'Text', content: payload.body || payload.text || '' },
            toRecipients: [{ emailAddress: { address: payload.to || '' } }]
          },
          saveToSentItems: 'true'
        })
      });
      return { success: res.ok, provider: 'outlook', status: res.status };
    }

    case 'gmail': {
      const accessToken = token || process.env.GMAIL_ACCESS_TOKEN || '';
      if (!accessToken) {
        throw new Error('Token OAuth2 do Gmail não configurado no Hub de Conexões.');
      }

      const effectiveAction = payload.action || action;

      if (
        effectiveAction === 'delete_message' ||
        effectiveAction === 'trash_message' ||
        effectiveAction === 'delete_email'
      ) {
        let targetId = payload.id || payload.messageId;
        if (!targetId) {
          const listRes = await fetch(
            'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1',
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const listData: any = await listRes.json().catch(() => ({}));
          targetId = listData.messages?.[0]?.id;
        }
        if (!targetId) {
          return {
            success: false,
            provider: 'gmail',
            message: 'Nenhuma mensagem encontrada para excluir.'
          };
        }

        const trashRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${targetId}/trash`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );
        const trashData: any = await trashRes.json().catch(() => ({}));
        if (!trashRes.ok) {
          throw new Error(
            trashData.error?.message || `Erro ao mover mensagem ${targetId} para a lixeira.`
          );
        }
        return {
          success: true,
          provider: 'gmail',
          action: 'trash_message',
          messageId: targetId,
          message: `Mensagem ${targetId} movida para a lixeira com sucesso.`
        };
      }

      if (
        effectiveAction === 'read_inbox' ||
        effectiveAction === 'list_messages' ||
        effectiveAction === 'get_messages' ||
        !payload.to
      ) {
        const maxResults = payload.maxResults || 5;
        const q = payload.query ? `&q=${encodeURIComponent(payload.query)}` : '';
        const listRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}${q}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const listData: any = await listRes.json().catch(() => ({}));
        if (!listRes.ok) {
          throw new Error(listData.error?.message || `Erro HTTP ${listRes.status} ao listar Gmail.`);
        }

        const messages = listData.messages || [];
        if (messages.length === 0) {
          return {
            success: true,
            provider: 'gmail',
            count: 0,
            messages: [],
            message: 'Caixa de entrada vazia.'
          };
        }

        const details = await Promise.all(
          messages.slice(0, maxResults).map(async (msgItem: any) => {
            const detailRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgItem.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const detailData: any = await detailRes.json().catch(() => ({}));
            const headers = detailData.payload?.headers || [];
            const getH = (name: string) =>
              headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

            return {
              id: msgItem.id,
              threadId: msgItem.threadId,
              subject: getH('Subject') || '(Sem Assunto)',
              from: getH('From'),
              date: getH('Date'),
              snippet: detailData.snippet || ''
            };
          })
        );

        return {
          success: true,
          provider: 'gmail',
          action: 'read_inbox',
          total: details.length,
          messages: details
        };
      }

      const rawEmail = Buffer.from(
        `To: ${payload.to}\r\nSubject: =?utf-8?B?${Buffer.from(
          payload.subject || 'JARVIS'
        ).toString('base64')}?=\r\nContent-Type: text/plain; charset="UTF-8"\r\nMIME-Version: 1.0\r\n\r\n${
          payload.body || payload.text || ''
        }`
      )
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: rawEmail })
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error?.message || 'Falha ao enviar e-mail via Gmail API.');
      return { success: true, provider: 'gmail', action: 'send_email', data };
    }

    case 'google_sheets': {
      const accessToken = token || process.env.GOOGLE_SHEETS_TOKEN || '';
      const spreadsheetId = config.spreadsheet_id || payload.spreadsheetId;
      const range = payload.range || 'Sheet1!A1';
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: payload.values || [[new Date().toISOString(), JSON.stringify(payload)]]
          })
        }
      );
      return await res.json().catch(() => ({ success: res.ok }));
    }

    case 'telegram': {
      const botToken = token || process.env.TELEGRAM_BOT_TOKEN || '';
      const chatId =
        payload.chatId ||
        payload.recipientId ||
        config.chat_id ||
        process.env.ADMIN_TELEGRAM_CHAT_ID ||
        '';
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: payload.text || payload.prompt || payload.query || JSON.stringify(payload)
        })
      });
      return await res.json().catch(() => ({ success: res.ok }));
    }

    default: {
      const endpoint = payload.endpoint || config.endpoint_url;
      if (!endpoint) {
        return {
          success: false,
          error: `Conector "${providerKey}" não possui endpoint_url configurado.`
        };
      }

      if (config.tool_type === 'mcp' || config.protocol === 'mcp' || payload.protocol === 'MCP') {
        return await executeMcpToolCall({
          serverUrl: endpoint,
          toolName: payload.toolName || action,
          params: payload.body || payload
        });
      }

      const method = (payload.method || config.http_method || 'GET').toUpperCase();
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(payload.headers || {})
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const queryVal = String(payload.query || payload.prompt || '').trim();
      const symbolVal = extractCleanTicker(payload.symbol || queryVal);
      const finalUrl = endpoint
        .replace(/\{\{\s*symbol\s*\}\}/gi, encodeURIComponent(symbolVal))
        .replace(/\{\{\s*query\s*\}\}/gi, encodeURIComponent(queryVal));

      const resp = await fetch(finalUrl, {
        method,
        headers,
        ...(method !== 'GET' && method !== 'HEAD'
          ? { body: JSON.stringify(payload.body || payload) }
          : {}),
        signal: AbortSignal.timeout(15000)
      });

      const rawText = await resp.text();
      try {
        return JSON.parse(rawText);
      } catch {
        return { success: resp.ok, status: resp.status, data: rawText };
      }
    }
  }
}

export async function executeNodeIntegration(
  agentOrSlug: any,
  payload: Record<string, any> = {}
): Promise<any> {
  const flatPayload = {
    ...(typeof payload.body === 'object' && payload.body !== null ? payload.body : {}),
    ...payload
  };

  if (typeof agentOrSlug === 'string') {
    return executeExternalConnector({
      providerKey: agentOrSlug,
      action: flatPayload.action || 'execute',
      payload: flatPayload
    });
  }

  const slug = sanitizeKey(agentOrSlug?.slug || agentOrSlug?.provider || '');
  const endpoint = (flatPayload.endpoint || agentOrSlug?.endpoint_url || '').trim();
  const protocol = String(flatPayload.protocol || agentOrSlug?.agent_type || 'HTTP').toUpperCase();

  // Se o slug ou a URL corresponder a Home Assistant, Brapi, Gmail, Outlook ou Telegram, usa o motor nativo especializado!
  if (
    slug.includes('home_assistant') ||
    slug.includes('hass') ||
    endpoint.includes(':8123')
  ) {
    return executeExternalConnector({
      providerKey: 'home_assistant',
      action: flatPayload.action || 'execute',
      payload: {
        ...flatPayload,
        endpoint: endpoint || undefined,
        auth_token: agentOrSlug?.auth_token || agentOrSlug?.api_key || undefined
      }
    });
  }

  if (slug.includes('brapi') || endpoint.includes('brapi.dev')) {
    return executeExternalConnector({
      providerKey: 'brapi',
      action: flatPayload.action || 'quote',
      payload: {
        ...flatPayload,
        auth_token: agentOrSlug?.auth_token || agentOrSlug?.api_key || undefined
      }
    });
  }

  if (protocol === 'MCP' && endpoint) {
    return executeMcpToolCall({
      serverUrl: endpoint,
      toolName: flatPayload.toolName || agentOrSlug?.slug,
      params: flatPayload
    });
  }

  if (endpoint) {
    // Busca token no próprio agente; se estiver vazio, herda da tabela external_connectors!
    const fallbackConn = await getConnectorConfig(slug);
    const rawToken =
      agentOrSlug?.auth_token ||
      agentOrSlug?.api_key ||
      fallbackConn.auth_token ||
      fallbackConn.api_key ||
      '';
    const cleanToken = String(rawToken).replace(/^Bearer\s+/i, '').trim();

    const queryVal = String(
      flatPayload.query || flatPayload.task_details || flatPayload.prompt || ''
    ).trim();
    const symbolVal = extractCleanTicker(flatPayload.symbol || queryVal);

    const interpolatedUrl = endpoint
      .replace(/\{\{\s*symbol\s*\}\}/gi, encodeURIComponent(symbolVal))
      .replace(/\{\{\s*query\s*\}\}/gi, encodeURIComponent(queryVal));

    const method = (flatPayload.method || agentOrSlug?.http_method || 'GET').toUpperCase();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(flatPayload.headers || {})
    };
    if (cleanToken) {
      headers['Authorization'] = `Bearer ${cleanToken}`;
    }

    const resp = await fetch(interpolatedUrl, {
      method,
      headers,
      ...(method !== 'GET' && method !== 'HEAD'
        ? { body: JSON.stringify(flatPayload.body ?? flatPayload) }
        : {}),
      signal: AbortSignal.timeout(15000)
    });

    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch {
      return { success: resp.ok, status: resp.status, data: text };
    }
  }

  return executeExternalConnector({
    providerKey: slug || 'custom',
    action: flatPayload.action || 'execute',
    payload: flatPayload
  });
}

export default {
  executeExternalConnector,
  executeNodeIntegration,
  getConnectorConfig,
  extractCleanTicker
};