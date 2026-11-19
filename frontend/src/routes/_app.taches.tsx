import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { tachesApi, type TacheInput } from "@/api/tasks";
import { usersApi } from "@/api/users";
import { ConfirmDialog, EmptyState, ErrorState, Field, ListSkeleton, PageHeader, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { errMsg } from "@/lib/api-utils";
import { useAuth } from "@/lib/auth";
import { formatDateCourte } from "@/lib/format";
import { STATUT_TACHE } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { StatutTache, Tache } from "@/types";

export const Route = createFileRoute("/_app/taches")({
  component: TachesPage,
});

const STATUTS = Object.keys(STATUT_TACHE) as StatutTache[];
const enRetard = (t: Tache) => Boolean(t.echeance) && t.statut !== "terminee" && new Date(t.echeance!) < new Date(new Date().toDateString());

function useTacheMutations() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["taches"] });
  const setStatut = useMutation({
    mutationFn: ({ id, statut }: { id: string; statut: StatutTache }) => tachesApi.setStatut(id, statut),
    onSuccess: refresh,
    onError: (e) => toast.error(errMsg(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => tachesApi.remove(id),
    onSuccess: () => {
      toast.success("Tâche supprimée");
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return { setStatut, remove, refresh };
}

function TachesPage() {
  const { isChef } = useAuth();
  return (
    <>
      <PageHeader title="Tâches de prospection" description={isChef ? "Assignez des tâches à votre équipe et suivez leur avancement." : "Vos tâches de prospection."} />
      {isChef ? <ChefView /> : <AgentView />}
    </>
  );
}

/* ---------- Agent : kanban ---------- */
function AgentView() {
  const taches = useQuery({ queryKey: ["taches", {}], queryFn: () => tachesApi.list({}) });
  const { setStatut } = useTacheMutations();
  const [dragId, setDragId] = useState<string | null>(null);

  if (taches.isLoading) return <ListSkeleton />;
  if (taches.isError) return <ErrorState message={errMsg(taches.error)} onRetry={() => void taches.refetch()} />;
  const items = taches.data?.data ?? [];
  if (!items.length) return <EmptyState title="Aucune tâche assignée" hint="Votre chef d'équipe vous en assignera prochainement." />;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {STATUTS.map((s) => (
        <section
          key={s}
          aria-label={STATUT_TACHE[s].label}
          className="rounded-lg border bg-muted/30 p-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragId) setStatut.mutate({ id: dragId, statut: s });
            setDragId(null);
          }}
        >
          <h2 className="mb-3 flex items-center justify-between text-sm font-medium">
            {STATUT_TACHE[s].label}
            <span className="text-muted-foreground">{items.filter((t) => t.statut === s).length}</span>
          </h2>
          <div className="space-y-2">
            {items
              .filter((t) => t.statut === s)
              .map((t) => (
                <article key={t.id} draggable onDragStart={() => setDragId(t.id)} className="cursor-grab rounded-md border bg-background p-3 shadow-sm active:cursor-grabbing">
                  <div className="font-medium">{t.titre}</div>
                  {t.description && <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Par {t.assignePar.nom}</span>
                    {t.echeance && <span>· échéance {formatDateCourte(t.echeance)}</span>}
                    {enRetard(t) && <StatusBadge tone="danger" label="En retard" />}
                  </div>
                  <Select value={t.statut} onValueChange={(v) => setStatut.mutate({ id: t.id, statut: v as StatutTache })}>
                    <SelectTrigger className="mt-2 h-8" aria-label={`Statut de ${t.titre}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUTS.map((x) => (
                        <SelectItem key={x} value={x}>
                          {STATUT_TACHE[x].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </article>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ---------- Chef : avancement + toutes les tâches ---------- */
function ChefView() {
  const [editing, setEditing] = useState<Tache | "new" | null>(null);
  const [deleting, setDeleting] = useState<Tache | null>(null);
  const [agentFilter, setAgentFilter] = useState("tous");
  const [statutFilter, setStatutFilter] = useState("tous");
  const { setStatut, remove } = useTacheMutations();

  const equipe = useQuery({ queryKey: ["equipe"], queryFn: usersApi.equipe });
  const avancement = useQuery({ queryKey: ["taches", "avancement"], queryFn: tachesApi.avancement });
  const taches = useQuery({
    queryKey: ["taches", { agentFilter, statutFilter }],
    queryFn: () => tachesApi.list({ ...(agentFilter !== "tous" ? { assigneAId: agentFilter } : {}), ...(statutFilter !== "tous" ? { statut: statutFilter } : {}) }),
  });
  const nomAgent = (id: string) => {
    const u = equipe.data?.find((x) => x.id === id);
    return u ? `${u.prenom} ${u.nom}` : "—";
  };

  return (
    <>
      <Tabs defaultValue="avancement">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="avancement">Avancement de l'équipe</TabsTrigger>
            <TabsTrigger value="toutes">Toutes les tâches</TabsTrigger>
          </TabsList>
          <Button onClick={() => setEditing("new")}>
            <Plus className="mr-1 h-4 w-4" aria-hidden /> Assigner une tâche
          </Button>
        </div>

        <TabsContent value="avancement" className="mt-4">
          {avancement.isLoading ? (
            <ListSkeleton rows={3} />
          ) : avancement.isError ? (
            <ErrorState message={errMsg(avancement.error)} onRetry={() => void avancement.refetch()} />
          ) : !avancement.data?.length ? (
            <EmptyState title="Aucun agent dans l'équipe" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {avancement.data.map((a) => {
                const pct = a.total ? Math.round((a.terminees / a.total) * 100) : 0;
                return (
                  <article key={a.agent.id} className="rounded-lg border p-4">
                    <div className="flex items-baseline justify-between">
                      <h2 className="font-medium">{a.agent.nom}</h2>
                      <span className="text-sm text-muted-foreground">
                        {a.terminees}/{a.total} terminées
                      </span>
                    </div>
                    <Progress value={pct} className="mt-3" aria-label={`Avancement de ${a.agent.nom}`} />
                    <div className="mt-3 flex gap-2 text-xs">
                      <StatusBadge tone="neutral" label={`${a.aFaire} à faire`} />
                      <StatusBadge tone="info" label={`${a.enCours} en cours`} />
                      <StatusBadge tone="success" label={`${a.terminees} terminées`} />
                    </div>
                    {a.tachesEnCours.length > 0 && (
                      <ul className="mt-3 space-y-1 text-sm">
                        {a.tachesEnCours.map((t) => (
                          <li key={t.id} className="text-muted-foreground">
                            • {t.titre}
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="toutes" className="mt-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-48" aria-label="Filtrer par agent">
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
            <Select value={statutFilter} onValueChange={setStatutFilter}>
              <SelectTrigger className="w-44" aria-label="Filtrer par statut">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les statuts</SelectItem>
                {STATUTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUT_TACHE[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {taches.isLoading ? (
            <ListSkeleton />
          ) : taches.isError ? (
            <ErrorState message={errMsg(taches.error)} onRetry={() => void taches.refetch()} />
          ) : !taches.data?.data.length ? (
            <EmptyState title="Aucune tâche" hint="Assignez une tâche de prospection à un agent." />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3">Tâche</th>
                    <th className="p-3">Agent</th>
                    <th className="p-3">Échéance</th>
                    <th className="p-3">Statut</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {taches.data.data.map((t) => (
                    <tr key={t.id}>
                      <td className="p-3">
                        <div className="font-medium">{t.titre}</div>
                        {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                      </td>
                      <td className="p-3">{nomAgent(t.assigneAId)}</td>
                      <td className={cn("p-3 whitespace-nowrap", enRetard(t) && "text-destructive")}>
                        {t.echeance ? formatDateCourte(t.echeance) : "—"} {enRetard(t) && <StatusBadge tone="danger" label="En retard" />}
                      </td>
                      <td className="p-3">
                        <Select value={t.statut} onValueChange={(v) => setStatut.mutate({ id: t.id, statut: v as StatutTache })}>
                          <SelectTrigger className="h-8 w-36" aria-label={`Statut de ${t.titre}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUTS.map((x) => (
                              <SelectItem key={x} value={x}>
                                {STATUT_TACHE[x].label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-3 text-right">
                        <Button variant="ghost" size="icon" aria-label={`Modifier ${t.titre}`} onClick={() => setEditing(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Supprimer ${t.titre}`} onClick={() => setDeleting(t)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <TacheDialog editing={editing} onClose={() => setEditing(null)} agents={(equipe.data ?? []).filter((u) => u.role === "agent")} />
      <ConfirmDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)} destructive title="Supprimer cette tâche ?" description={deleting?.titre ?? ""} confirmLabel="Supprimer" onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </>
  );
}

function TacheDialog({ editing, onClose, agents }: { editing: Tache | "new" | null; onClose: () => void; agents: { id: string; prenom: string; nom: string }[] }) {
  const qc = useQueryClient();
  const tache = editing && editing !== "new" ? editing : null;
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [assigneAId, setAssigneAId] = useState("");
  const [echeance, setEcheance] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (editing) {
      setTitre(tache?.titre ?? "");
      setDescription(tache?.description ?? "");
      setAssigneAId(tache?.assigneAId ?? "");
      setEcheance(tache?.echeance?.slice(0, 10) ?? "");
      setErrors({});
    }
  }, [editing, tache]);

  const save = useMutation({
    mutationFn: () => {
      const input: TacheInput = { titre: titre.trim(), description: description.trim(), assigneAId, ...(echeance ? { echeance } : {}) } as TacheInput;
      return tache ? tachesApi.update(tache.id, input) : tachesApi.create(input);
    },
    onSuccess: () => {
      toast.success(tache ? "Tâche mise à jour" : "Tâche assignée");
      void qc.invalidateQueries({ queryKey: ["taches"] });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const submit = () => {
    const err: Record<string, string> = {};
    if (!titre.trim()) err["titre"] = "Titre requis";
    if (!assigneAId) err["assigneAId"] = "Choisissez un agent";
    setErrors(err);
    if (!Object.keys(err).length) save.mutate();
  };

  return (
    <Dialog open={editing !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tache ? "Modifier la tâche" : "Assigner une tâche"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Titre" error={errors["titre"]} htmlFor="t-titre">
            <Input id="t-titre" value={titre} onChange={(e) => setTitre(e.target.value)} />
          </Field>
          <Field label="Description" htmlFor="t-desc">
            <Textarea id="t-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Agent" error={errors["assigneAId"]}>
              <Select value={assigneAId} onValueChange={setAssigneAId}>
                <SelectTrigger aria-label="Agent">
                  <SelectValue placeholder="Choisir un agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.prenom} {u.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Échéance" htmlFor="t-ech">
              <Input id="t-ech" type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
