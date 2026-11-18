--liquibase formatted sql

--changeset crm:0006-seed-equipe
--comment: equipe par defaut ; les utilisateurs Keycloak y sont rattaches a leur premiere connexion
INSERT INTO equipe (id, nom) VALUES ('00000000-0000-0000-0000-000000000001', 'Equipe ByteSec');
--rollback DELETE FROM equipe WHERE id = '00000000-0000-0000-0000-000000000001';
