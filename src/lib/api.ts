import axios from "axios";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "https://cathecese-flow-api.vercel.app/api/v1";

export const TOKEN_STORAGE_KEY = "catheceseflow.token";
export const USER_STORAGE_KEY = "catheceseflow.user";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (token) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && typeof window !== "undefined") {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(USER_STORAGE_KEY);
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
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
