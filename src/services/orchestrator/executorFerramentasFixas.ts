// src/services/orchestrator/executorFerramentasFixas.ts
import { pool } from '../../config/database.js';
import { searchVectorDocuments } from '../ragService.js';
import { executeProtocolOrIntegration } from '../integrationAndProtocolService.js';
import { obterTokenAcessoGoogle, obterConfiguracaoConector } from '../integrationService.js';
import { executeSshCommand, readRemoteFileViaSshToRag } from '../sshService.js';
import { SupportedProtocolOrPlatform, sanitizeToolName } from './brainConfigAndUtils.js';
import { saveToDatabase } from './catalogAndDatabase.js';
import { normalizarTexto } from './motorInferencaLLM.js';
import { executarConectorApiUniversal } from './executorConectorApi.js';

/**
 * Despachante Universal do Home Assistant (Zero Hardcode)
 * Suporta leitura completa de sensores (/api/states) e execução de qualquer
 * domínio/serviço (climate, switch, light, vacuum, cover, homeassistant) com 1 ou mais entity_ids.
 */
async function despacharHomeAssistantUniversal(
  chaveLimpa: string,
  args: Record<string, any>,
  userPrompt: string,
  baseUrl: string,
  headers: Record<string, string>,
  endpointConfigurado: string
): Promise<any> {
  const promptNorm = normalizarTexto(userPrompt);
  const serviceDataBruto =
    args?.service_data && typeof args.service_data === 'object' ? args.service_data : {};

  const payloadUnificado: Record<string, any> = {
    ...args,
    ...serviceDataBruto
  };

  const ehToolDetector =
    chaveLimpa.includes('detector') ||
    chaveLimpa.includes('sensor') ||
    chaveLimpa.includes('estado') ||
    chaveLimpa.includes('state');

  const temParametroMutacao =
    payloadUnificado.domain !== undefined ||
    payloadUnificado.service !== undefined ||
    payloadUnificado.temperature !== undefined ||
    payloadUnificado.hvac_mode !== undefined ||
    payloadUnificado.fan_mode !== undefined ||
    payloadUnificado.swing_mode !== undefined ||
    payloadUnificado.preset_mode !== undefined ||
    payloadUnificado.humidity !== undefined ||
    payloadUnificado.action !== undefined;

  // 1. Consulta de Sensores e Estados (/api/states)
  if (ehToolDetector && !temParametroMutacao) {
    const respEstados = await fetch(`${baseUrl}/api/states`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000)
    });
    const todosEstados: any[] = await respEstados.json().catch(() => []);
    if (!Array.isArray(todosEstados)) {
      return { status: 'error', message: 'Resposta inválida do Home Assistant em /api/states' };
    }

    const filtroTexto = normalizarTexto(
      String(args?.entity_id || args?.query || args?.device || '')
    );

    const dispositivos = todosEstados
      .filter((st) =>
        /^(climate|light|switch|fan|cover|remote|media_player|sensor|binary_sensor|vacuum)\./.test(
          st.entity_id || ''
        )
      )
      .map((st) => ({
        entity_id: st.entity_id,
        name: st.attributes?.friendly_name || st.entity_id,
        state: st.state,
        current_temperature: st.attributes?.current_temperature,
        target_temperature: st.attributes?.temperature,
        hvac_mode: st.attributes?.hvac_mode || st.state,
        hvac_modes: st.attributes?.hvac_modes,
        fan_mode: st.attributes?.fan_mode,
        swing_mode: st.attributes?.swing_mode,
        preset_mode: st.attributes?.preset_mode,
        humidity: st.attributes?.current_humidity ?? st.attributes?.humidity,
        unit: st.attributes?.unit_of_measurement
      }));

    if (filtroTexto && filtroTexto.length >= 3) {
      const filtrados = dispositivos.filter(
        (d) =>
          normalizarTexto(d.entity_id).includes(filtroTexto) ||
          normalizarTexto(d.name).includes(filtroTexto)
      );
      if (filtrados.length > 0) {
        return { status: 'success', count: filtrados.length, devices: filtrados };
      }
    }

    return { status: 'success', total_devices: dispositivos.length, devices: dispositivos };
  }

  // 2. Extração de Entidades Alvo
  let entidadesAlvo: string[] = [];
  const rawEntity = payloadUnificado.entity_id || payloadUnificado.entities || payloadUnificado.target;

  if (Array.isArray(rawEntity)) {
    entidadesAlvo = rawEntity.map((e) => String(e).trim()).filter(Boolean);
  } else if (typeof rawEntity === 'string' && rawEntity.trim().length > 0) {
    entidadesAlvo = rawEntity
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
  }

  if (entidadesAlvo.length === 0) {
    try {
      const respEstados = await fetch(`${baseUrl}/api/states`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(8000)
      });
      const todosEstados: any[] = await respEstados.json().catch(() => []);
      if (Array.isArray(todosEstados)) {
        const correspondentes = todosEstados.filter((st) => {
          const idNorm = normalizarTexto(st.entity_id || '');
          const nomeNorm = normalizarTexto(st.attributes?.friendly_name || '');
          return (
            (nomeNorm.length >= 4 && promptNorm.includes(nomeNorm)) ||
            (idNorm.length >= 4 && promptNorm.includes(idNorm))
          );
        });
        entidadesAlvo = correspondentes.map((c) => c.entity_id);
      }
    } catch {}
  }

  // 3. Resolução Dinâmica de Domínio e Serviço
  const primeiraEntidade = entidadesAlvo[0] || '';
  const dominioDaEntidade = primeiraEntidade.includes('.')
    ? primeiraEntidade.split('.')[0]
    : 'homeassistant';

  let domain = String(payloadUnificado.domain || '').toLowerCase().trim();
  let service = String(payloadUnificado.service || payloadUnificado.action || '').toLowerCase().trim();

  if (service.includes('.')) {
    const partes = service.split('.');
    domain = domain || partes[0];
    service = partes[1];
  }

  const temTemp =
    payloadUnificado.temperature !== undefined && payloadUnificado.temperature !== null;
  const temHvac = Boolean(payloadUnificado.hvac_mode);
  const temFan = Boolean(payloadUnificado.fan_mode);
  const temSwing = Boolean(payloadUnificado.swing_mode);
  const temPreset = Boolean(payloadUnificado.preset_mode);
  const temHumidity =
    payloadUnificado.humidity !== undefined && payloadUnificado.humidity !== null;

  if (!domain) {
    if (temTemp || temHvac || temFan || temSwing || temPreset || temHumidity || dominioDaEntidade === 'climate') {
      domain = 'climate';
    } else if (entidadesAlvo.length > 1) {
      domain = 'homeassistant';
    } else {
      domain = dominioDaEntidade || 'homeassistant';
    }
  }

  if (!service || service === 'execute') {
    if (domain === 'climate') {
      if (temTemp) service = 'set_temperature';
      else if (temHvac) service = 'set_hvac_mode';
      else if (temFan) service = 'set_fan_mode';
      else if (temSwing) service = 'set_swing_mode';
      else if (temPreset) service = 'set_preset_mode';
      else if (temHumidity) service = 'set_humidity';
      else if (/(desligar|desligue|apagar|apague|off)/i.test(promptNorm)) service = 'turn_off';
      else service = 'turn_on';
    } else {
      if (/(desligar|desligue|apagar|apague|fechar|off)/i.test(promptNorm)) {
        service = 'turn_off';
      } else if (/(ligar|ligue|acender|acenda|abrir|on)/i.test(promptNorm)) {
        service = 'turn_on';
      } else if (String(endpointConfigurado).endsWith('/toggle')) {
        service = 'toggle';
      } else {
        service = 'turn_on';
      }
    }
  }

  // 4. Montagem do Corpo da Requisição
  const corpoServico: Record<string, any> = {};
  if (entidadesAlvo.length === 1) {
    corpoServico.entity_id = entidadesAlvo[0];
  } else if (entidadesAlvo.length > 1) {
    corpoServico.entity_id = entidadesAlvo;
  }

  const camposReservados = new Set([
    'domain',
    'service',
    'action',
    'service_data',
    'entity_id',
    'entities',
    'target',
    'query',
    'symbol',
    'task_details',
    'input',
    'endpoint',
    'method',
    'auth_token'
  ]);

  for (const [k, v] of Object.entries(payloadUnificado)) {
    if (!camposReservados.has(k) && v !== undefined && v !== null && v !== '') {
      corpoServico[k] = k === 'temperature' || k === 'humidity' ? Number(v) : v;
    }
  }

  const resultadosDisparo: any[] = [];

  if (domain === 'climate' && service === 'set_temperature' && temFan) {
    const urlFan = `${baseUrl}/api/services/climate/set_fan_mode`;
    await fetch(urlFan, {
      method: 'POST',
      headers,
      body: JSON.stringify({ entity_id: corpoServico.entity_id, fan_mode: corpoServico.fan_mode }),
      signal: AbortSignal.timeout(8000)
    }).catch(() => {});
    delete corpoServico.fan_mode;
  }

  const urlServico = `${baseUrl}/api/services/${domain}/${service}`;
  const execRes = await fetch(urlServico, {
    method: 'POST',
    headers,
    body: JSON.stringify(corpoServico),
    signal: AbortSignal.timeout(10000)
  });

  const respostaTexto = await execRes.text();
  let dadosRetorno: any;
  try {
    dadosRetorno = JSON.parse(respostaTexto);
  } catch {
    dadosRetorno = { raw: respostaTexto };
  }

  resultadosDisparo.push({
    url: urlServico,
    http_status: execRes.status,
    ok: execRes.ok,
    payload_sent: corpoServico,
    response: dadosRetorno
  });

  return {
    status: execRes.ok ? 'executed' : 'error',
    domain,
    service,
    entities: entidadesAlvo,
    details: resultadosDisparo
  };
}

