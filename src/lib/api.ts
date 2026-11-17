import axios from "axios";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.DEV
    ? "http://localhost:3000/api/v1"
    : "https://cathecese-flow-api.vercel.app/api/v1");

export const AI_API_BASE_URL =
  (import.meta.env.VITE_AI_API_BASE_URL as string | undefined) ??
  (import.meta.env.DEV
    ? "http://localhost:8000/api/v1"
    : "https://cathecese-flow-ai.vercel.app/api/v1");

export const aiApi = axios.create({
  baseURL: AI_API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

export const TOKEN_STORAGE_KEY = "catheceseflow.token";
export const USER_STORAGE_KEY = "catheceseflow.user";
export const AUTH_EXPIRED_EVENT = "catheceseflow:auth-expired";

export function getTokenExpirationMs(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const expMs = getTokenExpirationMs(token);
  if (expMs == null) return false;
  return Date.now() >= expMs;
}

export function handleExpiredSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(USER_STORAGE_KEY);
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  if (!window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

function isJwtErrorResponse(error: unknown): boolean {
  const err = error as {
    response?: { status?: number; data?: { message?: string } };
  };
  const status = err?.response?.status;
  const message = String(err?.response?.data?.message ?? "");
  if (status === 401) return true;
  if (
    status === 500 &&
    /jwt expired|invalid token|jwt malformed|invalid signature|token inválido ou expirado/i.test(
      message,
    )
  ) {
    return true;
  }
  return false;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (token) {
      if (isTokenExpired(token)) {
        const url = String(config.url ?? "");
        const isPublicAuthRoute =
          url.includes("/users/login") ||
          url.includes("/users/register") ||
          url.includes("/parishes");

        if (isPublicAuthRoute) {
          window.localStorage.removeItem(TOKEN_STORAGE_KEY);
          window.localStorage.removeItem(USER_STORAGE_KEY);
          return config;
        }

        handleExpiredSession();
        return Promise.reject(new axios.CanceledError("Sessão expirada. Faça login novamente."));
      }

      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== "undefined" && isJwtErrorResponse(error)) {
      const url = String(error?.config?.url ?? "");
      if (!url.includes("/users/login")) {
        handleExpiredSession();
      }
    }
    return Promise.reject(error);
  },
);

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: "Admin" | "Coordenador" | "Catequista";
  ParishId: number;
};

export type ClassItem = {
  id: number;
  type: "Primeira Comunhão" | "Perseverança" | "Crisma";
  location: string;
  day: "Segunda" | "Terça" | "Quarta" | "Quinta" | "Sexta" | "Sabado";
  start: string;
  end: string;
  ParishId: number;
};

export type Lecture = {
  id: number;
  location: string;
  theme: string;
  hour: string;
  date: string;
  ClassId: number;
  Users?: Array<{ id: number; name: string; role: string }>;
};

export type StudentPhone = {
  id?: number;
  number: string;
  label?: string | null;
};

export type StudentAddress = {
  road?: string | null;
  house_number?: number | null;
  code?: string | null;
  city?: string | null;
  neighborhood?: string | null;
};

export type Student = {
  id: number;
  name: string;
  phones: StudentPhone[];
  phone?: string;
  cpf: string;
  birthDate?: string | null;
  fatherName?: string | null;
  motherName?: string | null;
  description?: string | null;
  ClassId: number;
  AddressId: number;
  hasBaptism: boolean;
  hasFirstCommunion: boolean;
  userId: number | null;
  catequista?: { id: number; name: string; role: string } | null;
  address?: StudentAddress;
  road?: string | null;
  house_number?: number | null;
  code?: string | null;
  city?: string | null;
  neighborhood?: string | null;
};

export function formatStudentPhone(phone: StudentPhone): string {
  return phone.label ? `${phone.label}: ${phone.number}` : phone.number;
}
