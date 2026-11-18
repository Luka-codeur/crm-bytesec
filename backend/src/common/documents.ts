import { createHash } from 'crypto';

/**
 * Découpe un prix (centimes) en n tranches. Le découpage se fait en unités entières (le FCFA n'a pas
 * de sous-unité) pour que les montants affichés somment exactement au prix ; la dernière tranche
 * absorbe le reste.
 */
export function tranches(prixCentimes: number, n = 3): number[] {
  const nb = Math.max(1, Math.floor(n));
  const base = Math.floor(prixCentimes / 100 / nb) * 100;
  const out = Array.from({ length: nb }, () => base);
  out[nb - 1] = prixCentimes - base * (nb - 1);
  return out;
}

export interface LigneDoc {
  designation: string;
  quantite: number;
  prixUnitaireCentimes: number;
}

export const totaux = (lignes: { quantite: number; prixUnitaireCentimes: number }[], tva: number) => {
  const ht = Math.round(lignes.reduce((s, l) => s + l.quantite * l.prixUnitaireCentimes, 0));
  return { totalHtCentimes: ht, totalTtcCentimes: Math.round(ht * (1 + tva / 100)) };
};

/** Sérialisation déterministe (clés triées) pour que l'empreinte ne dépende pas de l'ordre des propriétés. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

/** Empreinte SHA-256 du contenu d'un document : preuve d'intégrité du cachet électronique. */
export const empreinte = (contenu: unknown): string => createHash('sha256').update(canonical(contenu)).digest('hex');

export interface ContenuProforma {
  numero: string;
  projetIds: string[];
  lignes: LigneDoc[];
  tvaPourcent: number;
}

export const empreinteProforma = (c: ContenuProforma) =>
  empreinte({ ...c, projetIds: [...c.projetIds].sort(), lignes: c.lignes.map((l) => ({ d: l.designation, q: l.quantite, p: l.prixUnitaireCentimes })) });

export interface ContenuFacture {
  numero: string;
  proformaNumero: string;
  clientId: string;
  lignes: LigneDoc[];
  tvaPourcent: number;
  totalHtCentimes: number;
  totalTtcCentimes: number;
  emiseLe: string;
}

export const empreinteFacture = (c: ContenuFacture) =>
  empreinte({ ...c, lignes: c.lignes.map((l) => ({ d: l.designation, q: l.quantite, p: l.prixUnitaireCentimes })) });
