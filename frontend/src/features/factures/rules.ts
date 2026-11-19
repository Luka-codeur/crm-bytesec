import type { FactureProforma, LigneFacture } from "@/types";

export function calcTotaux(lignes: LigneFacture[], tvaPourcent: number) {
  const ht = lignes.reduce((s, l) => s + Math.round((Number(l.quantite) || 0) * (Number(l.prixUnitaireCentimes) || 0)), 0);
  const tva = Math.round((ht * (Number(tvaPourcent) || 0)) / 100);
  return { ht, tva, ttc: ht + tva };
}

/** Pro forma convertie = verrouillée (plus de modification ni suppression). */
export const estVerrouillee = (p: FactureProforma) => Boolean(p.factureCommercialeId);

/** Une facture commerciale se génère uniquement depuis une pro forma acceptée, une seule fois. */
export const peutGenererFacture = (p: FactureProforma) => p.statut === "acceptee" && !estVerrouillee(p) && Boolean(p.clientId);
