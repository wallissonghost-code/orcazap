'use strict';

(function installOrcaZapCloud() {
  const SUPABASE_URL = 'https://jioxxnvwhbicgknwcxfx.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_6rl9fVwuL8C7rG1gpQxoww_igP5ooti';
  const SESSION_KEY = 'orcazap:cloud-session:v1';
  const LINKED_TENANT_KEY = 'orcazap:cloud-linked-tenant';
  const PENDING_SIGNUP_KEY = 'orcazap:cloud-pending-signup';

  const baseSaveData = saveData;
  let cloudSession = null;
  let cloudTenant = null;
  let syncTimer = null;
  let suppressCloudSync = false;
  let cloudStatus = 'local';

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
  }

  function writeJson(key, value) {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  }

  function normalizeSlug(value) {
    const base = String(value || 'loja')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 52) || 'loja';
    return `${base}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function authHeaders(token = cloudSession?.access_token) {
    const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  async function parseResponse(response) {
    if (response.status === 204) return null;
    const text = await response.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch (_) { return text; }
  }

  function errorMessage(payload, fallback = 'Não foi possível concluir a operação.') {
    if (!payload) return fallback;
    if (typeof payload === 'string') return payload;
    return payload.msg || payload.message || payload.error_description || payload.error || payload.hint || fallback;
  }

  async function rawRequest(path, options = {}) {
    const response = await fetch(`${SUPABASE_URL}${path}`, {
      ...options,
      headers: { ...authHeaders(options.token), ...(options.headers || {}) },
      cache: 'no-store'
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      const error = new Error(errorMessage(payload));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function persistSession(payload) {
    const source = payload?.session || payload;
    if (!source?.access_token || !source?.refresh_token) return false;
    cloudSession = {
      access_token: source.access_token,
      refresh_token: source.refresh_token,
      expires_at: source.expires_at || Math.floor(Date.now() / 1000) + Number(source.expires_in || 3600),
      user: source.user || payload.user || null
    };
    writeJson(SESSION_KEY, cloudSession);
    return true;
  }

  async function refreshSession() {
    if (!cloudSession?.refresh_token) return false;
    try {
      const payload = await rawRequest('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        token: null,
        body: JSON.stringify({ refresh_token: cloudSession.refresh_token })
      });
      return persistSession(payload);
    } catch (error) {
      clearSession();
      return false;
    }
  }

  async function apiRequest(path, options = {}, retry = true) {
    try {
      return await rawRequest(path, options);
    } catch (error) {
      if (error.status === 401 && retry && await refreshSession()) {
        return apiRequest(path, options, false);
      }
      throw error;
    }
  }

  function clearSession() {
    cloudSession = null;
    cloudTenant = null;
    cloudStatus = 'local';
    localStorage.removeItem(SESSION_KEY);
    updateCloudUi();
  }

  async function restoreSession() {
    cloudSession = readJson(SESSION_KEY);
    if (!cloudSession?.access_token) {
      cloudSession = null;
      return false;
    }
    const expiresAt = Number(cloudSession.expires_at || 0) * 1000;
    if (!expiresAt || expiresAt < Date.now() + 60_000) {
      if (!await refreshSession()) return false;
    }
    try {
      const user = await apiRequest('/auth/v1/user', { method: 'GET' });
      cloudSession.user = user;
      writeJson(SESSION_KEY, cloudSession);
      return true;
    } catch (_) {
      clearSession();
      return false;
    }
  }

  async function fetchTenant() {
    const userId = cloudSession?.user?.id;
    if (!userId) return null;
    const memberships = await apiRequest(`/rest/v1/tenant_members?select=tenant_id,role&user_id=eq.${encodeURIComponent(userId)}&order=created_at.asc&limit=1`, { method: 'GET' });
    const membership = Array.isArray(memberships) ? memberships[0] : null;
    if (!membership?.tenant_id) return null;
    const tenants = await apiRequest(`/rest/v1/tenants?select=id,name,slug,plan,status&id=eq.${encodeURIComponent(membership.tenant_id)}&limit=1`, { method: 'GET' });
    const selected = Array.isArray(tenants) ? tenants[0] : null;
    return selected ? { ...selected, role: membership.role } : null;
  }

  async function createTenant(name) {
    const cleanName = String(name || '').trim();
    if (cleanName.length < 2) throw new Error('Informe o nome da loja ou empresa.');
    const rows = await apiRequest('/rest/v1/tenants', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([{
        name: cleanName,
        slug: normalizeSlug(cleanName),
        owner_user_id: cloudSession.user.id
      }])
    });
    const created = Array.isArray(rows) ? rows[0] : null;
    if (!created) throw new Error('A loja foi criada, mas não foi possível carregar os dados.');
    cloudTenant = { ...created, role: 'owner' };
    return cloudTenant;
  }

  function normalizeCloudPayload(payload) {
    const fresh = defaultData();
    const source = payload && typeof payload === 'object' ? payload : {};
    return {
      ...fresh,
      ...source,
      settings: { ...fresh.settings, ...(source.settings || {}) },
      clients: Array.isArray(source.clients) ? source.clients : [],
      products: Array.isArray(source.products) ? source.products : [],
      quotes: Array.isArray(source.quotes) ? source.quotes : [],
      orders: Array.isArray(source.orders) ? source.orders : [],
      activities: Array.isArray(source.activities) ? source.activities : [],
      whatsapp: source.whatsapp && typeof source.whatsapp === 'object' ? source.whatsapp : undefined
    };
  }

  function looksLikeFreshLocalData() {
    return data.settings?.businessName === 'Minha Empresa' &&
      data.quotes?.length === 0 &&
      data.orders?.length === 0 &&
      data.clients?.length <= 1;
  }

  async function fetchSnapshot() {
    const rows = await apiRequest(`/rest/v1/tenant_snapshots?select=payload,revision,updated_at&tenant_id=eq.${encodeURIComponent(cloudTenant.id)}&limit=1`, { method: 'GET' });
    return Array.isArray(rows) ? rows[0] : null;
  }

  async function uploadSnapshot(showToast = false) {
    if (!cloudSession?.user || !cloudTenant || suppressCloudSync) return;
    cloudStatus = 'syncing';
    updateCloudUi();
    const payload = JSON.parse(JSON.stringify(data));
    payload.cloud = {
      tenantId: cloudTenant.id,
      tenantName: cloudTenant.name,
      syncedAt: nowIso()
    };
    try {
      await apiRequest('/rest/v1/tenant_snapshots?on_conflict=tenant_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{
          tenant_id: cloudTenant.id,
          payload,
          revision: Date.now(),
          updated_by: cloudSession.user.id
        }])
      });
      localStorage.setItem(LINKED_TENANT_KEY, cloudTenant.id);
      cloudStatus = 'synced';
      if (showToast) toast('Dados sincronizados na nuvem');
    } catch (error) {
      cloudStatus = 'error';
      console.warn('Sincronização OrçaZap Cloud:', error);
      if (showToast) toast(error.message || 'Falha ao sincronizar.', 'error');
    }
    updateCloudUi();
  }

  function loadSnapshot(snapshot) {
    suppressCloudSync = true;
    data = normalizeCloudPayload(snapshot.payload);
    baseSaveData();
    suppressCloudSync = false;
    localStorage.setItem(LINKED_TENANT_KEY, cloudTenant.id);
    updateBrand();
    render();
    cloudStatus = 'synced';
    updateCloudUi();
  }

  async function connectSnapshot() {
    if (!cloudTenant) return;
    cloudStatus = 'syncing';
    updateCloudUi();
    const snapshot = await fetchSnapshot();
    if (!snapshot?.payload || !Object.keys(snapshot.payload).length) {
      await uploadSnapshot(false);
      return;
    }

    const linkedTenant = localStorage.getItem(LINKED_TENANT_KEY);
    const shouldLoadCloud = linkedTenant === cloudTenant.id || looksLikeFreshLocalData() || confirm(
      `Já existem dados salvos na nuvem para ${cloudTenant.name}.\n\nToque em OK para carregar os dados da nuvem. Toque em Cancelar para manter estes dados locais e enviá-los para a nuvem.`
    );

    if (shouldLoadCloud) {
      loadSnapshot(snapshot);
      toast('Dados da loja carregados da nuvem');
    } else {
      await uploadSnapshot(true);
    }
  }

  function scheduleCloudSync() {
    if (!cloudSession || !cloudTenant || suppressCloudSync) return;
    clearTimeout(syncTimer);
    cloudStatus = 'pending';
    updateCloudUi();
    syncTimer = setTimeout(() => uploadSnapshot(false), 900);
  }

  saveData = function cloudAwareSaveData(message) {
    baseSaveData(message);
    scheduleCloudSync();
  };

  function updateCloudUi() {
    const button = $('#cloudAccountButton');
    if (button) {
      const label = cloudTenant?.name || (cloudSession ? 'Criar loja' : 'Entrar');
      const stateClass = cloudStatus === 'error' ? 'error' : cloudTenant ? 'online' : 'offline';
      button.innerHTML = `<span class="cloud-dot ${stateClass}"></span><span class="cloud-account-label">${esc(label)}</span>`;
      button.title = cloudStatus === 'syncing' ? 'Sincronizando...' : cloudStatus === 'pending' ? 'Alterações aguardando sincronização' : cloudTenant ? 'Conta e sincronização' : 'Entrar ou criar conta';
    }

    const plan = $('.plan-card');
    if (plan) {
      plan.innerHTML = cloudTenant
        ? `<strong>OrçaZap Cloud</strong><span>${esc(cloudTenant.name)} · plano ${esc(cloudTenant.plan || 'free')}</span>`
        : '<strong>OrçaZap Local</strong><span>Entre para sincronizar em outros aparelhos.</span>';
    }
  }

  function installCloudButton() {
    if ($('#cloudAccountButton')) return;
    const actions = $('.topbar-actions');
    if (!actions) return;
    const button = document.createElement('button');
    button.id = 'cloudAccountButton';
    button.type = 'button';
    button.className = 'btn btn-ghost cloud-account-btn';
    button.onclick = openCloudAccount;
    actions.prepend(button);
    updateCloudUi();
  }

  function cloudAuthMarkup(activeTab = 'login', message = '') {
    return `<div class="cloud-auth">
      ${message ? `<div class="notice">${esc(message)}</div>` : ''}
      <div class="cloud-tabs">
        <button type="button" data-cloud-tab="login" class="${activeTab === 'login' ? 'active' : ''}">Entrar</button>
        <button type="button" data-cloud-tab="signup" class="${activeTab === 'signup' ? 'active' : ''}">Criar conta</button>
      </div>
      <form id="cloudLoginForm" class="cloud-form ${activeTab === 'login' ? '' : 'hidden'}">
        <div class="field"><label>E-mail</label><input class="input" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label>Senha</label><input class="input" name="password" type="password" autocomplete="current-password" minlength="6" required></div>
        <button class="btn btn-primary" type="submit">Entrar no OrçaZap</button>
      </form>
      <form id="cloudSignupForm" class="cloud-form ${activeTab === 'signup' ? '' : 'hidden'}">
        <div class="field"><label>Seu nome</label><input class="input" name="fullName" autocomplete="name" required></div>
        <div class="field"><label>Nome da loja ou empresa</label><input class="input" name="businessName" required></div>
        <div class="field"><label>E-mail</label><input class="input" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label>Senha</label><input class="input" name="password" type="password" autocomplete="new-password" minlength="6" required></div>
        <button class="btn btn-primary" type="submit">Criar conta gratuita</button>
        <small>Os dados de cada lojista ficam separados e protegidos no banco.</small>
      </form>
    </div>`;
  }

  function bindAuthForms(activeTab = 'login') {
    $$('[data-cloud-tab]').forEach(button => button.onclick = () => {
      const tab = button.dataset.cloudTab;
      $$('.cloud-tabs button').forEach(item => item.classList.toggle('active', item.dataset.cloudTab === tab));
      $('#cloudLoginForm')?.classList.toggle('hidden', tab !== 'login');
      $('#cloudSignupForm')?.classList.toggle('hidden', tab !== 'signup');
    });

    const loginForm = $('#cloudLoginForm');
    if (loginForm) loginForm.onsubmit = async event => {
      event.preventDefault();
      const button = $('button[type="submit"]', loginForm);
      const values = Object.fromEntries(new FormData(loginForm));
      button.disabled = true;
      button.textContent = 'Entrando...';
      try {
        const payload = await rawRequest('/auth/v1/token?grant_type=password', {
          method: 'POST',
          token: null,
          body: JSON.stringify({ email: values.email.trim(), password: values.password })
        });
        persistSession(payload);
        cloudTenant = await fetchTenant();
        const pending = readJson(PENDING_SIGNUP_KEY);
        if (!cloudTenant && pending?.businessName) {
          cloudTenant = await createTenant(pending.businessName);
          localStorage.removeItem(PENDING_SIGNUP_KEY);
        }
        closeModal();
        updateCloudUi();
        if (cloudTenant) await connectSnapshot();
        else openTenantOnboarding();
      } catch (error) {
        toast(error.message || 'E-mail ou senha inválidos.', 'error');
        button.disabled = false;
        button.textContent = 'Entrar no OrçaZap';
      }
    };

    const signupForm = $('#cloudSignupForm');
    if (signupForm) signupForm.onsubmit = async event => {
      event.preventDefault();
      const button = $('button[type="submit"]', signupForm);
      const values = Object.fromEntries(new FormData(signupForm));
      button.disabled = true;
      button.textContent = 'Criando conta...';
      try {
        writeJson(PENDING_SIGNUP_KEY, { fullName: values.fullName.trim(), businessName: values.businessName.trim() });
        const payload = await rawRequest('/auth/v1/signup', {
          method: 'POST',
          token: null,
          body: JSON.stringify({
            email: values.email.trim(),
            password: values.password,
            data: { full_name: values.fullName.trim() }
          })
        });
        if (persistSession(payload)) {
          cloudTenant = await createTenant(values.businessName);
          localStorage.removeItem(PENDING_SIGNUP_KEY);
          closeModal();
          updateCloudUi();
          await connectSnapshot();
          toast('Conta e loja criadas com sucesso');
        } else {
          modal('Confirme seu e-mail', cloudAuthMarkup('login', 'Enviamos uma confirmação para o seu e-mail. Depois de confirmar, volte aqui e entre com sua senha.'));
          bindAuthForms('login');
        }
      } catch (error) {
        toast(error.message || 'Não foi possível criar a conta.', 'error');
        button.disabled = false;
        button.textContent = 'Criar conta gratuita';
      }
    };
  }

  function openGuestAccount(tab = 'login') {
    modal('Conta OrçaZap', cloudAuthMarkup(tab));
    bindAuthForms(tab);
  }

  function openTenantOnboarding() {
    modal('Criar sua loja', `<form id="cloudTenantForm" class="cloud-form">
      <div class="notice">Sua conta está ativa. Agora informe o nome da loja ou empresa que usará o OrçaZap.</div>
      <div class="field"><label>Nome da loja ou empresa</label><input class="input" name="businessName" required autofocus></div>
      <button class="btn btn-primary" type="submit">Criar loja</button>
    </form>`);
    const form = $('#cloudTenantForm');
    form.onsubmit = async event => {
      event.preventDefault();
      const button = $('button[type="submit"]', form);
      const name = new FormData(form).get('businessName');
      button.disabled = true;
      button.textContent = 'Criando...';
      try {
        await createTenant(name);
        closeModal();
        updateCloudUi();
        await connectSnapshot();
        toast('Loja criada com sucesso');
      } catch (error) {
        toast(error.message || 'Não foi possível criar a loja.', 'error');
        button.disabled = false;
        button.textContent = 'Criar loja';
      }
    };
  }

  async function signOutCloud() {
    try { await apiRequest('/auth/v1/logout', { method: 'POST' }); } catch (_) {}
    clearSession();
    toast('Você saiu da conta. Os dados locais foram mantidos.');
    closeModal();
  }

  function openCloudAccount() {
    if (!cloudSession) return openGuestAccount('login');
    if (!cloudTenant) return openTenantOnboarding();
    const userEmail = cloudSession.user?.email || 'Conta conectada';
    const statusLabel = cloudStatus === 'syncing' ? 'Sincronizando agora' : cloudStatus === 'pending' ? 'Alterações pendentes' : cloudStatus === 'error' ? 'Erro na última sincronização' : 'Dados sincronizados';
    modal('OrçaZap Cloud', `<div class="cloud-account-card">
      <div class="cloud-account-hero"><span class="cloud-avatar">${esc(initials(cloudTenant.name))}</span><div><strong>${esc(cloudTenant.name)}</strong><span>${esc(userEmail)}</span></div></div>
      <div class="cloud-account-grid"><div><small>Plano</small><strong>${esc(cloudTenant.plan || 'free')}</strong></div><div><small>Perfil</small><strong>${esc(cloudTenant.role || 'member')}</strong></div><div class="full"><small>Sincronização</small><strong>${esc(statusLabel)}</strong></div></div>
      <div class="cloud-account-actions"><button id="cloudSyncNow" class="btn btn-primary">Sincronizar agora</button><button id="cloudLogout" class="btn btn-ghost">Sair da conta</button></div>
      <p class="cloud-help">Nesta fase, o banco salva uma cópia completa e isolada dos dados da loja. A conexão individual do WhatsApp será vinculada a esta mesma conta.</p>
    </div>`);
    $('#cloudSyncNow').onclick = () => uploadSnapshot(true);
    $('#cloudLogout').onclick = signOutCloud;
  }

  async function initCloud() {
    installCloudButton();
    cloudStatus = 'local';
    updateCloudUi();
    if (!await restoreSession()) return;
    try {
      cloudTenant = await fetchTenant();
      const pending = readJson(PENDING_SIGNUP_KEY);
      if (!cloudTenant && pending?.businessName) {
        cloudTenant = await createTenant(pending.businessName);
        localStorage.removeItem(PENDING_SIGNUP_KEY);
      }
      updateCloudUi();
      if (cloudTenant) await connectSnapshot();
    } catch (error) {
      cloudStatus = 'error';
      updateCloudUi();
      console.warn('Inicialização OrçaZap Cloud:', error);
    }
  }

  window.OrcaZapCloud = {
    openAccount: openCloudAccount,
    sync: () => uploadSnapshot(true),
    get tenant() { return cloudTenant; },
    get session() { return cloudSession; }
  };

  window.addEventListener('DOMContentLoaded', initCloud);
})();
