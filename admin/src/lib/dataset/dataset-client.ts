import { getToken } from "@/lib/auth/panel-client";

export type DatasetEspecie = {
  id: number;
  carpeta: string;
  nombre_cientifico: string;
  genero: string;
  familia: string;
  taxon_id: string | null;
  fotos: number;
  observaciones: number;
  con_coordenada: number;
  coordenada_oculta: number;
  sin_licencia: number;
  derechos_reservados: number;
  fuera_de_catalogo: number;
  excluidas: number;
  subidas_a_mano: number;
  train: number;
  val: number;
  test: number;
};

export type DatasetResumen = {
  especies: DatasetEspecie[];
  version: { id: number; nombre: string; manifiesto_sha256: string; creado: string } | null;
  exclusiones: number;
};

export type DatasetFoto = {
  sha256: string;
  archivo_original: string;
  ancho: number | null;
  alto: number | null;
  licencia: string | null;
  atribucion: string | null;
  url_origen: string | null;
  estado: "catalogo" | "fuera_de_catalogo";
  subida_a_mano: boolean;
  observacion_id: number | null;
  fuente: "inaturalist" | "manual" | null;
  fotos_observacion: number;
  invalidada_motivo: string | null;
  exclusion_motivo: string | null;
  exclusion_origen: "limpieza_original" | "curacion" | "observacion_invalidada" | "decision_licencia" | null;
  observacion_inat: string | null;
  latitud: number | null;
  longitud: number | null;
  coordenada_oculta: boolean | null;
  coordenada_fuente: string | null;
  lugar: string | null;
  observada_en: string | null;
  particion: "train" | "val" | "test" | null;
  url: string;
};

