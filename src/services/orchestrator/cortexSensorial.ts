// src/services/orchestrator/cortexSensorial.ts
import { pool } from '../../config/database.js';
import { appendShortTermMemory } from '../shortTermMemoryService.js';
import { identifySpeaker, enrollSpeakerVoice, extractAcousticFeatures } from '../voiceBiometricService.js';
import { transcribeWithLocalWhisper } from '../whisperLocalService.js';
import { SensoryAttachments, SensorPayload } from './brainConfigAndUtils.js';

export interface RespostaFiltroSensorial {
  interceptado: boolean;
  promptTranscrito?: string;
  respostaPronta?: any;
  activeSpeakerName: string;
  speakerRole: string;
  isVoiceIdentified: boolean;
}

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
  let promptEfetivo = (userPrompt || '').trim();

  const audioSample =
    sensoryInput?.audioBase64 ||
    sensoryInput?.sensorData?.audioBase64 ||
    sensoryInput?.sensorData?.audio ||
    sensoryInput?.audio;

  // 0. Fallback Whisper Local caso o frontend envie apenas o áudio
  if ((!promptEfetivo || promptEfetivo === '__VAD_AUDIO_ONLY__') && audioSample) {
    const { rawAudioBase64 } = extractAcousticFeatures(audioSample);
    const b64ToTranscribe = rawAudioBase64 && rawAudioBase64.length > 150 ? rawAudioBase64 : audioSample;

    if (b64ToTranscribe && b64ToTranscribe.length > 150 && b64ToTranscribe !== 'SPEECH_SAMPLE') {
      try {
        const whisperRes: any = await transcribeWithLocalWhisper(b64ToTranscribe);
        const textoExtraido =
          typeof whisperRes === 'string'
            ? whisperRes.trim()
            : (whisperRes?.text || '').trim();

        if (textoExtraido.length > 0) {
          promptEfetivo = textoExtraido;
        } else {
          promptEfetivo = '';
        }
      } catch (e: any) {
        console.warn('⚠️ [Whisper Fallback] Erro na transcrição local:', e?.message);
        promptEfetivo = '';
      }
    } else {
      promptEfetivo = '';
    }
  }

  if (promptEfetivo === '__VAD_AUDIO_ONLY__' || !promptEfetivo) {
    const msgNaoOuvi = `Não consegui captar o áudio com clareza, ${activeSpeakerName}. Toque no microfone e repita o comando.`;
    return {
      interceptado: true,
      promptTranscrito: '',
      activeSpeakerName,
      speakerRole,
      isVoiceIdentified: false,
      respostaPronta: {
        success: true,
        triggeredSuccess: true,
        agent: 'JARVIS',
        agentId: 'jarvis_core',
        nodeType: 'core',
        identity: activeSpeakerName,
        sessionId,
        response: msgNaoOuvi,
        executionTimeMs: Date.now() - inicioExecucao
      }
    };
  }

  // 1. Biometria Vocal + Treinamento Voice Match
  if (audioSample && typeof audioSample === 'string' && audioSample.length > 12) {
    try {
      const matchCadastro = promptEfetivo.match(
        /(?:sou\s+(?:o|a)?|meu\s+nome\s+[eé]|aqui\s+[eé]\s+(?:o|a)?|aqui\s+quem\s+fala\s+[eé]\s+(?:o|a)?|treinar\s+(?:a\s+)?voz\s+(?:do|da)?|cadastre\s+a\s+voz\s+(?:do|da)?)\s+([A-Za-zÀ-ÖØ-öø-ÿ]+)/i
      );

      if (matchCadastro && matchCadastro[1]) {
        const nomeDetectado =
          matchCadastro[1].charAt(0).toUpperCase() + matchCadastro[1].slice(1).toLowerCase();
        const papelAtribuido = nomeDetectado.toLowerCase().includes('matheus') ? 'admin' : 'family';

        const enrolled = await enrollSpeakerVoice(nomeDetectado, audioSample, papelAtribuido);

        let respostaCadastro = '';
        if (enrolled.samplesCount === 1) {
          respostaCadastro = `Perfeito, ${nomeDetectado}! Gravei a 1ª amostra da sua voz (${enrolled.pitchHz.toFixed(0)} Hz). Para calibrar, diga: "Jarvis, aqui quem fala é ${nomeDetectado}".`;
        } else if (enrolled.samplesCount === 2) {
          respostaCadastro = `Excelente, ${nomeDetectado}! 2ª amostra calibrada. Para finalizar, diga: "Eu sou ${nomeDetectado} e minha voz está ativa".`;
        } else {
          respostaCadastro = `Treinamento Voice Match concluído para ${nomeDetectado} (${enrolled.pitchHz.toFixed(0)} Hz)! Como posso ajudar?`;
        }

        appendShortTermMemory(sessionId, 'user', promptEfetivo);
        appendShortTermMemory(sessionId, 'assistant', respostaCadastro);

        pool.query(
          `INSERT INTO jarvis_chat_memory (session_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3);`,
          [sessionId, promptEfetivo, respostaCadastro]
        ).catch(() => {});

        return {
          interceptado: true,
          promptTranscrito: promptEfetivo,
          activeSpeakerName: nomeDetectado,
          speakerRole: papelAtribuido,
          isVoiceIdentified: true,
          respostaPronta: {
            success: true,
            triggeredSuccess: true,
            agent: 'JARVIS (Voice Match)',
            agentId: 'jarvis_core',
            nodeType: 'core',
            memoryStored: true,
            memoryCount: historicoLinhas + 2,
            identity: nomeDetectado,
            speaker: {
              name: nomeDetectado,
              role: papelAtribuido,
              identified: true,
              samplesCount: enrolled.samplesCount
            },
            sessionId,
            response: respostaCadastro,
            executionTimeMs: Date.now() - inicioExecucao
          }
        };
      }

      const checagemVoz = await identifySpeaker(audioSample);
      if (checagemVoz.identified) {
        activeSpeakerName = checagemVoz.name;
        speakerRole = checagemVoz.role;
        isVoiceIdentified = true;
      }
    } catch (err: any) {
      console.warn('⚠️ [Córtex Sensorial] Aviso na biometria vocal:', err?.message);
    }
  }

  // 2. Limpeza da Wake Word e Detecção de Chamada Isolada
  const padraoWakeWord = /^(?:oi|ol[aá]|ei|ok|fala)?\s*(?:jarvis|j[aá]vis|jarves|iarvis|jarbas|chaves)[,.\s!?-]*/i;
  const apenasChamouWakeWord = /^(?:oi|ol[aá]|ei|ok|fala)?\s*(?:jarvis|j[aá]vis|jarves|iarvis|jarbas|chaves)[!.,?\s]*$/i.test(promptEfetivo);

  if (apenasChamouWakeWord) {
    const saudacaoVoz = `Sim, ${activeSpeakerName}? Estou ouvindo. O que você precisa?`;
    appendShortTermMemory(sessionId, 'user', promptEfetivo);
    appendShortTermMemory(sessionId, 'assistant', saudacaoVoz);

    return {
      interceptado: true,
      promptTranscrito: promptEfetivo,
      activeSpeakerName,
      speakerRole,
      isVoiceIdentified,
      respostaPronta: {
        success: true,
        triggeredSuccess: true,
        agent: 'JARVIS',
        agentId: 'jarvis_core',
        nodeType: 'core',
        identity: activeSpeakerName,
        sessionId,
        response: saudacaoVoz,
        executionTimeMs: Date.now() - inicioExecucao
      }
    };
  }

  const comandoLimpo = promptEfetivo.replace(padraoWakeWord, '').trim();

  // 3. Filtro de saudações básicas
  const textoLimpo = (comandoLimpo || promptEfetivo).toLowerCase().replace(/[!.,?]/g, '');
  const ehSaudacaoBasica = /^(oi|ol[aá]|bom dia|boa tarde|boa noite|e ai|ei|fala ai)$/i.test(textoLimpo);

  if (ehSaudacaoBasica) {
    const respostaSaudacao = `Olá, ${activeSpeakerName}! Todos os sistemas estão operacionais. Como posso ajudar você agora?`;
    appendShortTermMemory(sessionId, 'user', promptEfetivo);
    appendShortTermMemory(sessionId, 'assistant', respostaSaudacao);

    return {
      interceptado: true,
      promptTranscrito: promptEfetivo,
      activeSpeakerName,
      speakerRole,
      isVoiceIdentified,
      respostaPronta: {
        success: true,
        triggeredSuccess: true,
        agent: 'JARVIS',
        agentId: 'jarvis_core',
        nodeType: 'core',
        identity: activeSpeakerName,
        sessionId,
        response: respostaSaudacao,
        executionTimeMs: Date.now() - inicioExecucao
      }
    };
  }

  return {
    interceptado: false,
    promptTranscrito: comandoLimpo || promptEfetivo,
    activeSpeakerName,
    speakerRole,
    isVoiceIdentified
  };
}

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
    instrucaoVisualSistema = `\n\n[SINAL VISUAL ATIVO - ${rotuloOrigem}]: Você está visualizando o usuário (${activeSpeakerName}) em tempo real pela imagem anexada. Descreva de forma objetiva e natural.`;

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
