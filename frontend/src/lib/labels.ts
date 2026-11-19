import type { ActionJournal, Role, StatutClient, StatutProforma, StatutProjet, StatutTache } from "@/types";

export type Tone = "neutral" | "warning" | "success" | "info" | "danger";

export const ROLE_LABEL: Record<Role, string> = { agent: "Agent", chef_equipe: "Chef d'équipe" };

export const STATUT_CLIENT: Record<StatutClient, { label: string; tone: Tone }> = {
  prospect: { label: "Prospect", tone: "neutral" },
  qualifie: { label: "Qualifié", tone: "warning" },
  confirme: { label: "Confirmé", tone: "success" },
};
export const STATUT_TACHE: Record<StatutTache, { label: string; tone: Tone }> = {
  a_faire: { label: "À faire", tone: "neutral" },
  en_cours: { label: "En cours", tone: "info" },
  terminee: { label: "Terminée", tone: "success" },
};
export const STATUT_PROFORMA: Record<StatutProforma, { label: string; tone: Tone }> = {
  brouillon: { label: "Brouillon", tone: "neutral" },
  envoyee: { label: "Envoyée", tone: "info" },
  acceptee: { label: "Acceptée", tone: "success" },
  refusee: { label: "Refusée", tone: "danger" },
};
export const STATUT_PROJET: Record<StatutProjet, { label: string; tone: Tone }> = {
  brouillon: { label: "Brouillon", tone: "neutral" },
  envoye: { label: "Partagé", tone: "info" },
};

export const ACTION_JOURNAL: Record<ActionJournal, string> = {
  STATUT_CLIENT_MODIFIE: "Changement de statut client",
  PROFORMA_MODIFIEE: "Modification de pro forma",
  FACTURE_GENEREE: "Génération de facture commerciale",
  CLIENT_INSCRIT: "Inscription via un lien de projet",
  PROFORMA_VALIDEE_CLIENT: "Pro forma validée par le client",
  PROFORMA_REFUSEE_CLIENT: "Pro forma refusée par le client",
};

export const CHAMP_LABEL: Record<string, string> = {
  statut: "Statut",
  totalTtcCentimes: "Total TTC",
  tvaPourcent: "TVA",
  nbLignes: "Lignes",
  lignes: "Lignes",
  totalHtCentimes: "Total HT",
  proforma: "Pro forma",
  projet: "Projet",
  nouveauClient: "Nouveau client",
  motif: "Motif du refus",
  numero: "Numéro",
};
