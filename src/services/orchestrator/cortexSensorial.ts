// src/services/orchestrator/cortexSensorial.ts
import { pool } from '../../config/database.js';
import { appendShortTermMemory } from '../shortTermMemoryService.js';
import { identifySpeaker, enrollSpeakerVoice } from '../voiceBiometricService.js';
import { SensoryAttachments, SensorPayload } from './brainConfigAndUtils.js';

export interface RespostaFiltroSensorial {
  interceptado: boolean;
  respostaPronta?: any;
  activeSpeakerName: string;
  speakerRole: string;
  isVoiceIdentified: boolean;
}

/**
 * Processa amostras de voz para biometria e filtra saudações simples sem gastar tokens de LLM
 */
export async function processarBiometriaESaudacao(
  userPrompt: string,
  identityToken: string,
  sessionId: string,
  sensoryInput?: SensorPayload | SensoryAttachments | any,
  historicoLinhas = 0,
  inicioExecucao = Date.now()
): Promise<RespostaFiltroSensorial> {
  let activeSpeakerName = identityToken || 'Matheus-Admin';
  let speakerRole = 'admin';
  let isVoiceIdentified = false;

  const audioSample =
    sensoryInput?.audioBase64 ||
    sensoryInput?.sensorData?.audioBase64 ||
    sensoryInput?.sensorData?.audio ||
    sensoryInput?.audio;

  // 1. Biometria Vocal e Reconhecimento de Locutor
  if (audioSample && typeof audioSample === 'string' && audioSample.length > 300) {
    try {
      const matchCadastro = userPrompt.match(
        /(?:sou\s+(?:o|a)?|meu\s+nome\s+[eé]|aqui\s+[eé]\s+(?:o|a)?|cadastre\s+a\s+voz\s+(?:do|da)?)\s+([A-Za-zÀ-ÖØ-öø-ÿ]+)/i
      );

      if (matchCadastro && matchCadastro[1]) {
        const nomeDetectado =
          matchCadastro[1].charAt(0).toUpperCase() + matchCadastro[1].slice(1).toLowerCase();
        const papelAtribuido = nomeDetectado.toLowerCase().includes('matheus') ? 'admin' : 'family';

        await enrollSpeakerVoice(nomeDetectado, audioSample, papelAtribuido);
        const respostaCadastro = `Prazer em falar com você, ${nomeDetectado}! Memorizei sua voz no ecossistema. Como posso ajudar agora?`;

        appendShortTermMemory(sessionId, 'user', userPrompt);
        appendShortTermMemory(sessionId, 'assistant', respostaCadastro);

        pool.query(
          `INSERT INTO jarvis_chat_memory (session_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3);`,
          [sessionId, userPrompt, respostaCadastro]
        ).catch(() => {});

        return {
          interceptado: true,
          activeSpeakerName: nomeDetectado,
          speakerRole: papelAtribuido,
          isVoiceIdentified: true,
          respostaPronta: {
            success: true,
            triggeredSuccess: true,
            agent: 'JARVIS (Biometria Vocal)',
            agentId: 'jarvis_core',
            nodeType: 'core',
            memoryStored: true,
            memoryCount: historicoLinhas + 2,
            identity: nomeDetectado,
            speaker: { name: nomeDetectado, role: papelAtribuido, identified: true, newlyEnrolled: true },
            sessionId,
            response: respostaCadastro,
            executionTimeMs: Date.now() - inicioExecucao
          }
        };
      }

      const checagemVoz = await identifySpeaker(audioSample);
      if (checagemVoz && checagemVoz.identified) {
        activeSpeakerName = checagemVoz.name;
        speakerRole = checagemVoz.role;
        isVoiceIdentified = true;
      }

      // Palavra de vigília (Wake Word isolada)
      const apenasChamouJarvis = /^(oi\s+|ol[aá]\s+|ei\s+)?(jarvis|j[aá]vis|jarves|iarvis)[!.,?\s]*$/i.test(
        userPrompt.trim()
      );

      if (apenasChamouJarvis) {
        const saudacaoVoz = isVoiceIdentified
          ? `Olá, ${activeSpeakerName}! Estou ouvindo perfeitamente. Como posso ajudar?`
          : 'Olá! Não identifiquei sua voz com exatidão. Com quem estou falando? (Você pode dizer "Sou o Matheus" para eu cadastrar).';

        appendShortTermMemory(sessionId, 'user', userPrompt);
        appendShortTermMemory(sessionId, 'assistant', saudacaoVoz);

        pool.query(
          `INSERT INTO jarvis_chat_memory (session_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3);`,
          [sessionId, userPrompt, saudacaoVoz]
        ).catch(() => {});

        return {
          interceptado: true,
          activeSpeakerName,
          speakerRole,
          isVoiceIdentified,
          respostaPronta: {
            success: true,
            triggeredSuccess: true,
            agent: 'JARVIS (Biometria Vocal)',
            agentId: 'jarvis_core',
            nodeType: 'core',
            memoryStored: true,
            memoryCount: historicoLinhas + 2,
            identity: isVoiceIdentified ? activeSpeakerName : 'Desconhecido',
            speaker: { name: activeSpeakerName, role: speakerRole, identified: isVoiceIdentified },
            sessionId,
            response: saudacaoVoz,
            executionTimeMs: Date.now() - inicioExecucao
          }
        };
      }
    } catch (err: any) {
      console.warn('⚠️ [Córtex Sensorial] Aviso na biometria vocal:', err?.message);
    }
  }

  // 2. Filtro de Saudações Básicas de Texto
  const textoLimpo = userPrompt.trim().toLowerCase().replace(/[!.,?]/g, '');
  const ehSaudacaoBasica = /^(oi|ol[aá]|bom dia|boa tarde|boa noite|e ai|ei|fala ai|jarvis)$/i.test(textoLimpo);

  if (ehSaudacaoBasica) {
    const respostaSaudacao = `Olá, ${activeSpeakerName}! Todos os sistemas estão operacionais. Como posso ajudar você agora?`;
    appendShortTermMemory(sessionId, 'user', userPrompt);
    appendShortTermMemory(sessionId, 'assistant', respostaSaudacao);

    pool.query(
      `INSERT INTO jarvis_chat_memory (session_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3);`,
      [sessionId, userPrompt, respostaSaudacao]
    ).catch(() => {});

    return {
      interceptado: true,
      activeSpeakerName,
      speakerRole,
      isVoiceIdentified,
      respostaPronta: {
        success: true,
        triggeredSuccess: true,
        agent: 'JARVIS',
        agentId: 'jarvis_core',
        nodeType: 'core',
        memoryStored: true,
        memoryCount: historicoLinhas + 2,
        identity: activeSpeakerName,
        sessionId,
        response: respostaSaudacao,
        executionTimeMs: Date.now() - inicioExecucao
      }
    };
  }

  return {
    interceptado: false,
    activeSpeakerName,
    speakerRole,
    isVoiceIdentified
  };
}

