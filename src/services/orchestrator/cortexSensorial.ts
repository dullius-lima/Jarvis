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

  // 0. Fallback Whisper Local: Se o VAD detectou fala humana, mas o navegador não transcreveu texto
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

  // 1. Biometria Vocal + Treinamento Voice Match (Aceita pacotes de telemetria a partir de 12 chars)
  if (audioSample && typeof audioSample === 'string' && audioSample.length > 12) {
    try {
      // 1.1 Verifica se é uma etapa de treinamento Voice Match ("Sou o Matheus", "Treinar voz da Maria", etc.)
      const matchCadastro = promptEfetivo.match(
        /(?:sou\s+(?:o|a)?|meu\s+nome\s+[eé]|aqui\s+[eé]\s+(?:o|a)?|aqui\s+quem\s+fala\s+[eé]\s+(?:o|a)?|treinar\s+(?:a\s+)?voz\s+(?:do|da)?|cadastre\s+a\s+voz\s+(?:do|da)?)\s+([A-Za-zÀ-ÖØ-öø-ÿ]+)/i
      );

      if (matchCadastro && matchCadastro[1]) {
        const nomeDetectado =
          matchCadastro[1].charAt(0).toUpperCase() + matchCadastro[1].slice(1).toLowerCase();
        const papelAtribuido = nomeDetectado.toLowerCase().includes('matheus') ? 'admin' : 'family';

        const enrolled = await enrollSpeakerVoice(nomeDetectado, audioSample, papelAtribuido);

        // Guia de 3 amostras estilo Google Voice Match para máxima precisão
        let respostaCadastro = '';
        if (enrolled.samplesCount === 1) {
          respostaCadastro = `Perfeito, ${nomeDetectado}! Gravei a 1ª amostra da sua voz (${enrolled.pitchHz.toFixed(0)} Hz). Para o treinamento ficar 100% preciso como no Google, diga mais uma frase: "Jarvis, aqui quem fala é ${nomeDetectado}".`;
        } else if (enrolled.samplesCount === 2) {
          respostaCadastro = `Excelente, ${nomeDetectado}! 2ª amostra calibrada. Só mais uma vez para finalizar seu perfil biométrico: diga "Eu sou ${nomeDetectado} e minha voz está ativa".`;
        } else {
          respostaCadastro = `Treinamento Voice Match concluído para ${nomeDetectado} com ${enrolled.samplesCount} amostras calibradas (${enrolled.pitchHz.toFixed(0)} Hz)! A partir de agora já reconheço sua voz automaticamente. Como posso ajudar?`;
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

      // 1.2 Compara a voz atual com os perfis salvos no banco
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
        // Voz não cadastrada: pede apresentação para iniciar o Voice Match!
        const msgDesconhecido =
          'Olá! Detectei sua voz, mas ela ainda não está salva no meu Voice Match. Com quem estou falando? Diga, por exemplo: "Sou o Matheus" ou "Sou a Maria" para eu treinar e reconhecer sua voz.';
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

      // 1.3 Se a pessoa reconhecida chamou apenas "Jarvis", responde pelo nome!
      const apenasChamouJarvis = /^(oi\s+|ol[aá]\s+|ei\s+)?(jarvis|j[aá]vis|jarves|iarvis)[!.,?\s]*$/i.test(
        promptEfetivo
      );

      if (apenasChamouJarvis) {
        const saudacaoVoz = `Olá, ${activeSpeakerName}! Reconheci sua voz. O que você precisa?`;
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

  return {
    interceptado: false,
    promptTranscrito: promptEfetivo,
    activeSpeakerName,
    speakerRole,
    isVoiceIdentified
  };
}
