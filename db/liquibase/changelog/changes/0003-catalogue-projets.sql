--liquibase formatted sql

--changeset crm:0003-formation
--comment: catalogue partage de formations
CREATE TABLE formation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titre TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    duree_heures NUMERIC(6, 1) NOT NULL CHECK (duree_heures >= 0),
    prix_centimes BIGINT NOT NULL CHECK (prix_centimes >= 0),
    cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
--rollback DROP TABLE formation;

--changeset crm:0003-projet
CREATE TABLE projet (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    client_id UUID NOT NULL REFERENCES client (id) ON DELETE CASCADE,
    statut TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'envoye')),
    envoye_le TIMESTAMPTZ,
    cree_par UUID NOT NULL REFERENCES utilisateur (id),
    cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
    modifie_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_projet_client ON projet (client_id);
CREATE TRIGGER trg_projet_modifie_le BEFORE UPDATE ON projet
    FOR EACH ROW EXECUTE FUNCTION set_modifie_le();

ALTER TABLE client
    ADD CONSTRAINT fk_client_projet FOREIGN KEY (projet_id) REFERENCES projet (id) ON DELETE SET NULL;
--rollback ALTER TABLE client DROP CONSTRAINT fk_client_projet; DROP TABLE projet;

--changeset crm:0003-pack
--comment: un pack appartient a un projet ; un pack contient 1..n formations du catalogue
CREATE TABLE pack (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projet_id UUID NOT NULL REFERENCES projet (id) ON DELETE CASCADE,
    nom TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    prix_centimes BIGINT NOT NULL CHECK (prix_centimes >= 0),
    position INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_pack_projet ON pack (projet_id);

CREATE TABLE pack_formation (
    pack_id UUID NOT NULL REFERENCES pack (id) ON DELETE CASCADE,
    formation_id UUID NOT NULL REFERENCES formation (id),
    position INT NOT NULL DEFAULT 0,
    PRIMARY KEY (pack_id, formation_id)
);
--rollback DROP TABLE pack_formation; DROP TABLE pack;
