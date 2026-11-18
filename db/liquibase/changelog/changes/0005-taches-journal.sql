--liquibase formatted sql

--changeset crm:0005-tache
CREATE TABLE tache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titre TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    assigne_a UUID NOT NULL REFERENCES utilisateur (id),
    assigne_par UUID NOT NULL REFERENCES utilisateur (id),
    statut TEXT NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire', 'en_cours', 'terminee')),
    echeance DATE,
    cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
    modifie_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tache_assigne_a ON tache (assigne_a);
CREATE TRIGGER trg_tache_modifie_le BEFORE UPDATE ON tache
    FOR EACH ROW EXECUTE FUNCTION set_modifie_le();
--rollback DROP TABLE tache;

--changeset crm:0005-journal
--comment: journal qui/quoi/quand - append-only
CREATE TABLE journal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    acteur_id UUID NOT NULL REFERENCES utilisateur (id),
    action TEXT NOT NULL CHECK (action IN ('PROFORMA_MODIFIEE', 'FACTURE_GENEREE', 'STATUT_CLIENT_MODIFIE')),
    cible_type TEXT NOT NULL CHECK (cible_type IN ('client', 'proforma', 'facture_commerciale')),
    cible_id UUID NOT NULL,
    cible_libelle TEXT NOT NULL,
    client_id UUID REFERENCES client (id),
    avant JSONB,
    apres JSONB,
    date TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_journal_date ON journal (date DESC);
CREATE INDEX idx_journal_client ON journal (client_id);
CREATE INDEX idx_journal_acteur ON journal (acteur_id);
CREATE TRIGGER trg_journal_immuable BEFORE UPDATE OR DELETE ON journal
    FOR EACH ROW EXECUTE FUNCTION interdire_modification();
--rollback DROP TABLE journal;
