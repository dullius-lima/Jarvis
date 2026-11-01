import fetch from 'node-fetch'; // Ou utilize o fetch nativo do Node 18+

const BACKEND_URL = 'http://localhost:3333/api/v1/webhook/ingress';

async function sendSensorStimulus(promptText) {
  const payload = {
    identityToken: 'Admin-Master-User',
    sensorData: {
      type: 'text_or_voice_input',
      textPrompt: promptText,
      timestamp: new Date().toISOString(),
      deviceInfo: {
        os: process.platform,
        nodeVersion: process.version
      }
    }
  };

  try {
    console.log(`📤 [Agente Perceptivo] Capturando estímulo local e enviando para o Cérebro Central...`);
    
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log(`📥 [Resposta do Orquestrador]:`, result);
  } catch (error) {
    console.error(`❌ [Erro na Percepção]: Falha ao comunicar com o backend na porta 3333.`, error.message);
  }
}

// Simulando um estímulo sensorial enviado pela sua máquina local
sendSensorStimulus('Status da infraestrutura e sincronização de rotinas da família.');