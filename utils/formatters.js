// ============================================================
// utils/formatters.js — Fonctions utilitaires & formatage
// Aucune dépendance externe.
// ============================================================

const genId = () => 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2,5);
const todayStr = () => new Date().toISOString().split('T')[0];
const fmt = (n) => new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0);
const normalize = (s) => (s||'').trim().replace(/\s+/g,' ').toLowerCase();
const formatDate = (d) => d ? new Date(d+'T00:00:00').toLocaleDateString('fr-FR') : '';
const daysUntil = (dateStr) => { if(!dateStr) return null; return Math.ceil((new Date(dateStr+'T23:59:59')-new Date())/(1000*60*60*24)); };
const calcPaymentStatus = (montant, payments) => { const total=(payments||[]).reduce((s,p)=>s+(Number(p.montant)||0),0); if(total<=0)return'Non payé'; if(total>=montant)return'Payé'; return'Partiel'; };
const currentMonthKey = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };

function exportCSV(rows, filename) {
  const csv = rows.map(r => r.map(c => `"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}
