import { call, http } from "./client";
import * as mock from "./mock/handlers";
import type { FactureCommerciale, FactureProforma, ListResponse, StatutProforma } from "@/types";

export interface ProformaInput {
  clientId?: string | undefined;
  projetIds: string[];
  lignes: FactureProforma["lignes"];
  tvaPourcent: number;
}

export const proformasApi = {
  list: (q: { clientId?: string } = {}) => call(() => mock.proformas.list(q), () => http.get<ListResponse<FactureProforma>>("/proformas", q)),
  get: (id: string) => call(() => mock.proformas.get(id), () => http.get<FactureProforma>(`/proformas/${id}`)),
  create: (input: ProformaInput) => call(() => mock.proformas.create(input), () => http.post<FactureProforma>("/proformas", input)),
  update: (id: string, patch: Partial<ProformaInput>) => call(() => mock.proformas.update(id, patch), () => http.patch<FactureProforma>(`/proformas/${id}`, patch)),
  remove: (id: string) => call(() => mock.proformas.remove(id), () => http.del(`/proformas/${id}`)),
  setStatut: (id: string, statut: StatutProforma) =>
    call(() => mock.proformas.setStatut(id, statut), () => http.patch<FactureProforma>(`/proformas/${id}/statut`, { statut })),
  genererFacture: (id: string) =>
    call(() => mock.proformas.genererFacture(id), () => http.post<FactureCommerciale>(`/proformas/${id}/generer-facture`)),
};
