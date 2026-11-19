import { Check, Copy, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errMsg } from "@/lib/api-utils";

/** Préfixes des routes publiques : /p/<jeton> (projet), /pf/<jeton> (pro forma), /f/<jeton> (facture). */
export type LienType = "p" | "pf" | "f";

export function lienPublic(type: LienType, token: string, origin = typeof window !== "undefined" ? window.location.origin : "") {
  return `${origin}/${type}/${token}`;
}

async function copier(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Contexte non sécurisé ou permission refusée : repli par sélection d'un champ temporaire.
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  }
}

/**
 * Lien de consultation copiable. `avantCopie` permet de déclencher une action métier au moment du partage
 * (ex. marquer le projet « partagé », envoyer et signer la pro forma) ; la copie n'a lieu que si elle réussit.
 */
export function ShareLink({
  type, token, label, aide, avantCopie,
}: {
  type: LienType;
  token: string;
  label: string;
  aide?: string;
  avantCopie?: () => Promise<unknown>;
}) {
  // L'origine n'est connue que côté navigateur : évite un écart d'hydratation.
  const [origin, setOrigin] = useState("");
  const [copie, setCopie] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  const url = lienPublic(type, token, origin);

  const onCopy = async () => {
    setBusy(true);
    try {
      if (avantCopie) await avantCopie();
      if (await copier(url)) {
        setCopie(true);
        toast.success("Lien copié dans le presse-papiers");
        setTimeout(() => setCopie(false), 2500);
      } else toast.error("Copie impossible : sélectionnez le lien et copiez-le manuellement.");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={label} className="rounded-lg border bg-muted/30 p-4 no-print">
      <h2 className="text-sm font-medium">{label}</h2>
      {aide && <p className="mt-1 text-xs text-muted-foreground">{aide}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Input readOnly aria-label={label} value={url} onFocus={(e) => e.currentTarget.select()} className="min-w-64 flex-1 font-mono text-xs" />
        <Button type="button" onClick={() => void onCopy()} disabled={busy || !origin}>
          {copie ? <Check className="mr-1 h-4 w-4" aria-hidden /> : <Copy className="mr-1 h-4 w-4" aria-hidden />}
          {copie ? "Copié" : "Copier le lien"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-1 h-4 w-4" aria-hidden /> Ouvrir
          </a>
        </Button>
      </div>
    </section>
  );
}
