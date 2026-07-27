'use strict';

const { completeEmbeddedSignup } = require('../lib/meta-embedded');
const { encryptSecret } = require('../lib/secure-token');
const {
  requireTenantRole,
  upsertConnection,
  publicConnection
} = require('../lib/supabase-server');

function cleanId(value, label) {
  const id = String(value || '').trim();
  if (!/^\d{5,40}$/.test(id)) throw Object.assign(new Error(`${label} inválido.`), { status: 400 });
  return id;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Método não permitido.' });
    return;
  }

  const body = req.body || {};
  const tenantId = String(body.tenantId || '').trim();
  const code = String(body.code || '').trim();

  try {
    if (!code || code.length < 8) throw Object.assign(new Error('Código temporário da Meta ausente.'), { status: 400 });
    const wabaId = cleanId(body.wabaId, 'WABA ID');
    const phoneNumberId = cleanId(body.phoneNumberId, 'Phone Number ID');
    await requireTenantRole(req, tenantId, ['owner', 'admin']);

    const completed = await completeEmbeddedSignup({ code, wabaId, phoneNumberId });
    const now = new Date();
    const tokenExpiresAt = completed.expiresIn > 0
      ? new Date(now.getTime() + completed.expiresIn * 1000).toISOString()
      : null;

    const connection = await upsertConnection({
      tenant_id: tenantId,
      waba_id: String(completed.waba?.id || wabaId),
      phone_number_id: String(completed.phone?.id || phoneNumberId),
      display_phone_number: completed.phone?.display_phone_number || null,
      business_account_name: completed.phone?.verified_name || completed.waba?.name || null,
      access_token_ciphertext: encryptSecret(completed.accessToken),
      token_expires_at: tokenExpiresAt,
      status: 'connected',
      last_error: null,
      connected_at: now.toISOString(),
      updated_at: now.toISOString()
    });

    res.status(200).json({
      ok: true,
      connection: publicConnection(connection),
      reviewStatus: completed.waba?.account_review_status || null,
      qualityRating: completed.phone?.quality_rating || null
    });
  } catch (error) {
    console.error('Embedded Signup WhatsApp:', error);
    if (tenantId) {
      try {
        await upsertConnection({
          tenant_id: tenantId,
          status: 'error',
          last_error: String(error.message || 'Falha ao conectar').slice(0, 500),
          updated_at: new Date().toISOString()
        });
      } catch (_) {}
    }
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Não foi possível conectar o WhatsApp.' });
  }
};
