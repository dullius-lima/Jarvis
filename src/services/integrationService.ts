// src/services/integrationService.ts
import { pool } from '../config/database.js';
import { executeMcpToolCall } from './mcpHfService.js';

export interface IntegrationRequestPayload {
  providerKey: string;
  action?: string;
  payload?: any;
}

async function getConnectorConfig(providerKey: string): Promise<Record<string, any>> {
  try {
    const res = await pool.query(
      'SELECT * FROM external_connectors WHERE provider_key = $1 LIMIT 1;',
      [providerKey]
    );
    if (res.rows.length > 0) {
      const row = res.rows[0];
      const cfg = typeof row.config === 'object' && row.config !== null ? row.config : {};
      return {
        ...cfg,
        endpoint_url: row.endpoint_url || cfg.endpoint_url || '',
        http_method: cfg.http_method || 'POST',
        api_key: row.api_key || cfg.api_key || cfg.auth_token || '',
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
  const key = String(providerKey || '').toLowerCase().trim();
  const config = await getConnectorConfig(key);
  const token = config.api_key || config.access_token || '';

  switch (key) {
    case 'brapi': {
      const ticker = payload.symbol || payload.ticker || payload.query || 'PETR4';
      const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}${token ? `?token=${token}` : ''}`;
      const res = await fetch(url);
      return await res.json();
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
      const rawEmail = Buffer.from(
        `To: ${payload.to || ''}\r\nSubject: ${payload.subject || 'JARVIS'}\r\n\r\n${payload.body || payload.text || ''}`
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
      const data = await res.json().catch(() => ({}));
      return { success: res.ok, provider: 'gmail', data };
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
          body: JSON.stringify({ values: payload.values || [[new Date().toISOString(), JSON.stringify(payload)]] })
        }
      );
      return await res.json().catch(() => ({ success: res.ok }));
    }

    case 'telegram': {
      const botToken = token || process.env.TELEGRAM_BOT_TOKEN || '';
      const chatId = payload.chatId || payload.recipientId || process.env.ADMIN_TELEGRAM_CHAT_ID || '';
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: payload.text || payload.prompt || JSON.stringify(payload)
        })
      });
      return await res.json().catch(() => ({ success: res.ok }));
    }

    case 'home_assistant': {
      const haUrl = (config.endpoint_url || process.env.HOME_ASSISTANT_URL || 'http://localhost:8123/api').replace(/\/+$/, '');
      const haToken = token || process.env.HOME_ASSISTANT_TOKEN || '';
      const servicePath = payload.service || 'states';
      const method = payload.service ? 'POST' : 'GET';
      const res = await fetch(`${haUrl}/${servicePath}`, {
        method,
        headers: {
          Authorization: `Bearer ${haToken}`,
          'Content-Type': 'application/json'
        },
        ...(method === 'POST' ? { body: JSON.stringify(payload.entityData || payload) } : {})
      });
      return await res.json().catch(() => ({ success: res.ok, status: res.status }));
    }

    default: {
      // Execução genérica para Custom Tools (HTTP / Webhook / MCP) salvas em external_connectors
      const endpoint = payload.endpoint || config.endpoint_url;
      if (!endpoint) {
        return {
          success: false,
          error: `Conector "${providerKey}" não possui endpoint_url configurado.`
        };
      }

      if (config.protocol === 'mcp' || payload.protocol === 'MCP') {
        return await executeMcpToolCall({
          serverUrl: endpoint,
          toolName: payload.toolName || action,
          params: payload.body || payload
        });
      }

      const method = (payload.method || config.http_method || 'GET').toUpperCase();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(payload.headers || {})
      };
      if (token) {
        headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      }

      const queryVal = payload.query || payload.prompt || '';
      const finalUrl = endpoint.replace(/\{\{\s*query\s*\}\}/gi, encodeURIComponent(String(queryVal)));

      const resp = await fetch(finalUrl, {
        method,
        headers,
        ...(method !== 'GET' && method !== 'HEAD'
          ? { body: JSON.stringify(payload.body || payload) }
          : {})
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

/**
 * Função unificada invocada por integrationAndProtocolService.ts e orchestratorService.ts
 */
export async function executeNodeIntegration(
  agentOrSlug: any,
  payload: Record<string, any> = {}
): Promise<any> {
  if (typeof agentOrSlug === 'string') {
    return executeExternalConnector({
      providerKey: agentOrSlug,
      action: payload.action || 'execute',
      payload
    });
  }

  const endpoint = payload.endpoint || agentOrSlug?.endpoint_url;
  const protocol = String(payload.protocol || agentOrSlug?.agent_type || 'HTTP').toUpperCase();

  if (protocol === 'MCP' && endpoint) {
    return executeMcpToolCall({
      serverUrl: endpoint,
      toolName: payload.toolName || agentOrSlug?.slug,
      params: payload.body || payload
    });
  }

  if (endpoint) {
    const method = (payload.method || agentOrSlug?.http_method || 'POST').toUpperCase();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(payload.headers || {})
    };
    const token = agentOrSlug?.auth_token || agentOrSlug?.api_key;
    if (token) {
      headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }

    const resp = await fetch(endpoint, {
      method,
      headers,
      ...(method !== 'GET' && method !== 'HEAD'
        ? { body: JSON.stringify(payload.body ?? payload) }
        : {})
    });

    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch {
      return { success: resp.ok, status: resp.status, data: text };
    }
  }

  return executeExternalConnector({
    providerKey: agentOrSlug?.slug || agentOrSlug?.provider || 'custom',
    payload
  });
}

export default {
  executeExternalConnector,
  executeNodeIntegration
};