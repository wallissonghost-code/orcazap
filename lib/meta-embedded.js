'use strict';

function metaConfig(req) {
  const publicUrl = (process.env.PUBLIC_APP_URL || (req?.headers?.host ? `https://${req.headers.host}` : '')).replace(/\/$/, '');
  return {
    appId: process.env.META_APP_ID || '',
    appSecret: process.env.META_APP_SECRET || '',
    configurationId: process.env.META_WHATSAPP_CONFIG_ID || process.env.WHATSAPP_CONFIGURATION_ID || '',
    graphVersion: process.env.META_GRAPH_VERSION || process.env.WHATSAPP_GRAPH_VERSION || 'v23.0',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    publicUrl
  };
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { return text; }
}

function graphError(payload, status) {
  const message = payload?.error?.error_user_msg || payload?.error?.message || payload?.message || `Falha Meta HTTP ${status}`;
  const error = new Error(message);
  error.status = status;
  error.meta = payload?.error || payload;
  return error;
}

async function graphRequest(path, accessToken, options = {}) {
  const cfg = metaConfig();
  const response = await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${path.replace(/^\//, '')}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body,
    cache: 'no-store'
  });
  const payload = await parseResponse(response);
  if (!response.ok) throw graphError(payload, response.status);
  return payload;
}

async function exchangeCode(code) {
  const cfg = metaConfig();
  if (!cfg.appId || !cfg.appSecret) throw new Error('META_APP_ID e META_APP_SECRET não configurados.');
  const query = new URLSearchParams({
    client_id: cfg.appId,
    client_secret: cfg.appSecret,
    code
  });
  const response = await fetch(`https://graph.facebook.com/${cfg.graphVersion}/oauth/access_token?${query.toString()}`, { cache: 'no-store' });
  const payload = await parseResponse(response);
  if (!response.ok || !payload?.access_token) throw graphError(payload, response.status);
  return payload;
}

async function debugToken(accessToken) {
  const cfg = metaConfig();
  const appAccessToken = `${cfg.appId}|${cfg.appSecret}`;
  const query = new URLSearchParams({ input_token: accessToken });
  return graphRequest(`debug_token?${query.toString()}`, appAccessToken);
}

function validateEmbeddedAssets(debugPayload, wabaId) {
  const data = debugPayload?.data;
  if (!data?.is_valid) throw new Error('A autorização retornada pela Meta não é válida.');
  const scope = (data.granular_scopes || []).find(item => item.scope === 'whatsapp_business_management');
  if (scope?.target_ids?.length && !scope.target_ids.map(String).includes(String(wabaId))) {
    throw new Error('A conta WhatsApp selecionada não pertence à autorização recebida.');
  }
}

async function completeEmbeddedSignup({ code, wabaId, phoneNumberId }) {
  const exchanged = await exchangeCode(code);
  const accessToken = exchanged.access_token;
  const debug = await debugToken(accessToken);
  validateEmbeddedAssets(debug, wabaId);

  const [waba, phone] = await Promise.all([
    graphRequest(`${encodeURIComponent(wabaId)}?fields=id,name,account_review_status,owner_business_info`, accessToken),
    graphRequest(`${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating`, accessToken)
  ]);

  await graphRequest(`${encodeURIComponent(wabaId)}/subscribed_apps`, accessToken, {
    method: 'POST',
    body: JSON.stringify({})
  });

  return {
    accessToken,
    expiresIn: Number(exchanged.expires_in || 0),
    tokenType: exchanged.token_type || 'bearer',
    debug: debug?.data || null,
    waba,
    phone
  };
}

module.exports = { metaConfig, graphRequest, completeEmbeddedSignup };
