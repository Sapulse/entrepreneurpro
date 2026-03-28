// ============================================================
// sync/entities.js — Phase A + Phase B (Option C)
// Phase A : double écriture vers les tables dédiées (app_data reste source principale)
// Phase B : lecture depuis les tables dédiées au montage (app_data = fallback si vide)
// TOUTES les fonctions sont silencieuses sur erreur — elles ne bloquent jamais l'app.
//
// Dépend de : supabase.js (sb), backup.js (addSyncLog)
// Chargé après storage.js
// ============================================================

// ------------------------------------------------------------------
// Helper : supprime les lignes d'une table dont l'id n'est plus dans currentIds
// ------------------------------------------------------------------
async function _deleteOrphans(table, currentIds) {
  if(currentIds.length === 0) {
    // Tout supprimer (cas extrême : collection vidée)
    await sb.from(table).delete().not('id', 'is', null);
    return;
  }
  const { data: existing } = await sb.from(table).select('id');
  const toDelete = (existing || []).map(r => r.id).filter(id => !currentIds.includes(id));
  if(toDelete.length > 0) {
    await sb.from(table).delete().in('id', toDelete);
  }
}

// ------------------------------------------------------------------
// clients  (Priorité 1)
// Mapping : app { id, entreprise, nom, email, telephone, source,
//                 etape, potentiel, notes, dateEntree }
//       → SQL { id, entreprise, contact, email, telephone, source,
//               etape, potentiel, notes, date_entree }
// ------------------------------------------------------------------
async function syncClientsToTable(clients) {
  if(!Array.isArray(clients)) return;
  try {
    const currentIds = clients.map(c => c.id);
    await _deleteOrphans('clients', currentIds);
    if(clients.length === 0) { addSyncLog('ENTITY_OK', 'clients ×0'); return; }
    const rows = clients.map(c => ({
      id:          c.id,
      entreprise:  c.entreprise  || '',
      contact:     c.nom         || c.contact || '',
      email:       c.email       || '',
      telephone:   c.telephone   || c.phone   || '',
      source:      c.source      || '',
      etape:       c.etape       || c.stage   || '',
      potentiel:   typeof c.potentiel === 'number' ? c.potentiel : (c.crmScore || c.crm_score || 0),
      notes:       c.notes       || '',
      date_entree: c.dateEntree  || c.date_entree || null,
    }));
    const { error } = await sb.from('clients').upsert(rows);
    if(error) {
      console.warn('[ENTITIES] clients:', error.message);
      addSyncLog('ENTITY_ERR', `clients: ${error.code} ${error.message}`);
    } else {
      addSyncLog('ENTITY_OK', `clients ×${rows.length}`);
    }
  } catch(e) { console.warn('[ENTITIES] clients exception:', e.message); }
}

