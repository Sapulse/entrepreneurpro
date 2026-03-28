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
// V23 : vérifie la version distante avant d'écrire (détection conflit multi-utilisateur)
// IMPORTANT : ne jamais appeler sans passer par le useEffect guard (syncStatus === 'ok')
function saveData(d) {
  // Écriture locale systématique
  try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch(e) {}

  // Validation obligatoire avant tout upsert distant
  const validation = validateBeforeWrite(d);
  if(!validation.ok) {
    console.error('[SAFE-SYNC]', validation.msg);
    addSyncLog('WRITE_BLOCKED', validation.reason);
    return;
  }

  const size = JSON.stringify(d).length;

  (async () => {
    // V23 : vérification de version pour détecter les conflits multi-utilisateur
    if(_localVersion > 0) {
      const { data: row } = await sb.from('app_data').select('version').eq('id', 1).single();
      if(row && typeof row.version === 'number' && row.version !== _localVersion) {
        addSyncLog('CONFLICT_DETECTED', `local_v=${_localVersion} remote_v=${row.version}`);
        if(_onSyncStatusChange) _onSyncStatusChange('conflict');
        return; // Écriture bloquée — l'utilisateur doit résoudre manuellement
      }
    }

    const newVersion = (_localVersion || 0) + 1;
    const { error } = await sb.from('app_data').upsert({
      id: 1, data: d, version: newVersion, updated_at: new Date().toISOString()
    });
    if(error) {
      console.error('[SAFE-SYNC] Supabase save error:', error);
      addSyncLog('WRITE_ERROR', error.message);
      if(_onSyncStatusChange) _onSyncStatusChange('error');
    } else {
      _localVersion = newVersion;
      persistRemoteSize(size);
      addSyncLog('WRITE_OK', `size=${size}B v=${newVersion}`);
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
