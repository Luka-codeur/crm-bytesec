import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { clientsApi } from "@/api/clients";
import { facturesApi } from "@/api/invoices";
import { journalApi } from "@/api/journal";
import { proformasApi } from "@/api/proformas";
import { projetsApi } from "@/api/projects";
import { ConfirmDialog, EmptyState, ErrorState, ListSkeleton, PageHeader, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientFormDialog } from "@/features/clients/client-form-dialog";
import { JournalList } from "@/features/journal/journal-list";
import { errMsg } from "@/lib/api-utils";
import { useAuth } from "@/lib/auth";
import { formatDateCourte, formatMontant } from "@/lib/format";
import { STATUT_CLIENT, STATUT_PROFORMA, STATUT_PROJET } from "@/lib/labels";
import { calcTotaux } from "@/features/factures/rules";
import type { StatutClient } from "@/types";

export const Route = createFileRoute("/_app/clients/$id")({
  component: ClientDetail,
});

function ClientDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isChef } = useAuth();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<StatutClient | null>(null);
  const [deleting, setDeleting] = useState(false);

  const client = useQuery({ queryKey: ["client", id], queryFn: () => clientsApi.get(id) });
  const projets = useQuery({ queryKey: ["projets", { clientId: id }], queryFn: () => projetsApi.list({ clientId: id }) });
  const proformas = useQuery({ queryKey: ["proformas", { clientId: id }], queryFn: () => proformasApi.list({ clientId: id }) });
  const factures = useQuery({ queryKey: ["factures", { clientId: id }], queryFn: () => facturesApi.list({ clientId: id }) });
  const historique = useQuery({ queryKey: ["journal", { clientId: id }], queryFn: () => journalApi.list({ clientId: id, pageSize: 50 }) });

  const setStatut = useMutation({
    mutationFn: (s: StatutClient) => clientsApi.setStatut(id, s),
    onSuccess: () => {
      toast.success("Statut mis à jour — action enregistrée dans le journal");
      void qc.invalidateQueries({ queryKey: ["client", id] });
      void qc.invalidateQueries({ queryKey: ["clients"] });
      void qc.invalidateQueries({ queryKey: ["journal"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const remove = useMutation({
    mutationFn: () => clientsApi.remove(id),
    onSuccess: () => {
      toast.success("Client supprimé");
      void qc.invalidateQueries({ queryKey: ["clients"] });
      void navigate({ to: "/clients" });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (client.isLoading) return <ListSkeleton rows={4} />;
  if (client.isError || !client.data) return <ErrorState message={errMsg(client.error)} onRetry={() => void client.refetch()} />;
  const c = client.data;

  return (
    <>
      <Link to="/clients" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Clients
      </Link>
      <PageHeader
        title={`${c.prenom} ${c.nom}`}
        description={`Ajouté par ${c.ajoutePar.nom} le ${formatDateCourte(c.creeLe)}`}
        actions={
          <>
            <Select value={c.statut} onValueChange={(v) => v !== c.statut && setPending(v as StatutClient)}>
              <SelectTrigger className="w-40" aria-label="Changer le statut">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUT_CLIENT) as StatutClient[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUT_CLIENT[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="mr-1 h-4 w-4" aria-hidden /> Modifier
            </Button>
            {isChef && (
              <Button variant="outline" onClick={() => setDeleting(true)}>
                <Trash2 className="mr-1 h-4 w-4" aria-hidden /> Supprimer
              </Button>
            )}
          </>
        }
      />

      <dl className="mb-6 grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Statut", <StatusBadge key="s" {...STATUT_CLIENT[c.statut]} />],
          ["E-mail", c.email],
          ["Téléphone", c.telephone],
          ["Adresse", c.adresse || "—"],
        ].map(([k, v]) => (
          <div key={String(k)}>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
            <dd className="mt-1 text-sm">{v}</dd>
          </div>
        ))}
      </dl>

      <Tabs defaultValue="projets">
        <TabsList>
          <TabsTrigger value="projets">Projets</TabsTrigger>
          <TabsTrigger value="factures">Factures</TabsTrigger>
          <TabsTrigger value="historique">Historique</TabsTrigger>
        </TabsList>

        <TabsContent value="projets" className="mt-4">
          <div className="mb-3 flex justify-end">
            <Button asChild size="sm">
              <Link to="/projets/nouveau">
                Nouveau projet
              </Link>
            </Button>
          </div>
          {projets.isLoading ? (
            <ListSkeleton rows={2} />
          ) : projets.data?.data.length ? (
            <ul className="divide-y rounded-lg border">
              {projets.data.data.map((p) => (
                <li key={p.id} className="flex items-center justify-between p-3">
                  <Link to="/projets/$id" params={{ id: p.id }} className="font-medium hover:underline">
                    {p.nom}
                    {c.projetId === p.id && <span className="ml-2 text-xs text-muted-foreground">(projet assigné)</span>}
                  </Link>
                  <StatusBadge {...STATUT_PROJET[p.statut]} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Aucun projet" hint="Un client apparaît ici lorsqu'il s'inscrit via le lien d'un projet." />
          )}
        </TabsContent>

        <TabsContent value="factures" className="mt-4 space-y-6">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-medium">Pro forma</h2>
              <Button asChild size="sm" variant="outline">
                <Link to="/factures/proforma/nouvelle" search={{ clientId: id }}>
                  Nouvelle pro forma
                </Link>
              </Button>
            </div>
            {proformas.data?.data.length ? (
              <ul className="divide-y rounded-lg border">
                {proformas.data.data.map((p) => (
                  <li key={p.id} className="flex items-center justify-between p-3 text-sm">
                    <Link to="/factures/proforma/$id" params={{ id: p.id }} className="font-medium hover:underline">
                      {p.numero}
                    </Link>
                    <span>{formatMontant(calcTotaux(p.lignes, p.tvaPourcent).ttc)}</span>
                    <StatusBadge {...STATUT_PROFORMA[p.statut]} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune pro forma.</p>
            )}
          </div>
          <div>
            <h2 className="mb-2 font-medium">Factures commerciales</h2>
            {factures.data?.data.length ? (
              <ul className="divide-y rounded-lg border">
                {factures.data.data.map((f) => (
                  <li key={f.id} className="flex items-center justify-between p-3 text-sm">
                    <Link to="/factures/commerciale/$id" params={{ id: f.id }} className="font-medium hover:underline">
                      {f.numero}
                    </Link>
                    <span>{formatMontant(f.totalTtcCentimes)}</span>
                    <span className="text-muted-foreground">{formatDateCourte(f.emiseLe)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune facture commerciale.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="historique" className="mt-4">
          {historique.isLoading ? <ListSkeleton rows={3} /> : historique.isError ? <ErrorState message={errMsg(historique.error)} /> : <JournalList entries={historique.data?.data ?? []} compact />}
        </TabsContent>
      </Tabs>

      <ClientFormDialog open={editing} onOpenChange={setEditing} client={c} />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title="Changer le statut du client ?"
        description={pending ? `${STATUT_CLIENT[c.statut].label} → ${STATUT_CLIENT[pending].label}. Ce changement sera enregistré dans le journal.` : ""}
        onConfirm={() => {
          if (pending) setStatut.mutate(pending);
          setPending(null);
        }}
      />
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} destructive title="Supprimer ce client ?" description="Cette action est irréversible." confirmLabel="Supprimer" onConfirm={() => remove.mutate()} />
    </>
  );
}
