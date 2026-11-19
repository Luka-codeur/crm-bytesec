import { call, http } from "./client";
import * as mock from "./mock/handlers";
import type { FactureCommerciale, ListResponse } from "@/types";

/** Factures commerciales : lecture seule, aucune méthode d'écriture. */
export const facturesApi = {
  list: (q: { clientId?: string } = {}) =>
    call(() => mock.facturesCommerciales.list(q), () => http.get<ListResponse<FactureCommerciale>>("/factures-commerciales", q)),
  get: (id: string) => call(() => mock.facturesCommerciales.get(id), () => http.get<FactureCommerciale>(`/factures-commerciales/${id}`)),
};
