export interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiErrorBody {
  message: string;
  code: string;
  details?: unknown;
}

export interface ClientsQuery {
  statut?: string[] | undefined;
  semaine?: string | undefined;
  q?: string | undefined;
  ajoutePar?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface JournalQuery {
  action?: string | undefined;
  acteurId?: string | undefined;
  du?: string | undefined;
  au?: string | undefined;
  clientId?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface TachesQuery {
  assigneAId?: string | undefined;
  statut?: string | undefined;
}
