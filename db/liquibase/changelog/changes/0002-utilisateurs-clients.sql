--liquibase formatted sql

--changeset crm:0002-equipe
CREATE TABLE equipe (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom TEXT NOT NULL,
    cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
--rollback DROP TABLE equipe;

--changeset crm:0002-utilisateur
CREATE TABLE utilisateur (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keycloak_id UUID NOT NULL UNIQUE,
    email TEXT NOT NULL,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('agent', 'chef_equipe')),
    equipe_id UUID NOT NULL REFERENCES equipe (id),
    cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_utilisateur_equipe ON utilisateur (equipe_id);
--rollback DROP TABLE utilisateur;

--changeset crm:0002-client
CREATE TABLE client (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    adresse TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL,
    telephone TEXT NOT NULL,
    statut TEXT NOT NULL DEFAULT 'prospect' CHECK (statut IN ('prospect', 'qualifie', 'confirme')),
    projet_id UUID,
    ajoute_par UUID NOT NULL REFERENCES utilisateur (id),
    cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
    modifie_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_statut ON client (statut);
CREATE INDEX idx_client_cree_le ON client (cree_le);
CREATE INDEX idx_client_ajoute_par ON client (ajoute_par);
CREATE TRIGGER trg_client_modifie_le BEFORE UPDATE ON client
    FOR EACH ROW EXECUTE FUNCTION set_modifie_le();
--rollback DROP TABLE client;
