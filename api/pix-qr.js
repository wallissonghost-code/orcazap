'use strict';

const QRCode = require('qrcode');
const { buildPixPayload } = require('../lib/pix');

module.exports = async function handler(req, res) {
  try {
    const key = String(req.query.key || process.env.ORCAZAP_PIX_KEY || '').trim();
    const name = String(req.query.name || process.env.ORCAZAP_PIX_NAME || 'RECEBEDOR');
    const city = String(req.query.city || process.env.ORCAZAP_PIX_CITY || 'BRASIL');
    const amount = req.query.amount || '';
    const txid = req.query.txid || '***';
    const payload = buildPixPayload({ key, name, city, amount, txid });
    const png = await QRCode.toBuffer(payload, { type: 'png', width: 720, margin: 2, errorCorrectionLevel: 'M' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.status(200).send(png);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Falha ao gerar QR Pix.' });
  }
};