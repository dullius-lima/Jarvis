// src/services/orchestrator/executorFerramentasFixas.ts
import { searchVectorDocuments } from '../ragService.js';
import { executeProtocolOrIntegration } from '../integrationAndProtocolService.js';
import { executeSshCommand, readRemoteFileViaSshToRag } from '../sshService.js';
import { SupportedProtocolOrPlatform, sanitizeToolName } from './brainConfigAndUtils.js';
import { saveToDatabase } from './catalogAndDatabase.js';
import { normalizarTexto } from './motorInferencaLLM.js';
import { executarConectorApiUniversal } from './executorConectorApi.js';

export async function executarFerramentaVinculada(
  toolKey: string,
  args: Record<string, any>,
  userPrompt: string,
  connectorsMap: Map<string, any>,
  serverBaseUrl: string
): Promise<any> {
  const chaveLimpa = sanitizeToolName(toolKey);
  const valorConsulta = String(args?.query || args?.symbol || args?.task_details || args?.input || userPrompt).trim();
  const promptNormalizado = normalizarTexto(userPrompt);

  // 1. BANCO DE DADOS DINÂMICO
  if (chaveLimpa === 'save_to_database' || chaveLimpa === 'dynamicdatabasetool') {
    return await saveToDatabase({
      collectionName: sanitizeToolName(args?.collectionName || 'jarvis_records'),
      documentData: typeof args?.documentData === 'object' ? args.documentData : { query: valorConsulta, raw: args },
      decisionReasoning: args?.decisionReasoning || 'Gravado via Tool Calling do Agente'
    });
  }

  // 2. RAG VETORIAL
  if (chaveLimpa === 'vector_rag' || chaveLimpa === 'rag_search' || chaveLimpa === 'consultar_base_rag') {
    const docs = await searchVectorDocuments(valorConsulta, 4).catch(() => []);
    return { matches: docs };
  }

  // 3. TERMINAL SSH
  if (chaveLimpa === 'execute_ssh_command' || chaveLimpa === 'ssh_terminal' || chaveLimpa === 'executar_comando_ssh') {
    if (args?.remoteFilePath) {
      return await readRemoteFileViaSshToRag({ remoteFilePath: String(args.remoteFilePath) });
    }
    return await executeSshCommand(args?.command || valorConsulta || 'uptime');
  }

  // 4. ECOSSISTEMA NATIVO GOOGLE (GMAIL, CALENDAR, DRIVE), BRAPI B3 E MENSAGERIA
  // Interceptado ANTES da checagem genérica de URL para garantir o uso de OAuth2 permanente
  const ehConectorNativoIntegrado =
    chaveLimpa.includes('gmail') ||
    chaveLimpa.includes('calendar') ||
    chaveLimpa.includes('agenda') ||
    chaveLimpa.includes('drive') ||
    chaveLimpa.includes('brapi') ||
    chaveLimpa.includes('telegram') ||
    chaveLimpa.includes('whatsapp') ||
    chaveLimpa.includes('outlook');

  if (ehConectorNativoIntegrado) {
    let acaoAlvo = String(args?.action || '').toLowerCase().trim();

    // Tratamento inteligente de ação e filtros para o Gmail
    let queryGmail = args?.query || args?.busca || '';
    if (chaveLimpa.includes('gmail')) {
      if (!acaoAlvo) {
        if (/enviar|send|responder|reply/i.test(promptNormalizado)) {
          acaoAlvo = 'send_email';
        } else if (/lixeira|trash|delete|excluir|apagar/i.test(promptNormalizado)) {
          acaoAlvo = 'trash_message';
        } else {
          acaoAlvo = 'read_inbox';
        }
      }
      // Se solicitou mensagens não lidas, injeta o filtro nativo do Gmail
      if (!queryGmail && /não lido|nao lido|unread/i.test(promptNormalizado + ' ' + String(args?.task_details || ''))) {
        queryGmail = 'is:unread';
      }
    }

    // Ação padrão para Google Calendar
  if ((chaveLimpa.includes('calendar') || chaveLimpa.includes('agenda')) && !acaoAlvo) {
    acaoAlvo = /agendar|criar|novo|schedule|create/i.test(promptNormalizado)
      ? 'create_event'
      : /deletar|excluir|cancelar|remover|delete|cancel/i.test(promptNormalizado)
      ? 'delete_event'
      : /editar|alterar|remarcar|update|patch/i.test(promptNormalizado)
      ? 'update_event'
      : 'list_events';
  }

    // Ação padrão para Google Drive
    if (chaveLimpa.includes('drive') && !acaoAlvo) {
      acaoAlvo = /upload|enviar|salvar/i.test(promptNormalizado) ? 'upload_file' : 'list_files';
    }

    const payloadIntegracao = {
      ...args,
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

  // 5. HOME ASSISTANT / DISPOSITIVOS IOT
  const ehDispositivoCasa =
    chaveLimpa.includes('home_assistant') ||
    chaveLimpa.includes('detector') ||
    chaveLimpa.includes('sensor') ||
    chaveLimpa.includes('dispositivo');

  if (ehDispositivoCasa) {
    const endpointAlvo =
      cfg.endpoint_url ||
      customConn?.endpoint_url ||
      args?.endpoint ||
      process.env.HOME_ASSISTANT_URL ||
      'http://localhost:8123/api/states';

    const token =
      cfg.auth_token ||
      cfg.access_token ||
      cfg.api_key ||
      customConn?.auth_token ||
      process.env.HOME_ASSISTANT_TOKEN ||
      args?.auth_token ||
      '';

    const baseUrl = String(endpointAlvo).split('/api')[0];
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = String(token).startsWith('Bearer ') ? String(token) : `Bearer ${token}`;

    let dispositivos: any[] = [];
    try {
      const respEstados = await fetch(`${baseUrl}/api/states`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(8000)
      });
      const todosEstados: any[] = await respEstados.json().catch(() => []);
      if (Array.isArray(todosEstados)) {
        dispositivos = todosEstados
          .filter((st) => /^(climate|light|switch|fan|cover|remote|media_player|sensor|binary_sensor)\./.test(st.entity_id || ''))
          .map((st) => ({
            entity_id: st.entity_id,
            name: st.attributes?.friendly_name || st.entity_id,
            state: st.state,
            temperature: st.attributes?.current_temperature ?? st.attributes?.temperature
          }));
      }
    } catch (err: any) {
      console.warn('⚠️ [HomeAssistant Discovery] Erro ao consultar /api/states:', err.message);
    }

    const ehAcao = /(ligar|ligue|acender|acenda|desligar|desligue|apagar|apague|fechar|abrir)/i.test(promptNormalizado);
    if (String(endpointAlvo).endsWith('/api/states') && !ehAcao) {
      return { status: 'success', total_devices: dispositivos.length, devices: dispositivos };
    }

    const ehDesligar = /(desligar|desligue|apagar|apague|fechar|off)/i.test(promptNormalizado);
    const servico = ehDesligar ? 'turn_off' : 'turn_on';

    let alvoEntidade = args?.entity_id;
    if (!alvoEntidade && dispositivos.length > 0) {
      const correspondente = dispositivos.find(
        (d) => promptNormalizado.includes(normalizarTexto(d.name)) || promptNormalizado.includes(normalizarTexto(d.entity_id))
      );
      if (correspondente) alvoEntidade = correspondente.entity_id;
      else if (dispositivos.length === 1) alvoEntidade = dispositivos[0].entity_id;
    }

    if (alvoEntidade) {
      const urlAcao = `${baseUrl}/api/services/homeassistant/${servico}`;
      const execRes = await fetch(urlAcao, {
        method: 'POST',
        headers,
        body: JSON.stringify({ entity_id: alvoEntidade }),
        signal: AbortSignal.timeout(8000)
      });
      return { status: 'executed', entity_id: alvoEntidade, result: await execRes.json().catch(() => ({})) };
    }
  }

  // 6. APIS HTTP EXTERNAS GENÉRICAS DO CATÁLOGO
  const rawEndpoint = cfg.endpoint_url || customConn?.endpoint_url || (chaveLimpa === 'http_request_universal' ? args?.endpoint || args?.url : '');
  if (rawEndpoint && String(rawEndpoint).startsWith('http')) {
    return await executarConectorApiUniversal(chaveLimpa, { query: valorConsulta, ...args }, userPrompt, serverBaseUrl);
  }

  // 7. SCRIPTS EM CÓDIGO JS PURO
  if ((cfg.tool_type === 'code' || customConn?.category === 'Code Tool') && cfg.code_snippet) {
    try {
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const fn = new AsyncFunction('query', 'args', 'env', cfg.code_snippet);
      return await fn(valorConsulta, args, { BASE_URL: serverBaseUrl });
    } catch (err: any) {
      return { error: `Erro no script do agente: ${err.message}` };
    }
  }

  return await executeProtocolOrIntegration(chaveLimpa, {
    protocol: (chaveLimpa as SupportedProtocolOrPlatform) || 'rest_api',
    endpoint: args?.endpoint,
    method: args?.method || 'POST',
    body: { query: valorConsulta, ...args },
    prompt: userPrompt
  }).catch((err: any) => ({ error: err.message, tool: chaveLimpa }));
}

export const executeBoundTool = executarFerramentaVinculada;
