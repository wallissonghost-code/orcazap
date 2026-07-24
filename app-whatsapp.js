'use strict';

(function installWhatsAppModule() {
  const originalRender = render;
  const originalBindViewEvents = bindViewEvents;

  pageMeta.whatsapp = ['Atendimento WhatsApp', 'Configure o assistente, teste conversas e prepare a integração oficial.'];

  function ensureWhatsAppData() {
    if (!data.whatsapp || typeof data.whatsapp !== 'object') {
      data.whatsapp = {
        botName: 'Assistente OrçaZap',
        greeting: 'Olá! Sou o assistente virtual. Posso ajudar com orçamento, pagamento via Pix ou atendimento humano.',
        autoPix: true,
        history: []
      };
    }
    if (!Array.isArray(data.whatsapp.history)) data.whatsapp.history = [];
    if (!data.whatsapp.history.length) {
      data.whatsapp.history.push({
        id: uid(),
        role: 'bot',
        text: data.whatsapp.greeting,
        createdAt: nowIso()
      });
    }
  }

  function botReply(message) {
    const text = String(message || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const business = data.settings.businessName || 'nossa empresa';

    if (/\b(oi|ola|bom dia|boa tarde|boa noite|menu|comecar)\b/.test(text)) {
      return `Olá! Você está falando com ${business}.\n\nPosso ajudar com:\n1. Solicitar orçamento\n2. Pagamento via Pix\n3. Falar com um atendente`;
    }
    if (/\b(orcamento|orcamentos|preco|valor|quanto custa|cotacao)\b/.test(text)) {
      return 'Perfeito. Para preparar seu pré-orçamento, envie em uma única mensagem:\n• seu nome\n• serviço desejado\n• cidade ou bairro\n• medidas ou quantidade\n• prazo desejado\n\nVocê também pode enviar fotos do serviço.';
    }
    if (/\b(pix|pagar|pagamento|entrada|qr code|qrcode)\b/.test(text)) {
      if (!data.settings.pixKey) return 'O Pix ainda não foi configurado. Vou chamar um atendente para concluir o pagamento.';
      return `Pagamento via Pix\nChave: ${data.settings.pixKey}\nFavorecido: ${data.settings.pixName || data.settings.businessName || 'Empresa'}\n\nO QR Code pode ser enviado automaticamente após a aprovação do orçamento.`;
    }
    if (/\b(atendente|humano|pessoa|falar com alguem|suporte)\b/.test(text)) {
      return 'Certo. Registrei seu pedido de atendimento humano. Assim que possível, alguém da equipe continuará a conversa por aqui.';
    }
    if (/\b(aprovado|aprovar|aceito|fechado|pode fazer)\b/.test(text)) {
      return 'Ótimo! Vou registrar a aprovação e preparar as informações de pagamento da entrada via Pix.';
    }
    return 'Entendi. Posso iniciar um orçamento, enviar os dados do Pix ou encaminhar você para um atendente. Digite “orçamento”, “Pix” ou “atendente”.';
  }

  function renderHistory() {
    ensureWhatsAppData();
    return data.whatsapp.history.slice(-20).map(item => `
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
    data.whatsapp.history = data.whatsapp.history.slice(-40);
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
    setTimeout(() => addChatMessage('bot', botReply(clean)), 450);
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