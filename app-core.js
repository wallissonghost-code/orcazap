  'use strict';

  const STORAGE_KEY = 'orcazap:data:v1';
  const UNLOCK_KEY = 'orcazap:unlocked';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const nowIso = () => new Date().toISOString();
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const addDays = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const onlyDigits = (value = '') => String(value).replace(/\D/g, '');
  const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || '?';
  const money = (value = 0) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (value) => Number(String(value ?? '').replace(',', '.')) || 0;
  const dateBR = (value) => {
    if (!value) return '—';
    const source = value.length === 10 ? `${value}T12:00:00` : value;
    return new Date(source).toLocaleDateString('pt-BR');
  };
  const dateTimeBR = (value) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const normalizePhone = (phone) => {
    let digits = onlyDigits(phone);
    if (!digits) return '';
    if (digits.length <= 11) digits = `55${digits}`;
    return digits;
  };

  const quoteStatuses = {
    draft: ['Rascunho', 'badge-draft'],
    sent: ['Enviado', 'badge-sent'],
    approved: ['Aprovado', 'badge-approved'],
    rejected: ['Recusado', 'badge-rejected'],
    expired: ['Vencido', 'badge-expired']
  };

  const orderStatuses = {
    waiting: ['Aguardando', 'badge-sent'],
    production: ['Em produção', 'badge-production'],
    ready: ['Pronto', 'badge-ready'],
    done: ['Concluído', 'badge-done']
  };

  const pageMeta = {
    dashboard: ['Visão geral', 'Acompanhe vendas, cobranças e pedidos.'],
    quotes: ['Orçamentos', 'Crie, envie e acompanhe propostas comerciais.'],
    orders: ['Pedidos', 'Controle sua produção do pagamento à entrega.'],
    clients: ['Clientes', 'Organize contatos e histórico de atendimento.'],
    products: ['Produtos e serviços', 'Monte sua tabela de preços e custos.'],
    settings: ['Configurações', 'Personalize sua empresa, Pix e segurança.']
  };

  const defaultData = () => ({
    version: 1,
    settings: {
      businessName: 'Minha Empresa',
      document: '',
      phone: '',
      whatsapp: '',
      email: '',
      address: '',
      city: 'Ipatinga',
      pixKey: '',
      pixName: 'MINHA EMPRESA',
      pixCity: 'IPATINGA',
      defaultEntry: 50,
      defaultValidity: 7,
      quotePrefix: 'ORC',
      logo: '',
      pin: '',
      footer: 'Obrigado pela preferência!'
    },
    clients: [
      { id: uid(), name: 'Cliente demonstração', phone: '(31) 99999-0000', email: '', document: '', address: '', notes: 'Você pode excluir este cadastro.', createdAt: nowIso() }
    ],
    products: [
      { id: uid(), name: 'Arte para rede social', description: 'Criação de arte personalizada', unit: 'un.', price: 45, cost: 10, active: true, createdAt: nowIso() },
      { id: uid(), name: 'Banner 90 × 60 cm', description: 'Impressão colorida em lona', unit: 'un.', price: 120, cost: 65, active: true, createdAt: nowIso() }
    ],
    quotes: [],
    orders: [],
    activities: [{ id: uid(), text: 'OrçaZap configurado neste navegador', createdAt: nowIso() }]
  });

  let data = loadData();
  let currentView = 'dashboard';
  let settingsTab = 'business';
  let filters = { quotes: '', quoteStatus: 'all', clients: '', products: '' };

  function loadData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.settings && Array.isArray(saved.clients)) return saved;
    } catch (error) {
      console.warn('Falha ao carregar dados:', error);
    }
    const fresh = defaultData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    return fresh;
  }

  function saveData(message) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (message) toast(message);
    updateBrand();
  }

  function activity(text) {
    data.activities.unshift({ id: uid(), text, createdAt: nowIso() });
    data.activities = data.activities.slice(0, 40);
  }

  function toast(message, type = 'success') {
    const el = $('#toast');
    el.textContent = message;
    el.className = `toast show${type === 'error' ? ' error' : ''}`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.className = 'toast', 2800);
  }

  function updateBrand() {
    $('#companyMini').textContent = data.settings.businessName || 'Seu negócio';
  }

  function setView(view) {
    currentView = view;
    $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view));
    const [title, subtitle] = pageMeta[view] || pageMeta.dashboard;
    $('#pageTitle').textContent = title;
    $('#pageSubtitle').textContent = subtitle;
    closeSidebar();
    render();
  }

  function render() {
    const content = $('#content');
    const renderers = {
      dashboard: renderDashboard,
      quotes: renderQuotes,
      orders: renderOrders,
      clients: renderClients,
      products: renderProducts,
      settings: renderSettings
    };
    content.innerHTML = (renderers[currentView] || renderDashboard)();
    bindViewEvents();
  }

  function quoteTotals(quote) {
    const subtotal = (quote.items || []).reduce((sum, item) => sum + num(item.qty) * num(item.price), 0);
    const discount = num(quote.discount);
    const total = Math.max(0, subtotal - discount);
    const entry = total * (num(quote.entryPercent) / 100);
    const balance = total - entry;
    const cost = (quote.items || []).reduce((sum, item) => sum + num(item.qty) * num(item.cost), 0);
    return { subtotal, discount, total, entry, balance, cost, profit: total - cost };
  }

  function nextQuoteNumber() {
    const year = new Date().getFullYear();
    const prefix = (data.settings.quotePrefix || 'ORC').toUpperCase();
    const max = data.quotes.reduce((acc, quote) => {
      const match = String(quote.number || '').match(/(\d+)$/);
      return Math.max(acc, match ? Number(match[1]) : 0);
    }, 0);
    return `${prefix}-${year}-${String(max + 1).padStart(3, '0')}`;
  }

  function statusBadge(status, type = 'quote') {
    const source = type === 'order' ? orderStatuses : quoteStatuses;
    const [label, className] = source[status] || ['Indefinido', 'badge-draft'];
    return `<span class="badge ${className}">${label}</span>`;
  }

  function renderDashboard() {
    const approvedQuotes = data.quotes.filter(q => q.status === 'approved');
    const sentQuotes = data.quotes.filter(q => q.status === 'sent');
    const approvedRevenue = approvedQuotes.reduce((sum, q) => sum + quoteTotals(q).total, 0);
    const pendingRevenue = sentQuotes.reduce((sum, q) => sum + quoteTotals(q).total, 0);
    const activeOrders = data.orders.filter(o => o.status !== 'done');
    const considered = data.quotes.filter(q => ['sent', 'approved', 'rejected'].includes(q.status));
    const conversion = considered.length ? Math.round(approvedQuotes.length / considered.length * 100) : 0;

    const productMap = {};
    data.quotes.forEach(q => (q.items || []).forEach(item => {
      const key = item.name || 'Item';
      productMap[key] = (productMap[key] || 0) + num(item.qty) * num(item.price);
    }));
    const topProducts = Object.entries(productMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxProduct = topProducts[0]?.[1] || 1;
    const recentQuotes = [...data.quotes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

    return `
      <div class="grid stats-grid">
        ${statCard('Faturamento aprovado', money(approvedRevenue), `${approvedQuotes.length} orçamento(s)`, 'R$', '')}
        ${statCard('Aguardando resposta', money(pendingRevenue), `${sentQuotes.length} proposta(s) enviada(s)`, '↗', 'blue')}
        ${statCard('Pedidos ativos', String(activeOrders.length), `${data.orders.length} no histórico`, '▣', 'orange')}
        ${statCard('Conversão', `${conversion}%`, 'Enviados que viraram venda', '◎', 'red')}
      </div>

      ${data.settings.businessName === 'Minha Empresa' ? `
        <div class="notice warning" style="margin-top:18px">
          <strong>Primeiro passo:</strong> abra Configurações e coloque o nome, WhatsApp, Pix e logo do negócio. Os clientes verão esses dados no PDF.
        </div>` : ''}

      <div class="grid two-col" style="margin-top:18px">
        <section class="card">
          <div class="card-header">
            <div><h2>Orçamentos recentes</h2><p>Últimas propostas criadas no sistema.</p></div>
            <button class="btn btn-ghost btn-sm" data-go="quotes">Ver todos</button>
          </div>
          ${recentQuotes.length ? `
            <div class="table-wrap"><table>
              <thead><tr><th>Número</th><th>Cliente</th><th>Status</th><th>Total</th><th></th></tr></thead>
              <tbody>${recentQuotes.map(q => {
                const client = data.clients.find(c => c.id === q.clientId);
                return `<tr>
                  <td><strong>${esc(q.number)}</strong><small style="display:block;color:var(--muted);margin-top:3px">${dateBR(q.createdAt)}</small></td>
                  <td>${esc(client?.name || q.clientName || 'Cliente removido')}</td>
                  <td>${statusBadge(q.status)}</td>
                  <td><strong>${money(quoteTotals(q).total)}</strong></td>
                  <td><button class="btn btn-ghost btn-sm" data-edit-quote="${q.id}">Abrir</button></td>
                </tr>`;
              }).join('')}</tbody>
            </table></div>` : emptyState('▤', 'Nenhum orçamento ainda', 'Crie sua primeira proposta e envie pelo WhatsApp.', '+ Novo orçamento', 'new-quote')}
        </section>

        <section class="card">
          <div class="card-header"><div><h2>Atividade recente</h2><p>Movimentações salvas neste dispositivo.</p></div></div>
          <div class="timeline">
            ${data.activities.slice(0, 7).map(item => `<div class="timeline-item"><span class="timeline-dot"></span><div><strong>${esc(item.text)}</strong><span>${dateTimeBR(item.createdAt)}</span></div></div>`).join('') || '<p style="color:var(--muted);font-size:12px">Sem atividade registrada.</p>'}
          </div>
        </section>
      </div>

      <div class="grid two-col" style="margin-top:18px">
        <section class="card">
          <div class="card-header"><div><h2>Produtos com maior valor orçado</h2><p>Soma dos itens incluídos nas propostas.</p></div></div>
          ${topProducts.length ? `<div class="progress-list">${topProducts.map(([name, value]) => `<div class="progress-row"><strong title="${esc(name)}">${esc(name)}</strong><div class="progress"><span style="width:${Math.max(5, value / maxProduct * 100)}%"></span></div><span>${money(value)}</span></div>`).join('')}</div>` : emptyState('◇', 'Ainda sem dados', 'Os produtos aparecerão aqui depois que forem usados em orçamentos.')}
        </section>
        <section class="card card-pad">
          <h2 style="margin:0 0 8px;font-size:16px">Venda mais rápido</h2>
          <p style="margin:0;color:var(--muted);font-size:12px;line-height:1.6">Cadastre seus serviços uma vez, gere a proposta em poucos cliques e cobre a entrada pelo Pix. O PDF e a mensagem do WhatsApp saem com o valor calculado.</p>
          <div style="display:grid;gap:9px;margin-top:17px">
            <button class="btn btn-primary" data-action="new-quote">Criar orçamento</button>
            <button class="btn btn-ghost" data-go="products">Cadastrar tabela de preços</button>
          </div>
        </section>
      </div>`;
  }

  function statCard(label, value, caption, icon, tone) {
    return `<section class="card stat-card"><div class="stat-copy"><span>${label}</span><strong>${value}</strong><small>${caption}</small></div><div class="stat-icon ${tone}">${icon}</div></section>`;
  }

