'use strict';

(function installWhatsAppModule() {
  const originalRender = render;
  const originalBindViewEvents = bindViewEvents;
  const originalRenderDashboard = renderDashboard;

  pageMeta.whatsapp = ['Atendimento WhatsApp', 'Configure o assistente, teste conversas e prepare a integração oficial.'];

  function emptyFlow() {
    return { mode: 'idle', stage: null, draft: {} };
  }

  function ensureWhatsAppData() {
    if (!data.whatsapp || typeof data.whatsapp !== 'object') {
      data.whatsapp = {
        botName: 'Assistente OrçaZap',
        greeting: 'Olá! Sou o assistente virtual. Posso ajudar com orçamento, pagamento via Pix ou atendimento humano.',
        autoPix: true,
        history: [],
        leads: [],
        flow: emptyFlow()
      };
    }
    if (!Array.isArray(data.whatsapp.history)) data.whatsapp.history = [];
    if (!Array.isArray(data.whatsapp.leads)) data.whatsapp.leads = [];
    if (!data.whatsapp.flow || typeof data.whatsapp.flow !== 'object') data.whatsapp.flow = emptyFlow();
    if (!data.whatsapp.flow.draft || typeof data.whatsapp.flow.draft !== 'object') data.whatsapp.flow.draft = {};
    if (!data.whatsapp.history.length) {
      data.whatsapp.history.push({ id: uid(), role: 'bot', text: data.whatsapp.greeting, createdAt: nowIso() });
    }
  }

  function normalizeMessage(value) {
    return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function resetFlow() {
    ensureWhatsAppData();
    data.whatsapp.flow = emptyFlow();
  }

  function startQuoteFlow() {
    ensureWhatsAppData();
    data.whatsapp.flow = { mode: 'quote', stage: 'name', draft: {} };
    return 'Perfeito! Vamos montar sua solicitação passo a passo.\n\nQual é o seu nome ou o nome da empresa?';
  }

  function quoteSummary(draft) {
    return `Confira os dados do seu pré-orçamento:\n\n• Nome: ${draft.name}\n• Serviço: ${draft.service}\n• Localização: ${draft.location}\n• Medidas ou quantidade: ${draft.quantity}\n• Prazo desejado: ${draft.deadline}\n\nDigite “confirmar” para enviar ou “corrigir” para preencher novamente.`;
  }

  function findOrCreateClient(draft, createdAt) {
    const normalizedName = normalizeMessage(draft.name);
    let client = data.clients.find(item => normalizeMessage(item.name) === normalizedName);

    if (!client) {
      client = {
        id: uid(),
        name: draft.name,
        phone: '',
        email: '',
        document: '',
        address: draft.location,
        notes: 'Cadastro criado automaticamente pelo atendimento WhatsApp.',
        createdAt
      };
      data.clients.push(client);
    } else {
      if (!client.address && draft.location) client.address = draft.location;
      client.updatedAt = createdAt;
    }

    return client;
  }

  function createQuoteFromLead(draft) {
    const createdAt = nowIso();
    const client = findOrCreateClient(draft, createdAt);
    const quote = {
      id: uid(),
      number: nextQuoteNumber(),
      clientId: client.id,
      clientName: client.name,
      createdAt,
      updatedAt: createdAt,
      validUntil: addDays(data.settings.defaultValidity || 7),
      status: 'draft',
      entryPercent: data.settings.defaultEntry ?? 50,
      discount: 0,
      notes: [
        'Solicitação recebida pelo atendimento WhatsApp.',
        `Serviço solicitado: ${draft.service}`,
        `Localização: ${draft.location}`,
        `Medidas ou quantidade: ${draft.quantity}`,
        `Prazo desejado: ${draft.deadline}`
      ].join('\n'),
      items: [{
        id: uid(),
        productId: '',
        name: draft.service,
        description: `${draft.quantity} — ${draft.location}`,
        qty: 1,
        unit: 'un.',
        price: 0,
        cost: 0
      }],
      source: 'whatsapp'
    };

    const lead = {
      id: uid(),
      ...draft,
      status: 'new',
      clientId: client.id,
      quoteId: quote.id,
      createdAt
    };

    quote.sourceLeadId = lead.id;
    data.quotes.push(quote);
    data.whatsapp.leads.unshift(lead);
    data.whatsapp.leads = data.whatsapp.leads.slice(0, 100);
    activity(`Pré-orçamento ${quote.number} criado pelo WhatsApp para ${client.name}`);
    return { lead, client, quote };
  }

  function continueQuoteFlow(message) {
    const flow = data.whatsapp.flow;
    const clean = String(message || '').trim();
    const text = normalizeMessage(clean);

    if (/\b(cancelar|cancela|parar|sair)\b/.test(text)) {
      resetFlow();
      return 'Solicitação cancelada. Digite “orçamento”, “Pix” ou “atendente” quando precisar.';
    }

    if (flow.stage === 'name') {
      if (clean.length < 2) return 'Não consegui identificar o nome. Pode digitar seu nome ou o nome da empresa?';
      flow.draft.name = clean;
      flow.stage = 'service';
      const firstName = clean.split(/\s+/)[0];
      return `Prazer, ${firstName}! Qual produto ou serviço você deseja solicitar?`;
    }

    if (flow.stage === 'service') {
      if (clean.length < 3) return 'Pode descrever um pouco melhor o produto ou serviço desejado?';
      flow.draft.service = clean;
      flow.stage = 'location';
      return 'Certo. Em qual cidade, bairro ou endereço o serviço será realizado ou entregue?';
    }

    if (flow.stage === 'location') {
      if (clean.length < 2) return 'Informe pelo menos a cidade ou o bairro, por favor.';
      flow.draft.location = clean;
      flow.stage = 'quantity';
      return 'Agora informe as medidas, a quantidade ou uma descrição do tamanho do serviço.';
    }

    if (flow.stage === 'quantity') {
      if (clean.length < 1) return 'Informe as medidas ou a quantidade necessária, por favor.';
      flow.draft.quantity = clean;
      flow.stage = 'deadline';
      return 'Qual é o prazo desejado? Por exemplo: “até sexta”, “7 dias” ou “sem urgência”.';
    }

    if (flow.stage === 'deadline') {
      if (clean.length < 2) return 'Informe o prazo desejado ou escreva “sem urgência”.';
      flow.draft.deadline = clean;
      flow.stage = 'confirm';
      return quoteSummary(flow.draft);
    }

    if (flow.stage === 'confirm') {
      if (/\b(confirmar|confirmo|confirmado|sim|certo|ok|enviar|pode enviar)\b/.test(text)) {
        const { lead, quote } = createQuoteFromLead(flow.draft);
        resetFlow();
        saveData();
        return `Pronto, ${lead.name}! Sua solicitação foi registrada e o pré-orçamento ${quote.number} já foi criado para análise.\n\nA equipe só precisa abrir o orçamento, informar o preço e enviar o PDF. Depois da aprovação, os dados do Pix também poderão ser enviados.`;
      }
      if (/\b(corrigir|editar|alterar|nao|não|recomecar|reiniciar)\b/.test(text)) {
        data.whatsapp.flow = { mode: 'quote', stage: 'name', draft: {} };
        return 'Sem problema. Vamos preencher novamente. Qual é o seu nome ou o nome da empresa?';
      }
      return 'Digite “confirmar” para enviar os dados ou “corrigir” para preencher novamente.';
    }

    resetFlow();
    return startQuoteFlow();
  }

  function botReply(message) {
    ensureWhatsAppData();
    const text = normalizeMessage(message);
    const business = data.settings.businessName || 'nossa empresa';

    if (/\b(menu|inicio|início|comecar|começar|reiniciar)\b/.test(text)) {
      resetFlow();
      return `Olá! Você está falando com ${business}.\n\nPosso ajudar com:\n1. Solicitar orçamento\n2. Pagamento via Pix\n3. Falar com um atendente`;
    }
    if (data.whatsapp.flow.mode === 'quote') return continueQuoteFlow(message);
    if (/\b(oi|ola|olá|bom dia|boa tarde|boa noite)\b/.test(text)) {
      return `Olá! Você está falando com ${business}.\n\nPosso ajudar com:\n1. Solicitar orçamento\n2. Pagamento via Pix\n3. Falar com um atendente`;
    }
    if (/^(1)$/.test(text) || /\b(orcamento|orçamento|orcamentos|orçamentos|preco|preço|valor|quanto custa|cotacao|cotação)\b/.test(text)) return startQuoteFlow();
    if (/^(2)$/.test(text) || /\b(pix|pagar|pagamento|entrada|qr code|qrcode)\b/.test(text)) {
      if (!data.settings.pixKey) return 'O Pix ainda não foi configurado. Vou chamar um atendente para concluir o pagamento.';
      return `Pagamento via Pix\nChave: ${data.settings.pixKey}\nFavorecido: ${data.settings.pixName || data.settings.businessName || 'Empresa'}\n\nO QR Code pode ser enviado automaticamente após a aprovação do orçamento.`;
    }
    if (/^(3)$/.test(text) || /\b(atendente|humano|pessoa|falar com alguem|falar com alguém|suporte)\b/.test(text)) {
      return 'Certo. Registrei seu pedido de atendimento humano. Assim que possível, alguém da equipe continuará a conversa por aqui.';
    }
    if (/\b(aprovado|aprovar|aceito|fechado|pode fazer)\b/.test(text)) {
      return 'Ótimo! Vou registrar a aprovação e preparar as informações de pagamento da entrada via Pix.';
    }
    return 'Entendi. Posso iniciar um orçamento, enviar os dados do Pix ou encaminhar você para um atendente. Digite “orçamento”, “Pix” ou “atendente”.';
  }

  function renderHistory() {
    ensureWhatsAppData();
    return data.whatsapp.history.slice(-30).map(item => `
      <div class="wa-message ${item.role === 'user' ? 'wa-user' : 'wa-bot'}">
        <div>${esc(item.text).replace(/\n/g, '<br>')}</div>
        <small>${dateTimeBR(item.createdAt)}</small>
      </div>`).join('');
  }

  function renderLeadList() {
    ensureWhatsAppData();
    const leads = data.whatsapp.leads.slice(0, 4);
    if (!leads.length) return '<div class="notice">As solicitações confirmadas aparecerão aqui e também no painel inicial.</div>';
    return `<div class="stack" style="padding:0 18px 18px">${leads.map(lead => {
      const quote = data.quotes.find(item => item.id === lead.quoteId);
      return `<div style="border:1px solid var(--border);border-radius:12px;padding:12px;display:grid;gap:5px">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><strong style="font-size:12px">${esc(lead.name)}</strong><span class="badge ${lead.status === 'new' ? 'badge-sent' : 'badge-draft'}">${lead.status === 'new' ? 'Nova' : 'Vista'}</span></div>
        <span style="font-size:10px;color:var(--muted)">${esc(lead.service)} · ${esc(lead.quantity)}</span>
        ${quote ? `<button class="btn btn-ghost btn-sm" data-wa-open-lead="${lead.id}">Abrir ${esc(quote.number)}</button>` : ''}
      </div>`;
    }).join('')}</div>`;
  }

  function renderWhatsApp() {
    ensureWhatsAppData();
    const webhookUrl = `${location.origin}/api/whatsapp-webhook`;
    const pixQuery = new URLSearchParams({ key: data.settings.pixKey || '', name: data.settings.pixName || data.settings.businessName || 'RECEBEDOR', city: data.settings.pixCity || data.settings.city || 'BRASIL' }).toString();

    return `
      <div class="wa-hero">
        <div><span class="wa-kicker">ORÇAZAP AUTOMAÇÃO</span><h2>Atendimento e vendas pelo WhatsApp</h2><p>Receba mensagens, qualifique o cliente, envie orçamento e cobre a entrada por Pix no mesmo fluxo.</p></div>
        <div id="waConnectionBadge" class="wa-status checking"><span></span> Verificando integração...</div>
      </div>
      <div class="wa-grid">
        <section class="card wa-panel wa-simulator">
          <div class="card-header"><div><h2>Simulador do assistente</h2><p>Teste o atendimento antes de conectar o número oficial.</p></div><button class="btn btn-ghost btn-sm" id="waClearChat">Limpar</button></div>
          <div id="waChat" class="wa-chat">${renderHistory()}</div>
          <div class="wa-quick"><button data-wa-prompt="Olá">Saudação</button><button data-wa-prompt="Quero um orçamento">Orçamento</button><button data-wa-prompt="Como pago no Pix?">Pix</button><button data-wa-prompt="Quero falar com atendente">Atendente</button></div>
          <form id="waSimulatorForm" class="wa-compose"><input id="waSimulatorInput" class="input" placeholder="Digite como se fosse o cliente..." autocomplete="off" required><button class="btn btn-primary" type="submit">Enviar</button></form>
        </section>
        <div class="wa-side-stack">
          <section class="card wa-panel">
            <div class="card-header"><div><h2>Conexão oficial</h2><p>Base pronta para a WhatsApp Cloud API.</p></div></div>
            <div class="wa-checklist" id="waChecklist"><div><span class="wa-dot pending"></span><strong>Token de acesso</strong><small>Aguardando configuração na Vercel</small></div><div><span class="wa-dot pending"></span><strong>ID do número</strong><small>Aguardando configuração na Vercel</small></div><div><span class="wa-dot pending"></span><strong>Token do webhook</strong><small>Aguardando configuração na Vercel</small></div><div><span class="wa-dot pending"></span><strong>Chave Pix do bot</strong><small>Aguardando configuração na Vercel</small></div></div>
            <label class="wa-label">URL do webhook</label><div class="wa-copy-row"><code id="waWebhookUrl">${esc(webhookUrl)}</code><button class="btn btn-ghost btn-sm" id="waCopyWebhook">Copiar</button></div><p class="wa-help">As credenciais ficam somente nas variáveis de ambiente da Vercel. Nenhum token secreto é salvo neste navegador.</p>
          </section>
          <section class="card wa-panel">
            <div class="card-header"><div><h2>Pix automático</h2><p>Chave e QR Code para enviar depois da aprovação.</p></div></div>
            ${data.settings.pixKey ? `<div class="wa-pix-preview"><img src="/api/pix-qr?${pixQuery}" alt="QR Code Pix" loading="lazy"><div><strong>${esc(data.settings.pixName || data.settings.businessName)}</strong><span>${esc(data.settings.pixKey)}</span><small>O valor será preenchido conforme a entrada do orçamento.</small></div></div>` : `<div class="notice warning"><strong>Pix não configurado.</strong> Abra Configurações → Pix e orçamento para cadastrar a chave.</div>`}
          </section>
          <section class="card wa-panel"><div class="card-header"><div><h2>Solicitações recebidas</h2><p>Clientes e pré-orçamentos criados automaticamente.</p></div></div>${renderLeadList()}</section>
        </div>
      </div>
      <section class="card wa-panel" style="margin-top:18px"><div class="card-header"><div><h2>Fluxo automatizado</h2><p>A confirmação já cria o cliente e o pré-orçamento para revisão.</p></div></div><div class="wa-flow"><article><b>1</b><strong>Recebe</strong><span>O cliente inicia a conversa pelo WhatsApp.</span></article><article><b>2</b><strong>Qualifica</strong><span>O bot coleta nome, serviço, localização, medidas e prazo.</span></article><article><b>3</b><strong>Cria</strong><span>Cliente e orçamento em rascunho entram automaticamente no OrçaZap.</span></article><article><b>4</b><strong>Fecha</strong><span>Você informa o preço, envia o PDF e depois cobra pelo Pix.</span></article></div></section>`;
  }

  function pendingLeads() {
    ensureWhatsAppData();
    return data.whatsapp.leads.filter(lead => lead.status === 'new' && lead.quoteId && data.quotes.some(quote => quote.id === lead.quoteId));
  }

  function renderDashboardLeadAlert() {
    const leads = pendingLeads();
    if (!leads.length) return '';
    const latest = leads[0];
    const quote = data.quotes.find(item => item.id === latest.quoteId);
    return `<div class="notice warning" style="margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap"><div><strong>${leads.length} nova(s) solicitação(ões) do WhatsApp.</strong><div style="margin-top:4px">${esc(latest.name)} pediu ${esc(latest.service)}. O pré-orçamento ${esc(quote?.number || '')} está aguardando preço.</div></div><button class="btn btn-primary btn-sm" data-wa-open-lead="${latest.id}">Abrir pré-orçamento</button></div>`;
  }

  function addChatMessage(role, text) {
    ensureWhatsAppData();
    data.whatsapp.history.push({ id: uid(), role, text, createdAt: nowIso() });
    data.whatsapp.history = data.whatsapp.history.slice(-60);
    saveData();
    const chat = $('#waChat');
    if (chat) { chat.innerHTML = renderHistory(); chat.scrollTop = chat.scrollHeight; }
  }

  function submitSimulator(text) {
    const clean = String(text || '').trim();
    if (!clean) return;
    addChatMessage('user', clean);
    const chat = $('#waChat');
    if (chat) chat.insertAdjacentHTML('beforeend', '<div class="wa-typing"><span></span><span></span><span></span></div>');
    setTimeout(() => addChatMessage('bot', botReply(clean)), 350);
  }

  async function loadWhatsAppStatus() {
    const badge = $('#waConnectionBadge');
    const checklist = $('#waChecklist');
    if (!badge || !checklist) return;
    try {
      const response = await fetch('/api/whatsapp-status', { cache: 'no-store' });
      const result = await response.json();
      const configured = result.configured || {};
      const items = [['accessToken', 'Token de acesso'], ['phoneNumberId', 'ID do número'], ['verifyToken', 'Token do webhook'], ['pixKey', 'Chave Pix do bot']];
      checklist.innerHTML = items.map(([key, label]) => `<div><span class="wa-dot ${configured[key] ? 'ok' : 'pending'}"></span><strong>${label}</strong><small>${configured[key] ? 'Configurado com segurança' : 'Aguardando configuração na Vercel'}</small></div>`).join('');
      const ready = Boolean(result.ready);
      badge.className = `wa-status ${ready ? 'online' : 'setup'}`;
      badge.innerHTML = `<span></span>${ready ? 'WhatsApp pronto para ativar' : 'Configuração necessária'}`;
    } catch (error) {
      badge.className = 'wa-status offline';
      badge.innerHTML = '<span></span>API ainda não publicada';
    }
  }

  function openLeadQuote(leadId) {
    ensureWhatsAppData();
    const lead = data.whatsapp.leads.find(item => item.id === leadId);
    if (!lead?.quoteId) return;
    lead.status = 'reviewed';
    lead.reviewedAt = nowIso();
    saveData();
    setView('quotes');
    setTimeout(() => openQuoteModal(lead.quoteId), 0);
  }

  function bindLeadEvents() {
    $$('[data-wa-open-lead]').forEach(button => { button.onclick = () => openLeadQuote(button.dataset.waOpenLead); });
  }

  function bindWhatsAppEvents() {
    bindLeadEvents();
    if (currentView !== 'whatsapp') return;
    const form = $('#waSimulatorForm');
    if (form) form.onsubmit = event => {
      event.preventDefault();
      const input = $('#waSimulatorInput');
      submitSimulator(input.value);
      input.value = '';
      input.focus();
    };
    $$('[data-wa-prompt]').forEach(button => button.onclick = () => submitSimulator(button.dataset.waPrompt));
    const clear = $('#waClearChat');
    if (clear) clear.onclick = () => {
      data.whatsapp.history = [];
      resetFlow();
      ensureWhatsAppData();
      saveData();
      render();
    };
    const copy = $('#waCopyWebhook');
    if (copy) copy.onclick = async () => {
      try { await navigator.clipboard.writeText($('#waWebhookUrl').textContent); toast('URL do webhook copiada'); }
      catch (_) { toast('Não foi possível copiar automaticamente.', 'error'); }
    };
    const chat = $('#waChat');
    if (chat) chat.scrollTop = chat.scrollHeight;
    loadWhatsAppStatus();
  }

  renderDashboard = function renderDashboardWithWhatsAppAlert() {
    return `${renderDashboardLeadAlert()}${originalRenderDashboard()}`;
  };

  render = function renderWithWhatsApp() {
    if (currentView !== 'whatsapp') return originalRender();
    const content = $('#content');
    content.innerHTML = renderWhatsApp();
    bindViewEvents();
  };

  bindViewEvents = function bindViewEventsWithWhatsApp() {
    originalBindViewEvents();
    bindWhatsAppEvents();
  };
})();