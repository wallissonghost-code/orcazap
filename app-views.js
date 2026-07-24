'use strict';
  function renderQuotes() {
    const search = filters.quotes.toLowerCase();
    const rows = [...data.quotes]
      .filter(q => filters.quoteStatus === 'all' || q.status === filters.quoteStatus)
      .filter(q => {
        const client = data.clients.find(c => c.id === q.clientId);
        return !search || `${q.number} ${client?.name || q.clientName || ''}`.toLowerCase().includes(search);
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return `
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="search-wrap"><input id="quoteSearch" class="input" placeholder="Buscar número ou cliente" value="${esc(filters.quotes)}" /></div>
          <select id="quoteStatusFilter" class="select" style="width:auto">
            <option value="all">Todos os status</option>
            ${Object.entries(quoteStatuses).map(([value, [label]]) => `<option value="${value}" ${filters.quoteStatus === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
        <div class="toolbar-right"><button class="btn btn-primary" data-action="new-quote">+ Novo orçamento</button></div>
      </div>
      <section class="card">
        <div class="card-header"><div><h2>${rows.length} orçamento(s)</h2><p>Use os botões para enviar, aprovar, duplicar ou gerar PDF.</p></div></div>
        ${rows.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Orçamento</th><th>Cliente</th><th>Validade</th><th>Status</th><th>Total</th><th>Ações</th></tr></thead>
          <tbody>${rows.map(q => {
            const client = data.clients.find(c => c.id === q.clientId);
            const totals = quoteTotals(q);
            return `<tr>
              <td><strong>${esc(q.number)}</strong><small style="display:block;color:var(--muted);margin-top:3px">Criado ${dateBR(q.createdAt)}</small></td>
              <td><div class="name-cell"><div class="avatar">${initials(client?.name || q.clientName)}</div><div><strong>${esc(client?.name || q.clientName || 'Cliente removido')}</strong><small>${esc(client?.phone || '')}</small></div></div></td>
              <td>${dateBR(q.validUntil)}</td>
              <td>${statusBadge(q.status)}</td>
              <td><strong>${money(totals.total)}</strong><small style="display:block;color:var(--primary-dark);margin-top:3px">Entrada ${money(totals.entry)}</small></td>
              <td><div class="table-actions">
                <button class="btn btn-ghost btn-sm" title="Editar" data-edit-quote="${q.id}">Editar</button>
                <button class="btn btn-ghost btn-sm" title="PDF" data-pdf-quote="${q.id}">PDF</button>
                <button class="btn btn-primary btn-sm" title="WhatsApp" data-whatsapp-quote="${q.id}">WhatsApp</button>
                <button class="btn btn-ghost btn-sm" title="Mais ações" data-more-quote="${q.id}">•••</button>
              </div></td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>` : emptyState('▤', 'Nenhum resultado', 'Crie um orçamento ou altere os filtros.', '+ Novo orçamento', 'new-quote')}
      </section>`;
  }

  function renderOrders() {
    const columns = Object.keys(orderStatuses);
    return `
      <div class="toolbar">
        <div class="toolbar-left"><div><strong>${data.orders.length} pedido(s)</strong><div style="color:var(--muted);font-size:12px;margin-top:3px">Pedidos são criados a partir de orçamentos aprovados.</div></div></div>
        <div class="toolbar-right"><button class="btn btn-primary" data-action="new-quote">+ Criar orçamento</button></div>
      </div>
      ${data.orders.length ? `<div class="kanban">${columns.map(status => {
        const orders = data.orders.filter(order => order.status === status).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return `<section class="kanban-col"><div class="kanban-head"><h3>${orderStatuses[status][0]}</h3><span class="kanban-count">${orders.length}</span></div>
          ${orders.map(order => {
            const quote = data.quotes.find(q => q.id === order.quoteId);
            const client = data.clients.find(c => c.id === order.clientId);
            return `<article class="order-card">
              <h4>${esc(order.number)}</h4>
              <p>${esc(client?.name || order.clientName || 'Cliente removido')}</p>
              <p style="margin-top:4px">Origem: ${esc(quote?.number || 'Orçamento')}</p>
              <footer><strong>${money(order.total)}</strong><select class="select" data-order-status="${order.id}">${columns.map(value => `<option value="${value}" ${value === status ? 'selected' : ''}>${orderStatuses[value][0]}</option>`).join('')}</select></footer>
              <div style="display:flex;gap:7px;margin-top:10px"><button class="btn btn-ghost btn-sm" data-edit-quote="${order.quoteId}">Ver orçamento</button><button class="btn btn-ghost btn-sm" data-delete-order="${order.id}">Excluir</button></div>
            </article>`;
          }).join('') || '<p style="color:var(--muted);font-size:11px;padding:5px">Nenhum pedido.</p>'}
        </section>`;
      }).join('')}</div>` : `<section class="card">${emptyState('▣', 'Nenhum pedido em produção', 'Aprove um orçamento e transforme-o em pedido para iniciar o controle.')}</section>`}`;
  }

  function renderClients() {
    const search = filters.clients.toLowerCase();
    const clients = [...data.clients].filter(c => !search || `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(search)).sort((a, b) => a.name.localeCompare(b.name));
    return `
      <div class="toolbar">
        <div class="toolbar-left"><div class="search-wrap"><input id="clientSearch" class="input" placeholder="Buscar cliente" value="${esc(filters.clients)}" /></div></div>
        <div class="toolbar-right"><button class="btn btn-primary" data-action="new-client">+ Novo cliente</button></div>
      </div>
      <section class="card">
        <div class="card-header"><div><h2>${clients.length} cliente(s)</h2><p>Contatos usados nos orçamentos e cobranças.</p></div></div>
        ${clients.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Cliente</th><th>Documento</th><th>Endereço</th><th>Orçamentos</th><th>Ações</th></tr></thead>
          <tbody>${clients.map(client => {
            const count = data.quotes.filter(q => q.clientId === client.id).length;
            return `<tr>
              <td><div class="name-cell"><div class="avatar">${initials(client.name)}</div><div><strong>${esc(client.name)}</strong><small>${esc(client.phone || client.email || 'Sem contato')}</small></div></div></td>
              <td>${esc(client.document || '—')}</td>
              <td>${esc(client.address || '—')}</td>
              <td>${count}</td>
              <td><div class="table-actions"><button class="btn btn-ghost btn-sm" data-edit-client="${client.id}">Editar</button><button class="btn btn-primary btn-sm" data-client-quote="${client.id}">Orçamento</button><button class="btn btn-danger btn-sm" data-delete-client="${client.id}">Excluir</button></div></td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>` : emptyState('♙', 'Nenhum cliente encontrado', 'Cadastre o primeiro contato para criar um orçamento.', '+ Novo cliente', 'new-client')}
      </section>`;
  }

  function renderProducts() {
    const search = filters.products.toLowerCase();
    const products = [...data.products].filter(p => !search || `${p.name} ${p.description}`.toLowerCase().includes(search)).sort((a, b) => a.name.localeCompare(b.name));
    return `
      <div class="toolbar">
        <div class="toolbar-left"><div class="search-wrap"><input id="productSearch" class="input" placeholder="Buscar produto ou serviço" value="${esc(filters.products)}" /></div></div>
        <div class="toolbar-right"><button class="btn btn-primary" data-action="new-product">+ Novo item</button></div>
      </div>
      <section class="card">
        <div class="card-header"><div><h2>${products.length} item(ns)</h2><p>O custo é interno e serve para calcular o lucro estimado.</p></div></div>
        ${products.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Produto/serviço</th><th>Unidade</th><th>Preço de venda</th><th>Custo</th><th>Margem</th><th>Ações</th></tr></thead>
          <tbody>${products.map(product => {
            const margin = product.price ? Math.round((product.price - product.cost) / product.price * 100) : 0;
            return `<tr>
              <td><strong>${esc(product.name)}</strong><small style="display:block;color:var(--muted);margin-top:3px">${esc(product.description || '')}</small></td>
              <td>${esc(product.unit || 'un.')}</td>
              <td><strong>${money(product.price)}</strong></td>
              <td>${money(product.cost)}</td>
              <td><span class="badge ${margin >= 40 ? 'badge-approved' : margin >= 20 ? 'badge-sent' : 'badge-expired'}">${margin}%</span></td>
              <td><div class="table-actions"><button class="btn btn-ghost btn-sm" data-edit-product="${product.id}">Editar</button><button class="btn btn-danger btn-sm" data-delete-product="${product.id}">Excluir</button></div></td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>` : emptyState('◇', 'Nenhum item encontrado', 'Cadastre seus produtos e serviços para preencher orçamentos rapidamente.', '+ Novo item', 'new-product')}
      </section>`;
  }

  function renderSettings() {
    const tabs = [
      ['business', 'Minha empresa'],
      ['payments', 'Pix e orçamento'],
      ['security', 'Segurança'],
      ['data', 'Backup e dados']
    ];
    let body = '';

    if (settingsTab === 'business') {
      body = `<form id="businessForm" class="form-grid">
        <div class="full" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
          <div class="logo-preview">${data.settings.logo ? `<img src="${data.settings.logo}" alt="Logo">` : '<span style="color:var(--muted);font-weight:900">LOGO</span>'}</div>
          <div><label class="btn btn-ghost" for="logoInput">Escolher logo</label><input id="logoInput" type="file" accept="image/png,image/jpeg,image/webp" hidden><p style="color:var(--muted);font-size:11px;margin:8px 0 0">PNG ou JPG. A imagem fica salva neste navegador.</p></div>
        </div>
        ${field('businessName', 'Nome da empresa', data.settings.businessName, 'text', true)}
        ${field('document', 'CPF/CNPJ', data.settings.document)}
        ${field('phone', 'Telefone', data.settings.phone)}
        ${field('whatsapp', 'WhatsApp para contato', data.settings.whatsapp)}
        ${field('email', 'E-mail', data.settings.email, 'email')}
        ${field('city', 'Cidade', data.settings.city)}
        <div class="field full"><label>Endereço</label><input class="input" name="address" value="${esc(data.settings.address)}" placeholder="Rua, número, bairro"></div>
        <div class="field full"><label>Mensagem no rodapé</label><input class="input" name="footer" value="${esc(data.settings.footer)}" placeholder="Obrigado pela preferência!"></div>
        <div class="full"><button class="btn btn-primary" type="submit">Salvar empresa</button></div>
      </form>`;
    }

    if (settingsTab === 'payments') {
      body = `<form id="paymentForm" class="form-grid">
        ${field('pixKey', 'Chave Pix', data.settings.pixKey, 'text', false, 'CPF, CNPJ, celular, e-mail ou chave aleatória')}
        ${field('pixName', 'Nome do recebedor', data.settings.pixName, 'text', false, 'Máximo recomendado: 25 caracteres')}
        ${field('pixCity', 'Cidade do recebedor', data.settings.pixCity, 'text', false, 'Sem acentos no QR Pix')}
        ${field('quotePrefix', 'Prefixo do orçamento', data.settings.quotePrefix, 'text', false, 'Ex.: ORC, GC, OZ')}
        ${field('defaultEntry', 'Entrada padrão (%)', data.settings.defaultEntry, 'number')}
        ${field('defaultValidity', 'Validade padrão (dias)', data.settings.defaultValidity, 'number')}
        <div class="full notice">O PDF exibe o valor total, a entrada, o saldo e um QR Code Pix com o valor da entrada quando a chave estiver configurada.</div>
        <div class="full"><button class="btn btn-primary" type="submit">Salvar preferências</button></div>
      </form>`;
    }

    if (settingsTab === 'security') {
      body = `<form id="securityForm" class="form-grid">
        <div class="field full"><label>PIN de acesso</label><input class="input" name="pin" type="password" inputmode="numeric" maxlength="8" value="${esc(data.settings.pin)}" placeholder="Deixe vazio para não bloquear"><small>Proteção simples para impedir abertura casual neste aparelho. Não substitui autenticação de servidor.</small></div>
        <div class="full"><button class="btn btn-primary" type="submit">Salvar PIN</button></div>
      </form>`;
    }

    if (settingsTab === 'data') {
      body = `<div class="stack">
        <div class="notice"><strong>Backup recomendado:</strong> os dados desta versão ficam no navegador. Exporte o arquivo periodicamente e guarde em local seguro.</div>
        <div class="backup-actions">
          <button class="btn btn-primary" id="exportBackup">Baixar backup</button>
          <label class="btn btn-ghost" for="importBackup">Importar backup</label><input id="importBackup" type="file" accept="application/json" hidden>
          <button class="btn btn-danger" id="resetData">Apagar todos os dados</button>
        </div>
        <div class="card" style="box-shadow:none"><div class="card-pad"><strong>Resumo local</strong><p style="color:var(--muted);font-size:12px;line-height:1.6;margin-bottom:0">${data.clients.length} clientes · ${data.products.length} produtos · ${data.quotes.length} orçamentos · ${data.orders.length} pedidos</p></div></div>
      </div>`;
    }

    return `<div class="settings-layout">
      <aside class="card card-pad settings-nav">${tabs.map(([key, label]) => `<button class="settings-tab ${settingsTab === key ? 'active' : ''}" data-settings-tab="${key}">${label}</button>`).join('')}</aside>
      <section class="card"><div class="card-header"><div><h2>${tabs.find(t => t[0] === settingsTab)?.[1]}</h2><p>Alterações são aplicadas aos próximos PDFs e mensagens.</p></div></div><div class="card-pad" style="padding-top:5px">${body}</div></section>
    </div>`;
  }

  function field(name, label, value, type = 'text', required = false, hint = '') {
    return `<div class="field"><label>${label}</label><input class="input" name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''}>${hint ? `<small>${hint}</small>` : ''}</div>`;
  }

  function emptyState(icon, title, text, buttonLabel = '', action = '') {
    return `<div class="empty"><div class="empty-icon">${icon}</div><h3>${title}</h3><p>${text}</p>${buttonLabel ? `<button class="btn btn-primary" data-action="${action}">${buttonLabel}</button>` : ''}</div>`;
  }

