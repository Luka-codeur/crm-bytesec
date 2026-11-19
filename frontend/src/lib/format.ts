import { addWeeks, endOfISOWeek, format, getISOWeek, getISOWeekYear, parseISO, startOfISOWeek } from "date-fns";
import { fr } from "date-fns/locale";

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** Montant en centimes -> "125 000 FCFA" */
export function formatMontant(centimes: number, devise = "FCFA"): string {
  return `${nf.format(Math.round(centimes / 100))}\u00a0${devise}`;
}

export const toDate = (iso: string) => parseISO(iso);
/** "mardi 17 novembre 2026" */
export const formatDate = (iso: string) => format(parseISO(iso), "EEEE d MMMM yyyy", { locale: fr });
export const formatDateCourte = (iso: string) => format(parseISO(iso), "d MMM yyyy", { locale: fr });
export const formatDateHeure = (iso: string) =>
  format(parseISO(iso), "d MMM yyyy 'à' HH:mm", { locale: fr });

/** Semaine ISO "2026-W47" */
export function toIsoWeek(d: Date): string {
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, "0")}`;
}

export function weekRange(semaine: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(semaine);
  if (!m) return null;
  const start = addWeeks(startOfISOWeek(new Date(Number(m[1]), 0, 4)), Number(m[2]) - 1);
  return { start, end: endOfISOWeek(start) };
}

export function shiftWeek(semaine: string, n: number): string {
  const r = weekRange(semaine);
  return r ? toIsoWeek(addWeeks(r.start, n)) : semaine;
}

export function formatWeekLabel(semaine: string): string {
  const r = weekRange(semaine);
  if (!r) return semaine;
  return `Semaine ${getISOWeek(r.start)} · ${format(r.start, "d MMM", { locale: fr })} – ${format(r.end, "d MMM yyyy", { locale: fr })}`;
}

export const centimesToUnits = (c: number) => Math.round(c / 100);
export const unitsToCentimes = (u: number) => Math.round(u * 100);
