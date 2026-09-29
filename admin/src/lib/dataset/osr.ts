/**
 * OSR, Métricas y Simulador desde el servidor (dataset-service: osr.js, evaluacion.js,
 * simulador.js). Aquí solo tipos y cuentas pequeñas sobre lo que el servidor ya midió.
 *
 * El rechazo es el del teléfono: distancia de Mahalanobis mínima a las medias de las especies
 * del paquete, con la covarianza Ledoit-Wolf compartida; se acepta si la distancia ≤ τ.
 */

/** null = todas las especies con centroide (sin recorte por subregión). */
export type PaqueteId = number | null;

export type PaqueteOsr = {
  id: PaqueteId;
  nombre: string;
  region: string | null;
  especies: number;
  tau_vigente: number | null;
};

export type PuntoOperacion = { kar_objetivo: number; tau: number; kar: number | null; far: number | null };

export type EspecieOsr = {
  especie_id: number;
  nombre_cientifico: string;
  genero: string;
  n_observaciones: number;
  n_train: number;
  n_val: number;
  n_medidas: number;
  kar: number | null;
  mediana: number | null;
};

export type ResultadoOsr = {
  metrica: string;
  tau: number;
  kar: number | null;
  far: number | null;
  auroc: number | null;
  acierto_entre_aceptadas: number | null;
  puntos: PuntoOperacion[];
  especies: EspecieOsr[];
  desconocidas: { especie_id: number; nombre_cientifico: string; fotos: number; con_centroide: boolean; se_cuelan: number }[];
  se_cuelan_en: { especie_id: number; nombre_cientifico: string; fotos: number }[];
  coseno: { especies_con_tau: number; kar: number | null; far: number | null; auroc: number | null } | null;
  puntajes: { calibracion: number[]; conocidas: number[]; desconocidas: number[] };
};

export type CalibracionOsr = {
  id: number;
  subregion_id: PaqueteId;
  experimento_id: number;
  encoder_sha256: string;
  version_id: number | null;
  metrica: string;
  particion_calibracion: string;
  particion_medida: "test" | "val";
  kar_objetivo: number;
  tau_propuesto: number;
  shrinkage: number;
  especies: number;
  n_train: number;
  n_calibracion: number;
  n_conocidas: number;
  n_desconocidas: number;
  resultado: ResultadoOsr;
  creado: string;
};

export type UmbralOsr = {
  id: number;
  subregion_id: PaqueteId;
  tau: number;
  validado_por: string | null;
  validado: string | null;
  validado_nombre: string | null;
  calibracion_id: number | null;
  experimento_id: number | null;
  kar_objetivo: number | null;
  kar: number | null;
  far: number | null;
  auroc: number | null;
  nota: string | null;
  creado: string;
};

export type EstadoOsr = {
  experimento: { id: number; creado: string } | null;
  paquetes: PaqueteOsr[];
  subregion_id: PaqueteId;
  calibracion: CalibracionOsr | null;
  propuesta: UmbralOsr | null;
  vigente: UmbralOsr | null;
  historial: UmbralOsr[];
};

// ── Métricas ─────────────────────────────────────────────────────────────────────────────

export type PaqueteEvaluado = {
  id: PaqueteId;
  nombre: string;
  region: string | null;
  evaluacion_id: number | null;
  top1: number | null;
  top3: number | null;
  n: number | null;
  especies: number | null;
  experimento_id: number | null;
  creado: string | null;
};

export type FilaEvaluacion = {
  especie_id: number;
  nombre_cientifico: string;
  genero: string;
  familia: string;
  taxon_id: string | null;
  soporte: number;
  top1: number;
  top3: number;
  /** Fila de la matriz de confusión: especie_id predicha → fotos (incluye la diagonal). */
  predichas: Record<string, number>;
  n_observaciones: number | null;
};

export type DetalleEvaluacion = {
  evaluacion: {
    id: number;
    subregion_id: PaqueteId;
    subregion: string | null;
    region: string | null;
    experimento_id: number;
    particion: string;
    especies: number;
    n: number;
    top1: number;
    top3: number;
    creado: string;
  };
  filas: FilaEvaluacion[];
  /** false si los centroides cambiaron después de evaluar. */
  vigente: boolean;
  osr: {
    tau: number;
    kar: number | null;
    far: number | null;
    auroc: number | null;
    validado: string;
    validado_nombre: string | null;
    experimento_id: number | null;
  } | null;
};

