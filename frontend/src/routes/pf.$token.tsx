import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { publicApi } from "@/api/publicLinks";
import { isApiError } from "@/api/client";
import { LienInvalide, PublicShell } from "@/components/public-shell";
import { ConfirmDialog, Field, ListSkeleton, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SignatureBloc } from "@/features/factures/facture-document";
import { errMsg } from "@/lib/api-utils";
import { formatDateHeure, formatMontant } from "@/lib/format";
import { STATUT_PROFORMA } from "@/lib/labels";

export const Route = createFileRoute("/pf/$token")({
  head: () => ({ meta: [{ title: "Pro forma · ByteSec" }] }),
  component: ProformaPublicPage,
});

type Resultat = { type: "valide"; factureToken: string } | { type: "refuse" };

function ProformaPublicPage() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const proforma = useQuery({ queryKey: ["public", "proforma", token], queryFn: () => publicApi.proforma(token), retry: false });

  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [motif, setMotif] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"valider" | "refuser" | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);

  const decider = useMutation({
    mutationFn: async (action: "valider" | "refuser") => {
      const p = proforma.data!;
      const base = { nom: nom.trim(), hash: p.hash, ...(p.clientAIdentifier ? { prenom: prenom.trim(), email: email.trim(), telephone: telephone.trim() } : {}) };
      if (action === "valider") {
        const r = await publicApi.valider(token, base);
        return { type: "valide", factureToken: r.factureToken } as Resultat;
      }
      await publicApi.refuser(token, { ...base, ...(motif.trim() ? { motif: motif.trim() } : {}) });
      return { type: "refuse" } as Resultat;
    },
    onSuccess: (r) => {
      setResultat(r);
      void qc.invalidateQueries({ queryKey: ["public", "proforma", token] });
    },
    onError: (e) => {
      if (isApiError(e) && e.status === 422 && typeof e.details === "object" && e.details) {
        setErrors(Object.fromEntries(Object.entries(e.details as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string>);
      }
      setErreurGlobale(errMsg(e));
      // Document modifié entre-temps : on recharge pour montrer la version à jour.
      if (isApiError(e) && (e.code === "DOCUMENT_MODIFIE" || e.code === "NOT_PENDING")) void qc.invalidateQueries({ queryKey: ["public", "proforma", token] });
    },
  });

  if (proforma.isLoading)
    return (
      <PublicShell>
        <ListSkeleton rows={4} />
      </PublicShell>
    );
  if (proforma.isError || !proforma.data)
    return (
      <PublicShell>
        <LienInvalide />
      </PublicShell>
    );
  const p = proforma.data;

  const verifier = (action: "valider" | "refuser") => {
    const err: Record<string, string> = {};
    if (nom.trim().length < 2) err["nom"] = p.clientAIdentifier ? "Nom requis" : "Votre nom complet est requis pour signer";
    if (p.clientAIdentifier && action === "valider") {
      if (!prenom.trim()) err["prenom"] = "Prénom requis";
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) err["email"] = "E-mail invalide";
      if (telephone.trim().length < 3) err["telephone"] = "Téléphone requis";
    }
    setErrors(err);
    setErreurGlobale(null);
    if (!Object.keys(err).length) setConfirm(action);
  };

  return (
    <PublicShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Pro forma {p.numero}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Émise par {p.emetteur}
            {p.client && <> pour {p.client.nom}</>}
          </p>
        </div>
        <StatusBadge {...STATUT_PROFORMA[p.statut]} />
      </div>

      {p.projets.length > 0 && (
        <p className="mt-3 text-sm">
          <span className="text-muted-foreground">Projet(s) concerné(s) : </span>
          {p.projets.map((x) => x.nom).join(", ")}
        </p>
      )}

      <article className="mt-6 rounded-lg border bg-background p-6">
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
            {p.lignes.map((l, i) => (
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
            <dd>{formatMontant(p.totalHtCentimes)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">TVA ({p.tvaPourcent} %)</dt>
            <dd>{formatMontant(p.totalTtcCentimes - p.totalHtCentimes)}</dd>
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <dt>Total TTC</dt>
            <dd>{formatMontant(p.totalTtcCentimes)}</dd>
          </div>
        </dl>
        {p.signature && (
          <div className="mt-8 border-t pt-6">
            <SignatureBloc titre="Signature de l'émetteur" nom={p.signature.par} le={p.signature.le} hash={p.signature.hash} />
          </div>
        )}
      </article>

      {/* ---- Décision du client ---- */}
      <section aria-label="Décision" className="mt-6">
        {resultat?.type === "valide" ? (
          <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-6 text-center dark:bg-emerald-950/30">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
            <p className="mt-2 text-lg font-medium">Pro forma validée, merci !</p>
            <p className="text-sm text-muted-foreground">Votre facture commerciale signée a été générée automatiquement.</p>
            <Button asChild className="mt-4">
              <Link to="/f/$token" params={{ token: resultat.factureToken }}>
                Consulter ma facture
              </Link>
            </Button>
          </div>
        ) : resultat?.type === "refuse" ? (
          <div role="status" className="rounded-lg border bg-background p-6 text-center">
            <XCircle className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-lg font-medium">Votre refus a bien été transmis</p>
            <p className="text-sm text-muted-foreground">Votre conseiller ByteSec en a été informé.</p>
          </div>
        ) : p.decision ? (
          <div role="status" className="rounded-lg border bg-background p-5 text-sm">
            <p className="font-medium">
              {p.statut === "refusee" ? "Refusée" : "Validée"} par {p.decision.nom} le {formatDateHeure(p.decision.le)}
            </p>
            {p.factureToken && (
              <Link to="/f/$token" params={{ token: p.factureToken }} className="mt-2 inline-block underline">
                Consulter la facture commerciale
              </Link>
            )}
          </div>
        ) : p.peutDecider ? (
          <div className="rounded-lg border bg-background p-6">
            <h2 className="text-lg font-medium">Votre décision</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              En validant, vous acceptez cette pro forma et la facture commerciale correspondante est générée automatiquement. Votre nom vaut signature.
            </p>
            <div className="mt-4 space-y-4">
              {p.clientAIdentifier ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Prénom" error={errors["prenom"]} htmlFor="d-prenom">
                    <Input id="d-prenom" autoComplete="given-name" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
                  </Field>
                  <Field label="Nom" error={errors["nom"]} htmlFor="d-nom">
                    <Input id="d-nom" autoComplete="family-name" value={nom} onChange={(e) => setNom(e.target.value)} />
                  </Field>
                  <Field label="E-mail" error={errors["email"]} htmlFor="d-email">
                    <Input id="d-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </Field>
                  <Field label="Téléphone" error={errors["telephone"]} htmlFor="d-tel">
                    <Input id="d-tel" type="tel" autoComplete="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
                  </Field>
                </div>
              ) : (
                <Field label="Votre nom complet (vaut signature)" error={errors["nom"]} htmlFor="d-nom">
                  <Input id="d-nom" autoComplete="name" value={nom} onChange={(e) => setNom(e.target.value)} />
                </Field>
              )}
              {erreurGlobale && (
                <p role="alert" className="text-sm text-destructive">
                  {erreurGlobale}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => verifier("valider")} disabled={decider.isPending}>
                  Valider
                </Button>
                <Button variant="outline" onClick={() => verifier("refuser")} disabled={decider.isPending}>
                  Refuser
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
            {p.statut === "brouillon" ? "Cette pro forma n'est pas encore ouverte à la décision : votre conseiller doit d'abord vous l'envoyer." : "Cette pro forma n'est plus en attente de décision."}
          </p>
        )}
      </section>

      <ConfirmDialog
        open={confirm === "valider"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Valider cette pro forma ?"
        description={`Vous acceptez la pro forma ${p.numero} pour ${formatMontant(p.totalTtcCentimes)} TTC. La facture commerciale signée sera générée immédiatement.`}
        confirmLabel="Oui, valider"
        onConfirm={() => decider.mutate("valider")}
      />
      {confirm === "refuser" && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          title="Refuser cette pro forma ?"
          description={
            <span className="block space-y-3">
              <span className="block">Votre conseiller sera informé de votre refus.</span>
              <label className="block text-left text-sm font-medium" htmlFor="d-motif">
                Motif (facultatif)
              </label>
              <Textarea id="d-motif" rows={3} value={motif} onChange={(e) => setMotif(e.target.value)} />
            </span>
          }
          confirmLabel="Oui, refuser"
          destructive
          onConfirm={() => decider.mutate("refuser")}
        />
      )}
    </PublicShell>
  );
}
