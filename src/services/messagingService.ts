import dotenv from 'dotenv';

dotenv.config();

interface SendMessageParams {
  channel: 'telegram' | 'whatsapp';
  recipientId: string; // Chat ID do Telegram ou Telefone do WhatsApp
  text: string;
}

export async function sendChannelMessage({ channel, recipientId, text }: SendMessageParams) {
  try {
    if (channel === 'telegram') {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) throw new Error('TELEGRAM_BOT_TOKEN não configurado no .env');

      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: recipientId,
          text: text,
          parse_mode: 'Markdown'
        })
      });

      const data = await response.json();
      console.log(`📱 [Telegram Service] Mensagem enviada para ${recipientId}`);
      return data;
    } 
    
    else if (channel === 'whatsapp') {
      // Integração via Meta Cloud API / WhatsApp Business
      const token = process.env.WHATSAPP_ACCESS_TOKEN;
      const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      if (!token || !phoneId) throw new Error('Credenciais do WhatsApp não configuradas no .env');

      const url = `https://graph.facebook.com/v17.0/${phoneId}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: recipientId,
          type: 'text',
          text: { body: text }
        })
      });

      const data = await response.json();
      console.log(`🟩 [WhatsApp Service] Mensagem enviada para ${recipientId}`);
      return data;
    }
  } catch (error: any) {
    console.error(`❌ [Messaging Error] Falha ao enviar resposta via ${channel}:`, error.message);
    throw error;
  }
}