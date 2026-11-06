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
 * Extrai um ticker válido da B3 (ex: PETR4, VALE3, KLBN11)
 */
export function extractCleanTicker(rawInput: string): string {
  const str = String(rawInput || '').trim();
  const match = str.toUpperCase().match(/\b([A-Z]{4}\d{1,2})\b/);
  if (match && match[1]) return match[1];
  return str.split(/\s+/)[0]?.toUpperCase() || 'PETR4';
}

/**
 * Busca a configuração e o token do conector no banco de dados
 */
export async function getConnectorConfig(providerKey: string): Promise<Record<string, any>> {
  const clean = sanitizeKey(providerKey);
  const aliases = [clean];
  if (clean.startsWith('brapi')) aliases.push('brapi', 'brapi_b3', 'brapi_quote');
  if (clean.includes('home_assistant') || clean.includes('hass')) aliases.push('home_assistant');
  if (clean.includes('gmail')) aliases.push('gmail', 'google_gmail');
  if (clean.includes('calendar')) aliases.push('google_calendar', 'calendar');
  if (clean.includes('drive')) aliases.push('google_drive', 'drive');
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

/**
 * Renovador automático de Access Token OAuth2 para o Ecossistema Google
 */
export async function getGoogleAccessToken(): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Credenciais Google OAuth2 não configuradas no arquivo .env');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Falha ao renovar o Access Token do Google.');
  }

  return data.access_token;
}

