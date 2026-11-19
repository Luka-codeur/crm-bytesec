import { call, http } from "./client";
import * as mock from "./mock/handlers";
import type { Utilisateur } from "@/types";

export const usersApi = {
  me: () => call(() => mock.me(), () => http.get<Utilisateur>("/me")),
  /** Membres de l'équipe (agents + chef), pour les filtres et l'assignation. */
  equipe: () => call(() => mock.equipe.list(), () => http.get<Utilisateur[]>("/utilisateurs/equipe")),
};
