'use strict';

const { requireTenantRole, updateConnection, publicConnection } = require('../lib/supabase-server');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Método não permitido.' });
    return;
  }

  const tenantId = String(req.body?.tenantId || '').trim();
  try {
    await requireTenantRole(req, tenantId, ['owner', 'admin']);
    const connection = await updateConnection(tenantId, {
      status: 'disconnected',
      access_token_ciphertext: null,
      token_expires_at: null,
      last_error: null,
      updated_at: new Date().toISOString()
    });
    res.status(200).json({ ok: true, connection: publicConnection(connection) });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Não foi possível desconectar.' });
  }
};
