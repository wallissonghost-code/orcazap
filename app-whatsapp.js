'use strict';

(function installWhatsAppModule() {
  const originalRender = render;
  const originalBindViewEvents = bindViewEvents;

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
      data.whatsapp.history.push({
        id: uid(),
        role: 'bot',
        text: data.whatsapp.greeting,
        createdAt: nowIso()
      });
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
        const lead = {
          id: uid(),
          ...flow.draft,
          status: 'new',
          createdAt: nowIso()
        };
        data.whatsapp.leads.unshift(lead);
        data.whatsapp.leads = data.whatsapp.leads.slice(0, 100);
        activity(`Nova solicitação pelo WhatsApp: ${lead.name} — ${lead.service}`);
        resetFlow();
        return `Pronto, ${lead.name}! Sua solicitação foi registrada com sucesso.\n\nA equipe vai analisar os dados e preparar o orçamento. Quando ele estiver pronto, poderá ser enviado com PDF e opção de pagamento via Pix.`;
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
    if (/^(1)$/.test(text) || /\b(orcamento|orçamentos|orcamentos|preco|preço|valor|quanto custa|cotacao|cotação)\b/.test(text)) {
      return startQuoteFlow();
    }
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

  function renderWhatsApp() {
    ensureWhatsAppData();
    const webhookUrl = `${location.origin}/api/whatsapp-webhook`;
    const pixQuery = new URLSearchParams({
      key: data.settings.pixKey || '',
      name: data.settings.pixName || data.settings.businessName || 'RECEBEDOR',
      city: data.settings.pixCity || data.settings.city || 'BRASIL'
    }).toString();

    return `
      <div class="wa-hero">
        <div>
          <span class="wa-kicker">ORÇAZAP AUTOMAÇÃO</span>
          <h2>Atendimento e vendas pelo WhatsApp</h2>
          <p>Receba mensagens, qualifique o cliente, envie orçamento e cobre a entrada por Pix no mesmo fluxo.</p>
        </div>
        <div id="waConnectionBadge" class="wa-status checking"><span></span> Verificando integração...</div>
      </div>

      <div class="wa-grid">
        <section class="card wa-panel wa-simulator">
          <div class="card-header">
            <div><h2>Simulador do assistente</h2><p>Teste o atendimento antes de conectar o número oficial.</p></div>
            <button class="btn btn-ghost btn-sm" id="waClearChat">Limpar</button>
          </div>
          <div id="waChat" class="wa-chat">${renderHistory()}</div>
          <div class="wa-quick">
            <button data-wa-prompt="Olá">Saudação</button>
            <button data-wa-prompt="Quero um orçamento">Orçamento</button>
            <button data-wa-prompt="Como pago no Pix?">Pix</button>
            <button data-wa-prompt="Quero falar com atendente">Atendente</button>
          </div>
          <form id="waSimulatorForm" class="wa-compose">
            <input id="waSimulatorInput" class="input" placeholder="Digite como se fosse o cliente..." autocomplete="off" required>
            <button class="btn btn-primary" type="submit">Enviar</button>
          </form>
        </section>

        <div class="wa-side-stack">
          <section class="card wa-panel">
            <div class="card-header"><div><h2>Conexão oficial</h2><p>Base pronta para a WhatsApp Cloud API.</p></div></div>
            <div class="wa-checklist" id="waChecklist">
              <div><span class="wa-dot pending"></span><strong>Token de acesso</strong><small>Aguardando configuração na Vercel</small></div>
              <div><span class="wa-dot pending"></span><strong>ID do número</strong><small>Aguardando configuração na Vercel</small></div>
              <div><span class="wa-dot pending"></span><strong>Token do webhook</strong><small>Aguardando configuração na Vercel</small></div>
              <div><span class="wa-dot pending"></span><strong>Chave Pix do bot</strong><small>Aguardando configuração na Vercel</small></div>
            </div>
            <label class="wa-label">URL do webhook</label>
            <div class="wa-copy-row"><code id="waWebhookUrl">${esc(webhookUrl)}</code><button class="btn btn-ghost btn-sm" id="waCopyWebhook">Copiar</button></div>
            <p class="wa-help">As credenciais ficam somente nas variáveis de ambiente da Vercel. Nenhum token secreto é salvo neste navegador.</p>
          </section>

          <section class="card wa-panel">
            <div class="card-header"><div><h2>Pix automático</h2><p>Chave e QR Code para enviar depois da aprovação.</p></div></div>
            ${data.settings.pixKey ? `
              <div class="wa-pix-preview">
                <img src="/api/pix-qr?${pixQuery}" alt="QR Code Pix" loading="lazy">
                <div><strong>${esc(data.settings.pixName || data.settings.businessName)}</strong><span>${esc(data.settings.pixKey)}</span><small>O valor será preenchido conforme a entrada do orçamento.</small></div>
              </div>` : `
              <div class="notice warning"><strong>Pix não configurado.</strong> Abra Configurações → Pix e orçamento para cadastrar a chave.</div>`}
          </section>
        </div>
      </div>

      <section class="card wa-panel" style="margin-top:18px">
        <div class="card-header"><div><h2>Fluxo que será automatizado</h2><p>A primeira fase já deixa a estrutura preparada para o número oficial.</p></div></div>
        <div class="wa-flow">
          <article><b>1</b><strong>Recebe</strong><span>O cliente inicia a conversa pelo WhatsApp.</span></article>
          <article><b>2</b><strong>Qualifica</strong><span>O bot coleta nome, serviço, localização, medidas e fotos.</span></article>
          <article><b>3</b><strong>Orça</strong><span>A solicitação vira cliente e pré-orçamento para sua revisão.</span></article>
          <article><b>4</b><strong>Fecha</strong><span>Após aprovação, envia PDF, chave Pix e QR Code.</span></article>
        </div>
      </section>`;
  }

  function addChatMessage(role, text) {
    ensureWhatsAppData();
    data.whatsapp.history.push({ id: uid(), role, text, createdAt: nowIso() });
    data.whatsapp.history = data.whatsapp.history.slice(-60);
    saveData();
    const chat = $('#waChat');
    if (chat) {
      chat.innerHTML = renderHistory();
      chat.scrollTop = chat.scrollHeight;
    }
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
      const items = [
        ['accessToken', 'Token de acesso'],
        ['phoneNumberId', 'ID do número'],
        ['verifyToken', 'Token do webhook'],
        ['pixKey', 'Chave Pix do bot']
      ];
      checklist.innerHTML = items.map(([key, label]) => `
        <div><span class="wa-dot ${configured[key] ? 'ok' : 'pending'}"></span><strong>${label}</strong><small>${configured[key] ? 'Configurado com segurança' : 'Aguardando configuração na Vercel'}</small></div>`).join('');
      const ready = Boolean(result.ready);
      badge.className = `wa-status ${ready ? 'online' : 'setup'}`;
      badge.innerHTML = `<span></span>${ready ? 'WhatsApp pronto para ativar' : 'Configuração necessária'}`;
    } catch (error) {
      badge.className = 'wa-status offline';
      badge.innerHTML = '<span></span>API ainda não publicada';
    }
  }

  function bindWhatsAppEvents() {
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
      data.whatsapp.leads = [];
      resetFlow();
      ensureWhatsAppData();
      saveData();
      render();
    };
    const copy = $('#waCopyWebhook');
    if (copy) copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText($('#waWebhookUrl').textContent);
        toast('URL do webhook copiada');
      } catch (_) {
        toast('Não foi possível copiar automaticamente.', 'error');
      }
    };
    const chat = $('#waChat');
    if (chat) chat.scrollTop = chat.scrollHeight;
    loadWhatsAppStatus();
  }

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