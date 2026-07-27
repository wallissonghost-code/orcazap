'use strict';

const DEFAULT_URL = 'https://jioxxnvwhbicgknwcxfx.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_6rl9fVwuL8C7rG1gpQxoww_igP5ooti';

function config() {
  return {
    url: (process.env.SUPABASE_URL || DEFAULT_URL).replace(/\/$/, ''),
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_PUBLISHABLE_KEY,
    secretKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  };
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { return text; }
}

function payloadMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload;
  return payload.message || payload.msg || payload.error_description || payload.error || payload.hint || fallback;
}

async function request(path, options = {}) {
  const cfg = config();
  const apiKey = options.apiKey || cfg.secretKey;
  if (!apiKey) throw new Error('SUPABASE_SECRET_KEY não configurada na Vercel.');
  const authorization = options.authorization || `Bearer ${apiKey}`;
  const response = await fetch(`${cfg.url}${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: apiKey,
      Authorization: authorization,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body,
    cache: 'no-store'
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    const error = new Error(payloadMessage(payload, `Falha Supabase HTTP ${response.status}`));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function getUser(accessToken) {
  if (!accessToken) throw Object.assign(new Error('Sessão Cloud ausente.'), { status: 401 });
  const cfg = config();
  const response = await fetch(`${cfg.url}/auth/v1/user`, {
    headers: {
      apikey: cfg.publishableKey,
      Authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  });
  const payload = await parseResponse(response);
  if (!response.ok || !payload?.id) {
    throw Object.assign(new Error('Sessão Cloud inválida ou expirada.'), { status: 401 });
  }
  return payload;
}

function bearerToken(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function requireTenantRole(req, tenantId, allowedRoles = ['owner', 'admin']) {
  if (!tenantId) throw Object.assign(new Error('Loja não informada.'), { status: 400 });
  const accessToken = bearerToken(req);
  const user = await getUser(accessToken);
  const query = `/rest/v1/tenant_members?select=role&tenant_id=eq.${encodeURIComponent(tenantId)}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`;
  const rows = await request(query);
  const membership = Array.isArray(rows) ? rows[0] : null;
  if (!membership || !allowedRoles.includes(membership.role)) {
    throw Object.assign(new Error('Você não tem permissão para administrar o WhatsApp desta loja.'), { status: 403 });
  }
  return { user, membership, accessToken };
}

async function getConnectionByTenant(tenantId) {
  const rows = await request(`/rest/v1/whatsapp_connections?select=*&tenant_id=eq.${encodeURIComponent(tenantId)}&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getConnectionByPhoneNumber(phoneNumberId) {
  const rows = await request(`/rest/v1/whatsapp_connections?select=*&phone_number_id=eq.${encodeURIComponent(phoneNumberId)}&status=eq.connected&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getBusinessSettings(tenantId) {
  const rows = await request(`/rest/v1/business_settings?select=*&tenant_id=eq.${encodeURIComponent(tenantId)}&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function upsertConnection(connection) {
  const rows = await request('/rest/v1/whatsapp_connections?on_conflict=tenant_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([connection])
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateConnection(tenantId, patch) {
  const rows = await request(`/rest/v1/whatsapp_connections?tenant_id=eq.${encodeURIComponent(tenantId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch)
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

function publicConnection(connection) {
  if (!connection) return null;
  return {
    id: connection.id,
    tenantId: connection.tenant_id,
    wabaId: connection.waba_id,
    phoneNumberId: connection.phone_number_id,
    displayPhoneNumber: connection.display_phone_number,
    businessAccountName: connection.business_account_name,
    status: connection.status,
    lastError: connection.last_error,
    connectedAt: connection.connected_at,
    updatedAt: connection.updated_at
  };
}

module.exports = {
  config,
  request,
  getUser,
  bearerToken,
  requireTenantRole,
  getConnectionByTenant,
  getConnectionByPhoneNumber,
  getBusinessSettings,
  upsertConnection,
  updateConnection,
  publicConnection
};
