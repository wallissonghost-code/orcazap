'use strict';

function clean(value, max) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 .-]/g, '')
    .trim()
    .slice(0, max);
}

function tag(id, value) {
  const text = String(value ?? '');
  return `${id}${String(text.length).padStart(2, '0')}${text}`;
}

function crc16(value) {
  let crc = 0xFFFF;
  for (let i = 0; i < value.length; i += 1) {
    crc ^= value.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function buildPixPayload({ key, name, city, amount, txid = '***' }) {
  if (!key) throw new Error('Chave Pix não informada.');
  const gui = tag('00', 'BR.GOV.BCB.PIX');
  const account = tag('26', gui + tag('01', String(key).trim()));
  let payload = tag('00', '01') + account + tag('52', '0000') + tag('53', '986');
  const numericAmount = Number(String(amount ?? '').replace(',', '.'));
  if (Number.isFinite(numericAmount) && numericAmount > 0) payload += tag('54', numericAmount.toFixed(2));
  payload += tag('58', 'BR');
  payload += tag('59', clean(name, 25) || 'RECEBEDOR');
  payload += tag('60', clean(city, 15) || 'BRASIL');
  payload += tag('62', tag('05', clean(txid, 25).replace(/[^A-Z0-9]/g, '') || '***'));
  payload += '6304';
  return payload + crc16(payload);
}

module.exports = { buildPixPayload };