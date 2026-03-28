// ============================================================
// sync/entities.js — Double écriture Phase A (Option C coexistence)
// app_data reste la source de vérité pour les lectures.
// Ces fonctions copient les entités dans les tables dédiées en parallèle.
// TOUTES les fonctions sont silencieuses sur erreur — elles ne bloquent jamais l'app.
//
// Dépend de : supabase.js (sb), backup.js (addSyncLog)
// Chargé après storage.js
// ============================================================

// ------------------------------------------------------------------
// clients  (Priorité 1)
// Mapping : app { id, entreprise, nom, email, telephone, source,
//                 etape, potentiel, notes, dateEntree }
//       → SQL { id, entreprise, contact, email, telephone, source,
//               etape, potentiel, notes, date_entree }
// ------------------------------------------------------------------
async function syncClientsToTable(clients) {
  if(!Array.isArray(clients) || clients.length === 0) return;
  try {
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
  if(!Array.isArray(contracts) || contracts.length === 0) return;
  try {
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
  if(!Array.isArray(transactions) || transactions.length === 0) return;
  try {
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
  if(!Array.isArray(expenses) || expenses.length === 0) return;
  try {
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
  if(!Array.isArray(tasks) || tasks.length === 0) return;
  try {
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
  if(!Array.isArray(subscriptions) || subscriptions.length === 0) return;
  try {
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
