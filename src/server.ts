import { handleWebMcpJsonRpc } from "./services/webMcpService.js";
import crypto from 'crypto';
// src/server.ts
import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import path from 'path';
import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import {
  requireJwtAuth,
  createRateLimiter,
  validateWebhookIngress
} from './middlewares/securityMiddleware.js';

import { pool, testConnection } from './config/database.js';
import { initializeDatabaseSchema } from './models/databaseSetup.js';
import { initBrainWebSocketServer } from './services/brainSocketService.js';
import { initializeTriggerSchema, dispatchErrorTrigger } from './services/errorTriggerService.js';
import { startScheduleTriggerEngine } from './services/scheduleTriggerService.js';
import { startMemoryAndBackupScheduler } from './services/securityGovernanceService.js';
import { startAgentWatchdog } from './services/agentWatchdogService.js';

// Módulos de Biometria Vocal & Voice Match
import {
  listVoiceProfiles,
  enrollSpeakerVoice,
  deleteVoiceProfile
} from './services/voiceBiometricService.js';

import * as triggerRoutesMod from './routes/triggerRoutes.js';
import * as authRoutesMod from './routes/authRoutes.js';
import * as agentRoutesMod from './routes/agentRoutes.js';
import * as ragRoutesMod from './routes/ragRoutes.js';
import * as messagingRoutesMod from './routes/messagingRoutes.js';

import {
  handleWebhookIngress,
  handleLocalAudioTranscribe
} from './controllers/orchestratorController.js';
import {
  handleAgentProductionWebhook,
  handleAgentTestWebhook,
  handleGlobalWebhookTrigger
} from './controllers/agentController.js';
import {
  listMemorySessions,
  getSessionDetails,
  updateMemoryMessage,
  deleteMemoryMessage,
  clearSessionMemory
} from './controllers/memoryController.js';
import {
  handleDocumentUploadToRag,
  handleListRagDocuments,
  handleDeleteRagDocument,
  handleSshExecute,
  handleSshReadToRag
} from './controllers/documentSshController.js';
import {
  getBrainConfig,
  updateBrainConfig,
  validateLLMConnection,
  getSupportedModels,
  syncModelsFromGistAndHealAgents,
  listPromptVersions,
  manageServerPortAndEnv
} from './controllers/brainConfigController.js';
import * as connectorController from './controllers/connectorController.js';
import { spawn } from 'child_process';

const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

function resolveRouter(mod: any): express.Router {
  if (typeof mod === 'function') return mod;
  if (!mod || typeof mod !== 'object') return express.Router();

  const candidates = [
    mod.default,
    mod.default?.default,
    mod.router,
    mod.triggerRoutes,
    mod.authRoutes,
    mod.agentRoutes,
    mod.ragRoutes,
    mod.messagingRoutes,
    mod.documentSshRoutes
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'function') {
      return candidate;
    }
  }

  for (const key of Object.keys(mod)) {
    const val = mod[key];
    if (typeof val === 'function') return val;
    if (val && typeof val === 'object') {
      for (const subKey of Object.keys(val)) {
        if (typeof val[subKey] === 'function') return val[subKey];
      }
    }
  }

  return express.Router();
}

const triggerRoutes = resolveRouter(triggerRoutesMod);
const authRoutes = resolveRouter(authRoutesMod);
const agentRoutes = resolveRouter(agentRoutesMod);
const ragRoutes = resolveRouter(ragRoutesMod);
const messagingRoutes = resolveRouter(messagingRoutesMod);

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT || 3333);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 1. Módulos Principais de Rotas API

app.get('/download/jarvis-tv.apk', (_req, res) => res.download('/home/ubuntu/jarvis_releases/jarvis-tv.apk', 'jarvis-tv.apk'));
app.get('/download/jarvis.apk', (_req, res) => res.download('/home/ubuntu/jarvis_releases/jarvis.apk', 'jarvis.apk'));
app.get('/download/jarvis-watch.apk', (_req, res) => res.download('/home/ubuntu/jarvis_releases/jarvis-watch.apk', 'jarvis-watch.apk'));
const authRateLimiter = createRateLimiter(15, 60 * 1000);
const webhookRateLimiter = createRateLimiter(120, 60 * 1000);

