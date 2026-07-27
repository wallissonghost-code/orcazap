'use strict';

const { decryptSecret } = require('./secure-token');
const { metaConfig } = require('./meta-embedded');

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { return text; }
}

async function sendMessage(connection, payload) {
  if (!connection?.phone_number_id || !connection?.access_token_ciphertext) {
    throw new Error('Conexão WhatsApp da loja incompleta.');
  }
  const token = decryptSecret(connection.access_token_ciphertext);
  const cfg = metaConfig();
  const response = await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${connection.phone_number_id}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    cache: 'no-store'
  });
  const result = await parseResponse(response);
  if (!response.ok) {
    throw new Error(result?.error?.error_user_msg || result?.error?.message || `Falha Meta HTTP ${response.status}`);
  }
  return result;
}

function sendText(connection, to, body) {
  return sendMessage(connection, { to, type: 'text', text: { body, preview_url: false } });
}

function sendImage(connection, to, link, caption = '') {
  return sendMessage(connection, { to, type: 'image', image: { link, caption } });
}

module.exports = { sendMessage, sendText, sendImage };
