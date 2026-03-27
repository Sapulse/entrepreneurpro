// ============================================================
// utils/periods.js — Gestion des périodes & préférences UI
// Dépend de : rien (constants.js optionnel pour UI_PREFS_KEY)
// ============================================================

function getPeriodeRange(periode) {
  const now = new Date();
  const y = now.getFullYear(); const m = now.getMonth();
  if(periode==='mois') return {start:new Date(y,m,1), end:new Date(y,m+1,0,23,59,59)};
  if(periode==='mois_prec') return {start:new Date(y,m-1,1), end:new Date(y,m,0,23,59,59)};
  if(periode==='trimestre') { const q=Math.floor(m/3); return {start:new Date(y,q*3,1), end:new Date(y,q*3+3,0,23,59,59)}; }
  if(periode==='annee') return {start:new Date(y,0,1), end:new Date(y,11,31,23,59,59)};
  return null;
}

function inPeriode(dateStr, range) {
  if(!range||!dateStr) return true;
  const d = new Date(dateStr+'T00:00:00');
  return d >= range.start && d <= range.end;
}

// Support des modes 'custom' et 'yYYYY' (années spécifiques)
function buildPeriodeRange(periodeId, dateDebut, dateFin) {
  if(periodeId === 'custom') {
    if(!dateDebut && !dateFin) return null;
    const start = dateDebut ? new Date(dateDebut+'T00:00:00') : new Date(0);
    const end = dateFin ? new Date(dateFin+'T23:59:59') : new Date(8640000000000000);
    return {start, end};
  }
  if(periodeId && periodeId.startsWith('y')) {
    const y = parseInt(periodeId.slice(1), 10);
    if(!isNaN(y)) return {start:new Date(y,0,1), end:new Date(y,11,31,23,59,59)};
  }
  return getPeriodeRange(periodeId);
}

// Préférences UI — stockées séparément des données métier
function loadUIPrefs() {
  try { return JSON.parse(localStorage.getItem(UI_PREFS_KEY)||'{}'); } catch(e) { return {}; }
}
function saveUIPrefs(p) {
  try { localStorage.setItem(UI_PREFS_KEY, JSON.stringify(p)); } catch(e) {}
}
