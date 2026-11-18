import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  api,
  AUTH_EXPIRED_EVENT,
  getTokenExpirationMs,
  isTokenExpired,
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
  type AuthUser,
} from "./api";
import { clearMartaChatStorage } from "./marta-storage";

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

  const logout = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(USER_STORAGE_KEY);
      clearMartaChatStorage();
    }
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    const u = window.localStorage.getItem(USER_STORAGE_KEY);
    if (t && !isTokenExpired(t)) {
      setToken(t);
      if (u) {
        try {
          setUser(JSON.parse(u) as AuthUser);
        } catch {
          /* ignore */
        }
      }
    } else if (t) {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(USER_STORAGE_KEY);
    }
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleAuthExpired = () => {
      logout();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === TOKEN_STORAGE_KEY && !event.newValue) {
        setToken(null);
        setUser(null);
      }
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
      window.removeEventListener("storage", handleStorage);
    };
  }, [logout]);

  useEffect(() => {
    if (typeof window === "undefined" || !token) return;

    if (isTokenExpired(token)) {
      logout();
      return;
    }

    const expMs = getTokenExpirationMs(token);
    let timeoutId: number | undefined;
    if (expMs != null) {
      const delay = Math.max(0, Math.min(expMs - Date.now(), 2147483647));
      timeoutId = window.setTimeout(() => {
        logout();
      }, delay);
    }

    const checkExpirationOnFocus = () => {
      if (isTokenExpired(token)) {
        logout();
      }
    };

    window.addEventListener("focus", checkExpirationOnFocus);
    document.addEventListener("visibilitychange", checkExpirationOnFocus);

    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      window.removeEventListener("focus", checkExpirationOnFocus);
      document.removeEventListener("visibilitychange", checkExpirationOnFocus);
    };
  }, [token, logout]);

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