app.use('/api/v1/auth', authRateLimiter, authRoutes);

// __SYNC_AGENT_SCHEDULE_FIELDS__
app.use('/api/v1/agents', requireJwtAuth, (req: Request, res: Response, next: NextFunction) => {
  if ((req.method === 'POST' || req.method === 'PUT') && req.body && req.body.slug) {
    const b = req.body;
    const schedList = Array.isArray(b.schedules) ? b.schedules : [];
    const ativos = schedList.filter((s: any) => s && s.enabled !== false);
    const hasAny = ativos.length > 0 || Boolean(b.schedule_enabled);
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        pool.query(
          `UPDATE ai_agents SET schedule_enabled = $1, cron_expression = $2, schedule_prompt = $3, is_error_trigger = $4, schedules = $5::jsonb WHERE slug = $6;`,
          [hasAny, ativos[0]?.cron_expression || (b.schedule_enabled ? b.cron_expression : null) || null, ativos[0]?.schedule_prompt || b.schedule_prompt || null, Boolean(b.is_error_trigger), JSON.stringify(schedList), b.slug]
        ).catch(() => {});
      }
    });
  }
  next();
});
app.use('/api/v1/agents', agentRoutes);
app.use('/api/v1/rag', requireJwtAuth, ragRoutes);
app.use('/api/v1/messaging', requireJwtAuth, messagingRoutes);
app.use('/api/v1/triggers', requireJwtAuth, triggerRoutes);

// 2. Configurações Dinâmicas do Cérebro Central (JARVIS / SNC) + Sincronização GitHub Gist
app.get('/api/v1/brain-config', requireJwtAuth, getBrainConfig);
app.put('/api/v1/brain-config', requireJwtAuth, updateBrainConfig);
app.post('/api/v1/brain-config/validate', requireJwtAuth, validateLLMConnection);
app.get('/api/v1/brain-config/models', requireJwtAuth, getSupportedModels);
app.get('/api/v1/brain-config/prompt-versions', requireJwtAuth, listPromptVersions);
app.post('/api/v1/brain-config/port', requireJwtAuth, manageServerPortAndEnv);

// 3. Conectores Externos & Chaves de API das Tools
app.get('/api/v1/connectors', requireJwtAuth, connectorController.listConnectors);
app.post('/api/v1/connectors', requireJwtAuth, connectorController.saveConnectorConfig);
app.put('/api/v1/connectors', requireJwtAuth, connectorController.saveConnectorConfig);
if (typeof (connectorController as any).testExternalConnector === 'function') {
  app.post('/api/v1/connectors/test', requireJwtAuth, (connectorController as any).testExternalConnector);
}
if (typeof (connectorController as any).deleteExternalConnector === 'function') {
  app.delete('/api/v1/connectors/:key', requireJwtAuth, (connectorController as any).deleteExternalConnector);
}

