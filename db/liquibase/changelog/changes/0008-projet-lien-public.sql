--liquibase formatted sql

--changeset crm:0008-projet-lien-consultation
--comment: un projet n'est plus rattache a un client ; il a un lien de consultation public (jeton aleatoire)
ALTER TABLE projet DROP CONSTRAINT projet_client_id_fkey;
ALTER TABLE projet ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE projet ADD CONSTRAINT projet_client_id_fkey FOREIGN KEY (client_id) REFERENCES client (id) ON DELETE SET NULL;
ALTER TABLE projet ADD COLUMN token_consultation TEXT NOT NULL DEFAULT encode(gen_random_bytes(18), 'hex');
CREATE UNIQUE INDEX uq_projet_token ON projet (token_consultation);
CREATE INDEX idx_projet_cree_par ON projet (cree_par);
--rollback DROP INDEX idx_projet_cree_par; DROP INDEX uq_projet_token; ALTER TABLE projet DROP COLUMN token_consultation;

--changeset crm:0008-pack-tranches
--comment: prix du pack = somme des formations par defaut (modifiable), affiche en tranches
ALTER TABLE pack ADD COLUMN nb_tranches INT NOT NULL DEFAULT 3 CHECK (nb_tranches BETWEEN 1 AND 12);
ALTER TABLE pack ADD COLUMN prix_personnalise BOOLEAN NOT NULL DEFAULT false;
--rollback ALTER TABLE pack DROP COLUMN prix_personnalise; ALTER TABLE pack DROP COLUMN nb_tranches;

--changeset crm:0008-projet-inscription
--comment: inscriptions via le lien public (le prospect devient client)
CREATE TABLE projet_inscription (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projet_id UUID NOT NULL REFERENCES projet (id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES client (id),
    cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (projet_id, client_id)
);
CREATE INDEX idx_inscription_client ON projet_inscription (client_id);
--rollback DROP TABLE projet_inscription;
