// ============================================================
// sync/storage.js — Persistance & synchronisation Supabase
// Couche critique : tout accès données passe par ici.
// Dépend de : supabase.js (sb), security.js (validateBeforeWrite, isDemoData, persistRemoteSize, _onSyncStatusChange),
//             backup.js (addSyncLog), constants.js (LS_KEY), formatters.js (todayStr)
//             — toutes résolutions à l'appel, pas à la définition
// ============================================================

// Structure de données vide et saine — SANS données de démo (V21)
const INITIAL_DATA = {
  schemaVersion: 3,
  contracts: [],
  clients: [],
  tasks: [],
  expenses: [],
  quotes: [],
  invoices: [],
  bank: { initialBalance: 0, transactions: [], subscriptions: [] },
  config: {
    driveLinks: {},
    objectives: {mickaCAAnnuel:0, cesarCAAnnuel:0},
    autoEntrepreneur: {seuil:77700, tauxURSSAF:22, assujeTVA:false},
    autoEntrepreneurMicka: {seuil:77700, tauxURSSAF:22},
    autoEntrepreneurCesar: {seuil:77700, tauxURSSAF:22}
  }
};

// Assure la cohérence structurelle d'un dataset — ne jamais bypasser
function securizeData(d) {
  if(!d) d = {};
  if(!Array.isArray(d.contracts)) d.contracts = [];
  if(!Array.isArray(d.clients)) d.clients = [];
  if(!Array.isArray(d.tasks)) d.tasks = [];
  if(!Array.isArray(d.expenses)) d.expenses = [];
  if(!Array.isArray(d.quotes)) d.quotes = [];
  if(!Array.isArray(d.invoices)) d.invoices = [];
  if(!d.bank) d.bank = {initialBalance:0, transactions:[], subscriptions:[]};
  if(typeof d.bank.initialBalance !== 'number') d.bank.initialBalance = 0;
  if(!Array.isArray(d.bank.transactions)) d.bank.transactions = [];
  if(!Array.isArray(d.bank.subscriptions)) d.bank.subscriptions = [];
  if(!d.config) d.config = {driveLinks:{}};
  if(!d.config.driveLinks) d.config.driveLinks = {};
  if(!d.config.objectives) d.config.objectives = {mickaCAAnnuel:0, cesarCAAnnuel:0};
  if(!d.config.autoEntrepreneur) d.config.autoEntrepreneur = {seuil:77700, tauxURSSAF:22, assujeTVA:false};
  if(!d.config.autoEntrepreneurMicka) d.config.autoEntrepreneurMicka = {seuil:77700, tauxURSSAF:22};
  if(!d.config.autoEntrepreneurCesar) d.config.autoEntrepreneurCesar = {seuil:77700, tauxURSSAF:22};
  d.contracts.forEach(c => {
    if(!Array.isArray(c.payments)) c.payments = [];
    if(!Array.isArray(c.actions)) c.actions = [];
  });
  if((d.schemaVersion||0) < 3) d.schemaVersion = 3;
  return d;
}

// Chargement initial depuis localStorage — jamais de fallback sur données de démo (V21)
function loadData() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return securizeData({});
    const parsed = JSON.parse(raw);
    return securizeData(parsed);
  } catch(e) {
    console.warn('[SAFE-SYNC] localStorage corrompu, base locale vide utilisée');
    return securizeData({});
  }
}

// Écriture vers localStorage + Supabase avec validation obligatoire
// V24 : payload simplifié ({id,data} uniquement), détection des blocages silencieux RLS,
//       validation failures rendent syncStatus='error' (plus de silence)
function saveData(d) {
  // Écriture locale systématique
  try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch(e) {}

  // Seule garde absolue conservée : jamais écrire les données de démo
  if(isDemoData(d)) {
    console.error('[SAFE-SYNC] WRITE_BLOCKED — données de démo détectées');
    addSyncLog('WRITE_BLOCKED', 'DEMO_DATA');
    if(_onSyncStatusChange) _onSyncStatusChange('error'); // V24 : rendu visible
    return;
  }

  const size = JSON.stringify(d).length;
  console.log('[SAFE-SYNC] saveData → upsert Supabase, size=', size);

  (async () => {
    // V23 : vérification de version (uniquement si migration effectuée, _localVersion > 0)
    if(_localVersion > 0) {
      const { data: row } = await sb.from('app_data').select('version').eq('id', 1).single();
      if(row && typeof row.version === 'number' && row.version !== _localVersion) {
        addSyncLog('CONFLICT_DETECTED', `local_v=${_localVersion} remote_v=${row.version}`);
        if(_onSyncStatusChange) _onSyncStatusChange('conflict');
        return;
      }
    }

    // Payload minimal — seuls id et data, sans updated_at ni version (compatibles avec tout schéma)
    const payload = {id: 1, data: d};
    if(_localVersion > 0) {
      payload.version = (_localVersion || 0) + 1;
    }

    // V24 : .select('id') pour détecter les blocages silencieux RLS (Supabase renvoie [] sans erreur)
    const { data: result, error } = await sb.from('app_data').upsert(payload).select('id');

    if(error) {
      console.error('[SAFE-SYNC] Supabase upsert error:', error.code, error.message);
      addSyncLog('WRITE_ERROR', `${error.code}: ${error.message}`);
      if(_onSyncStatusChange) _onSyncStatusChange('error');
    } else if(!result || result.length === 0) {
      // RLS silencieux : upsert "réussi" mais aucune ligne affectée → permission refusée
      console.error('[SAFE-SYNC] Upsert silencieusement bloqué (RLS ?) — aucune ligne affectée');
      addSyncLog('WRITE_SILENT_BLOCK', `size=${size}B — vérifier les politiques RLS Supabase`);
      if(_onSyncStatusChange) _onSyncStatusChange('error');
    } else {
      if(_localVersion > 0) _localVersion = payload.version;
      persistRemoteSize(size);
      addSyncLog('WRITE_OK', `size=${size}B v=${_localVersion}`);
      console.log('[SAFE-SYNC] Sauvegarde Supabase OK, size=', size);
      if(_onSyncStatusChange) _onSyncStatusChange('ok');
    }
  })();
}

// Export JSON — téléchargement côté client
function doExport(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `entrepreneurpro_export_${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Import JSON — validation stricte avant acceptation (R2, R9)
function doImport(file, onSuccess, onError) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      // R9 : toutes les collections critiques sont requises
      const required = ['contracts','clients','tasks','expenses','bank','quotes','invoices'];
      for(const k of required) {
        if(!(k in parsed)) { onError('Fichier invalide : clé manquante « ' + k + ' »'); return; }
      }
      delete parsed.passwords;
      parsed.schemaVersion = 3;
      const secured = securizeData(parsed);
      // R2 : blocage absolu des données de démo avant toute modification locale
      if(isDemoData(secured)) {
        onError('Import bloqué : données de démonstration détectées dans le fichier');
        return;
      }
      onSuccess(secured);
    } catch(err) {
      onError('Erreur de parsing JSON : ' + err.message);
    }
  };
  reader.readAsText(file);
}
