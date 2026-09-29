import { getToken } from "@/lib/auth/panel-client";
import type { Sustrato } from "./etiquetas";

/**
 * Ficha técnica de una especie (dataset-service, ficha.js) y el cálculo de altitudes por
 * observación (altitud.js). Lo calculado llega ya resuelto; lo que decide una persona
 * (rango de altitud, pesos, LRC) se guarda con `guardarAjustesFicha`.
 */

export type EstadoFicha = "DRAFT" | "DATASET_READY" | "EMBEDDINGS_READY" | "CENTROID_READY";

export type RangoAltitud = { min: number; max: number };
export type Pesos = { wv: number; wg: number; wm: number };
export type PerfilPesos = "generalista" | "endemica_montana" | "especialista_quebrada" | "par_criptico";
export type LrcMetodo = "pendiente" | "manual";

export type AltitudAtipica = {
  observacion_id: number;
  fuente: "inaturalist" | "manual";
  fuente_id: string | null;
  observada_en: string | null;
  altitud_m: number;
  mediana_m: number;
  desviacion_m: number;
  z_robusto: number;
};

export type FichaTecnica = {
  especie: { id: number; carpeta: string; nombre_cientifico: string; genero: string; familia: string; taxon_id: string | null };
  dataset: {
    estado: EstadoFicha;
    entrenable: boolean;
    fotos_activas: number;
    individuos: number;
    con_vector: number;
    version: string | null;
    min_fotos: number;
    min_individuos: number;
  };
  observaciones: {
    validas: number;
    sin_coordenada: number;
    sin_limpiar: number;
    solo_celda: number;
    excluidas_geografia: number;
    con_altitud: number;
    falta_altitud: number;
  };
  altitud: {
    resumen: {
      n: number;
      media: number;
      desviacion: number;
      min: number;
      max: number;
      p05: number;
      p95: number;
      poco_confiable: boolean;
    } | null;
    calculado: RangoAltitud | null;
    manual: RangoAltitud | null;
    efectivo: (RangoAltitud & { origen: "manual" | "calculado" }) | null;
    atipicas: AltitudAtipica[];
    min_puntos: number;
  };
  sustrato: { n: number; conteos: Record<Sustrato, number>; priors: Record<Sustrato, number> | null };
  pesos: {
    calculado: (Pesos & { perfil: PerfilPesos }) | null;
    motivo: string | null;
    manual: Pesos | null;
    efectivo: (Pesos & { origen: "manual" | "calculado" }) | null;
  };
  lrc: { metodo: LrcMetodo; min: number | null; max: number | null };
  /** null = no se pudieron ubicar (geo-service caído): `subregiones_motivo` dice por qué. */
  subregiones: { id: number; nombre: string; region: string }[] | null;
  subregiones_motivo: string | null;
  decisiones: { altitud_en: string | null; pesos_en: string | null; lrc_en: string | null } | null;
};

export type AjustesFicha = {
  altitud?: RangoAltitud | null;
  pesos?: Pesos | null;
  lrc?: { metodo: LrcMetodo; min?: number | null; max?: number | null };
};

export type LoteAltitudes = {
  procesadas: number;
  con_altitud: number;
  sin_dato: number;
  siguiente_id: number | null;
  faltan: number;
};

async function pedir<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
  return data as T;
}

export const getFichaTecnica = (especieId: number) => pedir<FichaTecnica>("GET", `/api/dataset/especies/${especieId}/ficha`);

/** Solo cambia lo que viene; `null` en un bloque vuelve a lo calculado. Devuelve la ficha recalculada. */
export const guardarAjustesFicha = (especieId: number, ajustes: AjustesFicha) =>
  pedir<FichaTecnica>("PUT", `/api/dataset/especies/${especieId}/ficha`, ajustes);

/** Un lote de altitudes. Repetir con `desde_id = siguiente_id` hasta que `siguiente_id` sea null. */
export const calcularAltitudes = (body: { especie_id?: number; limite?: number; desde_id?: number }) =>
  pedir<LoteAltitudes>("POST", "/api/dataset/altitudes/calcular", body);
