'use strict';

(function installLuxuryPdfDownload() {
  let downloading = false;

  const COLORS = {
    navy: [0.020, 0.055, 0.110],
    navy2: [0.035, 0.085, 0.155],
    gold: [0.760, 0.565, 0.235],
    goldLight: [0.910, 0.820, 0.620],
    ivory: [0.992, 0.986, 0.970],
    paper: [1, 1, 1],
    ink: [0.055, 0.075, 0.115],
    muted: [0.360, 0.395, 0.455],
    paleGold: [0.985, 0.968, 0.915],
    border: [0.880, 0.820, 0.690]
  };

  const WIDTHS = {
    helvetica: {
      default: 556,
      ' ': 278, '.': 278, ',': 278, ':': 278, ';': 278, '-': 333, '/': 278,
      '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556,
      A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
      a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500
    },
    times: {
      default: 500,
      ' ': 250, '.': 250, ',': 250, ':': 278, ';': 278, '-': 333, '/': 278,
      '0': 500, '1': 500, '2': 500, '3': 500, '4': 500, '5': 500, '6': 500, '7': 500, '8': 500, '9': 500,
      A: 722, B: 667, C: 667, D: 722, E: 611, F: 556, G: 722, H: 722, I: 333, J: 389, K: 722, L: 611, M: 889, N: 722, O: 722, P: 556, Q: 722, R: 667, S: 556, T: 611, U: 722, V: 722, W: 944, X: 722, Y: 722, Z: 611,
      a: 444, b: 500, c: 444, d: 500, e: 444, f: 333, g: 500, h: 500, i: 278, j: 278, k: 500, l: 278, m: 778, n: 500, o: 500, p: 500, q: 500, r: 333, s: 389, t: 278, u: 500, v: 500, w: 722, x: 500, y: 500, z: 444
    }
  };

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
      let line = '';
      if (!words.length) lines.push('');
      for (const word of words) {
        if (!line) line = word;
        else if (`${line} ${word}`.length <= maxChars) line += ` ${word}`;
        else { lines.push(line); line = word; }
      }
      if (line) lines.push(line);
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

  function initials(value) {
    const parts = normalizeText(value).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'OZ';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function buildPdf(quote, client, totals, settings) {
    const PAGE_WIDTH = 595.28;
    const PAGE_HEIGHT = 841.89;
    const MARGIN = 38;
    const LEFT = MARGIN;
    const RIGHT = PAGE_WIDTH - MARGIN;
    const CONTENT_WIDTH = RIGHT - LEFT;
    const FOOTER_Y = 31;
    const SAFE_BOTTOM = 72;
    const pages = [];
    let commands = [];
    let y = PAGE_HEIGHT - 36;
    let pageNumber = 1;

    const setFill = rgb => commands.push(`${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)} rg`);
    const setStroke = rgb => commands.push(`${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)} RG`);
    const setLineWidth = width => commands.push(`${width.toFixed(2)} w`);
    const line = (x1, y1, x2, y2) => commands.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);

    function rect(x, top, width, height, fill = true, stroke = false) {
      commands.push(`${x.toFixed(2)} ${(top - height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
    }

    function roundedRect(x, top, width, height, radius, fill = true, stroke = false) {
      const bottom = top - height;
      const r = Math.min(radius, width / 2, height / 2);
      const k = 0.5522847498;
      commands.push(`${(x + r).toFixed(2)} ${top.toFixed(2)} m`);
      commands.push(`${(x + width - r).toFixed(2)} ${top.toFixed(2)} l`);
      commands.push(`${(x + width - r + k * r).toFixed(2)} ${top.toFixed(2)} ${(x + width).toFixed(2)} ${(top - r + k * r).toFixed(2)} ${(x + width).toFixed(2)} ${(top - r).toFixed(2)} c`);
      commands.push(`${(x + width).toFixed(2)} ${(bottom + r).toFixed(2)} l`);
      commands.push(`${(x + width).toFixed(2)} ${(bottom + r - k * r).toFixed(2)} ${(x + width - r + k * r).toFixed(2)} ${bottom.toFixed(2)} ${(x + width - r).toFixed(2)} ${bottom.toFixed(2)} c`);
      commands.push(`${(x + r).toFixed(2)} ${bottom.toFixed(2)} l`);
      commands.push(`${(x + r - k * r).toFixed(2)} ${bottom.toFixed(2)} ${x.toFixed(2)} ${(bottom + r - k * r).toFixed(2)} ${x.toFixed(2)} ${(bottom + r).toFixed(2)} c`);
      commands.push(`${x.toFixed(2)} ${(top - r).toFixed(2)} l`);
      commands.push(`${x.toFixed(2)} ${(top - r + k * r).toFixed(2)} ${(x + r - k * r).toFixed(2)} ${top.toFixed(2)} ${(x + r).toFixed(2)} ${top.toFixed(2)} c`);
      commands.push(fill && stroke ? 'B' : fill ? 'f' : 'S');
    }

    function circle(cx, cy, radius, fill = true, stroke = false) {
      const k = 0.5522847498 * radius;
      commands.push(`${(cx + radius).toFixed(2)} ${cy.toFixed(2)} m`);
      commands.push(`${(cx + radius).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx + k).toFixed(2)} ${(cy + radius).toFixed(2)} ${cx.toFixed(2)} ${(cy + radius).toFixed(2)} c`);
      commands.push(`${(cx - k).toFixed(2)} ${(cy + radius).toFixed(2)} ${(cx - radius).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx - radius).toFixed(2)} ${cy.toFixed(2)} c`);
      commands.push(`${(cx - radius).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx - k).toFixed(2)} ${(cy - radius).toFixed(2)} ${cx.toFixed(2)} ${(cy - radius).toFixed(2)} c`);
      commands.push(`${(cx + k).toFixed(2)} ${(cy - radius).toFixed(2)} ${(cx + radius).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx + radius).toFixed(2)} ${cy.toFixed(2)} c`);
      commands.push(fill && stroke ? 'B' : fill ? 'f' : 'S');
    }

    function measureText(value, size, font = 'F1') {
      const family = font === 'F3' || font === 'F4' || font === 'F5' ? 'times' : 'helvetica';
      const table = WIDTHS[family];
      const plain = normalizeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      let units = 0;
      for (const char of plain) units += table[char] ?? table.default;
      return units * size / 1000;
    }

    function text(x, baseline, value, size = 10, font = 'F1', align = 'left', textColor = COLORS.ink) {
      const clean = normalizeText(value);
      let drawX = x;
      const width = measureText(clean, size, font);
      if (align === 'right') drawX -= width;
      if (align === 'center') drawX -= width / 2;
      commands.push('BT');
      commands.push(`/${font} ${size.toFixed(2)} Tf`);
      commands.push(`${textColor[0].toFixed(3)} ${textColor[1].toFixed(3)} ${textColor[2].toFixed(3)} rg`);
      commands.push(`1 0 0 1 ${drawX.toFixed(2)} ${baseline.toFixed(2)} Tm`);
      commands.push(`${pdfLiteral(clean)} Tj`);
      commands.push('ET');
    }

    function footer() {
      setStroke(COLORS.goldLight);
      setLineWidth(0.7);
      line(LEFT, FOOTER_Y + 22, RIGHT, FOOTER_Y + 22);
      setFill(COLORS.navy);
      rect(0, 13, PAGE_WIDTH, 13, true);
      text(LEFT, FOOTER_Y + 2, settings.footer || 'Obrigado pela preferência!', 8.2, 'F5', 'left', COLORS.ink);
      if (settings.pixKey) text(LEFT, FOOTER_Y - 11, `Pix: ${settings.pixKey}`, 7.3, 'F1', 'left', COLORS.muted);
      text(RIGHT, FOOTER_Y + 2, `Gerado pelo OrçaZap em ${new Date().toLocaleDateString('pt-BR')}`, 7.3, 'F1', 'right', COLORS.muted);
      text(RIGHT, FOOTER_Y - 11, `Página ${pageNumber}`, 7.3, 'F1', 'right', COLORS.muted);
    }

    function finishPage() {
      footer();
      pages.push(commands.join('\n') + '\n');
      commands = [];
      pageNumber += 1;
    }

    function decorativeWaves() {
      setStroke([0.88, 0.74, 0.44]);
      setLineWidth(0.35);
      for (let i = 0; i < 7; i++) {
        const offset = i * 6;
        commands.push(`${(PAGE_WIDTH - 180 + offset).toFixed(2)} ${(PAGE_HEIGHT - 8).toFixed(2)} m`);
        commands.push(`${(PAGE_WIDTH - 140 + offset).toFixed(2)} ${(PAGE_HEIGHT - 35).toFixed(2)} ${(PAGE_WIDTH - 120 + offset).toFixed(2)} ${(PAGE_HEIGHT - 85).toFixed(2)} ${(PAGE_WIDTH - 55 + offset).toFixed(2)} ${(PAGE_HEIGHT - 96).toFixed(2)} c S`);
      }
    }

    function firstPageHeader() {
      setFill(COLORS.navy);
      rect(0, PAGE_HEIGHT, PAGE_WIDTH, 150, true);
      decorativeWaves();
      setStroke(COLORS.gold);
      setLineWidth(1.2);
      line(0, PAGE_HEIGHT - 150, PAGE_WIDTH, PAGE_HEIGHT - 150);

      const brand = settings.businessName || 'Minha Empresa';
      text(LEFT, PAGE_HEIGHT - 65, initials(brand), 33, 'F4', 'left', COLORS.gold);
      text(LEFT + 72, PAGE_HEIGHT - 59, brand.toUpperCase(), 17, 'F4', 'left', COLORS.paper);
      const companyLine = [settings.phone, settings.email].filter(Boolean).join('  |  ');
      text(LEFT + 72, PAGE_HEIGHT - 81, companyLine || 'Orçamento profissional', 8.4, 'F1', 'left', COLORS.goldLight);
      if (settings.address) text(LEFT + 72, PAGE_HEIGHT - 97, settings.address, 7.6, 'F1', 'left', [0.84, 0.87, 0.92]);

      setStroke(COLORS.gold);
      setLineWidth(1);
      roundedRect(RIGHT - 145, PAGE_HEIGHT - 31, 145, 91, 7, false, true);
      text(RIGHT - 128, PAGE_HEIGHT - 55, 'ORÇAMENTO Nº', 8.5, 'F2', 'left', COLORS.gold);
      text(RIGHT - 128, PAGE_HEIGHT - 82, quote.number || '', 16, 'F2', 'left', COLORS.paper);
      const statusLabel = quote.status === 'approved' ? 'APROVADO' : quote.status === 'sent' ? 'ENVIADO' : 'PROPOSTA';
      text(RIGHT - 128, PAGE_HEIGHT - 103, statusLabel, 7.2, 'F2', 'left', COLORS.goldLight);

      y = PAGE_HEIGHT - 192;
      text(PAGE_WIDTH / 2, y, 'ORÇAMENTO', 30, 'F4', 'center', COLORS.navy);
      y -= 18;
      setStroke(COLORS.gold);
      setLineWidth(0.75);
      line(PAGE_WIDTH / 2 - 95, y, PAGE_WIDTH / 2 - 10, y);
      line(PAGE_WIDTH / 2 + 10, y, PAGE_WIDTH / 2 + 95, y);
      setFill(COLORS.gold);
      circle(PAGE_WIDTH / 2, y, 2.2, true, false);
      y -= 25;

      setFill(COLORS.ivory);
      setStroke(COLORS.border);
      setLineWidth(0.7);
      roundedRect(LEFT, y, CONTENT_WIDTH, 88, 8, true, true);
      const cardTop = y;
      const cardBottom = y - 88;
      const divider1 = LEFT + 294;
      const divider2 = LEFT + 407;
      const clientX = LEFT + 18;

      setStroke(COLORS.goldLight);
      setLineWidth(0.6);
      line(divider1, cardTop - 15, divider1, cardBottom + 15);
      line(divider2, cardTop - 15, divider2, cardBottom + 15);

      text(clientX, cardTop - 22, 'CLIENTE', 7.5, 'F2', 'left', COLORS.gold);
      text(clientX, cardTop - 43, client.name || quote.clientName || 'Cliente', 11.3, 'F2', 'left', COLORS.ink);
      const clientContact = [client.phone, client.email].filter(Boolean).join('  |  ');
      if (clientContact) text(clientX, cardTop - 61, clientContact, 7.8, 'F1', 'left', COLORS.muted);
      if (client.document) text(clientX, cardTop - 75, client.document, 7.2, 'F1', 'left', COLORS.muted);

      const issueCenter = divider1 + (divider2 - divider1) / 2;
      const validCenter = divider2 + (RIGHT - divider2) / 2;
      text(issueCenter, cardTop - 28, 'EMISSÃO', 7.2, 'F2', 'center', COLORS.gold);
      text(issueCenter, cardTop - 49, dateBR(quote.createdAt), 9.3, 'F1', 'center', COLORS.ink);
      text(validCenter, cardTop - 28, 'VALIDADE', 7.2, 'F2', 'center', COLORS.gold);
      text(validCenter, cardTop - 49, dateBR(quote.validUntil), 9.3, 'F1', 'center', COLORS.ink);

      y = cardBottom - 26;
    }

    function continuationHeader() {
      setFill(COLORS.navy);
      rect(0, PAGE_HEIGHT, PAGE_WIDTH, 76, true);
      setStroke(COLORS.gold);
      setLineWidth(1);
      line(0, PAGE_HEIGHT - 76, PAGE_WIDTH, PAGE_HEIGHT - 76);
      text(LEFT, PAGE_HEIGHT - 43, (settings.businessName || 'Minha Empresa').toUpperCase(), 14, 'F4', 'left', COLORS.paper);
      text(RIGHT, PAGE_HEIGHT - 43, `${quote.number || ''}  |  CONTINUAÇÃO`, 9, 'F2', 'right', COLORS.goldLight);
      y = PAGE_HEIGHT - 105;
    }

    function tableHeader() {
      setFill(COLORS.navy);
      setStroke(COLORS.gold);
      setLineWidth(0.7);
      roundedRect(LEFT, y, CONTENT_WIDTH, 28, 6, true, true);
      text(LEFT + 14, y - 18, 'ITEM', 8.1, 'F2', 'left', COLORS.goldLight);
      text(397, y - 18, 'QTD.', 8.1, 'F2', 'right', COLORS.goldLight);
      text(479, y - 18, 'UNITÁRIO', 8.1, 'F2', 'right', COLORS.goldLight);
      text(RIGHT - 12, y - 18, 'TOTAL', 8.1, 'F2', 'right', COLORS.goldLight);
      y -= 39;
    }

    function newContinuationPage() {
      finishPage();
      continuationHeader();
      tableHeader();
    }

    firstPageHeader();
    tableHeader();

    for (let index = 0; index < (quote.items || []).length; index++) {
      const item = quote.items[index];
      const itemLines = wrapText(item.name || 'Item', 48);
      const descriptionLines = item.description ? wrapText(item.description, 54).slice(0, 3) : [];
      const rowHeight = Math.max(40, 17 + (itemLines.length + descriptionLines.length) * 11);
      if (y - rowHeight < SAFE_BOTTOM + 110) newContinuationPage();

      const rowTop = y + 10;
      if (index % 2 === 1) {
        setFill([0.995, 0.992, 0.983]);
        rect(LEFT, rowTop, CONTENT_WIDTH, rowHeight, true);
      }
      setStroke(COLORS.goldLight);
      setLineWidth(0.45);
      line(LEFT, y - rowHeight + 8, RIGHT, y - rowHeight + 8);
      setStroke(COLORS.gold);
      setLineWidth(1.2);
      line(LEFT + 8, y + 2, LEFT + 8, y - rowHeight + 15);

      let itemY = y;
      for (const itemLine of itemLines) {
        text(LEFT + 20, itemY, itemLine, 9.3, itemY === y ? 'F2' : 'F1', 'left', COLORS.ink);
        itemY -= 11;
      }
      for (const descriptionLine of descriptionLines) {
        text(LEFT + 20, itemY, descriptionLine, 7.6, 'F1', 'left', COLORS.muted);
        itemY -= 10;
      }

      text(397, y - 4, String(item.qty ?? 0), 9.1, 'F1', 'right', COLORS.ink);
      text(479, y - 4, money(num(item.price)), 9.1, 'F1', 'right', COLORS.ink);
      text(RIGHT - 12, y - 4, money(num(item.qty) * num(item.price)), 9.3, 'F2', 'right', COLORS.ink);
      y -= rowHeight;
    }

    const summaryHeight = totals.discount > 0 ? 164 : 146;
    const notesLines = quote.notes ? wrapText(quote.notes, 76) : [];
    const notesHeight = notesLines.length ? 30 + notesLines.length * 11 : 0;
    const pixHeight = settings.pixKey ? 58 : 0;
    if (y - summaryHeight - 30 < SAFE_BOTTOM) {
      finishPage();
      continuationHeader();
    }

    y -= 13;
    const summaryWidth = 244;
    const summaryX = RIGHT - summaryWidth;
    const summaryTop = y;
    setFill(COLORS.ivory);
    setStroke(COLORS.border);
    setLineWidth(0.7);
    roundedRect(summaryX, summaryTop, summaryWidth, summaryHeight, 8, true, true);

    text(summaryX + 16, summaryTop - 23, 'Subtotal', 9, 'F1', 'left', COLORS.ink);
    text(RIGHT - 16, summaryTop - 23, money(totals.subtotal), 9.2, 'F1', 'right', COLORS.ink);
    let summaryY = summaryTop - 42;
    if (totals.discount > 0) {
      text(summaryX + 16, summaryY, 'Desconto', 8.8, 'F1', 'left', COLORS.muted);
      text(RIGHT - 16, summaryY, `- ${money(totals.discount)}`, 8.8, 'F1', 'right', COLORS.muted);
      summaryY -= 18;
    }
    setFill(COLORS.navy);
    rect(summaryX, summaryY + 11, summaryWidth, 38, true);
    text(summaryX + 16, summaryY - 13, 'TOTAL', 14, 'F4', 'left', COLORS.gold);
    text(RIGHT - 16, summaryY - 13, money(totals.total), 16, 'F4', 'right', COLORS.gold);
    summaryY -= 55;
    text(summaryX + 16, summaryY, `Entrada (${quote.entryPercent || 0}%):`, 8.9, 'F1', 'left', COLORS.ink);
    text(RIGHT - 16, summaryY, money(totals.entry), 9.2, 'F2', 'right', COLORS.ink);
    setStroke(COLORS.goldLight);
    setLineWidth(0.45);
    line(summaryX + 16, summaryY - 12, RIGHT - 16, summaryY - 12);
    summaryY -= 31;
    text(summaryX + 16, summaryY, 'Saldo:', 8.9, 'F1', 'left', COLORS.ink);
    text(RIGHT - 16, summaryY, money(totals.balance), 9.2, 'F2', 'right', COLORS.ink);

    y = summaryTop - summaryHeight - 22;

    if (notesLines.length) {
      if (y - notesHeight - pixHeight < SAFE_BOTTOM) {
        finishPage();
        continuationHeader();
      }
      text(LEFT, y, 'OBSERVAÇÕES E CONDIÇÕES', 8, 'F2', 'left', COLORS.gold);
      y -= 17;
      setFill(COLORS.paleGold);
      setStroke(COLORS.border);
      setLineWidth(0.5);
      roundedRect(LEFT, y + 10, CONTENT_WIDTH, 18 + notesLines.length * 11, 6, true, true);
      let noteY = y - 6;
      for (const noteLine of notesLines) {
        text(LEFT + 12, noteY, noteLine, 8.1, 'F1', 'left', COLORS.ink);
        noteY -= 11;
      }
      y -= 30 + notesLines.length * 11;
    }

    if (settings.pixKey) {
      if (y - pixHeight < SAFE_BOTTOM) {
        finishPage();
        continuationHeader();
      }
      setFill(COLORS.navy2);
      setStroke(COLORS.gold);
      setLineWidth(0.7);
      roundedRect(LEFT, y, CONTENT_WIDTH, 46, 7, true, true);
      text(LEFT + 14, y - 17, 'PAGAMENTO VIA PIX', 8.2, 'F2', 'left', COLORS.gold);
      text(LEFT + 14, y - 33, `Chave: ${settings.pixKey}`, 8.6, 'F1', 'left', COLORS.paper);
      if (settings.pixName) text(RIGHT - 14, y - 33, `Favorecido: ${settings.pixName}`, 8.2, 'F1', 'right', COLORS.paper);
      y -= 58;
    }

    finishPage();

    const objects = [];
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    const pageObjectIds = pages.map((_, index) => 8 + index * 2);
    objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    objects[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>';
    objects[6] = '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>';
    objects[7] = '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic /Encoding /WinAnsiEncoding >>';

    pages.forEach((content, index) => {
      const pageId = 8 + index * 2;
      const contentId = pageId + 1;
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R /F5 7 0 R >> >> /Contents ${contentId} 0 R >>`;
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
    for (let id = 1; id <= maxId; id++) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
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
      activity(`PDF luxo baixado: ${quote.number}`);
      saveData('PDF luxo baixado com sucesso');
      toast('PDF luxo baixado com sucesso.');
    } catch (error) {
      console.error('PDF luxo:', error);
      toast(`Não foi possível gerar o PDF: ${error?.message || 'erro inesperado'}`, 'error');
    } finally {
      setTimeout(() => { downloading = false; }, 1000);
    }
  };

  window.generateQuotePDF = window.downloadQuotePDF;
})();