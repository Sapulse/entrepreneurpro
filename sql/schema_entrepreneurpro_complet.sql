-- ============================================================================
-- EntrepreneurPRO — SCHÉMA COMPLET ET À JOUR
-- Fichier unique permettant de recréer la base « entrepreneurpro » à l'identique.
--
-- Généré à partir d'un audit du code réel (sync/entities.js, sync/storage.js,
-- sync/backup.js) : toutes les colonnes réellement lues/écrites par l'application
-- sont intégrées directement dans les CREATE TABLE, y compris celles ajoutées
-- après coup via des ALTER TABLE successifs (auteur, refacturable, version,
-- impute, justificatif, contract_id, date_debut, titre, dates devis/factures…).
--
-- À exécuter dans un éditeur SQL PostgreSQL (Supabase > SQL Editor, ou psql).
-- ----------------------------------------------------------------------------
-- TABLES ET LEUR RÔLE :
--   clients             Fiches CRM (entreprises/prospects/clients)
--   crm_actions         Actions CRM liées à un client (note, appel, RDV, relance…)
--   contracts           Contrats / missions, rattachés à un client
--   contract_payments   Paiements (échéances) rattachés à un contrat
--   bank_transactions   Mouvements du relevé de carte / banque
--   bank_subscriptions  Abonnements récurrents (charges fixes)
--   expenses            Dépenses / notes de frais
--   tasks               Tâches / to-do, éventuellement liées client ou contrat
--   quotes              Devis (colonnes indexées + objet complet en JSONB)
--   invoices            Factures (colonnes indexées + objet complet en JSONB)
--   app_config          Configuration unique (id=1) : objectifs, seuils AE, soldes
--   app_data            Ligne de synchro unique (id=1) : compteur de version + ping
--   app_snapshots       Sauvegardes horodatées du dataset complet (rollback)
-- ============================================================================

