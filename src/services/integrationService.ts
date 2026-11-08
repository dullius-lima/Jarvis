// src/services/integrationService.ts
import { pool } from '../config/database.js';
import { executeMcpToolCall } from './mcpHfService.js';

export interface CargaRequisicaoIntegracao {
  providerKey: string;
  action?: string;
  payload?: any;
}

// Mantém retrocompatibilidade de tipos caso outros arquivos importem a interface antiga
export type IntegrationRequestPayload = CargaRequisicaoIntegracao;

/**
 * Sanitiza a chave ou identificador do provedor
 */
function sanitizarChave(valorBruto: string): string {
  return String(valorBruto || '')
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
export function extrairTickerLimpo(entradaBruta: string): string {
  const str = String(entradaBruta || '').trim();
  const match = str.toUpperCase().match(/\b([A-Z]{4}\d{1,2})\b/);
  if (match && match[1]) return match[1];
  return str.split(/\s+/)[0]?.toUpperCase() || 'PETR4';
}

/**
 * Busca a configuração e o token do conector no banco de dados PostgreSQL
 */
export async function obterConfiguracaoConector(chaveProvedor: string): Promise<Record<string, any>> {
  const limpa = sanitizarChave(chaveProvedor);
  const apelidos = [limpa];
  if (limpa.startsWith('brapi')) apelidos.push('brapi', 'brapi_b3', 'brapi_quote');
  if (limpa.includes('home_assistant') || limpa.includes('hass')) apelidos.push('home_assistant');
  if (limpa.includes('gmail')) apelidos.push('gmail', 'google_gmail');
  if (limpa.includes('calendar') || limpa.includes('agenda')) apelidos.push('google_calendar', 'calendar');
  if (limpa.includes('drive')) apelidos.push('google_drive', 'drive');
  if (limpa.includes('outlook')) apelidos.push('outlook', 'microsoft_outlook');
  if (limpa.includes('telegram')) apelidos.push('telegram', 'telegram_bot');
  if (limpa.includes('whatsapp')) apelidos.push('whatsapp', 'whatsapp_evolution');

  try {
    const res = await pool.query(
      'SELECT * FROM external_connectors WHERE LOWER(provider_key) = ANY($1) ORDER BY updated_at DESC LIMIT 1;',
      [apelidos]
    );
    if (res.rows.length > 0) {
      const linha = res.rows[0];
      const cfg =
        typeof linha.config === 'string'
          ? JSON.parse(linha.config || '{}')
          : linha.config || {};
      return {
        ...cfg,
        provider_key: linha.provider_key,
        endpoint_url: (cfg.endpoint_url || linha.endpoint_url || '').trim(),
        http_method: (cfg.http_method || linha.http_method || 'GET').toUpperCase(),
        api_key: (cfg.api_key || cfg.auth_token || linha.api_key || '').trim(),
        auth_token: (cfg.auth_token || cfg.api_key || linha.api_key || '').trim(),
        is_enabled: linha.is_enabled ?? true
      };
    }
  } catch (erro: any) {
    console.warn(`⚠️ [Serviço de Integração] Fallback de ambiente para ${chaveProvedor}:`, erro.message);
  }
  return {};
}

/**
 * Renovador automático de Access Token OAuth2 para o Ecossistema Google
 */
export async function obterTokenAcessoGoogle(): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Credenciais Google OAuth2 não configuradas no arquivo .env');
  }

  const resposta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  const dados: any = await resposta.json().catch(() => ({}));
  if (!resposta.ok || !dados.access_token) {
    throw new Error(dados.error_description || dados.error || 'Falha ao renovar o Access Token do Google.');
  }

  return dados.access_token;
}

/**
 * Executor Central de Conectores Externos
 */
