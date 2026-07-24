'use strict';
  async function generateQuotePDF(id) {
    const quote = data.quotes.find(q => q.id === id);
    if (!quote) return;
    if (!window.jspdf?.jsPDF) {
      toast('Biblioteca de PDF ainda está carregando. Tente novamente.', 'error');
      return;
    }
    const client = data.clients.find(c => c.id === quote.clientId) || {};
    const totals = quoteTotals(quote);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const left = 16;
    const right = 194;
    let y = 16;

    doc.setFillColor(11, 18, 32);
    doc.roundedRect(12, 10, 186, 31, 4, 4, 'F');
    if (data.settings.logo) {
      try { const logoFormat = data.settings.logo.startsWith('data:image/jpeg') ? 'JPEG' : data.settings.logo.startsWith('data:image/webp') ? 'WEBP' : 'PNG'; doc.addImage(data.settings.logo, logoFormat, 17, 14, 23, 23, undefined, 'FAST'); } catch (_) {}
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text(data.settings.businessName || 'Minha Empresa', data.settings.logo ? 45 : 18, 23);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const businessLine = [data.settings.document, data.settings.phone, data.settings.email].filter(Boolean).join('  •  ');
    doc.text(businessLine || 'Orçamento profissional', data.settings.logo ? 45 : 18, 30);
    if (data.settings.address) doc.text(data.settings.address, data.settings.logo ? 45 : 18, 35);

    y = 51;
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('ORÇAMENTO', left, y);
    doc.setFontSize(10);
    doc.text(quote.number, right, y, { align: 'right' });
    y += 8;
    doc.setDrawColor(226, 232, 240);
    doc.line(left, y, right, y);

    y += 9;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('CLIENTE', left, y);
    doc.text('EMISSÃO', 137, y);
    doc.text('VALIDADE', 168, y);
    y += 5;
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(client.name || quote.clientName || 'Cliente', left, y);
    doc.setFont('helvetica', 'normal');
    doc.text(dateBR(quote.createdAt), 137, y);
    doc.text(dateBR(quote.validUntil), 168, y);
    y += 5;
    doc.setFontSize(8.5);
    const clientLine = [client.document, client.phone, client.email].filter(Boolean).join('  •  ');
    if (clientLine) { doc.setTextColor(100, 116, 139); doc.text(clientLine, left, y); y += 5; }
    if (client.address) { doc.text(client.address, left, y); y += 5; }

    y += 5;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(12, y - 5, 186, 9, 2, 2, 'F');
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('ITEM', left, y);
    doc.text('QTD.', 132, y, { align: 'right' });
    doc.text('UNITÁRIO', 161, y, { align: 'right' });
    doc.text('TOTAL', right, y, { align: 'right' });
    y += 8;

    doc.setFont('helvetica', 'normal');
    for (const item of quote.items) {
      if (y > 250) { doc.addPage(); y = 18; }
      const lines = doc.splitTextToSize(item.name, 100);
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(9);
      doc.text(lines, left, y);
      doc.text(String(item.qty), 132, y, { align: 'right' });
      doc.text(money(item.price), 161, y, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text(money(num(item.qty) * num(item.price)), right, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += Math.max(8, lines.length * 4.2 + 3);
      doc.setDrawColor(241, 245, 249);
      doc.line(left, y - 3, right, y - 3);
    }

    y += 3;
    const totalX = 128;
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('Subtotal', totalX, y);
    doc.text(money(totals.subtotal), right, y, { align: 'right' }); y += 6;
    if (totals.discount > 0) { doc.text('Desconto', totalX, y); doc.text(`- ${money(totals.discount)}`, right, y, { align: 'right' }); y += 6; }
    doc.setFillColor(232, 248, 240);
    doc.roundedRect(124, y - 5, 74, 12, 2, 2, 'F');
    doc.setTextColor(13, 143, 80);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL', totalX, y + 2);
    doc.text(money(totals.total), right - 3, y + 2, { align: 'right' });
    y += 14;
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9);
    doc.text(`Entrada (${quote.entryPercent}%): ${money(totals.entry)}`, totalX, y);
    doc.text(`Saldo: ${money(totals.balance)}`, right, y, { align: 'right' });

    const noteStart = Math.max(y + 14, 218);
    if (quote.notes) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(100, 116, 139); doc.text('OBSERVAÇÕES', left, noteStart);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(51, 65, 85);
      doc.text(doc.splitTextToSize(quote.notes, 110), left, noteStart + 5);
    }

    if (data.settings.pixKey && totals.entry > 0) {
      try {
        const payload = pixPayload(data.settings.pixKey, data.settings.pixName || data.settings.businessName, data.settings.pixCity || data.settings.city, totals.entry, quote.number);
        const qrData = await qrDataUrl(payload);
        doc.addImage(qrData, 'PNG', 153, 222, 34, 34);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(15, 23, 42); doc.text('Pague a entrada via Pix', 170, 260, { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 116, 139); doc.text(String(data.settings.pixKey).slice(0, 35), 170, 264, { align: 'center' });
      } catch (error) { console.warn('QR Pix:', error); }
    }

    doc.setDrawColor(226, 232, 240);
    doc.line(left, 278, right, 278);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
    doc.text(data.settings.footer || 'Obrigado pela preferência!', left, 284);
    doc.text(`Gerado pelo OrçaZap em ${new Date().toLocaleDateString('pt-BR')}`, right, 284, { align: 'right' });
    doc.save(`${quote.number}-${(client.name || 'cliente').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`);
    activity(`PDF gerado: ${quote.number}`);
    saveData('PDF gerado');
  }

  function qrDataUrl(text) {
    return new Promise((resolve, reject) => {
      if (!window.QRCode) return reject(new Error('QRCode indisponível'));
      const holder = document.createElement('div');
      holder.style.position = 'fixed'; holder.style.left = '-9999px';
      document.body.appendChild(holder);
      new window.QRCode(holder, { text, width: 320, height: 320, correctLevel: window.QRCode.CorrectLevel.M });
      setTimeout(() => {
        const canvas = holder.querySelector('canvas');
        const img = holder.querySelector('img');
        const result = canvas?.toDataURL('image/png') || img?.src;
        holder.remove();
        result ? resolve(result) : reject(new Error('Falha ao gerar QR'));
      }, 100);
    });
  }

  function pixPayload(key, merchantName, merchantCity, amount, txid) {
    const clean = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 .-]/g, '').trim();
    const tag = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`;
    const gui = tag('00', 'BR.GOV.BCB.PIX');
    const account = tag('26', gui + tag('01', String(key).trim()));
    let payload = tag('00', '01') + account + tag('52', '0000') + tag('53', '986');
    if (num(amount) > 0) payload += tag('54', num(amount).toFixed(2));
    payload += tag('58', 'BR');
    payload += tag('59', clean(merchantName).slice(0, 25) || 'RECEBEDOR');
    payload += tag('60', clean(merchantCity).slice(0, 15) || 'BRASIL');
    payload += tag('62', tag('05', clean(txid).replace(/[^A-Z0-9]/g, '').slice(0, 25) || '***'));
    payload += '6304';
    return payload + crc16(payload);
  }

  function crc16(value) {
    let crc = 0xFFFF;
    for (let i = 0; i < value.length; i++) {
      crc ^= value.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `orcazap-backup-${todayIso()}.json`; link.click();
    URL.revokeObjectURL(url);
    activity('Backup exportado'); saveData('Backup baixado');
  }

  function importBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (!imported.settings || !Array.isArray(imported.clients) || !Array.isArray(imported.quotes)) throw new Error('Formato inválido');
        data = imported;
        activity('Backup importado');
        saveData('Backup importado com sucesso');
        render();
      } catch (error) { toast('Arquivo de backup inválido.', 'error'); }
    };
    reader.readAsText(file);
  }

  function resetData() {
    if (!confirm('Isso apagará clientes, produtos, orçamentos e pedidos deste navegador. Continuar?')) return;
    if (!confirm('Confirma a exclusão definitiva dos dados locais?')) return;
    data = defaultData();
    sessionStorage.removeItem(UNLOCK_KEY);
    saveData('Dados redefinidos');
    checkLock();
    render();
  }

  function debounce(fn, wait) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
  }

  function openSidebar() { $('#sidebar').classList.add('open'); $('#sidebarOverlay').classList.add('show'); }
  function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebarOverlay').classList.remove('show'); }

  function checkLock() {
    const locked = Boolean(data.settings.pin) && sessionStorage.getItem(UNLOCK_KEY) !== '1';
    $('#lockScreen').classList.toggle('hidden', !locked);
    $('#appShell').classList.toggle('hidden', locked);
    if (locked) setTimeout(() => $('#unlockPin')?.focus(), 80);
  }

  function bindGlobalEvents() {
    $('#nav').addEventListener('click', event => {
      const button = event.target.closest('[data-view]');
      if (button) setView(button.dataset.view);
    });
    $('#quickQuote').onclick = () => openQuoteModal();
    $('#quickClient').onclick = () => openClientModal();
    $('#openSidebar').onclick = openSidebar;
    $('#closeSidebar').onclick = closeSidebar;
    $('#sidebarOverlay').onclick = closeSidebar;
    $('#unlockForm').onsubmit = event => {
      event.preventDefault();
      if ($('#unlockPin').value === data.settings.pin) {
        sessionStorage.setItem(UNLOCK_KEY, '1');
        $('#unlockPin').value = '';
        checkLock();
      } else {
        toast('PIN incorreto.', 'error');
        $('#unlockPin').select();
      }
    };
  }

  function init() {
    updateBrand();
    bindGlobalEvents();
    checkLock();
    render();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  window.addEventListener('DOMContentLoaded', init);