// ------------------------------------------------------------------
// contracts + contract_payments  (Priorité 2)
// Mapping contrat : app { id, clientId, client, prestation, montant,
//                         assignedTo, statut, dateSignature, dateDebut,
//                         dateFin, typePaiement, montantOPCO, statutOPCO,
//                         notes, payments:[], actions:[] }
//              → SQL contracts { id, client_id, client_name, prestation,
//                                montant, assigned_to, statut, date_signature,
//                                date_debut, date_fin, type_paiement,
//                                montant_opco, statut_opco, notes }
//
// Mapping paiement : app { id, montant, date, type, statut, auteur,
//                          opcoStatut, notes }  (structure à vérifier)
//               → SQL contract_payments { id, contract_id, montant, date,
//                                         type, statut, auteur, opco_statut, notes }
// ------------------------------------------------------------------
async function syncContractsToTable(contracts) {
  if(!Array.isArray(contracts)) return;
  try {
    const currentIds = contracts.map(c => c.id);
    await _deleteOrphans('contracts', currentIds);
    if(contracts.length === 0) { addSyncLog('ENTITY_OK', 'contracts ×0 payments ×0'); return; }
    const contractRows = contracts.map(c => ({
      id:             c.id,
      client_id:      c.clientId      || null,
      client_name:    c.client        || '',
      prestation:     c.prestation    || c.titre || '',
      montant:        typeof c.montant === 'number' ? c.montant : 0,
      assigned_to:    c.assignedTo    || c.assignee || '',
      statut:         c.statut        || 'En cours',
      date_signature: c.dateSignature || null,
      date_debut:     c.dateDebut     || null,
      date_fin:       c.dateFin       || null,
      type_paiement:  c.typePaiement  || '',
      montant_opco:   typeof c.montantOPCO === 'number' ? c.montantOPCO : 0,
      statut_opco:    c.statutOPCO    || '',
      notes:          c.notes         || '',
    }));

    const { error: cErr } = await sb.from('contracts').upsert(contractRows);
    if(cErr) {
      console.warn('[ENTITIES] contracts:', cErr.message);
      addSyncLog('ENTITY_ERR', `contracts: ${cErr.code} ${cErr.message}`);
      return;
    }

    // Paiements liés aux contrats
    const paymentRows = contracts.flatMap(c =>
      (c.payments || []).map(p => ({
        id:          p.id,
        contract_id: c.id,
        montant:     typeof p.montant === 'number' ? p.montant : (typeof p.amount === 'number' ? p.amount : 0),
        date:        p.date        || null,
        type:        p.type        || '',
        statut:      p.statut      || p.status || '',
        auteur:      p.auteur      || p.author || '',
        opco_statut: p.opcoStatut  || p.opco_statut || p.statutOPCO || '',
        notes:       p.notes       || '',
      }))
    );
    // Sync payments : supprime les paiements orphelins, upsert les actuels
    const allPaymentIds = paymentRows.map(p => p.id);
    await _deleteOrphans('contract_payments', allPaymentIds);
    if(paymentRows.length > 0) {
      const { error: pErr } = await sb.from('contract_payments').upsert(paymentRows);
      if(pErr) console.warn('[ENTITIES] contract_payments:', pErr.message);
    }

    addSyncLog('ENTITY_OK', `contracts ×${contractRows.length} payments ×${paymentRows.length}`);
  } catch(e) { console.warn('[ENTITIES] contracts exception:', e.message); }
}

// ------------------------------------------------------------------
// bank.transactions  (Priorité 3)
// Mapping : app { id, label, montant, type, date, auteur, imputéÀ, statut }
//       → SQL { id, label, montant, type, date, auteur, impute_a, statut }
// ------------------------------------------------------------------
async function syncBankTxToTable(transactions) {
  if(!Array.isArray(transactions)) return;
  try {
    const currentIds = transactions.map(tx => tx.id);
    await _deleteOrphans('bank_transactions', currentIds);
    if(transactions.length === 0) { addSyncLog('ENTITY_OK', 'bank_transactions ×0'); return; }
    const rows = transactions.map(tx => ({
      id:       tx.id,
      label:    tx.label    || '',
      montant:  typeof tx.montant === 'number' ? tx.montant : 0,
      type:     tx.type     || '',
      date:     tx.date     || null,
      auteur:   tx.auteur   || '',
      // Le champ a un accent dans l'app — on accepte les deux formes
      impute_a: tx['imputéÀ'] || tx.imputeA || tx.impute_a || '',
      statut:   tx.statut   || '',
    }));
    const { error } = await sb.from('bank_transactions').upsert(rows);
    if(error) {
      console.warn('[ENTITIES] bank_transactions:', error.message);
      addSyncLog('ENTITY_ERR', `bank_tx: ${error.code} ${error.message}`);
    } else {
      addSyncLog('ENTITY_OK', `bank_transactions ×${rows.length}`);
    }
  } catch(e) { console.warn('[ENTITIES] bank_transactions exception:', e.message); }
}

// ------------------------------------------------------------------
// expenses  (Priorité 4)
// Mapping : app { id, titre, montant, categorie, payePar, date,
//                 refacturable, notes }
//       → SQL { id, label, montant, categorie, paye_par, date,
//               refacturable, notes }
// ------------------------------------------------------------------
async function syncExpensesToTable(expenses) {
  if(!Array.isArray(expenses)) return;
  try {
    const currentIds = expenses.map(e => e.id);
    await _deleteOrphans('expenses', currentIds);
    if(expenses.length === 0) { addSyncLog('ENTITY_OK', 'expenses ×0'); return; }
    const rows = expenses.map(e => ({
      id:           e.id,
      label:        e.titre       || e.label || '',
      montant:      typeof e.montant === 'number' ? e.montant : 0,
      categorie:    e.categorie   || '',
      paye_par:     e.payePar     || e.paye_par || '',
      date:         e.date        || null,
      refacturable: Boolean(e.refacturable),
      notes:        e.notes       || '',
    }));
    const { error } = await sb.from('expenses').upsert(rows);
    if(error) {
      console.warn('[ENTITIES] expenses:', error.message);
      addSyncLog('ENTITY_ERR', `expenses: ${error.code} ${error.message}`);
    } else {
      addSyncLog('ENTITY_OK', `expenses ×${rows.length}`);
    }
  } catch(e) { console.warn('[ENTITIES] expenses exception:', e.message); }
}

// ------------------------------------------------------------------
// tasks  (Priorité 5)
// Mapping : app { id, titre, client, assignedTo, statut, priorite,
//                 echeance, notes }
//       → SQL { id, titre, client_name, assigned_to, statut, priorite,
//               echeance, notes }
// ------------------------------------------------------------------
async function syncTasksToTable(tasks) {
  if(!Array.isArray(tasks)) return;
  try {
    const currentIds = tasks.map(t => t.id);
    await _deleteOrphans('tasks', currentIds);
    if(tasks.length === 0) { addSyncLog('ENTITY_OK', 'tasks ×0'); return; }
    const rows = tasks.map(t => ({
      id:          t.id,
      titre:       t.titre       || '',
      client_name: t.client      || '',
      assigned_to: t.assignedTo  || t.assigned_to || '',
      statut:      t.statut      || 'À faire',
      priorite:    t.priorite    || 'Moyenne',
      echeance:    t.echeance    || null,
      notes:       t.notes       || '',
    }));
    const { error } = await sb.from('tasks').upsert(rows);
    if(error) {
      console.warn('[ENTITIES] tasks:', error.message);
      addSyncLog('ENTITY_ERR', `tasks: ${error.code} ${error.message}`);
    } else {
      addSyncLog('ENTITY_OK', `tasks ×${rows.length}`);
    }
  } catch(e) { console.warn('[ENTITIES] tasks exception:', e.message); }
}

// ------------------------------------------------------------------
// bank.subscriptions  (Priorité 6)
// Mapping : app { id, label, montant, frequence, auteur, actif }
//       → SQL { id, label, montant, frequence, auteur, actif }
// ------------------------------------------------------------------
async function syncSubscriptionsToTable(subscriptions) {
  if(!Array.isArray(subscriptions)) return;
  try {
    const currentIds = subscriptions.map(s => s.id);
    await _deleteOrphans('bank_subscriptions', currentIds);
    if(subscriptions.length === 0) { addSyncLog('ENTITY_OK', 'subscriptions ×0'); return; }
    const rows = subscriptions.map(s => ({
      id:        s.id,
      label:     s.label     || '',
      montant:   typeof s.montant === 'number' ? s.montant : 0,
      frequence: s.frequence || s.frequency || '',
      auteur:    s.auteur    || s.assignee  || '',
      actif:     s.actif !== undefined ? Boolean(s.actif) : true,
    }));
    const { error } = await sb.from('bank_subscriptions').upsert(rows);
    if(error) {
      console.warn('[ENTITIES] bank_subscriptions:', error.message);
      addSyncLog('ENTITY_ERR', `subscriptions: ${error.code} ${error.message}`);
    } else {
      addSyncLog('ENTITY_OK', `subscriptions ×${rows.length}`);
    }
  } catch(e) { console.warn('[ENTITIES] subscriptions exception:', e.message); }
}

