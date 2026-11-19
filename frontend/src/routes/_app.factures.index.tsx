import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { clientsApi } from "@/api/clients";
import { facturesApi } from "@/api/invoices";
import { proformasApi } from "@/api/proformas";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calcTotaux } from "@/features/factures/rules";
import { errMsg } from "@/lib/api-utils";
import { formatDateCourte, formatMontant } from "@/lib/format";
import { STATUT_PROFORMA } from "@/lib/labels";

export const Route = createFileRoute("/_app/factures/")({
  validateSearch: (s: Record<string, unknown>): { onglet?: "proforma" | "commerciales" | undefined } => ({
    onglet: s["onglet"] === "commerciales" ? "commerciales" : undefined,
  }),
  component: FacturesPage,
});

function FacturesPage() {
  const { onglet } = Route.useSearch();
  const navigate = useNavigate({ from: "/factures/" });
  const tab = onglet ?? "proforma";

  const clients = useQuery({ queryKey: ["clients", "all"], queryFn: () => clientsApi.list({ page: 1, pageSize: 200 }) });
  const proformas = useQuery({ queryKey: ["proformas", {}], queryFn: () => proformasApi.list({}) });
  const factures = useQuery({ queryKey: ["factures", {}], queryFn: () => facturesApi.list({}) });
  const nomClient = (id?: string) => {
    if (!id) return "À identifier";
    const c = clients.data?.data.find((x) => x.id === id);
    return c ? `${c.prenom} ${c.nom}` : "—";
  };

  return (
    <>
      <PageHeader
        title="Factures"
        description="Les factures commerciales sont générées depuis une pro forma acceptée et ne sont plus modifiables."
        actions={
          <Button asChild>
            <Link to="/factures/proforma/nouvelle" search={{}}>
              <Plus className="mr-1 h-4 w-4" aria-hidden /> Nouvelle pro forma
            </Link>
          </Button>
        }
      />
      <Tabs value={tab} onValueChange={(v) => void navigate({ search: { onglet: v === "commerciales" ? "commerciales" : undefined } })}>
        <TabsList>
          <TabsTrigger value="proforma">Pro forma</TabsTrigger>
          <TabsTrigger value="commerciales">Commerciales</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-4">
        {tab === "proforma" ? (
          proformas.isLoading ? (
            <ListSkeleton />
          ) : proformas.isError ? (
            <ErrorState message={errMsg(proformas.error)} onRetry={() => void proformas.refetch()} />
          ) : !proformas.data?.data.length ? (
            <EmptyState title="Aucune pro forma" hint="Créez une pro forma pour un client, puis faites-la accepter." />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numéro</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Total TTC</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proformas.data.data.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link to="/factures/proforma/$id" params={{ id: p.id }} className="font-medium hover:underline">
                          {p.numero}
                        </Link>
                        {p.factureCommercialeId && <span className="ml-2 text-xs text-muted-foreground">facturée</span>}
                      </TableCell>
                      <TableCell>{nomClient(p.clientId)}</TableCell>
                      <TableCell className="text-right">{formatMontant(calcTotaux(p.lignes, p.tvaPourcent).ttc)}</TableCell>
                      <TableCell>
                        <StatusBadge {...STATUT_PROFORMA[p.statut]} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{formatDateCourte(p.creeLe)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        ) : factures.isLoading ? (
          <ListSkeleton />
        ) : factures.isError ? (
          <ErrorState message={errMsg(factures.error)} onRetry={() => void factures.refetch()} />
        ) : !factures.data?.data.length ? (
          <EmptyState title="Aucune facture commerciale" hint="Acceptez une pro forma puis générez la facture depuis sa page." />
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numéro</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Total TTC</TableHead>
                  <TableHead className="hidden sm:table-cell">Émise le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {factures.data.data.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <Link to="/factures/commerciale/$id" params={{ id: f.id }} className="font-medium hover:underline">
                        {f.numero}
                      </Link>
                    </TableCell>
                    <TableCell>{nomClient(f.clientId)}</TableCell>
                    <TableCell className="text-right">{formatMontant(f.totalTtcCentimes)}</TableCell>
                    <TableCell className="hidden sm:table-cell">{formatDateCourte(f.emiseLe)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
