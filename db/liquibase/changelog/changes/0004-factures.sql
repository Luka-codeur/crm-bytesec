--liquibase formatted sql

--changeset crm:0004-sequences
CREATE SEQUENCE proforma_numero_seq;
CREATE SEQUENCE facture_numero_seq;
--rollback DROP SEQUENCE facture_numero_seq; DROP SEQUENCE proforma_numero_seq;

--changeset crm:0004-proforma
CREATE TABLE proforma (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero TEXT NOT NULL UNIQUE,
    client_id UUID NOT NULL REFERENCES client (id),
    projet_id UUID REFERENCES projet (id) ON DELETE SET NULL,
    tva_pourcent NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (tva_pourcent >= 0 AND tva_pourcent <= 100),
    statut TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'envoyee', 'acceptee', 'refusee')),
    cree_par UUID NOT NULL REFERENCES utilisateur (id),
    cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
    modifie_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_proforma_client ON proforma (client_id);
CREATE TRIGGER trg_proforma_modifie_le BEFORE UPDATE ON proforma
    FOR EACH ROW EXECUTE FUNCTION set_modifie_le();

CREATE TABLE ligne_proforma (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proforma_id UUID NOT NULL REFERENCES proforma (id) ON DELETE CASCADE,
    position INT NOT NULL DEFAULT 0,
    designation TEXT NOT NULL,
    quantite NUMERIC(10, 2) NOT NULL CHECK (quantite > 0),
    prix_unitaire_centimes BIGINT NOT NULL CHECK (prix_unitaire_centimes >= 0)
);
CREATE INDEX idx_ligne_proforma ON ligne_proforma (proforma_id);
--rollback DROP TABLE ligne_proforma; DROP TABLE proforma;

--changeset crm:0004-facture-commerciale
--comment: immuable - snapshot de la pro forma au moment de la generation
CREATE TABLE facture_commerciale (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero TEXT NOT NULL UNIQUE,
    proforma_id UUID NOT NULL UNIQUE REFERENCES proforma (id),
    client_id UUID NOT NULL REFERENCES client (id),
    tva_pourcent NUMERIC(5, 2) NOT NULL,
    total_ht_centimes BIGINT NOT NULL,
    total_ttc_centimes BIGINT NOT NULL,
    emise_par UUID NOT NULL REFERENCES utilisateur (id),
    emise_le TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_facture_client ON facture_commerciale (client_id);

CREATE TABLE ligne_facture_commerciale (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facture_id UUID NOT NULL REFERENCES facture_commerciale (id),
    position INT NOT NULL DEFAULT 0,
    designation TEXT NOT NULL,
    quantite NUMERIC(10, 2) NOT NULL,
    prix_unitaire_centimes BIGINT NOT NULL
);
CREATE INDEX idx_ligne_facture ON ligne_facture_commerciale (facture_id);

CREATE TRIGGER trg_facture_immuable BEFORE UPDATE OR DELETE ON facture_commerciale
    FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER trg_ligne_facture_immuable BEFORE UPDATE OR DELETE ON ligne_facture_commerciale
    FOR EACH ROW EXECUTE FUNCTION interdire_modification();
--rollback DROP TABLE ligne_facture_commerciale; DROP TABLE facture_commerciale;

--changeset crm:0004-proforma-verrou splitStatements:false
--comment: une pro forma convertie en facture ne peut plus etre modifiee ni supprimee, ni ses lignes
CREATE FUNCTION proforma_verrouillee() RETURNS trigger AS $$
DECLARE
    pid UUID;
BEGIN
    pid := CASE TG_TABLE_NAME WHEN 'proforma' THEN OLD.id ELSE COALESCE(OLD.proforma_id, NEW.proforma_id) END;
    IF EXISTS (SELECT 1 FROM facture_commerciale WHERE proforma_id = pid) THEN
        RAISE EXCEPTION 'La pro forma % est verrouillee (facture commerciale generee)', pid
            USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_proforma_verrou BEFORE UPDATE OR DELETE ON proforma
    FOR EACH ROW EXECUTE FUNCTION proforma_verrouillee();
CREATE TRIGGER trg_ligne_proforma_verrou BEFORE UPDATE OR DELETE ON ligne_proforma
    FOR EACH ROW EXECUTE FUNCTION proforma_verrouillee();
--rollback DROP TRIGGER trg_ligne_proforma_verrou ON ligne_proforma; DROP TRIGGER trg_proforma_verrou ON proforma; DROP FUNCTION proforma_verrouillee();
