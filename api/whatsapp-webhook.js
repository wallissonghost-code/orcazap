'use strict';

const crypto = require('crypto');
const { whatsappConfig, sendText, sendImage } = require('../lib/whatsapp');

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

async function handleIncoming(body, req) {
  const config = whatsappConfig();
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message) return;
  const from = message.from;
  const profileName = value?.contacts?.[0]?.profile?.name || '';
  const text = message?.text?.body || message?.button?.text || message?.interactive?.button_reply?.title || '';
  const businessName = process.env.ORCAZAP_BUSINESS_NAME || 'OrçaZap';
  const normalized = normalize(text);

  if (/\b(2|pix|pagar|pagamento|entrada|qr code|qrcode)\b/.test(normalized)) {
    if (!config.pixKey) {
      await sendText(from, 'A chave Pix ainda não foi configurada. Vou encaminhar você para um atendente.');
      return;
    }
    const pixText = `Pagamento via Pix\nChave: ${config.pixKey}\nFavorecido: ${config.pixName || businessName}`;
    await sendText(from, pixText);
    const origin = config.publicAppUrl || `https://${req.headers.host}`;
    if (origin) {
      const query = new URLSearchParams({ key: config.pixKey, name: config.pixName || businessName, city: config.pixCity || 'BRASIL' });
      await sendImage(from, `${origin}/api/pix-qr?${query.toString()}`, 'Escaneie o QR Code para pagar via Pix.');
    }
    return;
  }

  await sendText(from, replyFor(text, profileName, businessName));
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
    await handleIncoming(body, req);
  } catch (error) {
    console.error('Webhook WhatsApp:', error);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'Falha ao processar mensagem.' });
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };