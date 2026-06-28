# CLAUDE.md — Contexte projet EntrepreneurPRO

> Fichier de contexte permanent lu au début de chaque session. Objectif : comprendre le projet
> instantanément, sans ré-explication. **Analyse le code avant d'agir — ne suppose pas.**

---

## 1. Le projet

**EntrepreneurPRO** : ERP/CRM souverain pour **2 auto-entrepreneurs** (Mickaël « Micka » + César).
Outil de pilotage d'activité (CA, contrats, trésorerie, dépenses, parcours clients), pensé pour 2
personnes — pas une multinationale. Le mot d'ordre est la **simplicité** et la **clarté des chiffres**.

**Stack (factuelle) :**
- **React 18** chargé en CDN (UMD `react` + `react-dom`).
- **JSX compilé dans le navigateur** par `@babel/standalone` — **pas de build, pas de bundler**.
- **Tailwind** via Play CDN (`cdn.tailwindcss.com`) — supporte les valeurs arbitraires `bg-[var(--surface)]`.
- **Chart.js 4** (UMD) pour les graphiques.
- **supabase-js 2** (UMD) — utilisé seulement en mode fallback (voir §5, `USE_LOCAL_API`).
- Tout l'UI vit dans **`index.html`** (~5700 lignes, un seul `<script type="text/babel">`).
- Logique data/métier extraite dans **`utils/`** et **`sync/`** (chargés en `<script>` AVANT Babel).

Scripts chargés dans `index.html` (ordre imposé, lignes 7-24) :
`react → react-dom → @babel/standalone@7.27.5 → tailwind → supabase → chart.js`
puis `sync/supabase.js → utils/constants → utils/formatters → utils/periods → utils/calculators →
sync/security → sync/backup → sync/storage → sync/entities`.

---

## 2. Pièges techniques CRITIQUES (à ne JAMAIS oublier)

- **Babel épinglé à `@babel/standalone@7.27.5`** (`index.html` **ligne 9**). Toute autre version (ex. 8.x)
  = **page blanche**. Ne jamais changer cette ligne. La revérifier après toute modif du `<head>`.
