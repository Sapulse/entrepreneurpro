// ============================================================
// utils/calculators.js — Calculs métier centralisés
// Source de vérité unique pour le grand livre et les alertes.
// Dépend de : formatters.js (fmt, daysUntil), periods.js (inPeriode), constants.js (AUTO_ENTREPRENEUR_SEUIL)
// ============================================================

// Grand livre unifié — source de vérité unique pour tous les flux financiers
function buildLedgerEntries(data) {
  const entries = [];
  (data.bank.transactions||[]).filter(t=>t.statut!=='Annulé').forEach(t => {
    const isApport = t.type === 'Apport';
    entries.push({id:'bank_'+t.id, sourceId:t.id, type:isApport?'apport':'bank', date:t.date, label:t.label||'', montant:Number(t.montant)||0, auteur:t.auteur||'', source:isApport?'Apport':'Banque', category:'', imputéÀ:t.imputéÀ||'Commun'});
  });
  (data.expenses||[]).forEach(e => {
    entries.push({id:'exp_'+e.id, sourceId:e.id, type:'expense', date:e.date, label:e.titre||'', montant:-Math.abs(Number(e.montant)||0), auteur:e.payePar||'', source:'Avances', category:e.categorie||''});
  });
  (data.contracts||[]).forEach(c => {
    if(c.statut==='Annulé') return;
    (c.payments||[]).forEach(p => {
      const lesDeux = c.assignedTo === 'Les deux';
      const assignedTo = lesDeux ? (p.payAssignedTo || 'Micka') : c.assignedTo;
      const montantAbs = Math.abs(Number(p.montant)||0);
      if(lesDeux && !p.payAssignedTo) {
        entries.push({id:'pay_'+p.id+'_m', sourceId:p.id, type:'contract', date:p.date, label:`${c.client} – ${c.prestation}`, montant:montantAbs/2, auteur:'Client', source:'Contrats', category:'', contractId:c.id, assignedTo:'Micka', payNote:p.note||''});
        entries.push({id:'pay_'+p.id+'_c', sourceId:p.id, type:'contract', date:p.date, label:`${c.client} – ${c.prestation}`, montant:montantAbs/2, auteur:'Client', source:'Contrats', category:'', contractId:c.id, assignedTo:'César', payNote:p.note||''});
      } else {
        entries.push({id:'pay_'+p.id, sourceId:p.id, type:'contract', date:p.date, label:`${c.client} – ${c.prestation}`, montant:montantAbs, auteur:'Client', source:'Contrats', category:'', contractId:c.id, assignedTo:assignedTo, payNote:p.note||''});
      }
    });
  });
  return entries.sort((a,b)=>new Date(b.date)-new Date(a.date));
}

// Alertes métier calculées depuis les données
function buildAlerts(data) {
  const alerts = [];
  data.contracts.filter(c=>c.statut==='En cours'&&c.dateFin).forEach(c => {
    const days = daysUntil(c.dateFin);
    if(days !== null && days <= 7) {
      const urgency = days <= 0 ? 'danger' : 'warning';
      const label = days <= 0 ? 'dépassée !' : days === 0 ? "aujourd'hui" : `dans ${days}j`;
      alerts.push({id:'exp_'+c.id, type:urgency, icon:'📄', msg:`${c.client} – ${c.prestation} : échéance ${label}`, module:'contracts', deepLink:{id:c.id}});
    }
  });
  data.contracts.filter(c=>c.statut!=='Annulé').forEach(c => {
    const paid = (c.payments||[]).reduce((s,p)=>s+(Number(p.montant)||0),0);
    const reste = (Number(c.montant)||0) - paid;
    if(reste > 0 && c.dateFin && daysUntil(c.dateFin) !== null && daysUntil(c.dateFin) < -7) {
      alerts.push({id:'unpaid_'+c.id, type:'warning', icon:'💰', msg:`Impayé: ${fmt(reste)} – ${c.client}`, module:'contracts', deepLink:{id:c.id, tab:'paiements'}});
    }
  });
  const currentYear = new Date().getFullYear();
  const annualRange = {start:new Date(currentYear,0,1), end:new Date(currentYear,11,31,23,59,59)};
  const allLedger = buildLedgerEntries(data);
  const mickaCaAnnuel = allLedger.filter(e=>e.type==='contract'&&e.assignedTo==='Micka'&&inPeriode(e.date,annualRange)).reduce((s,e)=>s+e.montant,0);
  const cesarCaAnnuel = allLedger.filter(e=>e.type==='contract'&&e.assignedTo==='César'&&inPeriode(e.date,annualRange)).reduce((s,e)=>s+e.montant,0);
  const seuilMicka = data.config?.autoEntrepreneurMicka?.seuil || data.config?.autoEntrepreneur?.seuil || AUTO_ENTREPRENEUR_SEUIL;
  const seuilCesar = data.config?.autoEntrepreneurCesar?.seuil || data.config?.autoEntrepreneur?.seuil || AUTO_ENTREPRENEUR_SEUIL;
  [{name:'Micka', ca:mickaCaAnnuel, seuil:seuilMicka}, {name:'César', ca:cesarCaAnnuel, seuil:seuilCesar}].forEach(({name, ca, seuil}) => {
    const ratio = seuil > 0 ? ca/seuil : 0;
    if(ratio >= 1) alerts.push({id:`seuil_100_${name}`, type:'danger', icon:'🚨', msg:`${name}: Seuil AE DÉPASSÉ ! ${fmt(ca)} / ${fmt(seuil)}`, module:'dashboard'});
    else if(ratio >= 0.9) alerts.push({id:`seuil_90_${name}`, type:'warning', icon:'⚡', msg:`${name}: CA à ${Math.round(ratio*100)}% du seuil AE`, module:'dashboard'});
    else if(ratio >= 0.8) alerts.push({id:`seuil_80_${name}`, type:'info', icon:'📊', msg:`${name}: CA à ${Math.round(ratio*100)}% du seuil AE`, module:'dashboard'});
  });
  (data.quotes||[]).filter(q=>q.statut==='Envoyé'&&q.dateExpiration&&daysUntil(q.dateExpiration)<=3&&daysUntil(q.dateExpiration)>=0).forEach(q => {
    alerts.push({id:'qexp_'+q.id, type:'warning', icon:'📋', msg:`Devis expirant bientôt: ${q.client} (${fmt(q.montant)})`, module:'quotes'});
  });
  return alerts;
}
