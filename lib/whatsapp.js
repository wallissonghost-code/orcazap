'use strict';

function whatsappConfig() {
  return {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: process.env.META_APP_SECRET || '',
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION || 'v23.0',
    publicAppUrl: (process.env.PUBLIC_APP_URL || '').replace(/\/$/, ''),
    pixKey: process.env.ORCAZAP_PIX_KEY || '',
    pixName: process.env.ORCAZAP_PIX_NAME || '',
    pixCity: process.env.ORCAZAP_PIX_CITY || ''
  };
}

async function sendWhatsAppMessage(payload) {
  const config = whatsappConfig();
  if (!config.accessToken || !config.phoneNumberId) {
    throw new Error('WhatsApp ainda não configurado.');
  }
  const response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result?.error?.message || `Falha HTTP ${response.status}`;
    throw new Error(message);
  }
  return result;
}

async function sendText(to, body) {
  return sendWhatsAppMessage({ to, type: 'text', text: { body, preview_url: false } });
}

async function sendImage(to, link, caption = '') {
  return sendWhatsAppMessage({ to, type: 'image', image: { link, caption } });
}

module.exports = { whatsappConfig, sendText, sendImage };