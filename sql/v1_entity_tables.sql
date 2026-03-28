-- ============================================================
-- EntrepreneurPRO — Migration Option C : tables par entité
-- Version : v1 — Phase A (double écriture, app_data reste source principale)
--
-- À EXÉCUTER dans Supabase > SQL Editor
-- app_data(id=1) reste en place. Ces tables reçoivent les données
-- en parallèle via double écriture (sync/entities.js).
-- ============================================================

-- Extension uuid (optionnelle, ids sont déjà des TEXT)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Trigger updated_at automatique
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. CLIENTS  (Priorité 1)
-- app fields : id, entreprise, nom→contact, email, telephone,
--              source, etape, potentiel→potentiel, notes, dateEntree
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id          TEXT PRIMARY KEY,
  entreprise  TEXT DEFAULT '',
  contact     TEXT DEFAULT '',       -- app: nom
  email       TEXT DEFAULT '',
  telephone   TEXT DEFAULT '',       -- app: telephone (pas phone)
  source      TEXT DEFAULT '',
  etape       TEXT DEFAULT '',       -- app: etape (pas stage)
  potentiel   INTEGER DEFAULT 0,     -- app: potentiel (pas crm_score)
  notes       TEXT DEFAULT '',
  date_entree DATE,                  -- app: dateEntree
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 2. CONTRACTS  (Priorité 2)
-- app fields : id, clientId, client, prestation, montant,
--              assignedTo, statut, dateSignature, dateDebut, dateFin,
--              typePaiement, montantOPCO, statutOPCO, notes
-- ============================================================
CREATE TABLE IF NOT EXISTS contracts (
  id              TEXT PRIMARY KEY,
  client_id       TEXT REFERENCES clients(id) ON DELETE SET NULL,
  client_name     TEXT DEFAULT '',     -- app: client (dénormalisé)
  prestation      TEXT DEFAULT '',     -- app: prestation (pas titre)
  montant         NUMERIC DEFAULT 0,
  assigned_to     TEXT DEFAULT '',     -- app: assignedTo
  statut          TEXT DEFAULT 'En cours',
  date_signature  DATE,               -- app: dateSignature
  date_debut      DATE,               -- app: dateDebut
  date_fin        DATE,               -- app: dateFin
  type_paiement   TEXT DEFAULT '',     -- app: typePaiement
  montant_opco    NUMERIC DEFAULT 0,  -- app: montantOPCO
  statut_opco     TEXT DEFAULT '',    -- app: statutOPCO
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_contracts_updated_at
  BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2b. Paiements liés aux contrats
CREATE TABLE IF NOT EXISTS contract_payments (
  id          TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  montant     NUMERIC DEFAULT 0,
  date        DATE,
  type        TEXT DEFAULT '',
  statut      TEXT DEFAULT '',
  auteur      TEXT DEFAULT '',
  opco_statut TEXT DEFAULT '',
  notes       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. BANK_TRANSACTIONS  (Priorité 3)
-- app fields : id, label, montant, type, date, auteur, imputéÀ, statut
-- ============================================================
CREATE TABLE IF NOT EXISTS bank_transactions (
  id        TEXT PRIMARY KEY,
  label     TEXT DEFAULT '',
  montant   NUMERIC DEFAULT 0,
  type      TEXT DEFAULT '',   -- 'Achat' | 'Sortie' | 'Apport' | 'Entrée' | etc.
  date      DATE,
  auteur    TEXT DEFAULT '',
  impute_a  TEXT DEFAULT '',   -- app: imputéÀ (accent normalisé)
  statut    TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. EXPENSES  (Priorité 4)
-- app fields : id, titre→label, montant, categorie,
--              payePar→paye_par, date, refacturable, notes
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id           TEXT PRIMARY KEY,
  label        TEXT DEFAULT '',    -- app: titre
  montant      NUMERIC DEFAULT 0,
  categorie    TEXT DEFAULT '',
  paye_par     TEXT DEFAULT '',    -- app: payePar
  date         DATE,
  refacturable BOOLEAN DEFAULT FALSE,
  notes        TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. TASKS  (Priorité 5)
-- app fields : id, titre, client→client_name, assignedTo,
--              statut, priorite, echeance, notes
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  titre       TEXT DEFAULT '',
  client_name TEXT DEFAULT '',   -- app: client (string, pas FK pour l'instant)
  assigned_to TEXT DEFAULT '',   -- app: assignedTo
  statut      TEXT DEFAULT 'À faire',
  priorite    TEXT DEFAULT 'Moyenne',
  echeance    DATE,              -- app: echeance
  notes       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 6. BANK_SUBSCRIPTIONS  (Priorité 6)
-- app fields : id, label, montant, frequence, auteur, actif
-- ============================================================
CREATE TABLE IF NOT EXISTS bank_subscriptions (
  id        TEXT PRIMARY KEY,
  label     TEXT DEFAULT '',
  montant   NUMERIC DEFAULT 0,
  frequence TEXT DEFAULT '',
  auteur    TEXT DEFAULT '',
  actif     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. QUOTES + INVOICES  (Priorité 7 — à cartographier lors de l'implémentation)
-- ============================================================
CREATE TABLE IF NOT EXISTS quotes (
  id          TEXT PRIMARY KEY,
  data        JSONB DEFAULT '{}',  -- structure complète préservée temporairement
  client_id   TEXT REFERENCES clients(id) ON DELETE SET NULL,
  contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  statut      TEXT DEFAULT '',
  montant     NUMERIC DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id          TEXT PRIMARY KEY,
  data        JSONB DEFAULT '{}',  -- structure complète préservée temporairement
  client_id   TEXT REFERENCES clients(id) ON DELETE SET NULL,
  contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  statut      TEXT DEFAULT '',
  montant     NUMERIC DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. APP_CONFIG  (Priorité 8 — dernière)
-- ============================================================
CREATE TABLE IF NOT EXISTS app_config (
  id                       INTEGER PRIMARY KEY DEFAULT 1,
  initial_balance          NUMERIC DEFAULT 0,
  objectives               JSONB DEFAULT '{"mickaCAAnnuel":0,"cesarCAAnnuel":0}'::jsonb,
  auto_entrepreneur_micka  JSONB DEFAULT '{"seuil":77700,"tauxURSSAF":22}'::jsonb,
  auto_entrepreneur_cesar  JSONB DEFAULT '{"seuil":77700,"tauxURSSAF":22}'::jsonb,
  assuje_tva               BOOLEAN DEFAULT FALSE,
  drive_links              JSONB DEFAULT '{}'::jsonb,
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO app_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- REALTIME — activer sur les tables critiques
-- (Supabase > Database > Replication > Tables > activer)
-- ALTER TABLE clients          REPLICA IDENTITY FULL;
-- ALTER TABLE contracts        REPLICA IDENTITY FULL;
-- ALTER TABLE bank_transactions REPLICA IDENTITY FULL;
-- ALTER TABLE tasks            REPLICA IDENTITY FULL;
-- ============================================================

-- ============================================================
-- RLS — désactivé pour usage sans authentification
-- (même comportement que app_data actuellement)
-- Si app_data a RLS activé et bloque les écritures, exécuter :
-- ALTER TABLE app_data DISABLE ROW LEVEL SECURITY;
-- ============================================================
ALTER TABLE clients             DISABLE ROW LEVEL SECURITY;
ALTER TABLE contracts           DISABLE ROW LEVEL SECURITY;
ALTER TABLE contract_payments   DISABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions   DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses            DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks               DISABLE ROW LEVEL SECURITY;
ALTER TABLE bank_subscriptions  DISABLE ROW LEVEL SECURITY;
ALTER TABLE quotes              DISABLE ROW LEVEL SECURITY;
ALTER TABLE invoices            DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_config          DISABLE ROW LEVEL SECURITY;
