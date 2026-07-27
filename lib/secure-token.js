'use strict';

const crypto = require('crypto');

function encryptionKey() {
  const secret = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY || '';
  if (secret.length < 24) {
    throw new Error('WHATSAPP_TOKEN_ENCRYPTION_KEY não configurada ou muito curta.');
  }
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function encryptSecret(value) {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

function decryptSecret(value) {
  if (!value) return '';
  const [version, ivValue, tagValue, encryptedValue] = String(value).split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) {
    throw new Error('Token criptografado em formato inválido.');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

module.exports = { encryptSecret, decryptSecret };
