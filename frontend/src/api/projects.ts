import { call, http } from "./client";
import * as mock from "./mock/handlers";
import type { Inscrit, ListResponse, PackInput, Projet } from "@/types";

export interface ProjetInput {
  nom: string;
  description: string;
  /** Un projet peut n'avoir aucun pack. */
  packs: PackInput[];
}

export const projetsApi = {
  list: (q: { clientId?: string } = {}) => call(() => mock.projets.list(q), () => http.get<ListResponse<Projet>>("/projets", q)),
  get: (id: string) => call(() => mock.projets.get(id), () => http.get<Projet>(`/projets/${id}`)),
  create: (input: ProjetInput) => call(() => mock.projets.create(input), () => http.post<Projet>("/projets", input)),
  update: (id: string, patch: Partial<ProjetInput>) => call(() => mock.projets.update(id, patch), () => http.patch<Projet>(`/projets/${id}`, patch)),
  remove: (id: string) => call(() => mock.projets.remove(id), () => http.del(`/projets/${id}`)),
  /** Marque le projet comme partagé (le lien de consultation a été transmis). */
  partager: (id: string) => call(() => mock.projets.partager(id), () => http.post<Projet>(`/projets/${id}/partager`)),
  inscrits: (id: string) => call(() => mock.projets.inscrits(id), () => http.get<Inscrit[]>(`/projets/${id}/inscrits`)),
};
