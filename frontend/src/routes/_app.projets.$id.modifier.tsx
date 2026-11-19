import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { projetsApi } from "@/api/projects";
import { ErrorState, ListSkeleton, PageHeader } from "@/components/ui-bits";
import { ProjetForm } from "@/features/projets/projet-form";
import { errMsg } from "@/lib/api-utils";

export const Route = createFileRoute("/_app/projets/$id/modifier")({
  component: ModifierProjet,
});

function ModifierProjet() {
  const { id } = Route.useParams();
  const projet = useQuery({ queryKey: ["projet", id], queryFn: () => projetsApi.get(id) });
  if (projet.isLoading) return <ListSkeleton rows={4} />;
  if (projet.isError || !projet.data) return <ErrorState message={errMsg(projet.error)} onRetry={() => void projet.refetch()} />;
  return (
    <>
      <PageHeader title={`Modifier « ${projet.data.nom} »`} />
      <ProjetForm projet={projet.data} />
    </>
  );
}
