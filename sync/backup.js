// ============================================================
// sync/backup.js — Sauvegardes locales, snapshots cloud & journal de sync
// Dépend de : security.js (lastRemoteDataSize, _localVersion, isDemoData, persistRemoteSize),
//             storage.js (securizeData), supabase.js (sb), constants.js (LS_KEY)
//             — toutes résolutions à l'appel, pas à la définition
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

// ============================================================
// V23 — SNAPSHOTS CLOUD (table app_snapshots, plan gratuit Supabase)
// ============================================================

const SNAPSHOT_MAX = 20; // Max snapshots conservés côté Supabase
const SNAPSHOT_SESSION_KEY = 'entrepreneurpro_snapshot_done'; // Une seule fois par session

// Crée un snapshot dans app_snapshots et élague les anciens au-delà de SNAPSHOT_MAX
async function createSnapshot(triggeredBy) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return;
    const data = JSON.parse(raw);

    const { error } = await sb.from('app_snapshots').insert({
      version: _localVersion || 0,
      triggered_by: triggeredBy,
      size_bytes: raw.length,
      data: data
    });
    if(error) { addSyncLog('SNAPSHOT_ERROR', error.message); return; }
    addSyncLog('SNAPSHOT_OK', `by=${triggeredBy} v=${_localVersion} size=${raw.length}B`);

    // Élagage : supprimer les snapshots au-delà de SNAPSHOT_MAX
    const { data: all } = await sb.from('app_snapshots').select('id').order('ts', {ascending: false});
    if(all && all.length > SNAPSHOT_MAX) {
      const toDelete = all.slice(SNAPSHOT_MAX).map(r => r.id);
      await sb.from('app_snapshots').delete().in('id', toDelete);
    }
  } catch(e) { console.warn('[SNAPSHOT] createSnapshot exception:', e); }
}

// Récupère la liste des snapshots (métadonnées seulement, pas la data)
async function listSnapshots() {
  try {
    const { data, error } = await sb.from('app_snapshots')
      .select('id, ts, version, triggered_by, size_bytes')
      .order('ts', {ascending: false})
      .limit(SNAPSHOT_MAX);
    if(error) return [];
    return data || [];
  } catch(e) { return []; }
}

// Restaure un snapshot : crée d'abord un snapshot de l'état actuel (filet de sécurité)
async function rollbackToSnapshot(snapshotId, onSuccess, onError) {
  try {
    // Sécurité : snapshot de l'état courant avant rollback
    await createSnapshot('pre-rollback');

    const { data: snap, error } = await sb.from('app_snapshots')
      .select('data')
      .eq('id', snapshotId)
      .single();
    if(error || !snap) { onError('Snapshot introuvable'); return; }

    const d = securizeData(snap.data);
    if(isDemoData(d)) { onError('Rollback bloqué : données de démo détectées dans ce snapshot'); return; }

    try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch(e) {}

    const newVersion = (_localVersion || 0) + 1;
    const { error: writeErr } = await sb.from('app_data').upsert({
      id: 1, data: d, version: newVersion, updated_at: new Date().toISOString()
    });
    if(writeErr) { onError(writeErr.message); return; }

    _localVersion = newVersion;
    persistRemoteSize(JSON.stringify(d).length);
    addSyncLog('ROLLBACK_OK', `snapshot_id=${snapshotId} v=${newVersion}`);
    onSuccess(d);
  } catch(e) {
    onError(e.message);
  }
}

// Retourne true si un snapshot de démarrage doit être créé cette session (une seule fois)
function shouldCreateStartupSnapshot() {
  try {
    if(sessionStorage.getItem(SNAPSHOT_SESSION_KEY)) return false;
    sessionStorage.setItem(SNAPSHOT_SESSION_KEY, '1');
    return true;
  } catch(e) { return false; }
}

// ============================================================
// V23 — EXPORT AUTOMATIQUE (rappel tous les 7 jours)
// ============================================================

const LS_LAST_EXPORT_KEY = 'entrepreneurpro_last_export';
const AUTO_EXPORT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

function shouldAutoExport() {
  try {
    const last = localStorage.getItem(LS_LAST_EXPORT_KEY);
    if(!last) return true;
    return (Date.now() - new Date(last).getTime()) > AUTO_EXPORT_INTERVAL_MS;
  } catch(e) { return false; }
}

function markExportDone() {
  try { localStorage.setItem(LS_LAST_EXPORT_KEY, new Date().toISOString()); } catch(e) {}
}
