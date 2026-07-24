'use strict';
  function bindViewEvents() {
    $$('[data-go]').forEach(btn => btn.onclick = () => setView(btn.dataset.go));
    $$('[data-action="new-quote"]').forEach(btn => btn.onclick = () => openQuoteModal());
    $$('[data-action="new-client"]').forEach(btn => btn.onclick = () => openClientModal());
    $$('[data-action="new-product"]').forEach(btn => btn.onclick = () => openProductModal());
    $$('[data-edit-quote]').forEach(btn => btn.onclick = () => openQuoteModal(btn.dataset.editQuote));
    $$('[data-edit-client]').forEach(btn => btn.onclick = () => openClientModal(btn.dataset.editClient));
    $$('[data-edit-product]').forEach(btn => btn.onclick = () => openProductModal(btn.dataset.editProduct));
    $$('[data-client-quote]').forEach(btn => btn.onclick = () => openQuoteModal(null, btn.dataset.clientQuote));
    $$('[data-pdf-quote]').forEach(btn => btn.onclick = () => generateQuotePDF(btn.dataset.pdfQuote));
    $$('[data-whatsapp-quote]').forEach(btn => btn.onclick = () => sendQuoteWhatsApp(btn.dataset.whatsappQuote));
    $$('[data-more-quote]').forEach(btn => btn.onclick = () => openQuoteActions(btn.dataset.moreQuote));

    $$('[data-delete-client]').forEach(btn => btn.onclick = () => deleteClient(btn.dataset.deleteClient));
    $$('[data-delete-product]').forEach(btn => btn.onclick = () => deleteProduct(btn.dataset.deleteProduct));
    $$('[data-delete-order]').forEach(btn => btn.onclick = () => deleteOrder(btn.dataset.deleteOrder));
    $$('[data-order-status]').forEach(select => select.onchange = () => updateOrderStatus(select.dataset.orderStatus, select.value));

    const quoteSearch = $('#quoteSearch');
    if (quoteSearch) quoteSearch.oninput = debounce(() => { filters.quotes = quoteSearch.value; render(); }, 180);
    const quoteFilter = $('#quoteStatusFilter');
    if (quoteFilter) quoteFilter.onchange = () => { filters.quoteStatus = quoteFilter.value; render(); };
    const clientSearch = $('#clientSearch');
    if (clientSearch) clientSearch.oninput = debounce(() => { filters.clients = clientSearch.value; render(); }, 180);
    const productSearch = $('#productSearch');
    if (productSearch) productSearch.oninput = debounce(() => { filters.products = productSearch.value; render(); }, 180);

    $$('[data-settings-tab]').forEach(btn => btn.onclick = () => { settingsTab = btn.dataset.settingsTab; render(); });
    bindSettingsForms();
  }

  function bindSettingsForms() {
    const businessForm = $('#businessForm');
    if (businessForm) businessForm.onsubmit = event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(businessForm));
      Object.assign(data.settings, values);
      activity('Dados da empresa atualizados');
      saveData('Dados da empresa salvos');
      render();
    };

    const logoInput = $('#logoInput');
    if (logoInput) logoInput.onchange = () => {
      const file = logoInput.files[0];
      if (!file) return;
      if (file.size > 2_000_000) return toast('Use uma imagem de até 2 MB.', 'error');
      const reader = new FileReader();
      reader.onload = () => { data.settings.logo = reader.result; saveData('Logo atualizada'); render(); };
      reader.readAsDataURL(file);
    };

    const paymentForm = $('#paymentForm');
    if (paymentForm) paymentForm.onsubmit = event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(paymentForm));
      values.defaultEntry = num(values.defaultEntry);
      values.defaultValidity = num(values.defaultValidity);
      Object.assign(data.settings, values);
      activity('Preferências de pagamento atualizadas');
      saveData('Preferências salvas');
      render();
    };

    const securityForm = $('#securityForm');
    if (securityForm) securityForm.onsubmit = event => {
      event.preventDefault();
      const pin = new FormData(securityForm).get('pin').trim();
      if (pin && !/^\d{4,8}$/.test(pin)) return toast('O PIN deve ter de 4 a 8 números.', 'error');
      data.settings.pin = pin;
      sessionStorage.setItem(UNLOCK_KEY, '1');
      activity(pin ? 'PIN de acesso configurado' : 'PIN de acesso removido');
      saveData(pin ? 'PIN configurado' : 'PIN removido');
      render();
    };

    const exportBtn = $('#exportBackup');
    if (exportBtn) exportBtn.onclick = exportBackup;
    const importInput = $('#importBackup');
    if (importInput) importInput.onchange = () => importBackup(importInput.files[0]);
    const resetBtn = $('#resetData');
    if (resetBtn) resetBtn.onclick = resetData;
  }

  function modal(title, body, footer = '', wide = false) {
    $('#modalRoot').innerHTML = `<div class="modal-backdrop"><section class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="modal-header"><h2>${title}</h2><button class="close-btn" data-close-modal aria-label="Fechar">×</button></header><div class="modal-body">${body}</div>${footer ? `<footer class="modal-footer">${footer}</footer>` : ''}</section></div>`;
    const backdrop = $('.modal-backdrop');
    backdrop.addEventListener('mousedown', event => { if (event.target === backdrop) closeModal(); });
    $$('[data-close-modal]').forEach(btn => btn.onclick = closeModal);
    document.addEventListener('keydown', escCloseModal);
  }

  function escCloseModal(event) { if (event.key === 'Escape') closeModal(); }
  function closeModal() { $('#modalRoot').innerHTML = ''; document.removeEventListener('keydown', escCloseModal); }

  function openClientModal(id = null) {
    const client = id ? data.clients.find(c => c.id === id) : null;
    modal(client ? 'Editar cliente' : 'Novo cliente', `
      <form id="clientForm" class="form-grid">
        <input type="hidden" name="id" value="${esc(client?.id || '')}">
        ${field('name', 'Nome ou empresa', client?.name || '', 'text', true)}
        ${field('phone', 'WhatsApp/telefone', client?.phone || '')}
        ${field('email', 'E-mail', client?.email || '', 'email')}
        ${field('document', 'CPF/CNPJ', client?.document || '')}
        <div class="field full"><label>Endereço</label><input class="input" name="address" value="${esc(client?.address || '')}"></div>
        <div class="field full"><label>Observações</label><textarea class="textarea" name="notes">${esc(client?.notes || '')}</textarea></div>
      </form>`, `<button class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn btn-primary" id="saveClient">Salvar cliente</button>`);
    $('#saveClient').onclick = () => {
      const form = $('#clientForm');
      if (!form.reportValidity()) return;
      const values = Object.fromEntries(new FormData(form));
      if (client) Object.assign(client, values, { updatedAt: nowIso() });
      else data.clients.push({ ...values, id: uid(), createdAt: nowIso() });
      activity(`${client ? 'Cliente atualizado' : 'Cliente cadastrado'}: ${values.name}`);
      saveData('Cliente salvo');
      closeModal();
      render();
    };
  }

  function openProductModal(id = null) {
    const product = id ? data.products.find(p => p.id === id) : null;
    modal(product ? 'Editar produto ou serviço' : 'Novo produto ou serviço', `
      <form id="productForm" class="form-grid">
        <input type="hidden" name="id" value="${esc(product?.id || '')}">
        <div class="field full"><label>Nome</label><input class="input" name="name" value="${esc(product?.name || '')}" required></div>
        <div class="field full"><label>Descrição</label><input class="input" name="description" value="${esc(product?.description || '')}"></div>
        ${field('unit', 'Unidade', product?.unit || 'un.')}
        ${field('price', 'Preço de venda (R$)', product?.price || '', 'number', true)}
        ${field('cost', 'Custo interno (R$)', product?.cost || '', 'number')}
      </form>`, `<button class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn btn-primary" id="saveProduct">Salvar item</button>`);
    $('#saveProduct').onclick = () => {
      const form = $('#productForm');
      if (!form.reportValidity()) return;
      const values = Object.fromEntries(new FormData(form));
      values.price = num(values.price);
      values.cost = num(values.cost);
      if (product) Object.assign(product, values, { updatedAt: nowIso() });
      else data.products.push({ ...values, id: uid(), active: true, createdAt: nowIso() });
      activity(`${product ? 'Item atualizado' : 'Item cadastrado'}: ${values.name}`);
      saveData('Produto ou serviço salvo');
      closeModal();
      render();
    };
  }

