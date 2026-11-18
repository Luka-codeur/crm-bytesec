import type { ColumnType, Generated } from 'kysely';

/**
 * Écrit à la main pour refléter db/liquibase/changelog/changes/*.sql.
 * Liquibase reste la seule source de vérité du schéma. Les parsers pg
 * (database.module.ts) convertissent BIGINT/NUMERIC en number et DATE en
 * chaîne 'YYYY-MM-DD'.
 */
type Ts = ColumnType<Date, Date | string | undefined, Date | string>;

export interface EquipeTable {
  id: Generated<string>;
  nom: string;
  cree_le: Generated<Date>;
}

export interface UtilisateurTable {
  id: Generated<string>;
  keycloak_id: string;
  email: string;
  nom: string;
  prenom: string;
  role: 'agent' | 'chef_equipe';
  equipe_id: string;
  cree_le: Generated<Date>;
}

export interface ClientTable {
  id: Generated<string>;
  nom: string;
  prenom: string;
  adresse: Generated<string>;
  email: string;
  telephone: string;
  statut: Generated<'prospect' | 'qualifie' | 'confirme'>;
  projet_id: string | null;
  ajoute_par: string;
  cree_le: Generated<Date>;
  modifie_le: Generated<Date>;
}

export interface FormationTable {
  id: Generated<string>;
  titre: string;
  description: Generated<string>;
  duree_heures: number;
  prix_centimes: number;
  cree_le: Generated<Date>;
}

export interface ProjetTable {
  id: Generated<string>;
  nom: string;
  description: Generated<string>;
  client_id: string | null;
  token_consultation: Generated<string>;
  statut: Generated<'brouillon' | 'envoye'>;
  envoye_le: Ts | null;
  cree_par: string;
  cree_le: Generated<Date>;
  modifie_le: Generated<Date>;
}

export interface PackTable {
  id: Generated<string>;
  projet_id: string;
  nom: string;
  description: Generated<string>;
  prix_centimes: number;
  nb_tranches: Generated<number>;
  prix_personnalise: Generated<boolean>;
  position: Generated<number>;
}

export interface ProjetInscriptionTable {
  id: Generated<string>;
  projet_id: string;
  client_id: string;
  cree_le: Generated<Date>;
}

export interface ProformaProjetTable {
  proforma_id: string;
  projet_id: string;
}

export interface PackFormationTable {
  pack_id: string;
  formation_id: string;
  position: Generated<number>;
}

export interface ProformaTable {
  id: Generated<string>;
  numero: string;
  client_id: string | null;
  token_consultation: Generated<string>;
  signe_par: string | null;
  signe_le: Date | null;
  decision_client_nom: string | null;
  decision_client_le: Date | null;
  decision_hash: string | null;
  tva_pourcent: Generated<number>;
  statut: Generated<'brouillon' | 'envoyee' | 'acceptee' | 'refusee'>;
  cree_par: string;
  cree_le: Generated<Date>;
  modifie_le: Generated<Date>;
}

export interface LigneProformaTable {
  id: Generated<string>;
  proforma_id: string;
  position: Generated<number>;
  designation: string;
  quantite: number;
  prix_unitaire_centimes: number;
}

export interface FactureCommercialeTable {
  id: Generated<string>;
  numero: string;
  proforma_id: string;
  client_id: string;
  tva_pourcent: number;
  total_ht_centimes: number;
  total_ttc_centimes: number;
  emise_par: string;
  emise_le: Generated<Date>;
  token_consultation: Generated<string>;
  signature_nom: string | null;
  signature_le: Date | null;
  signature_hash: string | null;
  client_signataire: string | null;
  client_signe_le: Date | null;
}

export interface LigneFactureCommercialeTable {
  id: Generated<string>;
  facture_id: string;
  position: Generated<number>;
  designation: string;
  quantite: number;
  prix_unitaire_centimes: number;
}

export interface TacheTable {
  id: Generated<string>;
  titre: string;
  description: Generated<string>;
  assigne_a: string;
  assigne_par: string;
  statut: Generated<'a_faire' | 'en_cours' | 'terminee'>;
  echeance: string | null;
  cree_le: Generated<Date>;
  modifie_le: Generated<Date>;
}

export interface JournalTable {
  id: Generated<string>;
  acteur_id: string;
  action:
    | 'PROFORMA_MODIFIEE'
    | 'FACTURE_GENEREE'
    | 'STATUT_CLIENT_MODIFIE'
    | 'CLIENT_INSCRIT'
    | 'PROFORMA_VALIDEE_CLIENT'
    | 'PROFORMA_REFUSEE_CLIENT';
  cible_type: 'client' | 'proforma' | 'facture_commerciale' | 'projet';
  acteur_externe: string | null;
  cible_id: string;
  cible_libelle: string;
  client_id: string | null;
  avant: ColumnType<Record<string, unknown> | null, string | null, never>;
  apres: ColumnType<Record<string, unknown> | null, string | null, never>;
  date: Generated<Date>;
}

export interface Database {
  equipe: EquipeTable;
  utilisateur: UtilisateurTable;
  client: ClientTable;
  formation: FormationTable;
  projet: ProjetTable;
  pack: PackTable;
  pack_formation: PackFormationTable;
  projet_inscription: ProjetInscriptionTable;
  proforma_projet: ProformaProjetTable;
  proforma: ProformaTable;
  ligne_proforma: LigneProformaTable;
  facture_commerciale: FactureCommercialeTable;
  ligne_facture_commerciale: LigneFactureCommercialeTable;
  tache: TacheTable;
  journal: JournalTable;
}
