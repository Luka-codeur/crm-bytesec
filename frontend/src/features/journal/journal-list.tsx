import { Link } from "@tanstack/react-router";
import { formatDateHeure, formatMontant } from "@/lib/format";
import { ACTION_JOURNAL, CHAMP_LABEL, STATUT_CLIENT, STATUT_PROFORMA } from "@/lib/labels";
import type { JournalEntree } from "@/types";

function fmtValue(key: string, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (key === "statut" && typeof v === "string") {
    const s = (STATUT_CLIENT as Record<string, { label: string }>)[v] ?? (STATUT_PROFORMA as Record<string, { label: string }>)[v];
    return s?.label ?? v;
  }
  if (key.endsWith("Centimes") && typeof v === "number") return formatMontant(v);
  if (key === "tvaPourcent") return `${String(v)} %`;
  if (Array.isArray(v)) {
    // Lignes de facture : « Désignation ×qté (prix unitaire) ».
    const lignes = v.filter((x): x is { designation: string; quantite: number; prixUnitaireCentimes: number } => typeof x === "object" && x !== null && "designation" in x);
    if (lignes.length === v.length && v.length > 0) return lignes.map((l) => `${l.designation} ×${l.quantite} (${formatMontant(l.prixUnitaireCentimes)})`).join(" ; ");
    return `${v.length} élément(s)`;
  }
  if (typeof v === "boolean") return v ? "oui" : "non";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Affiche le diff avant → après d'une entrée du journal : seuls les champs réellement modifiés. */
function Diff({ e }: { e: JournalEntree }) {
  const avant = e.details.avant ?? {};
  const apres = e.details.apres ?? {};
  const keys = [...new Set([...Object.keys(avant), ...Object.keys(apres)])].filter(
    (k) => !(k in avant && k in apres && JSON.stringify(avant[k]) === JSON.stringify(apres[k])),
  );
  if (!keys.length) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="space-y-0.5 text-sm">
      {keys.map((k) => (
        <li key={k}>
          <span className="text-muted-foreground">{CHAMP_LABEL[k] ?? k} : </span>
          {k in avant && <span>{fmtValue(k, avant[k])}</span>}
          {k in avant && k in apres && <span aria-hidden> → </span>}
          {k in apres && <span className="font-medium">{fmtValue(k, apres[k])}</span>}
        </li>
      ))}
    </ul>
  );
}

function CibleLink({ e }: { e: JournalEntree }) {
  if (e.cible.type === "client") return <Link to="/clients/$id" params={{ id: e.cible.id }} className="hover:underline">{e.cible.libelle}</Link>;
  if (e.cible.type === "projet") return <Link to="/projets/$id" params={{ id: e.cible.id }} className="hover:underline">{e.cible.libelle}</Link>;
  if (e.cible.type === "proforma") return <Link to="/factures/proforma/$id" params={{ id: e.cible.id }} className="hover:underline">{e.cible.libelle}</Link>;
  return <Link to="/factures/commerciale/$id" params={{ id: e.cible.id }} className="hover:underline">{e.cible.libelle}</Link>;
}

export function JournalList({ entries, compact = false }: { entries: JournalEntree[]; compact?: boolean }) {
  if (!entries.length) return <p className="text-sm text-muted-foreground">Aucune entrée.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="p-3">Date</th>
            <th className="p-3">Qui</th>
            <th className="p-3">Action</th>
            {!compact && <th className="p-3">Cible</th>}
            <th className="p-3">Détails</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {entries.map((e) => (
            <tr key={e.id} className="align-top">
              <td className="whitespace-nowrap p-3">{formatDateHeure(e.date)}</td>
              <td className="p-3">{e.acteur.nom}</td>
              <td className="p-3">{ACTION_JOURNAL[e.action]}</td>
              {!compact && (
                <td className="p-3">
                  <CibleLink e={e} />
                </td>
              )}
              <td className="p-3">
                <Diff e={e} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
