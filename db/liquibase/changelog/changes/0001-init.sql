--liquibase formatted sql

--changeset crm:0001-init splitStatements:false
--comment: extensions et fonctions communes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE FUNCTION set_modifie_le() RETURNS trigger AS $$
BEGIN
    NEW.modifie_le = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION interdire_modification() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'La table % est en lecture seule (% interdit)', TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--rollback DROP FUNCTION interdire_modification(); DROP FUNCTION set_modifie_le();
