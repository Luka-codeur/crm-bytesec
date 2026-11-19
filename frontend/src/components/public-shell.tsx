import type { ReactNode } from "react";

/** Coque minimale des pages publiques (liens de consultation) : pas de navigation interne, pas de connexion. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background no-print">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4 font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">BS</span>
          ByteSec
        </div>
      </header>
      <main className="mx-auto max-w-3xl p-4 md:p-6">{children}</main>
      <footer className="no-print px-4 pb-8 text-center text-xs text-muted-foreground">ByteSec · Cybersécurité et formation</footer>
    </div>
  );
}

export function LienInvalide({ message = "Ce lien n'est plus valide ou a expiré." }: { message?: string }) {
  return (
    <div role="alert" className="rounded-lg border bg-background p-8 text-center">
      <h1 className="text-lg font-semibold">Lien introuvable</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <p className="mt-1 text-sm text-muted-foreground">Demandez un nouveau lien à votre interlocuteur ByteSec.</p>
    </div>
  );
}
