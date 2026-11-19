import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type Keycloak from "keycloak-js";
import { configureApi, USE_MOCK } from "@/api/client";
import { MOCK_USERS, setMockUser } from "@/api/mock/db";
import { usersApi } from "@/api/users";
import type { Utilisateur } from "@/types";

type Status = "loading" | "anonymous" | "authenticated";

interface AuthCtx {
  status: Status;
  user: Utilisateur | null;
  error: string | null;
  isChef: boolean;
  /** Mode démo uniquement : se connecter en tant qu'un utilisateur fictif. */
  loginMock: (userId: string) => void;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);
const STORAGE_KEY = "crm.mock.user";

let keycloakStarted = false;

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<Utilisateur | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kcRef = useRef<Keycloak | null>(null);

  useEffect(() => {
    if (USE_MOCK) {
      let saved: string | null = null;
      try {
        saved = sessionStorage.getItem(STORAGE_KEY);
      } catch {
        /* stockage indisponible */
      }
      const u = MOCK_USERS.find((m) => m.id === saved);
      if (u) {
        setMockUser(u);
        setUser(u);
        setStatus("authenticated");
      } else setStatus("anonymous");
      return;
    }

    // Keycloak ne doit être initialisé qu'une fois (React StrictMode double les effets en dev).
    if (keycloakStarted) return;
    keycloakStarted = true;
    void (async () => {
      try {
        const { default: KeycloakCtor } = await import("keycloak-js");
        const kc = new KeycloakCtor({
          url: import.meta.env["VITE_KEYCLOAK_URL"] ?? "http://localhost:8080",
          realm: import.meta.env["VITE_KEYCLOAK_REALM"] ?? "crm",
          clientId: import.meta.env["VITE_KEYCLOAK_CLIENT_ID"] ?? "crm-frontend",
        });
        kcRef.current = kc;
        configureApi({
          getToken: async () => {
            try {
              await kc.updateToken(30);
            } catch {
              await kc.login();
            }
            return kc.token;
          },
          onUnauthorized: () => void kc.login(),
        });
        const authenticated = await kc.init({ onLoad: "login-required", pkceMethod: "S256", checkLoginIframe: false });
        if (!authenticated) return;
        setUser(await usersApi.me());
        setStatus("authenticated");
      } catch (e) {
        keycloakStarted = false;
        setError(e instanceof Error ? e.message : "Connexion impossible.");
        setStatus("anonymous");
      }
    })();
  }, []);

  const loginMock = useCallback(
    (userId: string) => {
      const u = MOCK_USERS.find((m) => m.id === userId);
      if (!u) return;
      setMockUser(u);
      try {
        sessionStorage.setItem(STORAGE_KEY, u.id);
      } catch {
        /* ignoré */
      }
      qc.clear();
      setUser(u);
      setStatus("authenticated");
    },
    [qc],
  );

  const logout = useCallback(() => {
    qc.clear();
    if (USE_MOCK) {
      setMockUser(null);
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignoré */
      }
      setUser(null);
      setStatus("anonymous");
    } else {
      void kcRef.current?.logout({ redirectUri: window.location.origin });
    }
  }, [qc]);

  const value = useMemo<AuthCtx>(
    () => ({ status, user, error, isChef: user?.role === "chef_equipe", loginMock, logout }),
    [status, user, error, loginMock, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return v;
}
