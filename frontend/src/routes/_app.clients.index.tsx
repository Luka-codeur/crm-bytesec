import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { useState } from "react";
import { clientsApi } from "@/api/clients";
import { usersApi } from "@/api/users";
import { ClientFormDialog } from "@/features/clients/client-form-dialog";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errMsg } from "@/lib/api-utils";
import { useAuth } from "@/lib/auth";
import { formatDateCourte, formatWeekLabel, shiftWeek, toIsoWeek } from "@/lib/format";
import { STATUT_CLIENT } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { StatutClient } from "@/types";

interface Search_ {
  statut?: string[] | undefined;
  semaine?: string | undefined;
  q?: string | undefined;
  ajoutePar?: string | undefined;
  page?: number | undefined;
}

const STATUTS = Object.keys(STATUT_CLIENT) as StatutClient[];
const PAGE_SIZE = 15;

export const Route = createFileRoute("/_app/clients/")({
  validateSearch: (s: Record<string, unknown>): Search_ => ({
    statut: Array.isArray(s["statut"]) ? (s["statut"] as unknown[]).filter((x): x is string => typeof x === "string") : undefined,
    semaine: typeof s["semaine"] === "string" ? s["semaine"] : undefined,
    q: typeof s["q"] === "string" && s["q"] ? s["q"] : undefined,
    ajoutePar: typeof s["ajoutePar"] === "string" ? s["ajoutePar"] : undefined,
    page: typeof s["page"] === "number" ? s["page"] : undefined,
  }),
  component: ClientsPage,
});

function ClientsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/clients/" });
  const { isChef } = useAuth();
  const [creating, setCreating] = useState(false);
  const [qInput, setQInput] = useState(search.q ?? "");

  const setSearch = (patch: Partial<Search_>) =>
    void navigate({ search: (prev: Search_) => ({ ...prev, page: undefined, ...patch }) });

  const query = useQuery({
    queryKey: ["clients", search],
    queryFn: () =>
      clientsApi.list({
        statut: search.statut,
        semaine: search.semaine,
        q: search.q,
        ajoutePar: search.ajoutePar,
        page: search.page ?? 1,
        pageSize: PAGE_SIZE,
      }),
  });
  const equipe = useQuery({ queryKey: ["equipe"], queryFn: usersApi.equipe, enabled: isChef });

  const page = search.page ?? 1;
  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE_SIZE)) : 1;
  const hasFilters = Boolean(search.statut?.length || search.semaine || search.q || search.ajoutePar);

  const toggleStatut = (s: StatutClient) => {
    const cur = new Set(search.statut ?? []);
    if (cur.has(s)) cur.delete(s);
    else cur.add(s);
    setSearch({ statut: cur.size ? [...cur] : undefined });
  };

  return (
    <>
      <PageHeader
        title="Clients"
        description="Suivi des prospects, clients qualifiés et confirmés."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden /> Nouveau client
          </Button>
        }
      />

      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch({ q: qInput.trim() || undefined });
            }}
          >
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input aria-label="Rechercher un client" placeholder="Nom, prénom, e-mail…" className="w-64 pl-8" value={qInput} onChange={(e) => setQInput(e.target.value)} onBlur={() => setSearch({ q: qInput.trim() || undefined })} />
          </form>
          {STATUTS.map((s) => {
            const on = search.statut?.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on ?? false}
                onClick={() => toggleStatut(s)}
                className={cn("rounded-full border px-3 py-1 text-sm transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                {STATUT_CLIENT[s].label}
              </button>
            );
          })}
          {isChef && (
            <Select value={search.ajoutePar ?? "tous"} onValueChange={(v) => setSearch({ ajoutePar: v === "tous" ? undefined : v })}>
              <SelectTrigger className="w-48" aria-label="Ajouté par">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les agents</SelectItem>
                {equipe.data?.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.prenom} {u.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Créés :</span>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Semaine précédente" onClick={() => setSearch({ semaine: shiftWeek(search.semaine ?? toIsoWeek(new Date()), -1) })}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-56 text-center">{search.semaine ? formatWeekLabel(search.semaine) : "Toutes les semaines"}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Semaine suivante" onClick={() => setSearch({ semaine: shiftWeek(search.semaine ?? toIsoWeek(new Date()), 1) })}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSearch({ semaine: toIsoWeek(new Date()) })}>
            Cette semaine
          </Button>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQInput("");
                void navigate({ search: {} });
              }}
            >
              Réinitialiser
            </Button>
          )}
        </div>
      </div>

      {query.isLoading ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorState message={errMsg(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data && query.data.data.length === 0 ? (
        <EmptyState
          title={hasFilters ? "Aucun client ne correspond à ces filtres" : "Aucun client pour le moment"}
          hint={hasFilters ? "Modifiez ou réinitialisez les filtres." : "Ajoutez votre premier prospect pour démarrer."}
          action={!hasFilters ? <Button onClick={() => setCreating(true)}>Nouveau client</Button> : undefined}
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="hidden md:table-cell">Contact</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden lg:table-cell">Ajouté par</TableHead>
                  <TableHead className="hidden sm:table-cell">Créé le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data?.data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link to="/clients/$id" params={{ id: c.id }} className="font-medium hover:underline">
                        {c.prenom} {c.nom}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      <div>{c.email}</div>
                      <div>{c.telephone}</div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge {...STATUT_CLIENT[c.statut]} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{c.ajoutePar.nom}</TableCell>
                    <TableCell className="hidden sm:table-cell">{formatDateCourte(c.creeLe)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>{query.data?.total} client(s)</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => void navigate({ search: (p: Search_) => ({ ...p, page: page - 1 }) })}>
                Précédent
              </Button>
              <span>
                Page {page} / {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => void navigate({ search: (p: Search_) => ({ ...p, page: page + 1 }) })}>
                Suivant
              </Button>
            </div>
          </div>
        </>
      )}

      <ClientFormDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