// ------------------------------------------------------------------
// app_config + bank.initialBalance  (Priorité 8 — last)
// ------------------------------------------------------------------
async function syncConfigToTable(config, bank) {
  if(!config) return;
  try {
    const row = {
      id:                      1,
      initial_balance:         typeof bank?.initialBalance === 'number' ? bank.initialBalance : 0,
      objectives:              config.objectives            || {},
      auto_entrepreneur_micka: config.autoEntrepreneurMicka || config.autoEntrepreneur || {},
      auto_entrepreneur_cesar: config.autoEntrepreneurCesar || {},
      assuje_tva:              Boolean(config.autoEntrepreneur?.assujeTVA),
      drive_links:             config.driveLinks            || {},
    };
    const { error } = await sb.from('app_config').upsert([row]);
    if(error) {
      console.warn('[ENTITIES] app_config:', error.message);
      addSyncLog('ENTITY_ERR', `config: ${error.code} ${error.message}`);
    } else {
      addSyncLog('ENTITY_OK', 'app_config synced');
    }
  } catch(e) { console.warn('[ENTITIES] app_config exception:', e.message); }
}

// ------------------------------------------------------------------
// quotes  (Priorité 7a)
// Stocke les colonnes indexées + objet complet en JSONB pour round-trip sans perte
// ------------------------------------------------------------------
async function syncQuotesToTable(quotes) {
  if(!Array.isArray(quotes)) return;
  try {
    const currentIds = quotes.map(q => q.id);
    await _deleteOrphans('quotes', currentIds);
    if(quotes.length === 0) { addSyncLog('ENTITY_OK', 'quotes ×0'); return; }
    const rows = quotes.map(q => ({
      id:              q.id,
      client_id:       q.clientId       || null,
      contract_id:     q.contractId     || null,
      titre:           q.titre          || '',
      statut:          q.statut         || 'Brouillon',
      montant:         typeof q.montant === 'number' ? q.montant : 0,
      date_creation:   q.dateCreation   || null,
      date_expiration: q.dateExpiration || null,
      notes:           q.notes          || '',
      data:            q,
    }));
    const { error } = await sb.from('quotes').upsert(rows);
    if(error) {
      console.warn('[ENTITIES] quotes:', error.message);
      addSyncLog('ENTITY_ERR', `quotes: ${error.code} ${error.message}`);
    } else {
      addSyncLog('ENTITY_OK', `quotes ×${rows.length}`);
    }
  } catch(e) { console.warn('[ENTITIES] quotes exception:', e.message); }
}

// ------------------------------------------------------------------
// invoices  (Priorité 7b)
// ------------------------------------------------------------------
async function syncInvoicesToTable(invoices) {
  if(!Array.isArray(invoices)) return;
  try {
    const currentIds = invoices.map(i => i.id);
    await _deleteOrphans('invoices', currentIds);
    if(invoices.length === 0) { addSyncLog('ENTITY_OK', 'invoices ×0'); return; }
    const rows = invoices.map(i => ({
      id:           i.id,
      client_id:    i.clientId     || null,
      contract_id:  i.contractId   || null,
      titre:        i.titre        || '',
      statut:       i.statut       || 'Non envoyée',
      montant:      typeof i.montant === 'number' ? i.montant : 0,
      date_emission: i.dateEmission || null,
      date_echeance: i.dateEcheance || null,
      notes:        i.notes        || '',
      data:         i,
    }));
    const { error } = await sb.from('invoices').upsert(rows);
    if(error) {
      console.warn('[ENTITIES] invoices:', error.message);
      addSyncLog('ENTITY_ERR', `invoices: ${error.code} ${error.message}`);
    } else {
      addSyncLog('ENTITY_OK', `invoices ×${rows.length}`);
    }
  } catch(e) { console.warn('[ENTITIES] invoices exception:', e.message); }
}

