'use strict';

(function installEmbeddedWhatsAppSignupV2() {
  const baseRender = render;
  let platform = null;
  let connection = null;
  let opening = false;
  let processing = false;
  let facebookPromise = null;
  let authCode = '';
  let signupInfo = null;
  let infoTimer = null;

  const cloud = () => ({ session: window.OrcaZapCloud?.session || null, tenant: window.OrcaZapCloud?.tenant || null });
  const busy = () => opening || processing;

  function parseMessage(value) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  function cardBody() {
    const { session, tenant } = cloud();
    if (!session || !tenant) return `
      <div class="wa-connect-state"><span class="wa-connect-icon">◉</span><div><strong>Entre no OrçaZap Cloud</strong><p>A conexão precisa ficar vinculada a uma loja.</p></div></div>
      <button class="btn btn-primary" id="waOpenCloudAccount">Entrar ou criar conta</button>`;

    if (connection?.status === 'connected') return `
      <div class="wa-connected-card">
        <div class="wa-connected-head"><span class="wa-dot ok"></span><div><strong>${esc(connection.businessAccountName || tenant.name)}</strong><small>Conectado à loja ${esc(tenant.name)}</small></div></div>
        <div class="wa-connected-grid">
          <div><small>Número</small><strong>${esc(connection.displayPhoneNumber || 'Número autorizado')}</strong></div>
          <div><small>Status</small><strong>Ativo</strong></div>
          <div><small>WABA ID</small><code>${esc(connection.wabaId || '—')}</code></div>
          <div><small>Phone Number ID</small><code>${esc(connection.phoneNumberId || '—')}</code></div>
        </div>
        <div class="wa-connect-actions"><button class="btn btn-ghost" id="waRefreshConnection">Atualizar status</button><button class="btn btn-danger" id="waDisconnectNumber">Desconectar</button></div>
      </div>`;

    const pending = platform?.missing?.length
      ? `<div class="notice warning"><strong>Configuração da plataforma pendente.</strong><span>Faltam ${platform.missing.length} variável(is) protegida(s) na Vercel.</span></div>`
      : '';
    const failure = connection?.lastError
      ? `<div class="notice error"><strong>Última tentativa:</strong><span>${esc(connection.lastError)}</span></div>`
      : '';
    return `
      ${pending}${failure}
      <div class="wa-connect-state"><span class="wa-connect-icon">W</span><div><strong>Conecte o WhatsApp da sua loja</strong><p>Entre na Meta, selecione a empresa e autorize o próprio número.</p></div></div>
      <button class="btn btn-primary btn-large" id="waStartEmbeddedSignup" ${platform?.platformReady && !busy() ? '' : 'disabled'}>${busy() ? 'Conectando...' : 'Conectar meu WhatsApp'}</button>
      <div class="wa-connect-steps"><span>1. Entrar na Meta</span><span>2. Escolher empresa e número</span><span>3. Autorizar o OrçaZap</span></div>`;
  }

  function statusLabel() {
    if (busy()) return 'Processando conexão...';
    if (connection?.status === 'connected') return 'Número conectado';
    if (connection?.status === 'error') return 'A conexão precisa de atenção';
    if (!platform?.platformReady) return 'Aguardando configuração Meta';
    return 'Pronto para conectar';
  }

  function mount() {
    const card = document.querySelector('#waChecklist')?.closest('section.card') || document.querySelector('#waOfficialConnection');
    if (!card) return;
    card.id = 'waOfficialConnection';
    card.className = 'card wa-panel wa-official-card';
    card.innerHTML = `
      <div class="card-header"><div><h2>Conexão oficial</h2><p>Um número independente para cada lojista.</p></div><div class="wa-status ${connection?.status === 'connected' ? 'online' : platform?.platformReady ? 'setup' : 'checking'}"><span></span>${esc(statusLabel())}</div></div>
      <div id="waEmbeddedBody" class="wa-embedded-body">${cardBody()}</div>
      <label class="wa-label">Webhook da plataforma</label>
      <div class="wa-copy-row"><code id="waWebhookUrl">${esc(platform?.webhookUrl || `${location.origin}/api/whatsapp-webhook`)}</code><button class="btn btn-ghost btn-sm" id="waCopyWebhook">Copiar</button></div>
      <p class="wa-help">O token da Meta é criptografado no servidor e nunca aparece no navegador.</p>`;
    bind();
  }

  function progress(text, error = false) {
    const body = document.querySelector('#waEmbeddedBody');
    if (body) body.innerHTML = `<div class="wa-connect-progress ${error ? 'error' : ''}"><span class="wa-connect-spinner"></span><strong>${esc(text)}</strong></div>`;
  }

  async function refresh() {
    const { session, tenant } = cloud();
    const query = tenant?.id ? `?tenantId=${encodeURIComponent(tenant.id)}` : '';
    try {
      const response = await fetch(`/api/whatsapp-embedded-config${query}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        cache: 'no-store'
      });
      const result = await response.json();
      platform = result;
      connection = result.connection || null;
    } catch (_) {
      platform = { platformReady: false, missing: ['API'], webhookUrl: `${location.origin}/api/whatsapp-webhook` };
    }
    mount();
  }

  function initFacebook() {
    if (!platform?.appId) throw new Error('META_APP_ID não configurado.');
    window.FB.init({ appId: platform.appId, cookie: true, xfbml: false, version: platform.graphVersion || 'v23.0' });
  }

  function loadFacebook() {
    if (window.FB) { initFacebook(); return Promise.resolve(window.FB); }
    if (facebookPromise) return facebookPromise;
    facebookPromise = new Promise((resolve, reject) => {
      const previous = window.fbAsyncInit;
      window.fbAsyncInit = () => {
        try {
          if (typeof previous === 'function') previous();
          initFacebook();
          resolve(window.FB);
        } catch (error) { reject(error); }
      };
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
      script.onerror = () => reject(new Error('Não foi possível carregar a conexão segura da Meta.'));
      document.head.appendChild(script);
    });
    return facebookPromise;
  }

  function capture(payload) {
    const source = payload?.data || payload || {};
    const wabaId = source.waba_id || source.wabaId || source.whatsapp_business_account_id;
    const phoneNumberId = source.phone_number_id || source.phoneNumberId;
    if (wabaId || phoneNumberId) signupInfo = {
      wabaId: String(wabaId || ''),
      phoneNumberId: String(phoneNumberId || ''),
      businessId: String(source.business_id || source.businessId || '')
    };
  }

  async function finalize() {
    if (processing || !authCode || !signupInfo?.wabaId || !signupInfo?.phoneNumberId) return;
    const { session, tenant } = cloud();
    if (!session?.access_token || !tenant?.id) return;
    processing = true;
    opening = false;
    clearTimeout(infoTimer);
    progress('Protegendo o token e vinculando o número à sua loja...');
    try {
      const response = await fetch('/api/whatsapp-connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: tenant.id, code: authCode, ...signupInfo })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'A Meta não concluiu a conexão.');
      connection = result.connection;
      toast('WhatsApp conectado à loja com sucesso');
    } catch (error) {
      connection = { status: 'error', lastError: error.message };
      toast(error.message || 'Não foi possível conectar o WhatsApp.', 'error');
    } finally {
      processing = false;
      authCode = '';
      signupInfo = null;
      mount();
    }
  }

  function awaitInfo() {
    clearTimeout(infoTimer);
    infoTimer = setTimeout(() => {
      if (authCode && (!signupInfo?.wabaId || !signupInfo?.phoneNumberId)) {
        opening = false;
        progress('A autorização foi recebida, mas a Meta não devolveu o número. Reabra e conclua todas as etapas.', true);
      }
    }, 12000);
  }

  function loginCallback(response) {
    if (response?.authResponse?.code) {
      authCode = response.authResponse.code;
      capture(response.authResponse);
      progress('Autorização recebida. Finalizando a conexão...');
      finalize();
      awaitInfo();
      return;
    }
    opening = false;
    mount();
    if (response?.status !== 'unknown') toast('A autorização da Meta foi cancelada.', 'error');
  }

  async function launch() {
    const { session, tenant } = cloud();
    if (!session || !tenant) return window.OrcaZapCloud?.openAccount();
    if (!platform?.platformReady) return toast('A plataforma Meta ainda precisa das credenciais protegidas na Vercel.', 'error');
    opening = true;
    authCode = '';
    signupInfo = null;
    mount();
    progress('Abrindo o cadastro seguro da Meta...');
    try {
      const FB = await loadFacebook();
      FB.login(loginCallback, {
        config_id: platform.configurationId,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {}, sessionInfoVersion: '3' }
      });
    } catch (error) {
      opening = false;
      toast(error.message || 'Não foi possível abrir a Meta.', 'error');
      mount();
    }
  }

  async function disconnect() {
    const { session, tenant } = cloud();
    if (!session?.access_token || !tenant?.id || !confirm('Desconectar este número da loja? O histórico continuará salvo.')) return;
    processing = true;
    mount();
    try {
      const response = await fetch('/api/whatsapp-disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: tenant.id })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Falha ao desconectar.');
      connection = result.connection;
      toast('Número desconectado da loja');
    } catch (error) { toast(error.message || 'Não foi possível desconectar.', 'error'); }
    processing = false;
    mount();
  }

  function bind() {
    const openCloud = document.querySelector('#waOpenCloudAccount');
    if (openCloud) openCloud.onclick = () => window.OrcaZapCloud?.openAccount();
    const start = document.querySelector('#waStartEmbeddedSignup');
    if (start) start.onclick = launch;
    const reload = document.querySelector('#waRefreshConnection');
    if (reload) reload.onclick = refresh;
    const remove = document.querySelector('#waDisconnectNumber');
    if (remove) remove.onclick = disconnect;
    const copy = document.querySelector('#waCopyWebhook');
    if (copy) copy.onclick = async () => {
      try { await navigator.clipboard.writeText(document.querySelector('#waWebhookUrl')?.textContent || ''); toast('URL do webhook copiada'); }
      catch (_) { toast('Não foi possível copiar automaticamente.', 'error'); }
    };
  }

  function metaMessage(event) {
    const allowed = ['https://www.facebook.com', 'https://web.facebook.com', 'https://business.facebook.com'];
    if (!allowed.includes(event.origin)) return;
    const message = parseMessage(event.data);
    if (!message || message.type !== 'WA_EMBEDDED_SIGNUP') return;
    if (message.event === 'FINISH' || message.event === 'FINISH_ONLY_WABA') {
      capture(message);
      progress('Número selecionado. Finalizando a conexão...');
      finalize();
    } else if (message.event === 'CANCEL') {
      opening = false;
      toast('Cadastro do WhatsApp cancelado.', 'error');
      mount();
    } else if (message.event === 'ERROR') {
      opening = false;
      toast(message.data?.error_message || message.data?.error || 'A Meta informou um erro no cadastro.', 'error');
      mount();
    }
  }

  window.addEventListener('message', metaMessage);
  render = function renderWithEmbeddedSignupV2() {
    baseRender();
    if (currentView === 'whatsapp') { mount(); refresh(); }
  };
  window.addEventListener('DOMContentLoaded', () => { if (currentView === 'whatsapp') refresh(); });
})();
