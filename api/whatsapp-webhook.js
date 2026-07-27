'use strict';

const crypto = require('crypto');
const { whatsappConfig, sendText: sendLegacyText, sendImage: sendLegacyImage } = require('../lib/whatsapp');
const {
  request: supabaseRequest,
  getConnectionByPhoneNumber,
  getBusinessSettings,
  updateConnection
} = require('../lib/supabase-server');
const { sendText: sendTenantText, sendImage: sendTenantImage } = require('../lib/tenant-whatsapp');

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function signatureIsValid(rawBody, signature, appSecret) {
  if (!appSecret) return true;
  if (!signature || !signature.startsWith('sha256=')) return false;
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function replyFor(text, profileName, businessName) {
  const message = normalize(text);
  const greeting = profileName ? `Olá, ${profileName}!` : 'Olá!';
  if (/\b(oi|ola|bom dia|boa tarde|boa noite|menu|comecar)\b/.test(message)) {
    return `${greeting} Você está falando com ${businessName}.\n\nDigite:\n1 ou “orçamento” para solicitar uma proposta\n2 ou “Pix” para pagamento\n3 ou “atendente” para falar com uma pessoa`;
  }
  if (/\b(1|orcamento|preco|valor|cotacao|quanto custa)\b/.test(message)) {
    return 'Para preparar seu pré-orçamento, envie em uma única mensagem:\n• nome completo\n• serviço desejado\n• cidade ou bairro\n• medidas ou quantidade\n• prazo desejado\n\nVocê também pode enviar fotos.';
  }
  if (/\b(3|atendente|humano|pessoa|suporte)\b/.test(message)) {
    return 'Certo. Seu pedido de atendimento humano foi registrado. A equipe continuará a conversa assim que possível.';
  }
  if (/\b(aprovado|aprovar|aceito|fechado|pode fazer)\b/.test(message)) {
    return 'Ótimo! A aprovação foi registrada. Em seguida você receberá os dados da entrada via Pix.';
  }
  return 'Posso iniciar um orçamento, enviar os dados do Pix ou encaminhar para um atendente. Digite “orçamento”, “Pix” ou “atendente”.';
}

async function resolveRuntime(value) {
  const phoneNumberId = String(value?.metadata?.phone_number_id || '');
  if (phoneNumberId) {
    const connection = await getConnectionByPhoneNumber(phoneNumberId).catch(() => null);
    if (connection) {
      const settings = await getBusinessSettings(connection.tenant_id).catch(() => null);
      return {
        mode: 'tenant',
        connection,
        settings: settings || {},
        businessName: settings?.business_name || connection.business_account_name || 'OrçaZap',
        pixKey: settings?.pix_key || '',
        pixName: settings?.pix_name || settings?.business_name || '',
        pixCity: settings?.pix_city || settings?.city || 'BRASIL'
      };
    }
  }

  const legacy = whatsappConfig();
  if (legacy.accessToken && legacy.phoneNumberId) {
    return {
      mode: 'legacy',
      legacy,
      businessName: process.env.ORCAZAP_BUSINESS_NAME || 'OrçaZap',
      pixKey: legacy.pixKey,
      pixName: legacy.pixName,
      pixCity: legacy.pixCity
    };
  }

  return null;
}

async function sendText(runtime, to, text) {
  return runtime.mode === 'tenant'
    ? sendTenantText(runtime.connection, to, text)
    : sendLegacyText(to, text);
}

async function sendImage(runtime, to, link, caption) {
  return runtime.mode === 'tenant'
    ? sendTenantImage(runtime.connection, to, link, caption)
    : sendLegacyImage(to, link, caption);
}

async function storeInbound(runtime, message, profileName, text) {
  if (runtime.mode !== 'tenant') return;
  try {
    const tenantId = runtime.connection.tenant_id;
    const contactId = String(message.from || '');
    const rows = await supabaseRequest(`/rest/v1/whatsapp_conversations?select=id&tenant_id=eq.${encodeURIComponent(tenantId)}&wa_contact_id=eq.${encodeURIComponent(contactId)}&limit=1`);
    let conversationId = Array.isArray(rows) ? rows[0]?.id : null;
    if (!conversationId) {
      const created = await supabaseRequest('/rest/v1/whatsapp_conversations', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify([{
          tenant_id: tenantId,
          wa_contact_id: contactId,
          contact_phone: contactId,
          contact_name: profileName || null,
          status: 'bot',
          last_message_at: new Date().toISOString()
        }])
      });
      conversationId = Array.isArray(created) ? created[0]?.id : null;
    } else {
      await supabaseRequest(`/rest/v1/whatsapp_conversations?id=eq.${encodeURIComponent(conversationId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ contact_name: profileName || null, last_message_at: new Date().toISOString() })
      });
    }
    if (conversationId) {
      await supabaseRequest('/rest/v1/whatsapp_messages', {
        method: 'POST',
        body: JSON.stringify([{
          tenant_id: tenantId,
          conversation_id: conversationId,
          wa_message_id: message.id || null,
          direction: 'inbound',
          message_type: message.type || 'text',
          body: text || null,
          raw_payload: message
        }])
      });
    }
  } catch (error) {
    console.warn('Histórico WhatsApp:', error.message);
  }
}

async function handleIncomingValue(value, req) {
  const message = value?.messages?.[0];
  if (!message) return;
  const runtime = await resolveRuntime(value);
  if (!runtime) {
    console.warn('Mensagem recebida para número sem loja conectada:', value?.metadata?.phone_number_id || 'desconhecido');
    return;
  }

  const from = message.from;
  const profileName = value?.contacts?.[0]?.profile?.name || '';
  const text = message?.text?.body || message?.button?.text || message?.interactive?.button_reply?.title || '';
  const normalized = normalize(text);
  await storeInbound(runtime, message, profileName, text);

  try {
    if (/\b(2|pix|pagar|pagamento|entrada|qr code|qrcode)\b/.test(normalized)) {
      if (!runtime.pixKey) {
        await sendText(runtime, from, 'A chave Pix ainda não foi configurada. Vou encaminhar você para um atendente.');
        return;
      }
      const pixText = `Pagamento via Pix\nChave: ${runtime.pixKey}\nFavorecido: ${runtime.pixName || runtime.businessName}`;
      await sendText(runtime, from, pixText);
      const legacyConfig = whatsappConfig();
      const origin = legacyConfig.publicAppUrl || `https://${req.headers.host}`;
      if (origin) {
        const query = new URLSearchParams({ key: runtime.pixKey, name: runtime.pixName || runtime.businessName, city: runtime.pixCity || 'BRASIL' });
        await sendImage(runtime, from, `${origin}/api/pix-qr?${query.toString()}`, 'Escaneie o QR Code para pagar via Pix.');
      }
      return;
    }

    await sendText(runtime, from, replyFor(text, profileName, runtime.businessName));
  } catch (error) {
    if (runtime.mode === 'tenant') {
      await updateConnection(runtime.connection.tenant_id, {
        status: 'error',
        last_error: String(error.message || 'Falha ao enviar mensagem').slice(0, 500),
        updated_at: new Date().toISOString()
      }).catch(() => null);
    }
    throw error;
  }
}

async function processWebhook(body, req) {
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      await handleIncomingValue(change?.value, req);
    }
  }
}

async function handler(req, res) {
  const config = whatsappConfig();

  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && config.verifyToken && token === config.verifyToken) {
      res.status(200).send(challenge);
    } else {
      res.status(403).json({ ok: false, error: 'Falha na verificação do webhook.' });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ ok: false, error: 'Método não permitido.' });
    return;
  }

  try {
    const rawBody = await readRawBody(req);
    if (!signatureIsValid(rawBody, req.headers['x-hub-signature-256'], config.appSecret)) {
      res.status(401).json({ ok: false, error: 'Assinatura inválida.' });
      return;
    }
    const body = JSON.parse(rawBody.toString('utf8') || '{}');
    res.status(200).json({ ok: true });
    await processWebhook(body, req);
  } catch (error) {
    console.error('Webhook WhatsApp:', error);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'Falha ao processar mensagem.' });
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
