
//  src/services/whisperLocalService.ts 

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface WhisperTranscriptionResult {
  success: boolean;
  text?: string;
  engine?: string;
  model?: string;
  durationMs?: number;
  error?: string;
}

export async function transcribeWithLocalWhisper(
  audioBase64: string,
  modelSize: string = process.env.WHISPER_MODEL_SIZE || 'base'
): Promise<WhisperTranscriptionResult> {
  const startTime = Date.now();

  if (!audioBase64 || audioBase64.length < 100) {
    return { success: false, error: 'Áudio Base64 vazio ou muito curto.' };
  }

  const cleanBase64 = audioBase64.replace(/^data:audio\/[a-zA-Z0-9+-]+;base64,/, '').trim();
  const tempFilePath = path.join(os.tmpdir(), `jarvis_voice_${Date.now()}.webm`);

  try {
    const audioBuffer = Buffer.from(cleanBase64, 'base64');
    await fs.promises.writeFile(tempFilePath, audioBuffer);

    const scriptPath = path.resolve(process.cwd(), 'scripts', 'whisper_transcribe.py');
    const venvPython = path.resolve(process.cwd(), 'whisper-env', 'bin', 'python3');
    const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python3';

    return await new Promise<WhisperTranscriptionResult>((resolve) => {
      const pyProcess = spawn(pythonCmd, [scriptPath, tempFilePath, modelSize], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdoutData = '';
      let stderrData = '';

      pyProcess.stdout.on('data', (chunk) => {
        stdoutData += chunk.toString('utf8');
      });

      pyProcess.stderr.on('data', (chunk) => {
        stderrData += chunk.toString('utf8');
      });

      pyProcess.on('close', async () => {
        try {
          if (fs.existsSync(tempFilePath)) await fs.promises.unlink(tempFilePath);
        } catch {}

        const durationMs = Date.now() - startTime;
        try {
          const lines = stdoutData.trim().split('\n');
          const lastJsonLine = lines[lines.length - 1] || '{}';
          const parsed = JSON.parse(lastJsonLine);
          resolve({ ...parsed, durationMs });
        } catch {
          resolve({
            success: false,
            durationMs,
            error: `Falha ao ler saída do Whisper: ${stderrData || stdoutData}`
          });
        }
      });

      pyProcess.on('error', (err) => {
        resolve({
          success: false,
          error: `Erro ao iniciar Python (${pythonCmd}): ${err.message}`
        });
      });
    });
  } catch (error: any) {
    return {
      success: false,
      error: `Erro interno no Whisper Local: ${error.message}`
    };
  }
}
EOF

# 2. Corrigir src/services/orchestrator/cortexSensorial.ts (Lê whisperRes.text corretamente!)
cat << 'EOF' > src/services/orchestrator/cortexSensorial.ts
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

  // 0. Fallback Whisper Local: extrai .text do objeto WhisperTranscriptionResult!
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
          console.log(`🎙️ [Whisper Local Transcreveu]: "${textoExtraido}"`);
          promptEfetivo = textoExtraido;
        } else {
          console.warn('⚠️ [Whisper Local] Retornou texto vazio:', whisperRes?.error || '');
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
    const msgNaoOuvi = `Não consegui captar o áudio do microfone, ${activeSpeakerName}. Toque no botão laranja do microfone e fale o comando.`;
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
EOF

# 3. Corrigir src/frontend/composables/useVoiceAndAudio.ts (Preserva o cabeçalho WebM reiniciando o MediaRecorder a cada fala)
cat << 'EOF' > src/frontend/composables/useVoiceAndAudio.ts
import { ref } from 'vue';

export function useVoiceAndAudio(
  onCommandDetected: (text: string, audioSignaturePayload?: string) => void
) {
  const isVigilanceEnabled = ref<boolean>(true);
  const isJarvisAwake = ref<boolean>(false);
  const isJarvisSpeaking = ref<boolean>(false);
  const isRecordingAudio = ref<boolean>(false);
  const voiceStatusText = ref<string>('🟢 Vigília ativa: Diga "Jarvis" ou toque no Microfone');
  const isVoiceMuted = ref<boolean>(false);

  let recognition: any = null;
  let isRecognitionRunning = false;
  let speechSilenceTimer: any = null;
  let vadFallbackTimer: any = null;
  let speechAccumulatedBuffer = '';
  let lastChimeTimestamp = 0;

  let localAudioStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let pitchMonitorInterval: any = null;
  let measuredPitches: number[] = [];
  let measuredEnergies: number[] = [];
  let measuredSpectra: number[][] = [];
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let vadDetectedHumanSpeech = false;

  function playJarvisChime(type: 'wake' | 'send' = 'wake') {
    const now = Date.now();
    if (now - lastChimeTimestamp < 800) return;
    lastChimeTimestamp = now;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      if (type === 'wake') {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.08);
      } else {
        osc.frequency.setValueAtTime(659.25, ctx.currentTime);
        osc.frequency.setValueAtTime(523.25, ctx.currentTime + 0.08);
      }

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
      setTimeout(() => ctx.close().catch(() => {}), 250);
    } catch {}
  }

  function detectPitchFromBuffer(buf: Float32Array, sampleRate: number): { pitch: number; rms: number } {
    let sumSquares = 0;
    for (let i = 0; i < buf.length; i++) sumSquares += buf[i] * buf[i];
    const rms = Math.sqrt(sumSquares / buf.length);
    if (rms < 0.015) return { pitch: -1, rms };

    const minPeriod = Math.floor(sampleRate / 380);
    const maxPeriod = Math.floor(sampleRate / 75);
    let bestOffset = -1;
    let bestCorrelation = 0;

    for (let offset = minPeriod; offset <= maxPeriod; offset++) {
      let correlation = 0;
      for (let i = 0; i < buf.length - offset; i++) correlation += buf[i] * buf[i + offset];
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestOffset = offset;
      }
    }

    if (bestOffset > 0) {
      const pitch = sampleRate / bestOffset;
      if (pitch >= 75 && pitch <= 380) return { pitch, rms };
    }
    return { pitch: -1, rms };
  }

  function extract16BandVoiceSpectrum(analyser: AnalyserNode): number[] {
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);
    const bands: number[] = [];
    for (let b = 0; b < 16; b++) {
      let sum = 0;
      for (let j = 0; j < 4; j++) sum += freqData[b * 4 + j + 2] || 0;
      bands.push(Number((sum / (4 * 255)).toFixed(4)));
    }
    return bands;
  }

  // Inicia uma gravação limpa do zero (garantindo que o cabeçalho WebM nunca seja perdido)
  function startFreshMediaRecorder() {
    if (!localAudioStream || !localAudioStream.active) return;
    try {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
    } catch {}

    audioChunks = [];
    try {
      mediaRecorder = new MediaRecorder(localAudioStream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunks.push(e.data);
        }
      };
      mediaRecorder.start(200);
      isRecordingAudio.value = true;
    } catch {}
  }

  async function startAcousticBiometricCapture(): Promise<boolean> {
    try {
      const nav = navigator as any;
      if (!localAudioStream || !localAudioStream.active) {
        if (nav.mediaDevices && nav.mediaDevices.getUserMedia) {
          localAudioStream = await nav.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          });
        } else {
          return false;
        }
      }

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx && !audioContext) {
        audioContext = new AudioCtx();
        const source = audioContext.createMediaStreamSource(localAudioStream!);
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 2048;
        source.connect(analyserNode);
      }

      if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      startFreshMediaRecorder();

      if (pitchMonitorInterval) clearInterval(pitchMonitorInterval);
      pitchMonitorInterval = setInterval(() => {
        if (!analyserNode || !audioContext || isJarvisSpeaking.value) return;
        const buffer = new Float32Array(analyserNode.fftSize);
        analyserNode.getFloatTimeDomainData(buffer);
        const { pitch, rms } = detectPitchFromBuffer(buffer, audioContext.sampleRate);

        if (pitch > 0 && rms >= 0.018) {
          measuredPitches.push(pitch);
          measuredEnergies.push(rms);
          measuredSpectra.push(extract16BandVoiceSpectrum(analyserNode));

          if (measuredPitches.length > 45) measuredPitches.shift();
          if (measuredEnergies.length > 45) measuredEnergies.shift();
          if (measuredSpectra.length > 45) measuredSpectra.shift();

          if (isJarvisAwake.value) {
            vadDetectedHumanSpeech = true;
            voiceStatusText.value = `🎙️ Captando sua voz (${Math.round(pitch)} Hz)...`;
            if (vadFallbackTimer) clearTimeout(vadFallbackTimer);
            vadFallbackTimer = setTimeout(async () => {
              if (isJarvisAwake.value && vadDetectedHumanSpeech && speechAccumulatedBuffer.trim().length === 0) {
                vadDetectedHumanSpeech = false;
                playJarvisChime('send');
                voiceStatusText.value = '⚡ Transcrevendo voz no Whisper Local...';
                const bioPayload = await buildVoiceBiometricPayloadAsync();
                isJarvisAwake.value = false;
                onCommandDetected('__VAD_AUDIO_ONLY__', bioPayload);
              }
            }, 2200);
          }
        }
      }, 60);

      return true;
    } catch {
      return false;
    }
  }

  async function buildVoiceBiometricPayloadAsync(): Promise<string> {
    const avgPitch =
      measuredPitches.length > 0
        ? (measuredPitches.reduce((a, b) => a + b, 0) / measuredPitches.length).toFixed(2)
        : '130.00';
    const avgEnergy =
      measuredEnergies.length > 0
        ? (measuredEnergies.reduce((a, b) => a + b, 0) / measuredEnergies.length).toFixed(4)
        : '0.0500';

    const avgSpectrum = new Array(16).fill(0);
    if (measuredSpectra.length > 0) {
      for (const spec of measuredSpectra) {
        for (let i = 0; i < 16; i++) avgSpectrum[i] += spec[i] || 0;
      }
      for (let i = 0; i < 16; i++) {
        avgSpectrum[i] = Number((avgSpectrum[i] / measuredSpectra.length).toFixed(4));
      }
    }

    // Para o gravador para fechar o arquivo WebM íntegro antes de ler o Base64
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
        await new Promise((r) => setTimeout(r, 120));
      } catch {}
    }

    let base64Data = '';
    if (audioChunks.length > 0) {
      try {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        base64Data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const res = (reader.result as string) || '';
            resolve(res.split(',')[1] || '');
          };
          reader.onerror = () => resolve('');
          reader.readAsDataURL(blob);
        });
      } catch {}
    }

    measuredPitches = [];
    measuredEnergies = [];
    measuredSpectra = [];
    audioChunks = [];

    // Já deixa um novo gravador limpo engatilhado
    startFreshMediaRecorder();

    return `PITCH:${avgPitch}|ENERGY:${avgEnergy}|SPEC:${avgSpectrum.join(',')}|DATA:${base64Data || 'SPEECH_SAMPLE'}`;
  }

  function initSTT(onTextChange?: (text: string) => void) {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return null;

    const rec = new SpeechRecognition();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      isRecognitionRunning = true;
      voiceStatusText.value = isJarvisAwake.value
        ? '🎙️ Ouvindo você... Pode falar!'
        : '🟢 Vigília ativa: Diga "Jarvis" ou toque no Microfone';
    };

    rec.onresult = (event: any) => {
      if (isJarvisSpeaking.value) return;
      if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
      if (vadFallbackTimer) clearTimeout(vadFallbackTimer);

      let currentInterim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const part = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          speechAccumulatedBuffer += ' ' + part;
        } else {
          currentInterim += part;
        }
      }

      const liveText = (speechAccumulatedBuffer + ' ' + currentInterim).trim();
      if (!liveText) return;

      const wakeWordPattern =
        /(?:oi|ol[aá]|ei|ok|fala|al[oô]|e a[ií])?\s*(jarvis|j[aá]vis|jarves|iarvis|jarbas|chaves|j[aá]rvis)|(?:preciso\s+de\s+ajuda|me\s+ajuda|socorro|assistente)/i;

      if (!isJarvisAwake.value && wakeWordPattern.test(liveText)) {
        isJarvisAwake.value = true;
        playJarvisChime('wake');
        startFreshMediaRecorder();

        const parts = liveText.split(wakeWordPattern);
        const remainder = parts.pop()?.replace(/^[,.\s!?-]+/, '').trim() || '';

        if (remainder.length > 2) {
          speechAccumulatedBuffer = remainder;
          if (onTextChange) onTextChange(remainder);
          voiceStatusText.value = `🎙️ "${remainder}"`;
        } else {
          speechAccumulatedBuffer = '';
          voiceStatusText.value = '🎙️ Sim? Estou ouvindo... Diga seu comando!';
        }
      }

      if (isJarvisAwake.value && liveText.length > 1) {
        const cleaned = liveText.replace(wakeWordPattern, '').replace(/^[,.\s!?-]+/, '').trim() || liveText;
        if (onTextChange) onTextChange(cleaned);
        voiceStatusText.value = `🎙️ "${cleaned}"`;

        speechSilenceTimer = setTimeout(async () => {
          if (cleaned.length > 1) {
            playJarvisChime('send');
            voiceStatusText.value = '⚡ Processando comando...';
            const bioPayload = await buildVoiceBiometricPayloadAsync();
            isJarvisAwake.value = false;
            speechAccumulatedBuffer = '';
            vadDetectedHumanSpeech = false;
            onCommandDetected(cleaned, bioPayload);
          }
        }, 1600);
      }
    };

    rec.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        voiceStatusText.value = '🎙️ Modo Whisper Local Ativo (Toque no botão laranja para falar)';
      }
    };

    rec.onend = () => {
      isRecognitionRunning = false;
      if (isVigilanceEnabled.value && !isJarvisSpeaking.value) {
        setTimeout(() => {
          if (!isRecognitionRunning && !isJarvisSpeaking.value) {
            try { rec.start(); } catch {}
          }
        }, 350);
      }
    };

    return rec;
  }

  async function onJarvisCoreClick(onTextChange?: (text: string) => void) {
    if (isJarvisSpeaking.value) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      isJarvisSpeaking.value = false;
    }

    // Se já estava acordado e o usuário clicou de novo, envia imediatamente o áudio gravado!
    if (isJarvisAwake.value) {
      if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
      if (vadFallbackTimer) clearTimeout(vadFallbackTimer);
      playJarvisChime('send');
      voiceStatusText.value = '⚡ Enviando áudio para transcrição...';
      const textCaptured = speechAccumulatedBuffer.trim();
      const bioPayload = await buildVoiceBiometricPayloadAsync();
      isJarvisAwake.value = false;
      speechAccumulatedBuffer = '';
      vadDetectedHumanSpeech = false;
      onCommandDetected(textCaptured || '__VAD_AUDIO_ONLY__', bioPayload);
      return;
    }

    isVigilanceEnabled.value = true;
    playJarvisChime('wake');
    const hasMic = await startAcousticBiometricCapture();

    speechAccumulatedBuffer = '';
    measuredPitches = [];
    measuredEnergies = [];
    measuredSpectra = [];
    vadDetectedHumanSpeech = false;
    isJarvisAwake.value = true;

    if (hasMic) {
      voiceStatusText.value = '🎙️ Ouvindo você! Fale agora (ou toque de novo para enviar)...';
    } else {
      voiceStatusText.value = '⚠️ Microfone bloqueado (Ative HTTPS ou a flag do Chrome)';
    }

    if (!recognition) recognition = initSTT(onTextChange);
    if (!isRecognitionRunning) {
      try { recognition?.start(); } catch {}
    }
  }

  function stopMicrophoneSession() {
    if (speechSilenceTimer) clearTimeout(speechSilenceTimer);
    if (vadFallbackTimer) clearTimeout(vadFallbackTimer);
    isJarvisAwake.value = false;
    speechAccumulatedBuffer = '';
  }

  async function speakJarvisResponse(rawText: string, onDone?: () => void) {
    if (isVoiceMuted.value || !rawText) {
      if (onDone) onDone();
      return;
    }

    isJarvisSpeaking.value = true;
    if (recognition && isRecognitionRunning) {
      try { recognition.stop(); } catch {}
    }

    const cleanText = rawText
      .replace(/```[\s\S]*?```/g, 'bloco de código.')
      .replace(/[*#_`~>|]/g, '')
      .trim();

    const finish = () => {
      isJarvisSpeaking.value = false;
      voiceStatusText.value = '🟢 Vigília ativa: Diga "Jarvis" ou toque no Microfone';

      if (isVigilanceEnabled.value && recognition && !isRecognitionRunning) {
        setTimeout(() => {
          try { recognition.start(); } catch {}
        }, 300);
      }
      if (onDone) onDone();
    };

    try {
      const res = await fetch('/api/v1/audio/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, mode: 'auto' })
      });
      const data = await res.json();
      if (data.success && data.audioBase64) {
        const audio = new Audio(`data:${data.mimeType || 'audio/mpeg'};base64,${data.audioBase64}`);
        audio.onended = finish;
        audio.onerror = () => fallbackSpeech(cleanText, finish);
        await audio.play();
        return;
      }
    } catch {}

    fallbackSpeech(cleanText, finish);
  }

  function fallbackSpeech(text: string, finish: () => void) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'pt-BR';
        utterance.rate = 1.05;
        utterance.pitch = 0.95;
        utterance.onend = finish;
        utterance.onerror = finish;
        window.speechSynthesis.speak(utterance);
      }, 60);
    } else {
      finish();
    }
  }

  function stopAllAudio() {
    isVigilanceEnabled.value = false;
    stopMicrophoneSession();
    if (pitchMonitorInterval) clearInterval(pitchMonitorInterval);
    if (localAudioStream) {
      localAudioStream.getTracks().forEach((t) => t.stop());
      localAudioStream = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  function setupAudioUnlockListener(onTextChange?: (text: string) => void) {
    const unlock = async () => {
      await startAcousticBiometricCapture();
      if (!recognition) recognition = initSTT(onTextChange);
      if (!isRecognitionRunning) {
        try { recognition?.start(); } catch {}
      }
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
  }

  return {
    isJarvisAwake,
    isJarvisSpeaking,
    isRecordingAudio,
    voiceStatusText,
    isVoiceMuted,
    onJarvisCoreClick,
    stopMicrophoneSession,
    speakJarvisResponse,
    stopAllAudio,
    setupAudioUnlockListener
  };
}
