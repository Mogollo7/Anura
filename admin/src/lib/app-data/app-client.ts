"use client";

import { useCallback, useEffect, useState } from "react";
import { getToken } from "@/lib/auth/panel-client";
import { usePanelSession } from "@/lib/session/panel-session";

/**
 * Área App con datos reales: cuentas y teléfonos (auth-service), observaciones
 * (observation-service) y avisos (notification-service). Sin sesión real del panel no hay
 * nada que mostrar — no se cae a datos simulados.
 */

export type AppUser = {
  id: string;
  username: string;
  email: string;
  auth_provider: "email" | "google" | string;
  role: string;
  is_active: boolean;
  suspension_reason: string | null;
  is_verified: boolean | null;
  created_at: string;
  profile_image: string | null;
  en_panel: boolean;
  dispositivos: number;
  ultima_conexion: string | null;
};

export type AppDevice = {
  id: string;
  user_id: string;
  username: string;
  modelo: string | null;
  android: string | null;
  app_version: string | null;
  paquetes: { subregion: string | null; version: string | null }[];
  espacio_libre_mb: number | null;
  last_seen: string | null;
  created_at: string;
  bloqueado: boolean;
  bloqueo_motivo: string | null;
  cuenta_activa: boolean;
};

export type ObservationStatus = "draft" | "synced" | "in_review" | "validated" | "rejected";

export type AppObservation = {
  id: string;
  user_id: string;
  username: string;
  thumbnail_key: string | null;
  image_key: string | null;
  status: ObservationStatus;
  is_private: boolean | null;
  notes: string | null;
  place_guess: string | null;
  lat: number | null;
  lon: number | null;
  altitude_m: number | null;
  recorded_at: string | null;
  created_at: string;
  review_reason: string | null;
  reviewed_at: string | null;
  ai_class: string | null;
  ai_prob: number | null;
  common_name: string | null;
  /** Comentarios "en desacuerdo" con la identificación (observations.comments.stance). */
  refutaciones: number;
};

export type AuditEntry = {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: unknown;
  created_at: string;
  actor: string;
};

/** Nodo del árbol de entrega (país → departamento → subregión) de dataset-service. */
export type PaqueteNodo = {
  id: string;
  nombre: string;
  nivel: string;
  version: string | null;
  especies: number | null;
  formato: string | null;
  size_bytes: number;
  size_archivo?: number;
  sha256: string | null;
  hijos?: PaqueteNodo[];
};

export function aplanarPaquetes(nodos: PaqueteNodo[], profundidad = 0): { nodo: PaqueteNodo; profundidad: number }[] {
  return nodos.flatMap((nodo) => [{ nodo, profundidad }, ...aplanarPaquetes(nodo.hijos || [], profundidad + 1)]);
}

export type Aviso = {
  id: string;
  titulo: string;
  cuerpo: string | null;
  destino: "todos" | "usuario";
  autor: string | null;
  enviado: string;
  destinatarios: number;
  leidos: number;
  usuario: string | null;
};

export class AppApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new AppApiError(0, "No hay conexión con el servidor del Admin.");
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new AppApiError(res.status, body.message || `El servidor respondió ${res.status}`);
  return body as T;
}

const patch = (body: unknown) => ({ method: "PATCH", body: JSON.stringify(body) }) as RequestInit;

export const appApi = {
  users: () => call<{ usuarios: AppUser[] }>("/api/panel/usuarios").then((r) => r.usuarios),
  setUserActive: (id: string, activo: boolean, motivo?: string) =>
    call<{ usuario: Pick<AppUser, "id" | "is_active" | "suspension_reason"> }>(`/api/panel/usuarios/${id}`, patch({ activo, motivo })).then((r) => r.usuario),
  devices: () => call<{ dispositivos: AppDevice[] }>("/api/panel/dispositivos").then((r) => r.dispositivos),
  setDeviceBlocked: (id: string, bloqueado: boolean, motivo?: string) =>
    call<{ dispositivo: Pick<AppDevice, "id" | "bloqueado" | "bloqueo_motivo"> }>(`/api/panel/dispositivos/${id}`, patch({ bloqueado, motivo })).then((r) => r.dispositivo),
  observations: () => call<{ observaciones: AppObservation[] }>("/api/observations/panel").then((r) => r.observaciones),
  reviewObservation: (id: string, estado: "validated" | "rejected" | "in_review", motivo?: string) =>
    call<{ observacion: Pick<AppObservation, "id" | "status" | "review_reason" | "reviewed_at"> }>(`/api/observations/panel/${id}`, patch({ estado, motivo })).then((r) => r.observacion),
  avisos: () => call<{ avisos: Aviso[] }>("/api/notifications/panel/avisos").then((r) => r.avisos),
  sendAviso: (input: { titulo: string; cuerpo: string; destino: "todos" | "usuario"; usuario_id?: string }) =>
    call<{ id: string; destinatarios: number }>("/api/notifications/panel/avisos", { method: "POST", body: JSON.stringify(input) }),
  activity: (weeks?: number) =>
    call<ActivityApiResponse>(`/api/panel/actividad${weeks ? `?weeks=${weeks}` : ""}`),
  audit: () => call<{ entradas: AuditEntry[] }>("/api/panel/auditoria").then((r) => r.entradas ?? []),
  /** Lo que el teléfono y la web ya pueden descargar (sqlite y catálogos por subregión). */
  packages: () => call<{ paises: PaqueteNodo[] }>("/api/dataset/publico/paquetes").then((r) => r.paises ?? []),
};