// ROTA DE CONSULTA DIRETA AO BANCO PARA A ABA DE MEMÓRIA (MÉDIO E LONGO PRAZO)
app.post('/api/v1/connectors/query-db', requireJwtAuth, async (req: Request, res: Response) => {
  try {
    const { query, params } = req.body || {};
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: 'Query SQL obrigatória.' });
    }
    const cleanSql = query.trim();
    if (/;\s*\S/.test(cleanSql)) {
      return res.status(403).json({
        success: false,
        error: 'Operação bloqueada: apenas uma instrução SQL por chamada é permitida.'
      });
    }
    if (/\b(DROP|ALTER|TRUNCATE|GRANT|REVOKE|CREATE|COPY|EXECUTE)\b/i.test(cleanSql)) {
      return res.status(403).json({
        success: false,
        error: 'Comandos DDL/administrativos não são permitidos nesta rota.'
      });
    }
    if (/\b(system_configs|identities|pg_shadow|pg_authid)\b/i.test(cleanSql)) {
      return res.status(403).json({
        success: false,
        error: 'Acesso negado a tabelas protegidas de credenciais.'
      });
    }
    const isSelect = /^SELECT\s+/i.test(cleanSql);
    const isSafeMemoryMutation =
      /^(INSERT\s+INTO|DELETE\s+FROM|UPDATE)\s+(jarvis_episodic_memory|vector_documents)\b/i.test(cleanSql);

    if (!isSelect && !isSafeMemoryMutation) {
      return res.status(403).json({
        success: false,
        error: 'Escrita permitida apenas nas tabelas de memória episódica e vetorial.'
      });
    }
    const result = await pool.query(cleanSql, Array.isArray(params) ? params : []);
    return res.status(200).json({
      success: true,
      rows: result.rows,
      data: result.rows,
      rowCount: result.rowCount
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Gestão de Memória por Session ID, Rollback de Prompts e Coleções Dinâmicas
app.get('/api/v1/memory/sessions', requireJwtAuth, listMemorySessions);
app.get('/api/v1/memory/sessions/:sessionId', requireJwtAuth, getSessionDetails);
app.put('/api/v1/memory/messages/:id', requireJwtAuth, updateMemoryMessage);
app.delete('/api/v1/memory/messages/:id', requireJwtAuth, deleteMemoryMessage);
app.delete('/api/v1/memory/sessions/:sessionId', requireJwtAuth, clearSessionMemory);

app.get('/api/v1/dynamic-db/collections', requireJwtAuth, async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT collection_name, COUNT(*) AS total_documents, MAX(created_at) AS last_updated
      FROM dynamic_collections
      GROUP BY collection_name
      ORDER BY last_updated DESC;
    `);
    return res.status(200).json({ success: true, data: result.rows });
  } catch {
    return res.status(200).json({ success: true, data: [] });
  }
});

// 5. Biometria Vocal & Treinamento Voice Match (CRUD de Vozes)
// 5.1 Listar todas as pessoas com voz gravada
app.get('/api/v1/voice-profiles', requireJwtAuth, async (_req: Request, res: Response) => {
  try {
    const profiles = await listVoiceProfiles();
    return res.status(200).json({ success: true, data: profiles });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 5.2 Cadastrar ou calibrar mais uma amostra de voz
app.post('/api/v1/voice-profiles/enroll', requireJwtAuth, async (req: Request, res: Response) => {
  try {
    const { name, role = 'family', audioPayload } = req.body || {};
    if (!name || !audioPayload) {
      return res.status(400).json({
        success: false,
        error: 'Nome e amostra de áudio são obrigatórios.'
      });
    }
    const enrolled = await enrollSpeakerVoice(String(name), String(audioPayload), role);
    return res.status(200).json({ success: true, data: enrolled });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 5.3 Excluir perfil de voz cadastrado
app.delete('/api/v1/voice-profiles/:id', requireJwtAuth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const removed = await deleteVoiceProfile(id);
    return res.status(200).json({ success: removed });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Áudio & Voz do JARVIS
// Gravação de áudio de referência para voz

app.get('/api/v1/audio/voice-settings', async (_req: Request, res: Response) => {
  const d = { voice: 'pt-BR-AntonioNeural', rate: '+8%', pitch: '-4Hz', mode: 'edge' };
  try {
    const cp = path.join(process.cwd(), 'assets', 'voices', 'voice_config.json');
    const sp = path.join(process.cwd(), 'assets', 'voices', 'jarvis_reference.wav');
    const cur = fs.existsSync(cp) ? { ...d, ...JSON.parse(fs.readFileSync(cp, 'utf8')) } : d;
    return res.status(200).json({ success: true, data: { ...cur, hasClonedSample: fs.existsSync(sp) } });
  } catch { return res.status(200).json({ success: true, data: { ...d, hasClonedSample: false } }); }
});

app.post('/api/v1/audio/voice-settings', requireJwtAuth, async (req: Request, res: Response) => {
  try {
    const { voice = 'pt-BR-AntonioNeural', rate = '+8%', pitch = '-4Hz', mode = 'edge' } = req.body || {};
    const dir = path.join(process.cwd(), 'assets', 'voices');
    await fs.promises.mkdir(dir, { recursive: true });
    const payload = { voice, rate, pitch, mode };
    await fs.promises.writeFile(path.join(dir, 'voice_config.json'), JSON.stringify(payload, null, 2));
    return res.status(200).json({ success: true, data: payload });
  } catch (err: any) { return res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/v1/audio/voice-sample', requireJwtAuth, async (req: Request, res: Response) => {
  try {
    const { audioBase64 } = req.body || {};
    if (!audioBase64) return res.status(400).json({ success: false, error: 'Áudio vazio.' });

    const voicesDir = path.join(process.cwd(), 'assets', 'voices');
    await fs.promises.mkdir(voicesDir, { recursive: true });
    const samplePath = path.join(voicesDir, 'jarvis_reference.wav');

    const cleanB64 = audioBase64.replace(/^data:audio\/[a-zA-Z0-9+-]+;base64,/, '');
    await fs.promises.writeFile(samplePath, Buffer.from(cleanB64, 'base64'));

    return res.status(200).json({
      success: true,
      message: 'Amostra de voz gravada com sucesso em assets/voices/jarvis_reference.wav!'
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Síntese de fala offline / TTS
app.post('/api/v1/audio/speak', async (req: Request, res: Response) => {
  try {
    const { text, mode = 'auto', voice = '', rate = '', pitch = '' } = req.body || {};
    if (!text) return res.status(400).json({ success: false, error: 'Texto obrigatório.' });

    const cleanText = String(text)
      .replace(/```[\s\S]*?```/g, 'bloco de código na tela.')
      .replace(/\(?\*{1,4}\s*\+?\d[\d\s().-]{6,}\*{0,4}\)?/g, 'o número cadastrado')
      .replace(/\+?55\s*\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}/g, 'o número cadastrado')
      .replace(/[*#_`~>|]+/g, ' ')
      .replace(/\b(\w+(?:\s+\w+){0,2})(?:\s+\1){1,}\b/gi, '$1')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 900);

    const venvPython = path.join(process.cwd(), 'whisper-env', 'bin', 'python3');
    const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python3';
    const scriptPath = path.join(process.cwd(), 'scripts', 'jarvis_tts.py');

    const py = spawn(pythonCmd, [scriptPath, cleanText, String(mode), String(voice), String(rate), String(pitch)]);
    let out = '';
    py.stdout.on('data', (d) => (out += d.toString()));
    py.on('close', () => {
      try {
        return res.status(200).json(JSON.parse(out.trim()));
      } catch {
        return res.status(500).json({ success: false, error: 'Falha ao sintetizar áudio.' });
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/dynamic-db/collections/:name', requireJwtAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM dynamic_collections WHERE collection_name = $1 ORDER BY id DESC LIMIT 100;',
      [req.params.name]
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/v1/prompts/versions/:slug', requireJwtAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM prompt_versions WHERE target_slug = $1 ORDER BY id DESC LIMIT 20;',
      [req.params.slug]
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch {
    return res.status(200).json({ success: true, data: [] });
  }
});

// 6.1 Preferências de Modos & Áudio (Sincronização App Android + Web)
const DEFAULT_USER_PREFS = {
  listen_screen_off: true,
  listen_only_unlocked: false,
  listen_only_app_open: false,
  push_to_talk_only: false,
  silent_text_only: false,
  chime_enabled: true,
  edge_glow_enabled: true,
  wake_screen_on_call: true,
  privacy_lock_camera: false,
  continuous_chat_seconds: 15,
  mic_sensitivity: 'balanced'
};

app.post('/api/v1/voice/turn', async (req, res) => {
  try {
    const { audioBase64, mimeType, requireWakeWord, identityToken, sessionId } = req.body || {};
    if (!audioBase64) return res.status(400).json({ success: false, error: 'audioBase64 ausente' });

    const localBase = `http://127.0.0.1:${PORT}`;
    const trResp = await fetch(`${localBase}/api/v1/audio/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64, mimeType: mimeType || 'audio/wav', modelSize: 'small' })
    });
    const trJson: any = await trResp.json().catch(() => ({}));
    const transcript = String(trJson?.text || trJson?.transcript || '').trim();
    console.log(`[VoiceTurn] Ouviu: "${transcript}"`);

    if (!transcript) return res.json({ success: true, woke: false, transcript: '', reply: '' });

    const norm = transcript.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const hasWake = /\b(jarvis|javis|jarves|jaives|javes|iarvis|yarvis|djarvis|jarbas|jar\s*vis|ja\s*vis)\b/.test(norm);
    if (requireWakeWord !== false && !hasWake) {
      return res.json({ success: true, woke: false, transcript, reply: '' });
    }

    const cleanPrompt = transcript
      .replace(/^(oi|olá|ola|ei|hey|ok|fala|e\s*a[ií])?[,\s.-]*(jarvis|j[aá]vis|jarves|jaives|javes|iarvis|yarvis|djarvis|jarbas|j\.a\.r\.v\.i\.s\.?)\s*[,\s.:!?-]*/i, '')
      .trim();
    if (!cleanPrompt) {
      return res.json({ success: true, woke: true, transcript, reply: '' });
    }

    const ingResp = await fetch(`${localBase}/api/v1/webhook/ingress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identityToken: identityToken || 'Matheus-Admin',
        sessionId: sessionId || 'sess_main_admin',
        prompt: cleanPrompt,
        textPrompt: cleanPrompt,
        sensorData: {
          type: 'voice_or_text',
          inputSource: 'android_voice_service',
          prompt: cleanPrompt,
          textPrompt: cleanPrompt
        }
      })
    });
    const ingJson: any = await ingResp.json().catch(() => ({}));
    const reply = String(ingJson?.data?.response || ingJson?.response || ingJson?.reply || ingJson?.message || 'Pronto.').trim();

    let replyAudioB64 = '';
    if (reply) {
      try {
        const spResp = await fetch(`${localBase}/api/v1/audio/speak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: reply })
        });
        const spJson: any = await spResp.json().catch(() => ({}));
        replyAudioB64 = String(spJson?.audioBase64 || '');
      } catch {}
    }

    return res.json({ success: true, woke: true, transcript, reply, audioBase64: replyAudioB64 });
  } catch (e: any) {
    console.error('[VoiceTurn] Erro:', e?.message || e);
    return res.status(500).json({ success: false, error: e?.message || 'Erro interno' });
  }
});

app.get('/api/v1/preferences', async (_req: Request, res: Response) => {
  try {
    const prefPath = path.join(process.cwd(), 'assets', 'user_preferences.json');
    const saved = fs.existsSync(prefPath) ? JSON.parse(fs.readFileSync(prefPath, 'utf8')) : {};
    return res.status(200).json({ success: true, data: { ...DEFAULT_USER_PREFS, ...saved } });
  } catch {
    return res.status(200).json({ success: true, data: DEFAULT_USER_PREFS });
  }
});

const saveUserPrefsHandler = async (req: Request, res: Response) => {
  try {
    const incoming = (req.body && typeof req.body.data === 'object') ? req.body.data : (req.body || {});
    const prefPath = path.join(process.cwd(), 'assets', 'user_preferences.json');
    await fs.promises.mkdir(path.dirname(prefPath), { recursive: true });
    const current = fs.existsSync(prefPath) ? JSON.parse(fs.readFileSync(prefPath, 'utf8')) : {};
    const merged = { ...DEFAULT_USER_PREFS, ...current, ...incoming };
    await fs.promises.writeFile(prefPath, JSON.stringify(merged, null, 2));
    return res.status(200).json({ success: true, data: merged });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

app.post('/api/v1/preferences', saveUserPrefsHandler);
app.put('/api/v1/preferences', saveUserPrefsHandler);

// 7. Document Loader (RAG) & Terminal SSH
app.post('/api/v1/docs-ssh/rag/upload', requireJwtAuth, handleDocumentUploadToRag);
app.get('/api/v1/docs-ssh/rag/documents', requireJwtAuth, handleListRagDocuments);
app.delete('/api/v1/docs-ssh/rag/documents/:id', requireJwtAuth, handleDeleteRagDocument);
app.post('/api/v1/docs-ssh/ssh/execute', requireJwtAuth, handleSshExecute);
app.post('/api/v1/docs-ssh/ssh/read-to-rag', requireJwtAuth, handleSshReadToRag);

// 8. Webhooks de Entrada (Orquestrador Central, Áudio Whisper, Agentes Diretos e Webhook Global 1:N)
app.post('/api/v1/webhook/ingress', webhookRateLimiter, validateWebhookIngress, handleWebhookIngress);
app.post('/api/v1/audio/transcribe', handleLocalAudioTranscribe);
app.all('/api/v1/webhook/agents/:slug', handleAgentProductionWebhook);
app.all('/api/v1/webhook-test/agents/:slug', handleAgentTestWebhook);
app.all('/api/v1/webhook/global/:key', handleGlobalWebhookTrigger);
app.all('/api/v1/webhook-test/global/:key', handleGlobalWebhookTrigger);

// 9. Health Check
app.post(["/api/v1/webmcp", "/api/v1/webmcp/mcp"], handleWebMcpJsonRpc);

app.get('/health', (_req: Request, res: Response) => {
  return res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// 10. Roteamento de Telas
const staticCandidates = [
  path.resolve(currentDir, '../dist'),
  path.resolve(currentDir, '../../dist'),
  path.resolve(process.cwd(), 'dist'),
  path.resolve(process.cwd(), 'public')
];
const clientDistPath = staticCandidates.find((dir) => fs.existsSync(dir)) || staticCandidates[0];

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  app.get(['/settings', '/settings.html'], (_req: Request, res: Response) => {
    const settingsFile = path.join(clientDistPath, 'settings.html');
    if (fs.existsSync(settingsFile)) {
      return res.sendFile(settingsFile);
    }
    return res.sendFile(path.join(clientDistPath, 'index.html'));
  });

  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/health')) {
      return next();
    }
    const indexFile = path.join(clientDistPath, 'index.html');
    if (fs.existsSync(indexFile)) {
      return res.sendFile(indexFile);
    }
    return next();
  });
}

// 11. Interceptor Global de Erros
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error('💥 [Global Error Interceptor]:', err.message);
  if (typeof dispatchErrorTrigger === 'function') {
    dispatchErrorTrigger({
      sourceNode: 'Global Error Interceptor (Express)',
      sourceSlug: 'express_server',
      errorMessage: err.message || 'Erro interno não tratado.',
      stackTrace: err.stack,
      inputPayload: req.body,
      severity: 'high'
    }).catch(() => null);
  }
  return res.status(500).json({
    success: false,
    error: err.message || 'Falha interna no servidor.'
  });
});

syncModelsFromGistAndHealAgents().catch(() => {});
setInterval(() => {
  syncModelsFromGistAndHealAgents().catch(() => {});
}, 5 * 60 * 1000);

const server = http.createServer(app);
initBrainWebSocketServer(server);

server.listen(PORT, async () => {
  console.log(`🚀 Servidor backend e WebSocket Neural rodando na porta ${PORT}`);
  try {
    await testConnection();
    await initializeDatabaseSchema();
    await initializeTriggerSchema();
    startScheduleTriggerEngine();
    startAgentWatchdog();
    startMemoryAndBackupScheduler();
  } catch (err: any) {
    console.error('❌ Falha na inicialização do banco/esquema:', err.message);
  }
});
