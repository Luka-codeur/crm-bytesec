import { call, http } from "./client";
import * as mock from "./mock/handlers";
import type { Client, ClientsQuery, ListResponse, StatutClient } from "@/types";

export type ClientInput = Pick<Client, "nom" | "prenom" | "adresse" | "email" | "telephone" | "statut">;

export const clientsApi = {
  list: (q: ClientsQuery) => call(() => mock.clients.list(q), () => http.get<ListResponse<Client>>("/clients", q)),
  get: (id: string) => call(() => mock.clients.get(id), () => http.get<Client>(`/clients/${id}`)),
  create: (input: ClientInput) => call(() => mock.clients.create(input), () => http.post<Client>("/clients", input)),
  update: (id: string, patch: Partial<ClientInput> & { projetId?: string }) =>
    call(() => mock.clients.update(id, patch), () => http.patch<Client>(`/clients/${id}`, patch)),
  remove: (id: string) => call(() => mock.clients.remove(id), () => http.del(`/clients/${id}`)),
  setStatut: (id: string, statut: StatutClient) =>
    call(() => mock.clients.setStatut(id, statut), () => http.patch<Client>(`/clients/${id}/statut`, { statut })),
};
