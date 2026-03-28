// ============================================================
// sync/security.js — Sécurité des données & protection anti-corruption
// Couche critique : à auditer indépendamment.
// Aucune dépendance externe.
// ============================================================

// Empreintes de l'ancien jeu de données de démo — bloquées en production
const DEMO_FINGERPRINTS = {
  ids: new Set(['cl001','cl002','cl003','c001','c002','t001','t002','sub001','sub002','sub003','p001','a001','q001','q002','i001','i002']),
  names: ['TechCorp','StartupXYZ','BioMed Paris'],
  taskTitles: new Set(['Préparer devis TechCorp v2','Appel de suivi StartupXYZ'])
};

// Taille du dernier dataset distant connu — persistée entre sessions (R4)
const LS_REMOTE_SIZE_KEY = 'entrepreneurpro_remote_size';
let lastRemoteDataSize = (() => {
  try { return Math.max(0, parseInt(localStorage.getItem(LS_REMOTE_SIZE_KEY)||'0', 10)||0); } catch(e) { return 0; }
})();

function persistRemoteSize(size) {
  lastRemoteDataSize = size;
  try { localStorage.setItem(LS_REMOTE_SIZE_KEY, String(size)); } catch(e) {}
}

// Callback global pour mettre à jour syncStatus depuis les fonctions module-level (R3/R8)
let _onSyncStatusChange = null;

// Version de la ligne app_data connue localement — pour détection de conflit multi-utilisateur (V23)
let _localVersion = 0;
function setLocalVersion(v) { _localVersion = Math.max(0, parseInt(v) || 0); }

// Détecte si un dataset contient des empreintes de données de démo
function isDemoData(d) {
  if(!d) return false;
  for(const c of (d.contracts||[])) {
    if(DEMO_FINGERPRINTS.ids.has(c.id)) return true;
    if(DEMO_FINGERPRINTS.names.includes(c.client)) return true;
  }
  for(const c of (d.clients||[])) {
    if(DEMO_FINGERPRINTS.ids.has(c.id)) return true;
    if(DEMO_FINGERPRINTS.names.includes(c.entreprise)) return true;
  }
  for(const t of (d.tasks||[])) {
    if(DEMO_FINGERPRINTS.ids.has(t.id)) return true;
    if(DEMO_FINGERPRINTS.taskTitles.has(t.titre)) return true;
  }
  for(const s of (d.bank?.subscriptions||[])) if(DEMO_FINGERPRINTS.ids.has(s.id)) return true;
  for(const q of (d.quotes||[])) if(DEMO_FINGERPRINTS.ids.has(q.id)) return true;
  for(const i of (d.invoices||[])) if(DEMO_FINGERPRINTS.ids.has(i.id)) return true;
  return false;
}

// Valide qu'une écriture est sûre avant tout upsert vers Supabase
// Appelé systématiquement dans saveData() — ne jamais contourner.
function validateBeforeWrite(d) {
  // Blocage absolu : données de démo
  if(isDemoData(d)) {
    return {ok: false, reason: 'DEMO_DATA', msg: 'Écriture bloquée : données de démonstration détectées'};
  }
  // Blocage si régression de taille suspecte par rapport au dernier distant connu (R4)
  if(lastRemoteDataSize > 5000) {
    const localSize = JSON.stringify(d).length;
    if(localSize < lastRemoteDataSize * 0.4) {
      return {ok: false, reason: 'SIZE_REGRESSION', msg: `Écriture bloquée : dataset local (${localSize}B) beaucoup plus petit que le distant connu (${lastRemoteDataSize}B)`};
    }
  }
  return {ok: true};
}
