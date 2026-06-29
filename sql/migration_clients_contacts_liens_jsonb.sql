-- ============================================================
-- Migration ADDITIVE — table clients : 2 listes JSONB
--   contacts : [{id, nom, role, email, tel}]   (contacts/employés)
--   liens    : [{id, label, url}]               (liens/dossiers)
--
-- Strictement additif et idempotent : ne touche à AUCUNE colonne existante,
-- ne renomme rien, ne supprime rien. Réexécutable sans effet.
-- Patron JSONB éprouvé (quotes.data / invoices.data / parcours.data).
-- Base LOCALE souveraine :
--   docker exec -i postgres psql -U sapulse -d entrepreneurpro -f - < ce_fichier
-- ============================================================

ALTER TABLE clients ADD COLUMN IF NOT EXISTS contacts JSONB DEFAULT '[]'::jsonb;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS liens    JSONB DEFAULT '[]'::jsonb;
