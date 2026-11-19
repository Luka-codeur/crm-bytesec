import { createFileRoute, Outlet } from "@tanstack/react-router";
import { USE_MOCK } from "@/api/client";
import { MOCK_USERS } from "@/api/mock/db";
import { AppShell } from "@/components/app-shell";
import { ErrorState, FullPageSpinner } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/labels";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

/** La connexion Keycloak ne concerne que l espace interne : les liens publics (/p, /pf, /f) restent accessibles sans compte. */
function AppLayout() {
  return (
    <AuthProvider>
      <Garde />
    </AuthProvider>
  );
}

function Garde() {
  const { status, user, error } = useAuth();
  if (status === "loading") return <FullPageSpinner label="Connexion…" />;
  if (!user) return USE_MOCK ? <MockLogin /> : <div className="p-8"><ErrorState message={error ?? "Non connecté."} onRetry={() => window.location.reload()} /></div>;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function MockLogin() {
  const { loginMock } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-sm">
        <h1 className="text-xl font-semibold">ByteSec CRM</h1>
        <p className="mt-1 text-sm text-muted-foreground">Mode démo (données fictives). Choisissez un profil :</p>
        <div className="mt-5 space-y-2">
          {MOCK_USERS.map((u) => (
            <Button key={u.id} variant="outline" className="w-full justify-between" onClick={() => loginMock(u.id)}>
              <span>
                {u.prenom} {u.nom}
              </span>
              <span className="text-xs text-muted-foreground">{ROLE_LABEL[u.role]}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
