-- ============================================================
-- EntrepreneurPRO — Migration Option C : tables par entité
-- Version : v1 — Phase 1 (coexistence avec app_data)
--
-- À EXÉCUTER dans Supabase > SQL Editor
-- app_data(id=1) reste en place pendant toute la phase de transition.
-- Ces tables sont créées en parallèle ; elles recevront les données
-- progressivement via double écriture avant de devenir source principale.
-- ============================================================

-- ============================================================
-- EXTENSION : timestamps automatiques
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Fonction de mise à jour automatique de updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABLE : clients (CRM)
-- Priorité 1 — fondation de toutes les autres entités
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id          TEXT PRIMARY KEY,
  entreprise  TEXT,
  contact     TEXT,
  email       TEXT,
  phone       TEXT,
  source      TEXT,
  stage       TEXT DEFAULT 'Contact',
  crm_score   INTEGER DEFAULT 0,
  notes       TEXT,
  assignee    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_actions (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type        TEXT,   -- 'Note' | 'RDV' | 'Appel' | 'Email' | 'Livraison' | 'Relance'
  contenu     TEXT,
  date        DATE,
  assignee    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TABLE : contracts + contract_payments
-- Priorité 2 — cœur du chiffre d'affaires
-- ============================================================
CREATE TABLE IF NOT EXISTS contracts (
  id          TEXT PRIMARY KEY,
  client_id   TEXT REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT,    -- dénormalisé pour affichage rapide
  titre       TEXT,
  montant     NUMERIC DEFAULT 0,
  statut      TEXT DEFAULT 'En cours',
  assignee    TEXT,
  imputee     TEXT,
  date_debut  DATE,
  date_fin    DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contract_payments (
  id          TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  montant     NUMERIC DEFAULT 0,
  date        DATE,
  type        TEXT,   -- 'Virement' | 'OPCO' | etc.
  auteur      TEXT,   -- 'Micka' | 'César' | 'Client'
  opco_status TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_contracts_updated_at
  BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TABLE : bank_transactions
-- Priorité 3 — trésorerie temps réel
-- ============================================================
CREATE TABLE IF NOT EXISTS bank_transactions (
  id          TEXT PRIMARY KEY,
  label       TEXT,
  montant     NUMERIC DEFAULT 0,
  type        TEXT DEFAULT 'Sortie',  -- 'Achat' | 'Sortie' | 'Apport' | 'Entrée'
  date        DATE,
  assignee    TEXT,
  impute      TEXT,
  contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE : expenses
-- Priorité 4 — frais & comptabilité
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id          TEXT PRIMARY KEY,
  label       TEXT,
  montant     NUMERIC DEFAULT 0,
  categorie   TEXT,
  assignee    TEXT,
  impute      TEXT,
  date        DATE,
  justificatif TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE : tasks
-- Priorité 5 — suivi opérationnel
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  titre       TEXT,
  statut      TEXT DEFAULT 'À faire',
  priorite    TEXT DEFAULT 'Moyenne',
  assignee    TEXT,
  due_date    DATE,
  contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  client_id   TEXT REFERENCES clients(id) ON DELETE SET NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TABLE : bank_subscriptions
-- Priorité 6 — abonnements récurrents
-- ============================================================
CREATE TABLE IF NOT EXISTS bank_subscriptions (
  id          TEXT PRIMARY KEY,
  label       TEXT,
  montant     NUMERIC DEFAULT 0,
  frequence   TEXT,   -- 'Mensuel' | 'Annuel' | etc.
  assignee    TEXT,
  actif       BOOLEAN DEFAULT TRUE,
  date_debut  DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE : quotes (devis)
-- Priorité 7a
-- ============================================================
CREATE TABLE IF NOT EXISTS quotes (
  id          TEXT PRIMARY KEY,
  client_id   TEXT REFERENCES clients(id) ON DELETE SET NULL,
  contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  titre       TEXT,
  statut      TEXT DEFAULT 'Brouillon',
  montant     NUMERIC DEFAULT 0,
  date_creation DATE,
  date_expiration DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_quotes_updated_at
  BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TABLE : invoices (factures)
-- Priorité 7b
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id          TEXT PRIMARY KEY,
  client_id   TEXT REFERENCES clients(id) ON DELETE SET NULL,
  contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  titre       TEXT,
  statut      TEXT DEFAULT 'Non envoyée',
  montant     NUMERIC DEFAULT 0,
  date_emission DATE,
  date_echeance DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TABLE : app_config
-- Priorité 8 — dernière migration, la moins risquée
-- ============================================================
CREATE TABLE IF NOT EXISTS app_config (
  id                    INTEGER PRIMARY KEY DEFAULT 1,
  initial_balance       NUMERIC DEFAULT 0,
  objectives            JSONB DEFAULT '{"mickaCAAnnuel":0,"cesarCAAnnuel":0}'::jsonb,
  auto_entrepreneur_micka JSONB DEFAULT '{"seuil":77700,"tauxURSSAF":22}'::jsonb,
  auto_entrepreneur_cesar JSONB DEFAULT '{"seuil":77700,"tauxURSSAF":22}'::jsonb,
  assuje_tva            BOOLEAN DEFAULT FALSE,
  drive_links           JSONB DEFAULT '{}'::jsonb,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER trg_app_config_updated_at
  BEFORE UPDATE ON app_config FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- REALTIME : activer les événements sur les tables critiques
-- (à activer dans Supabase > Realtime > Tables)
-- ALTER TABLE clients REPLICA IDENTITY FULL;
-- ALTER TABLE contracts REPLICA IDENTITY FULL;
-- ALTER TABLE bank_transactions REPLICA IDENTITY FULL;
-- ALTER TABLE tasks REPLICA IDENTITY FULL;
-- ============================================================

-- ============================================================
-- RLS : politiques de sécurité
-- Option A : accès libre en lecture/écriture pour la clé anon (usage solo/duo sans auth)
-- Option B : lier à auth.uid() si authentification activée plus tard
-- ============================================================

-- Désactiver RLS sur toutes les tables pour usage sans authentification
-- (même comportement que app_data actuellement)
ALTER TABLE clients             DISABLE ROW LEVEL SECURITY;
ALTER TABLE crm_actions         DISABLE ROW LEVEL SECURITY;
ALTER TABLE contracts           DISABLE ROW LEVEL SECURITY;
ALTER TABLE contract_payments   DISABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions   DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses            DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks               DISABLE ROW LEVEL SECURITY;
ALTER TABLE bank_subscriptions  DISABLE ROW LEVEL SECURITY;
ALTER TABLE quotes              DISABLE ROW LEVEL SECURITY;
ALTER TABLE invoices            DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_config          DISABLE ROW LEVEL SECURITY;

-- NOTE : si RLS est activé sur app_data et bloque les écritures, exécuter :
-- ALTER TABLE app_data DISABLE ROW LEVEL SECURITY;
-- OU créer les politiques :
-- CREATE POLICY "anon_read"   ON app_data FOR SELECT USING (true);
-- CREATE POLICY "anon_write"  ON app_data FOR ALL    USING (true) WITH CHECK (true);