- **App SANS build** : une seule erreur de syntaxe JSX = **page blanche** (rien ne s'affiche).
  **Toujours COMPILER le JSX avec Babel 7.27.5 avant de livrer** (voir la commande en bas de §2).
- **NE JAMAIS toucher `sync/` sans extrême prudence** : c'est la couche de synchronisation
  (Supabase / API locale souveraine). Une régression ici peut corrompre ou désynchroniser les données
  des 2 associés. Si une tâche semble exiger d'y toucher, **le signaler et demander avant**.
- **Pas de nouvelle dépendance CDN.** Réutiliser les libs déjà chargées (Chart.js…) et les
  **composants existants** : `ChartBlock`, `ChartCanvas`, `KPICard`, `Card`, `CardHead`, `Modal`,
  `ConfirmModal`, `StatusBadge`, `EmptyState`, `Btn`, `Icon`/`ICONS`, `PeriodeFilter`, `CategoryField`…
- **Piège sync `config`** ⚠️ : `data.config` **n'est PAS sérialisé entièrement**.
  `sync/entities.js` → `syncConfigToTable()` (≈ l.287) n'écrit qu'une **liste blanche de colonnes** :
  `initial_balance`, `objectives`, `auto_entrepreneur_micka`, `auto_entrepreneur_cesar`, `assuje_tva`,
  `drive_links`. Au **chargement distant** (≈ l.595-606), `config` est **reconstruit à partir de ces
  seules colonnes**. → **Toute clé custom ajoutée à `config` (ex. `config.expenseCategories`) est
  écrite en localStorage mais PERDUE à la resync / au rechargement distant.** Pour persister une
  donnée nouvelle entre les 2 appareils sans toucher la DB, la rattacher à une entité **déjà
  synchronisée** (ex. la catégorie vit sur chaque dépense → « Option B », voir §4).

**Commande de compilation JSX (à lancer avant chaque livraison)** — extrait le `<script type="text/babel">`
d'`index.html` et le transforme avec Babel 7.27.5 (installé sous `/tmp/babeltest/node_modules`) :
```bash
S=$(grep -n 'type="text/babel"' index.html | head -1 | cut -d: -f1)
E=$(grep -n '^</script>' index.html | tail -1 | cut -d: -f1)
node -e "const B=require('/tmp/babeltest/node_modules/@babel/standalone');\
const l=require('fs').readFileSync('index.html','utf8').split('\n');\
try{B.transform(l.slice($S,$E-1).join('\n'),{presets:['react']});console.log('JSX OK')}\
catch(e){console.error('ERREUR:',e.message);process.exit(1)}"
```
(Si `@babel/standalone` n'est pas présent : `npm i @babel/standalone@7.27.5` dans un dossier scratch.)

---

## 3. Architecture

### Écrans actifs (10)
Définis dans `NAV_ITEMS` (`index.html`) + routés dans `renderModule()` (switch sur `activeModule`) :

| Écran | Module | Rôle |
|---|---|---|
| Dashboard | `Dashboard` | Snapshot opérationnel, widgets déplaçables/masquables, 2 graphes CA + multi-années |
| Pilotage | `PilotageModule` | Vue dirigeant : santé, alertes, rentabilité/URSSAF, listes d'action, croissance + graphe CA/client |
| CRM | `CRMModule` | Pipeline prospects → clients (liste + Kanban), timeline, potentiel vs CA |
| Contrats | `ContractsModule` | Cœur du revenu : contrats + échéancier paiements + suivi + OPCO |
| Trésorerie | `TresorerieModule` | Net par associé, compensation duo (qui doit à qui) |
| Grand Livre | `LedgerModule` | Journal unifié 4 sources, recherche + filtre + export CSV + drill-down |
| Banque & Frais | `BankModule` | CRUD transactions/dépenses/abonnements, solde, graphe Dépenses mensuelles |
| Tâches | `TasksModule` | Kanban À faire / En cours / Terminé |
| Parcours | `ParcoursModule` | Suivi formation OPCO (checklist 4 étapes) ou accompagnement mensuel |
| Drive & Liens | `DriveModule` | Bookmarks + onglet Configuration (objectifs CA, seuils AE/URSSAF) |

**Écrans retirés / débranchés :**
- **Devis (`QuotesModule`)** et **Facturation (`InvoicesModule`)** : **débranchés** du menu + du routeur
  (LOT 1). Le **code des composants et les données `data.quotes`/`data.invoices` sont CONSERVÉS** (inertes
  mais toujours persistés) → réversible en remettant l'entrée `NAV_ITEMS` + le `case` du routeur.
- **Analytics (`AnalyticsModule`)** : **supprimé** (LOT 2). Ses 3 graphes uniques ont été récupérés :
  « CA mensuel par année » → Dashboard, « Dépenses mensuelles » → Banque, « CA par client » → Pilotage.

### Fichiers clés
| Fichier | Rôle |
|---|---|
| `index.html` | Tout l'UI React/JSX + design system (`:root` tokens) + composants partagés + App/routeur |
| `utils/constants.js` | Constantes : `LS_KEY`, `EXPENSE_CATEGORIES`, `DASHBOARD_WIDGETS`, `PERIOD_SHORTCUTS`, `CRM_STAGES`, statuts, seuils… |
| `utils/formatters.js` | `fmt` (€), `genId`, `todayStr`, `formatDate`, `daysUntil`, `calcPaymentStatus`, `normalize`, `currentMonthKey`, `exportCSV` |
| `utils/periods.js` | `getPeriodeRange`, `inPeriode`, `buildPeriodeRange`, `loadUIPrefs`/`saveUIPrefs` |
| `utils/calculators.js` | `buildLedgerEntries` (grand livre unifié), `buildAlerts` |
| `sync/supabase.js` | Client de données : `USE_LOCAL_API=true` → API REST locale ; sinon supabase-js. ⚠️ ne pas casser l'interface `sb` |
| `sync/storage.js` | `INITIAL_DATA`, `securizeData`, `loadData`, `saveData`, `doExport`, `doImport` |
| `sync/entities.js` | Mapping app⇆tables SQL + fonctions `sync*ToTable` + chargement distant (**piège config §2**) |
| `sync/security.js`, `sync/backup.js` | Garde-fous (anti-démo, validation) + snapshots/logs de sync |
| `sql/` | Schémas SQL de référence (tables entités). `categorie TEXT` = texte libre, pas d'enum |

### Fonctions / calculs centraux
- **`buildLedgerEntries(data)`** (`utils/calculators.js`) — **source de vérité unique** de tous les flux.
  Fusionne transactions bancaires + dépenses (avances) + paiements de contrats + apports en une liste
  d'entrées `{date, montant, type:'bank'|'expense'|'contract'|'apport', assignedTo, imputéÀ, …}`.
  Paiements contrats = `montant` positif (entrées) ; dépenses = négatif ; achats banque = négatif.
- **`buildPeriodeRange(periodeId, dateDebut, dateFin)`** (`utils/periods.js`) — résout un id de période
  (`'tout'`, `'mois'`, `'yYYYY'`, `'mYYYY-MM'`, `'custom'`) en `{start, end}` (ou `null` pour « tout »).
- **`inPeriode(dateStr, range)`** — `true` si `!range || !dateStr` (voir piège date vide, §4), sinon
  test d'appartenance. **Ce comportement « date vide → true » est intentionnel, ne pas le changer.**
- **`byMonth(arr, getDate, getValue, monthKeys?)`** (global dans `index.html`) — agrège par mois `YYYY-MM` ;
  **ignore les dates vides** (`if(k.length===7)`). Sert aux graphes mensuels.
- Helpers date : `todayStr()` (YYYY-MM-DD), `formatDate()` (FR), `daysUntil()` (peut être `null`),
  `calcPaymentStatus(montant, payments)` → `'Non payé'|'Partiel'|'Payé'`.

---

## 4. Conventions de données (pièges métier appris)

- **Dates de contrats peu fiables** : `dateDebut`/`dateSignature` valent « aujourd'hui » par défaut à la
  création → ~32/43 contrats ont une `dateDebut` nulle mais une `dateSignature` valide.
  **Pour le CA signé par période, utiliser `c.dateSignature || c.dateDebut`** (jamais `dateDebut` seul).
  **Le CA encaissé est fiable** : il repose sur `p.date` des paiements (dates réelles de virement).
- **Données sans date** : `inPeriode(dateVide, range)` retourne **`true`** → ces entrées apparaissent dans
  **toutes** les périodes. Conséquence connue : 2 paiements sans date (≈ 3 850 €) gonflaient le KPI
  « CA encaissé » de chaque mois (le graphe, lui, via `byMonth`, les ignore). Vigilance sur tout **total
  par période** : une donnée non datée fuit partout. (Correctif définitif = dater la donnée, pas changer
  `inPeriode`.)
- **% d'évolution** : **toujours un garde-fou si base N-1 = 0 → afficher « — »**, jamais un pourcentage
  aberrant (cf. bug historique « +1922 % » quand la base signée était quasi vide). Modèle :
  `delta = (prev > 0) ? Math.round((cur - prev) / prev * 100) : null`.
- **« Option B » (catégories de dépenses)** : pas de stockage dédié. La liste = `EXPENSE_CATEGORIES`
  (7 défauts) ∪ catégories réellement présentes dans `data.expenses` + abonnements. Une catégorie perso
  est mémorisée **parce qu'elle vit sur la dépense** (colonne `categorie`, déjà synchronisée). Composant
  UI : `CategoryField` (select + bouton « + Nouvelle catégorie »). Évite le piège config (§2).

### Palette (design system, `:root` dans `index.html`)
| Token | Valeur | Usage |
|---|---|---|
| `--brand` | `#185FA5` | Indigo — CA signé, accents principaux |
| `--money` | `#0F6E56` | Émeraude foncé — **réservé aux montants encaissés** |
| `--money-bright` | `#1D9E75` | Émeraude vif — César, séries « encaissé » |
| `--amber` | `#BA7517` | Ambre — alertes douces, « reste à encaisser » |
| corail | `#E0654F` | Dépenses / négatifs |
| `--danger` | `#DC2626` | Erreurs, dépassements |

Règle couleurs graphes : CA signé = brand `#185FA5` · encaissé/César = émeraude `#1D9E75` ·
Micka = indigo · dépenses = corail `#E0654F`. Hausse = vert (`var(--money)`) / baisse = corail.

---

## 5. Workflow de déploiement (souverain)

- **Dépôt de référence = Gitea** (le serveur souverain déploie depuis **`main`**).
- **GitHub = dépôt de travail** ; branche de dev : **`claude/find-github-project-dSEZD`**.
- **Mode données** : `sync/supabase.js` → `USE_LOCAL_API = true`, API REST locale
  (`http://100.77.223.91:3333/api`, IP Tailscale privée — **injoignable depuis le sandbox de dev**).
  `false` = fallback supabase-js (identifiants conservés pour rollback).

**Cycle :**
1. **Claude Code** développe sur la branche `claude/find-github-project-dSEZD` et **pousse sur GitHub**
   (`git push -u origin claude/find-github-project-dSEZD`, retries avec backoff si erreur réseau).
2. **Le fondateur déploie** sur le serveur : `git fetch github` → `git checkout` de la branche →
   `grep` de la ligne Babel (vérif 7.27.5) → test en base / visuel → puis **grave sur Gitea `main`**.
3. **Ne PAS créer de PR** sauf demande explicite.

**Méthode de travail validée (à respecter) :**
- **Analyser AVANT de coder** — surtout pour tout ce qui touche aux chiffres ou au stockage. Présenter un
  plan, le faire valider, puis coder.
- **Un changement à la fois** pour ce qui touche les calculs/montants (commits petits et testables).
- **Tester en base / visuellement avant de graver** sur `main`.
- **Réutiliser les calculs existants** plutôt que recréer (le fondateur insiste : « réutilise, ne recrée pas »).
- **Un % fiable ou rien** — jamais un chiffre aberrant.
- Messages de commit en **français**, descriptifs ; footer `Co-Authored-By` + `Claude-Session`.

---

## Rappels rapides (checklist avant livraison)
- [ ] Babel toujours `@babel/standalone@7.27.5` (ligne 9) ?
- [ ] JSX compilé sans erreur (commande §2) ?
- [ ] `sync/` non touché (ou signalé + validé) ?
- [ ] Aucune nouvelle dépendance CDN ?
- [ ] Calculs existants réutilisés, garde-fous % (base 0 → « — ») ?
- [ ] Couleurs design-system (encaissé = `#0F6E56`/`#1D9E75`, dépenses = `#E0654F`) ?
- [ ] Commit sur `claude/find-github-project-dSEZD` + push GitHub ?
