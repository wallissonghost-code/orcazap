'use strict';

(function installPdfDeliveryFix() {
  const originalGenerateQuotePDF = window.generateQuotePDF;
  if (typeof originalGenerateQuotePDF !== 'function') return;

  const wait = (promise, ms, message) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      let script = document.querySelector(`script[src="${src}"]`);
      if (script && !window.jspdf?.jsPDF) script.remove();
      script = document.createElement('script');
      const timer = setTimeout(() => {
        script.remove();
        reject(new Error('Tempo excedido ao carregar a biblioteca de PDF.'));
      }, 5000);
      script.src = src;
      script.async = true;
      script.onload = () => {
        clearTimeout(timer);
        window.jspdf?.jsPDF ? resolve() : reject(new Error('Biblioteca de PDF inválida.'));
      };
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        reject(new Error('Falha ao carregar a biblioteca de PDF.'));
      };
      document.head.appendChild(script);
    });
  }

  async function ensurePdfLibrary() {
    if (window.jspdf?.jsPDF) return;
    const sources = [
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
      'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js'
    ];
    for (const src of sources) {
      try {
        await loadScript(src);
        if (window.jspdf?.jsPDF) return;
      } catch (_) {}
    }
    throw new Error('O gerador automático não carregou.');
  }

  function prepareWindow() {
    const preview = window.open('', '_blank');
    if (!preview) return null;
    preview.document.open();
    preview.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Gerando PDF — OrçaZap</title></head><body style="font-family:system-ui;padding:32px;text-align:center"><h2>Gerando seu PDF...</h2><p>Aguarde alguns segundos.</p></body></html>');
    preview.document.close();
    return preview;
  }

  function html(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }

  function renderPrintableQuote(id, preview, reason = '') {
    const quote = data.quotes.find(item => item.id === id);
    if (!quote) throw new Error('Orçamento não encontrado.');
    const client = data.clients.find(item => item.id === quote.clientId) || {};
    const totals = quoteTotals(quote);
    const settings = data.settings || {};
    const itemRows = quote.items.map(item => `
      <tr>
        <td><strong>${html(item.name)}</strong>${item.description ? `<small>${html(item.description)}</small>` : ''}</td>
        <td class="right">${html(item.qty)}</td>
        <td class="right">${html(money(item.price))}</td>
        <td class="right"><strong>${html(money(num(item.qty) * num(item.price)))}</strong></td>
      </tr>`).join('');

    const target = preview && !preview.closed ? preview : window.open('', '_blank');
    if (!target) throw new Error('Permita pop-ups para abrir o orçamento.');
    target.document.open();
    target.document.write(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${html(quote.number)} — OrçaZap</title>
<style>
@page{size:A4;margin:13mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#0f172a;margin:0;background:#eef2f7}.sheet{width:210mm;min-height:297mm;margin:18px auto;background:white;padding:14mm;box-shadow:0 8px 30px #0002}.header{background:#0b1220;color:white;border-radius:10px;padding:18px 22px;display:flex;justify-content:space-between;gap:20px}.header h1{margin:0 0 6px;font-size:23px}.header p{margin:3px 0;font-size:12px;color:#dbeafe}.title{display:flex;justify-content:space-between;align-items:end;margin:26px 0 12px;border-bottom:1px solid #dbe3ee;padding-bottom:12px}.title h2{font-size:25px;margin:0}.meta{display:grid;grid-template-columns:1fr auto auto;gap:24px;margin:18px 0 22px}.label{font-size:10px;color:#64748b;font-weight:bold;margin-bottom:5px}.value{font-size:13px}.muted{font-size:11px;color:#64748b;margin-top:4px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#f1f5f9;color:#475569;text-align:left;padding:10px}td{padding:11px 10px;border-bottom:1px solid #e8edf4;vertical-align:top}td small{display:block;color:#64748b;margin-top:4px}.right{text-align:right}.totals{width:75mm;margin:20px 0 0 auto;font-size:12px}.line{display:flex;justify-content:space-between;padding:5px 8px}.grand{background:#e8f8f0;color:#087a48;border-radius:8px;font-size:16px;font-weight:bold;padding:11px 9px;margin:5px 0}.notes{margin-top:24px;font-size:12px;white-space:pre-wrap}.payment{margin-top:18px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12px}.footer{margin-top:28px;padding-top:12px;border-top:1px solid #dbe3ee;font-size:10px;color:#64748b;display:flex;justify-content:space-between}.actions{position:fixed;right:20px;bottom:20px;display:flex;gap:8px}.actions button{border:0;border-radius:8px;padding:12px 17px;font-weight:bold;cursor:pointer}.primary{background:#0f9f63;color:white}.secondary{background:#fff;color:#0f172a;border:1px solid #cbd5e1!important}.warning{max-width:210mm;margin:12px auto 0;background:#fff7d6;padding:10px 14px;border-radius:8px;font:12px Arial;color:#715b00}@media(max-width:800px){body{background:white}.sheet{width:100%;min-height:0;margin:0;padding:18px;box-shadow:none}.meta{grid-template-columns:1fr}.actions{position:sticky;bottom:8px;justify-content:center;margin:15px}.warning{margin:0;border-radius:0}}@media print{body{background:white}.sheet{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none}.actions,.warning{display:none!important}}
</style></head><body>
${reason ? `<div class="warning">O PDF automático não terminou, então abrimos o modo seguro de impressão. Clique em <strong>Salvar como PDF / Imprimir</strong>.</div>` : ''}
<main class="sheet">
<section class="header"><div><h1>${html(settings.businessName || 'Minha Empresa')}</h1><p>${html([settings.document, settings.phone, settings.email].filter(Boolean).join(' • ') || 'Orçamento profissional')}</p><p>${html(settings.address || '')}</p></div><div style="text-align:right"><strong>ORÇAMENTO</strong><p>${html(quote.number)}</p></div></section>
<section class="title"><h2>Orçamento</h2><strong>${html(quote.number)}</strong></section>
<section class="meta"><div><div class="label">CLIENTE</div><div class="value"><strong>${html(client.name || quote.clientName || 'Cliente')}</strong></div><div class="muted">${html([client.document, client.phone, client.email].filter(Boolean).join(' • '))}</div><div class="muted">${html(client.address || '')}</div></div><div><div class="label">EMISSÃO</div><div class="value">${html(dateBR(quote.createdAt))}</div></div><div><div class="label">VALIDADE</div><div class="value">${html(dateBR(quote.validUntil))}</div></div></section>
<table><thead><tr><th>ITEM</th><th class="right">QTD.</th><th class="right">UNITÁRIO</th><th class="right">TOTAL</th></tr></thead><tbody>${itemRows}</tbody></table>
<section class="totals"><div class="line"><span>Subtotal</span><strong>${html(money(totals.subtotal))}</strong></div>${totals.discount > 0 ? `<div class="line"><span>Desconto</span><strong>- ${html(money(totals.discount))}</strong></div>` : ''}<div class="line grand"><span>TOTAL</span><span>${html(money(totals.total))}</span></div><div class="line"><span>Entrada (${html(quote.entryPercent)}%)</span><strong>${html(money(totals.entry))}</strong></div><div class="line"><span>Saldo</span><strong>${html(money(totals.balance))}</strong></div></section>
${quote.notes ? `<section class="notes"><strong>OBSERVAÇÕES</strong><br><br>${html(quote.notes)}</section>` : ''}
${settings.pixKey ? `<section class="payment"><strong>Pagamento via Pix</strong><br>Chave: ${html(settings.pixKey)}${settings.pixName ? `<br>Favorecido: ${html(settings.pixName)}` : ''}</section>` : ''}
<footer class="footer"><span>${html(settings.footer || 'Obrigado pela preferência!')}</span><span>Gerado pelo OrçaZap em ${new Date().toLocaleDateString('pt-BR')}</span></footer>
</main><div class="actions"><button class="secondary" onclick="window.close()">Fechar</button><button class="primary" onclick="window.print()">Salvar como PDF / Imprimir</button></div>
<script>setTimeout(function(){try{window.focus();window.print()}catch(e){}},900)<\/script></body></html>`);
    target.document.close();
    activity(`Orçamento aberto para impressão: ${quote.number}`);
    saveData('Orçamento pronto para salvar em PDF');
  }

  function deliverPdf(doc, filename, preview) {
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    if (preview && !preview.closed) {
      preview.location.replace(url);
    } else {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || 'orcamento.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    return doc;
  }

  window.generateQuotePDF = async function generateQuotePDFReliable(id) {
    const preview = prepareWindow();
    let OriginalJsPDF = null;
    const originalPixKey = data.settings.pixKey;
    const originalFooter = data.settings.footer;
    let stopped = false;

    try {
      toast('Gerando PDF...');
      await wait(ensurePdfLibrary(), 16000, 'A biblioteca demorou demais para carregar.');
      OriginalJsPDF = window.jspdf.jsPDF;
      function CompatibleJsPDF(...args) {
        const doc = new OriginalJsPDF(...args);
        doc.save = filename => stopped ? doc : deliverPdf(doc, filename, preview);
        return doc;
      }
      Object.assign(CompatibleJsPDF, OriginalJsPDF);
      CompatibleJsPDF.API = OriginalJsPDF.API;
      window.jspdf.jsPDF = CompatibleJsPDF;

      if (originalPixKey) {
        data.settings.pixKey = '';
        data.settings.footer = `${originalFooter || 'Obrigado pela preferência!'} | Pix: ${originalPixKey}`;
      }

      await wait(originalGenerateQuotePDF(id), 10000, 'A montagem automática demorou demais.');
      toast('PDF aberto com sucesso.');
    } catch (error) {
      stopped = true;
      console.error('PDF automático:', error);
      renderPrintableQuote(id, preview, error.message);
      toast('Abrimos o modo seguro para salvar como PDF.');
    } finally {
      data.settings.pixKey = originalPixKey;
      data.settings.footer = originalFooter;
      if (OriginalJsPDF) window.jspdf.jsPDF = OriginalJsPDF;
    }
  };
})();