--liquibase formatted sql

--changeset crm:0007-fix-proforma-verrou splitStatements:false
--comment: CASE evaluait OLD.proforma_id sur la table proforma (champ inexistant) ; IF/ELSE par table
CREATE OR REPLACE FUNCTION proforma_verrouillee() RETURNS trigger AS $$
DECLARE
    pid UUID;
BEGIN
    IF TG_TABLE_NAME = 'proforma' THEN
        pid := OLD.id;
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
--rollback SELECT 1;
