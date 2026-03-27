// ============================================================
// sync/backup.js — Sauvegardes locales versionnées & journal de sync
// Dépend de : security.js (lastRemoteDataSize), constants.js (LS_KEY) — résolution à l'appel
// ============================================================

// Sauvegardes locales versionnées — max 5 snapshots horodatés (R10)
const LS_BACKUP_KEY = 'entrepreneurpro_backups_v1';
const MAX_BACKUPS = 5;

function saveLocalBackup(d) {
  try {
    const backups = JSON.parse(localStorage.getItem(LS_BACKUP_KEY) || '[]');
    backups.unshift({ts: new Date().toISOString(), size: JSON.stringify(d).length, data: d});
    if(backups.length > MAX_BACKUPS) backups.length = MAX_BACKUPS;
    localStorage.setItem(LS_BACKUP_KEY, JSON.stringify(backups));
  } catch(e) { console.warn('[BACKUP] Snapshot local échoué:', e); }
}

function listLocalBackups() {
  try { return JSON.parse(localStorage.getItem(LS_BACKUP_KEY) || '[]'); } catch(e) { return []; }
}

// Journal de synchronisation — max 100 entrées (R12)
// Capture automatiquement lsMainSize + remoteKnownSize pour exploitabilité incident
const LS_SYNC_LOG_KEY = 'entrepreneurpro_sync_log';
const MAX_LOG = 100;

function addSyncLog(action, detail) {
  try {
    const lsMainSize = (() => { try { return (localStorage.getItem(LS_KEY)||'').length; } catch(e) { return -1; } })();
    const log = JSON.parse(localStorage.getItem(LS_SYNC_LOG_KEY) || '[]');
    log.unshift({ts: new Date().toISOString(), action, detail: String(detail||''), lsMainSize, remoteKnownSize: lastRemoteDataSize});
    if(log.length > MAX_LOG) log.length = MAX_LOG;
    localStorage.setItem(LS_SYNC_LOG_KEY, JSON.stringify(log));
  } catch(e) {}
}
