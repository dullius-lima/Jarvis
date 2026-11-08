// src/controllers/orchestratorController.ts
import { Request, Response } from 'express';
import {
  processWorkflowExecution,
  processOrchestratorWorkflow
} from '../services/orchestratorService.js';
import * as biometricService from '../services/biometricService.js';
import { transcribeWithLocalWhisper } from '../services/whisperLocalService.js';
import { captureActiveScreenBase64 } from '../services/visionCaptureService.js';
import * as brainSocketService from '../services/brainSocketService.js';

function safeEmit(eventPayload: any) {
  try {
    const emitFn =
      (brainSocketService as any).emitBrainEvent ||
      (brainSocketService as any).emitNeuroPulse ||
      (brainSocketService as any).emitBrainLinkEvent;

    if (typeof emitFn === 'function') {
      emitFn(eventPayload);
    }
  } catch {}
}

/**
 * Endpoint dedicado para Transcrição de Voz via Whisper Local (Small)
 * POST /api/v1/audio/transcribe
 */
export async function handleLocalAudioTranscribe(req: Request, res: Response) {
  try {
    const { audioBase64, modelSize = 'small' } = req.body || {};

    if (!audioBase64) {
      return res.status(400).json({
        success: false,
        error: 'O campo audioBase64 é obrigatório para transcrição no Whisper Local.'
      });
    }

    const result = await transcribeWithLocalWhisper(audioBase64, modelSize);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('❌ [Whisper Controller Error]:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Falha no processamento de transcrição local de áudio.'
    });
  }
}

/**
 * Webhook Central de Entrada Multimodal (Voz Sentinela, Texto, Webcam Biometria e Captura de Tela)
 * POST /api/v1/webhook/ingress
 */
