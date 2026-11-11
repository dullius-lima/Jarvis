// src/services/orchestrator/cortexSensorial.ts
import { pool } from '../../config/database.js';
import { appendShortTermMemory } from '../shortTermMemoryService.js';
import { identifySpeaker, enrollSpeakerVoice, extractAcousticFeatures } from '../voiceBiometricService.js';
import { transcribeWithLocalWhisper } from '../whisperLocalService.js';
import { SensoryAttachments, SensorPayload } from './brainConfigAndUtils.js';

// Mantém a janela de conversa ativa por 30 segundos após chamar "Jarvis"
const activeWakeSessions = new Map<string, number>();

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

  const isStrictWakeWordCheck = promptEfetivo === '__WAKE_WORD_CHECK__';
  const isDirectMicClick = promptEfetivo === '__VAD_AUDIO_ONLY__';
  const needsAudioTranscription = isStrictWakeWordCheck || isDirectMicClick || promptEfetivo === '';

  const rawAudioInput =
    sensoryInput?.audioBase64 ||
    sensoryInput?.sensorData?.audioBase64 ||
    sensoryInput?.sensorData?.audio ||
    sensoryInput?.audio;

  // 1. Extração segura da Base64 pura
  let audioDataOnly = '';
  if (typeof rawAudioInput === 'string' && rawAudioInput.length > 50) {
    if (rawAudioInput.includes('|DATA:')) {
      audioDataOnly = rawAudioInput.split('|DATA:')[1] || '';
    } else {
      const { rawAudioBase64 } = extractAcousticFeatures(rawAudioInput);
      audioDataOnly = rawAudioBase64 && rawAudioBase64.length > 100 ? rawAudioBase64 : rawAudioInput;
    }
  }

  // 2. Transcrição via Whisper (Groq Whisper Turbo ou Faster-Whisper Local)
  if (needsAudioTranscription && audioDataOnly && audioDataOnly.length > 150 && audioDataOnly !== 'SPEECH_SAMPLE') {
    try {
      const whisperRes: any = await transcribeWithLocalWhisper(audioDataOnly);
      const textoExtraido =
        typeof whisperRes === 'string'
          ? whisperRes.trim()
          : (whisperRes?.text || '').trim();

      // Filtra alucinações clássicas de silêncio do Whisper
      const ehRuidoSilencio =
        /^(obrigad[oa]|legendas|amara\.org|inscreva-se|tchau|até logo|silêncio|\.+|\s*)$/i.test(
          textoExtraido.replace(/[!.,?]/g, '').trim()
        );

      if (textoExtraido.length > 1 && !ehRuidoSilencio) {
        promptEfetivo = textoExtraido;
      } else {
        promptEfetivo = '';
      }
    } catch (e: any) {
      console.warn('⚠️ [Whisper] Falha na transcrição:', e?.message);
      promptEfetivo = '';
    }
  }

  // 3. Descarte silencioso se não houve fala compreensível
  if (!promptEfetivo || promptEfetivo === '__VAD_AUDIO_ONLY__' || promptEfetivo === '__WAKE_WORD_CHECK__') {
    return {
      interceptado: true,
      promptTranscrito: '',
      activeSpeakerName,
      speakerRole,
      isVoiceIdentified: false,
      respostaPronta: {
        success: true,
        ignored: true,
        silentIgnore: true,
        agent: 'JARVIS',
        agentId: 'jarvis_core',
        response: '',
        executionTimeMs: Date.now() - inicioExecucao
      }
    };
  }

  // 4. Reconhecimento Fonético Abrangente de "Jarvis" (cobre variações do STT em português)
  const regexContemJarvis =
    /\b(jarvis|j[aá]rvis|j[aá]vis|jarves|javes|iarvis|yarvis|darvis|charvis|jarbas|chaves)\b|^(?:oi\s+|ol[aá]\s+)?j[aá]\s+fiz\b/i;

  const falouJarvisAgora = regexContemJarvis.test(promptEfetivo);
  const lastWakeTime = activeWakeSessions.get(sessionId) || 0;
  const estaEmJanelaDeConversaAtiva = Date.now() - lastWakeTime < 30000;

  // Se veio da Vigília Automática e a pessoa ao lado NÃO disse "Jarvis" e NÃO está em conversa ativa -> IGNORA EM SILÊNCIO!
  if (isStrictWakeWordCheck && !falouJarvisAgora && !estaEmJanelaDeConversaAtiva) {
    console.log(`🔇 [Vigília Ignorou conversa paralela sem "Jarvis"]: "${promptEfetivo}"`);
    return {
      interceptado: true,
      promptTranscrito: '',
      activeSpeakerName,
      speakerRole,
      isVoiceIdentified: false,
      respostaPronta: {
        success: true,
        ignored: true,
        silentIgnore: true,
        agent: 'JARVIS',
        agentId: 'jarvis_core',
        response: '',
        executionTimeMs: Date.now() - inicioExecucao
      }
    };
  }

  // Ativa/renova a janela de conversa por 30 segundos!
  activeWakeSessions.set(sessionId, Date.now());

  // 5. Biometria Vocal + Treinamento Voice Match
  if (audioDataOnly && audioDataOnly.length > 12) {
    try {
      const matchCadastro = promptEfetivo.match(
        /(?:sou\s+(?:o|a)?|meu\s+nome\s+[eé]|aqui\s+[eé]\s+(?:o|a)?|aqui\s+quem\s+fala\s+[eé]\s+(?:o|a)?|treinar\s+(?:a\s+)?voz\s+(?:do|da)?|cadastre\s+a\s+voz\s+(?:do|da)?)\s+([A-Za-zÀ-ÖØ-öø-ÿ]+)/i
      );

      if (matchCadastro && matchCadastro[1]) {
        const nomeDetectado =
          matchCadastro[1].charAt(0).toUpperCase() + matchCadastro[1].slice(1).toLowerCase();
        const papelAtribuido = nomeDetectado.toLowerCase().includes('matheus') ? 'admin' : 'family';

        const enrolled = await enrollSpeakerVoice(nomeDetectado, audioDataOnly, papelAtribuido);

        let respostaCadastro = '';
        if (enrolled.samplesCount === 1) {
          respostaCadastro = `Perfeito, ${nomeDetectado}! Gravei a 1ª amostra da sua voz (${enrolled.pitchHz.toFixed(0)} Hz). Para calibrar, diga: "Jarvis, aqui quem fala é ${nomeDetectado}".`;
        } else if (enrolled.samplesCount === 2) {
          respostaCadastro = `Excelente, ${nomeDetectado}! 2ª amostra calibrada. Para finalizar, diga: "Jarvis, eu sou ${nomeDetectado} e minha voz está ativa".`;
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
            identity: nomeDetectado,
            sessionId,
            response: respostaCadastro,
            executionTimeMs: Date.now() - inicioExecucao
          }
        };
      }

      const checagemVoz = await identifySpeaker(audioDataOnly);
      if (checagemVoz && checagemVoz.identified) {
        activeSpeakerName = checagemVoz.name;
        speakerRole = checagemVoz.role;
        isVoiceIdentified = true;
      }
    } catch {}
  }

  // 6. Se o usuário falou apenas "Jarvis" ou "Oi Jarvis" (sem comando ainda)
  const padraoWakeWordInicio =
    /^(?:oi|ol[aá]|ei|ok|fala|e a[ií])?\s*(?:jarvis|j[aá]rvis|j[aá]vis|jarves|javes|iarvis|yarvis|darvis|charvis|jarbas|chaves|j[aá]\s+fiz)[,.\s!?-]*/i;
  const apenasChamouWakeWord =
    /^(?:oi|ol[aá]|ei|ok|fala|e a[ií])?\s*(?:jarvis|j[aá]rvis|j[aá]vis|jarves|javes|iarvis|yarvis|darvis|charvis|jarbas|chaves|j[aá]\s+fiz)[!.,?\s]*$/i.test(
      promptEfetivo
    );

  if (apenasChamouWakeWord) {
    const saudacaoVoz = `Sim, ${activeSpeakerName}? Estou ouvindo. O que você precisa?`;
    appendShortTermMemory(sessionId, 'user', 'Jarvis');
    appendShortTermMemory(sessionId, 'assistant', saudacaoVoz);

    return {
      interceptado: true,
      promptTranscrito: 'Jarvis',
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

  // 7. Remove o prefixo "Jarvis," e envia a ordem limpa diretamente ao Orquestrador Central!
  const comandoLimpo = promptEfetivo.replace(padraoWakeWordInicio, '').trim();
  console.log(`🎯 [Comando de Voz Entregue ao Orquestrador]: "${comandoLimpo || promptEfetivo}"`);

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
