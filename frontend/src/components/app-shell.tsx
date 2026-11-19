import { Link, useRouterState } from "@tanstack/react-router";
import { ClipboardList, FileText, FolderKanban, History, LogOut, Menu, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { MOCK_USERS } from "@/api/mock/db";
import { USE_MOCK } from "@/api/client";
import { useAuth } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/clients", label: "Clients", icon: Users, chefOnly: false },
  { to: "/projets", label: "Projets", icon: FolderKanban, chefOnly: false },
  { to: "/factures", label: "Factures", icon: FileText, chefOnly: false },
  { to: "/taches", label: "Tâches", icon: ClipboardList, chefOnly: false },
  { to: "/journal", label: "Journal", icon: History, chefOnly: true },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { isChef } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Navigation principale">
      {NAV.filter((n) => !n.chefOnly || isChef).map((n) => {
        const active = path === n.to || path.startsWith(`${n.to}/`);
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
            )}
          >
            <n.icon className="h-4 w-4" aria-hidden /> {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4 font-semibold">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">BS</span>
      ByteSec CRM
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout, loginMock } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:block no-print">
        <Brand />
        <NavLinks />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b px-4 no-print">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Ouvrir le menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-60 bg-sidebar p-0 text-sidebar-foreground">
              <Brand />
              <NavLinks onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="ml-auto flex items-center gap-3">
            {USE_MOCK && (
              <select
                aria-label="Changer d'utilisateur (démo)"
                className="rounded-md border bg-background px-2 py-1 text-xs"
                value={user?.id}
                onChange={(e) => loginMock(e.target.value)}
              >
                {MOCK_USERS.map((u) => (
                  <option key={u.id} value={u.id}>
                    Démo : {u.prenom} ({ROLE_LABEL[u.role]})
                  </option>
                ))}
              </select>
            )}
            <div className="text-right text-sm leading-tight">
              <div className="font-medium">
                {user?.prenom} {user?.nom}
              </div>
              <div className="text-xs text-muted-foreground">{user ? ROLE_LABEL[user.role] : ""}</div>
            </div>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="mr-1 h-4 w-4" aria-hidden /> Déconnexion
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