export async function handleWebhookIngress(req: Request, res: Response) {
  const startTime = Date.now();
  try {
    const body = req.body || {};
    const identityToken: string =
      body.identityToken || body.sensorData?.faceBadge || 'Matheus-Admin';
    const sessionId: string =
      body.sessionId || body.sensorData?.sessionId || `sess_${Date.now()}`;
    const sensorData = body.sensorData || {};

    // Aceita prompt tanto em sensorData.prompt quanto em sensorData.textPrompt ou na raiz do body
    let textPrompt: string =
      sensorData.textPrompt ||
      sensorData.prompt ||
      sensorData.text ||
      sensorData.command ||
      body.prompt ||
      body.textPrompt ||
      body.text ||
      '';

    const audioBase64: string | undefined = sensorData.audioBase64 || body.audioBase64;
    const webcamFrame: string | undefined =
      sensorData.webcamFrame || sensorData.faceFrameBase64 || body.webcamFrame;
    let screenFrame: string | undefined =
      sensorData.screenFrame ||
      sensorData.screenBase64 ||
      sensorData.imagePayload?.dataBase64 ||
      body.screenFrame;
    const requireBiometrics: boolean = Boolean(sensorData.requireBiometrics);

    // 1. Se vier áudio bruto sem texto pré-transcrito, aciona o Whisper Local
    if (!textPrompt && audioBase64) {
      console.log('🎙️ [Webhook Ingress] Áudio bruto recebido. Acionando Whisper Local (small)...');
      const sttResult = await transcribeWithLocalWhisper(audioBase64, 'small');
      if (sttResult.success && sttResult.text) {
        textPrompt = sttResult.text;
      } else {
        return res.status(400).json({
          success: false,
          error: sttResult.error || 'Não foi possível transcrever o áudio enviado.'
        });
      }
    }

    if (!textPrompt.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Nenhum estímulo de texto ou voz válido foi recebido.'
      });
    }

    sensorData.textPrompt = textPrompt;
    sensorData.prompt = textPrompt;

    // 2. Validação e Governança Biométrica
    let biometricStatus = {
      verified: true,
      confidence: 1.0,
      role: 'admin',
      fullName: identityToken
    };

    const isCriticalCommand =
      /deletar|apagar|formatar|transferir|pix|senha|servidor|deploy|banco|drop/i.test(
        textPrompt
      );

    if (webcamFrame || requireBiometrics || isCriticalCommand) {
      console.log('📷 [Biometria] Validando Crachá Biométrico para:', identityToken);
      const verifyFn = (biometricService as any).verifyBiometricIdentity;
      const enforceFn = (biometricService as any).enforceBiometricGovernance;

      if (typeof verifyFn === 'function') {
        const bioCheck: any = await verifyFn({
          identityToken,
          webcamFrameBase64: webcamFrame || '',
          frameBase64: webcamFrame || '',
          voiceSignatureHash: sensorData.voiceSignatureHash
        });

        biometricStatus = {
          verified: bioCheck?.verified ?? true,
          confidence: bioCheck?.confidenceScore ?? 0.95,
          role: bioCheck?.role || 'admin',
          fullName: bioCheck?.fullName || identityToken
        };
      }

      if (typeof enforceFn === 'function') {
        const governance = enforceFn(biometricStatus, textPrompt);
        if (!governance.allowed) {
          safeEmit({
            neurotransmitter: 'CORTISOL',
            sourceNode: 'biometric_guard',
            targetNode: 'central_brain',
            intensity: 1.0,
            message: `Bloqueio de Governança: ${governance.reason}`
          });

          return res.status(403).json({
            success: false,
            sessionId,
            biometricStatus,
            error: governance.reason
          });
        }
      } else if (!biometricStatus.verified && (isCriticalCommand || requireBiometrics)) {
        safeEmit({
          neurotransmitter: 'CORTISOL',
          sourceNode: 'biometric_guard',
          targetNode: 'central_brain',
          intensity: 1.0,
          message: 'Bloqueio Biométrico! Reconhecimento inválido para comando crítico.'
        });

        return res.status(403).json({
          success: false,
          sessionId,
          biometricStatus,
          error: '⛔ Acesso Negado pelo Crachá Biométrico: Reconhecimento facial inválido para operação crítica.'
        });
      }
    }

    // 3. Captura Automática da Tela ("Olhos do JARVIS")
    const lowerPrompt = textPrompt.toLowerCase();
    const askedForScreen =
      Boolean(sensorData.captureScreen) ||
      lowerPrompt.includes('olhe minha tela') ||
      lowerPrompt.includes('olha minha tela') ||
      lowerPrompt.includes('veja a tela') ||
      lowerPrompt.includes('veja minha tela') ||
      lowerPrompt.includes('analise minha tela') ||
      lowerPrompt.includes('analise o código') ||
      lowerPrompt.includes('o que está na tela');

    if (!screenFrame && askedForScreen) {
      console.log('👁️ [Vision Capture] Comando visual detectado! Capturando tela ativa...');
      const visionRes = await captureActiveScreenBase64();
      if (visionRes.success && visionRes.base64Image) {
        screenFrame = visionRes.base64Image;
        sensorData.hasVision = true;
        sensorData.imagePayload = {
          mimeType: visionRes.mimeType || 'image/jpeg',
          dataBase64: visionRes.base64Image
        };
      }
    } else if (screenFrame && !sensorData.imagePayload) {
      sensorData.hasVision = true;
      sensorData.imagePayload = {
        mimeType: 'image/jpeg',
        dataBase64: screenFrame.replace(/^data:image\/\w+;base64,/, '')
      };
    }

    // 4. Pulso de Entrada Sensorial (Acetilcolina)
    safeEmit({
      neurotransmitter: 'ACETILCOLINA',
      sourceNode:
        sensorData.inputSource === 'python_voice_sentinel'
          ? 'auditory_cortex_whisper'
          : 'sensory_ingress',
      targetNode: 'central_brain',
      intensity: 0.85,
      message: `Estímulo recebido (${identityToken}): "${textPrompt.slice(0, 70)}"`
    });

    // 5. Executa o Orquestrador Central Multimodal
    let executionResult: any;
    if (typeof processWorkflowExecution === 'function') {
      executionResult = await processWorkflowExecution(
        identityToken,
        textPrompt,
        sessionId,
        {
          screenFrame,
          webcamFrame,
          biometricVerified: biometricStatus.verified,
          biometricRole: biometricStatus.role,
          sensorData
        }
      );
    } else {
      executionResult = await processOrchestratorWorkflow({
        identityToken: biometricStatus.fullName,
        sessionId,
        sensorData
      });
    }

    // Resposta desestruturada na raiz para consumo imediato do front-end e composables 3D
    return res.status(200).json({
      success: executionResult?.success ?? true,
      triggeredSuccess: executionResult?.triggeredSuccess ?? true,
      agent: executionResult?.agent || 'JARVIS',
      agentId: executionResult?.agentId || 'jarvis_core',
      nodeType: executionResult?.nodeType || 'core',
      memoryStored: executionResult?.memoryStored ?? true,
      memoryCount: executionResult?.memoryCount ?? 0,
      identity: identityToken,
      sessionId,
      response: executionResult?.response || executionResult?.textoFinal || '',
      transcribedText: textPrompt,
      biometricBadge: biometricStatus,
      biometricStatus,
      visionCaptured: Boolean(screenFrame),
      executionTimeMs: Date.now() - startTime,
      data: executionResult
    });
  } catch (error: any) {
    console.error('❌ [Erro no Webhook Ingress]:', error?.message || error);
    safeEmit({
      neurotransmitter: 'CORTISOL',
      sourceNode: 'central_brain',
      targetNode: 'error_handler',
      intensity: 1.0,
      message: `Falha no processamento: ${error?.message || 'Erro interno'}`
    });

    return res.status(500).json({
      success: false,
      executionTimeMs: Date.now() - startTime,
      error: error?.message || 'Erro interno no processamento do Orquestrador.'
    });
  }
}
