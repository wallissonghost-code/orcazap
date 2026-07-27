'use strict';

(function installEmbeddedWhatsAppSignup() {
  const baseRender = render;
  let platform = null;
  let connection = null;
  let loading = false;
  let facebookPromise = null;
  let authCode = '';
  let signupInfo = null;
  let finishTimer = null;

  function cloudContext() {
    return {
      session: window.OrcaZapCloud?.session || null,
      tenant: window.OrcaZapCloud?.tenant || null
    };
  }

  function safeJson(value) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  function statusText() {
    if (loading) return 'Processando conexão...';
    if (connection?.status === 'connected') return 'Número conectado';
    if (connection?.status === 'error') return 'A conexão precisa de atenção';
    if (!platform?.platformReady) return 'Plataforma aguardando configuração Meta';
    return 'Pronto para conectar';
  }

  function connectionMarkup() {
    const { session, tenant } = cloudContext();
    if (!session || !tenant) {
      return `
        <div class="wa-connect-state">
          <span class="wa-connect-icon">◉</span>
          <div><strong>Entre no OrçaZap Cloud</strong><p>A conexão do número precisa ficar vinculada a uma loja.</p></div>
        </div>
        <button class="btn btn-primary" id="waOpenCloudAccount">Entrar ou criar conta</button>`;
    }

    if (connection?.status === 'connected') {
      return `
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
    }

    const missing = platform?.missing || [];
    const setupMessage = missing.length
      ? `<div class="notice warning"><strong>Configuração da plataforma pendente.</strong><span>Faltam ${missing.length} variável(is) protegida(s) na Vercel. Nenhum lojista precisa informar token manualmente.</span></div>`
      : '';
    const errorMessage = connection?.lastError
      ? `<div class="notice error"><strong>Última tentativa:</strong><span>${esc(connection.lastError)}</span></div>`
      : '';

    return `
      ${setupMessage}${errorMessage}
      <div class="wa-connect-state">
        <span class="wa-connect-icon">W</span>
        <div><strong>Conecte o WhatsApp da sua loja</strong><p>O lojista entra na Meta, escolhe a empresa e autoriza o próprio número.</p></div>
      </div>
      <button class="btn btn-primary btn-large" id="waStartEmbeddedSignup" ${platform?.platformReady && !loading ? '' : 'disabled'}>${loading ? 'Conectando...' : 'Conectar meu WhatsApp'}</button>
      <div class="wa-connect-steps"><span>1. Entrar na Meta</span><span>2. Escolher empresa e número</span><span>3. Autorizar o OrçaZap</span></div>`;
  }

  function renderConnectionCard() {
    const existing = document.querySelector('#waChecklist')?.closest('section.card') || document.querySelector('#waOfficialConnection');
    if (!existing) return;
    existing.id = 'waOfficialConnection';
    existing.className = 'card wa-panel wa-official-card';
    existing.innerHTML = `
      <div class="card-header"><div><h2>Conexão oficial</h2><p>Um número independente para cada lojista.</p></div><div class="wa-status ${connection?.status === 'connected' ? 'online' : platform?.platformReady ? 'setup' : 'checking'}"><span></span>${esc(statusText())}</div></div>
      <div id="waEmbeddedBody" class="wa-embedded-body">${connectionMarkup()}</div>
      <label class="wa-label">Webhook da plataforma</label>
      <div class="wa-copy-row"><code id="waWebhookUrl">${esc(platform?.webhookUrl || `${location.origin}/api/whatsapp-webhook`)}</code><button class="btn btn-ghost btn-sm" id="waCopyWebhook">Copiar</button></div>
      <p class="wa-help">O token da Meta é criptografado no servidor. O navegador guarda apenas a sessão do lojista.</p>`;
    bindConnectionEvents();
  }

  async function refreshConnection() {
    const { session, tenant } = cloudContext();
    const query = tenant?.id ? `?tenantId=${encodeURIComponent(tenant.id)}` : '';
    const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
    try {
      const response = await fetch(`/api/whatsapp-embedded-config${query}`, { headers, cache: 'no-store' });
      const result = await response.json();
      platform = result;
      connection = result.connection || null;
    } catch (error) {
      platform = { platformReady: false, missing: ['API indisponível'], webhookUrl: `${location.origin}/api/whatsapp-webhook` };
    }
    renderConnectionCard();
  }

  function showProgress(message, type = '') {
    const body = document.querySelector('#waEmbeddedBody');
    if (!body) return;
    body.innerHTML = `<div class="wa-connect-progress ${type}"><span class="wa-connect-spinner"></span><strong>${esc(message)}</strong></div>`;
  }

  function initFacebook() {
    if (!platform?.appId) throw new Error('META_APP_ID não configurado.');
    window.FB.init({
      appId: platform.appId,
      cookie: true,
      xfbml: false,
      version: platform.graphVersion || 'v23.0'
    });
  }

  function loadFacebookSdk() {
    if (window.FB) {
      initFacebook();
      return Promise.resolve(window.FB);
    }
    if (facebookPromise) return facebookPromise;
    facebookPromise = new Promise((resolve, reject) => {
      const previous = window.fbAsyncInit;
      window.fbAsyncInit = function onFacebookReady() {
        try {
          if (typeof previous === 'function') previous();
          initFacebook();
          resolve(window.FB);
        } catch (error) {
          reject(error);
        }
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

  function captureSignupInfo(payload) {
    const source = payload?.data || payload || {};
    const wabaId = source.waba_id || source.wabaId || source.whatsapp_business_account_id;
    const phoneNumberId = source.phone_number_id || source.phoneNumberId;
    const businessId = source.business_id || source.businessId;
    if (wabaId || phoneNumberId) {
      signupInfo = {
        wabaId: String(wabaId || ''),
        phoneNumberId: String(phoneNumberId || ''),
        businessId: businessId ? String(businessId) : ''
      };
    }
  }

  async function finalizeSignup() {
    if (loading || !authCode || !signupInfo?.wabaId || !signupInfo?.phoneNumberId) return;
    const { session, tenant } = cloudContext();
    if (!session?.access_token || !tenant?.id) {
      toast('Entre na conta Cloud antes de conectar o número.', 'error');
      return;
    }

    loading = true;
    clearTimeout(finishTimer);
    showProgress('Protegendo o token e vinculando o número à sua loja...');
    try {
      const response = await fetch('/api/whatsapp-connect', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tenantId: tenant.id,
          code: authCode,
          wabaId: signupInfo.wabaId,
          phoneNumberId: signupInfo.phoneNumberId,
          businessId: signupInfo.businessId
        })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'A Meta não concluiu a conexão.');
      connection = result.connection;
      toast('WhatsApp conectado à loja com sucesso');
    } catch (error) {
      toast(error.message || 'Não foi possível conectar o WhatsApp.', 'error');
      connection = { status: 'error', lastError: error.message };
    } finally {
      loading = false;
      authCode = '';
      signupInfo = null;
      renderConnectionCard();
    }
  }

  function waitForSignupInfo() {
    clearTimeout(finishTimer);
    finishTimer = setTimeout(() => {
      if (authCode && (!signupInfo?.wabaId || !signupInfo?.phoneNumberId)) {
        loading = false;
        showProgress('A Meta autorizou a conta, mas não devolveu os identificadores do número. Reabra o fluxo e conclua todas as etapas.', 'error');
      }
    }, 12000);
  }

  function facebookLoginCallback(response) {
    if (response?.authResponse?.code) {
      authCode = response.authResponse.code;
      captureSignupInfo(response.authResponse);
      showProgress('Autorização recebida. Finalizando a conexão...');
      finalizeSignup();
      waitForSignupInfo();
      return;
    }
    loading = false;
    renderConnectionCard();
    if (response?.status !== 'unknown') toast('A autorização da Meta foi cancelada.', 'error');
  }

  async function launchEmbeddedSignup() {
    const { session, tenant } = cloudContext();
    if (!session || !tenant) return window.OrcaZapCloud?.openAccount();
    if (!platform?.platformReady) {
      toast('A plataforma Meta ainda precisa das credenciais protegidas na Vercel.', 'error');
      return;
    }

    loading = true;
    authCode = '';
    signupInfo = null;
    renderConnectionCard();
    showProgress('Abrindo o cadastro seguro da Meta...');
    try {
      const FB = await loadFacebookSdk();
      FB.login(facebookLoginCallback, {
        config_id: platform.configurationId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          sessionInfoVersion: '3'
        }
      });
    } catch (error) {
      loading = false;
      toast(error.message || 'Não foi possível abrir a Meta.', 'error');
      renderConnectionCard();
    }
  }

  async function disconnectNumber() {
    const { session, tenant } = cloudContext();
    if (!session?.access_token || !tenant?.id) return;
    if (!confirm('Desconectar este número da loja? O histórico continuará salvo.')) return;
    loading = true;
    renderConnectionCard();
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
    } catch (error) {
      toast(error.message || 'Não foi possível desconectar.', 'error');
    } finally {
      loading = false;
      renderConnectionCard();
    }
  }

  function bindConnectionEvents() {
    const openCloud = document.querySelector('#waOpenCloudAccount');
    if (openCloud) openCloud.onclick = () => window.OrcaZapCloud?.openAccount();
    const start = document.querySelector('#waStartEmbeddedSignup');
    if (start) start.onclick = launchEmbeddedSignup;
    const refresh = document.querySelector('#waRefreshConnection');
    if (refresh) refresh.onclick = refreshConnection;
    const disconnect = document.querySelector('#waDisconnectNumber');
    if (disconnect) disconnect.onclick = disconnectNumber;
    const copy = document.querySelector('#waCopyWebhook');
    if (copy) copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(document.querySelector('#waWebhookUrl')?.textContent || '');
        toast('URL do webhook copiada');
      } catch (_) {
        toast('Não foi possível copiar automaticamente.', 'error');
      }
    };
  }

  function onMetaMessage(event) {
    if (!/^https:\/\/(www\.)?facebook\.com$/.test(event.origin) && !/^https:\/\/web\.facebook\.com$/.test(event.origin)) return;
    const message = safeJson(event.data);
    if (!message || message.type !== 'WA_EMBEDDED_SIGNUP') return;
    if (message.event === 'FINISH' || message.event === 'FINISH_ONLY_WABA') {
      captureSignupInfo(message);
      showProgress('Número selecionado. Finalizando a conexão...');
      finalizeSignup();
    } else if (message.event === 'CANCEL') {
      loading = false;
      toast('Cadastro do WhatsApp cancelado.', 'error');
      renderConnectionCard();
    } else if (message.event === 'ERROR') {
      loading = false;
      const detail = message.data?.error_message || message.data?.error || 'A Meta informou um erro no cadastro.';
      toast(detail, 'error');
      renderConnectionCard();
    }
  }

  window.addEventListener('message', onMetaMessage);

  render = function renderWithEmbeddedSignup() {
    baseRender();
    if (currentView === 'whatsapp') {
      renderConnectionCard();
      refreshConnection();
    }
  };

  window.addEventListener('DOMContentLoaded', () => {
    if (currentView === 'whatsapp') refreshConnection();
  });
})();