/**
 * Executor Central de Conectores Externos
 */
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

  const key = rawKey.startsWith('brapi')
    ? 'brapi'
    : rawKey.includes('home_assistant') || rawKey.includes('hass')
    ? 'home_assistant'
    : rawKey.includes('gmail')
    ? 'gmail'
    : rawKey.includes('calendar')
    ? 'google_calendar'
    : rawKey.includes('drive')
    ? 'google_drive'
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

      rawHaUrl = rawHaUrl.replace(/\/api(\/states|\/services.*)?$/i, '');
      const haBaseApi = `${rawHaUrl}/api`;

      const haToken = token || (process.env.HOME_ASSISTANT_TOKEN || '').trim();
      if (!haToken) {
        throw new Error(
          'Token Long-Lived do Home Assistant não configurado. Informe o token no painel de Conexões Externas.'
        );
      }

      const headers = {
        Authorization: `Bearer ${haToken}`,
        'Content-Type': 'application/json'
      };

      const act = String(payload.action || action || payload.service || '')
        .toLowerCase()
        .trim();
      const entityId = String(payload.entity_id || payload.entityId || payload.target || '').trim();

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
          throw new Error(`Home Assistant retornou HTTP ${res.status}: ${JSON.stringify(data)}`);
        }
        return {
          success: true,
          provider: 'home_assistant',
          action: `${domain}.${service}`,
          entity_id: entityId || 'all',
          data
        };
      }

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
        throw new Error(`Falha ao consultar Home Assistant (HTTP ${res.status}) em ${stateUrl}`);
      }

      if (Array.isArray(data) && (payload.query || payload.task_details)) {
        const q = String(payload.query || payload.task_details).toLowerCase().trim();
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

    // --------------------------------------------------------------------------
    // GMAIL: LEITURA, ENVIO E EXCLUSÃO VITALÍCIOS
    // --------------------------------------------------------------------------
    case 'gmail': {
      const accessToken = await getGoogleAccessToken();
      const currentAction = String(action || payload.action || 'read_inbox').toLowerCase();

      // 1. Excluir mensagem / Mover para a Lixeira
      if (currentAction === 'trash_message' || currentAction === 'delete_message') {
        const msgId = payload.id || payload.messageId;
        if (!msgId) {
          throw new Error('Parâmetro id ou messageId é obrigatório para mover e-mail para a lixeira.');
        }

        const trashRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/trash`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );
        if (!trashRes.ok) {
          const errData: any = await trashRes.json().catch(() => ({}));
          throw new Error(errData.error?.message || 'Falha ao mover mensagem para a lixeira.');
        }
        return { success: true, provider: 'gmail', action: 'trash_message', messageId: msgId };
      }

      // 2. Enviar e-mail
      if (currentAction === 'send_email') {
        if (!payload.to) {
          throw new Error('Parâmetro to (destinatário) é obrigatório para envio de e-mail.');
        }

        const rawMessage = Buffer.from(
          `To: ${payload.to}\r\nSubject: =?utf-8?B?${Buffer.from(payload.subject || 'JARVIS').toString('base64')}?=\r\nContent-Type: text/plain; charset="UTF-8"\r\nMIME-Version: 1.0\r\n\r\n${payload.body || payload.text || ''}`
        )
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ raw: rawMessage })
        });
        const sendData: any = await sendRes.json().catch(() => ({}));
        if (!sendRes.ok) throw new Error(sendData.error?.message || 'Erro ao enviar e-mail.');
        return { success: true, provider: 'gmail', action: 'send_email', data: sendData };
      }

      // 3. Ler mensagens / Caixa de entrada
      const max = Number(payload.maxResults || 5);
      const q = payload.query ? `&q=${encodeURIComponent(payload.query)}` : '';
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}${q}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const listData: any = await listRes.json().catch(() => ({}));
      if (!listRes.ok) throw new Error(listData.error?.message || 'Erro ao consultar Gmail.');

      const messages = listData.messages || [];
      if (messages.length === 0) {
        return { success: true, provider: 'gmail', count: 0, messages: [], text: 'Nenhum e-mail encontrado.' };
      }

      const details = await Promise.all(
        messages.slice(0, max).map(async (msg: any) => {
          const itemRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const itemData: any = await itemRes.json().catch(() => ({}));
          const headers = itemData.payload?.headers || [];
          const getHeader = (name: string) =>
            headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

          return {
            id: msg.id,
            threadId: msg.threadId,
            subject: getHeader('Subject') || '(Sem assunto)',
            from: getHeader('From') || '(Remetente desconhecido)',
            date: getHeader('Date') || '',
            snippet: itemData.snippet || ''
          };
        })
      );
      return { success: true, provider: 'gmail', action: 'read_inbox', total: details.length, messages: details };
    }

    // --------------------------------------------------------------------------
    // GOOGLE CALENDAR: LISTAR E CRIAR EVENTOS
    // --------------------------------------------------------------------------
    case 'google_calendar': {
      const accessToken = await getGoogleAccessToken();

      if (action === 'create_event') {
        const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            summary: payload.summary || payload.title || 'Evento JARVIS',
            description: payload.description || 'Criado via JARVIS Automação',
            start: { dateTime: payload.startTime || new Date().toISOString() },
            end: { dateTime: payload.endTime || new Date(Date.now() + 3600000).toISOString() }
          })
        });
        const data = await res.json().catch(() => ({}));
        return { success: true, provider: 'google_calendar', event: data };
      }

      const timeMin = payload.timeMin || new Date().toISOString();
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10&orderBy=startTime&singleEvents=true&timeMin=${encodeURIComponent(timeMin)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data: any = await res.json().catch(() => ({}));
      return { success: true, provider: 'google_calendar', events: data.items || [] };
    }

    // --------------------------------------------------------------------------
    // GOOGLE DRIVE: LISTAGEM E PESQUISA DE ARQUIVOS
    // --------------------------------------------------------------------------
    case 'google_drive': {
      const accessToken = await getGoogleAccessToken();
      const q = payload.query ? `&q=${encodeURIComponent(payload.query)}` : '';
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?pageSize=10&fields=files(id,name,mimeType,modifiedTime)${q}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data: any = await res.json().catch(() => ({}));
      return { success: true, provider: 'google_drive', files: data.files || [] };
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

    // =========================================================================
    // GOOGLE DRIVE: LISTAR, BUSCAR, CRIAR PASTAS, UPLOAD E EXCLUSÃO
    // =========================================================================
    case 'google_drive': {
      const accessToken = await getGoogleAccessToken();
      const currentAction = String(action || payload.action || 'list_files').toLowerCase();

      // 1. CRIAR NOVA PASTA NO DRIVE
      if (currentAction === 'create_folder') {
        const folderName = payload.name || payload.folderName || 'Nova Pasta JARVIS';
        const folderMetadata: Record<string, any> = {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder'
        };
        if (payload.parentId) {
          folderMetadata.parents = [payload.parentId];
        }

        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(folderMetadata)
        });

        const folderData: any = await createRes.json().catch(() => ({}));
        if (!createRes.ok) throw new Error(folderData.error?.message || 'Falha ao criar pasta no Drive.');
        return { success: true, provider: 'google_drive', action: 'create_folder', folder: folderData };
      }

      // 2. UPLOAD DE ARQUIVO (TEXTO / MARKDOWN / JSON / RELATÓRIO)
      if (currentAction === 'upload_file' || currentAction === 'upload_text_file') {
        const fileName = payload.name || payload.fileName || `jarvis_log_${Date.now()}.txt`;
        const fileContent = payload.content || payload.body || payload.text || '';
        const mimeType = payload.mimeType || 'text/plain; charset=UTF-8';

        const boundary = '-------314159265358979323846';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelimiter = `\r\n--${boundary}--`;

        const metadata: Record<string, any> = {
          name: fileName,
          mimeType: mimeType.split(';')[0]
        };
        if (payload.parentId) {
          metadata.parents = [payload.parentId];
        }

        const multipartRequestBody =
          delimiter +
          'Content-Type: application/json\r\n\r\n' +
          JSON.stringify(metadata) +
          delimiter +
          `Content-Type: ${mimeType}\r\n\r\n` +
          fileContent +
          closeDelimiter;

        const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
          },
          body: multipartRequestBody
        });

        const uploadData: any = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok) throw new Error(uploadData.error?.message || 'Falha ao enviar arquivo para o Drive.');
        return { success: true, provider: 'google_drive', action: 'upload_file', file: uploadData };
      }

      // 3. MOVER ARQUIVO PARA A LIXEIRA
      if (currentAction === 'trash_file' || currentAction === 'delete_file') {
        const fileId = payload.id || payload.fileId;
        if (!fileId) throw new Error('Parâmetro fileId ou id é obrigatório para exclusão.');

        const trashRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!trashRes.ok && trashRes.status !== 204) {
          const errData: any = await trashRes.json().catch(() => ({}));
          throw new Error(errData.error?.message || 'Falha ao mover arquivo para a lixeira.');
        }
        return { success: true, provider: 'google_drive', action: 'trash_file', fileId };
      }

      // 4. AÇÃO PADRÃO: LISTAGEM E PESQUISA DE ARQUIVOS RECENTES
      const pageSize = Number(payload.pageSize || payload.maxResults || 10);
      let queryFilter = "trashed = false";
      if (payload.query) {
        queryFilter += ` and name contains '${payload.query.replace(/'/g, "\\'")}'`;
      }

      const listRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?pageSize=${pageSize}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&q=${encodeURIComponent(queryFilter)}&orderBy=modifiedTime desc`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      const listData: any = await listRes.json().catch(() => ({}));
      if (!listRes.ok) throw new Error(listData.error?.message || 'Falha ao listar arquivos do Google Drive.');

      return {
        success: true,
        provider: 'google_drive',
        action: 'list_files',
        total: (listData.files || []).length,
        files: listData.files || []
      };
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

/**
 * Adaptador universal compatível com ambas as chamadas:
 * - executeNodeIntegration(agentOrSlug, payload)
 * - executeProtocolOrIntegration(providerKey, options)
 */
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

  return executeExternalConnector({
    providerKey: slug || 'custom',
    action: flatPayload.action || 'execute',
    payload: {
      ...flatPayload,
      endpoint: endpoint || undefined,
      auth_token: agentOrSlug?.auth_token || agentOrSlug?.api_key || undefined
    }
  });
}

export async function executeProtocolOrIntegration(
  arg1: string | IntegrationRequestPayload,
  arg2?: any
): Promise<any> {
  if (typeof arg1 === 'string') {
    const rawAction = arg2?.action || arg2?.body?.action || (arg1.includes('gmail') ? 'read_inbox' : 'execute');
    const flatPayload = {
      ...(typeof arg2?.body === 'object' ? arg2.body : {}),
      ...(typeof arg2 === 'object' ? arg2 : {})
    };
    return executeExternalConnector({
      providerKey: arg1,
      action: rawAction,
      payload: flatPayload
    });
  }
  return executeExternalConnector(arg1);
}

export default {
  executeExternalConnector,
  executeNodeIntegration,
  executeProtocolOrIntegration,
  getConnectorConfig,
  getGoogleAccessToken,
  extractCleanTicker
};