async function get<T>(path: string): Promise<T> {
  const token = getToken();
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Error ${res.status}`);
  return body as T;
}

export const getResumen = () => get<DatasetResumen>("/api/dataset/resumen");

/** Filtros de Curación; los aplica el servidor (ver dataset-service, GET …/fotos). */
export type FiltroFotos = "activas" | "excluidas" | "sin_cc" | "aproximada" | "sin_coordenada" | "subidas" | "train" | "val" | "test";

export const getFotos = (especieId: number, offset = 0, limit = 24, soloCC = false, filtro?: FiltroFotos) =>
  get<{ fotos: DatasetFoto[] }>(
    `/api/dataset/especies/${especieId}/fotos?limit=${limit}&offset=${offset}${soloCC ? "&solo_cc=true" : ""}${filtro ? `&filtro=${filtro}` : ""}`
  );

/** taxon_id es la identidad estable; el nombre de carpeta solo sirve si la especie no está en el catálogo. */
export function findEspecie(resumen: DatasetResumen, taxonId: string, binomial: string) {
  return (
    resumen.especies.find((e) => e.taxon_id && e.taxon_id === taxonId) ??
    resumen.especies.find((e) => e.carpeta.toLowerCase() === binomial.trim().replace(/\s+/g, "_").toLowerCase())
  );
}

// ── Limpieza y decisiones (Calidad) ──────────────────────────────────────────────────────

export type TipoHallazgo =
  | "coordenada_aproximada"
  | "coordenada_atipica"
  | "sin_coordenada"
  | "derechos_reservados"
  | "sin_licencia";

export type OpcionHallazgo =
  | "usar_mediana"
  | "solo_celda"
  | "excluir"
  | "corregir"
  | "mantener"
  | "solo_entrenamiento"
  | "excluir_del_entrenamiento";

export type Hallazgo = {
  id: number;
  tipo: TipoHallazgo;
  estado: "pendiente" | "decidido";
  detalle: Record<string, unknown> & {
    motivo?: string;
    incertidumbre_m?: number | null;
    vecinos_precisos?: number;
    distancia_vecino_km?: number;
    mediana_vecino_km?: number;
    z_robusto?: number;
    puntos_especie?: number;
    original?: { latitud: number; longitud: number };
  };
  propuesta: {
    opcion: OpcionHallazgo;
    opciones: OpcionHallazgo[];
    metodo: string;
    explicacion: string;
    latitud?: number;
    longitud?: number;
  };
  decision: { opcion: OpcionHallazgo; latitud?: number; longitud?: number } | null;
  especie_id: number | null;
  nombre_cientifico: string | null;
  observacion_inat: string | null;
  foto_url: string | null;
};

export type ParametrosLimpieza = Record<
  | "umbral_incertidumbre_m"
  | "celda_grados"
  | "min_vecinos"
  | "z_atipica"
  | "distancia_min_atipica_km"
  | "min_puntos_especie",
  number
>;

export type EstadoLimpieza = {
  ultima: { id: number; parametros: ParametrosLimpieza; resumen: Record<string, unknown>; creado: string } | null;
  parametros_por_defecto: ParametrosLimpieza;
  conteos: { tipo: TipoHallazgo; estado: "pendiente" | "decidido"; n: number }[];
  usos: { uso: "punto" | "celda" | "excluida" | "sin_decidir"; n: number }[];
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
  return data as T;
}

export const getLimpieza = () => get<EstadoLimpieza>("/api/dataset/limpieza");

export const correrLimpieza = (parametros?: Partial<ParametrosLimpieza>) =>
  post<{ corrida: number }>("/api/dataset/limpieza", { parametros });

export const getHallazgos = (tipo: TipoHallazgo, estado: "pendiente" | "decidido", offset = 0, limit = 20) =>
  get<{ hallazgos: Hallazgo[]; total: number }>(
    `/api/dataset/hallazgos?tipo=${tipo}&estado=${estado}&limit=${limit}&offset=${offset}`
  );

export const decidirHallazgos = (body: {
  ids?: number[];
  filtro?: { tipo: TipoHallazgo; especie_id?: number };
  opcion: OpcionHallazgo | "propuesta";
  latitud?: number;
  longitud?: number;
  motivo?: string;
}) => post<{ decididos: number }>("/api/dataset/hallazgos/decision", body);

// ── Curación en el servidor ──────────────────────────────────────────────────────────────

/** Error con el cuerpo del servidor: la subida responde 422 + ubicación si cae fuera de Colombia. */
export class DatasetError extends Error {
  constructor(message: string, public status: number, public body: Record<string, unknown>) {
    super(message);
  }
}

/** Llamada al dataset-service con la sesión del panel. La usan también los clientes por tema (p. ej. lib/vectores). */
export async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const isForm = body instanceof FormData;
  const res = await fetch(path, {
    method,
    headers: {
      ...(body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new DatasetError(data.message || `Error ${res.status}`, res.status, data);
  return data as T;
}

export type Ubicacion = {
  en_colombia: boolean;
  departamento: string | null;
  cercano?: { departamento: string; distancia_km: number };
};

export const LICENCIAS_SUBIDA = [
  { value: "cc-by", label: "CC BY" },
  { value: "cc-by-nc", label: "CC BY-NC" },
  { value: "cc-by-sa", label: "CC BY-SA" },
  { value: "cc-by-nc-sa", label: "CC BY-NC-SA" },
  { value: "cc-by-nd", label: "CC BY-ND" },
  { value: "cc-by-nc-nd", label: "CC BY-NC-ND" },
  { value: "cc0", label: "CC0 (dominio público)" },
  { value: "all-rights-reserved", label: "Todos los derechos reservados" },
] as const;

export const ubicar = (lat: number, lon: number) =>
  send<Ubicacion>("GET", `/api/dataset/ubicacion?lat=${lat}&lon=${lon}`);

export const subirFoto = (especieId: number, form: FormData) =>
  send<{ sha256: string; observacion_id: number; departamento: string | null }>("POST", `/api/dataset/especies/${especieId}/fotos`, form);

export const excluirFoto = (sha256: string, motivo: string) =>
  send<{ ok: true }>("POST", `/api/dataset/fotos/${sha256}/exclusion`, { motivo });

export const reincluirFoto = (sha256: string) => send<{ ok: true }>("DELETE", `/api/dataset/fotos/${sha256}/exclusion`);

export const invalidarObservacion = (id: number, motivo: string) =>
  send<{ fotos_excluidas: number }>("POST", `/api/dataset/observaciones/${id}/invalidacion`, { motivo });

export const revertirInvalidacion = (id: number) =>
  send<{ fotos_reincluidas: number }>("DELETE", `/api/dataset/observaciones/${id}/invalidacion`);

// ── Trabajos del worker (M2) ─────────────────────────────────────────────────────────────

export type Trabajo = {
  id: number;
  tipo: "embeddings";
  estado: "pendiente" | "en_curso" | "hecho" | "fallido" | "cancelado";
  parametros: { encoder_sha256?: string; especie_id?: number };
  /** Nombre de la especie cuando el trabajo está acotado a una; null = todas las fotos. */
  especie: string | null;
  total: number | null;
  hechos: number;
  fallidos: number;
  worker: string | null;
  mensaje: string | null;
  latido: string | null;
  creado: string;
  empezado: string | null;
  terminado: string | null;
  segundos_sin_latido: number | null;
};

export type EstadoWorker = {
  trabajos: Trabajo[];
  workers: {
    nombre: string;
    encoder_sha256: string | null;
    info: { proveedor?: string; onnxruntime?: string; ms_por_foto?: number | null };
    visto: string;
    segundos_sin_ver: number;
    trabajo_en_curso: number | null;
  }[];
  encoders: {
    sha256: string;
    nombre: string;
    archivo: string;
    dimension: number;
    preprocesado: string;
    normalizacion: string;
    registrado: string;
    vectores: number;
  }[];
  fotos: number;
  /** Trabajos en total; `trabajos` trae solo los más recientes. */
  historial: number;
  latido_vencido_s: number;
  worker_vivo_s: number;
};

export type ErrorTrabajo = { sha256: string; error: string; creado: string; archivo_original: string | null; especie: string | null };

export const getTrabajos = () => send<EstadoWorker>("GET", "/api/dataset/trabajos");

export const crearTrabajoEmbeddings = (encoder_sha256?: string, especie_id?: number) =>
  send<{ id: number; total: number }>("POST", "/api/dataset/trabajos", { encoder_sha256, especie_id });

export const getErroresTrabajo = (id: number) =>
  send<{ errores: ErrorTrabajo[]; total: number }>("GET", `/api/dataset/trabajos/${id}/errores`);

export const cancelarTrabajo = (id: number) => send<{ ok: true }>("POST", `/api/dataset/trabajos/${id}/cancelar`, {});

// ── Ficha pública / Contenido (K) ─────────────────────────────────────────────────────────

export type EstadoContenido = "borrador" | "en_revision" | "publicada";
export type UicnCategoria = "LC" | "NT" | "VU" | "EN" | "CR" | "EW" | "EX" | "DD";
export type NivelToxicidad = "inofensiva" | "toxica_tacto" | "toxica_ingestion";

export type CampoConFuente<T extends object> = (T & { fuente: string | null }) | null;

export type CamposContenido = {
  nombre_comun: CampoConFuente<{ valor: string | null }>;
  otros_nombres: string[] | null;
  uicn: CampoConFuente<{ categoria: UicnCategoria | null; anio: number | null }>;
  toxicidad: CampoConFuente<{ nivel: NivelToxicidad | null; nota: string | null }>;
  altitud_literatura: CampoConFuente<{ min: number | null; max: number | null }>;
  habitat: { texto: string } | null;
  lhc: CampoConFuente<{ min: number | null; max: number | null }>;
  morfologia: {
    timpano: string | null; discos: string | null; pliegues: string | null;
    patron_dorsal: string | null; patron_ventral: string | null; membranas: string | null;
    diagnosticos?: string[] | null;
  } | null;
  especies_confusion: number[] | null;
  dato_curioso: CampoConFuente<{ valor: string | null }>;
  // Lo que pide la ficha de la web (TaxonDetail) además de lo de la app.
  autoria: string | null;
  sinonimos: string[] | null;
  descripcion: string | null;
  actividad: Actividad | null;
  dieta: string | null;
  reproduccion: string | null;
  distribucion: string | null;
  endemismo: CampoConFuente<{ endemica: boolean | null; alcance: string | null }>;
  amenazas: CampoConFuente<{ lista: string[] }>;
};

export type Actividad = "diurna" | "nocturna" | "crepuscular" | "diurna_y_nocturna";

export type ContenidoEspecie = {
  id: number;
  especie_id: number;
  estado: EstadoContenido;
  campos: Partial<CamposContenido>;
  foto_principal_sha256: string | null;
  foto_principal: { sha256: string; object_key: string; licencia: string | null; atribucion: string | null } | null;
  galeria: string[];
  version: number;
  publicado_en: string | null;
};

export type FichaContenido = {
  especie: { id: number; carpeta: string; nombre_cientifico: string; genero: string; familia: string; taxon_id: string | null };
  contenido: ContenidoEspecie;
  auto: { fotos_referencia: number };
  faltan: string[];
};

export type ContenidoResumen = {
  especie_id: number;
  carpeta: string;
  nombre_cientifico: string;
  taxon_id: string | null;
  estado: EstadoContenido;
  nombre_comun: string | null;
  version: number;
  actualizado: string | null;
  publicado_en: string | null;
  en_catalogo: boolean;
};

export const getContenidoLista = () => get<{ especies: ContenidoResumen[] }>("/api/dataset/contenido");

export const getFicha = (especieId: number) => get<FichaContenido>(`/api/dataset/contenido/${especieId}`);

export const guardarContenido = (
  especieId: number,
  body: { campos?: Partial<CamposContenido>; foto_principal_sha256?: string | null; galeria?: string[] }
) => send<ContenidoEspecie & { faltan: string[] }>("PUT", `/api/dataset/contenido/${especieId}`, body);

export const enviarARevision = (especieId: number) => send<ContenidoEspecie>("POST", `/api/dataset/contenido/${especieId}/revision`, {});

export const devolverABorrador = (especieId: number, motivo?: string) =>
  send<ContenidoEspecie>("POST", `/api/dataset/contenido/${especieId}/borrador`, { motivo });

export const publicarContenido = (especieId: number) => send<ContenidoEspecie>("POST", `/api/dataset/contenido/${especieId}/publicar`, {});

// ── Destacados (carrusel de inicio) ───────────────────────────────────────────────────────

export type CategoriaDestacado = "rana_del_dia" | "donde_buscarla" | "foto_destacada" | "especie_amenazada";

export type Destacado = {
  id: number;
  fecha: string;
  categoria: CategoriaDestacado;
  especie_id: number;
  nombre_cientifico: string;
  nombre_comun: string | null;
};

export const getDestacados = (desde: string, hasta: string) =>
  get<{ destacados: Destacado[] }>(`/api/dataset/destacados?desde=${desde}&hasta=${hasta}`);

export const getElegibles = (categoria: CategoriaDestacado) =>
  get<{ especies: { especie_id: number; nombre_cientifico: string }[] }>(`/api/dataset/destacados/elegibles/${categoria}`);

export const programarDestacado = (fecha: string, categoria: CategoriaDestacado, especie_id: number) =>
  send<Destacado>("POST", "/api/dataset/destacados", { fecha, categoria, especie_id });

export const quitarDestacado = (id: number) => send<{ ok: true }>("DELETE", `/api/dataset/destacados/${id}`);

// ── Centroides reales (M3) ────────────────────────────────────────────────────────────────

export type CentroideReal = {
  nombre_cientifico: string;
  genero: string;
  familia: string;
  taxon_id: string | null;
  n_vectores: number;
  n_observaciones: number;
  dispersion: number;
  tau: number | null;
  radio: number | null;
  vecino: string | null;
  coseno_vecino: number | null;
};

export type EvaluacionM3 = {
  particion: string;
  n: number;
  cobertura: number;
  cascada: { MATCH_SPECIES: number; MATCH_GENUS: number; MATCH_FAMILY: number; OSR_GLOBAL: number };
  especie_correcta: number;
  especie_equivocada: number;
  genero_correcto: number;
  familia_correcta: number;
  kar: number | null;
  acierto_entre_aceptadas: number | null;
  far: null;
  far_motivo: string;
  altitud_motivo: string;
  regional_motivo: string;
};

export type SugerenciaCluster = {
  a: string;
  b: string;
  coseno: number;
  n_val: number;
  confusiones: number;
  acc_antes: number | null;
  acc_despues: number | null;
};

export type LoteCentroides = {
  experimento: {
    id: number;
    encoder_sha256: string;
    fotos_train: number;
    fotos_train_con_vector: number;
    especies: number;
    creado: string;
    evaluacion: EvaluacionM3 | null;
  } | null;
  especies: CentroideReal[];
  supercentroides: { generos: number; familias: number };
  sugerencias: SugerenciaCluster[];
  /** Por especie y subregión: propio (≥ 3 individuos dentro del polígono) o prestado (usa el global). */
  regionales: CentroideRegional[];
};

export type CentroideRegional = {
  subregion_id: number;
  subregion: string;
  region: string;
  nombre_cientifico: string;
  n_observaciones: number;
  n_vectores: number;
  dispersion: number | null;
  coseno_global: number | null;
  propio: boolean;
};

export const getCentroides = () => send<LoteCentroides>("GET", "/api/dataset/centroides");

export const calcularCentroides = () => send<LoteCentroides>("POST", "/api/dataset/centroides", {});

// ── Versión del dataset: qué fotos entrenan, validan y prueban ─────────────────────────────

export type VersionDataset = {
  id: number;
  nombre: string;
  creado: string;
  creado_por: string | null;
  manifiesto_sha256: string | null;
  parametros: { origen?: string; proporciones?: number[]; individuos?: number; especies?: number } | null;
  train: number;
  val: number;
  test: number;
};

export type EstadoVersiones = {
  /** La primera es la vigente: centroides, OSR, Métricas y el paquete leen esa. */
  versiones: VersionDataset[];
  vigente: number | null;
  /** Lo que cambió en Imágenes desde la versión vigente. */
  cambios: { elegibles: number; nuevas: number; salientes: number };
};

export const getVersiones = () => get<EstadoVersiones>("/api/dataset/versiones");

export const crearVersion = (nombre?: string) =>
  send<{ id: number; nombre: string; fotos: { train: number; val: number; test: number }; individuos: number; especies: number }>(
    "POST",
    "/api/dataset/versiones",
    nombre ? { nombre } : {}
  );

// ── Regiones (Admin → Regiones) ──────────────────────────────────────────────────────────

/** Anillos [lon, lat]: el primero es el borde, los demás huecos. */
export type Poligono = [number, number][][];

export type Departamento = {
  codigo: string;
  nombre: string;
  limites_municipales: boolean;
  en_anura: boolean;
  estado: "borrador" | "activa" | null;
  subregiones: number;
  municipios_asignados: number;
  poligonos?: Poligono[];
};

export type Subregion = { id: number; numero: number; clave: string; nombre: string; municipios: string[] };

export type CifrasZona = { observaciones: number; especies: string[] };

export type RegionDetalle = {
  region: { codigo_dane: string; nombre: string; estado: "borrador" | "activa"; creado: string };
  limites_municipales: boolean;
  subregiones: Subregion[];
  municipios: { codigo: string; nombre: string }[];
  geometria: {
    features: { properties: { codigo: string; nombre: string }; geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown } }[];
  } | null;
  sin_subregion: string[];
  cifras: {
    departamento: CifrasZona;
    subregiones: Record<string, CifrasZona>;
    municipios: Record<string, number>;
  } | null;
};

export const getRegiones = (geometria = false) =>
  get<{ departamentos: Departamento[] }>(`/api/dataset/regiones${geometria ? "?geometria=1" : ""}`);
export const getRegion = (codigo: string) => get<RegionDetalle>(`/api/dataset/regiones/${codigo}`);
export const agregarRegion = (codigo_dane: string) => send<unknown>("POST", "/api/dataset/regiones", { codigo_dane });
export const activarRegion = (codigo: string) => send<unknown>("POST", `/api/dataset/regiones/${codigo}/activar`, {});
export const crearSubregion = (codigo: string, nombre: string) =>
  send<Subregion>("POST", `/api/dataset/regiones/${codigo}/subregiones`, { nombre });
export const renombrarSubregion = (codigo: string, id: number, nombre: string) =>
  send<Subregion>("PUT", `/api/dataset/regiones/${codigo}/subregiones/${id}`, { nombre });
export const borrarSubregion = (codigo: string, id: number) => send<unknown>("DELETE", `/api/dataset/regiones/${codigo}/subregiones/${id}`);
export const asignarMunicipios = (codigo: string, id: number, municipios: string[]) =>
  send<unknown>("POST", `/api/dataset/regiones/${codigo}/subregiones/${id}/municipios`, { municipios });
export const quitarRegion = (codigo: string) => send<unknown>("DELETE", `/api/dataset/regiones/${codigo}`);

// ── Etiquetas de curación: morfos, estadio y sustrato (bloque 1) ─────────────────────────

export const getEtiquetas = (especieId: number) =>
  send<import("./etiquetas").EtiquetasEspecie>("GET", `/api/dataset/especies/${especieId}/etiquetas`);
export const declararMorfo = (especieId: number, input: { subregion_id: number; nombre: string; nota?: string }) =>
  send<import("./etiquetas").Morfo>("POST", `/api/dataset/especies/${especieId}/morfos`, input);
export const quitarMorfo = (morfoId: number) => send<unknown>("DELETE", `/api/dataset/morfos/${morfoId}`);
/** Solo cambia los campos que vienen; null los borra. */
export const etiquetarObservacion = (
  observacionId: number,
  cambios: Partial<Pick<import("./etiquetas").EtiquetaObservacion, "estadio" | "sustrato" | "morfo_id">>
) => send<import("./etiquetas").EtiquetaObservacion>("PUT", `/api/dataset/observaciones/${observacionId}/etiqueta`, cambios);

// ── Especies: crear y editar (Admin → Especies) ──────────────────────────────────────────

export type EspecieCreada = Pick<DatasetEspecie, "id" | "carpeta" | "nombre_cientifico" | "genero" | "familia" | "taxon_id"> & { creado: string };

/** El género sale del nombre; la carpeta y el taxon_id los asigna el servidor. */
export const crearEspecie = (input: { nombre_cientifico: string; familia: string }) =>
  send<EspecieCreada>("POST", "/api/dataset/especies", input);

/** Con aplicar_a_congeneres la familia nueva también se pone a las demás especies del género. */
export const editarEspecie = (
  id: number,
  cambios: { nombre_cientifico?: string; familia?: string; aplicar_a_congeneres?: boolean }
) => send<EspecieCreada & { congeneres_corregidos: number }>("PUT", `/api/dataset/especies/${id}`, cambios);

// ── OSR, Métricas y Simulador (bloque 6) ─────────────────────────────────────────────────

import { paqueteQuery as paq, type PaqueteId } from "./osr";

export const getPaquetesOsr = () => send<{ paquetes: import("./osr").PaqueteOsr[] }>("GET", "/api/dataset/osr/paquetes");
export const getOsr = (subregionId: PaqueteId) =>
  send<import("./osr").EstadoOsr>("GET", `/api/dataset/osr?subregion_id=${paq(subregionId)}`);
/** El servidor calcula τ y lo deja como propuesta sin validar. */
export const calibrarOsr = (subregionId: PaqueteId, karObjetivo: number) =>
  send<import("./osr").EstadoOsr>("POST", "/api/dataset/osr/calibraciones", { subregion_id: subregionId, kar_objetivo: karObjetivo });
export const validarOsr = (calibracionId: number, tau: number, nota?: string) =>
  send<import("./osr").EstadoOsr>("POST", "/api/dataset/osr/validaciones", { calibracion_id: calibracionId, tau, nota });

export const getEvaluaciones = () =>
  send<{ experimento: { id: number; creado: string } | null; paquetes: import("./osr").PaqueteEvaluado[] }>("GET", "/api/dataset/evaluaciones");
export const getEvaluacion = (id: number) => send<import("./osr").DetalleEvaluacion>("GET", `/api/dataset/evaluaciones/${id}`);
export const evaluarPaquete = (subregionId: PaqueteId) =>
  send<import("./osr").DetalleEvaluacion>("POST", "/api/dataset/evaluaciones", { subregion_id: subregionId });

export const getSimulador = (subregionId: PaqueteId) =>
  send<import("./osr").OpcionesSimulador>("GET", `/api/dataset/simulador?subregion_id=${paq(subregionId)}`);
export const getFotosSimulador = (especieId: number, offset = 0) =>
  send<{ fotos: import("./osr").FotoSimulador[] }>("GET", `/api/dataset/simulador/fotos?especie_id=${especieId}&offset=${offset}`);
export const identificarFoto = (subregionId: PaqueteId, sha256: string, umbral: "validado" | "propuesta") =>
  send<import("./osr").ResultadoSimulador>("POST", "/api/dataset/simulador/identificar", { subregion_id: subregionId, sha256, umbral });
