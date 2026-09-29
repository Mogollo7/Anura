"use client";

import { getToken } from "@/lib/auth/panel-client";
import { AppApiError } from "@/lib/app-data/app-client";

/**
 * Validación técnica y Release en el servidor (dataset-service: validacionTecnica.js, release.js).
 * El navegador no calcula ni decide nada: pide, muestra y manda la acción. Las reglas (dos
 * aprobaciones de cuentas distintas, validación lista para compilar) las impone el servidor.
 */

export type Motivo = { codigo: string; texto: string; pantalla: string };

export type SubregionValidada = {
  id: number;
  numero: number;
  clave: string;
  nombre: string;
  region: string;
  region_nombre: string;
  region_estado: "borrador" | "activa";
};

export type ResumenSubregion = SubregionValidada & { lista: boolean; motivos: Motivo[]; especies: number };

export type ContextoFicha = {
  altitud: { min: number; max: number; origen: "manual" | "calculado" } | null;
  pesos: { wv: number; wg: number; wm: number; origen: "manual" | "calculado" } | null;
  lrc: { metodo: string; min: number | null; max: number | null };
};

export type EspecieValidada = {
  especie_id: number;
  taxon_id: string | null;
  nombre_cientifico: string;
  genero: string;
  familia: string;
  individuos_subregion: number;
  centroide_propio: boolean;
  centroide_global: boolean;
  fotos_activas: number;
  individuos: number;
  fotos_train: number;
  sin_vector: number;
  entrenable: boolean;
  incluida: boolean;
  contexto: ContextoFicha | null;
};

export type Validacion = {
  subregion: SubregionValidada;
  lista: boolean;
  motivos: Motivo[];
  avisos: Motivo[];
  reglas: { min_fotos_entrenable: number; min_individuos: number; min_individuos_regional: number };
  encoder: { sha256: string; archivo: string; dimension: number } | null;
  dataset_version: { id: number; nombre: string } | null;
  centroides: { experimento_id: number; creado: string; vigente: boolean } | null;
  osr: { umbral_id: number; tau: number; validado: string; validado_por: string | null } | null;
  especies: EspecieValidada[];
  morfos: { morfo_id: number; nombre: string; especie_id: number; individuos: number; calculado: boolean }[];
  clusteres: { id: number; nombre: string; miembros: number[] }[];
  huella: string;
};

export type EstadoPaquete = "borrador" | "aprobado" | "publicado" | "retirado";
export type TipoAprobacion = "cientifica" | "tecnica";

export type Aprobacion = { tipo: TipoAprobacion; cuenta: string; nombre: string | null; creado: string };

export type EspecieManifiesto = {
  taxon_id: string;
  nombre_cientifico: string;
  genero: string;
  familia: string;
  referencias: number;
  individuos_en_subregion: number;
  centroide: "regional" | "global" | null;
  contexto: ContextoFicha | null;
};

export type Paquete = {
  id: number;
  paquete_id: string;
  subregion_id: number | null;
  version: number;
  estado: EstadoPaquete;
  sha256: string;
  size_bytes: string | number;
  especies: number;
  experimento_id: number | null;
  osr_umbral_id: number | null;
  tau: number | null;
  compilado_nombre: string | null;
  compilado: string;
  publicado_nombre: string | null;
  publicado: string | null;
  retirado: string | null;
  aprobaciones: Aprobacion[];
  desactualizado?: boolean;
  manifiesto: {
    especies: EspecieManifiesto[];
    vectores: number;
    puntos_ocurrencia: number;
    morfos?: { id: number; taxon_id: string; nombre: string; individuos: number }[];
    clusteres?: { id: number; nombre: string; taxon_ids: string[] }[];
  } | null;
};

/** Error del servidor con los motivos cuando una subregión no está lista (409). */
export class ReleaseError extends AppApiError {
  constructor(status: number, message: string, public motivos: Motivo[] = []) {
    super(status, message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ReleaseError(0, "No hay conexión con el servidor del Admin.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ReleaseError(res.status, data.message || `El servidor respondió ${res.status}`, data.motivos || []);
  return data as T;
}

export const releaseApi = {
  resumen: () => call<{ subregiones: ResumenSubregion[] }>("GET", "/api/dataset/validacion").then((r) => r.subregiones),
  validacion: (subregionId: number) => call<Validacion>("GET", `/api/dataset/validacion/${subregionId}`),
  paquetes: (subregionId?: number) =>
    call<{ paquetes: Paquete[] }>("GET", `/api/dataset/releases${subregionId ? `?subregion_id=${subregionId}` : ""}`).then((r) => r.paquetes),
  compilar: (subregionId: number) => call<Paquete>("POST", "/api/dataset/releases", { subregion_id: subregionId }),
  aprobar: (id: number, tipo: TipoAprobacion) => call<Paquete>("POST", `/api/dataset/releases/${id}/aprobaciones`, { tipo }),
  publicar: (id: number) => call<Paquete & { reemplazado: { id: number; version: number } | null }>("POST", `/api/dataset/releases/${id}/publicar`, {}),
};

export const ESTADO_PAQUETE: Record<EstadoPaquete, { label: string; tone: "neutral" | "accent" | "warning" | "info" }> = {
  borrador: { label: "Borrador", tone: "info" },
  aprobado: { label: "Aprobado, sin publicar", tone: "warning" },
  publicado: { label: "Publicado", tone: "accent" },
  retirado: { label: "Retirado", tone: "neutral" },
};

export const TIPO_APROBACION: Record<TipoAprobacion, { label: string; permiso: "aprobarCientifico" | "publicarPaquete" }> = {
  cientifica: { label: "Científica", permiso: "aprobarCientifico" },
  tecnica: { label: "Técnica", permiso: "publicarPaquete" },
};

export function tamano(bytes: string | number | null | undefined) {
  const n = Number(bytes) || 0;
  if (!n) return "—";
  const mb = n / 1_048_576;
  return mb >= 1 ? `${mb.toLocaleString("es-CO", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function fecha(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}
