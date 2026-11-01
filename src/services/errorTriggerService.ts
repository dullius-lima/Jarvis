import { pool } from '../config/database.js';
import OpenAI from 'openai';
import { KNOWN_ENDPOINTS } from '../controllers/brainConfigController.js';

export interface ErrorTriggerPayload {
  sourceNode: string;
  sourceSlug?: string;
  errorMessage: string;
  stackTrace?: string;
  errorStack?: string;
  inputPayload?: any;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  agentSlug?: string;
  agentName?: string;
}

// Trava anti-loop para garantir que uma falha dentro do Error Trigger nunca gere recursão infinita
let isHandlingErrorTrigger = false;

/**
 * Emite evento visual para o Cérebro 3D de forma segura (sem risco de quebrar caso o módulo varie)
 */
async function safeEmitCortisolPulse(sourceNode: string, errorMessage: string) {
  try {
    const brainSocketModule: any = await import('./brainSocketService.js');
    const emitFn = brainSocketModule.emitBrainLinkEvent || brainSocketModule.emitNeuroPulse;
    if (typeof emitFn === 'function') {
      emitFn({
        axon_id: `axon_err_${Date.now()}`,
        source_dendrite: sourceNode || 'sensory_ingress',
        target_dendrite: 'jarvis_core',
        direction: 'FORWARD',
        neurotransmitter_type: 'CORTISOL', // Cortisol = Alerta de estresse/falha no SNC
        intensity: 1.0,
        metadata: {
          label: `🚨 Falha: ${errorMessage.slice(0, 60)}`,
          timestamp: new Date().toISOString()
        }
      });
    }
  } catch {
    // Ignora silenciosamente se o barramento WebSocket não estiver carregado
  }
}

/**
 * Inicializa a tabela de auditoria de falhas e colunas de Error/Schedule Trigger em ai_agents
 */
