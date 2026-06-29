-- ============================================================
-- Migration ADDITIVE — module Revenus récurrents (MRR)
--   recurring_revenues    : abonnements clients (montant fixe mensuel)
--   recurring_occurrences : échéancier attendu→encaissé (1 ligne / abo / mois)
--
-- Strictement additif et idempotent (CREATE ... IF NOT EXISTS).
-- Ne touche à AUCUNE table existante. Réexécutable sans effet.
-- Base LOCALE souveraine :
--   docker exec -i postgres psql -U sapulse -d entrepreneurpro -f - < ce_fichier
-- ============================================================

-- Abonnements clients (le "contrat" récurrent)
CREATE TABLE IF NOT EXISTS recurring_revenues (
  id           TEXT PRIMARY KEY,
  client_id    TEXT REFERENCES clients(id) ON DELETE SET NULL,
  client_name  TEXT DEFAULT '',          -- dénormalisé (app: client)
  label        TEXT DEFAULT '',          -- prestation / intitulé
  montant      NUMERIC DEFAULT 0,        -- montant fixe mensuel
  jour         INTEGER DEFAULT 1,        -- jour d'échéance (1-31)
  assigned_to  TEXT DEFAULT '',          -- bénéficiaire : Micka | César
  actif        BOOLEAN DEFAULT TRUE,
  date_debut   DATE,
  notes        TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Échéancier attendu→encaissé (1 ligne par abonnement par mois)
CREATE TABLE IF NOT EXISTS recurring_occurrences (
  id                TEXT PRIMARY KEY,
  recurring_id      TEXT REFERENCES recurring_revenues(id) ON DELETE CASCADE,
  client_id         TEXT,                -- dénormalisé (résilient si abo supprimé)
  client_name       TEXT DEFAULT '',
  label             TEXT DEFAULT '',
  montant           NUMERIC DEFAULT 0,
  mois              TEXT DEFAULT '',     -- 'YYYY-MM' (clé d'idempotence)
  assigned_to       TEXT DEFAULT '',
  statut            TEXT DEFAULT 'attendu',   -- 'attendu' | 'encaissé'
  date_encaissement DATE,               -- date réelle saisie au paiement
  notes             TEXT DEFAULT '',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recocc_recurring ON recurring_occurrences(recurring_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_recocc_rec_mois ON recurring_occurrences(recurring_id, mois);
