import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { proformasApi } from "@/api/proformas";
import { ErrorState, ListSkeleton, PageHeader } from "@/components/ui-bits";
import { ProformaEditor } from "@/features/factures/proforma-editor";
import { errMsg } from "@/lib/api-utils";

export const Route = createFileRoute("/_app/factures/proforma/$id")({
  component: ProformaPage,
});

function ProformaPage() {
  const { id } = Route.useParams();
  const q = useQuery({ queryKey: ["proforma", id], queryFn: () => proformasApi.get(id) });
  if (q.isLoading) return <ListSkeleton rows={4} />;
  if (q.isError || !q.data) return <ErrorState message={errMsg(q.error)} onRetry={() => void q.refetch()} />;
  return (
    <>
      <Link to="/factures" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Factures
      </Link>
      <PageHeader title={`Pro forma ${q.data.numero}`} />
      {/* key : réinitialise le formulaire quand la pro forma change (statut, verrouillage) */}
      <ProformaEditor key={`${q.data.id}-${q.data.modifieLe}-${q.data.statut}-${q.data.factureCommercialeId ?? ""}`} proforma={q.data} />
    </>
  );
}
