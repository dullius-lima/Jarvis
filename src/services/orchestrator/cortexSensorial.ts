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
  const needsTranscription = isStrictWakeWordCheck || isDirectMicClick || promptEfetivo === '';

  const rawAudioInput =
    sensoryInput?.audioBase64 ||
    sensoryInput?.sensorData?.audioBase64 ||
    sensoryInput?.sensorData?.audio ||
    sensoryInput?.audio;

  // 1. Extração da Base64 pura para envio ao Whisper
  let audioDataOnly = '';
  if (typeof rawAudioInput === 'string' && rawAudioInput.length > 50) {
    if (rawAudioInput.includes('|DATA:')) {
      audioDataOnly = rawAudioInput.split('|DATA:')[1] || '';
    } else {
      const { rawAudioBase64 } = extractAcousticFeatures(rawAudioInput);
      audioDataOnly = rawAudioBase64 && rawAudioBase64.length > 100 ? rawAudioBase64 : rawAudioInput;
    }
    audioDataOnly = audioDataOnly.replace(/^data:audio\/[a-zA-Z0-9+-]+;base64,/, '').trim();
  }

  // 2. Transcrição de áudio via Whisper (Groq Turbo 200ms ou Faster-Whisper Local)
  if (needsTranscription && audioDataOnly && audioDataOnly.length > 150 && audioDataOnly !== 'SPEECH_SAMPLE') {
    try {
      const whisperRes: any = await transcribeWithLocalWhisper(audioDataOnly);
      const texto = typeof whisperRes === 'string' ? whisperRes.trim() : (whisperRes?.text || '').trim();

      const ehRuido = /^(obrigad[oa]|legendas|amara\.org|inscreva-se|tchau|até logo|silêncio|\.+|\s*)$/i.test(
        texto.replace(/[!.,?]/g, '').trim()
      );

      if (texto.length > 1 && !ehRuido) {
        promptEfetivo = texto;
        console.log(`🎙️ [Córtex Sensorial] Áudio transcrito: "${promptEfetivo}" | Modo: ${isStrictWakeWordCheck ? 'Vigília' : 'Direto'}`);
      } else {
        promptEfetivo = '';
      }
    } catch (e: any) {
      console.warn('⚠️ [Córtex Sensorial] Falha na transcrição:', e?.message);
      promptEfetivo = '';
    }
  }

  // 3. Tratamento quando não há fala identificável
  if (!promptEfetivo || promptEfetivo === '__VAD_AUDIO_ONLY__' || promptEfetivo === '__WAKE_WORD_CHECK__') {
    // Se o usuário clicou no botão do microfone para falar e nada foi captado, informa com voz
    if (isDirectMicClick) {
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

    // Se for da vigília de fundo automática, descarta em absoluto silêncio
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

  // 4. Normalização Fonética Ampla para detecção da Wake Word ("Jarvis")
  // Transforma siglas como "J.A.R.V.I.S." em "jarvis" e remove acentos
  // 4. Reconhecimento Fonético Abrangente de "Jarvis"
  const promptNormalizado = promptEfetivo
    .toLowerCase()
    .replace(/\bj\s*\.?\s*a\s*\.?\s*r\s*\.?\s*v\s*\.?\s*i\s*\.?\s*s\b/gi, 'jarvis')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const regexContemJarvis =
    /(?:^|\s|\b)(jarvis|javis|jarves|javes|iarvis|yarvis|darvis|charvis|jarbas|chaves|ja\s+vi|ja\s+viu|ja\s+fiz)(?:\b|\s|[!.,?]|$)/i;

  const falouJarvisAgora = regexContemJarvis.test(promptNormalizado);
  const sessionKey = (sessionId || 'sess_main_admin').toLowerCase();
  const lastWakeTime = activeWakeSessions.get(sessionKey) || 0;
  const estaEmJanelaDeConversaAtiva = Date.now() - lastWakeTime < 30000;

  // Se veio da Vigília Automática e a pessoa NÃO disse "Jarvis" e NÃO está em conversa ativa -> IGNORA EM SILÊNCIO
  if (isStrictWakeWordCheck && !falouJarvisAgora && !estaEmJanelaDeConversaAtiva) {
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

  // Renova janela de conversa ativa por 30 segundos
  activeWakeSessions.set(sessionKey, Date.now());

   // 5. Biometria Vocal e Treinamento Voice Match
  // 5. Biometria Vocal e Treinamento Voice Match
  if (rawAudioInput && typeof rawAudioInput === 'string' && rawAudioInput.length > 12) {
    try {
      const matchCadastro = promptEfetivo.match(
        /(?:sou\s+(?:o|a)?|meu\s+nome\s+[eé]|aqui\s+[eé]\s+(?:o|a)?|cadastre\s+a\s+voz\s+(?:do|da)?)\s+([A-Za-zÀ-ÖØ-öø-ÿ]+)/i
      );

      if (matchCadastro && matchCadastro[1]) {
        const nomeDetectado = matchCadastro[1].charAt(0).toUpperCase() + matchCadastro[1].slice(1).toLowerCase();
        const papelAtribuido = nomeDetectado.toLowerCase().includes('matheus') ? 'admin' : 'family';
        const enrolled = await enrollSpeakerVoice(nomeDetectado, rawAudioInput, papelAtribuido);

        let respostaCadastro = '';
        if (enrolled.samplesCount === 1) {
          respostaCadastro = `Perfeito, ${nomeDetectado}! Gravei a 1ª amostra da sua voz. Diga a segunda frase para calibrar.`;
        } else if (enrolled.samplesCount === 2) {
          respostaCadastro = `Excelente, ${nomeDetectado}! 2ª amostra calibrada. Diga mais uma frase para finalizar.`;
        } else {
          respostaCadastro = `Treinamento Voice Match concluído para ${nomeDetectado}! Já reconheço sua voz automaticamente.`;
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

      // Identifica o locutor pelo pacote acústico completo
      const checagemVoz = await identifySpeaker(rawAudioInput);
      if (checagemVoz && checagemVoz.identified) {
        activeSpeakerName = checagemVoz.name;
        speakerRole = checagemVoz.role;
        isVoiceIdentified = true;
      }
    } catch (err: any) {
      console.warn('⚠️ [Córtex Sensorial] Aviso na biometria vocal:', err?.message);
    }
  }

  // 6. Se o usuário chamou exclusivamente a Wake Word ("Jarvis", "Oi Jarvis")
  const padraoApenasWakeWord =
    /^(?:oi|ol[aá]|ei|ok|fala|al[oô]|e a[ií])?\s*(?:jarvis|j[aá]rvis|j[aá]vis|jarves|javes|iarvis|yarvis|darvis|charvis|jarbas|chaves|j\s*\.?\s*a\s*\.?\s*r\s*\.?\s*v\s*\.?\s*i\s*\.?\s*s\b|j[aá]\s+fiz)[!.,?:\s]*$/i;

  if (padraoApenasWakeWord.test(promptEfetivo.trim())) {
    const saudacaoVoz = `Sim, ${activeSpeakerName}? Estou ouvindo. O que você precisa?`;
    appendShortTermMemory(sessionId, 'user', 'Jarvis');
    appendShortTermMemory(sessionId, 'assistant', saudacaoVoz);

    pool.query(
      `INSERT INTO jarvis_chat_memory (session_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3);`,
      [sessionId, 'Jarvis', saudacaoVoz]
    ).catch(() => {});

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

  // 7. Extrai o comando real retirando a palavra de ativação do início
  const padraoWakeWordInicio =
    /^(?:oi|ol[aá]|ei|ok|fala|al[oô]|e a[ií])?\s*(?:jarvis|j[aá]rvis|j[aá]vis|jarves|javes|iarvis|yarvis|darvis|charvis|jarbas|chaves|j\s*\.?\s*a\s*\.?\s*r\s*\.?\s*v\s*\.?\s*i\s*\.?\s*s\b|j[aá]\s+fiz)[,.:\s!?-]*/i;

  const comandoLimpo = promptEfetivo.replace(padraoWakeWordInicio, '').trim();

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
