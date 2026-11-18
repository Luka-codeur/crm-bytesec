--liquibase formatted sql

--changeset crm:0009-proforma-projets
--comment: une pro forma peut couvrir plusieurs projets et n'est plus obligatoirement liee a un client
ALTER TABLE proforma ALTER COLUMN client_id DROP NOT NULL;
CREATE TABLE proforma_projet (
    proforma_id UUID NOT NULL REFERENCES proforma (id) ON DELETE CASCADE,
    projet_id UUID NOT NULL REFERENCES projet (id) ON DELETE RESTRICT,
    PRIMARY KEY (proforma_id, projet_id)
);
INSERT INTO proforma_projet (proforma_id, projet_id) SELECT id, projet_id FROM proforma WHERE projet_id IS NOT NULL;
ALTER TABLE proforma DROP COLUMN projet_id;
--rollback SELECT 1;

--changeset crm:0009-proforma-lien-signature
--comment: lien de consultation, signature de l'emetteur (a l'envoi) et decision du client
ALTER TABLE proforma ADD COLUMN token_consultation TEXT NOT NULL DEFAULT encode(gen_random_bytes(18), 'hex');
CREATE UNIQUE INDEX uq_proforma_token ON proforma (token_consultation);
ALTER TABLE proforma ADD COLUMN signe_par UUID REFERENCES utilisateur (id);
ALTER TABLE proforma ADD COLUMN signe_le TIMESTAMPTZ;
ALTER TABLE proforma ADD COLUMN decision_client_nom TEXT;
ALTER TABLE proforma ADD COLUMN decision_client_le TIMESTAMPTZ;
ALTER TABLE proforma ADD COLUMN decision_hash TEXT;
--rollback SELECT 1;

--changeset crm:0009-proforma-projet-verrou splitStatements:false
--comment: les projets d'une pro forma facturee ne peuvent plus changer
CREATE FUNCTION proforma_projet_verrouillee() RETURNS trigger AS $$
DECLARE
    pid UUID;
BEGIN
    IF TG_OP = 'INSERT' THEN
        pid := NEW.proforma_id;
    ELSE
        pid := OLD.proforma_id;
    END IF;
    IF EXISTS (SELECT 1 FROM facture_commerciale WHERE proforma_id = pid) THEN
        RAISE EXCEPTION 'La pro forma % est verrouillee (facture commerciale generee)', pid
            USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_proforma_projet_verrou BEFORE INSERT OR UPDATE OR DELETE ON proforma_projet
    FOR EACH ROW EXECUTE FUNCTION proforma_projet_verrouillee();
--rollback DROP TRIGGER trg_proforma_projet_verrou ON proforma_projet; DROP FUNCTION proforma_projet_verrouillee();
