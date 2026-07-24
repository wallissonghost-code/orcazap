'use strict';

(function installDirectPdfDownload() {
  const originalGenerateQuotePDF = window.generateQuotePDF;
  if (typeof originalGenerateQuotePDF !== 'function') return;

  let downloading = false;

  const timeout = (promise, ms, message) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => {
        script.remove();
        reject(new Error('Tempo excedido ao carregar o gerador de PDF.'));
      }, 6000);
      script.src = src;
      script.async = true;
      script.onload = () => {
        clearTimeout(timer);
        window.jspdf?.jsPDF ? resolve() : reject(new Error('Biblioteca de PDF inválida.'));
      };
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        reject(new Error('Falha ao carregar o gerador de PDF.'));
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
    for (const source of sources) {
      try {
        await loadScript(source);
        if (window.jspdf?.jsPDF) return;
      } catch (_) {}
    }
    throw new Error('Não foi possível carregar o gerador de PDF.');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'orcamento.pdf';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  window.downloadQuotePDF = async function downloadQuotePDF(id) {
    if (downloading) return toast('Aguarde o PDF atual terminar.');
    downloading = true;

    let OriginalJsPDF = null;
    const originalPixKey = data.settings.pixKey;
    const originalFooter = data.settings.footer;

    try {
      toast('Preparando o download do PDF...');
      await timeout(ensurePdfLibrary(), 20000, 'O gerador de PDF demorou demais para carregar.');

      OriginalJsPDF = window.jspdf.jsPDF;
      function DownloadJsPDF(...args) {
        const doc = new OriginalJsPDF(...args);
        doc.save = filename => {
          downloadBlob(doc.output('blob'), filename);
          return doc;
        };
        return doc;
      }
      Object.assign(DownloadJsPDF, OriginalJsPDF);
      DownloadJsPDF.API = OriginalJsPDF.API;
      window.jspdf.jsPDF = DownloadJsPDF;

      // Evita que a criação do QR atrase ou bloqueie o download em celulares.
      if (originalPixKey) {
        data.settings.pixKey = '';
        data.settings.footer = `${originalFooter || 'Obrigado pela preferência!'} | Pix: ${originalPixKey}`;
      }

      await timeout(originalGenerateQuotePDF(id), 15000, 'A montagem do PDF demorou demais.');
      toast('PDF baixado com sucesso.');
    } catch (error) {
      console.error('Download do PDF:', error);
      toast(`Não foi possível baixar o PDF: ${error?.message || 'erro inesperado'}`, 'error');
    } finally {
      data.settings.pixKey = originalPixKey;
      data.settings.footer = originalFooter;
      if (OriginalJsPDF) window.jspdf.jsPDF = OriginalJsPDF;
      downloading = false;
    }
  };

  // Os botões existentes passam a baixar o arquivo diretamente.
  window.generateQuotePDF = window.downloadQuotePDF;
})();
