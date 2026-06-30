// ============================================================
// utils/formatters.js — Fonctions utilitaires & formatage
// Aucune dépendance externe.
// ============================================================

const genId = () => 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2,5);
const todayStr = () => new Date().toISOString().split('T')[0];
const fmt = (n) => new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0);
const normalize = (s) => (s||'').trim().replace(/\s+/g,' ').toLowerCase();
const formatDate = (d) => { if(!d) return ''; const s = String(d).includes('T') ? String(d) : d+'T00:00:00'; const dt = new Date(s); return isNaN(dt) ? '' : dt.toLocaleDateString('fr-FR'); };
// Normalise une date — ISO propre ("2026-06-30") OU timestamp base ("2026-06-30T00:00:00.000Z").
// slice(0,10) donne "2026-06-30" dans les deux cas, évitant le piège new Date(str+'T00:00:00')
// = Invalid Date sur un timestamp. Retourne null si vide/invalide (jamais de NaN en aval).
const toLocalDate = (dateStr, endOfDay=false) => { if(!dateStr) return null; const d = new Date(String(dateStr).slice(0,10) + (endOfDay ? 'T23:59:59' : 'T00:00:00')); return isNaN(d) ? null : d; };
const daysUntil = (dateStr) => { const d = toLocalDate(dateStr, true); if(!d) return null; return Math.ceil((d - new Date())/(1000*60*60*24)); };
const calcPaymentStatus = (montant, payments) => { const total=(payments||[]).reduce((s,p)=>s+(Number(p.montant)||0),0); if(total<=0)return'Non payé'; if(total>=montant)return'Payé'; return'Partiel'; };
const currentMonthKey = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };

function exportCSV(rows, filename) {
  const csv = rows.map(r => r.map(c => `"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}
