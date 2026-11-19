import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { FileCheck2, Lock, Plus, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { clientsApi } from "@/api/clients";
import { proformasApi } from "@/api/proformas";
import { projetsApi } from "@/api/projects";
import { ShareLink } from "@/components/share-link";
import { ConfirmDialog, Field, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SignatureBloc } from "@/features/factures/facture-document";
import { calcTotaux, estVerrouillee, peutGenererFacture } from "@/features/factures/rules";
import { errMsg } from "@/lib/api-utils";
import { formatDateHeure, formatMontant, unitsToCentimes } from "@/lib/format";
import { STATUT_PROFORMA } from "@/lib/labels";
import type { FactureProforma, StatutProforma } from "@/types";

interface LigneDraft {
  key: number;
  designation: string;
  quantite: string;
  prix: string; // FCFA
}
let seq = 0;
const blank = (): LigneDraft => ({ key: ++seq, designation: "", quantite: "1", prix: "" });
const AUCUN = "aucun";

export function ProformaEditor({ proforma, defaultClientId }: { proforma?: FactureProforma; defaultClientId?: string | undefined }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const locked = proforma ? estVerrouillee(proforma) : false;

  // Le client est facultatif : sans client, c'est le signataire du lien qui se déclare en validant.
  const [clientId, setClientId] = useState(proforma?.clientId ?? defaultClientId ?? "");
  const [projetIds, setProjetIds] = useState<string[]>(proforma?.projetIds ?? []);
  const [tva, setTva] = useState(String(proforma?.tvaPourcent ?? 18));
  const [lignes, setLignes] = useState<LigneDraft[]>(
    proforma ? proforma.lignes.map((l) => ({ key: ++seq, designation: l.designation, quantite: String(l.quantite), prix: String(Math.round(l.prixUnitaireCentimes / 100)) })) : [blank()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const clients = useQuery({ queryKey: ["clients", "all"], queryFn: () => clientsApi.list({ page: 1, pageSize: 200 }) });
  const projets = useQuery({ queryKey: ["projets", {}], queryFn: () => projetsApi.list({}) });

  const parsed = lignes.map((l) => ({ designation: l.designation.trim(), quantite: Number(l.quantite) || 0, prixUnitaireCentimes: unitsToCentimes(Number(l.prix) || 0) }));
  const t = calcTotaux(parsed, Number(tva) || 0);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["proformas"] });
    void qc.invalidateQueries({ queryKey: ["proforma"] });
    void qc.invalidateQueries({ queryKey: ["factures"] });
    void qc.invalidateQueries({ queryKey: ["journal"] });
  };

  const save = useMutation({
    mutationFn: () => {
      const input = { ...(clientId ? { clientId } : {}), projetIds, lignes: parsed, tvaPourcent: Number(tva) || 0 };
      return proforma ? proformasApi.update(proforma.id, input) : proformasApi.create(input);
    },
    onSuccess: (p) => {
      toast.success(proforma ? "Pro forma modifiée — action enregistrée dans le journal" : "Pro forma créée");
      refresh();
      void navigate({ to: "/factures/proforma/$id", params: { id: p.id } });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const setStatut = useMutation({
    mutationFn: (s: StatutProforma) => proformasApi.setStatut(proforma!.id, s),
    onSuccess: () => {
      toast.success("Statut mis à jour");
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const generer = useMutation({
    mutationFn: () => proformasApi.genererFacture(proforma!.id),
    onSuccess: (f) => {
      toast.success(`Facture ${f.numero} générée et signée — action enregistrée dans le journal`);
      refresh();
      void navigate({ to: "/factures/commerciale/$id", params: { id: f.id } });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const remove = useMutation({
    mutationFn: () => proformasApi.remove(proforma!.id),
    onSuccess: () => {
      toast.success("Pro forma supprimée");
      refresh();
      void navigate({ to: "/factures" });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const validate = () => {
    const err: Record<string, string> = {};
    if (!parsed.length) err["lignes"] = "Ajoutez au moins une ligne";
    lignes.forEach((l, i) => {
      if (!l.designation.trim()) err[`d${i}`] = "Désignation requise";
      if (!(Number(l.quantite) > 0)) err[`q${i}`] = "Quantité > 0";
      if (l.prix === "" || Number(l.prix) < 0) err[`p${i}`] = "Prix invalide";
    });
    const v = Number(tva);
    if (Number.isNaN(v) || v < 0 || v > 100) err["tva"] = "TVA entre 0 et 100";
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const patch = (key: number, p: Partial<LigneDraft>) => setLignes((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const toggleProjet = (id: string) => setProjetIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  /** Une ligne par pack des projets sélectionnés (prix = prix du pack). */
  const prefill = () => {
    const sel = (projets.data?.data ?? []).filter((p) => projetIds.includes(p.id));
    const nouvelles = sel.flatMap((p) =>
      p.packs.map((k) => ({ key: ++seq, designation: sel.length > 1 ? `${p.nom} — ${k.nom}` : k.nom, quantite: "1", prix: String(Math.round(k.prixCentimes / 100)) })),
    );
    if (!nouvelles.length) {
      toast.info("Les projets sélectionnés n'ont aucun pack à reprendre.");
      return;
    }
    setLignes((ls) => [...ls.filter((l) => l.designation.trim() || l.prix), ...nouvelles]);
    toast.success(`${nouvelles.length} ligne(s) ajoutée(s) depuis les packs`);
  };

  const signeEtModifiable = Boolean(proforma?.signature) && !locked;

  return (
    <div className="max-w-4xl space-y-6">
      {proforma && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge {...STATUT_PROFORMA[proforma.statut]} />
            {locked ? (
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" aria-hidden /> Verrouillée : une facture commerciale a été générée.
                {proforma.factureCommercialeId && (
                  <Link to="/factures/commerciale/$id" params={{ id: proforma.factureCommercialeId }} className="ml-1 text-foreground underline">
                    Voir la facture
                  </Link>
                )}
              </span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(["envoyee", "acceptee", "refusee"] as StatutProforma[])
                  .filter((s) => s !== proforma.statut)
                  .map((s) => (
                    <Button key={s} size="sm" variant="outline" disabled={setStatut.isPending} onClick={() => setStatut.mutate(s)}>
                      Marquer « {STATUT_PROFORMA[s].label} »
                    </Button>
                  ))}
              </div>
            )}
            {peutGenererFacture(proforma) && (
              <Button className="ml-auto" onClick={() => setGenerating(true)} disabled={generer.isPending}>
                <FileCheck2 className="mr-1 h-4 w-4" aria-hidden /> Générer la facture commerciale
              </Button>
            )}
          </div>

          {proforma.statut === "acceptee" && !proforma.clientId && !locked && (
            <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              Cette pro forma n'a pas de client : associez-en un ci-dessous avant de générer la facture.
            </p>
          )}

          <ShareLink
            type="pf"
            token={proforma.tokenConsultation}
            label="Lien de consultation de la pro forma"
            aide={
              proforma.statut === "brouillon"
                ? "Copier le lien envoie la pro forma : elle passe à « Envoyée » et reçoit votre signature électronique. Le client pourra alors la valider ou la refuser."
                : "Le client consulte la pro forma signée et peut la valider (la facture commerciale est alors générée automatiquement) ou la refuser."
            }
            avantCopie={async () => {
              if (proforma.statut === "brouillon") await proformasApi.setStatut(proforma.id, "envoyee");
              refresh();
            }}
          />

          {(proforma.signature || proforma.decisionClient) && (
            <section aria-label="Signatures" className="grid gap-6 rounded-lg border p-4 sm:grid-cols-2">
              {proforma.signature && <SignatureBloc titre="Signature de l'émetteur" nom={proforma.signature.par.nom} le={proforma.signature.le} hash={proforma.signature.hash} />}
              {proforma.decisionClient && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Décision du client</div>
                  <div className="mt-2 font-medium">
                    {proforma.statut === "refusee" ? "Refusée" : "Validée"} par {proforma.decisionClient.nom}
                  </div>
                  <div className="text-xs text-muted-foreground">le {formatDateHeure(proforma.decisionClient.le)}</div>
                </div>
              )}
            </section>
          )}
        </>
      )}

      <form
        className="space-y-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!locked && validate()) save.mutate();
        }}
      >
        <fieldset disabled={locked} className="space-y-6">
          <Field label="Client (facultatif)">
            <Select value={clientId || AUCUN} onValueChange={(v) => setClientId(v === AUCUN ? "" : v)}>
              <SelectTrigger aria-label="Client">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUCUN}>Aucun : le client s'identifiera en validant</SelectItem>
                {clients.data?.data.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.prenom} {c.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Projets concernés (un ou plusieurs)</legend>
            {projets.data?.data.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {projets.data.data.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm hover:bg-muted/50">
                    <Checkbox checked={projetIds.includes(p.id)} onCheckedChange={() => toggleProjet(p.id)} className="mt-0.5" />
                    <span>
                      {p.nom}
                      <span className="block text-xs text-muted-foreground">{p.packs.length ? `${p.packs.length} pack(s)` : "aucun pack"}</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun projet disponible.</p>
            )}
            {projetIds.length > 0 && (
              <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={prefill}>
                <Wand2 className="mr-1 h-4 w-4" aria-hidden /> Pré-remplir les lignes avec les packs
              </Button>
            )}
          </fieldset>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-medium">Lignes</h2>
              <Button type="button" size="sm" variant="outline" onClick={() => setLignes((ls) => [...ls, blank()])}>
                <Plus className="mr-1 h-4 w-4" aria-hidden /> Ajouter une ligne
              </Button>
            </div>
            {errors["lignes"] && <p className="text-xs text-destructive">{errors["lignes"]}</p>}
            <div className="space-y-2">
              {lignes.map((l, i) => (
                <div key={l.key} className="grid grid-cols-12 items-start gap-2">
                  <div className="col-span-12 sm:col-span-6">
                    <Input aria-label={`Désignation ligne ${i + 1}`} placeholder="Désignation" value={l.designation} onChange={(e) => patch(l.key, { designation: e.target.value })} />
                    {errors[`d${i}`] && <p className="mt-1 text-xs text-destructive">{errors[`d${i}`]}</p>}
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <Input aria-label={`Quantité ligne ${i + 1}`} type="number" min={0} step="any" value={l.quantite} onChange={(e) => patch(l.key, { quantite: e.target.value })} />
                    {errors[`q${i}`] && <p className="mt-1 text-xs text-destructive">{errors[`q${i}`]}</p>}
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <Input aria-label={`Prix unitaire ligne ${i + 1} (FCFA)`} type="number" min={0} placeholder="Prix unitaire" value={l.prix} onChange={(e) => patch(l.key, { prix: e.target.value })} />
                    {errors[`p${i}`] && <p className="mt-1 text-xs text-destructive">{errors[`p${i}`]}</p>}
                  </div>
                  <div className="col-span-3 flex justify-end sm:col-span-1">
                    <Button type="button" variant="ghost" size="icon" aria-label={`Supprimer la ligne ${i + 1}`} disabled={lignes.length === 1} onClick={() => setLignes((ls) => ls.filter((x) => x.key !== l.key))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border p-4">
            <Field label="TVA (%)" error={errors["tva"]} htmlFor="pf-tva">
              <Input id="pf-tva" className="w-28" type="number" min={0} max={100} step="any" value={tva} onChange={(e) => setTva(e.target.value)} />
            </Field>
            <dl className="space-y-1 text-right text-sm">
              <div className="flex justify-between gap-8">
                <dt className="text-muted-foreground">Total HT</dt>
                <dd>{formatMontant(t.ht)}</dd>
              </div>
              <div className="flex justify-between gap-8">
                <dt className="text-muted-foreground">TVA</dt>
                <dd>{formatMontant(t.tva)}</dd>
              </div>
              <div className="flex justify-between gap-8 text-base font-semibold">
                <dt>Total TTC</dt>
                <dd>{formatMontant(t.ttc)}</dd>
              </div>
            </dl>
          </div>
        </fieldset>

        {signeEtModifiable && (
          <p className="text-xs text-muted-foreground">Modifier une pro forma déjà signée annule sa signature et la remet en brouillon : il faudra la renvoyer.</p>
        )}

        {!locked && (
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Enregistrement…" : proforma ? "Enregistrer les modifications" : "Créer la pro forma"}
            </Button>
            {proforma && (
              <Button type="button" variant="outline" onClick={() => setDeleting(true)}>
                <Trash2 className="mr-1 h-4 w-4" aria-hidden /> Supprimer
              </Button>
            )}
          </div>
        )}
      </form>

      <ConfirmDialog
        open={generating}
        onOpenChange={setGenerating}
        title="Générer la facture commerciale ?"
        description="Cette action est irréversible : la facture sera signée, ne pourra plus être modifiée, et la pro forma sera verrouillée."
        confirmLabel="Générer"
        onConfirm={() => generer.mutate()}
      />
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} destructive title="Supprimer cette pro forma ?" description="Cette action est irréversible." confirmLabel="Supprimer" onConfirm={() => remove.mutate()} />
    </div>
  );
}
