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

/**
 * Processa biometria de voz, treinamento Voice Match (Google style) e saudações rápidas
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
  let promptEfetivo = (userPrompt || '').trim();

  const audioSample =
    sensoryInput?.audioBase64 ||
    sensoryInput?.sensorData?.audioBase64 ||
    sensoryInput?.sensorData?.audio ||
    sensoryInput?.audio;

  // 0. Fallback Whisper Local: caso o VAD detecte fala humana sem texto do navegador
  if ((!promptEfetivo || promptEfetivo === '__VAD_AUDIO_ONLY__') && audioSample) {
    const { rawAudioBase64 } = extractAcousticFeatures(audioSample);
    const b64ToTranscribe = rawAudioBase64 && rawAudioBase64.length > 200 ? rawAudioBase64 : audioSample;
    if (b64ToTranscribe && b64ToTranscribe.length > 200) {
      try {
        const whisperRes = await transcribeWithLocalWhisper(b64ToTranscribe);
        if (whisperRes && whisperRes.trim().length > 0) {
          promptEfetivo = whisperRes.trim();
        }
      } catch (e: any) {
        console.warn('⚠️ [Whisper Fallback] Erro na transcrição local:', e?.message);
      }
    }
  }

  // 1. Biometria Vocal + Treinamento Voice Match
  if (audioSample && typeof audioSample === 'string' && audioSample.length > 12) {
    try {
      // 1.1 Cadastro / Treinamento de voz por comando
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
          respostaCadastro = `Perfeito, ${nomeDetectado}! Gravei a 1ª amostra da sua voz (${enrolled.pitchHz.toFixed(0)} Hz). Para calibrar com precisão, diga mais uma frase: "Jarvis, aqui quem fala é ${nomeDetectado}".`;
        } else if (enrolled.samplesCount === 2) {
          respostaCadastro = `Excelente, ${nomeDetectado}! 2ª amostra calibrada. Para finalizar seu Voice Match, diga: "Eu sou ${nomeDetectado} e minha voz está ativa".`;
        } else {
          respostaCadastro = `Treinamento Voice Match concluído para ${nomeDetectado} com ${enrolled.samplesCount} amostras calibradas (${enrolled.pitchHz.toFixed(0)} Hz)! Já reconheço sua voz automaticamente. Como posso ajudar?`;
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

      // 1.2 Comparação com os perfis biométricos salvos
      const checagemVoz = await identifySpeaker(audioSample);

      if (checagemVoz.identified) {
        activeSpeakerName = checagemVoz.name;
        speakerRole = checagemVoz.role;
        isVoiceIdentified = true;
      } else if (checagemVoz.ambiguous && checagemVoz.candidates) {
        const msgDuvida = `Notei semelhança na voz entre ${checagemVoz.candidates[0]} e ${checagemVoz.candidates[1]}. Com quem estou falando? Diga "Sou a ${checagemVoz.candidates[0]}" ou "Sou a ${checagemVoz.candidates[1]}" para eu calibrar.`;
        return {
          interceptado: true,
          promptTranscrito: promptEfetivo,
          activeSpeakerName: 'Desconhecido',
          speakerRole: 'family',
          isVoiceIdentified: false,
          respostaPronta: {
            success: true,
            triggeredSuccess: true,
            agent: 'JARVIS (Voice Match)',
            agentId: 'jarvis_core',
            nodeType: 'core',
            identity: 'Desconhecido',
            sessionId,
            response: msgDuvida,
            executionTimeMs: Date.now() - inicioExecucao
          }
        };
      } else {
        const msgDesconhecido =
          'Olá! Detectei sua voz, mas ela ainda não está salva no Voice Match. Diga, por exemplo: "Sou o Matheus" ou "Sou a Maria" para eu registrar o seu perfil.';
        return {
          interceptado: true,
          promptTranscrito: promptEfetivo,
          activeSpeakerName: 'Desconhecido',
          speakerRole: 'guest',
          isVoiceIdentified: false,
          respostaPronta: {
            success: true,
            triggeredSuccess: true,
            agent: 'JARVIS (Voice Match)',
            agentId: 'jarvis_core',
            nodeType: 'core',
            identity: 'Desconhecido',
            sessionId,
            response: msgDesconhecido,
            executionTimeMs: Date.now() - inicioExecucao
          }
        };
      }

      // 1.3 Se a pessoa reconhecida apenas chamou "Jarvis"
      const apenasChamouJarvis = /^(oi\s+|ol[aá]\s+|ei\s+)?(jarvis|j[aá]vis|jarves|iarvis)[!.,?\s]*$/i.test(
        promptEfetivo
      );

      if (apenasChamouJarvis) {
        const saudacaoVoz = `Olá, ${activeSpeakerName}! Reconheci sua voz. Como posso ajudar?`;
        appendShortTermMemory(sessionId, 'user', promptEfetivo);
        appendShortTermMemory(sessionId, 'assistant', saudacaoVoz);

        return {
          interceptado: true,
          promptTranscrito: promptEfetivo,
          activeSpeakerName,
          speakerRole,
          isVoiceIdentified: true,
          respostaPronta: {
            success: true,
            triggeredSuccess: true,
            agent: 'JARVIS (Voice Match)',
            agentId: 'jarvis_core',
            nodeType: 'core',
            identity: activeSpeakerName,
            speaker: { name: activeSpeakerName, role: speakerRole, identified: true },
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

  // 2. Filtro de saudações básicas de texto
  const textoLimpo = promptEfetivo.trim().toLowerCase().replace(/[!.,?]/g, '');
  const ehSaudacaoBasica = /^(oi|ol[aá]|bom dia|boa tarde|boa noite|e ai|ei|fala ai|jarvis)$/i.test(textoLimpo);

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
    promptTranscrito: promptEfetivo,
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
