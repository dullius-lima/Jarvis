// src/services/orchestrator/cortexSensorial.ts
import { pool } from '../../config/database.js';
import { appendShortTermMemory } from '../shortTermMemoryService.js';
import { identifySpeaker, enrollSpeakerVoice, extractAcousticFeatures } from '../voiceBiometricService.js';
import { transcribeWithLocalWhisper } from '../whisperLocalService.js';
import { SensoryAttachments, SensorPayload } from './brainConfigAndUtils.js';

// Mantém controle de quando o JARVIS foi chamado pelo nome para permitir resposta contínua por 25s
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
  const isWakeWordCheckMode =
    promptEfetivo === '__VAD_AUDIO_ONLY__' ||
    promptEfetivo === '__WAKE_WORD_CHECK__' ||
    promptEfetivo === '';

  const rawAudioInput =
    sensoryInput?.audioBase64 ||
    sensoryInput?.sensorData?.audioBase64 ||
    sensoryInput?.sensorData?.audio ||
    sensoryInput?.audio;

  // 1. Extração segura da Base64 pura (descartando prefixos de pitch/energy caso existam)
  let audioDataOnly = '';
  if (typeof rawAudioInput === 'string' && rawAudioInput.length > 50) {
    if (rawAudioInput.includes('|DATA:')) {
      audioDataOnly = rawAudioInput.split('|DATA:')[1] || '';
    } else {
      const { rawAudioBase64 } = extractAcousticFeatures(rawAudioInput);
      audioDataOnly = rawAudioBase64 && rawAudioBase64.length > 100 ? rawAudioBase64 : rawAudioInput;
    }
  }

  // 2. Transcrição via Whisper (Groq Turbo ou Local)
  if (isWakeWordCheckMode && audioDataOnly && audioDataOnly.length > 150 && audioDataOnly !== 'SPEECH_SAMPLE') {
    try {
      const whisperRes: any = await transcribeWithLocalWhisper(audioDataOnly);
      const textoExtraido =
        typeof whisperRes === 'string'
          ? whisperRes.trim()
          : (whisperRes?.text || '').trim();

      // Filtra alucinações típicas de ruído/silêncio do Whisper
      const ehRuidoSilencio = /^(obrigad[oa]|legendas|amara\.org|inscreva-se|\.+|\s*)$/i.test(
        textoExtraido.replace(/[!.,?]/g, '').trim()
      );

      if (textoExtraido.length > 1 && !ehRuidoSilencio) {
        promptEfetivo = textoExtraido;
      } else {
        promptEfetivo = '';
      }
    } catch (e: any) {
      console.warn('⚠️ [Whisper Fallback] Falha na transcrição:', e?.message);
      promptEfetivo = '';
    }
  }

  // 3. Descarte silencioso para ruídos sem fala perceptível
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

  // 4. Verificação estrita da Wake Word ("Jarvis") e Janela de Conversa
  const regexContemJarvis = /\b(jarvis|j[aá]vis|jarves|iarvis|jarbas|chaves|j[aá]rvis)\b/i;
  const falouJarvisAgora = regexContemJarvis.test(promptEfetivo);
  const lastWakeTime = activeWakeSessions.get(sessionId) || 0;
  const estaEmJanelaDeConversaAtiva = Date.now() - lastWakeTime < 25000;

  // Se veio do microfone e NÃO disse "Jarvis" e NÃO está em conversa ativa -> IGNORA EM SILÊNCIO
  if (isWakeWordCheckMode && !falouJarvisAgora && !estaEmJanelaDeConversaAtiva) {
    console.log(`🔇 [Vigília Ignorou fala sem "Jarvis"]: "${promptEfetivo}"`);
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

  // Se falou "Jarvis", renova a janela de conversa ativa por 25 segundos
  if (falouJarvisAgora || !isWakeWordCheckMode) {
    activeWakeSessions.set(sessionId, Date.now());
  }

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
    } catch (err: any) {
      console.warn('⚠️ [Córtex Sensorial] Aviso na biometria vocal:', err?.message);
    }
  }

  // 6. Se o usuário falou estritamente a Wake Word ("Jarvis", "Oi Jarvis")
  const padraoWakeWordInicio = /^(?:oi|ol[aá]|ei|ok|fala|e a[ií])?\s*(?:jarvis|j[aá]vis|jarves|iarvis|jarbas|chaves|j[aá]rvis)[,.\s!?-]*/i;
  const apenasChamouWakeWord = /^(?:oi|ol[aá]|ei|ok|fala|e a[ií])?\s*(?:jarvis|j[aá]vis|jarves|iarvis|jarbas|chaves|j[aá]rvis)[!.,?\s]*$/i.test(promptEfetivo);

  if (apenasChamouWakeWord) {
    activeWakeSessions.set(sessionId, Date.now());
    const saudacaoVoz = `Sim, ${activeSpeakerName}? Estou ouvindo. Pode falar o seu comando.`;
    appendShortTermMemory(sessionId, 'user', promptEfetivo);
    appendShortTermMemory(sessionId, 'assistant', saudacaoVoz);

    pool.query(
      `INSERT INTO jarvis_chat_memory (session_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3);`,
      [sessionId, promptEfetivo, saudacaoVoz]
    ).catch(() => {});

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

  // 7. Limpeza da palavra-chave: extrai o comando real para envio à LLM/Subagentes
  const comandoLimpo = promptEfetivo.replace(padraoWakeWordInicio, '').trim();
  activeWakeSessions.set(sessionId, Date.now());

  // Filtro de saudações de texto simples que não demandam LLM
  const textoLimpo = (comandoLimpo || promptEfetivo).toLowerCase().replace(/[!.,?]/g, '');
  const ehSaudacaoBasica = /^(oi|ol[aá]|bom dia|boa tarde|boa noite|e ai|ei|fala ai)$/i.test(textoLimpo);

  if (ehSaudacaoBasica) {
    const respostaSaudacao = `Olá, ${activeSpeakerName}! Todos os sistemas estão operacionais. Como posso ajudar você agora?`;
    appendShortTermMemory(sessionId, 'user', promptEfetivo);
    appendShortTermMemory(sessionId, 'assistant', respostaSaudacao);

    pool.query(
      `INSERT INTO jarvis_chat_memory (session_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3);`,
      [sessionId, promptEfetivo, respostaSaudacao]
    ).catch(() => {});

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
