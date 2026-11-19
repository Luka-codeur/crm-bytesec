# Bytesec Client Compass

Construis le front-end d'un CRM interne nommé "ByteSec CRM" (MVP, UI en français). Il consomme une API REST NestJS externe. N'utilise PAS Supabase ni de backend Lovable.

## 1. Stack et contraintes techniques
- React 19 + TypeScript + Vite, Tailwind, shadcn/ui, React Router, TanStack Query, react-hook-form + zod, lucide-react, date-fns (locale fr).
- Toute la couche réseau est isolée dans `src/api/` : un client `fetch` (base URL = `import.meta.env.VITE_API_URL`) et un fichier par ressource (clients.ts, projects.ts, ...).
- Mode mock : si `VITE_USE_MOCK=true` (valeur par défaut dans Lovable), les fonctions de `src/api/` retournent des données en mémoire réalistes (en français, noms africains et francophones variés, 15 clients, 5 projets, 6 factures, 12 tâches, 20 entrées de journal) avec un délai simulé de 300 ms. Le passage au vrai backend ne doit nécessiter aucun changement dans les composants.
- Authentification : Keycloak (OIDC, flow Authorization Code + PKCE) via `keycloak-js`. Encapsule dans un `AuthProvider` avec `useAuth()` qui expose `{ user: {id, nom, email, role}, token, logout }`. Rôles lus dans le token : `agent` ou `chef_equipe`. En mode mock, affiche un sélecteur de rôle sur l'écran de connexion ("Se connecter en tant qu'Agent / Chef d'équipe") pour pouvoir tester les deux vues. Le client API ajoute `Authorization: Bearer <token>`.
- Variables d'environnement : VITE_API_URL, VITE_KEYCLOAK_URL, VITE_KEYCLOAK_REALM, VITE_KEYCLOAK_CLIENT_ID, VITE_USE_MOCK.
- Tous les types TypeScript du domaine sont dans `src/types/` (voir §3). Les dates sont des chaînes ISO 8601. Les montants sont des entiers en centimes (XOF par défaut) avec un helper `formatMontant`.

