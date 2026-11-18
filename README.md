# CRM ByteSec (MVP)

Clients, projets (packs/formations), factures pro forma et commerciales, tâches de prospection, journal de traçabilité. Rôles : `agent`, `chef_equipe`.

Stack : NestJS + Kysely, PostgreSQL, Liquibase, Keycloak, front React (Lovable : `Luka-codeur/bytesec-client-compass`), Docker Compose.

## Démarrer en local

```bash
docker compose -f docker/docker-compose.yml up --build   # postgres, liquibase, keycloak, API
```

- Postgres exposé sur le port **54320** (5432/5433 sont souvent déjà pris sur les postes de dev)
- API : http://localhost:3000/api (santé : `/api/health`)
- Keycloak : http://localhost:8080 (admin/admin), realm `crm`, client public `crm-frontend`
- Comptes de test : `agent` / `agent`, `chef` / `chef`

Dev hybride (API hors Docker) : `docker compose -f docker/docker-compose.yml up postgres liquibase keycloak`, puis dans `backend/` : copier `.env.example` en `.env`, `npm install`, `npm run dev`.

Front : dossier `frontend/` (clone du dépôt Lovable, qui garde son propre `.git` pour rester synchronisé avec Lovable). Dans Docker : `--profile front`.

## Règles métier garanties en base

- `facture_commerciale` et `journal` : UPDATE/DELETE interdits (triggers).
- Une pro forma facturée est verrouillée (modification, suppression, lignes).
- Une seule facture commerciale par pro forma (contrainte unique).

## Migrations

`db/liquibase/changelog/changes/NNNN-*.sql`, jamais d'édition d'un changeset appliqué. `docker compose -f docker/docker-compose.yml run --rm liquibase update`.

## Hypothèses du MVP

Équipe unique par défaut ; envoi de projet simulé (journalisé dans les logs, pas d'e-mail) ; devise XOF, montants en centimes ; un agent ne voit que ses clients.

## Tests

- `cd backend && npm test` : tests unitaires.
- `python -I backend/scripts/e2e.py` : scénario API complet (37 vérifications : droits, filtres, facture immuable, journal). Base métier vide, et « Direct access grants » activé en dev sur le client `crm-frontend`.
- `e2e/ui-mock.mjs` (front en mode démo, port 8081) et `e2e/ui-real.mjs` (front + API + Keycloak réels, port 8082, `VITE_USE_MOCK=false`) : parcours navigateur Playwright (`npm i playwright`, Chrome installé).

### Démo enregistrée

`backend/scripts/seed_demo.py` insère des données réalistes (base métier vide), puis `e2e/demo-video.mjs` rejoue le parcours agent puis chef dans Chrome et enregistre la vidéo avec sous-titres (`demo/crm-bytesec-demo.webm`, environ 3 minutes). Front réel sur `:8082`.

## Déploiement sur le VPS

1. DNS : deux enregistrements A vers le VPS (`CRM_DOMAIN`, `AUTH_DOMAIN`). Docker + plugin compose installés.
2. `cp docker/.env.prod.example docker/.env.prod` puis renseigner domaines et mots de passe.
3. `docker compose -f docker/docker-compose.prod.yml --env-file docker/.env.prod up -d --build`
4. Keycloak : se connecter à `https://AUTH_DOMAIN` avec le compte admin, realm `crm` > Users : créer les comptes, définir leur mot de passe, leur attribuer le rôle de realm `agent` ou `chef_equipe`. Aucun compte de démo n'est importé en production.
5. Seul Caddy publie des ports (80/443) ; Postgres, API, front et Keycloak restent sur le réseau interne.

Limites connues : sauvegarde Postgres à planifier (`pg_dump` du volume), accès à la console admin Keycloak à restreindre par IP si besoin, envoi d'e-mail du projet toujours simulé.
