import type { ApiErrorBody } from "@/types";

/** Mode mock actif par défaut ; VITE_USE_MOCK=false pour utiliser l'API NestJS. */
export const USE_MOCK = (import.meta.env['VITE_USE_MOCK'] ?? "true") !== "false";
const BASE_URL = `${(import.meta.env['VITE_API_URL'] ?? "").replace(/\/$/, "")}/api`;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

const MESSAGES: Record<number, string> = {
  401: "Session expirée, veuillez vous reconnecter.",
  403: "Accès refusé.",
  404: "Ressource introuvable.",
  409: "Conflit : l'opération n'est plus possible.",
  422: "Certains champs sont invalides.",
};

let getToken: () => Promise<string | undefined> = async () => undefined;
let onUnauthorized: () => void = () => {};

export function configureApi(opts: { getToken: () => Promise<string | undefined>; onUnauthorized: () => void }) {
  getToken = opts.getToken;
  onUnauthorized = opts.onUnauthorized;
}

export function handleError(err: ApiError): never {
  if (err.status === 401) onUnauthorized();
  throw err;
}

type QueryValue = string | number | string[] | undefined | null;

function toQueryString(q?: Record<string, QueryValue>): string {
  if (!q) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(`${k}[]`, x));
    else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function request<T>(method: string, path: string, opts: { query?: object | undefined; body?: unknown } = {}): Promise<T> {
  const token = await getToken();
  let res: Response;
  try {
    res = await fetch(BASE_URL + path + toQueryString(opts.query as Record<string, QueryValue>), {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body === undefined ? null : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Impossible de joindre le serveur.");
  }
  if (!res.ok) {
    let body: Partial<ApiErrorBody> = {};
    try {
      body = await res.json();
    } catch {
      /* corps vide */
    }
    handleError(
      new ApiError(res.status, body.code ?? `HTTP_${res.status}`, body.message ?? MESSAGES[res.status] ?? "Erreur inattendue.", body.details),
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const http = {
  get: <T>(path: string, query?: object) => request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  del: <T = void>(path: string) => request<T>("DELETE", path),
};

/** Exécute la version mock (avec délai simulé et gestion d'erreurs identique) ou l'appel HTTP. */
export async function call<T>(mock: () => T | Promise<T>, real: () => Promise<T>): Promise<T> {
  if (!USE_MOCK) return real();
  await new Promise((r) => setTimeout(r, 300));
  try {
    return structuredClone(await mock());
  } catch (e) {
    if (isApiError(e)) handleError(e);
    throw e;
  }
}
