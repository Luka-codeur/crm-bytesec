import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Lock, Printer } from "lucide-react";
import { clientsApi } from "@/api/clients";
import { facturesApi } from "@/api/invoices";
import { ShareLink } from "@/components/share-link";
import { ErrorState, ListSkeleton } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { FactureDocument } from "@/features/factures/facture-document";
import { errMsg } from "@/lib/api-utils";

export const Route = createFileRoute("/_app/factures/commerciale/$id")({
  component: FactureCommerciale,
});

/** Facture commerciale : lecture seule, aucune action de modification ni de suppression. */
function FactureCommerciale() {
  const { id } = Route.useParams();
  const facture = useQuery({ queryKey: ["facture", id], queryFn: () => facturesApi.get(id) });
  const client = useQuery({
    queryKey: ["client", facture.data?.clientId],
    queryFn: () => clientsApi.get(facture.data!.clientId),
    enabled: Boolean(facture.data?.clientId),
  });

  if (facture.isLoading) return <ListSkeleton rows={4} />;
  if (facture.isError || !facture.data) return <ErrorState message={errMsg(facture.error)} onRetry={() => void facture.refetch()} />;
  const f = facture.data;

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link to="/factures" search={{ onglet: "commerciales" }} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Factures
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="mr-1 h-4 w-4" aria-hidden /> Imprimer / PDF
        </Button>
      </div>
      <div role="status" className="no-print mb-4 flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
        <Lock className="h-4 w-4" aria-hidden /> Document non modifiable
      </div>
      <div className="no-print mx-auto mb-4 max-w-3xl">
        <ShareLink type="f" token={f.tokenConsultation} label="Lien de consultation de la facture" aide="Copiez ce lien et envoyez-le au client par le canal de votre choix : il consulte la facture signée en lecture seule." />
      </div>

      <FactureDocument
        numero={f.numero}
        emiseLe={f.emiseLe}
        client={client.data ? { nom: `${client.data.prenom} ${client.data.nom}`, adresse: client.data.adresse, email: client.data.email, telephone: client.data.telephone } : undefined}
        lignes={f.lignes}
        tvaPourcent={f.tvaPourcent}
        totalHtCentimes={f.totalHtCentimes}
        totalTtcCentimes={f.totalTtcCentimes}
        signature={f.signature}
        signatureClient={f.signatureClient}
      />
    </>
  );
}
