import fetch from 'node-fetch';
import readline from 'readline';

const BACKEND_URL = 'http://localhost:3333/api/v1/webhook/ingress';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function simulateVoiceTranscriptionAndDispatch(transcribedText) {
  const payload = {
    identityToken: 'Admin-Master-User',
    sensorData: {
      type: 'audio_stt_input',
      textPrompt: transcribedText,
      timestamp: new Date().toISOString(),
      deviceInfo: {
        os: process.platform,
        inputSource: 'microphone_whisper_stt'
      }
    }
  };

  try {
    console.log(`🎤 [Agente de Voz - STT]: Áudio transcrito com sucesso: "${transcribedText}"`);
    console.log(`📤 [Transmissão]: Disparando payload para o Cérebro Central...`);

    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log(`📥 [Resposta do Orquestrador]:`, JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`❌ [Erro no Canal de Voz]: Falha ao comunicar com o backend na porta 3333.`, error.message);
  }
}

// Interface interativa no terminal simulando o acionamento por voz convertida pelo Whisper
console.log('🎙️ [Agente Periférico de Voz Ativo]');
console.log('Digite o comando de voz simulado (ou fale no microfone quando integrado ao binário do Whisper local):');

rl.question('> ', async (answer) => {
  if (answer.trim()) {
    await simulateVoiceTranscriptionAndDispatch(answer);
  } else {
    console.log('⚠️ Nenhum comando de voz detectado.');
  }
  rl.close();
});