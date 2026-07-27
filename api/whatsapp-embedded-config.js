'use strict';

const { metaConfig } = require('../lib/meta-embedded');
const { config: supabaseConfig, requireTenantRole, getConnectionByTenant, publicConnection } = require('../lib/supabase-server');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ ok: false, error: 'Método não permitido.' });
    return;
  }

  const meta = metaConfig(req);
  const supabase = supabaseConfig();
  const missing = [];
  if (!meta.appId) missing.push('META_APP_ID');
  if (!meta.appSecret) missing.push('META_APP_SECRET');
  if (!meta.configurationId) missing.push('META_WHATSAPP_CONFIG_ID');
  if (!meta.verifyToken) missing.push('WHATSAPP_VERIFY_TOKEN');
  if (!supabase.secretKey) missing.push('SUPABASE_SECRET_KEY');
  if (!(process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY || '').length) missing.push('WHATSAPP_TOKEN_ENCRYPTION_KEY');

  const result = {
    ok: true,
    platformReady: missing.length === 0,
    appId: meta.appId || null,
    configurationId: meta.configurationId || null,
    graphVersion: meta.graphVersion,
    webhookUrl: meta.publicUrl ? `${meta.publicUrl}/api/whatsapp-webhook` : null,
    missing,
    connection: null
  };

  const tenantId = String(req.query?.tenantId || '');
  if (tenantId && req.headers.authorization) {
    try {
      await requireTenantRole(req, tenantId, ['owner', 'admin', 'member']);
      result.connection = publicConnection(await getConnectionByTenant(tenantId));
    } catch (error) {
      res.status(error.status || 500).json({ ok: false, error: error.message, ...result });
      return;
    }
  }

  res.status(200).json(result);
};
