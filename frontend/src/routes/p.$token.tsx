import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Clock } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { publicApi } from "@/api/publicLinks";
import { LienInvalide, PublicShell } from "@/components/public-shell";
import { Field, ListSkeleton } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { applyFieldErrors, errMsg } from "@/lib/api-utils";
import { formatMontant } from "@/lib/format";

export const Route = createFileRoute("/p/$token")({
  head: () => ({ meta: [{ title: "Projet · ByteSec" }] }),
  component: ProjetPublicPage,
});

const schema = z.object({
  prenom: z.string().trim().min(1, "Prénom requis"),
  nom: z.string().trim().min(1, "Nom requis"),
  email: z.string().trim().email("E-mail invalide"),
  telephone: z.string().trim().min(3, "Téléphone requis"),
  adresse: z.string().trim(),
});
type Values = z.infer<typeof schema>;

function ProjetPublicPage() {
  const { token } = Route.useParams();
  const [ouvert, setOuvert] = useState(false);
  const [inscrit, setInscrit] = useState(false);
  const projet = useQuery({ queryKey: ["public", "projet", token], queryFn: () => publicApi.projet(token), retry: false });

  const { register, handleSubmit, setError, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { prenom: "", nom: "", email: "", telephone: "", adresse: "" },
  });
  const { errors } = formState;

  const inscrire = useMutation({
    mutationFn: (v: Values) => publicApi.inscrire(token, { ...v, adresse: v.adresse || undefined }),
    onSuccess: () => {
      setInscrit(true);
      setOuvert(false);
    },
    onError: (e) => {
      if (!applyFieldErrors(e, setError)) setError("root", { message: errMsg(e) });
    },
  });

  if (projet.isLoading)
    return (
      <PublicShell>
        <ListSkeleton rows={4} />
      </PublicShell>
    );
  if (projet.isError || !projet.data)
    return (
      <PublicShell>
        <LienInvalide />
      </PublicShell>
    );
  const p = projet.data;

  return (
    <PublicShell>
      <h1 className="text-3xl font-semibold tracking-tight">{p.nom}</h1>
      {p.description && <p className="mt-2 text-muted-foreground">{p.description}</p>}

      <div className="mt-6 space-y-4">
        {!p.packs.length && <p className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">Les détails de l'offre vous seront communiqués après votre inscription.</p>}
        {p.packs.map((k, i) => (
          <section key={i} className="rounded-lg border bg-background p-5">
            <h2 className="text-lg font-medium">{k.nom}</h2>
            {k.description && <p className="mt-1 text-sm text-muted-foreground">{k.description}</p>}
            <ul className="mt-3 divide-y text-sm">
              {k.formations.map((f, j) => (
                <li key={j} className="py-2">
                  <div className="flex justify-between gap-4">
                    <span className="font-medium">{f.titre}</span>
                    <span className="shrink-0 text-muted-foreground">
                      <Clock className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                      {f.dureeHeures} h
                    </span>
                  </div>
                  {f.description && <p className="text-muted-foreground">{f.description}</p>}
                </li>
              ))}
            </ul>
            {/* Le prix n'est jamais affiché en totalité : uniquement découpé en tranches. */}
            <div className="mt-4 rounded-md bg-muted/50 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Paiement en {k.nbTranches} tranches</div>
              <ol className="mt-1 grid gap-1 text-sm sm:grid-cols-3">
                {k.tranchesCentimes.map((t, n) => (
                  <li key={n}>
                    <span className="text-muted-foreground">Tranche {n + 1} · </span>
                    <strong>{formatMontant(t)}</strong>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        ))}
      </div>

      <div className="mt-8 rounded-lg border bg-background p-6 text-center">
        {inscrit ? (
          <div role="status" className="flex flex-col items-center gap-2">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden />
            <p className="text-lg font-medium">Inscription enregistrée</p>
            <p className="text-sm text-muted-foreground">Merci ! Un conseiller ByteSec vous contactera très prochainement.</p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">Ce projet vous intéresse ? Rejoignez-le en quelques secondes.</p>
            <Button size="lg" onClick={() => setOuvert(true)}>
              S'inscrire maintenant
            </Button>
          </>
        )}
      </div>

      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>S'inscrire à « {p.nom} »</DialogTitle>
            <DialogDescription>Vos coordonnées permettent à notre équipe de vous recontacter.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit((v) => inscrire.mutate(v))} className="space-y-4" noValidate>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prénom" error={errors.prenom?.message} htmlFor="i-prenom">
                <Input id="i-prenom" autoComplete="given-name" {...register("prenom")} />
              </Field>
              <Field label="Nom" error={errors.nom?.message} htmlFor="i-nom">
                <Input id="i-nom" autoComplete="family-name" {...register("nom")} />
              </Field>
            </div>
            <Field label="E-mail" error={errors.email?.message} htmlFor="i-email">
              <Input id="i-email" type="email" autoComplete="email" {...register("email")} />
            </Field>
            <Field label="Téléphone" error={errors.telephone?.message} htmlFor="i-tel">
              <Input id="i-tel" type="tel" autoComplete="tel" {...register("telephone")} />
            </Field>
            <Field label="Adresse (facultatif)" htmlFor="i-adresse">
              <Input id="i-adresse" autoComplete="street-address" {...register("adresse")} />
            </Field>
            {errors.root?.message && (
              <p role="alert" className="text-sm text-destructive">
                {errors.root.message}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOuvert(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={inscrire.isPending}>
                {inscrire.isPending ? "Envoi…" : "Confirmer mon inscription"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PublicShell>
  );
}
