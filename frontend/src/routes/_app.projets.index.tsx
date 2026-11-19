import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Link2, Plus } from "lucide-react";
import { toast } from "sonner";
import { projetsApi } from "@/api/projects";
import { lienPublic } from "@/components/share-link";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errMsg } from "@/lib/api-utils";
import { formatDateCourte } from "@/lib/format";
import { STATUT_PROJET } from "@/lib/labels";
import type { Projet } from "@/types";

export const Route = createFileRoute("/_app/projets/")({
  component: ProjetsPage,
});

function ProjetsPage() {
  const qc = useQueryClient();
  const projets = useQuery({ queryKey: ["projets", {}], queryFn: () => projetsApi.list({}) });

  /** Copie le lien de consultation ; un projet encore en brouillon passe alors à « Partagé ». */
  const copier = async (p: Projet) => {
    try {
      if (p.statut === "brouillon") {
        await projetsApi.partager(p.id);
        void qc.invalidateQueries({ queryKey: ["projets"] });
      }
      await navigator.clipboard.writeText(lienPublic("p", p.tokenConsultation));
      toast.success(`Lien de « ${p.nom} » copié`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Projets"
        description="Chaque projet a un lien de consultation à envoyer à vos prospects : ils s'y inscrivent et deviennent clients."
        actions={
          <Button asChild>
            <Link to="/projets/nouveau">
              <Plus className="mr-1 h-4 w-4" aria-hidden /> Nouveau projet
            </Link>
          </Button>
        }
      />
      {projets.isLoading ? (
        <ListSkeleton />
      ) : projets.isError ? (
        <ErrorState message={errMsg(projets.error)} onRetry={() => void projets.refetch()} />
      ) : !projets.data?.data.length ? (
        <EmptyState
          title="Aucun projet"
          hint="Créez un projet, copiez son lien et envoyez-le à vos prospects."
          action={
            <Button asChild>
              <Link to="/projets/nouveau">Nouveau projet</Link>
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Projet</TableHead>
                <TableHead>Packs</TableHead>
                <TableHead>Inscrits</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="hidden sm:table-cell">Créé le</TableHead>
                <TableHead className="text-right">Lien</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projets.data.data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link to="/projets/$id" params={{ id: p.id }} className="font-medium hover:underline">
                      {p.nom}
                    </Link>
                  </TableCell>
                  <TableCell>{p.packs.length || "—"}</TableCell>
                  <TableCell>{p.inscritsCount}</TableCell>
                  <TableCell>
                    <StatusBadge {...STATUT_PROJET[p.statut]} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{formatDateCourte(p.creeLe)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => void copier(p)} aria-label={`Copier le lien de ${p.nom}`}>
                      <Link2 className="mr-1 h-4 w-4" aria-hidden /> Copier le lien
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
