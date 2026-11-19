import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { isApiError } from "@/api/client";

export const errMsg = (e: unknown): string => {
  if (isApiError(e)) return e.status === 429 ? "Trop de tentatives : réessayez dans une minute." : e.message;
  return e instanceof Error ? e.message : "Erreur inattendue.";
};

/** Reporte les erreurs 422 { details: { champ: message } } sur les champs d'un formulaire. Renvoie true si traité. */
export function applyFieldErrors<T extends FieldValues>(e: unknown, setError: UseFormSetError<T>): boolean {
  if (!isApiError(e) || e.status !== 422 || typeof e.details !== "object" || e.details === null) return false;
  let any = false;
  for (const [k, v] of Object.entries(e.details as Record<string, unknown>)) {
    if (typeof v === "string") {
      setError(k as Path<T>, { message: v });
      any = true;
    }
  }
  return any;
}
