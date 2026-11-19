import { call, http } from "./client";
import * as mock from "./mock/handlers";
import type { AvancementAgent, ListResponse, StatutTache, Tache, TachesQuery } from "@/types";

export type TacheInput = Pick<Tache, "titre" | "description" | "assigneAId" | "echeance">;

export const tachesApi = {
  list: (q: TachesQuery = {}) => call(() => mock.taches.list(q), () => http.get<ListResponse<Tache>>("/taches", q)),
  create: (input: TacheInput) => call(() => mock.taches.create(input), () => http.post<Tache>("/taches", input)),
  update: (id: string, patch: Partial<TacheInput>) => call(() => mock.taches.update(id, patch), () => http.patch<Tache>(`/taches/${id}`, patch)),
  remove: (id: string) => call(() => mock.taches.remove(id), () => http.del(`/taches/${id}`)),
  setStatut: (id: string, statut: StatutTache) =>
    call(() => mock.taches.setStatut(id, statut), () => http.patch<Tache>(`/taches/${id}/statut`, { statut })),
  avancement: () => call(() => mock.taches.avancement(), () => http.get<AvancementAgent[]>("/taches/avancement-equipe")),
};
