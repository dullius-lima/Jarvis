// src/controllers/connectorController.ts
import { Request, Response } from 'express';
import { pool } from '../config/database.js';

export const DEFAULT_CONNECTORS = [
  {
    provider_key: 'brapi',
    name: 'Brapi B3',
    category: 'Finanças',
    icon: '📈',
    description: 'Cotações em tempo real e valuation Bazin.',
    endpoint_url: 'https://brapi.dev/api/quote/{{query}}',
    http_method: 'GET',
    api_key: '',
    is_enabled: true
  },
  {
    provider_key: 'whatsapp',
    name: 'WhatsApp Evolution',
    category: 'Mensageria',
    icon: '💬',
    description: 'Envio e recebimento de mensagens via API.',
    endpoint_url: 'http://localhost:8080/message/sendText',
    http_method: 'POST',
    api_key: '',
    is_enabled: false
  },
  {
    provider_key: 'telegram',
    name: 'Telegram Bot',
    category: 'Mensageria',
    icon: '✈️',
    description: 'Comandos remotos e alertas instantâneos.',
    endpoint_url: 'https://api.telegram.org',
    http_method: 'POST',
    api_key: '',
    is_enabled: false
  },
  {
    provider_key: 'home_assistant',
    name: 'Home Assistant',
    category: 'IoT',
    icon: '🏠',
    description: 'Controle de luzes, clima e atuadores residenciais.',
    endpoint_url: 'http://192.168.1.50:8123/api',
    http_method: 'POST',
    api_key: '',
    is_enabled: false
  },
  {
    provider_key: 'gmail',
    name: 'Google Gmail',
    category: 'Google Workspace',
    icon: '📨',
    description: 'Envio e leitura de e-mails via Google REST API.',
    endpoint_url: 'https://gmail.googleapis.com/gmail/v1/users/me/profile',
    http_method: 'POST',
    api_key: '',
    is_enabled: false
  },
  {
    provider_key: 'outlook',
    name: 'Microsoft Outlook 365',
    category: 'Microsoft 365',
    icon: '📧',
    description: 'Envio e leitura de e-mails via Microsoft Graph API.',
    endpoint_url: 'https://graph.microsoft.com/v1.0/me',
    http_method: 'POST',
    api_key: '',
    is_enabled: false
  },
  {
    provider_key: 'google_calendar',
    name: 'Google Calendar',
    category: 'Google Workspace',
    icon: '📅',
    description: 'Agendamento e consulta de eventos e reuniões.',
    endpoint_url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    http_method: 'GET',
    api_key: '',
    is_enabled: false
  },
  {
    provider_key: 'notion',
    name: 'Notion Workspace',
    category: 'Produtividade',
    icon: '📓',
    description: 'Criação de páginas, bancos de dados e notas.',
    endpoint_url: 'https://api.notion.com/v1/users/me',
    http_method: 'GET',
    api_key: '',
    is_enabled: false
  }
];

async function ensureConnectorsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS external_connectors (
      provider_key VARCHAR(80) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      category VARCHAR(60) NOT NULL DEFAULT 'Custom Tool',
      icon VARCHAR(20) DEFAULT '🔌',
      description TEXT DEFAULT '',
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_enabled BOOLEAN DEFAULT TRUE,
      last_tested_at TIMESTAMP WITH TIME ZONE,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Garante que colunas adicionais existam caso a tabela tenha sido criada em versão anterior
  await pool.query(`
    ALTER TABLE external_connectors ADD COLUMN IF NOT EXISTS icon VARCHAR(20) DEFAULT '🔌';
    ALTER TABLE external_connectors ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
    ALTER TABLE external_connectors ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMP WITH TIME ZONE;
  `).catch(() => {});
}