export async function executarConectorExterno({
  providerKey,
  action = 'execute',
  payload = {}
}: CargaRequisicaoIntegracao): Promise<any> {
  const chaveBruta = sanitizarChave(providerKey);
  const config = await obterConfiguracaoConector(chaveBruta);
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

  const chave = chaveBruta.startsWith('brapi')
    ? 'brapi'
    : chaveBruta.includes('home_assistant') || chaveBruta.includes('hass')
    ? 'home_assistant'
    : chaveBruta.includes('gmail')
    ? 'gmail'
    : chaveBruta.includes('calendar') || chaveBruta.includes('agenda')
    ? 'google_calendar'
    : chaveBruta.includes('drive')
    ? 'google_drive'
    : chaveBruta.includes('outlook')
    ? 'outlook'
    : chaveBruta.includes('telegram')
    ? 'telegram'
    : chaveBruta.includes('whatsapp')
    ? 'whatsapp'
    : chaveBruta;

  switch (chave) {
    // --------------------------------------------------------------------------
    // BRAPI B3
    // --------------------------------------------------------------------------
    case 'brapi': {
      const tickerBruto =
        payload.symbol || payload.ticker || payload.query || payload.task_details || 'PETR4';
      const ticker = extrairTickerLimpo(tickerBruto);
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

    // --------------------------------------------------------------------------
    // HOME ASSISTANT
    // --------------------------------------------------------------------------
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
    // WHATSAPP (EVOLUTION API / BAILEYS)
    // --------------------------------------------------------------------------
    case 'whatsapp': {
      const evoUrl = (
        payload.endpoint ||
        payload.endpoint_url ||
        config.endpoint_url ||
        process.env.EVOLUTION_URL ||
        'http://127.0.0.1:8080'
      )
        .replace(/\/message\/sendText.*$/i, '')
        .replace(/\/+$/, '');

      const apiKey =
        token ||
        config.api_key ||
        config.auth_token ||
        process.env.EVOLUTION_API_KEY ||
        'jarvis-evolution-secret-2026';

      const instance =
        payload.instance ||
        payload.params?.instance ||
        config.instance_name ||
        'jarvis-whats';

      const rawTarget =
        payload.number ||
        payload.to ||
        payload.chat_id ||
        payload.destinatario ||
        payload.recipientId ||
        payload.target ||
        payload.params?.number ||
        payload.params?.to ||
        '';

      let targetNumber = String(rawTarget).replace(/\D/g, '');

      // Normaliza com DDI 55 caso informado com 10 ou 11 dígitos
      if (targetNumber.length >= 10 && targetNumber.length <= 11 && !targetNumber.startsWith('55')) {
        targetNumber = `55${targetNumber}`;
      }

      const textMessage =
        payload.text ||
        payload.message ||
        payload.mensagem ||
        payload.body ||
        payload.params?.text ||
        payload.params?.message ||
        payload.query ||
        payload.task_details ||
        'Mensagem do ecossistema JARVIS';

      if (!targetNumber) {
        throw new Error('Número de destino obrigatório para envio via WhatsApp.');
      }

      const res = await fetch(`${evoUrl}/message/sendText/${instance}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey
        },
        body: JSON.stringify({
          number: targetNumber,
          text: textMessage
        }),
        signal: AbortSignal.timeout(15000)
      });

      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        const erroMsg = data.response?.message?.[0] || data.message || `Erro HTTP ${res.status} na Evolution API`;
        throw new Error(erroMsg);
      }

      return {
        success: true,
        provider: 'whatsapp',
        destinatario: targetNumber,
        data
      };
    }

    // --------------------------------------------------------------------------
    // --------------------------------------------------------------------------
    // GMAIL (GOOGLE REST API COM OAUTH2 PERMANENTE)
    // --------------------------------------------------------------------------
    case 'gmail': {
      const accessToken = await obterTokenAcessoGoogle();
      const acaoAtual = String(action || payload.action || 'read_inbox').toLowerCase().trim();

      // 1. Enviar E-mail
      if (acaoAtual === 'send_email' || acaoAtual === 'send_message' || acaoAtual === 'enviar_email') {
        const to = payload.to || payload.destinatario || payload.para;
        const subject = payload.subject || payload.assunto || 'Mensagem do JARVIS';
        const bodyText = payload.body || payload.text || payload.mensagem || payload.corpo || '';

        if (!to) {
          throw new Error('Destinatário (to) é obrigatório para enviar e-mail via Gmail.');
        }

        const emailLines = [
          `To: ${to}`,
          'Content-Type: text/plain; charset=utf-8',
          'MIME-Version: 1.0',
          `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
          '',
          bodyText
        ];
        const rawEmail = Buffer.from(emailLines.join('\r\n'))
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
          body: JSON.stringify({ raw: rawEmail })
        });

        const sendData: any = await sendRes.json().catch(() => ({}));
        if (!sendRes.ok) {
          throw new Error(sendData.error?.message || `Erro HTTP ${sendRes.status} ao enviar e-mail.`);
        }
        return { success: true, provider: 'gmail', action: 'send_email', data: sendData };
      }

      // 2. Mover Mensagem para a Lixeira
      if (acaoAtual === 'trash_message' || acaoAtual === 'delete_message' || acaoAtual === 'excluir_email') {
        const messageId = payload.id || payload.messageId || payload.emailId;
        if (!messageId) {
          throw new Error('ID do e-mail é obrigatório para exclusão.');
        }

        const trashRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const trashData: any = await trashRes.json().catch(() => ({}));
        if (!trashRes.ok) {
          throw new Error(trashData.error?.message || `Erro HTTP ${trashRes.status} ao mover e-mail para a lixeira.`);
        }
        return { success: true, provider: 'gmail', action: 'trash_message', messageId, data: trashData };
      }

      // 3. Leitura da Caixa de Entrada (read_inbox / list_messages)
      const maxResults = Number(payload.maxResults || payload.pageSize || payload.limite || 5);
      let queryFilter = String(payload.query || payload.q || payload.busca || '').trim();

      const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}${
        queryFilter ? `&q=${encodeURIComponent(queryFilter)}` : ''
      }`;

      const listRes = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const listData: any = await listRes.json().catch(() => ({}));
      if (!listRes.ok) {
        throw new Error(listData.error?.message || `Erro HTTP ${listRes.status} ao listar mensagens do Gmail.`);
      }

      const messageList = listData.messages || [];
      const detailedMessages: any[] = [];

      for (const msg of messageList.slice(0, maxResults)) {
        try {
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const fullMsg: any = await msgRes.json();
          const headers = fullMsg.payload?.headers || [];
          const getHeader = (name: string) =>
            headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

          detailedMessages.push({
            id: fullMsg.id,
            threadId: fullMsg.threadId,
            subject: getHeader('Subject') || '(Sem Assunto)',
            from: getHeader('From') || '(Remetente Desconhecido)',
            date: getHeader('Date') || '',
            snippet: fullMsg.snippet || ''
          });
        } catch {}
      }

      return {
        success: true,
        provider: 'gmail',
        action: 'read_inbox',
        total: detailedMessages.length,
        messages: detailedMessages
      };
    }
 
   // --------------------------------------------------------------------------
    // GOOGLE CALENDAR: BLINDADO (CRIAR, EDITAR/REMARCAR, EXCLUIR E LISTAR)
    // --------------------------------------------------------------------------
    case 'google_calendar': {
      const accessToken = await obterTokenAcessoGoogle();
      const acaoAtual = String(action || payload.action || 'list_events').toLowerCase().trim();
      const calendarBase = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
      const fuso = payload.timezone || payload.params?.timezone || 'America/Campo_Grande';
      const parametros = payload.parameters || payload.params || payload;

      // Funções auxiliares de fuso e formatação segura (America/Campo_Grande UTC-4)
      const pad = (n: number) => String(n).padStart(2, '0');
      const formatarOffsetFuso = (d: Date) => {
        const ano = d.getFullYear();
        const mes = pad(d.getMonth() + 1);
        const dia = pad(d.getDate());
        const hora = pad(d.getHours());
        const min = pad(d.getMinutes());
        const seg = pad(d.getSeconds());
        return `${ano}-${mes}-${dia}T${hora}:${min}:${seg}-04:00`;
      };

      const calcularDataHora = (params: any) => {
        const dataStr = String(params.nova_data || params.data || params.date || params.dia || '').trim();
        const horaStr = String(params.novo_horario || params.horario || params.time || params.hora || '').trim();
        const inicioBruto = params.startTime || params.start || params.start_time || params.data_hora;

        let dataInicio = new Date();

        if (dataStr && horaStr) {
          // Combina data e hora separadas: ex: "2026-11-09" + "15:00"
          const iso = `${dataStr.replace(/\//g, '-')}T${horaStr.length === 5 ? `${horaStr}:00` : horaStr}`;
          const d = new Date(iso);
          if (!isNaN(d.getTime())) dataInicio = d;
        } else if (inicioBruto) {
          const d = new Date(inicioBruto);
          if (!isNaN(d.getTime())) {
            dataInicio = d;
          } else if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(String(inicioBruto).trim())) {
            const [h, m] = String(inicioBruto).trim().split(':').map(Number);
            dataInicio.setHours(h, m, 0, 0);
            if (dataInicio.getTime() < Date.now()) dataInicio.setDate(dataInicio.getDate() + 1);
          }
        } else if (horaStr && /^\d{1,2}:\d{2}(:\d{2})?$/.test(horaStr)) {
          const [h, m] = horaStr.split(':').map(Number);
          dataInicio.setHours(h, m, 0, 0);
          if (dataInicio.getTime() < Date.now()) dataInicio.setDate(dataInicio.getDate() + 1);
        } else if (dataStr) {
          const d = new Date(`${dataStr.replace(/\//g, '-')}T09:00:00`);
          if (!isNaN(d.getTime())) dataInicio = d;
        }

        const fimBruto = params.endTime || params.end || params.end_time || params.termino;
        const dataFim = fimBruto && !isNaN(new Date(fimBruto).getTime())
          ? new Date(fimBruto)
          : new Date(dataInicio.getTime() + 60 * 60 * 1000); // 1 hora padrão

        return { dataInicio, dataFim };
      };

      // ========================================================================
      // 1. EXCLUIR / CANCELAR COMPROMISSO
      // ========================================================================
      if (
        acaoAtual === 'delete_event' ||
        acaoAtual === 'delete' ||
        acaoAtual === 'remover_evento' ||
        acaoAtual === 'cancelar_evento' ||
        acaoAtual === 'excluir_evento' ||
        acaoAtual === 'cancel'
      ) {
        let eventId = String(parametros.eventId || parametros.id || parametros.event_id || '').trim();
        let tituloEvento = String(parametros.summary || parametros.title || parametros.assunto || parametros.nome || '').trim();

        // Se a LLM não tem o eventId, faz busca inteligente pelo título ou termo
        if (!eventId) {
          const termo = tituloEvento || String(parametros.query || parametros.busca || parametros.task_details || '').trim();
          if (termo) {
            const buscaUrl = `${calendarBase}?q=${encodeURIComponent(termo)}&maxResults=5&singleEvents=true`;
            const buscaRes = await fetch(buscaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
            const buscaData: any = await buscaRes.json().catch(() => ({}));
            if (buscaData.items && buscaData.items.length > 0) {
              eventId = buscaData.items[0].id;
              tituloEvento = buscaData.items[0].summary || tituloEvento;
            }
          }
        }

        if (!eventId) {
          throw new Error('Compromisso não localizado para cancelamento. Informe o ID ou o título exato.');
        }

        const delRes = await fetch(`${calendarBase}/${eventId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!delRes.ok && delRes.status !== 204) {
          const errData: any = await delRes.json().catch(() => ({}));
          throw new Error(errData.error?.message || `Erro HTTP ${delRes.status} ao remover compromisso.`);
        }

        return {
          success: true,
          provider: 'google_calendar',
          action: 'delete_event',
          eventId,
          message: `🗑️ Compromisso ${tituloEvento ? `**"${tituloEvento}"** ` : ''}cancelado e removido com sucesso da sua agenda!`
        };
      }

      // ========================================================================
      // 2. EDITAR / ATUALIZAR / REMARCAR COMPROMISSO
      // ========================================================================
      if (
        acaoAtual === 'update_event' ||
        acaoAtual === 'patch_event' ||
        acaoAtual === 'editar_evento' ||
        acaoAtual === 'remarcar_evento' ||
        acaoAtual === 'alterar_evento' ||
        acaoAtual === 'update' ||
        acaoAtual === 'patch' ||
        acaoAtual === 'remarcar'
      ) {
        let eventId = String(parametros.eventId || parametros.id || parametros.event_id || '').trim();
        let termoBusca = String(parametros.summary || parametros.title || parametros.query || parametros.assunto || '').trim();

        if (!eventId && termoBusca) {
          const buscaUrl = `${calendarBase}?q=${encodeURIComponent(termoBusca)}&maxResults=5&singleEvents=true`;
          const buscaRes = await fetch(buscaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
          const buscaData: any = await buscaRes.json().catch(() => ({}));
          if (buscaData.items && buscaData.items.length > 0) {
            eventId = buscaData.items[0].id;
          }
        }

        if (!eventId) {
          throw new Error('ID ou título do compromisso não localizado para remarcação/edição.');
        }

        const corpoPatch: any = {};
        if (parametros.novo_titulo || parametros.new_summary) {
          corpoPatch.summary = parametros.novo_titulo || parametros.new_summary;
        } else if (parametros.summary && !parametros.query) {
          corpoPatch.summary = parametros.summary;
        }

        if (parametros.description || parametros.descricao || parametros.detalhes) {
          corpoPatch.description = parametros.description || parametros.descricao || parametros.detalhes;
        }
        if (parametros.location || parametros.local || parametros.endereco) {
          corpoPatch.location = parametros.location || parametros.local || parametros.endereco;
        }

        // Se informou nova data ou horário para remarcar
        const temNovaDataOuHora =
          parametros.novo_horario ||
          parametros.nova_data ||
          parametros.startTime ||
          parametros.start ||
          parametros.horario ||
          parametros.hora ||
          parametros.data;

        if (temNovaDataOuHora) {
          const { dataInicio, dataFim } = calcularDataHora(parametros);
          corpoPatch.start = { dateTime: formatarOffsetFuso(dataInicio), timeZone: fuso };
          corpoPatch.end = { dateTime: formatarOffsetFuso(dataFim), timeZone: fuso };
        }

        const patchRes = await fetch(`${calendarBase}/${eventId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(corpoPatch)
        });

        const patchData: any = await patchRes.json().catch(() => ({}));
        if (!patchRes.ok) {
          throw new Error(patchData.error?.message || `Erro HTTP ${patchRes.status} ao atualizar compromisso.`);
        }

        const dataFormatada = patchData.start?.dateTime
          ? new Date(patchData.start.dateTime).toLocaleString('pt-BR', {
              timeZone: fuso,
              weekday: 'long',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })
          : '';

        return {
          success: true,
          provider: 'google_calendar',
          action: 'update_event',
          eventId: patchData.id,
          summary: patchData.summary,
          start: patchData.start?.dateTime,
          end: patchData.end?.dateTime,
          htmlLink: patchData.htmlLink,
          message: `✏️ Compromisso **"${patchData.summary}"** atualizado/remarcado com sucesso${dataFormatada ? ` para ${dataFormatada}` : ''}!`
        };
      }

      // ========================================================================
      // 3. CRIAR NOVO COMPROMISSO
      // ========================================================================
      if (
        acaoAtual === 'create_event' ||
        acaoAtual === 'schedule' ||
        acaoAtual === 'criar_evento' ||
        acaoAtual === 'agendar' ||
        acaoAtual === 'agendamento' ||
        acaoAtual === 'novo_evento' ||
        acaoAtual === 'insert'
      ) {
        const titulo =
          parametros.summary ||
          parametros.title ||
          parametros.assunto ||
          parametros.nome ||
          parametros.compromisso ||
          parametros.task_details ||
          parametros.query ||
          'Compromisso';

        const descricao =
          parametros.description ||
          parametros.descricao ||
          parametros.detalhes ||
          'Agendado via JARVIS.';

        const { dataInicio, dataFim } = calcularDataHora(parametros);

        const corpoEvento: any = {
          summary: titulo,
          description: descricao,
          start: {
            dateTime: formatarOffsetFuso(dataInicio),
            timeZone: fuso
          },
          end: {
            dateTime: formatarOffsetFuso(dataFim),
            timeZone: fuso
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 30 },
              { method: 'popup', minutes: 10 }
            ]
          }
        };

        if (parametros.location || parametros.local || parametros.endereco) {
          corpoEvento.location = parametros.location || parametros.local || parametros.endereco;
        }

        const respostaEvento = await fetch(calendarBase, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(corpoEvento)
        });

        const dadosRetorno: any = await respostaEvento.json().catch(() => ({}));
        if (!respostaEvento.ok) {
          throw new Error(dadosRetorno.error?.message || `Erro HTTP ${respostaEvento.status} no Google Calendar.`);
        }

        const dataFormatada = dataInicio.toLocaleString('pt-BR', {
          timeZone: fuso,
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        return {
          success: true,
          provider: 'google_calendar',
          action: 'create_event',
          eventId: dadosRetorno.id,
          summary: dadosRetorno.summary,
          start: dadosRetorno.start?.dateTime,
          end: dadosRetorno.end?.dateTime,
          htmlLink: dadosRetorno.htmlLink,
          message: `📅 Agendamento confirmado! O compromisso **"${titulo}"** foi adicionado à sua agenda para ${dataFormatada}.`
        };
      }

      // ========================================================================
      // 4. LISTAR / CONSULTAR COMPROMISSOS
      // ========================================================================
      const maxResults = Number(parametros.maxResults || parametros.pageSize || parametros.limite || 10);
      const timeMin = parametros.timeMin ? new Date(parametros.timeMin).toISOString() : new Date().toISOString();

      let urlListagem = `${calendarBase}?maxResults=${maxResults}&orderBy=startTime&singleEvents=true&timeMin=${encodeURIComponent(timeMin)}`;

      if (parametros.query || parametros.q || parametros.busca) {
        urlListagem += `&q=${encodeURIComponent(parametros.query || parametros.q || parametros.busca)}`;
      }

      const res = await fetch(urlListagem, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error?.message || `Erro HTTP ${res.status} ao listar agenda.`);
      }

      const eventos = (data.items || []).map((item: any) => ({
        id: item.id,
        summary: item.summary || '(Sem Título)',
        description: item.description || '',
        start: item.start?.dateTime || item.start?.date,
        end: item.end?.dateTime || item.end?.date,
        link: item.htmlLink
      }));

      return {
        success: true,
        provider: 'google_calendar',
        action: 'list_events',
        total: eventos.length,
        events: eventos
      };
    }

    // --------------------------------------------------------------------------
    // GOOGLE DRIVE
    // --------------------------------------------------------------------------
    case 'google_drive': {
      const accessToken = await obterTokenAcessoGoogle();
      const acaoAtual = String(action || payload.action || 'list_files').toLowerCase();

      // 1. Criar Nova Pasta
      if (acaoAtual === 'create_folder' || acaoAtual === 'criar_pasta') {
        const nomePasta = payload.name || payload.folderName || payload.nome || 'Nova Pasta JARVIS';
        const metadadosPasta: Record<string, any> = {
          name: nomePasta,
          mimeType: 'application/vnd.google-apps.folder'
        };
        if (payload.parentId || payload.pastaPaiId) {
          metadadosPasta.parents = [payload.parentId || payload.pastaPaiId];
        }

        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(metadadosPasta)
        });

        const folderData: any = await createRes.json().catch(() => ({}));
        if (!createRes.ok) throw new Error(folderData.error?.message || 'Falha ao criar pasta no Google Drive.');
        return { success: true, provider: 'google_drive', action: 'create_folder', folder: folderData };
      }

      // 2. Upload de Arquivo
      if (acaoAtual === 'upload_file' || acaoAtual === 'upload_text_file' || acaoAtual === 'enviar_arquivo') {
        const nomeArquivo = payload.name || payload.fileName || payload.nome || `jarvis_log_${Date.now()}.txt`;
        const conteudoArquivo = payload.content || payload.body || payload.text || payload.conteudo || '';
        const tipoMime = payload.mimeType || 'text/plain; charset=UTF-8';

        const boundary = '-------314159265358979323846';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelimiter = `\r\n--${boundary}--`;

        const metadados: Record<string, any> = {
          name: nomeArquivo,
          mimeType: tipoMime.split(';')[0]
        };
        if (payload.parentId || payload.pastaPaiId) {
          metadados.parents = [payload.parentId || payload.pastaPaiId];
        }

        const corpoRequisicaoMultipart =
          delimiter +
          'Content-Type: application/json\r\n\r\n' +
          JSON.stringify(metadados) +
          delimiter +
          `Content-Type: ${tipoMime}\r\n\r\n` +
          conteudoArquivo +
          closeDelimiter;

        const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
          },
          body: corpoRequisicaoMultipart
        });

        const uploadData: any = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok) throw new Error(uploadData.error?.message || 'Falha ao enviar arquivo para o Google Drive.');
        return { success: true, provider: 'google_drive', action: 'upload_file', file: uploadData };
      }

      // 3. Mover Arquivo para a Lixeira
      if (acaoAtual === 'trash_file' || acaoAtual === 'delete_file' || acaoAtual === 'excluir_arquivo') {
        const fileId = payload.id || payload.fileId || payload.arquivoId;
        if (!fileId) throw new Error('Parâmetro fileId ou id é obrigatório para exclusão.');

        const trashRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!trashRes.ok && trashRes.status !== 204) {
          const errData: any = await trashRes.json().catch(() => ({}));
          throw new Error(errData.error?.message || 'Falha ao mover arquivo para a lixeira do Drive.');
        }
        return { success: true, provider: 'google_drive', action: 'trash_file', fileId };
      }

      // 4. Listagem e Pesquisa de Arquivos
      const pageSize = Number(payload.pageSize || payload.maxResults || payload.limite || 10);
      let filtroConsulta = 'trashed = false';
      if (payload.query || payload.busca) {
        const termo = String(payload.query || payload.busca).replace(/'/g, "\\'");
        filtroConsulta += ` and name contains '${termo}'`;
      }

      const listRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?pageSize=${pageSize}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&q=${encodeURIComponent(filtroConsulta)}&orderBy=modifiedTime desc`,
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

    // --------------------------------------------------------------------------
    // MICROSOFT OUTLOOK
    // --------------------------------------------------------------------------
    case 'outlook': {
      const accessToken = token || process.env.OUTLOOK_ACCESS_TOKEN || '';
      const destinatario = payload.to || payload.destinatario || payload.para || '';
      const assunto = payload.subject || payload.assunto || 'Notificação JARVIS';
      const corpo = payload.body || payload.text || payload.corpo || '';

      const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: payload.message || {
            subject: assunto,
            body: { contentType: 'Text', content: corpo },
            toRecipients: [{ emailAddress: { address: destinatario } }]
          },
          saveToSentItems: 'true'
        })
      });
      return { success: res.ok, provider: 'outlook', status: res.status };
    }

    // --------------------------------------------------------------------------
    // GOOGLE SHEETS
    // --------------------------------------------------------------------------
    case 'google_sheets': {
      const accessToken = token || (await obterTokenAcessoGoogle().catch(() => process.env.GOOGLE_SHEETS_TOKEN || ''));
      const spreadsheetId = config.spreadsheet_id || payload.spreadsheetId || payload.planilhaId;
      const range = payload.range || payload.intervalo || 'Sheet1!A1';
      const valores = payload.values || payload.valores || [[new Date().toISOString(), JSON.stringify(payload)]];

      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: valores
          })
        }
      );
      return await res.json().catch(() => ({ success: res.ok }));
    }

    // --------------------------------------------------------------------------
    // TELEGRAM
    // --------------------------------------------------------------------------
    case 'telegram': {
      const botToken = token || process.env.TELEGRAM_BOT_TOKEN || '';
      const chatId =
        payload.chatId ||
        payload.destinatario ||
        payload.recipientId ||
        config.chat_id ||
        process.env.ADMIN_TELEGRAM_CHAT_ID ||
        '';
      const textoMensagem =
        payload.text || payload.mensagem || payload.prompt || payload.query || JSON.stringify(payload);

      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: textoMensagem
        })
      });
      return await res.json().catch(() => ({ success: res.ok }));
    }

    // --------------------------------------------------------------------------
    // PADRÃO / CONECTORES HTTP GENÉRICOS / PROTOCOLO MCP
    // --------------------------------------------------------------------------
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
      const symbolVal = extrairTickerLimpo(payload.symbol || queryVal);
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
 * Adaptador universal compatível com chamadas de 1 ou 2 parâmetros:
 * - executarIntegracaoNo(agenteOuSlug, carga)
 * - executarProtocoloOuIntegracao(chaveProvedor, opcoes)
 */
export async function executarIntegracaoNo(
  agenteOuSlug: any,
  carga: Record<string, any> = {}
): Promise<any> {
  const cargaNormalizada = {
    ...(typeof carga.body === 'object' && carga.body !== null ? carga.body : {}),
    ...carga
  };

  if (typeof agenteOuSlug === 'string') {
    return executarConectorExterno({
      providerKey: agenteOuSlug,
      action: cargaNormalizada.action || 'execute',
      payload: cargaNormalizada
    });
  }

  const slug = sanitizarChave(agenteOuSlug?.slug || agenteOuSlug?.provider || '');
  const endpoint = (cargaNormalizada.endpoint || agenteOuSlug?.endpoint_url || '').trim();

  return executarConectorExterno({
    providerKey: slug || 'custom',
    action: cargaNormalizada.action || 'execute',
    payload: {
      ...cargaNormalizada,
      endpoint: endpoint || undefined,
      auth_token: agenteOuSlug?.auth_token || agenteOuSlug?.api_key || undefined
    }
  });
}

export async function executarProtocoloOuIntegracao(
  arg1: string | CargaRequisicaoIntegracao,
  arg2?: any
): Promise<any> {
  if (typeof arg1 === 'string') {
    const acaoBruta =
      arg2?.action || arg2?.body?.action || (arg1.includes('gmail') ? 'read_inbox' : 'execute');
    const cargaNormalizada = {
      ...(typeof arg2?.body === 'object' ? arg2.body : {}),
      ...(typeof arg2 === 'object' ? arg2 : {})
    };
    return executarConectorExterno({
      providerKey: arg1,
      action: acaoBruta,
      payload: cargaNormalizada
    });
  }
  return executarConectorExterno(arg1);
}

/**
 * Agendador determinístico de compromissos no Google Calendar
 */
export async function agendarCalendarioGoogle(carga: any = {}, env: any = {}) {
  const acao = carga.action || 'create_event';
  return executarConectorExterno({
    providerKey: 'google_calendar',
    action: acao,
    payload: carga
  });
}

// ============================================================================
// ALIASES DE RETROCOMPATIBILIDADE (Garante que outros arquivos continuem funcionando)
// ============================================================================
export const executeExternalConnector = executarConectorExterno;
export const executeNodeIntegration = executarIntegracaoNo;
export const executeProtocolOrIntegration = executarProtocoloOuIntegracao;
export const getConnectorConfig = obterConfiguracaoConector;
export const getConnectorCredentials = obterConfiguracaoConector;
export const getGoogleAccessToken = obterTokenAcessoGoogle;
export const extractCleanTicker = extrairTickerLimpo;
export const scheduleCalendarHandler = agendarCalendarioGoogle;

export default {
  executarConectorExterno,
  executarIntegracaoNo,
  executarProtocoloOuIntegracao,
  obterConfiguracaoConector,
  obterTokenAcessoGoogle,
  extrairTickerLimpo,
  agendarCalendarioGoogle,
  // Nomes legados:
  executeExternalConnector,
  executeNodeIntegration,
  executeProtocolOrIntegration,
  getConnectorConfig,
  getConnectorCredentials,
  getGoogleAccessToken,
  extractCleanTicker,
  scheduleCalendarHandler
};
