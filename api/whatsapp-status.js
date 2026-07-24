'use strict';

const { whatsappConfig } = require('../lib/whatsapp');

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const config = whatsappConfig();
  const configured = {
    accessToken: Boolean(config.accessToken),
    phoneNumberId: Boolean(config.phoneNumberId),
    verifyToken: Boolean(config.verifyToken),
    appSecret: Boolean(config.appSecret),
    graphVersion: Boolean(config.graphVersion),
    publicAppUrl: Boolean(config.publicAppUrl),
    pixKey: Boolean(config.pixKey)
  };
  res.status(200).json({
    ok: true,
    ready: configured.accessToken && configured.phoneNumberId && configured.verifyToken,
    configured
  });
};