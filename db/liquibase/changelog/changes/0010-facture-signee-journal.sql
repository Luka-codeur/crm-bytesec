--liquibase formatted sql

--changeset crm:0010-facture-lien-signature
--comment: facture commerciale : lien de consultation et signatures (immuables, ecrites a l'insertion)
ALTER TABLE facture_commerciale ADD COLUMN token_consultation TEXT NOT NULL DEFAULT encode(gen_random_bytes(18), 'hex');
CREATE UNIQUE INDEX uq_facture_token ON facture_commerciale (token_consultation);
ALTER TABLE facture_commerciale ADD COLUMN signature_nom TEXT;
ALTER TABLE facture_commerciale ADD COLUMN signature_le TIMESTAMPTZ;
ALTER TABLE facture_commerciale ADD COLUMN signature_hash TEXT;
ALTER TABLE facture_commerciale ADD COLUMN client_signataire TEXT;
ALTER TABLE facture_commerciale ADD COLUMN client_signe_le TIMESTAMPTZ;
--rollback SELECT 1;

--changeset crm:0010-journal-evenements-publics
--comment: inscriptions et decisions faites par des tiers via les liens publics
ALTER TABLE journal DROP CONSTRAINT journal_action_check;
ALTER TABLE journal ADD CONSTRAINT journal_action_check CHECK (action IN (
    'PROFORMA_MODIFIEE', 'FACTURE_GENEREE', 'STATUT_CLIENT_MODIFIE',
    'CLIENT_INSCRIT', 'PROFORMA_VALIDEE_CLIENT', 'PROFORMA_REFUSEE_CLIENT'));
ALTER TABLE journal DROP CONSTRAINT journal_cible_type_check;
ALTER TABLE journal ADD CONSTRAINT journal_cible_type_check CHECK (cible_type IN ('client', 'proforma', 'facture_commerciale', 'projet'));
ALTER TABLE journal ADD COLUMN acteur_externe TEXT;
--rollback SELECT 1;
