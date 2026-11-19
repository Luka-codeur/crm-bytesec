import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { projetsApi } from "@/api/projects";
import { ShareLink } from "@/components/share-link";
import { ConfirmDialog, ErrorState, ListSkeleton, PageHeader, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { errMsg } from "@/lib/api-utils";
import { formatDateCourte, formatDateHeure, formatMontant } from "@/lib/format";
import { STATUT_CLIENT, STATUT_PROJET } from "@/lib/labels";

export const Route = createFileRoute("/_app/projets/$id/")({
  component: ProjetDetail,
});

function ProjetDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

  const projet = useQuery({ queryKey: ["projet", id], queryFn: () => projetsApi.get(id) });
  const inscrits = useQuery({ queryKey: ["projet", id, "inscrits"], queryFn: () => projetsApi.inscrits(id) });

  const remove = useMutation({
    mutationFn: () => projetsApi.remove(id),
    onSuccess: () => {
      toast.success("Projet supprimé");
      void qc.invalidateQueries({ queryKey: ["projets"] });
      void navigate({ to: "/projets" });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (projet.isLoading) return <ListSkeleton rows={4} />;
  if (projet.isError || !projet.data) return <ErrorState message={errMsg(projet.error)} onRetry={() => void projet.refetch()} />;
  const p = projet.data;

  return (
    <>
      <Link to="/projets" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Projets
      </Link>
      <PageHeader
        title={p.nom}
        description={p.description || undefined}
        actions={
          <>
            <StatusBadge {...STATUT_PROJET[p.statut]} />
            <Button asChild variant="outline">
              <Link to="/projets/$id/modifier" params={{ id }}>
                <Pencil className="mr-1 h-4 w-4" aria-hidden /> Modifier
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setDeleting(true)}>
              <Trash2 className="mr-1 h-4 w-4" aria-hidden /> Supprimer
            </Button>
          </>
        }
      />

      <ShareLink
        type="p"
        token={p.tokenConsultation}
        label="Lien de consultation du projet"
        aide="Envoyez ce lien par le canal de votre choix (WhatsApp, e-mail, SMS…). Il affiche le projet en lecture seule, avec un bouton « S'inscrire maintenant » qui ajoute la personne à votre base clients."
        avantCopie={async () => {
          if (p.statut === "brouillon") {
            await projetsApi.partager(id);
            void qc.invalidateQueries({ queryKey: ["projet", id] });
            void qc.invalidateQueries({ queryKey: ["projets"] });
          }
        }}
      />
      {p.envoyeLe && <p className="mt-2 text-xs text-muted-foreground">Partagé pour la première fois le {formatDateHeure(p.envoyeLe)}.</p>}

      <div className="mt-6 space-y-4">
        <h2 className="text-lg font-medium">Packs</h2>
        {!p.packs.length && <p className="text-sm text-muted-foreground">Ce projet n'a aucun pack.</p>}
        {p.packs.map((k) => (
          <section key={k.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium">{k.nom}</h3>
              <span className="text-sm font-medium">
                {formatMontant(k.prixCentimes)}
                {k.prixPersonnalise && <span className="ml-2 text-xs font-normal text-muted-foreground">(prix modifié, calculé : {formatMontant(k.prixAutoCentimes)})</span>}
              </span>
            </div>
            {k.description && <p className="mt-1 text-sm text-muted-foreground">{k.description}</p>}
            <p className="mt-2 text-sm">
              <span className="text-muted-foreground">En {k.nbTranches} tranches : </span>
              {k.tranchesCentimes.map((t) => formatMontant(t)).join(" · ")}
            </p>
            <ul className="mt-3 divide-y text-sm">
              {k.formations.map((f) => (
                <li key={f.id} className="flex justify-between py-2">
                  <span>{f.titre}</span>
                  <span className="text-muted-foreground">
                    {f.dureeHeures} h · {formatMontant(f.prixCentimes)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="mb-2 text-lg font-medium">
          Inscrits <span className="text-sm font-normal text-muted-foreground">({p.inscritsCount})</span>
        </h2>
        {inscrits.isLoading ? (
          <ListSkeleton rows={2} />
        ) : !inscrits.data?.length ? (
          <p className="text-sm text-muted-foreground">Personne ne s'est encore inscrit via ce lien.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">Client</th>
                  <th className="p-3">E-mail</th>
                  <th className="p-3">Téléphone</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3">Inscrit le</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {inscrits.data.map((c) => (
                  <tr key={c.id}>
                    <td className="p-3">
                      <Link to="/clients/$id" params={{ id: c.id }} className="font-medium hover:underline">
                        {c.prenom} {c.nom}
                      </Link>
                    </td>
                    <td className="p-3">{c.email}</td>
                    <td className="p-3">{c.telephone}</td>
                    <td className="p-3">
                      <StatusBadge {...STATUT_CLIENT[c.statut]} />
                    </td>
                    <td className="p-3">{formatDateCourte(c.inscritLe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog open={deleting} onOpenChange={setDeleting} destructive title="Supprimer ce projet ?" description="Ses packs et le lien de consultation seront supprimés. Cette action est irréversible." confirmLabel="Supprimer" onConfirm={() => remove.mutate()} />
    </>
  );
}
