'use strict';

(function installNativePdfDownload() {
  let downloading = false;

  function normalizeText(value) {
    return String(value ?? '')
      .replace(/\r\n?/g, '\n')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/\u2022/g, '•');
  }

  function toWinAnsiBinary(value) {
    const map = {
      0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84,
      0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88,
      0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C,
      0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93,
      0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
      0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
      0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F
    };
    let output = '';
    for (const character of normalizeText(value)) {
      const code = character.codePointAt(0);
      if (code <= 0xFF) output += String.fromCharCode(code);
      else if (map[code]) output += String.fromCharCode(map[code]);
      else output += '?';
    }
    return output;
  }

  function pdfLiteral(value) {
    return `(${toWinAnsiBinary(value)
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/[\r\n]+/g, ' ')})`;
  }

  function wrapText(value, maxChars = 70) {
    const paragraphs = normalizeText(value).split('\n');
    const lines = [];
    paragraphs.forEach((paragraph, paragraphIndex) => {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);
      if (!words.length) {
        lines.push('');
      } else {
        let line = '';
        for (const word of words) {
          if (!line) line = word;
          else if ((line + ' ' + word).length <= maxChars) line += ' ' + word;
          else {
            lines.push(line);
            line = word;
          }
        }
        if (line) lines.push(line);
      }
      if (paragraphIndex < paragraphs.length - 1) lines.push('');
    });
    return lines;
  }

  function sanitizeFilename(value) {
    return normalizeText(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'orcamento';
  }

  function buildPdf(quote, client, totals, settings) {
    const PAGE_WIDTH = 595.28;
    const PAGE_HEIGHT = 841.89;
    const LEFT = 42;
    const RIGHT = PAGE_WIDTH - 42;
    const BOTTOM = 58;
    const pages = [];
    let commands = [];
    let y = PAGE_HEIGHT - 42;

    function color(r, g, b, stroke = false) {
      commands.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} ${stroke ? 'RG' : 'rg'}`);
    }

    function rect(x, top, width, height, fill = true) {
      commands.push(`${x.toFixed(2)} ${(top - height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${fill ? 'f' : 'S'}`);
    }

    function line(x1, y1, x2, y2) {
      commands.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    }

    function estimatedWidth(text, size) {
      return normalizeText(text).length * size * 0.50;
    }

    function text(x, baseline, value, size = 10, bold = false, align = 'left', textColor = [0.06, 0.09, 0.16]) {
      const clean = normalizeText(value);
      let drawX = x;
      if (align === 'right') drawX -= estimatedWidth(clean, size);
      if (align === 'center') drawX -= estimatedWidth(clean, size) / 2;
      commands.push('BT');
      commands.push(`/${bold ? 'F2' : 'F1'} ${size.toFixed(2)} Tf`);
      commands.push(`${textColor[0].toFixed(3)} ${textColor[1].toFixed(3)} ${textColor[2].toFixed(3)} rg`);
      commands.push(`1 0 0 1 ${drawX.toFixed(2)} ${baseline.toFixed(2)} Tm`);
      commands.push(`${pdfLiteral(clean)} Tj`);
      commands.push('ET');
    }

    function finishPage() {
      if (commands.length) pages.push(commands.join('\n') + '\n');
      commands = [];
    }

    function header(isContinuation = false) {
      color(0.043, 0.071, 0.125);
      rect(LEFT - 8, PAGE_HEIGHT - 34, RIGHT - LEFT + 16, 58, true);
      text(LEFT + 8, PAGE_HEIGHT - 57, settings.businessName || 'Minha Empresa', 17, true, 'left', [1, 1, 1]);
      const companyLine = [settings.document, settings.phone, settings.email].filter(Boolean).join(' • ');
      text(LEFT + 8, PAGE_HEIGHT - 74, companyLine || 'Orçamento profissional', 8.5, false, 'left', [0.86, 0.91, 0.98]);
      text(RIGHT - 8, PAGE_HEIGHT - 57, isContinuation ? 'CONTINUAÇÃO' : 'ORÇAMENTO', 10, true, 'right', [1, 1, 1]);
      text(RIGHT - 8, PAGE_HEIGHT - 74, quote.number || '', 9, false, 'right', [0.86, 0.91, 0.98]);
      y = PAGE_HEIGHT - 116;
    }

    function tableHeader() {
      color(0.95, 0.96, 0.98);
      rect(LEFT, y + 7, RIGHT - LEFT, 22, true);
      text(LEFT + 6, y - 7, 'ITEM', 8, true, 'left', [0.28, 0.33, 0.41]);
      text(392, y - 7, 'QTD.', 8, true, 'right', [0.28, 0.33, 0.41]);
      text(474, y - 7, 'UNITÁRIO', 8, true, 'right', [0.28, 0.33, 0.41]);
      text(RIGHT - 6, y - 7, 'TOTAL', 8, true, 'right', [0.28, 0.33, 0.41]);
      y -= 29;
    }

    function newPage(isContinuation = true) {
      finishPage();
      header(isContinuation);
      tableHeader();
    }

    header(false);
    text(LEFT, y, 'ORÇAMENTO', 20, true);
    text(RIGHT, y, quote.number || '', 10, true, 'right');
    y -= 13;
    color(0.88, 0.91, 0.94, true);
    line(LEFT, y, RIGHT, y);
    y -= 24;

    text(LEFT, y, 'CLIENTE', 8, true, 'left', [0.39, 0.45, 0.55]);
    text(390, y, 'EMISSÃO', 8, true, 'left', [0.39, 0.45, 0.55]);
    text(477, y, 'VALIDADE', 8, true, 'left', [0.39, 0.45, 0.55]);
    y -= 15;
    text(LEFT, y, client.name || quote.clientName || 'Cliente', 11, true);
    text(390, y, dateBR(quote.createdAt), 9);
    text(477, y, dateBR(quote.validUntil), 9);
    y -= 15;

    const clientLine = [client.document, client.phone, client.email].filter(Boolean).join(' • ');
    if (clientLine) {
      text(LEFT, y, clientLine, 8.5, false, 'left', [0.39, 0.45, 0.55]);
      y -= 13;
    }
    if (client.address) {
      for (const addressLine of wrapText(client.address, 85)) {
        text(LEFT, y, addressLine, 8.5, false, 'left', [0.39, 0.45, 0.55]);
        y -= 12;
      }
    }
    y -= 8;
    tableHeader();

    for (const item of quote.items || []) {
      const itemLines = wrapText(item.name || 'Item', 48);
      const descriptionLines = item.description ? wrapText(item.description, 54).slice(0, 2) : [];
      const rowHeight = Math.max(28, 15 + (itemLines.length + descriptionLines.length) * 11);
      if (y - rowHeight < BOTTOM + 90) newPage(true);

      let itemY = y;
      for (const itemLine of itemLines) {
        text(LEFT + 6, itemY, itemLine, 9, itemY === y);
        itemY -= 11;
      }
      for (const descriptionLine of descriptionLines) {
        text(LEFT + 6, itemY, descriptionLine, 7.5, false, 'left', [0.39, 0.45, 0.55]);
        itemY -= 10;
      }

      text(392, y, String(item.qty ?? 0), 9, false, 'right');
      text(474, y, money(num(item.price)), 9, false, 'right');
      text(RIGHT - 6, y, money(num(item.qty) * num(item.price)), 9, true, 'right');
      y -= rowHeight;
      color(0.93, 0.95, 0.97, true);
      line(LEFT, y + 8, RIGHT, y + 8);
    }

    if (y < BOTTOM + 190) newPage(true);
    y -= 8;
    const totalX = 386;
    text(totalX, y, 'Subtotal', 9, false, 'left', [0.28, 0.33, 0.41]);
    text(RIGHT, y, money(totals.subtotal), 9, false, 'right');
    y -= 16;
    if (totals.discount > 0) {
      text(totalX, y, 'Desconto', 9, false, 'left', [0.28, 0.33, 0.41]);
      text(RIGHT, y, `- ${money(totals.discount)}`, 9, false, 'right');
      y -= 17;
    }
    color(0.91, 0.97, 0.94);
    rect(totalX - 8, y + 9, RIGHT - totalX + 8, 30, true);
    text(totalX, y - 8, 'TOTAL', 12, true, 'left', [0.04, 0.49, 0.29]);
    text(RIGHT - 6, y - 8, money(totals.total), 12, true, 'right', [0.04, 0.49, 0.29]);
    y -= 40;
    text(totalX, y, `Entrada (${quote.entryPercent || 0}%):`, 9);
    text(RIGHT, y, money(totals.entry), 9, true, 'right');
    y -= 15;
    text(totalX, y, 'Saldo:', 9);
    text(RIGHT, y, money(totals.balance), 9, true, 'right');
    y -= 25;

    if (quote.notes) {
      if (y < BOTTOM + 80) newPage(true);
      text(LEFT, y, 'OBSERVAÇÕES', 8, true, 'left', [0.39, 0.45, 0.55]);
      y -= 16;
      for (const noteLine of wrapText(quote.notes, 92)) {
        if (y < BOTTOM + 50) newPage(true);
        text(LEFT, y, noteLine, 8.5);
        y -= 12;
      }
      y -= 8;
    }

    if (settings.pixKey) {
      if (y < BOTTOM + 65) newPage(true);
      color(0.97, 0.98, 0.99);
      rect(LEFT, y + 8, RIGHT - LEFT, 44, true);
      text(LEFT + 10, y - 7, 'PAGAMENTO VIA PIX', 8, true, 'left', [0.28, 0.33, 0.41]);
      text(LEFT + 10, y - 23, `Chave: ${settings.pixKey}`, 9);
      if (settings.pixName) text(RIGHT - 10, y - 23, `Favorecido: ${settings.pixName}`, 8.5, false, 'right');
      y -= 55;
    }

    const footerY = 34;
    color(0.88, 0.91, 0.94, true);
    line(LEFT, footerY + 17, RIGHT, footerY + 17);
    text(LEFT, footerY, settings.footer || 'Obrigado pela preferência!', 7.5, false, 'left', [0.39, 0.45, 0.55]);
    text(RIGHT, footerY, `Gerado pelo OrçaZap em ${new Date().toLocaleDateString('pt-BR')}`, 7.5, false, 'right', [0.39, 0.45, 0.55]);
    finishPage();

    const objects = [];
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    const pageObjectIds = pages.map((_, index) => 5 + index * 2);
    objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

    pages.forEach((content, index) => {
      const pageId = 5 + index * 2;
      const contentId = pageId + 1;
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId] = `<< /Length ${content.length} >>\nstream\n${content}endstream`;
    });

    let pdf = '%PDF-1.4\n%âãÏÓ\n';
    const offsets = [0];
    const maxId = objects.length - 1;
    for (let id = 1; id <= maxId; id++) {
      offsets[id] = pdf.length;
      pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${maxId + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let id = 1; id <= maxId; id++) {
      pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    const bytes = new Uint8Array(pdf.length);
    for (let index = 0; index < pdf.length; index++) bytes[index] = pdf.charCodeAt(index) & 0xFF;
    return new Blob([bytes], { type: 'application/pdf' });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
      if (document.visibilityState === 'visible' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        const fallback = document.createElement('a');
        fallback.href = url;
        fallback.target = '_blank';
        fallback.rel = 'noopener';
        fallback.style.display = 'none';
        document.body.appendChild(fallback);
        fallback.click();
        fallback.remove();
      }
    }, 900);

    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  window.downloadQuotePDF = function downloadQuotePDF(id) {
    if (downloading) return toast('Aguarde o download atual terminar.');
    downloading = true;
    try {
      const quote = data.quotes.find(item => item.id === id);
      if (!quote) throw new Error('Orçamento não encontrado.');
      const client = data.clients.find(item => item.id === quote.clientId) || {};
      const totals = quoteTotals(quote);
      const settings = data.settings || {};
      const blob = buildPdf(quote, client, totals, settings);
      const filename = `${sanitizeFilename(quote.number)}-${sanitizeFilename(client.name || quote.clientName || 'cliente')}.pdf`;
      downloadBlob(blob, filename);
      activity(`PDF baixado: ${quote.number}`);
      saveData('PDF baixado com sucesso');
      toast('PDF baixado com sucesso.');
    } catch (error) {
      console.error('PDF nativo:', error);
      toast(`Não foi possível gerar o PDF: ${error?.message || 'erro inesperado'}`, 'error');
    } finally {
      setTimeout(() => { downloading = false; }, 1000);
    }
  };

  window.generateQuotePDF = window.downloadQuotePDF;
})();