## 2. Design
- Sobre, professionnel, orienté productivité. Sidebar fixe à gauche (repliable), header avec nom de l'utilisateur, badge de rôle et bouton déconnexion. Responsive (tablette minimum, mobile correct).
- Couleur primaire bleu nuit (#0B2545) avec accent turquoise (#13A89E). Mode clair par défaut, dark mode supporté.
- Badges de statut colorés cohérents partout. Prospect = gris, Qualifié = orange, Confirmé = vert. Tâches : À faire = gris, En cours = bleu, Terminée = vert. Pro forma : Brouillon = gris, Envoyée = bleu, Acceptée = vert, Refusée = rouge.
- Chaque liste a : état de chargement (skeleton), état vide avec illustration/texte et bouton d'action, état d'erreur avec "Réessayer". Toasts (sonner) pour chaque succès/erreur. Confirmation (AlertDialog) avant toute suppression.

## 3. Modèle de données (types)
- Utilisateur { id, nom, prenom, email, role: 'agent' | 'chef_equipe', equipeId }
- Client { id, nom, prenom, adresse, email, telephone, statut: 'prospect' | 'qualifie' | 'confirme', projetId?: string, ajoutePar: {id, nom}, creeLe, modifieLe }
- Formation { id, titre, description, dureeHeures, prixCentimes }
- Pack { id, nom, description, formations: Formation[], prixCentimes }
- Projet { id, nom, description, clientId, packs: Pack[], statut: 'brouillon' | 'envoye', envoyeLe?, creeLe }
- LigneFacture { designation, quantite, prixUnitaireCentimes }
- FactureProforma { id, numero (PF-2026-0001), clientId, projetId?, lignes: LigneFacture[], tvaPourcent, statut: 'brouillon' | 'envoyee' | 'acceptee' | 'refusee', creeLe, modifieLe }
- FactureCommerciale { id, numero (FC-2026-0001), proformaId, clientId, lignes, tvaPourcent, totalHtCentimes, totalTtcCentimes, emiseLe, emisePar } — LECTURE SEULE, aucune modification possible.
- Tache { id, titre, description, assigneAId, assignePar, statut: 'a_faire' | 'en_cours' | 'terminee', echeance?, creeLe }
- JournalEntree { id, acteur: {id, nom}, action: 'PROFORMA_MODIFIEE' | 'FACTURE_GENEREE' | 'STATUT_CLIENT_MODIFIE', cible: {type, id, libelle}, details: { avant?, apres? }, date }

## 4. Pages et routes
Toutes protégées par l'auth. Route `/` redirige vers `/clients`.

### /clients (liste)
- Tableau : nom complet, e-mail, téléphone, statut (badge), projet assigné, ajouté par, date de création.
- Filtres : statut (select multiple) ET semaine de création (sélecteur de semaine ISO avec boutons "semaine précédente / suivante / cette semaine"), recherche texte (nom, e-mail). Les filtres sont synchronisés dans l'URL (query params). Bouton "Réinitialiser".
- Bouton "Nouveau client" → dialog/formulaire (nom, prénom, adresse, e-mail, téléphone, statut). Validation zod (e-mail valide, téléphone requis).
- Clic sur une ligne → /clients/:id.
- Hypothèse : l'agent ne voit que les clients qu'il a ajoutés ; le chef d'équipe voit ceux de toute son équipe, avec en plus un filtre "Ajouté par".

### /clients/:id (détail)
- En-tête avec infos du client, bouton "Modifier", et changement de statut via un menu déroulant (chaque changement ouvre une confirmation et est tracé dans le journal).
- Onglets : Projets, Factures (pro forma + commerciales), Historique (entrées du journal liées à ce client).
- Un client peut avoir plusieurs projets, mais un seul "projet assigné" principal (champ affiché dans la liste).

### /projets
- Liste en cartes ou tableau : nom, client, nombre de packs, statut (Brouillon / Envoyé).
- "Nouveau projet" → page de création/édition /projets/nouveau et /projets/:id/modifier : champs nom, description, client (combobox avec recherche), puis un constructeur de packs : ajouter/retirer des packs, et dans chaque pack ajouter/retirer des formations (créer à la volée ou choisir dans un catalogue). Prix du pack calculé ou saisi.
- Détail /projets/:id avec bouton "Envoyer au client" (dialog de confirmation affichant l'e-mail du client ; passe le statut à "Envoyé" et appelle POST /projets/:id/envoyer). Boutons Modifier, Supprimer (confirmation).

### /factures
- Deux onglets : "Pro forma" et "Commerciales".
- Pro forma : tableau (numéro, client, total TTC, statut, date). Bouton "Nouvelle pro forma". Page d'édition avec éditeur de lignes (désignation, quantité, prix unitaire), TVA %, totaux HT/TVA/TTC calculés en direct. Modifier et supprimer autorisés tant que la pro forma n'est pas convertie en facture commerciale. Boutons de changement de statut : Envoyée, Acceptée, Refusée.
- Sur une pro forma au statut "Acceptée" : bouton principal "Générer la facture commerciale" (confirmation : "Cette action est irréversible, la facture ne pourra plus être modifiée"). Une fois générée, la pro forma devient verrouillée et affiche un lien vers sa facture commerciale.
- Commerciales : tableau en lecture seule + page de détail façon document imprimable (en-tête ByteSec, infos client, lignes, totaux) avec bouton "Imprimer / PDF" (window.print avec feuille de style print propre). AUCUN bouton modifier/supprimer, et un bandeau "Document non modifiable".

### /taches
- Vue agent : "Mes tâches" en colonnes Kanban (À faire / En cours / Terminée) avec drag-and-drop ET un menu de changement de statut accessible au clavier. Il peut changer le statut de ses tâches, pas les créer.
- Vue chef d'équipe : onglets "Avancement de l'équipe" et "Toutes les tâches".
  - Avancement : une carte par agent avec barre de progression (terminées / total), compteurs par statut, et liste de ses tâches en cours.
  - Toutes les tâches : tableau filtrable par agent, statut, échéance. Bouton "Assigner une tâche" (titre, description, agent assigné, échéance). Peut modifier/supprimer.
- Tâches en retard (échéance dépassée et non terminée) : badge rouge "En retard".

### /journal
- Accessible au chef d'équipe uniquement (l'agent voit seulement l'onglet Historique dans la fiche client). Tableau chronologique inversé : date/heure, qui, action (libellé français lisible), cible (lien vers l'objet), détails. Pour un changement de statut ou une modif de pro forma, affiche le diff avant → après (ex. "Statut : Prospect → Qualifié"). Filtres par action, acteur et période. Pagination.
- Le journal est en lecture seule, aucune action d'édition.

## 5. Contrat d'API attendu (à implémenter dans src/api/, avec mock)
Préfixe /api. Réponses de liste : { data: T[], total: number, page: number, pageSize: number }. Erreurs : { message: string, code: string, details?: ... }.
- GET/POST /clients ; GET/PATCH/DELETE /clients/:id ; PATCH /clients/:id/statut { statut }
  Query de liste : statut[], semaine (format 2026-W47), q, ajoutePar, page, pageSize
- GET/POST /projets ; GET/PATCH/DELETE /projets/:id ; POST /projets/:id/envoyer
- GET /formations, POST /formations (catalogue)
- GET/POST /proformas ; GET/PATCH/DELETE /proformas/:id ; PATCH /proformas/:id/statut ; POST /proformas/:id/generer-facture → FactureCommerciale
- GET /factures-commerciales ; GET /factures-commerciales/:id
- GET/POST /taches ; PATCH /taches/:id ; PATCH /taches/:id/statut ; GET /taches/avancement-equipe
- GET /journal (query : action, acteurId, du, au, clientId, page)
- GET /me → Utilisateur
Gère les codes 401 (redirige vers login), 403 (page "Accès refusé"), 404, 409 (conflit, ex. pro forma déjà convertie) et 422 (erreurs de validation mappées sur les champs du formulaire).

## 6. Règles métier à respecter côté UI
1. Une facture commerciale n'est jamais modifiable ni supprimable : aucun contrôle d'édition dans l'UI.
2. Une facture commerciale ne se génère que depuis une pro forma "Acceptée", une seule fois par pro forma.
3. Chaque changement de statut client, modification de pro forma et génération de facture déclenche un toast "Action enregistrée dans le journal".
4. Les éléments de navigation et les boutons réservés au chef d'équipe sont masqués pour l'agent (journal, assignation de tâches, avancement d'équipe, filtre "Ajouté par"). Cette protection n'est que de l'ergonomie : le vrai contrôle est côté API.
5. Tous les libellés, dates (ex. "mardi 17 novembre 2026") et montants (ex. "125 000 FCFA") sont en français.

## 7. Livrables et ordre de construction
1. Layout, routing, AuthProvider (mock + Keycloak), client API et mocks.
2. Clients (liste, filtres, détail, formulaire).
3. Projets/packs/formations.
4. Pro forma et factures commerciales (avec impression).
5. Tâches (vue agent + vue chef).
6. Journal.
Garde le code modulaire (un dossier par fonctionnalité dans src/features/), sans logique métier dans les composants de page. Ne génère pas de pages hors de ce périmètre : pas de paiements, relances automatiques, tableaux de bord avancés ni application mobile.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/39501612-d9f3-4003-b4db-eb154810080b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
