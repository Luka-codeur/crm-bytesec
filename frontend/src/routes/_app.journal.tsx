import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ErrorState, ListSkeleton, PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { journalApi } from "@/api/journal";
import { usersApi } from "@/api/users";
import { JournalList } from "@/features/journal/journal-list";
import { errMsg } from "@/lib/api-utils";
import { useAuth } from "@/lib/auth";
import { ACTION_JOURNAL } from "@/lib/labels";
import type { ActionJournal } from "@/types";

interface S {
  action?: string | undefined;
  acteurId?: string | undefined;
  du?: string | undefined;
  au?: string | undefined;
  page?: number | undefined;
}
const PAGE_SIZE = 20;

export const Route = createFileRoute("/_app/journal")({
  validateSearch: (s: Record<string, unknown>): S => ({
    action: typeof s["action"] === "string" ? s["action"] : undefined,
    acteurId: typeof s["acteurId"] === "string" ? s["acteurId"] : undefined,
    du: typeof s["du"] === "string" ? s["du"] : undefined,
    au: typeof s["au"] === "string" ? s["au"] : undefined,
    page: typeof s["page"] === "number" ? s["page"] : undefined,
  }),
  component: JournalPage,
});

function JournalPage() {
  const { isChef } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/journal" });
  const set = (patch: Partial<S>) => void navigate({ search: (p: S) => ({ ...p, page: undefined, ...patch }) });
  const page = search.page ?? 1;

  const equipe = useQuery({ queryKey: ["equipe"], queryFn: usersApi.equipe, enabled: isChef });
  const q = useQuery({
    queryKey: ["journal", search],
    enabled: isChef,
    queryFn: () =>
      journalApi.list({
        action: search.action,
        acteurId: search.acteurId,
        du: search.du ? new Date(search.du).toISOString() : undefined,
        au: search.au ? new Date(`${search.au}T23:59:59`).toISOString() : undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  if (!isChef) return <ErrorState message="Accès réservé au chef d'équipe." />;
  const totalPages = q.data ? Math.max(1, Math.ceil(q.data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHeader title="Journal de traçabilité" description="Qui a fait quoi, et quand. Lecture seule." />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Select value={search.action ?? "toutes"} onValueChange={(v) => set({ action: v === "toutes" ? undefined : v })}>
          <SelectTrigger className="w-64" aria-label="Filtrer par action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="toutes">Toutes les actions</SelectItem>
            {(Object.keys(ACTION_JOURNAL) as ActionJournal[]).map((a) => (
              <SelectItem key={a} value={a}>
                {ACTION_JOURNAL[a]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={search.acteurId ?? "tous"} onValueChange={(v) => set({ acteurId: v === "tous" ? undefined : v })}>
          <SelectTrigger className="w-48" aria-label="Filtrer par acteur">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous les acteurs</SelectItem>
            {equipe.data?.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.prenom} {u.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="text-sm">
          Du <Input type="date" className="inline-block w-40" value={search.du ?? ""} onChange={(e) => set({ du: e.target.value || undefined })} />
        </label>
        <label className="text-sm">
          Au <Input type="date" className="inline-block w-40" value={search.au ?? ""} onChange={(e) => set({ au: e.target.value || undefined })} />
        </label>
      </div>

      {q.isLoading ? <ListSkeleton /> : q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => void q.refetch()} /> : <JournalList entries={q.data?.data ?? []} />}

      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>{q.data?.total ?? 0} entrée(s)</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => void navigate({ search: (p: S) => ({ ...p, page: page - 1 }) })}>
            Précédent
          </Button>
          <span>
            Page {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => void navigate({ search: (p: S) => ({ ...p, page: page + 1 }) })}>
            Suivant
          </Button>
        </div>
      </div>
    </>
  );
}
