-- ============================================================
-- Migration ADDITIVE — table clients : 4 champs jusqu'ici perdus à la resync
--   prenom, adresse, siret, recommande_par (app: recommandePar)
--
-- Strictement additif et idempotent : ne touche à AUCUNE colonne existante,
-- ne renomme rien, ne supprime rien. Réexécutable sans effet.
-- À exécuter sur la base PostgreSQL existante (locale souveraine).
-- ============================================================

ALTER TABLE clients ADD COLUMN IF NOT EXISTS prenom         TEXT DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS adresse        TEXT DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS siret          TEXT DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS recommande_par TEXT DEFAULT '';
