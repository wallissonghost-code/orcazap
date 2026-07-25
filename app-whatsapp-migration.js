'use strict';

(function migrateLegacyWhatsAppLeads() {
  const leads = data.whatsapp?.leads;
  if (!Array.isArray(leads) || !leads.length) return;

  let changed = false;

  for (const lead of leads) {
    if (lead.quoteId || !lead.name || !lead.service) continue;

    const createdAt = lead.createdAt || nowIso();
    const normalizedName = String(lead.name).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let client = data.clients.find(item => String(item.name || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === normalizedName);

    if (!client) {
      client = {
        id: uid(),
        name: lead.name,
        phone: '',
        email: '',
        document: '',
        address: lead.location || '',
        notes: 'Cadastro criado automaticamente pelo atendimento WhatsApp.',
        createdAt
      };
      data.clients.push(client);
    }

    const quote = {
      id: uid(),
      number: nextQuoteNumber(),
      clientId: client.id,
      clientName: client.name,
      createdAt,
      updatedAt: nowIso(),
      validUntil: addDays(data.settings.defaultValidity || 7),
      status: 'draft',
      entryPercent: data.settings.defaultEntry ?? 50,
      discount: 0,
      notes: [
        'Solicitação recebida pelo atendimento WhatsApp.',
        `Serviço solicitado: ${lead.service}`,
        `Localização: ${lead.location || 'Não informada'}`,
        `Medidas ou quantidade: ${lead.quantity || 'Não informada'}`,
        `Prazo desejado: ${lead.deadline || 'Não informado'}`
      ].join('\n'),
      items: [{
        id: uid(),
        productId: '',
        name: lead.service,
        description: `${lead.quantity || ''}${lead.location ? ` — ${lead.location}` : ''}`,
        qty: 1,
        unit: 'un.',
        price: 0,
        cost: 0
      }],
      source: 'whatsapp',
      sourceLeadId: lead.id
    };

    lead.clientId = client.id;
    lead.quoteId = quote.id;
    lead.status = 'new';
    data.quotes.push(quote);
    activity(`Pré-orçamento ${quote.number} recuperado do WhatsApp para ${client.name}`);
    changed = true;
  }

  if (changed) saveData();
})();