-- Extension uuid (optionnelle — les ids applicatifs sont des TEXT générés côté front)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- Trigger générique : met à jour updated_at à chaque UPDATE.
-- search_path explicite pour éviter l'avertissement "function search path mutable".
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 1. CLIENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS clients (
  id          TEXT PRIMARY KEY,
  entreprise  TEXT DEFAULT '',
  contact     TEXT DEFAULT '',          -- app: nom
  email       TEXT DEFAULT '',
  telephone   TEXT DEFAULT '',
  source      TEXT DEFAULT '',
  etape       TEXT DEFAULT '',          -- app: etape (pipeline CRM)
  potentiel   INTEGER DEFAULT 0,        -- app: potentiel (€ estimé)
  notes       TEXT DEFAULT '',
  date_entree DATE,                     -- app: dateEntree
  prenom         TEXT DEFAULT '',       -- app: prenom
  adresse        TEXT DEFAULT '',       -- app: adresse
  siret          TEXT DEFAULT '',       -- app: siret
  recommande_par TEXT DEFAULT '',       -- app: recommandePar
  contacts       JSONB DEFAULT '[]'::jsonb,  -- app: contacts [{id,nom,role,email,tel}]
  liens          JSONB DEFAULT '[]'::jsonb,  -- app: liens [{id,label,url}]
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_clients_updated_at ON clients;
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 1b. CRM_ACTIONS — actions liées à un client (manquait dans v1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS crm_actions (
  id         TEXT PRIMARY KEY,
  client_id  TEXT REFERENCES clients(id) ON DELETE CASCADE,
  type       TEXT DEFAULT '',           -- Note | RDV | Appel | Email | Livraison | Relance
  contenu    TEXT DEFAULT '',
  date       DATE,
  assignee   TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_actions_client ON crm_actions(client_id);

-- ============================================================================
-- 2. CONTRACTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS contracts (
  id              TEXT PRIMARY KEY,
  client_id       TEXT REFERENCES clients(id) ON DELETE SET NULL,
  client_name     TEXT DEFAULT '',      -- app: client (dénormalisé)
  prestation      TEXT DEFAULT '',
  montant         NUMERIC DEFAULT 0,
  assigned_to     TEXT DEFAULT '',      -- app: assignedTo
  impute          TEXT DEFAULT '',      -- app: impute (lu par loadFromEntityTables)
  statut          TEXT DEFAULT 'En cours',
  date_signature  DATE,
  date_debut      DATE,
  date_fin        DATE,
  type_paiement   TEXT DEFAULT '',
  montant_opco    NUMERIC DEFAULT 0,
  statut_opco     TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_contracts_updated_at ON contracts;
CREATE TRIGGER trg_contracts_updated_at
  BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_contracts_client ON contracts(client_id);

-- 2b. CONTRACT_PAYMENTS — paiements rattachés à un contrat
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
CREATE INDEX IF NOT EXISTS idx_payments_contract ON contract_payments(contract_id);

-- ============================================================================
-- 3. BANK_TRANSACTIONS — relevé bancaire / carte
--    Colonnes ajoutées après v1 : auteur, statut, impute_a, contract_id, notes
-- ============================================================================
CREATE TABLE IF NOT EXISTS bank_transactions (
  id          TEXT PRIMARY KEY,
  label       TEXT DEFAULT '',
  montant     NUMERIC DEFAULT 0,
  type        TEXT DEFAULT '',          -- Achat | Sortie | Apport | Entrée
  date        DATE,
  auteur      TEXT DEFAULT '',
  impute_a    TEXT DEFAULT '',          -- app: imputéÀ (accent normalisé)
  statut      TEXT DEFAULT '',
  contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  notes       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bank_tx_contract ON bank_transactions(contract_id);

-- ============================================================================
-- 4. EXPENSES — dépenses / notes de frais
--    Colonnes ajoutées après v1 : refacturable, impute, justificatif
-- ============================================================================
CREATE TABLE IF NOT EXISTS expenses (
  id           TEXT PRIMARY KEY,
  label        TEXT DEFAULT '',         -- app: titre
  montant      NUMERIC DEFAULT 0,
  categorie    TEXT DEFAULT '',
  paye_par     TEXT DEFAULT '',         -- app: payePar
  date         DATE,
  refacturable BOOLEAN DEFAULT FALSE,
  impute       TEXT DEFAULT '',
  justificatif TEXT DEFAULT '',
  notes        TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 5. TASKS
--    Colonnes ajoutées après v1 : client_id, contract_id (FK)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  titre       TEXT DEFAULT '',
  client_name TEXT DEFAULT '',          -- app: client (dénormalisé)
  client_id   TEXT REFERENCES clients(id) ON DELETE SET NULL,
  contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  assigned_to TEXT DEFAULT '',
  statut      TEXT DEFAULT 'À faire',
  priorite    TEXT DEFAULT 'Moyenne',
  echeance    DATE,
  notes       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_tasks_client ON tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_contract ON tasks(contract_id);

-- ============================================================================
-- 6. BANK_SUBSCRIPTIONS — abonnements / charges récurrentes
--    Colonnes ajoutées après v1 : date_debut, notes
-- ============================================================================
CREATE TABLE IF NOT EXISTS bank_subscriptions (
  id         TEXT PRIMARY KEY,
  label      TEXT DEFAULT '',
  montant    NUMERIC DEFAULT 0,
  frequence  TEXT DEFAULT '',
  auteur     TEXT DEFAULT '',
  actif      BOOLEAN DEFAULT TRUE,
  date_debut DATE,
  notes      TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 7a. QUOTES — devis (colonnes indexées + objet complet JSONB pour round-trip)
--     Colonnes ajoutées après v1 : titre, date_creation, date_expiration, notes
-- ============================================================================
CREATE TABLE IF NOT EXISTS quotes (
  id              TEXT PRIMARY KEY,
  data            JSONB DEFAULT '{}',   -- structure complète préservée sans perte
  client_id       TEXT REFERENCES clients(id) ON DELETE SET NULL,
  contract_id     TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  titre           TEXT DEFAULT '',
  statut          TEXT DEFAULT 'Brouillon',
  montant         NUMERIC DEFAULT 0,
  date_creation   DATE,
  date_expiration DATE,
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_quotes_updated_at ON quotes;
CREATE TRIGGER trg_quotes_updated_at
  BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 7b. INVOICES — factures
--     Colonnes ajoutées après v1 : titre, date_emission, date_echeance, notes
CREATE TABLE IF NOT EXISTS invoices (
  id            TEXT PRIMARY KEY,
  data          JSONB DEFAULT '{}',     -- structure complète préservée sans perte
  client_id     TEXT REFERENCES clients(id) ON DELETE SET NULL,
  contract_id   TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  titre         TEXT DEFAULT '',
  statut        TEXT DEFAULT 'Non envoyée',
  montant       NUMERIC DEFAULT 0,
  date_emission DATE,
  date_echeance DATE,
  notes         TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 8. APP_CONFIG — configuration unique (id=1)
-- ============================================================================
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

-- ============================================================================
-- 9. APP_DATA — ligne de synchro unique (id=1)   (manquait dans v1)
--    Depuis l'Option C (Phase C), data n'est plus qu'un ping minimal ({}),
--    et version sert de compteur de synchro multi-appareils (Realtime).
--    data est NOT NULL : toute écriture doit fournir au moins {}.
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_data (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  version    INTEGER DEFAULT 0,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO app_data (id, version, data) VALUES (1, 0, '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 10. APP_SNAPSHOTS — sauvegardes horodatées du dataset complet  (manquait dans v1)
--     id auto-généré (l'app n'envoie pas d'id à l'insert).
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_snapshots (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts           TIMESTAMPTZ DEFAULT NOW(),
  version      INTEGER DEFAULT 0,
  triggered_by TEXT DEFAULT '',
  size_bytes   INTEGER DEFAULT 0,
  data         JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON app_snapshots(ts DESC);

-- ============================================================================
-- REALTIME (optionnel) — l'app écoute les UPDATE de app_data pour la synchro
-- multi-appareils. Sur Supabase, ajouter les tables voulues à la publication :
--   ALTER PUBLICATION supabase_realtime ADD TABLE app_data;
-- Et, si besoin de diffuser l'état complet des lignes modifiées :
--   ALTER TABLE app_data          REPLICA IDENTITY FULL;
--   ALTER TABLE clients           REPLICA IDENTITY FULL;
--   ALTER TABLE contracts         REPLICA IDENTITY FULL;
--   ALTER TABLE bank_transactions REPLICA IDENTITY FULL;
--   ALTER TABLE tasks             REPLICA IDENTITY FULL;
-- ============================================================================

-- ============================================================================
-- RLS — Row Level Security  (⚠️ POINT SENSIBLE — traité séparément)
-- ----------------------------------------------------------------------------
-- Volontairement NON désactivé ici. La sécurité d'accès (RLS + politiques, ou
-- restriction réseau côté serveur souverain) sera définie dans un script dédié.
--
-- Rappel : l'app actuelle utilise une clé "publishable"/anon sans authentification.
-- Activer RLS sans politique adaptée BLOQUERA toutes les lectures/écritures.
--
-- Pour ré-obtenir le comportement « ouvert » de l'ancien v1 (NON recommandé en prod) :
--   ALTER TABLE clients            DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE crm_actions        DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE contracts          DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE contract_payments  DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE bank_transactions  DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE expenses           DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE tasks              DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE bank_subscriptions DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE quotes             DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE invoices           DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE app_config         DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE app_data           DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE app_snapshots      DISABLE ROW LEVEL SECURITY;
-- ============================================================================
