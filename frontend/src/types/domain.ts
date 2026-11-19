export type Role = "agent" | "chef_equipe";

export interface Utilisateur {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  role: Role;
  equipeId: string;
}

export interface RefUtilisateur {
  id: string;
  nom: string;
}

export type StatutClient = "prospect" | "qualifie" | "confirme";

export interface Client {
  id: string;
  nom: string;
  prenom: string;
  adresse: string;
  email: string;
  telephone: string;
  statut: StatutClient;
  projetId?: string | undefined;
  ajoutePar: RefUtilisateur;
  creeLe: string;
  modifieLe: string;
}

export interface Formation {
  id: string;
  titre: string;
  description: string;
  dureeHeures: number;
  prixCentimes: number;
}

export interface Pack {
  id: string;
  nom: string;
  description: string;
  formations: Formation[];
  /** Prix final : somme des formations par défaut, modifiable. */
  prixCentimes: number;
  /** Somme des prix des formations (prix calculé automatiquement). */
  prixAutoCentimes: number;
  /** Vrai si le prix a été modifié manuellement. */
  prixPersonnalise: boolean;
  nbTranches: number;
  /** Prix découpé en tranches (la dernière absorbe l'éventuel reste). */
  tranchesCentimes: number[];
}

/** Pack tel qu'envoyé à l'API : `prixCentimes` absent = calcul automatique. */
export interface PackInput {
  nom: string;
  description: string;
  prixCentimes?: number | undefined;
  formations: { id: string }[];
}

export type StatutProjet = "brouillon" | "envoye";

export interface Projet {
  id: string;
  nom: string;
  description: string;
  /** Hérité : un projet n'est plus rattaché à un client, les clients s'inscrivent via le lien. */
  clientId?: string | undefined;
  /** Un projet peut n'avoir aucun pack. */
  packs: Pack[];
  statut: StatutProjet;
  envoyeLe?: string | undefined;
  creeLe: string;
  /** Jeton du lien de consultation public (/p/<jeton>). */
  tokenConsultation: string;
  inscritsCount: number;
}

export interface Inscrit {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  statut: StatutClient;
  inscritLe: string;
}

export interface SignatureEmetteur {
  par: RefUtilisateur;
  le: string;
  /** Empreinte SHA-256 du contenu signé. */
  hash: string;
}

export interface LigneFacture {
  designation: string;
  quantite: number;
  prixUnitaireCentimes: number;
}

export type StatutProforma = "brouillon" | "envoyee" | "acceptee" | "refusee";

export interface FactureProforma {
  id: string;
  numero: string;
  /** Une pro forma peut être propre à un client, ou non (le client s'identifie en validant). */
  clientId?: string | undefined;
  /** Une pro forma peut couvrir un ou plusieurs projets. */
  projetIds: string[];
  lignes: LigneFacture[];
  tvaPourcent: number;
  statut: StatutProforma;
  /** Renseigné une fois la facture commerciale générée : la pro forma est alors verrouillée. */
  factureCommercialeId?: string | undefined;
  factureToken?: string | undefined;
  /** Jeton du lien de consultation public (/pf/<jeton>). */
  tokenConsultation: string;
  /** Cachet de l'émetteur, apposé à l'envoi. */
  signature?: SignatureEmetteur | undefined;
  /** Décision prise par le client via le lien (validation ou refus). */
  decisionClient?: { nom: string; le: string } | undefined;
  creeLe: string;
  modifieLe: string;
}

export interface FactureCommerciale {
  id: string;
  numero: string;
  proformaId: string;
  clientId: string;
  lignes: LigneFacture[];
  tvaPourcent: number;
  totalHtCentimes: number;
  totalTtcCentimes: number;
  emiseLe: string;
  emisePar: RefUtilisateur;
  /** Jeton du lien de consultation public (/f/<jeton>). */
  tokenConsultation: string;
  signature?: { nom: string; le: string; hash: string; valide: boolean } | undefined;
  signatureClient?: { nom: string; le: string } | undefined;
}

export type StatutTache = "a_faire" | "en_cours" | "terminee";

export interface Tache {
  id: string;
  titre: string;
  description: string;
  assigneAId: string;
  assignePar: RefUtilisateur;
  statut: StatutTache;
  echeance?: string | undefined;
  creeLe: string;
}

export type ActionJournal =
  | "PROFORMA_MODIFIEE"
  | "FACTURE_GENEREE"
  | "STATUT_CLIENT_MODIFIE"
  | "CLIENT_INSCRIT"
  | "PROFORMA_VALIDEE_CLIENT"
  | "PROFORMA_REFUSEE_CLIENT";

export interface JournalEntree {
  id: string;
  acteur: RefUtilisateur;
  action: ActionJournal;
  cible: { type: "client" | "proforma" | "facture_commerciale" | "projet"; id: string; libelle: string };
  details: { avant?: Record<string, unknown>; apres?: Record<string, unknown> };
  /** Client concerné, pour l'historique de la fiche client. */
  clientId?: string | undefined;
  date: string;
}

export interface AvancementAgent {
  agent: RefUtilisateur;
  total: number;
  aFaire: number;
  enCours: number;
  terminees: number;
  tachesEnCours: Tache[];
}

/* ---------- Vues publiques (liens de consultation, sans authentification) ---------- */

export interface ProjetPublic {
  nom: string;
  description: string;
  packs: {
    nom: string;
    description: string;
    nbTranches: number;
    tranchesCentimes: number[];
    formations: { titre: string; description: string; dureeHeures: number }[];
  }[];
}

export interface InscriptionInput {
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  adresse?: string | undefined;
}

export interface ProformaPublic {
  numero: string;
  emetteur: string;
  client?: { nom: string } | undefined;
  projets: { nom: string }[];
  lignes: LigneFacture[];
  tvaPourcent: number;
  totalHtCentimes: number;
  totalTtcCentimes: number;
  statut: StatutProforma;
  signature?: { par: string; le: string; hash: string } | undefined;
  /** Empreinte à renvoyer avec la décision : garantit que le client tranche sur ce qu'il a vu. */
  hash: string;
  decision?: { nom: string; le: string } | undefined;
  peutDecider: boolean;
  /** Vrai si la pro forma n'a pas de client : le signataire doit se déclarer. */
  clientAIdentifier: boolean;
  factureToken?: string | undefined;
}

export interface DecisionInput {
  nom: string;
  prenom?: string | undefined;
  email?: string | undefined;
  telephone?: string | undefined;
  adresse?: string | undefined;
  hash: string;
  motif?: string | undefined;
}

export interface FacturePublic {
  numero: string;
  proformaNumero: string;
  emiseLe: string;
  client: { nom: string; adresse: string; email: string; telephone: string };
  lignes: LigneFacture[];
  tvaPourcent: number;
  totalHtCentimes: number;
  totalTtcCentimes: number;
  signature?: { nom: string; le: string; hash: string; valide: boolean } | undefined;
  signatureClient?: { nom: string; le: string } | undefined;
}
