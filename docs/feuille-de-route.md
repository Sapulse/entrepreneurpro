# EntrepreneurPRO — Feuille de route d'amélioration

*Document de travail établi à partir du retour terrain de Mickaël (parcours complet de l'app, 8 écrans).*
*Référence pour les prochaines sessions. À amender au fil de l'avancement.*

---

## Déjà fait (rappel)

Les lots livrés et gravés dans Gitea à ce jour :

1. Correction du bug des dates (« Invalid Date »)
2. Labels « Supabase » → « Serveur local »
3. Sidebar allégée (menu Réglages repliable)
4. Raccourci « + Paiement » sur le Dashboard (8 clics → 3)
5. Navigation regroupée en 6 univers (Clients & Ventes, Finances…)
6. Bloc « Suivi de facturation » (créances, sans double comptage)
7. Clarification prospect/client (champ Potentiel conditionnel)
8. Nettoyage de l'affichage de version (titres nets, « V31 » discret)
9. Collecte du champ « Source » améliorée (fin du défaut « Autre » imposé)

Plus : assainissement du circuit Git (Gitea souverain), neutralisation du piège Babel 8, recette UX Claude Chrome (8,5/10).

---

## Le fil conducteur du retour terrain

Trois grandes idées ressortent de l'ensemble des remarques :

1. **« Trop de chiffres bruts, pas assez de sens. »** Plusieurs écrans (Dashboard, Pilotage, Analytics) empilent des indicateurs. Le besoin : moins d'empilement, plus de lecture claire et expliquée. Les explications déjà présentes (ex. net estimé après URSSAF) sont appréciées — il en faut plus de ce type, et moins de chiffres juxtaposés sans hiérarchie.

2. **« Certains modules collent-ils à notre façon de travailler à deux ? »** Mickaël et César se répartissent : César gère les factures, Mickaël prend les clients en contrat. D'où la question légitime sur l'utilité réelle des modules Facturation et Devis dans *leur* usage.

3. **« Les Tâches devraient refléter nos vrais process. »** Besoin d'un suivi par **parcours** (formation OPCO, accompagnement mensuel) plutôt qu'une simple liste de tâches. Léger et rapide avant tout.

---

## Feuille de route priorisée

### 🟢 Quick wins (rapides, peu de risque, utiles tout de suite)

**Q1 — Tris dans le CRM**
Ajouter des options de tri à la liste CRM : par date d'entrée (récent → ancien), par ordre alphabétique, par potentiel, par CA généré. Les filtres par étape existent déjà ; il manque le tri.
*Impact : confort quotidien. Effort : faible.*

**Q2 — Nettoyer le titre du Dashboard**
Retirer les mentions « (période) » qui n'apportent rien (« CA Signé (période) » → « CA Signé »). Le sélecteur de période est déjà visible à côté.
*Impact : clarté. Effort : très faible.*

**Q3 — Repositionner le sélecteur d'année**
Le choix d'année (en haut à droite) gagnerait à être mieux intégré au sélecteur de période (Ce mois / Trimestre / Tout…).
*Impact : cohérence. Effort : faible.*

**Q4 — Sélecteur de clients dans Devis**
Piocher le client dans la liste existante au lieu de le ressaisir (déjà identifié à l'audit initial).
*Impact : confort. Effort : faible.*
*Note : à conditionner à la décision sur l'avenir du module Devis (voir C2).*

### 🟡 Améliorations de fond (clarté, densité)

**M1 — Dashboard : un graphique mois par mois**
Remplacer le bloc « Flux financiers » (Entrées/Sorties/Balance, qui fait doublon avec la Trésorerie) par **un seul graphique d'évolution mensuelle**. Plus parlant qu'un chiffre figé.
*Impact : fort (lisibilité). Effort : moyen.*

**M2 — Pilotage : ajouter la progression**
Enrichir la Vue Dirigeant avec la **comparaison vs périodes précédentes** (évolution du CA, de la marge…). Les données existent (l'historique mensuel remonte à 2024).
*Impact : fort (aide à la décision). Effort : moyen.*

**M3 — Nuancer le « Reste à encaisser »**
Point important soulevé : un contrat signé en juin qui démarre en septembre gonfle le « reste à encaisser » sans que ce soit imminent. Distinguer **à encaisser bientôt** (ce mois / trimestre) de **à encaisser plus tard**. Évite de surinterpréter un chiffre élevé.
*Impact : fort (justesse du pilotage). Effort : moyen.*

**M4 — Alléger Analytics**
Une dizaine de graphiques aujourd'hui, dont certains se recoupent ou sont vides (ex. « Dépenses par catégorie » = tout « Autre », faute de catégorisation). Garder les 3-4 graphiques qui parlent vraiment, retirer ou ranger le reste.
*Impact : moyen (clarté). Effort : moyen.*

**M5 — Densité Trésorerie / Grand Livre**
Ce sont de longues listes. Explorer un affichage plus respirant (pagination, regroupements, ou résumé en tête avant le détail).
*Impact : moyen. Effort : moyen.*

### 🔵 Gros chantiers (à concevoir avant de coder)

**C1 — Module Tâches → Suivi par parcours** ⭐
Le besoin le plus important du retour terrain. Repenser les Tâches comme un **suivi de parcours léger** :
- *Parcours formation OPCO* : convention préparée ? client appelé ? mails envoyés ? date de formation + jours financés ?
- *Parcours accompagnement mensuel* (ex. Solis Construction) : où j'en suis ce mois (« développe plan de chèque », « retour de Nico »…).
Contrainte clé : **ça doit être rapide à remplir**, ne pas devenir une corvée. Conception soignée à faire avant tout code.
*Impact : très fort (usage quotidien). Effort : élevé.*

**C2 — Décision modules Facturation & Devis**
Trancher leur place dans l'usage réel à deux (César facture, Mickaël contractualise). Options : garder tel quel / simplifier / masquer. Décision métier avant tout développement.
*Impact : structurel (clarté de l'app). Effort : décision puis ajustement.*

**C3 — Différenciation Dashboard / Pilotage**
Vérifier les vraies redondances entre les deux et clarifier les rôles (Dashboard = opérationnel, Pilotage = stratégique). Déjà identifié, en attente.
*Impact : moyen. Effort : moyen (analyse d'abord).*

### ⚪ Items techniques / soin

- **Bloc « Répartition par source »** dans le CRM (compteurs par source). Plus utile quand la donnée Source se sera enrichie avec les nouveaux clients.
- **Champs OPCO** : présents sans calcul derrière — à clarifier ou masquer.
- **Sécurité** : centraliser les mots de passe en clair (db.js, etc.) dans Vaultwarden.
- **Banque & Frais** : ajout d'abonnements récurrents (déjà fonctionnel, à fiabiliser le confort de saisie).
- **Configurer git user.name/email** sur le serveur (cosmétique).

---

## Ordre de bataille suggéré

Pour les prochaines sessions, une progression qui équilibre gains rapides et chantiers de fond :

1. **Session « quick wins »** : Q1 (tris CRM) + Q2 (titres) + Q3 (sélecteur année). Du visible, rapide, satisfaisant.
2. **Session « Dashboard plus clair »** : M1 (graphique mensuel) + M3 (nuance reste à encaisser).
3. **Session « Pilotage »** : M2 (progression) + C3 (différenciation Dashboard/Pilotage).
4. **Session dédiée « Tâches-parcours »** (C1) : le gros morceau, à concevoir tranquillement avec maquette.
5. **Décision modules** (C2) + ménage Analytics (M4).

---

## Méthode (rappel, ce qui marche)

- Audit/analyse avant de coder (comprendre la mécanique existante).
- Claude Code écrit → push GitHub → serveur récupère → push Gitea (référence souveraine).
- **Sauvegarde + vérification Babel 7.27.5 avant chaque déploiement.**
- **Test sur le serveur AVANT de graver dans Gitea** (app sans build = page blanche au moindre souci).
- Un lot validé avant le suivant. Export JSON régulier vers Nextcloud.

---

*Fin de la feuille de route — à faire vivre au fil des sessions.*
