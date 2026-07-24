'use strict';

(function installPdfDeliveryFix() {
  const originalGenerateQuotePDF = window.generateQuotePDF;
  if (typeof originalGenerateQuotePDF !== 'function') return;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => { script.dataset.loaded = '1'; resolve(); };
      script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
      document.head.appendChild(script);
    });
  }

  async function ensurePdfLibrary() {
    if (window.jspdf?.jsPDF) return;
    const fallbacks = [
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
      'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js'
    ];
    for (const src of fallbacks) {
      try {
        await loadScript(src);
        if (window.jspdf?.jsPDF) return;
      } catch (_) {}
    }
    throw new Error('Não foi possível carregar o gerador de PDF.');
  }

  function preparePreviewWindow() {
    const preview = window.open('', '_blank');
    if (!preview) return null;
    try {
      preview.document.title = 'Gerando PDF — OrçaZap';
      preview.document.body.innerHTML = '<div style="font-family:system-ui;padding:32px;text-align:center"><h2>Gerando seu PDF...</h2><p>Esta janela será atualizada automaticamente.</p></div>';
    } catch (_) {}
    return preview;
  }

  function deliverPdf(doc, filename, previewWindow) {
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);

    if (previewWindow && !previewWindow.closed) {
      previewWindow.location.replace(url);
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      return doc;
    }

    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'orcamento.pdf';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    return doc;
  }

  window.generateQuotePDF = async function generateQuotePDFFixed(id) {
    const previewWindow = preparePreviewWindow();
    let originalSave = null;
    let jsPDF = null;

    try {
      toast('Gerando PDF...');
      await ensurePdfLibrary();
      jsPDF = window.jspdf.jsPDF;
      originalSave = jsPDF.API.save;
      jsPDF.API.save = function savePdfCompat(filename) {
        return deliverPdf(this, filename, previewWindow);
      };

      await originalGenerateQuotePDF(id);
      toast(previewWindow ? 'PDF aberto em uma nova aba.' : 'PDF baixado com sucesso.');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      if (previewWindow && !previewWindow.closed) previewWindow.close();
      toast(`Não foi possível gerar o PDF: ${error?.message || 'erro inesperado'}`, 'error');
    } finally {
      if (jsPDF && originalSave) jsPDF.API.save = originalSave;
    }
  };
})();