export async function executarFerramentaVinculada(
  toolKey: string,
  args: Record<string, any>,
  userPrompt: string,
  connectorsMap: Map<string, any>,
  serverBaseUrl: string
): Promise<any> {
  const chaveLimpa = sanitizeToolName(toolKey);
  const valorConsulta = String(
    args?.query || args?.symbol || args?.task_details || args?.input || userPrompt
  ).trim();
  const promptNormalizado = normalizarTexto(userPrompt);

  // 1. GESTÃO E CONSULTA DIRETA DE CONTATOS (AGENDA)
  const ehConsultaContato =
    chaveLimpa === 'consultar_contato' ||
    chaveLimpa === 'buscar_contato' ||
    chaveLimpa === 'obter_contato' ||
    chaveLimpa === 'agenda_de_contatos' ||
    chaveLimpa === 'agenda_contatos';

  if (ehConsultaContato) {
    const termoBusca = normalizarTexto(
      String(args?.nome || args?.contato || args?.target || valorConsulta || '')
    );
    try {
      const res = await pool.query(
        `SELECT nome, telefone, apelidos 
         FROM contatos_agenda 
         WHERE LOWER(nome) = LOWER($1) 
            OR $1 = ANY(apelidos) 
            OR LOWER(nome) LIKE '%' || LOWER($1) || '%' 
         LIMIT 1;`,
        [termoBusca]
      );

      if (res.rows.length > 0) {
        const c = res.rows[0];
        return {
          status: 'success',
          encontrado: true,
          contato: c.nome,
          telefone: c.telefone,
          number: c.telefone,
          recipientId: c.telefone
        };
      }

      // Fallback: consulta na tabela dynamic_collections caso tenha sido salvo por lá
      const resDyn = await pool.query(
        `SELECT document_data FROM dynamic_collections 
         WHERE collection_name = 'contatos_agenda' 
           AND (LOWER(document_data->>'nome') LIKE '%' || LOWER($1) || '%' 
                OR LOWER(document_data->>'contato') LIKE '%' || LOWER($1) || '%')
         LIMIT 1;`,
        [termoBusca]
      );

      if (resDyn.rows.length > 0) {
        const doc = resDyn.rows[0].document_data;
        const tel = doc.telefone || doc.number || doc.phone;
        return {
          status: 'success',
          encontrado: true,
          contato: doc.nome || termoBusca,
          telefone: tel,
          number: tel,
          recipientId: tel
        };
      }

      return {
        status: 'not_found',
        encontrado: false,
        mensagem: `Contato '${termoBusca}' não localizado na agenda.`
      };
    } catch (err: any) {
      return { status: 'error', message: err.message };
    }
  }

  // 2. BANCO DE DADOS DINÂMICO (GRAVAÇÃO DEDICADA EM contatos_agenda E dynamic_collections)
  if (chaveLimpa === 'save_to_database' || chaveLimpa === 'dynamicdatabasetool') {
    const dados = args?.documentData || args;
    const nomeIdentificado = dados?.nome || dados?.contato || dados?.name;
    const foneIdentificado = dados?.telefone || dados?.number || dados?.phone;

    if (foneIdentificado || args?.collectionName === 'contatos_agenda') {
      try {
        const nomeNorm = normalizarTexto(String(nomeIdentificado || ''));
        const foneLimpo = String(foneIdentificado || '').replace(/\D/g, '');
        let foneFinal = foneLimpo;

        if (foneFinal.length === 8 || foneFinal.length === 9) {
          foneFinal = `5567${foneFinal.length === 8 ? '9' + foneFinal : foneFinal}`;
        } else if (foneFinal.length === 10 || foneFinal.length === 11) {
          foneFinal = `55${foneFinal}`;
        } else if (!foneFinal.startsWith('55') && foneFinal.length > 0) {
          foneFinal = `55${foneFinal}`;
        }

        if (nomeNorm && foneFinal) {
          await pool.query(
            `INSERT INTO contatos_agenda (nome, telefone, apelidos)
             VALUES ($1, $2, ARRAY[$3])
             ON CONFLICT (nome) DO UPDATE 
             SET telefone = EXCLUDED.telefone, atualizado_em = NOW();`,
            [nomeNorm, foneFinal, String(nomeIdentificado || nomeNorm)]
          );
        }
      } catch (e: any) {
        console.warn('⚠️ [Agenda] Falha ao espelhar em contatos_agenda:', e?.message);
      }
    }

    return await saveToDatabase({
      collectionName: sanitizeToolName(args?.collectionName || 'contatos_agenda'),
      documentData:
        typeof args?.documentData === 'object'
          ? args.documentData
          : { query: valorConsulta, raw: args },
      decisionReasoning: args?.decisionReasoning || 'Gravado via Tool Calling do Agente'
    });
  }

  // 3. RAG VETORIAL
  if (
    chaveLimpa === 'vector_rag' ||
    chaveLimpa === 'rag_search' ||
    chaveLimpa === 'consultar_base_rag'
  ) {
    const docs = await searchVectorDocuments(valorConsulta, 4).catch(() => []);
    return { matches: docs };
  }

  // 4. TERMINAL SSH
  if (
    chaveLimpa === 'execute_ssh_command' ||
    chaveLimpa === 'ssh_terminal' ||
    chaveLimpa === 'executar_comando_ssh'
  ) {
    if (args?.remoteFilePath) {
      return await readRemoteFileViaSshToRag({ remoteFilePath: String(args.remoteFilePath) });
    }
    return await executeSshCommand(args?.command || valorConsulta || 'uptime');
  }

  // 5. CHAMADA DIRETA UNIVERSAL GOOGLE WORKSPACE
  if (
    (chaveLimpa.includes('google') ||
      chaveLimpa.includes('gmail') ||
      chaveLimpa.includes('calendar') ||
      chaveLimpa.includes('drive')) &&
    args?.endpointPath
  ) {
    try {
      const accessToken = await obterTokenAcessoGoogle();
      const rawPath = String(args.endpointPath).trim();
      let url = rawPath.startsWith('http')
        ? rawPath
        : `https://www.googleapis.com/${rawPath.replace(/^\/+/, '')}`;

      if (args.queryParams && typeof args.queryParams === 'object') {
        const sp = new URLSearchParams();
        for (const [k, v] of Object.entries(args.queryParams)) {
          if (v !== undefined && v !== null) sp.append(k, String(v));
        }
        const qs = sp.toString();
        if (qs) url += (url.includes('?') ? '&' : '?') + qs;
      }

      const method = String(args.method || 'GET').toUpperCase();
      const bodyObj = args.bodyData || args.body;
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: bodyObj && method !== 'GET' ? JSON.stringify(bodyObj) : undefined,
        signal: AbortSignal.timeout(15000)
      });

      const txt = await res.text();
      try {
        return JSON.parse(txt);
      } catch {
        return { status: res.status, raw: txt };
      }
    } catch (err: any) {
      return { error: err.message, tool: chaveLimpa };
    }
  }

  // 6. ECOSSISTEMA NATIVO GOOGLE, BRAPI B3 E MENSAGERIA
  const ehGoogleCalendar =
    chaveLimpa.includes('calendar') ||
    (chaveLimpa.includes('agenda') && !chaveLimpa.includes('contat'));

  const ehConectorNativoIntegrado =
    chaveLimpa.includes('gmail') ||
    ehGoogleCalendar ||
    chaveLimpa.includes('drive') ||
    chaveLimpa.includes('brapi') ||
    chaveLimpa.includes('telegram') ||
    chaveLimpa.includes('whatsapp') ||
    chaveLimpa.includes('outlook');

  if (ehConectorNativoIntegrado) {
    let acaoAlvo = String(args?.action || args?.service || '').toLowerCase().trim();

    // Auto-resolução de nome de contato para número caso o WhatsApp receba texto
    if (chaveLimpa.includes('whatsapp')) {
      let dest = String(args?.to || args?.recipientId || args?.number || args?.target || '').trim();
      const apenasDigitos = dest.replace(/\D/g, '');

      if (dest && (apenasDigitos.length < 10 || !/^\d+$/.test(dest))) {
        const termoNorm = normalizarTexto(dest);
        try {
          const resCont = await pool.query(
            `SELECT telefone FROM contatos_agenda 
             WHERE LOWER(nome) = LOWER($1) OR $1 = ANY(apelidos) OR LOWER(nome) LIKE '%' || LOWER($1) || '%' 
             LIMIT 1;`,
            [termoNorm]
          );
          if (resCont.rows.length > 0 && resCont.rows[0].telefone) {
            const foneEncontrado = resCont.rows[0].telefone;
            args.to = foneEncontrado;
            args.recipientId = foneEncontrado;
            args.number = foneEncontrado;
          }
        } catch {}
      }
    }

    let queryGmail = args?.query || args?.busca || '';
    if (chaveLimpa.includes('gmail')) {
      if (!acaoAlvo) {
        if (/enviar|send|responder|reply/i.test(promptNormalizado) || args?.to) {
          acaoAlvo = 'send_email';
        } else if (/lixeira|trash|delete|excluir|apagar/i.test(promptNormalizado)) {
          acaoAlvo = 'trash_message';
        } else {
          acaoAlvo = 'read_inbox';
        }
      }
      if (
        !queryGmail &&
        /não lido|nao lido|unread/i.test(promptNormalizado + ' ' + String(args?.task_details || ''))
      ) {
        queryGmail = 'is:unread';
      }
    }

    if (ehGoogleCalendar && !acaoAlvo) {
      acaoAlvo = /agendar|criar|novo|schedule|create|marcar/i.test(promptNormalizado)
        ? 'create_event'
        : 'list_events';
    }

    if (chaveLimpa.includes('drive') && !acaoAlvo) {
      acaoAlvo = /upload|enviar|salvar|criar/i.test(promptNormalizado)
        ? 'upload_file'
        : 'list_files';
    }

    const payloadIntegracao = {
      ...args,
      ...(typeof args?.params === 'object' ? args.params : {}),
      ...(typeof args?.service_data === 'object' ? args.service_data : {}),
      action: acaoAlvo || 'execute',
      query: queryGmail || args?.query || (chaveLimpa.includes('gmail') ? '' : valorConsulta)
    };

    return await executeProtocolOrIntegration(chaveLimpa, {
      protocol: (chaveLimpa as SupportedProtocolOrPlatform) || 'rest_api',
      endpoint: args?.endpoint,
      method: args?.method || 'POST',
      body: payloadIntegracao,
      prompt: userPrompt
    }).catch((err: any) => ({ error: err.message, tool: chaveLimpa }));
  }

  const customConn = connectorsMap?.get(chaveLimpa);
  const cfg = customConn?.config || {};

  // 7. HOME ASSISTANT / DISPOSITIVOS IOT
  const ehDispositivoCasa =
    chaveLimpa.includes('home_assistant') ||
    chaveLimpa.includes('hass') ||
    chaveLimpa.includes('detector') ||
    chaveLimpa.includes('sensor') ||
    chaveLimpa.includes('dispositivo') ||
    chaveLimpa.includes('casa');

  if (ehDispositivoCasa) {
    const dbCfg = await obterConfiguracaoConector('home_assistant').catch(() => ({} as any));

    const endpointAlvo =
      cfg.endpoint_url ||
      customConn?.endpoint_url ||
      dbCfg.endpoint_url ||
      args?.endpoint ||
      process.env.HOME_ASSISTANT_URL ||
      'http://163.176.111.18:8123/api/states';

    const token =
      cfg.auth_token ||
      cfg.access_token ||
      cfg.api_key ||
      customConn?.auth_token ||
      dbCfg.auth_token ||
      dbCfg.api_key ||
      process.env.HOME_ASSISTANT_TOKEN ||
      process.env.HA_TOKEN ||
      args?.auth_token ||
      '';

    const baseUrl = String(endpointAlvo).split('/api')[0].replace(/\/+$/, '');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      const cleanToken = String(token).replace(/^Bearer\s+/i, '').trim();
      headers['Authorization'] = `Bearer ${cleanToken}`;
    }

    try {
      return await despacharHomeAssistantUniversal(
        chaveLimpa,
        args || {},
        userPrompt,
        baseUrl,
        headers,
        endpointAlvo
      );
    } catch (err: any) {
      return { status: 'error', message: err.message, tool: chaveLimpa };
    }
  }

  // 8. CONECTOR HTTP / REST UNIVERSAL
  return await executarConectorApiUniversal(
    customConn || chaveLimpa,
    args || {},
    userPrompt,
    serverBaseUrl
  );
}

export const executeBoundTool = executarFerramentaVinculada;
export default { executarFerramentaVinculada, executeBoundTool };
