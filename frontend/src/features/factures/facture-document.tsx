import { BadgeCheck, ShieldAlert } from "lucide-react";
import { formatDate, formatDateHeure, formatMontant } from "@/lib/format";
import type { LigneFacture } from "@/types";

export interface FactureDocumentProps {
  numero: string;
  proformaNumero?: string | undefined;
  emiseLe: string;
  client?: { nom: string; adresse?: string | undefined; email?: string | undefined; telephone?: string | undefined } | undefined;
  lignes: LigneFacture[];
  tvaPourcent: number;
  totalHtCentimes: number;
  totalTtcCentimes: number;
  signature?: { nom: string; le: string; hash: string; valide: boolean } | undefined;
  signatureClient?: { nom: string; le: string } | undefined;
}

/** Bloc de signature électronique : nom du signataire, date et empreinte du contenu. */
export function SignatureBloc({ titre, nom, le, hash, valide }: { titre: string; nom: string; le: string; hash?: string | undefined; valide?: boolean | undefined }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{titre}</div>
      <div className="mt-2 border-b pb-1 font-serif text-xl italic">{nom}</div>
      <div className="mt-1 text-xs text-muted-foreground">Signé électroniquement le {formatDateHeure(le)}</div>
      {hash && (
        <div className="mt-1 break-all font-mono text-[10px] leading-tight text-muted-foreground" title="Empreinte SHA-256 du contenu signé">
          SHA-256 : {hash}
        </div>
      )}
      {valide !== undefined &&
        (valide ? (
          <div className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
            <BadgeCheck className="h-4 w-4" aria-hidden /> Signature valide : le contenu n'a pas été modifié
          </div>
        ) : (
          <div className="mt-1 inline-flex items-center gap-1 text-xs text-destructive">
            <ShieldAlert className="h-4 w-4" aria-hidden /> Signature invalide : le contenu ne correspond plus à l'empreinte
          </div>
        ))}
    </div>
  );
}

/** Facture commerciale en lecture seule, imprimable. Partagée par l'écran interne et le lien public. */
export function FactureDocument(f: FactureDocumentProps) {
  return (
    <article className="mx-auto max-w-3xl rounded-lg border bg-card p-8 shadow-sm print:border-0 print:shadow-none">
      <header className="flex items-start justify-between border-b pb-6">
        <div>
          <div className="text-2xl font-bold">ByteSec</div>
          <div className="text-sm text-muted-foreground">Cybersécurité · Formation</div>
        </div>
        <div className="text-right">
          <h1 className="text-xl font-semibold">Facture {f.numero}</h1>
          <div className="text-sm text-muted-foreground">Émise le {formatDate(f.emiseLe)}</div>
          {f.proformaNumero && <div className="text-xs text-muted-foreground">Pro forma d'origine : {f.proformaNumero}</div>}
        </div>
      </header>

      {f.client && (
        <section className="py-6 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Facturé à</div>
          <address className="mt-1 not-italic">
            <div className="font-medium">{f.client.nom}</div>
            {f.client.adresse && <div>{f.client.adresse}</div>}
            {f.client.email && <div>{f.client.email}</div>}
            {f.client.telephone && <div>{f.client.telephone}</div>}
          </address>
        </section>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2">Désignation</th>
            <th className="py-2 text-right">Qté</th>
            <th className="py-2 text-right">Prix unitaire</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {f.lignes.map((l, i) => (
            <tr key={i}>
              <td className="py-2">{l.designation}</td>
              <td className="py-2 text-right">{l.quantite}</td>
              <td className="py-2 text-right">{formatMontant(l.prixUnitaireCentimes)}</td>
              <td className="py-2 text-right">{formatMontant(Math.round(l.quantite * l.prixUnitaireCentimes))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto mt-6 w-64 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Total HT</dt>
          <dd>{formatMontant(f.totalHtCentimes)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">TVA ({f.tvaPourcent} %)</dt>
          <dd>{formatMontant(f.totalTtcCentimes - f.totalHtCentimes)}</dd>
        </div>
        <div className="flex justify-between border-t pt-2 text-base font-semibold">
          <dt>Total TTC</dt>
          <dd>{formatMontant(f.totalTtcCentimes)}</dd>
        </div>
      </dl>

      <section aria-label="Signatures" className="mt-10 grid gap-6 border-t pt-6 sm:grid-cols-2">
        {f.signature ? (
          <SignatureBloc titre="Signature de l'émetteur" nom={f.signature.nom} le={f.signature.le} hash={f.signature.hash} valide={f.signature.valide} />
        ) : (
          <p className="text-sm text-muted-foreground">Document émis avant l'activation de la signature électronique.</p>
        )}
        {f.signatureClient ? (
          <SignatureBloc titre="Signature du client (validation de la pro forma)" nom={f.signatureClient.nom} le={f.signatureClient.le} />
        ) : (
          <div className="text-sm text-muted-foreground">Pro forma acceptée par l'émetteur : pas de signature du client.</div>
        )}
      </section>
    </article>
  );
}
