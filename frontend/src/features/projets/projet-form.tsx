import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formationsApi } from "@/api/formations";
import { projetsApi } from "@/api/projects";
import { Field } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errMsg } from "@/lib/api-utils";
import { formatMontant, unitsToCentimes } from "@/lib/format";
import type { Formation, Pack, Projet } from "@/types";

interface PackDraft {
  key: string;
  nom: string;
  description: string;
  /** Prix saisi (FCFA). Ignoré tant que `custom` est faux : le prix suit alors la somme des formations. */
  prix: string;
  custom: boolean;
  formationIds: string[];
}

let seq = 0;
const newKey = () => `p${++seq}`;
const vide = (): PackDraft => ({ key: newKey(), nom: "", description: "", prix: "", custom: false, formationIds: [] });

const fromPack = (p: Pack): PackDraft => ({
  key: p.id,
  nom: p.nom,
  description: p.description,
  prix: String(Math.round(p.prixCentimes / 100)),
  custom: p.prixPersonnalise,
  formationIds: p.formations.map((f) => f.id),
});

/** Même découpage que l'API : en francs entiers, la dernière tranche absorbe le reste. */
const tranches = (prix: number, n = 3) => {
  const base = Math.floor(prix / 100 / n) * 100;
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? prix - base * (n - 1) : base));
};