// ------------------------------------------------------------------
// Phase B — Lecture depuis les tables entité au montage
// Retourne l'objet data complet (même structure que app_data.data)
// Retourne null si les tables sont vides ou inaccessibles → fallback app_data
// ------------------------------------------------------------------
async function loadFromEntityTables() {
  try {
    const [
      { data: clientRows,   error: e1 },
      { data: contractRows, error: e2 },
      { data: paymentRows,  error: e3 },
      { data: txRows,       error: e4 },
      { data: expenseRows,  error: e5 },
      { data: taskRows,     error: e6 },
      { data: subRows,      error: e7 },
      { data: quoteRows,    error: e8 },
      { data: invoiceRows,  error: e9 },
      { data: configRow,    error: e10 },
    ] = await Promise.all([
      sb.from('clients').select('*'),
      sb.from('contracts').select('*'),
      sb.from('contract_payments').select('*'),
      sb.from('bank_transactions').select('*'),
      sb.from('expenses').select('*'),
      sb.from('tasks').select('*'),
      sb.from('bank_subscriptions').select('*'),
      sb.from('quotes').select('*'),
      sb.from('invoices').select('*'),
      sb.from('app_config').select('*').eq('id', 1).single(),
    ]);

    // Tables critiques inaccessibles → fallback app_data
    if(e1 || e2) {
      addSyncLog('ENTITY_LOAD_ERR', `${e1?.message || e2?.message}`);
      return null;
    }

    // Tables vides = Phase A pas encore exécutée → fallback app_data
    const totalRows = (clientRows?.length || 0) + (contractRows?.length || 0);
    if(totalRows === 0) return null;

    // clients : SQL contact → app nom
    const clients = (clientRows || []).map(r => ({
      id:         r.id,
      entreprise: r.entreprise  || '',
      nom:        r.contact     || '',
      email:      r.email       || '',
      telephone:  r.telephone   || '',
      source:     r.source      || '',
      etape:      r.etape       || '',
      potentiel:  r.potentiel   || 0,
      notes:      r.notes       || '',
      dateEntree: r.date_entree || null,
      actions:    [],
    }));

    // contracts : colonnes SQL → champs app
    const contracts = (contractRows || []).map(c => ({
      id:            c.id,
      clientId:      c.client_id      || null,
      client:        c.client_name    || '',
      prestation:    c.prestation     || '',
      montant:       c.montant        || 0,
      statut:        c.statut         || 'En cours',
      assignedTo:    c.assigned_to    || '',
      impute:        c.impute         || '',
      dateSignature: c.date_signature || null,
      dateDebut:     c.date_debut     || null,
      dateFin:       c.date_fin       || null,
      typePaiement:  c.type_paiement  || '',
      montantOPCO:   c.montant_opco   || 0,
      statutOPCO:    c.statut_opco    || '',
      notes:         c.notes          || '',
      payments: (paymentRows || [])
        .filter(p => p.contract_id === c.id)
        .map(p => ({
          id:        p.id,
          montant:   p.montant    || 0,
          date:      p.date       || null,
          type:      p.type       || '',
          statut:    p.statut     || '',
          auteur:    p.auteur     || '',
          opcoStatut: p.opco_statut || '',
          notes:     p.notes      || '',
        })),
      actions: [],
    }));

    // bank_transactions : impute_a → imputéÀ ; auteur accepté des deux colonnes
    const transactions = (txRows || []).map(t => ({
      id:         t.id,
      label:      t.label     || '',
      montant:    t.montant   || 0,
      type:       t.type      || '',
      date:       t.date      || null,
      auteur:     t.auteur    || t.assignee || '',
      'imputéÀ':  t.impute_a  || t.impute   || '',
      contractId: t.contract_id || null,
      notes:      t.notes     || '',
    }));

    // expenses : label → titre ; paye_par → payePar
    const expenses = (expenseRows || []).map(e => ({
      id:           e.id,
      titre:        e.label        || '',
      montant:      e.montant      || 0,
      categorie:    e.categorie    || '',
      payePar:      e.paye_par     || '',
      impute:       e.impute       || '',
      date:         e.date         || null,
      justificatif: e.justificatif || '',
      notes:        e.notes        || '',
    }));

    // tasks : client_name → client ; assigned_to → assignedTo
    const tasks = (taskRows || []).map(t => ({
      id:         t.id,
      titre:      t.titre       || '',
      statut:     t.statut      || 'À faire',
      priorite:   t.priorite    || 'Moyenne',
      assignedTo: t.assigned_to || '',
      echeance:   t.echeance    || null,
      contractId: t.contract_id || null,
      clientId:   t.client_id   || null,
      client:     t.client_name || '',
      notes:      t.notes       || '',
    }));

    // bank_subscriptions
    const subscriptions = (subRows || []).map(s => ({
      id:        s.id,
      label:     s.label     || '',
      montant:   s.montant   || 0,
      frequence: s.frequence || '',
      auteur:    s.auteur    || s.assignee || '',
      actif:     s.actif !== undefined ? s.actif : true,
      dateDebut: s.date_debut || null,
      notes:     s.notes     || '',
    }));

    // quotes : priorité au JSONB data pour round-trip sans perte
    const quotes = (quoteRows || []).map(q =>
      q.data ? { ...q.data, id: q.id } : {
        id:             q.id,
        clientId:       q.client_id       || null,
        contractId:     q.contract_id     || null,
        titre:          q.titre           || '',
        statut:         q.statut          || 'Brouillon',
        montant:        q.montant         || 0,
        dateCreation:   q.date_creation   || null,
        dateExpiration: q.date_expiration || null,
        notes:          q.notes           || '',
      }
    );

    // invoices : priorité au JSONB data
    const invoices = (invoiceRows || []).map(i =>
      i.data ? { ...i.data, id: i.id } : {
        id:           i.id,
        clientId:     i.client_id     || null,
        contractId:   i.contract_id   || null,
        titre:        i.titre         || '',
        statut:       i.statut        || 'Non envoyée',
        montant:      i.montant       || 0,
        dateEmission: i.date_emission || null,
        dateEcheance: i.date_echeance || null,
        notes:        i.notes         || '',
      }
    );

    // app_config → config + bank.initialBalance
    const cfg = configRow || {};
    const config = {
      driveLinks:            cfg.drive_links              || {},
      objectives:            cfg.objectives               || { mickaCAAnnuel: 0, cesarCAAnnuel: 0 },
      autoEntrepreneur:      {
        ...(cfg.auto_entrepreneur_micka || { seuil: 77700, tauxURSSAF: 22 }),
        assujeTVA: cfg.assuje_tva || false,
      },
      autoEntrepreneurMicka: cfg.auto_entrepreneur_micka  || { seuil: 77700, tauxURSSAF: 22 },
      autoEntrepreneurCesar: cfg.auto_entrepreneur_cesar  || { seuil: 77700, tauxURSSAF: 22 },
    };

    addSyncLog('ENTITY_LOAD_OK',
      `clients=${clients.length} contracts=${contracts.length} tx=${transactions.length} tasks=${tasks.length}`);

    return {
      schemaVersion: 3,
      clients,
      contracts,
      tasks,
      expenses,
      quotes,
      invoices,
      bank: {
        initialBalance: cfg.initial_balance || 0,
        transactions,
        subscriptions,
      },
      config,
    };
  } catch(e) {
    addSyncLog('ENTITY_LOAD_ERR', e.message);
    return null;
  }
}
