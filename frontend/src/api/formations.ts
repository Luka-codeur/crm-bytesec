import { call, http } from "./client";
import * as mock from "./mock/handlers";
import type { Formation } from "@/types";

export const formationsApi = {
  list: () => call(() => mock.formations.list(), () => http.get<Formation[]>("/formations")),
  create: (input: Omit<Formation, "id">) => call(() => mock.formations.create(input), () => http.post<Formation>("/formations", input)),
};
