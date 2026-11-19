import { call, http } from "./client";
import * as mock from "./mock/handlers";
import type { JournalEntree, JournalQuery, ListResponse } from "@/types";

export const journalApi = {
  list: (q: JournalQuery) => call(() => mock.journal.list(q), () => http.get<ListResponse<JournalEntree>>("/journal", q)),
};
