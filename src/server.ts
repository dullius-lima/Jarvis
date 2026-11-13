// src/server.ts
import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import path from 'path';
import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
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
const PORT = Number(process.env.PORT || 3333);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 1. Módulos Principais de Rotas API

app.get('/download/jarvis.apk', (_req, res) => res.download('/home/ubuntu/jarvis_releases/jarvis.apk', 'jarvis.apk'));
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/agents', agentRoutes);
app.use('/api/v1/rag', ragRoutes);
app.use('/api/v1/messaging', messagingRoutes);
app.use('/api/v1/triggers', triggerRoutes);

// 2. Configurações Dinâmicas do Cérebro Central (JARVIS / SNC) + Sincronização GitHub Gist
app.get('/api/v1/brain-config', getBrainConfig);
app.put('/api/v1/brain-config', updateBrainConfig);
app.post('/api/v1/brain-config/validate', validateLLMConnection);
app.get('/api/v1/brain-config/models', getSupportedModels);
app.get('/api/v1/brain-config/prompt-versions', listPromptVersions);
app.post('/api/v1/brain-config/port', manageServerPortAndEnv);

// 3. Conectores Externos & Chaves de API das Tools
app.get('/api/v1/connectors', connectorController.listConnectors);
app.post('/api/v1/connectors', connectorController.saveConnectorConfig);
app.put('/api/v1/connectors', connectorController.saveConnectorConfig);
if (typeof (connectorController as any).testExternalConnector === 'function') {
  app.post('/api/v1/connectors/test', (connectorController as any).testExternalConnector);
}
if (typeof (connectorController as any).deleteExternalConnector === 'function') {
  app.delete('/api/v1/connectors/:key', (connectorController as any).deleteExternalConnector);
}

// ROTA DE CONSULTA DIRETA AO BANCO PARA A ABA DE MEMÓRIA (MÉDIO E LONGO PRAZO)
app.post('/api/v1/connectors/query-db', async (req: Request, res: Response) => {
  try {
    const { query, params } = req.body || {};
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query SQL obrigatória.' });
    }
    const result = await pool.query(query, params || []);
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
app.get('/api/v1/memory/sessions', listMemorySessions);
app.get('/api/v1/memory/sessions/:sessionId', getSessionDetails);
app.put('/api/v1/memory/messages/:id', updateMemoryMessage);
app.delete('/api/v1/memory/messages/:id', deleteMemoryMessage);
app.delete('/api/v1/memory/sessions/:sessionId', clearSessionMemory);

app.get('/api/v1/dynamic-db/collections', async (_req: Request, res: Response) => {
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
app.get('/api/v1/voice-profiles', async (_req: Request, res: Response) => {
  try {
    const profiles = await listVoiceProfiles();
    return res.status(200).json({ success: true, data: profiles });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 5.2 Cadastrar ou calibrar mais uma amostra de voz
app.post('/api/v1/voice-profiles/enroll', async (req: Request, res: Response) => {
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
app.delete('/api/v1/voice-profiles/:id', async (req: Request, res: Response) => {
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

app.post('/api/v1/audio/voice-settings', async (req: Request, res: Response) => {
  try {
    const { voice = 'pt-BR-AntonioNeural', rate = '+8%', pitch = '-4Hz', mode = 'edge' } = req.body || {};
    const dir = path.join(process.cwd(), 'assets', 'voices');
    await fs.promises.mkdir(dir, { recursive: true });
    const payload = { voice, rate, pitch, mode };
    await fs.promises.writeFile(path.join(dir, 'voice_config.json'), JSON.stringify(payload, null, 2));
    return res.status(200).json({ success: true, data: payload });
  } catch (err: any) { return res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/v1/audio/voice-sample', async (req: Request, res: Response) => {
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
      .replace(/[*#_`~>|]/g, '')
      .slice(0, 1200);

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

app.get('/api/v1/dynamic-db/collections/:name', async (req: Request, res: Response) => {
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

app.get('/api/v1/prompts/versions/:slug', async (req: Request, res: Response) => {
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

// 7. Document Loader (RAG) & Terminal SSH
app.post('/api/v1/docs-ssh/rag/upload', handleDocumentUploadToRag);
app.get('/api/v1/docs-ssh/rag/documents', handleListRagDocuments);
app.delete('/api/v1/docs-ssh/rag/documents/:id', handleDeleteRagDocument);
app.post('/api/v1/docs-ssh/ssh/execute', handleSshExecute);
app.post('/api/v1/docs-ssh/ssh/read-to-rag', handleSshReadToRag);

// 8. Webhooks de Entrada (Orquestrador Central, Áudio Whisper, Agentes Diretos e Webhook Global 1:N)
app.post('/api/v1/webhook/ingress', handleWebhookIngress);
app.post('/api/v1/audio/transcribe', handleLocalAudioTranscribe);
app.all('/api/v1/webhook/agents/:slug', handleAgentProductionWebhook);
app.all('/api/v1/webhook-test/agents/:slug', handleAgentTestWebhook);
app.all('/api/v1/webhook/global/:key', handleGlobalWebhookTrigger);
app.all('/api/v1/webhook-test/global/:key', handleGlobalWebhookTrigger);

// 9. Health Check
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