export type GeoPointReal = {
  id: string;
  lat: number;
  lng: number;
  count: number;
  common_name: string;
  ai_class: string | null;
  username: string;
  thumbnail_key: string | null;
  created_at: string;
};

export type ActivityApiResponse = {
  series: import("@/lib/analytics/activity").ActivitySeries;
  geo?: {
    total: number;
    points: GeoPointReal[];
  };
};

/** Miniatura servida por thumbnail-service (misma que usa la web pública). */
export function thumbUrl(key: string | null, size: "small" | "medium" | "large" = "small") {
  if (!key) return null;
  return `/api/thumbnail/${size}/${encodeURIComponent(key.split("/").pop()!)}`;
}

export type Loadable<T> =
  | { state: "sin-sesion" }
  | { state: "cargando" }
  | { state: "error"; message: string; status: number }
  | { state: "listo"; data: T };

/** Carga un recurso solo con sesión real; `reload` vuelve a pedirlo, `set` aplica un cambio local. */
export function useAppResource<T>(load: () => Promise<T>) {
  const session = usePanelSession();
  const [fetched, setValue] = useState<Loadable<T>>({ state: "cargando" });
  const [tick, setTick] = useState(0);
  // Sin sesión real no se pide nada: el estado se deriva, no se guarda.
  const value: Loadable<T> = session.cargando ? { state: "cargando" } : !session.isReal ? { state: "sin-sesion" } : fetched;

  useEffect(() => {
    if (session.cargando || !session.isReal) return;
    let alive = true;
    load()
      .then((data) => alive && setValue({ state: "listo", data }))
      .catch((err: unknown) => {
        if (!alive) return;
        const e = err instanceof AppApiError ? err : new AppApiError(0, "No se pudo leer del servidor");
        setValue({ state: "error", message: e.message, status: e.status });
      });
    return () => {
      alive = false;
    };
    // `load` es estable por llamador (appApi.*); solo recarga por sesión o por `reload`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.cargando, session.isReal, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const set = useCallback((fn: (data: T) => T) => setValue((v) => (v.state === "listo" ? { state: "listo", data: fn(v.data) } : v)), []);
  return { value, reload, set };
}

export const PENDING_STATUSES: ObservationStatus[] = ["synced", "in_review"];

export const STATUS_INFO: Record<ObservationStatus, { label: string; tone: "neutral" | "accent" | "warning" | "danger" | "info" }> = {
  synced: { label: "Por revisar", tone: "warning" },
  in_review: { label: "En revisión", tone: "info" },
  validated: { label: "Aprobada", tone: "accent" },
  rejected: { label: "Rechazada", tone: "danger" },
  draft: { label: "Borrador", tone: "neutral" },
};

const DAY = 86_400_000;
export const daysAgo = (iso: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / DAY : Infinity);

export function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

export function formatRelative(iso: string | null) {
  if (!iso) return "Nunca";
  const d = daysAgo(iso);
  if (d < 1 / 24) return "Hace minutos";
  if (d < 1) return `Hace ${Math.floor(d * 24)} h`;
  if (d < 2) return "Ayer";
  if (d < 30) return `Hace ${Math.floor(d)} días`;
  return formatDate(iso);
}

/** Binomial legible desde la clase del modelo ("Pristimantis_paisa" → "Pristimantis paisa"). */
export const speciesLabel = (o: Pick<AppObservation, "ai_class">) => (o.ai_class ? o.ai_class.replace(/_/g, " ") : "Sin identificar");