export function ProjetForm({ projet }: { projet?: Projet }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [nom, setNom] = useState(projet?.nom ?? "");
  const [description, setDescription] = useState(projet?.description ?? "");
  // Un projet peut n'avoir aucun pack : la liste de départ est vide à la création.
  const [packs, setPacks] = useState<PackDraft[]>(projet ? projet.packs.map(fromPack) : []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [nf, setNf] = useState({ titre: "", dureeHeures: "", prix: "" });

  const formations = useQuery({ queryKey: ["formations"], queryFn: formationsApi.list });
  const catalogue: Formation[] = formations.data ?? [];

  /** Prix calculé automatiquement : somme des prix des formations cochées (centimes). */
  const prixAuto = (p: PackDraft) => catalogue.filter((f) => p.formationIds.includes(f.id)).reduce((s, f) => s + f.prixCentimes, 0);
  /** Prix effectif du pack (centimes) : valeur saisie si modifiée, sinon calcul automatique. */
  const prixEffectif = (p: PackDraft) => (p.custom ? unitsToCentimes(Number(p.prix) || 0) : prixAuto(p));

  const createFormation = useMutation({
    mutationFn: (f: Omit<Formation, "id">) => formationsApi.create(f),
    onSuccess: () => {
      toast.success("Formation ajoutée au catalogue");
      setNf({ titre: "", dureeHeures: "", prix: "" });
      void qc.invalidateQueries({ queryKey: ["formations"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const save = useMutation({
    mutationFn: () => {
      const input = {
        nom: nom.trim(),
        description: description.trim(),
        packs: packs.map((p) => ({
          nom: p.nom.trim(),
          description: p.description.trim(),
          // Absent = l'API recalcule la somme des formations.
          ...(p.custom ? { prixCentimes: prixEffectif(p) } : {}),
          formations: p.formationIds.map((id) => ({ id })),
        })),
      };
      return projet ? projetsApi.update(projet.id, input) : projetsApi.create(input);
    },
    onSuccess: (p) => {
      toast.success(projet ? "Projet mis à jour" : "Projet créé : son lien de consultation est prêt à être partagé");
      void qc.invalidateQueries({ queryKey: ["projets"] });
      void qc.invalidateQueries({ queryKey: ["projet"] });
      void navigate({ to: "/projets/$id", params: { id: p.id } });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const validate = () => {
    const err: Record<string, string> = {};
    if (!nom.trim()) err["nom"] = "Nom requis";
    packs.forEach((p) => {
      if (!p.nom.trim()) err[`${p.key}.nom`] = "Nom du pack requis";
      if (p.custom && (p.prix === "" || Number(p.prix) < 0)) err[`${p.key}.prix`] = "Prix invalide";
      if (!p.formationIds.length) err[`${p.key}.formations`] = "Au moins une formation";
    });
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const patchPack = (key: string, patch: Partial<PackDraft>) => setPacks((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const toggleFormation = (key: string, fid: string) =>
    setPacks((ps) => ps.map((p) => (p.key === key ? { ...p, formationIds: p.formationIds.includes(fid) ? p.formationIds.filter((x) => x !== fid) : [...p.formationIds, fid] } : p)));

  return (
    <form
      className="max-w-3xl space-y-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (validate()) save.mutate();
      }}
    >
      <Field label="Nom du projet" error={errors["nom"]} htmlFor="pr-nom">
        <Input id="pr-nom" value={nom} onChange={(e) => setNom(e.target.value)} />
      </Field>
      <Field label="Description" htmlFor="pr-desc">
        <Textarea id="pr-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        Un lien de consultation public est généré à la création du projet. Vous pourrez le copier et l'envoyer à vos prospects : ils verront le projet en
        lecture seule et pourront s'inscrire en un clic.
      </p>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Packs <span className="text-sm font-normal text-muted-foreground">(facultatifs)</span></h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setPacks((ps) => [...ps, vide()])}>
            <Plus className="mr-1 h-4 w-4" aria-hidden /> Ajouter un pack
          </Button>
        </div>
        {!packs.length && <p className="text-sm text-muted-foreground">Ce projet n'a aucun pack. Ajoutez-en un ou plusieurs si nécessaire.</p>}

        {packs.map((p, i) => {
          const auto = prixAuto(p);
          const effectif = prixEffectif(p);
          return (
            <div key={p.key} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Pack {i + 1}</span>
                <Button type="button" variant="ghost" size="sm" aria-label={`Supprimer le pack ${i + 1}`} onClick={() => setPacks((ps) => ps.filter((x) => x.key !== p.key))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Field label="Nom du pack" error={errors[`${p.key}.nom`]} htmlFor={`pk-${p.key}`}>
                <Input id={`pk-${p.key}`} value={p.nom} onChange={(e) => patchPack(p.key, { nom: e.target.value })} />
              </Field>
              <Field label="Description" htmlFor={`pd-${p.key}`}>
                <Input id={`pd-${p.key}`} value={p.description} onChange={(e) => patchPack(p.key, { description: e.target.value })} />
              </Field>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">Formations</legend>
                {catalogue.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {catalogue.map((f) => (
                      <label key={f.id} className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm hover:bg-muted/50">
                        <Checkbox checked={p.formationIds.includes(f.id)} onCheckedChange={() => toggleFormation(p.key, f.id)} className="mt-0.5" />
                        <span>
                          {f.titre}
                          <span className="block text-xs text-muted-foreground">
                            {f.dureeHeures} h · {formatMontant(f.prixCentimes)}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Catalogue vide : ajoutez une formation ci-dessous.</p>
                )}
                {errors[`${p.key}.formations`] && <p className="mt-1 text-xs text-destructive">{errors[`${p.key}.formations`]}</p>}
              </fieldset>

              <div className="rounded-md bg-muted/40 p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Prix du pack (FCFA)" error={errors[`${p.key}.prix`]} htmlFor={`pp-${p.key}`}>
                    <Input
                      id={`pp-${p.key}`}
                      type="number"
                      min={0}
                      className="w-44"
                      value={p.custom ? p.prix : String(Math.round(auto / 100))}
                      onChange={(e) => patchPack(p.key, { prix: e.target.value, custom: true })}
                    />
                  </Field>
                  {p.custom ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => patchPack(p.key, { custom: false })}>
                      <RotateCcw className="mr-1 h-4 w-4" aria-hidden /> Rétablir le prix calculé ({formatMontant(auto)})
                    </Button>
                  ) : (
                    <span className="pb-2 text-xs text-muted-foreground">Calculé automatiquement : somme des formations. Modifiable.</span>
                  )}
                </div>
                <p className="mt-2 text-sm" aria-live="polite">
                  <span className="text-muted-foreground">Paiement en 3 tranches : </span>
                  <strong>{tranches(effectif).map((t) => formatMontant(t)).join(" · ")}</strong>
                </p>
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-lg border border-dashed p-4">
        <h3 className="mb-3 text-sm font-medium">Ajouter une formation au catalogue</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Input aria-label="Titre de la formation" placeholder="Titre" value={nf.titre} onChange={(e) => setNf({ ...nf, titre: e.target.value })} />
          </div>
          <Input aria-label="Durée en heures" type="number" min={0} placeholder="Durée (h)" value={nf.dureeHeures} onChange={(e) => setNf({ ...nf, dureeHeures: e.target.value })} />
          <Input aria-label="Prix en FCFA" type="number" min={0} placeholder="Prix (FCFA)" value={nf.prix} onChange={(e) => setNf({ ...nf, prix: e.target.value })} />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          disabled={!nf.titre.trim() || createFormation.isPending}
          onClick={() => createFormation.mutate({ titre: nf.titre.trim(), description: "", dureeHeures: Number(nf.dureeHeures) || 0, prixCentimes: unitsToCentimes(Number(nf.prix) || 0) })}
        >
          Ajouter au catalogue
        </Button>
      </section>

      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Enregistrement…" : projet ? "Enregistrer" : "Créer le projet"}
        </Button>
        <Button type="button" variant="outline" onClick={() => window.history.back()}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