export async function initializeTriggerSchema() {
  const client = await pool.connect();
  try {
    // 1. Colunas de Agendamento Cron e Error Trigger na tabela ai_agents
    await client.query(`
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN DEFAULT FALSE;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS cron_expression VARCHAR(100) DEFAULT NULL;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS schedule_prompt TEXT DEFAULT NULL;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS last_scheduled_run TIMESTAMP DEFAULT NULL;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS is_error_trigger BOOLEAN DEFAULT FALSE;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS error_notify_channel VARCHAR(50) DEFAULT NULL;
      ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS error_notify_target VARCHAR(150) DEFAULT NULL;
    `);

    // 2. Tabela dedicada para histórico do Error Trigger e Schedule Trigger
    await client.query(`
      CREATE TABLE IF NOT EXISTS error_trigger_logs (
        id SERIAL PRIMARY KEY,
        source_node VARCHAR(120) NOT NULL,
        source_slug VARCHAR(80),
        severity VARCHAR(20) DEFAULT 'high',
        error_message TEXT NOT NULL,
        stack_trace TEXT,
        input_payload JSONB,
        supervisor_agent_name VARCHAR(120),
        supervisor_diagnosis TEXT,
        notification_sent BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schedule_execution_logs (
        id SERIAL PRIMARY KEY,
        agent_slug VARCHAR(80) NOT NULL,
        agent_name VARCHAR(120) NOT NULL,
        cron_expression VARCHAR(100) NOT NULL,
        prompt_dispatched TEXT,
        execution_status VARCHAR(30) DEFAULT 'success',
        output_summary TEXT,
        execution_time_ms INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('⚡ [Triggers Schema] Tabelas e colunas de Schedule Trigger (Cron) e Error Trigger prontas!');
  } catch (error: any) {
    console.error('❌ [Triggers Schema] Erro ao alinhar tabelas de gatilhos:', error.message);
  } finally {
    client.release();
  }
}

/**
 * Despacha notificação externa direta (Telegram, WhatsApp ou Logs)
 */
async function dispatchExternalNotification(channel: string, target: string, text: string) {
  try {
    if (channel === 'telegram') {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = target || process.env.ADMIN_TELEGRAM_CHAT_ID;
      if (token && chatId) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
        });
      }
    }
  } catch (e: any) {
    console.warn(`⚠️ [Error Trigger] Falha ao enviar notificação externa (${channel}):`, e.message);
  }
}

/**
 * Dispara o Error Trigger imediatamente quando qualquer automação, API ou Agente falha
 */
export async function dispatchErrorTrigger(payload: ErrorTriggerPayload) {
  if (isHandlingErrorTrigger) {
    console.warn('⚠️ [Error Trigger] Loop evitado: falha secundária ignorada durante tratamento de erro.');
    return null;
  }

  isHandlingErrorTrigger = true;
  const {
    sourceNode,
    sourceSlug = 'system_core',
    errorMessage,
    stackTrace = payload.errorStack || '',
    inputPayload = {},
    severity = 'high'
  } = payload;

  console.error(`🚨 [ERROR TRIGGER ACIONADO] Origem: ${sourceNode} (${sourceSlug}) | Erro: ${errorMessage}`);

  // 1. Dispara pulso de Cortisol no Cérebro 3D
  await safeEmitCortisolPulse(sourceSlug, errorMessage);

  const client = await pool.connect();
  try {
    // 2. Procura se existe algum Agente Supervisor configurado com is_error_trigger = TRUE
    const supRes = await client.query(`
      SELECT * FROM ai_agents
      WHERE is_error_trigger = TRUE AND is_active = TRUE
      ORDER BY id ASC
      LIMIT 1;
    `);

    let supervisorName: string | null = null;
    let diagnosisText = `Falha detectada no nó [${sourceNode}]: ${errorMessage}`;
    let notificationSent = false;

    if (supRes.rows.length > 0) {
      const supervisor = supRes.rows[0];
      supervisorName = supervisor.name;

      // Se o supervisor for um agente cognitivo (LLM), gera diagnóstico e plano de ação imediato
      try {
        const provider = (supervisor.provider || 'groq').toLowerCase();
        const baseURL = (supervisor.base_url || KNOWN_ENDPOINTS[provider] || KNOWN_ENDPOINTS.groq).replace(/\/+$/, '');
        const apiKey = supervisor.api_key || (provider === 'ollama' ? 'ollama' : process.env.LLM_API_KEY || '');

        const llmClient = new OpenAI({
          apiKey: apiKey || 'ollama',
          baseURL,
          timeout: 15000
        });

        const completion = await llmClient.chat.completions.create({
          model: supervisor.model || 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content:
                supervisor.system_prompt ||
                'Você é o Agente Supervisor de Falhas (Error Trigger) do ecossistema JARVIS/n8n. Analise o erro técnico abaixo em português de forma objetiva, indique a causa provável e a ação corretiva imediata em até 4 linhas.'
            },
            {
              role: 'user',
              content: JSON.stringify({
                nó_afetado: sourceNode,
                slug: sourceSlug,
                severidade: severity,
                erro: errorMessage,
                payload_entrada: inputPayload,
                horario: new Date().toLocaleString('pt-BR')
              })
            }
          ]
        });

        diagnosisText = completion.choices[0]?.message?.content || diagnosisText;
      } catch (llmErr: any) {
        console.warn('⚠️ [Error Trigger] Fallback de diagnóstico sem LLM:', llmErr.message);
      }

      // 3. Notificação externa
      if (supervisor.error_notify_channel) {
        const alertFormatted = `🚨 *ALERTA ERROR TRIGGER (JARVIS n8n)*\n\n*Nó Afetado:* ${sourceNode}\n*Severidade:* ${severity.toUpperCase()}\n*Erro:* ${errorMessage}\n\n🧠 *Diagnóstico do Supervisor (${supervisor.name}):*\n${diagnosisText}`;
        await dispatchExternalNotification(
          supervisor.error_notify_channel,
          supervisor.error_notify_target,
          alertFormatted
        );
        notificationSent = true;
      }
    }

    // 4. Regista o incidente na tabela error_trigger_logs
    const insertRes = await client.query(
      `INSERT INTO error_trigger_logs 
        (source_node, source_slug, severity, error_message, stack_trace, input_payload, supervisor_agent_name, supervisor_diagnosis, notification_sent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *;`,
      [
        sourceNode,
        sourceSlug,
        severity,
        errorMessage,
        stackTrace,
        JSON.stringify(inputPayload || {}),
        supervisorName,
        diagnosisText,
        notificationSent
      ]
    );

    return insertRes.rows[0];
  } catch (dbErr: any) {
    console.error('❌ [Error Trigger] Falha ao gravar log de erro no PostgreSQL:', dbErr.message);
    return null;
  } finally {
    client.release();
    isHandlingErrorTrigger = false;
  }
}