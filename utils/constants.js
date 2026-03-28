// ============================================================
// utils/constants.js — Constantes métier & UI
// Aucune dépendance externe. Chargé avant les autres modules.
// ============================================================

const APP_VERSION = "V24 – Sync multi-appareils fiabilisé";
const SCHEMA_VERSION = 3;
const LS_KEY = "entrepreneurpro_v14_data";
const UI_PREFS_KEY = "entrepreneurpro_ui_prefs";

// --- Statuts & types métier ---
const CONTRACT_STATUSES = ['En cours', 'Terminé', 'Annulé'];
const TASK_STATUSES = ['À faire', 'En cours', 'Terminé'];
const TASK_PRIORITIES = ['Haute', 'Moyenne', 'Basse'];
const CRM_STAGES = ['Contact', 'RDV 1', 'Devis', 'Négociation', 'Client'];
const ACTION_TYPES = ['Note', 'RDV', 'Appel', 'Email', 'Livraison', 'Relance'];
const TX_TYPES = ['Achat', 'Sortie', 'Apport', 'Entrée'];
const ASSIGNEES = ['Micka', 'César'];
const ASSIGNEES_AVEC_DEUX = ['Micka', 'César', 'Les deux'];
const IMPUTEES = ['Micka', 'César', 'Commun'];
const PAYMENT_AUTHORS = ['Micka', 'César', 'Client'];
const PAYMENT_TYPES = ['Virement', 'OPCO', 'Virement + OPCO', 'CB / Stripe', 'Espèces', 'Autre'];
const OPCO_STATUSES = ['En attente', 'Accepté', 'Refusé', 'Payé'];
const QUOTE_STATUSES = ['Brouillon', 'Envoyé', 'Accepté', 'Refusé', 'Expiré'];
const INVOICE_STATUSES = ['Non envoyée', 'Envoyée', 'Payée', 'En retard'];
const SOURCES = ['Réseaux sociaux', 'Site web', 'Réseautage', 'Recommandation', 'Démarchage mail', 'Démarchage téléphone', 'Autre'];
const EXPENSE_CATEGORIES = ['Transport', 'Repas', 'Logiciels', 'Matériel', 'Formation', 'Marketing', 'Autre'];
const PERIODS = [{id:'mois',label:'Ce mois'},{id:'mois_prec',label:'Mois préc.'},{id:'trimestre',label:'Trimestre'},{id:'annee',label:'Cette année'},{id:'tout',label:'Tout'}];

// --- Seuils auto-entrepreneur ---
const AUTO_ENTREPRENEUR_SEUIL = 77700;
const URSSAF_RATE = 0.22;

// --- Couleurs badges ---
const BADGE_COLORS = {
  'En cours': 'bg-blue-100 text-blue-700',
  'Terminé': 'bg-green-100 text-green-700',
  'Annulé': 'bg-red-100 text-red-700',
  'Non payé': 'bg-red-100 text-red-700',
  'Partiel': 'bg-amber-100 text-amber-700',
  'Payé': 'bg-teal-100 text-teal-700',
  'Surpayé': 'bg-red-200 text-red-800',
  'À faire': 'bg-slate-100 text-slate-700',
  'Validé': 'bg-green-100 text-green-700',
  'Contact': 'bg-slate-100 text-slate-700',
  'RDV 1': 'bg-blue-100 text-blue-700',
  'Devis': 'bg-amber-100 text-amber-700',
  'Négociation': 'bg-purple-100 text-purple-700',
  'Client': 'bg-green-100 text-green-700',
  'Haute': 'bg-red-100 text-red-700',
  'Moyenne': 'bg-amber-100 text-amber-700',
  'Basse': 'bg-green-100 text-green-700',
  'Micka': 'bg-indigo-100 text-indigo-700',
  'César': 'bg-emerald-100 text-emerald-700',
  'Les deux': 'bg-violet-100 text-violet-700',
  'Commun': 'bg-gray-100 text-gray-600',
  'En attente': 'bg-amber-100 text-amber-700',
  'Accepté': 'bg-green-100 text-green-700',
  'Refusé': 'bg-red-100 text-red-700',
  'OPCO': 'bg-purple-100 text-purple-700',
  'Virement': 'bg-blue-100 text-blue-700',
  'Virement + OPCO': 'bg-violet-100 text-violet-700',
  'CB / Stripe': 'bg-cyan-100 text-cyan-700',
  'Espèces': 'bg-lime-100 text-lime-700',
  'Brouillon': 'bg-gray-100 text-gray-600',
  'Envoyé': 'bg-blue-100 text-blue-700',
  'Expiré': 'bg-red-100 text-red-700',
  'Non envoyée': 'bg-gray-100 text-gray-600',
  'En retard': 'bg-red-100 text-red-700',
};

// --- Configuration dashboard ---
const DASHBOARD_WIDGETS = [
  {id:'kpis', label:'KPIs business'},
  {id:'seuil_ae', label:'Seuil Auto-Entrepreneur'},
  {id:'objectives', label:'Objectifs CA'},
  {id:'flux', label:'Flux financiers'},
  {id:'tresorerie', label:'Trésorerie réelle / projetée'},
  {id:'duo', label:'Trésorerie Duo'},
  {id:'reste', label:'Reste à encaisser'},
  {id:'urgents', label:'Dossiers urgents'},
];

const PERIOD_SHORTCUTS = [
  {id:'mois',label:'Ce mois'},{id:'mois_prec',label:'Mois préc.'},{id:'trimestre',label:'Trimestre'},
  {id:'annee',label:'Année'},{id:'tout',label:'Tout'},{id:'custom',label:'Perso.'}
];
