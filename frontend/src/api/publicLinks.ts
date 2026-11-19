import { call, http } from "./client";
import * as mock from "./mock/handlers";
import type { DecisionInput, FacturePublic, InscriptionInput, ProformaPublic, ProjetPublic } from "@/types";

/** Liens de consultation : aucune authentification, le jeton du lien fait office d'autorisation. */
export const publicApi = {
  projet: (token: string) => call(() => mock.publicLinks.projet(token), () => http.get<ProjetPublic>(`/public/projets/${token}`)),
  inscrire: (token: string, d: InscriptionInput) =>
    call(() => mock.publicLinks.inscrire(token, d), () => http.post<{ ok: true }>(`/public/projets/${token}/inscription`, d)),
  proforma: (token: string) => call(() => mock.publicLinks.proforma(token), () => http.get<ProformaPublic>(`/public/proformas/${token}`)),
  valider: (token: string, d: DecisionInput) =>
    call<{ statut: "acceptee"; factureToken: string }>(
      () => mock.publicLinks.decider(token, "valider", d) as { statut: "acceptee"; factureToken: string },
      () => http.post<{ statut: "acceptee"; factureToken: string }>(`/public/proformas/${token}/valider`, d),
    ),
  refuser: (token: string, d: DecisionInput) =>
    call(() => mock.publicLinks.decider(token, "refuser", d), () => http.post<{ statut: "refusee" }>(`/public/proformas/${token}/refuser`, d)),
  facture: (token: string) => call(() => mock.publicLinks.facture(token), () => http.get<FacturePublic>(`/public/factures/${token}`)),
};
