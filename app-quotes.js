'use strict';
  function openQuoteModal(id = null, preselectedClientId = '') {
    const quote = id ? data.quotes.find(q => q.id === id) : null;
    const draft = quote ? JSON.parse(JSON.stringify(quote)) : {
      id: '', number: nextQuoteNumber(), clientId: preselectedClientId, createdAt: nowIso(), validUntil: addDays(data.settings.defaultValidity || 7), status: 'draft', entryPercent: data.settings.defaultEntry ?? 50, discount: 0, notes: '', items: []
    };
    if (!draft.items.length) draft.items.push(blankItem());

    modal(quote ? `Editar ${esc(quote.number)}` : 'Novo orçamento', `
      <form id="quoteForm" class="quote-builder">
        <div class="quote-main">
          <div class="form-grid">
            <div class="field"><label>Cliente</label><div class="inline-field"><select id="quoteClient" class="select" required><option value="">Selecione...</option>${data.clients.map(client => `<option value="${client.id}" ${draft.clientId === client.id ? 'selected' : ''}>${esc(client.name)}</option>`).join('')}</select><button class="btn btn-ghost" type="button" id="inlineNewClient">+</button></div></div>
            <div class="field"><label>Validade</label><input id="quoteValidity" class="input" type="date" value="${esc(draft.validUntil)}" required></div>
            <div class="field"><label>Status</label><select id="quoteStatus" class="select">${Object.entries(quoteStatuses).map(([value, [label]]) => `<option value="${value}" ${draft.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
            <div class="field"><label>Entrada (%)</label><input id="quoteEntry" class="input" type="number" min="0" max="100" step="1" value="${draft.entryPercent}"></div>
          </div>

          <div class="section-title"><div><h2>Itens</h2><p>Escolha um cadastro ou digite manualmente.</p></div><button id="addQuoteItem" class="btn btn-ghost btn-sm" type="button">+ Adicionar item</button></div>
          <div id="quoteItems" class="quote-items"></div>

          <div class="form-grid" style="margin-top:17px">
            <div class="field"><label>Desconto (R$)</label><input id="quoteDiscount" class="input" type="number" min="0" step="0.01" value="${draft.discount || 0}"></div>
            <div class="field"><label>Número</label><input class="input" value="${esc(draft.number)}" disabled></div>
            <div class="field full"><label>Observações e condições</label><textarea id="quoteNotes" class="textarea" placeholder="Prazo de produção, condições, detalhes...">${esc(draft.notes || '')}</textarea></div>
          </div>
        </div>

        <aside class="quote-summary">
          <div class="summary-box">
            <strong>Resumo financeiro</strong>
            <div class="summary-line"><span>Subtotal</span><strong id="sumSubtotal">R$ 0,00</strong></div>
            <div class="summary-line"><span>Desconto</span><strong id="sumDiscount">R$ 0,00</strong></div>
            <div class="summary-line total"><span>Total</span><strong id="sumTotal">R$ 0,00</strong></div>
            <div class="summary-line entry"><span>Entrada</span><strong id="sumEntry">R$ 0,00</strong></div>
            <div class="summary-line"><span>Saldo</span><strong id="sumBalance">R$ 0,00</strong></div>
            <div class="summary-line"><span>Lucro estimado</span><strong id="sumProfit">R$ 0,00</strong></div>
          </div>
          <div class="notice" style="margin-top:12px">Depois de salvar, gere o PDF ou envie a mensagem pronta pelo WhatsApp.</div>
        </aside>
      </form>`, `<button class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn btn-ghost" id="saveAndPdf">Salvar e gerar PDF</button><button class="btn btn-primary" id="saveQuote">Salvar orçamento</button>`, true);

    function blankItem() { return { id: uid(), productId: '', name: '', description: '', qty: 1, unit: 'un.', price: 0, cost: 0 }; }
    function renderItems() {
      $('#quoteItems').innerHTML = draft.items.map((item, index) => `<div class="quote-item" data-index="${index}">
        <div class="field"><label>Produto/serviço</label><select class="select item-product"><option value="">Digitar manualmente</option>${data.products.map(product => `<option value="${product.id}" ${item.productId === product.id ? 'selected' : ''}>${esc(product.name)}</option>`).join('')}</select><input class="input item-name" style="margin-top:7px" value="${esc(item.name)}" placeholder="Descrição do item" required></div>
        <div class="field"><label>Qtd.</label><input class="input item-qty" type="number" min="0.01" step="0.01" value="${item.qty}"></div>
        <div class="field"><label>Valor unit.</label><input class="input item-price" type="number" min="0" step="0.01" value="${item.price}"></div>
        <div class="field"><label>Total</label><input class="input item-total" value="${money(num(item.qty) * num(item.price))}" disabled></div>
        <button type="button" class="remove-item" title="Remover">×</button>
      </div>`).join('');

      $$('.quote-item').forEach(row => {
        const index = Number(row.dataset.index);
        $('.item-product', row).onchange = event => {
          const product = data.products.find(p => p.id === event.target.value);
          draft.items[index].productId = event.target.value;
          if (product) Object.assign(draft.items[index], { name: product.name, description: product.description, unit: product.unit, price: product.price, cost: product.cost });
          renderItems();
          updateSummary();
        };
        $('.item-name', row).oninput = event => { draft.items[index].name = event.target.value; };
        $('.item-qty', row).oninput = event => { draft.items[index].qty = num(event.target.value); $('.item-total', row).value = money(draft.items[index].qty * draft.items[index].price); updateSummary(); };
        $('.item-price', row).oninput = event => { draft.items[index].price = num(event.target.value); $('.item-total', row).value = money(draft.items[index].qty * draft.items[index].price); updateSummary(); };
        $('.remove-item', row).onclick = () => { if (draft.items.length === 1) return toast('O orçamento precisa de pelo menos um item.', 'error'); draft.items.splice(index, 1); renderItems(); updateSummary(); };
      });
    }

    function updateSummary() {
      draft.discount = num($('#quoteDiscount')?.value ?? draft.discount);
      draft.entryPercent = num($('#quoteEntry')?.value ?? draft.entryPercent);
      const totals = quoteTotals(draft);
      $('#sumSubtotal').textContent = money(totals.subtotal);
      $('#sumDiscount').textContent = money(totals.discount);
      $('#sumTotal').textContent = money(totals.total);
      $('#sumEntry').textContent = money(totals.entry);
      $('#sumBalance').textContent = money(totals.balance);
      $('#sumProfit').textContent = money(totals.profit);
    }

    function collectQuote() {
      const form = $('#quoteForm');
      if (!form.reportValidity()) return null;
      const clientId = $('#quoteClient').value;
      if (!clientId) { toast('Selecione um cliente.', 'error'); return null; }
      if (draft.items.some(item => !item.name.trim() || num(item.qty) <= 0)) { toast('Preencha todos os itens corretamente.', 'error'); return null; }
      return {
        ...draft,
        clientId,
        clientName: data.clients.find(c => c.id === clientId)?.name || '',
        validUntil: $('#quoteValidity').value,
        status: $('#quoteStatus').value,
        entryPercent: num($('#quoteEntry').value),
        discount: num($('#quoteDiscount').value),
        notes: $('#quoteNotes').value.trim(),
        updatedAt: nowIso()
      };
    }

    function saveQuote(generatePdf = false) {
      const values = collectQuote();
      if (!values) return;
      if (quote) Object.assign(quote, values);
      else data.quotes.push({ ...values, id: uid(), createdAt: nowIso() });
      const saved = quote || data.quotes[data.quotes.length - 1];
      activity(`${quote ? 'Orçamento atualizado' : 'Orçamento criado'}: ${saved.number}`);
      if (saved.status === 'approved') createOrderFromQuote(saved, false);
      saveData('Orçamento salvo');
      closeModal();
      render();
      if (generatePdf) generateQuotePDF(saved.id);
    }

    renderItems();
    updateSummary();
    $('#addQuoteItem').onclick = () => { draft.items.push(blankItem()); renderItems(); updateSummary(); };
    $('#quoteDiscount').oninput = updateSummary;
    $('#quoteEntry').oninput = updateSummary;
    $('#saveQuote').onclick = () => saveQuote(false);
    $('#saveAndPdf').onclick = () => saveQuote(true);
    $('#inlineNewClient').onclick = () => {
      const tempName = prompt('Nome do novo cliente:');
      if (!tempName?.trim()) return;
      const newClient = { id: uid(), name: tempName.trim(), phone: '', email: '', document: '', address: '', notes: '', createdAt: nowIso() };
      data.clients.push(newClient);
      draft.clientId = newClient.id;
      saveData('Cliente rápido cadastrado');
      closeModal();
      openQuoteModal(quote?.id || null, newClient.id);
    };
  }

  function openQuoteActions(id) {
    const quote = data.quotes.find(q => q.id === id);
    if (!quote) return;
    modal(`Ações — ${esc(quote.number)}`, `<div class="stack">
      <button class="btn btn-primary" id="actionWhatsapp">Enviar pelo WhatsApp</button>
      <button class="btn btn-ghost" id="actionPdf">Gerar PDF</button>
      <button class="btn btn-ghost" id="actionApprove">Marcar como aprovado e criar pedido</button>
      <button class="btn btn-ghost" id="actionDuplicate">Duplicar orçamento</button>
      <button class="btn btn-danger" id="actionDelete">Excluir orçamento</button>
    </div>`);
    $('#actionWhatsapp').onclick = () => { closeModal(); sendQuoteWhatsApp(id); };
    $('#actionPdf').onclick = () => { closeModal(); generateQuotePDF(id); };
    $('#actionApprove').onclick = () => { quote.status = 'approved'; quote.updatedAt = nowIso(); createOrderFromQuote(quote, true); closeModal(); render(); };
    $('#actionDuplicate').onclick = () => {
      const copy = JSON.parse(JSON.stringify(quote));
      copy.id = uid(); copy.number = nextQuoteNumber(); copy.status = 'draft'; copy.createdAt = nowIso(); copy.updatedAt = nowIso();
      data.quotes.push(copy); activity(`Orçamento duplicado: ${copy.number}`); saveData('Orçamento duplicado'); closeModal(); render();
    };
    $('#actionDelete').onclick = () => {
      if (!confirm(`Excluir o orçamento ${quote.number}?`)) return;
      data.quotes = data.quotes.filter(q => q.id !== id);
      data.orders = data.orders.filter(o => o.quoteId !== id);
      activity(`Orçamento excluído: ${quote.number}`); saveData('Orçamento excluído'); closeModal(); render();
    };
  }

  function createOrderFromQuote(quote, notify = true) {
    const existing = data.orders.find(order => order.quoteId === quote.id);
    if (existing) {
      if (notify) toast('Este orçamento já possui um pedido.');
      saveData();
      return existing;
    }
    const totals = quoteTotals(quote);
    const order = {
      id: uid(), quoteId: quote.id, clientId: quote.clientId, clientName: quote.clientName,
      number: `PED-${String(data.orders.length + 1).padStart(3, '0')}`, status: 'waiting', total: totals.total, createdAt: nowIso()
    };
    data.orders.push(order);
    activity(`Pedido criado: ${order.number} a partir de ${quote.number}`);
    saveData(notify ? 'Orçamento aprovado e pedido criado' : undefined);
    return order;
  }

  function updateOrderStatus(id, status) {
    const order = data.orders.find(o => o.id === id);
    if (!order) return;
    order.status = status;
    order.updatedAt = nowIso();
    activity(`${order.number} alterado para ${orderStatuses[status][0]}`);
    saveData('Status do pedido atualizado');
    render();
  }

  function deleteOrder(id) {
    const order = data.orders.find(o => o.id === id);
    if (!order || !confirm(`Excluir o pedido ${order.number}?`)) return;
    data.orders = data.orders.filter(o => o.id !== id);
    activity(`Pedido excluído: ${order.number}`);
    saveData('Pedido excluído');
    render();
  }

  function deleteClient(id) {
    const client = data.clients.find(c => c.id === id);
    if (!client) return;
    if (data.quotes.some(q => q.clientId === id)) return toast('Este cliente possui orçamentos. Edite-o em vez de excluir.', 'error');
    if (!confirm(`Excluir o cliente ${client.name}?`)) return;
    data.clients = data.clients.filter(c => c.id !== id);
    activity(`Cliente excluído: ${client.name}`);
    saveData('Cliente excluído');
    render();
  }

  function deleteProduct(id) {
    const product = data.products.find(p => p.id === id);
    if (!product || !confirm(`Excluir ${product.name}? Os orçamentos antigos não serão alterados.`)) return;
    data.products = data.products.filter(p => p.id !== id);
    activity(`Item excluído: ${product.name}`);
    saveData('Produto ou serviço excluído');
    render();
  }

  function quoteMessage(quote) {
    const client = data.clients.find(c => c.id === quote.clientId);
    const totals = quoteTotals(quote);
    const business = data.settings.businessName || 'Nossa empresa';
    return `Olá, ${client?.name || quote.clientName || ''}! 👋\n\nSegue o orçamento *${quote.number}* da *${business}*.\n\n${quote.items.map(item => `• ${item.qty}x ${item.name}: ${money(num(item.qty) * num(item.price))}`).join('\n')}\n\n*Total: ${money(totals.total)}*\n*Entrada (${quote.entryPercent}%): ${money(totals.entry)}*\nSaldo: ${money(totals.balance)}\nValidade: ${dateBR(quote.validUntil)}${data.settings.pixKey ? `\n\nPix: ${data.settings.pixKey}` : ''}${quote.notes ? `\n\nObservações: ${quote.notes}` : ''}\n\n${data.settings.footer || 'Obrigado pela preferência!'}`;
  }

  function sendQuoteWhatsApp(id) {
    const quote = data.quotes.find(q => q.id === id);
    if (!quote) return;
    const client = data.clients.find(c => c.id === quote.clientId);
    const phone = normalizePhone(client?.phone || '');
    quote.status = quote.status === 'draft' ? 'sent' : quote.status;
    quote.updatedAt = nowIso();
    activity(`Orçamento enviado pelo WhatsApp: ${quote.number}`);
    saveData();
    render();
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(quoteMessage(quote))}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    if (!phone) toast('O cliente não possui telefone; o WhatsApp abrirá sem destinatário.', 'error');
  }