// 1. Listar todos os conectores (mesclando catálogo base + conexões customizadas salvas)
export async function listConnectors(_req: Request, res: Response) {
  try {
    await ensureConnectorsTable();
    const result = await pool.query('SELECT * FROM external_connectors ORDER BY updated_at DESC;');
    const savedMap = new Map(result.rows.map((r: any) => [r.provider_key, r]));

    const merged = DEFAULT_CONNECTORS.map((def) => {
      const saved = savedMap.get(def.provider_key);
      if (saved) {
        savedMap.delete(def.provider_key);
        const cfg = saved.config || {};
        return {
          provider_key: saved.provider_key,
          name: saved.name || def.name,
          category: saved.category || def.category,
          icon: saved.icon || cfg.icon || def.icon,
          description: saved.description || cfg.description || def.description,
          endpoint_url: cfg.endpoint_url || def.endpoint_url,
          http_method: cfg.http_method || def.http_method || 'GET',
          api_key: cfg.api_key || cfg.auth_token || '',
          is_enabled: Boolean(saved.is_enabled),
          config: cfg
        };
      }
      return {
        ...def,
        config: {
          endpoint_url: def.endpoint_url,
          http_method: def.http_method,
          api_key: def.api_key
        }
      };
    });

    // Acrescenta todas as novas conexões e custom tools criadas pelo usuário
    for (const [, custom] of savedMap) {
      const cfg = custom.config || {};
      merged.push({
        provider_key: custom.provider_key,
        name: custom.name,
        category: custom.category || 'Custom Tool',
        icon: custom.icon || cfg.icon || '🛠️',
        description: custom.description || cfg.description || 'Ferramenta/Conexão customizada.',
        endpoint_url: cfg.endpoint_url || '',
        http_method: cfg.http_method || 'GET',
        api_key: cfg.api_key || cfg.auth_token || '',
        is_enabled: Boolean(custom.is_enabled),
        config: cfg
      });
    }

    return res.status(200).json({ success: true, data: merged });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// 2. Criar ou Salvar uma Conexão / Tool (compatível com PUT e POST)
export async function saveConnectorConfig(req: Request, res: Response) {
  try {
    await ensureConnectorsTable();
    const body = req.body || {};
    const provider_key = body.provider_key || body.slug;
    const name = body.name || body.label || provider_key;

    if (!provider_key) {
      return res.status(400).json({ success: false, error: 'O identificador (provider_key ou slug) é obrigatório.' });
    }

    const cleanKey = String(provider_key)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_]/g, '_');

    const incomingConfig = typeof body.config === 'object' && body.config !== null ? body.config : {};

    const category = body.category || incomingConfig.category || 'Custom Tool';
    const icon = body.icon || incomingConfig.icon || '🔌';
    const description = body.description || incomingConfig.description || '';
    const is_enabled = body.is_enabled !== undefined ? Boolean(body.is_enabled) : true;

    const mergedConfig = {
      ...incomingConfig,
      tool_type: incomingConfig.tool_type || body.tool_type || 'http',
      http_method: (incomingConfig.http_method || body.http_method || 'GET').toUpperCase(),
      endpoint_url: (incomingConfig.endpoint_url || body.endpoint_url || '').trim(),
      auth_token: (incomingConfig.auth_token || incomingConfig.api_key || body.auth_token || body.api_key || '').trim(),
      api_key: (incomingConfig.api_key || incomingConfig.auth_token || body.api_key || body.auth_token || '').trim(),
      payload_template: incomingConfig.payload_template || body.payload_template || '',
      description
    };

    const result = await pool.query(
      `INSERT INTO external_connectors (provider_key, name, category, icon, description, config, is_enabled, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (provider_key) DO UPDATE SET
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         icon = EXCLUDED.icon,
         description = EXCLUDED.description,
         config = EXCLUDED.config,
         is_enabled = EXCLUDED.is_enabled,
         updated_at = NOW()
       RETURNING *;`,
      [cleanKey, name, category, icon, description, JSON.stringify(mergedConfig), is_enabled]
    );

    return res.status(200).json({
      success: true,
      message: `Conexão/Tool [${name}] salva com sucesso no PostgreSQL!`,
      data: result.rows[0]
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

// 3. Testar Conexão / Tool em Tempo Real (suporta tanto teste via modal de Tool quanto aba Connectors)
export async function testExternalConnector(req: Request, res: Response) {
  const startTime = Date.now();
  try {
    const body = req.body || {};
    const cfg = typeof body.config === 'object' && body.config !== null ? body.config : {};
    const testQuery = String(body.testQuery || body.query || 'PETR4').trim();

    const providerKey = String(body.provider_key || cfg.provider_key || '').toLowerCase();
    const rawUrl = String(cfg.endpoint_url || body.endpoint_url || cfg.base_url || '').trim();
    const apiKey = String(cfg.auth_token || cfg.api_key || body.api_key || body.auth_token || '').trim();

    // 3.1 Teste específico do Telegram Bot
    if (providerKey === 'telegram' || rawUrl.includes('api.telegram.org')) {
      if (!apiKey) {
        return res.status(200).json({ success: false, latencyMs: Date.now() - startTime, error: 'Informe o Token do Bot do Telegram.' });
      }
      const tgRes = await fetch(`https://api.telegram.org/bot${apiKey}/getMe`, { signal: AbortSignal.timeout(10000) });
      const tgData: any = await tgRes.json().catch(() => ({}));
      if (!tgRes.ok || !tgData.ok) {
        return res.status(200).json({ success: false, latencyMs: Date.now() - startTime, error: tgData.description || 'Token do Telegram inválido.' });
      }
      return res.status(200).json({
        success: true,
        status: 200,
        latencyMs: Date.now() - startTime,
        message: `🟢 Telegram Bot conectado: @${tgData.result?.username} (${tgData.result?.first_name})`,
        data: tgData.result
      });
    }

    // 3.2 Teste específico da Brapi B3
    if (providerKey === 'brapi' || providerKey === 'brapi_b3' || rawUrl.includes('brapi.dev')) {
      let brapiUrl = rawUrl.includes('quote/') ? rawUrl : 'https://brapi.dev/api/quote/{{query}}';
      brapiUrl = brapiUrl.replace(/\{\{\s*query\s*\}\}/gi, testQuery).replace(/\{\{\s*symbol\s*\}\}/gi, testQuery);
      if (apiKey && !brapiUrl.includes('token=')) {
        brapiUrl += `${brapiUrl.includes('?') ? '&' : '?'}token=${apiKey}`;
      }
      const brapiRes = await fetch(brapiUrl, { signal: AbortSignal.timeout(10000) });
      const brapiData: any = await brapiRes.json().catch(() => ({}));
      if (!brapiRes.ok || brapiData.error) {
        return res.status(200).json({
          success: false,
          status: brapiRes.status,
          latencyMs: Date.now() - startTime,
          error: brapiData.message || `Erro HTTP ${brapiRes.status} na Brapi.`
        });
      }
      const price = brapiData.results?.[0]?.regularMarketPrice ?? 'OK';
      return res.status(200).json({
        success: true,
        status: 200,
        latencyMs: Date.now() - startTime,
        message: `🟢 Brapi B3 validada! Cotação teste [${testQuery}]: R$ ${price}`,
        data: brapiData
      });
    }

    // 3.3 Teste Universal para qualquer API REST / Webhook / MCP
    if (!rawUrl) {
      return res.status(200).json({
        success: false,
        latencyMs: Date.now() - startTime,
        error: 'Informe uma Endpoint URL para testar.'
      });
    }

    const finalUrl = rawUrl
      .replace(/\{\{\s*query\s*\}\}/gi, encodeURIComponent(testQuery))
      .replace(/\{\{\s*symbol\s*\}\}/gi, encodeURIComponent(testQuery));

    const method = String(cfg.http_method || body.http_method || 'GET').toUpperCase();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };

    if (apiKey) {
      headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
      headers['apikey'] = apiKey;
    }

    if (providerKey === 'notion') {
      headers['Notion-Version'] = '2022-06-28';
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(12000)
    };

    if (method !== 'GET' && method !== 'HEAD') {
      const template = cfg.payload_template || body.payload_template;
      if (template) {
        fetchOptions.body = String(template)
          .replace(/\{\{\s*query\s*\}\}/gi, testQuery)
          .replace(/\{\{\s*symbol\s*\}\}/gi, testQuery);
      } else {
        fetchOptions.body = JSON.stringify({ query: testQuery, test: true });
      }
    }

    const response = await fetch(finalUrl, fetchOptions);
    const data = await response.json().catch(async () => ({ text: await response.text() }));

    if (providerKey) {
      await pool.query(
        `UPDATE external_connectors SET last_tested_at = NOW() WHERE provider_key = $1;`,
        [providerKey]
      ).catch(() => {});
    }

    return res.status(200).json({
      success: response.ok,
      status: response.status,
      latencyMs: Date.now() - startTime,
      message: response.ok
        ? `🟢 Conexão respondeu com sucesso (HTTP ${response.status}) em ${Date.now() - startTime}ms!`
        : `🔴 Resposta HTTP ${response.status} do endpoint.`,
      data
    });
  } catch (error: any) {
    return res.status(200).json({
      success: false,
      latencyMs: Date.now() - startTime,
      error: `🔴 Falha na conexão: ${error.message}`
    });
  }
}

// 4. Excluir uma Conexão Customizada do Banco
export async function deleteExternalConnector(req: Request, res: Response) {
  try {
    const { key } = req.params;
    await pool.query('DELETE FROM external_connectors WHERE provider_key = $1;', [key]);
    return res.status(200).json({ success: true, message: `Conector [${key}] removido do banco.` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export default {
  listConnectors,
  saveConnectorConfig,
  testExternalConnector,
  deleteExternalConnector
};