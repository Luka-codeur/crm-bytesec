# CRM ByteSec (MVP)

Suivi des clients, projets (packs et formations), factures pro forma et commerciales signées, tâches de prospection et journal de traçabilité. Deux rôles : `agent` et `chef_equipe`.

**Stack** : NestJS + Kysely, PostgreSQL, Liquibase, Keycloak, front React (TanStack Start, généré avec Lovable), Docker Compose.

| Dossier | Contenu |
|---|---|
| `backend/` | API NestJS (auth Keycloak, règles métier, liens publics) |
| `db/liquibase/` | Migrations SQL versionnées (seule source de vérité du schéma) |
| `docker/` | Compose de dev et de production (Caddy + HTTPS), realm Keycloak |
| `e2e/` | Parcours navigateur Playwright et script de la vidéo de démo |
| `frontend/` | **Dépôt séparé** : [Luka-codeur/bytesec-client-compass](https://github.com/Luka-codeur/bytesec-client-compass) (à cloner ici, voir ci-dessous) |

## Démarrer en local (testeurs)

Prérequis : Docker, Node 22+, Python 3.10+, Chrome (pour les tests navigateur).

```bash
git clone https://github.com/Luka-codeur/crm-bytesec.git && cd crm-bytesec
git clone https://github.com/Luka-codeur/bytesec-client-compass.git frontend    # le front (dépôt Lovable)

docker compose -f docker/docker-compose.yml up -d postgres liquibase keycloak   # base + migrations + Keycloak
cd backend && cp .env.example .env && npm install && npm run build && npm start # API sur :3000
cd ../frontend && bun install && VITE_USE_MOCK=false VITE_API_URL=http://localhost:3000 bun run dev --port 8082
```

- Front : http://localhost:8082 · API : http://localhost:3000/api (`/api/health`) · Keycloak : http://localhost:8080 (admin/admin)
- Comptes de test : **`agent` / `agent`** et **`chef` / `chef`** (réservés au développement, absents de la production)
- Postgres est publié sur le port **54320** (5432 est souvent déjà pris sur les postes de dev)
- **Mode démo sans backend** : `VITE_USE_MOCK=true` (valeur par défaut), données fictives en mémoire, choix du profil sur l'écran de connexion. Les liens publics de démonstration : `/p/mock-p-1`, `/pf/mock-pf-3`, `/f/mock-fc-1`.

## Règles métier

**Rôles**
- **Agent** : ne voit que les clients, projets et pro forma qu'il a créés. Met à jour le statut de ses tâches.
- **Chef d'équipe** : voit tout son équipe, assigne et suit les tâches, consulte le journal global.

**Projet** : n'est plus rattaché à un client. Il peut n'avoir **aucun pack**, ou un ou plusieurs. Il a un **lien de consultation** public (`/p/<jeton>`) que l'agent copie et envoie par n'importe quel canal. Cette page est en lecture seule et propose **« S'inscrire maintenant »** : la personne (prénom, nom, e-mail, téléphone) est ajoutée à la base clients (prospect), rattachée au créateur du projet et inscrite au projet. Un e-mail déjà connu n'est jamais dupliqué.

**Pack** : une ou plusieurs formations. **Prix calculé automatiquement** (somme des formations), **modifiable** à la main. Sur le lien public, le prix n'est jamais affiché en total, uniquement en **3 tranches** (en francs entiers, la dernière absorbe le reste : 250 000 → 83 333 · 83 333 · 83 334).

**Pro forma** : peut couvrir **un ou plusieurs projets**, avec ou sans client. Copier son lien (`/pf/<jeton>`) l'**envoie** (statut « Envoyée ») et lui appose la **signature électronique** de l'émetteur. Le client voit le document et clique **Valider** ou **Refuser** :
- *Valider* génère automatiquement la **facture commerciale** (si la pro forma n'a pas de client, le signataire saisit son identité et est ajouté à la base clients, statut « qualifié »).
- *Refuser* enregistre un motif facultatif, aucune facture n'est créée.
- Modifier une pro forma déjà signée annule la signature et la remet en brouillon.
- Une pro forma facturée est **verrouillée** (contenu, projets, suppression).

**Facture commerciale** : générée depuis une pro forma acceptée (manuellement ou par validation du client), **immuable**, avec son lien de consultation (`/f/<jeton>`) copiable.

**Signatures** : les deux types de factures sont signés. Le cachet contient le nom du signataire, la date et l'**empreinte SHA-256 du contenu** ; la facture porte aussi la signature du client quand c'est lui qui a validé. L'API recalcule l'empreinte à chaque lecture et signale toute altération. Le client décide sur l'empreinte exacte qu'il a vue : si le document change entre-temps, la décision est refusée (`DOCUMENT_MODIFIE`).

**Journal** (qui, quoi, quand) : changement de statut client, modification de pro forma, génération de facture, **inscription via un lien**, **validation / refus par un client**. Les actions de tiers apparaissent sous la forme « Nom (lien public) ».

**Garanties en base** : `facture_commerciale` et `journal` sont en lecture seule (triggers), une seule facture par pro forma, numérotation PF-/FC-AAAA-NNNN par séquence.

## Sécurité des liens publics

- Jeton aléatoire de 144 bits (36 caractères hexadécimaux), pas de numéro séquentiel : non devinable.
- Aucune donnée interne exposée (identifiants, créateur, prix total des packs).
- Limitation de fréquence par IP (30 lectures/min, 5 écritures/min par route), champs bornés, entrées validées.
- Réponses d'inscription identiques que l'e-mail soit connu ou non (pas de fuite sur la base clients).
- Un lien inconnu ou mal formé renvoie toujours le même message générique.

## Tests

```bash
cd backend && npm test                                  # 12 tests unitaires (tranches, totaux, empreintes)
python -I backend/scripts/e2e.py                        # scénario API : 170 vérifications
```

`e2e.py` suppose l'API sur `127.0.0.1:3000`, une **base métier vide** (voir ci-dessous) et « Direct access grants » activé sur le client `crm-frontend` (dev uniquement, le realm versionné le désactive) :

```bash
MSYS_NO_PATHCONV=1 docker exec crm-keycloak-1 /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password admin
MSYS_NO_PATHCONV=1 docker exec crm-keycloak-1 /opt/keycloak/bin/kcadm.sh update clients/<id-de-crm-frontend> -r crm -s directAccessGrantsEnabled=true
# remise à zéro des données métier :
docker exec crm-postgres-1 psql -U crm -d crm -c "TRUNCATE journal, ligne_facture_commerciale, facture_commerciale, ligne_proforma, proforma_projet, proforma, tache, pack_formation, pack, projet_inscription, projet, formation, client RESTART IDENTITY CASCADE" -c "ALTER SEQUENCE proforma_numero_seq RESTART 1" -c "ALTER SEQUENCE facture_numero_seq RESTART 1"
```

Parcours navigateur (Playwright, Chrome installé, `npm i playwright` hors dépôt) :

| Script | Front | Vérifie |
|---|---|---|
| `e2e/ui-mock.mjs` | `:8081`, mode démo | parcours complet + pages publiques en démo (24 vérifications) |
| `e2e/ui-real.mjs` | `:8082`, réel | agent puis chef avec Keycloak (19 vérifications) |
| `e2e/ui-public.mjs` | `:8082`, réel | liens publics en navigation anonyme : inscription, validation, refus, facture signée (16 vérifications) |

**Démo enregistrée** : `backend/scripts/seed_demo.py` insère des données réalistes, puis `e2e/demo-video.mjs` rejoue le parcours complet (agent, prospect, client, chef) et enregistre une vidéo avec sous-titres.

## Migrations

`db/liquibase/changelog/changes/NNNN-*.sql`, jamais d'édition d'un changeset déjà appliqué (corriger par une nouvelle migration).
`docker compose -f docker/docker-compose.yml run --rm liquibase update`

## Déploiement sur le VPS

1. DNS : deux enregistrements A vers le VPS (`CRM_DOMAIN`, `AUTH_DOMAIN`). Docker + plugin compose installés.
2. `cp docker/.env.prod.example docker/.env.prod` puis renseigner domaines et mots de passe.
3. `docker compose -f docker/docker-compose.prod.yml --env-file docker/.env.prod up -d --build`
4. Keycloak : se connecter à `https://AUTH_DOMAIN` avec le compte admin, realm `crm` > Users : créer les comptes, définir leur mot de passe, leur attribuer le rôle de realm `agent` ou `chef_equipe`. Aucun compte de démo n'est importé en production.
5. Seul Caddy publie des ports (80/443) ; Postgres, API, front et Keycloak restent sur le réseau interne. Caddy transmet l'IP réelle du visiteur (`X-Forwarded-For`), utilisée par la limitation de fréquence des liens publics.

## Hypothèses et limites du MVP

- Équipe unique par défaut ; devise XOF, montants en centimes.
- La « signature » est un cachet électronique (nom, date, empreinte SHA-256), pas une signature qualifiée au sens eIDAS.
- Aucun e-mail n'est envoyé : le lien est copié par l'agent et transmis par le canal de son choix.
- Sauvegarde Postgres à planifier (`pg_dump`), console d'administration Keycloak à restreindre par IP si besoin.
- Les mots de passe `admin/admin`, `crm/crm` et les comptes `agent`/`chef` sont des valeurs **de développement** : ne jamais les utiliser en production (le compose de production exige des secrets explicites).
