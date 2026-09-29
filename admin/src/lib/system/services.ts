/**
 * Topología real de `docker-compose.server.yml` + `docker-compose.model.yml`.
 * El estado de cada servicio se obtiene consultando su `/health` desde el servidor
 * del Admin (misma red Docker o localhost). Sin métricas inventadas: si no hay
 * lectura, el panel muestra «sin datos».
 */

export type ServiceStatus = "operativo" | "degradado" | "caido" | "sin_verificar";

export type ServiceDef = {
  id: string;
  nombre: string;
  contenedor: string;
  /** Puerto publicado en el host (null = solo red Docker / sin publicación). */
  puerto: number | null;
  dependeDe: string[];
  descripcion: string;
  /** Variable de entorno con la URL base (Hostinger: la del compose o del túnel). */
  envUrl: string;
  /** Fallback cuando el Admin corre fuera de Docker en este PC. */
  localUrl: string;
  healthPath: string;
};

export const SERVICES: ServiceDef[] = [
  {
    id: "auth",
    nombre: "auth-service",
    contenedor: "anura_auth",
    puerto: 3001,
    dependeDe: ["postgres", "redis"],
    descripcion:
      "Login, sesiones y cuentas de Google para la app ANURA. También guarda las cuentas, los roles y los permisos del panel.",
    envUrl: "AUTH_SERVICE_URL",
    localUrl: "http://localhost:3001",
    healthPath: "/health",
  },
  {
    id: "observation",
    nombre: "observation-service",
    contenedor: "anura_observations",
    puerto: 3002,
    dependeDe: ["postgres", "redis", "thumbnail", "minio"],
    descripcion: "Recibe y guarda las observaciones de la app.",
    envUrl: "OBSERVATION_SERVICE_URL",
    localUrl: "http://localhost:3002",
    healthPath: "/health",
  },
  {
    id: "geo",
    nombre: "geo-service",
    contenedor: "anura_geo",
    puerto: 3003,
    dependeDe: ["postgres"],
    descripcion: "Consultas geoespaciales (PostGIS): point-in-polygon DANE, zonas.",
    envUrl: "GEO_SERVICE_URL",
    localUrl: "http://localhost:3003",
    healthPath: "/health",
  },
  {
    id: "thumbnail",
    nombre: "thumbnail-service",
    contenedor: "anura_thumbnails",
    puerto: 3004,
    dependeDe: ["minio"],
    descripcion: "Genera miniaturas de fotos y audio subidos.",
    envUrl: "THUMBNAIL_SERVICE_URL",
    localUrl: "http://localhost:3004",
    healthPath: "/health",
  },
  {
    id: "explorer",
    nombre: "explorer-service",
    contenedor: "anura_explorer",
    puerto: 3005,
    dependeDe: ["postgres", "redis", "auth", "observation", "thumbnail", "geo"],
    descripcion: "API de exploración/catálogo que consume la app.",
    envUrl: "EXPLORER_SERVICE_URL",
    localUrl: "http://localhost:3005",
    healthPath: "/health",
  },
  {
    id: "notification",
    nombre: "notification-service",
    contenedor: "anura_notifications",
    puerto: 3006,
    dependeDe: ["postgres", "redis", "auth"],
    descripcion: "Envío de push y correos.",
    envUrl: "NOTIFICATION_SERVICE_URL",
    localUrl: "http://localhost:3006",
    healthPath: "/health",
  },
  {
    id: "dataset",
    nombre: "dataset-service",
    contenedor: "anura_dataset",
    puerto: 3008,
    dependeDe: ["postgres", "minio", "auth", "geo"],
    descripcion: "Esquema dataset, fotos en MinIO, worker HTTP, contenido público y paquetes descargables.",
    envUrl: "DATASET_SERVICE_URL",
    localUrl: "http://localhost:3008",
    healthPath: "/health",
  },
  {
    id: "validation",
    nombre: "validation-service",
    contenedor: "anura_validation",
    puerto: null,
    dependeDe: ["postgres"],
    descripcion:
      "Todavía sin función: solo responde /health. El Admin lo consulta con VALIDATION_SERVICE_URL.",
    envUrl: "VALIDATION_SERVICE_URL",
    localUrl: "http://localhost:3007",
    healthPath: "/health",
  },
  {
    id: "ai",
    nombre: "model-service",
    contenedor: "anura_model_service",
    puerto: 8000,
    dependeDe: [],
    descripcion:
      "BioCLIP 2.5 en la GPU de este PC (docker-compose.model.yml). El Admin llega por MODEL_SERVICE_URL (host.docker.internal aquí; túnel en Hostinger).",
    envUrl: "MODEL_SERVICE_URL",
    localUrl: "http://127.0.0.1:8000",
    healthPath: "/health",
  },
];

export const INFRA = [
  { id: "postgres", nombre: "postgres", detalle: "PostGIS 16-3.4 — una base por servicio" },
  { id: "redis", nombre: "redis", detalle: "Colas y caché de sesión" },
  { id: "minio", nombre: "minio", detalle: "Bucket de fotos/audio (S3-compatible)" },
] as const;

export type ServiceCheck = {
  status: ServiceStatus;
  latencyMs: number | null;
  /** ISO o mensaje corto; null si nunca se consultó. */
  lastCheck: string | null;
  /** Motivo cuando no hay lectura útil (variable faltante, HTTP no-OK, red). */
  detalle: string | null;
};

function baseUrl(svc: ServiceDef): string | null {
  const fromEnv = process.env[svc.envUrl]?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (svc.localUrl) return svc.localUrl.replace(/\/$/, "");
  return null;
}

/** Consulta real a /health. Solo para servidor (Route Handler); no inventa uptime. */
export async function probeService(svc: ServiceDef): Promise<ServiceCheck> {
  const base = baseUrl(svc);
  const checkedAt = new Date().toISOString();
  if (!base) {
    return {
      status: "sin_verificar",
      latencyMs: null,
      lastCheck: checkedAt,
      detalle: `Falta ${svc.envUrl} (en Hostinger: la URL del servicio o del túnel)`,
    };
  }

  const url = `${base}${svc.healthPath}`;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    const latencyMs = Date.now() - started;
    if (res.ok) {
      return { status: "operativo", latencyMs, lastCheck: checkedAt, detalle: null };
    }
    return {
      status: res.status >= 500 ? "caido" : "degradado",
      latencyMs,
      lastCheck: checkedAt,
      detalle: `HTTP ${res.status} en ${svc.healthPath}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "sin respuesta";
    return {
      status: "caido",
      latencyMs: null,
      lastCheck: checkedAt,
      detalle: msg,
    };
  }
}

export async function probeAllServices(): Promise<Record<string, ServiceCheck>> {
  const entries = await Promise.all(SERVICES.map(async (s) => [s.id, await probeService(s)] as const));
  return Object.fromEntries(entries);
}

/** Placeholder para SSR / hidratación antes de la primera sonda. */
export function uncheckedServices(): Record<string, ServiceCheck> {
  return Object.fromEntries(
    SERVICES.map((s) => [
      s.id,
      { status: "sin_verificar" as const, latencyMs: null, lastCheck: null, detalle: "Sin consultar aún" },
    ])
  );
}