export type ParConfundido = { a: FilaEvaluacion; b: FilaEvaluacion; fotos: number; mismoGenero: boolean };

/** Pares que más se confunden (a→b + b→a), de las filas de la matriz. */
export function paresConfundidos(filas: FilaEvaluacion[], max = 12): ParConfundido[] {
  const porId = new Map(filas.map((f) => [f.especie_id, f]));
  const pares = new Map<string, ParConfundido>();
  for (const f of filas) {
    for (const [pred, n] of Object.entries(f.predichas)) {
      const otra = porId.get(Number(pred));
      if (!otra || otra.especie_id === f.especie_id || !n) continue;
      const [a, b] = f.especie_id < otra.especie_id ? [f, otra] : [otra, f];
      const clave = `${a.especie_id}:${b.especie_id}`;
      const par = pares.get(clave) ?? { a, b, fotos: 0, mismoGenero: a.genero === b.genero };
      par.fotos += n;
      pares.set(clave, par);
    }
  }
  return [...pares.values()].sort((x, y) => y.fotos - x.fotos).slice(0, max);
}

// ── Simulador ────────────────────────────────────────────────────────────────────────────

export type ResumenUmbral = {
  id: number;
  tau: number;
  calibracion_id: number | null;
  experimento_id: number | null;
  validado: string | null;
  validado_nombre: string | null;
  kar: number | null;
  far: number | null;
  auroc: number | null;
};

export type OpcionesSimulador = {
  experimento: { id: number; encoder_sha256: string };
  especies: { id: number; nombre_cientifico: string; genero: string; familia: string; fotos: number; en_paquete: boolean }[];
  paquete: number;
  umbrales: { validado: ResumenUmbral | null; propuesta: ResumenUmbral | null };
};

export type FotoSimulador = {
  sha256: string;
  particion: "train" | "val" | "test" | null;
  observada_en: string | null;
  lugar: string | null;
  url: string;
};

export type ResultadoSimulador = {
  foto: {
    sha256: string;
    especie_id: number;
    nombre_cientifico: string;
    genero: string;
    familia: string;
    particion: "train" | "val" | "test" | null;
    del_paquete: boolean;
  };
  umbral: "validado" | "propuesta";
  codigo: "MATCH_SPECIES" | "OSR_GLOBAL" | null;
  acierto: boolean | null;
  esperado: "su especie" | "rechazo";
  knn: {
    k: number;
    vecinos: { especie_id: number; nombre_cientifico: string; distancia: number; ella_misma: boolean }[];
    candidatas: { especie_id: number; nombre_cientifico: string; parte: number }[];
  };
  centroides: { especie_id: number; nombre_cientifico: string; coseno: number }[];
  rechazo: {
    umbral_id: number;
    calibracion_id: number;
    tau: number;
    validado: string | null;
    validado_nombre: string | null;
    distancia: number;
    acepta: boolean;
    especie_mas_cercana: { especie_id: number; nombre_cientifico: string | null };
    otro_lote: boolean;
  } | null;
  /** Capa 3 informativa: altitud de la observación frente al rango de la ficha de la especie nombrada. */
  altitud: {
    observacion_m: number | null;
    especie_id: number;
    rango: { min: number; max: number; origen: "manual" | "calculado" } | null;
    dentro: boolean | null;
  } | null;
  traza: { encoder_sha256: string; dim: number; norma2: number; experimento_id: number };
};

// ── Formato y cuentas compartidas ────────────────────────────────────────────────────────

/** Fracción de distancias ≤ τ (aceptadas). La misma cuenta que hace el servidor al validar. */
export function tasaAceptadas(distancias: number[], tau: number): number | null {
  if (!distancias.length) return null;
  let n = 0;
  for (const d of distancias) if (d <= tau) n++;
  return n / distancias.length;
}

/** Número con decimales fijos ("—" si no hay). Porcentajes: `pct` de components/vectordb/sesion-requerida. */
export const dec = (x: number | null | undefined, decimales = 3) =>
  x == null ? "—" : x.toLocaleString("es-CO", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

export const fecha = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "—";

export const nombrePaquete = (p: { nombre: string; region: string | null }) => (p.region ? `${p.nombre} · ${p.region}` : p.nombre);

/** El query de subregion_id que entiende el servidor ("todas" = null). */
export const paqueteQuery = (id: PaqueteId) => (id === null ? "todas" : String(id));
