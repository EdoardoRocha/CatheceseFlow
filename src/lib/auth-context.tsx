import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, TOKEN_STORAGE_KEY, USER_STORAGE_KEY, type AuthUser } from "./api";

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    const u = window.localStorage.getItem(USER_STORAGE_KEY);
    if (t) setToken(t);
    if (u) {
      try {
        setUser(JSON.parse(u) as AuthUser);
      } catch {
        /* ignore */
      }
    }
    setIsReady(true);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post("/users/login", { email, password });
    // API doc has typo "toke" — accept both.
    const tk: string | undefined = data?.token ?? data?.toke;
    const u: AuthUser | undefined = data?.user;
    if (!tk || !u) throw new Error("Resposta de login inválida");
    window.localStorage.setItem(TOKEN_STORAGE_KEY, tk);
    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(u));
    setToken(tk);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(USER_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, isReady, login, logout }),
    [user, token, isReady, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}