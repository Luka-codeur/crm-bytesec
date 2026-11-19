import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { clientsApi } from "@/api/clients";
import { Field } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { applyFieldErrors, errMsg } from "@/lib/api-utils";
import { STATUT_CLIENT } from "@/lib/labels";
import type { Client, StatutClient } from "@/types";

const schema = z.object({
  nom: z.string().trim().min(1, "Nom requis"),
  prenom: z.string().trim().min(1, "Prénom requis"),
  adresse: z.string().trim(),
  email: z.string().trim().email("E-mail invalide"),
  telephone: z.string().trim().min(3, "Téléphone requis"),
  statut: z.enum(["prospect", "qualifie", "confirme"]),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = { nom: "", prenom: "", adresse: "", email: "", telephone: "", statut: "prospect" };

export function ClientFormDialog({ open, onOpenChange, client }: { open: boolean; onOpenChange: (o: boolean) => void; client?: Client }) {
  const qc = useQueryClient();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { register, handleSubmit, reset, setError, setValue, watch, formState } = form;
  const { errors } = formState;

  useEffect(() => {
    if (open) reset(client ? { nom: client.nom, prenom: client.prenom, adresse: client.adresse, email: client.email, telephone: client.telephone, statut: client.statut } : EMPTY);
  }, [open, client, reset]);

  const save = useMutation({
    mutationFn: (v: Values) => (client ? clientsApi.update(client.id, v) : clientsApi.create(v)),
    onSuccess: () => {
      toast.success(client ? "Client mis à jour" : "Client créé");
      void qc.invalidateQueries({ queryKey: ["clients"] });
      void qc.invalidateQueries({ queryKey: ["client"] });
      void qc.invalidateQueries({ queryKey: ["journal"] });
      onOpenChange(false);
    },
    onError: (e) => {
      if (!applyFieldErrors(e, setError)) toast.error(errMsg(e));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{client ? "Modifier le client" : "Nouveau client"}</DialogTitle>
          <DialogDescription>Les champs nom, prénom, e-mail et téléphone sont obligatoires.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom" error={errors.nom?.message} htmlFor="c-nom">
              <Input id="c-nom" {...register("nom")} />
            </Field>
            <Field label="Prénom" error={errors.prenom?.message} htmlFor="c-prenom">
              <Input id="c-prenom" {...register("prenom")} />
            </Field>
          </div>
          <Field label="Adresse" error={errors.adresse?.message} htmlFor="c-adresse">
            <Input id="c-adresse" {...register("adresse")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="E-mail" error={errors.email?.message} htmlFor="c-email">
              <Input id="c-email" type="email" {...register("email")} />
            </Field>
            <Field label="Téléphone" error={errors.telephone?.message} htmlFor="c-tel">
              <Input id="c-tel" type="tel" {...register("telephone")} />
            </Field>
          </div>
          {!client && (
            <Field label="Statut">
              <Select value={watch("statut")} onValueChange={(v) => setValue("statut", v as StatutClient)}>
                <SelectTrigger>
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
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