/**
 * Trata visão computacional de tela e webcam
 */
export function processarEntradaVisual(
  sensoryInput: any,
  userPrompt: string,
  activeSpeakerName: string
) {
  const frameTela =
    sensoryInput?.screenFrame ||
    sensoryInput?.sensorData?.screenFrame ||
    sensoryInput?.sensorData?.screenBase64 ||
    sensoryInput?.sensorData?.imagePayload?.dataBase64;

  const frameWebcam =
    sensoryInput?.webcamFrame ||
    sensoryInput?.sensorData?.webcamFrame ||
    sensoryInput?.sensorData?.faceFrameBase64;

  const frameAtivo = frameTela || frameWebcam;
  const ehPerguntaVisual =
    /est[aá]\s+me\s+vendo|t[aá]\s+me\s+vendo|consegue\s+me\s+ver|voc[eê]\s+me\s+v[eê]|ative\s+a\s+c[aâ]mera|olhe\s+para\s+mim|como\s+eu\s+estou|o\s+que\s+estou\s+segurando|olhe\s+minha\s+tela/i.test(
      userPrompt
    );

  let conteudoMensagemUsuario: any = userPrompt;
  let instrucaoVisualSistema = '';

  if (frameAtivo) {
    const urlFormatada = frameAtivo.startsWith('data:')
      ? frameAtivo
      : `data:image/jpeg;base64,${frameAtivo.replace(/^data:image\/\w+;base64,/, '')}`;

    const rotuloOrigem = frameWebcam ? 'WEBCAM (Ambiente do Usuário)' : 'TELA DO COMPUTADOR';
    instrucaoVisualSistema = `\n\n[SINAL VISUAL ATIVO - ${rotuloOrigem}]: Você está visualizando o usuário (${activeSpeakerName}) em tempo real pela imagem anexada. Descreva de forma objetiva e natural. Não use ferramentas para ler a imagem.`;

    conteudoMensagemUsuario = [
      {
        type: 'text',
        text: `${userPrompt}\n(Nota Técnica: Analise a captura da ${rotuloOrigem} transmitida em anexo.)`
      },
      { type: 'image_url', image_url: { url: urlFormatada } }
    ];
  }

  return {
    frameAtivo,
    ehPerguntaVisual,
    conteudoMensagemUsuario,
    instrucaoVisualSistema
  };
}