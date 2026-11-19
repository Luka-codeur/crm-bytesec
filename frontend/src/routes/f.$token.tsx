import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Lock, Printer } from "lucide-react";
import { publicApi } from "@/api/publicLinks";
import { LienInvalide, PublicShell } from "@/components/public-shell";
import { ListSkeleton } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { FactureDocument } from "@/features/factures/facture-document";

export const Route = createFileRoute("/f/$token")({
  head: () => ({ meta: [{ title: "Facture · ByteSec" }] }),
  component: FacturePublicPage,
});

function FacturePublicPage() {
  const { token } = Route.useParams();
  const facture = useQuery({ queryKey: ["public", "facture", token], queryFn: () => publicApi.facture(token), retry: false });

  if (facture.isLoading)
    return (
      <PublicShell>
        <ListSkeleton rows={4} />
      </PublicShell>
    );
  if (facture.isError || !facture.data)
    return (
      <PublicShell>
        <LienInvalide />
      </PublicShell>
    );
  const f = facture.data;

  return (
    <PublicShell>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <div role="status" className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
          <Lock className="h-4 w-4" aria-hidden /> Document non modifiable
        </div>
        <Button onClick={() => window.print()}>
          <Printer className="mr-1 h-4 w-4" aria-hidden /> Imprimer / PDF
        </Button>
      </div>
      <FactureDocument
        numero={f.numero}
        proformaNumero={f.proformaNumero}
        emiseLe={f.emiseLe}
        client={f.client}
        lignes={f.lignes}
        tvaPourcent={f.tvaPourcent}
        totalHtCentimes={f.totalHtCentimes}
        totalTtcCentimes={f.totalTtcCentimes}
        signature={f.signature}
        signatureClient={f.signatureClient}
      />
    </PublicShell>
  );
}
