import { send } from "@/lib/dataset/dataset-client";

/**
 * Cliente de la mitad vectorial del Modelo (bloque 5): DB vectorial, centroides por morfo y
 * clústeres. Todo lo numérico lo calcula dataset-service (src/vectores.js, centroides_morfo.js,
 * clusteres.js); aquí solo hay tipos y llamadas.
 */

export type EncoderResumen = {
  sha256: string;
  nombre: string;
  archivo: string;
  dimension: number;
  preprocesado: string;
  normalizacion: string;
  registrado: string;
  vectores: number;
};

export type EspecieVectores = {
  id: number;
  nombre_cientifico: string;
  genero: string;
  familia: string;
  fotos: number;
  vectores: number;
  individuos: number;
  train: number;
  val: number;
  test: number;
  excluidas: number;
};

export type ResumenVectores = {
  encoders: EncoderResumen[];
  encoder: EncoderResumen | null;
  fotos: number;
  especies: EspecieVectores[];
  indice: {
    tabla: string;
    tipo_columna: string;
    metrica: string;
    busqueda: string;
    indices: { nombre: string; tipo: string; bytes: number }[];
    bytes_total: number;
    bytes_tabla: number;
  } | null;
  experimento: { id: number; creado: string; especies: number } | null;
};

export type Proyeccion = {
  encoder: { sha256: string; nombre: string } | null;
  por_especie: number;
  muestra: number;
  varianza: [number, number] | null;
  iteraciones?: [number, number];
  experimento_id?: number | null;
  especies: { id: number; nombre_cientifico: string; genero: string; familia: string; vectores: number }[];
  puntos: { sha256: string; especie_id: number; observacion_id: number | null; x: number; y: number }[];
  centroides: { especie_id: number; x: number; y: number }[];
};

export type FilaVector = {
  sha256: string;
  especie: string;
  observacion_id: number | null;
  fuente: "inaturalist" | "manual" | null;
  licencia: string | null;
  particion: "train" | "val" | "test" | null;
  trabajo_id: number | null;
  creado: string;
  excluida: boolean;
  inicio: number[];
  norma: number;
};

export type Latencia = { consultas: number; k: number; vectores: number; p50_ms: number; p95_ms: number; medido: string };

const qs = (params: Record<string, string | number | null | undefined>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") u.set(k, String(v));
  const t = u.toString();
  return t ? `?${t}` : "";
};

export const getResumenVectores = (encoder?: string | null) =>
  send<ResumenVectores>("GET", `/api/dataset/vectores${qs({ encoder })}`);

export const getProyeccion = (encoder?: string | null, porEspecie?: number) =>
  send<Proyeccion>("GET", `/api/dataset/vectores/proyeccion${qs({ encoder, por_especie: porEspecie })}`);

export const getMetadatosVectores = (p: { encoder?: string | null; especie_id?: number | null; offset?: number; limit?: number }) =>
  send<{ total: number; filas: FilaVector[] }>("GET", `/api/dataset/vectores/metadatos${qs(p)}`);

export const medirLatencia = (encoder?: string | null) => send<Latencia>("POST", "/api/dataset/vectores/latencia", { encoder });

// ── Centroides por morfo ────────────────────────────────────────────────────────────────

export type MorfoCentroide = {
  id: number;
  nombre: string;
  nota: string | null;
  especie_id: number;
  nombre_cientifico: string;
  subregion_id: number;
  subregion: string;
  region: string;
  /** Individuos con este morfo en Curación. */
  etiquetados: number;
  /** De esos, los que están en entrenamiento y ya tienen vector: los que cuentan para el mínimo. */
  con_vector: number;
  n_vectores: number | null;
  n_observaciones: number | null;
  dispersion: number | null;
  coseno_especie: number | null;
  calculado: boolean;
  faltan: number;
  desactualizado: boolean;
};

export type EstadoMorfos = {
  minimo: number;
  experimento: { id: number; creado: string } | null;
  morfos: MorfoCentroide[];
};

export const getMorfosCentroide = () => send<EstadoMorfos>("GET", "/api/dataset/centroides/morfos");

// ── Clústeres ───────────────────────────────────────────────────────────────────────────

export type DecisionPar = { id: number; estado: "aceptado" | "descartado"; nombre: string } | null;

export type MedicionArcFace = {
  n_train: number;
  n_val: number;
  sin_vectores: number[];
  semilla: number;
  particion: "val";
  acc_antes: number | null;
  acc_despues: number | null;
};

export type Cluster = {
  id: number;
  miembros: number[];
  nombres: string[];
  nombre: string;
  origen: "sugerido" | "matriz" | "manual";
  estado: "aceptado" | "descartado";
  motivo: string | null;
  experimento_id: number | null;
  medicion: MedicionArcFace | null;
  decidido_por: string | null;
  decidido_en: string;
};

export type ParConfuso = {
  a: number;
  b: number;
  a_como_b: number;
  b_como_a: number;
  n_a: number;
  n_b: number;
  tasa: number | null;
  coseno: number;
  senal: boolean;
  decision: DecisionPar;
};

export type PanoramaClusteres = {
  umbrales: { confusion: number; coseno: number };
  clusteres: Cluster[];
  experimento: { id: number; encoder_sha256: string; version_id: number | null; creado: string; especies: number } | null;
  subregion_id?: number | null;
  subregiones: { id: number; nombre: string; numero: number; region: string }[];
  especies: { id: number; nombre_cientifico: string; genero: string; familia: string; n_val: number; aciertos: number }[];
  celdas: { real: number; asignada: number; n: number }[];
  acierto: number | null;
  fotos_val?: number;
  pares: ParConfuso[];
  sugerencias: {
    a: number;
    b: number;
    nombre_a: string;
    nombre_b: string;
    coseno: number;
    n_val: number;
    confusiones: number;
    acc_antes: number | null;
    acc_despues: number | null;
    decision: DecisionPar;
  }[];
};

export const getClusteres = (subregionId?: number | null) =>
  send<PanoramaClusteres>("GET", `/api/dataset/clusteres${qs({ subregion_id: subregionId })}`);

export const decidirCluster = (body: {
  miembros: number[];
  estado: "aceptado" | "descartado";
  origen: Cluster["origen"];
  nombre?: string;
  motivo?: string;
}) => send<Cluster>("POST", "/api/dataset/clusteres", body);

export const retirarCluster = (id: number) => send<{ ok: true }>("DELETE", `/api/dataset/clusteres/${id}`);
