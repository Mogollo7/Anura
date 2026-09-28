import seed from "@/data/antioquia-real.json";

/**
 * Datos reales de Antioquia, exportados por `D:\Anura\tools\admin\export_admin_seed.py`.
 * Es la única fuente de especies, conteos, altitudes y presencia por subregión del
 * Admin: antes eran 41 especies simuladas que no coincidían con el paquete del teléfono.
 * Para refrescarlos se vuelve a correr el script; nada de esto se edita a mano.
 */

export type RealAltitud = { n: number; media: number; desviacion: number; min: number; max: number; p05: number; p95: number };

export type RealSpecies = {
  taxonId: string;
  familia: string;
  genero: string;
  epiteto: string;
  especie: string;
  estadoVisual: "VISUAL_ENABLED" | "VISUAL_EXCLUDED_REVIEW";
  motivoExclusion: string | null;
  evidencia: string;
  fotosCuradas: number;
  individuosCurados: number;
  fotosReferenciaPaquete: number;
  individuosReferenciaPaquete: number;
  fotosVal: number;
  fotosPrueba: number;
  registros: Record<string, number>;
  altitud: RealAltitud | null;
  subregiones: Record<string, number>;
  gbifKey: number | null;
  inatTaxonId: string | null;
  carpetaDataset: string | null;
};

type Seed = {
  generado: string;
  fuentes: Record<string, string>;
  paqueteTelefono: {
    archivo: string;
    bytes: number;
    info: Record<string, string>;
    openSet: { archivo: string; bytes: number; metodo: string; centroides: number; permitidosAntioquia: number };
    decision: string;
  };
  encoders: {
    telefono: { archivo: string; bytes: number; sha256: string; base: string; ajustado: boolean; checkpoint: string; checkpointSha256: string; dimensiones: number };
    servidor: { repo: string; base: string; dimensiones: number; instalado: boolean; usadoPor: string };
  };
  subregiones: { id: string; observaciones: number; especiesObservadas: number; chao1: number; completitud: number; municipios: number }[];
  especies: RealSpecies[];
  comparacion: RealComparison | null;
};

export type PathResult = {
  especie_correcta: number;
  especie_equivocada: number;
  kar: number;
  genero_correcto_sin_especie: number;
  estados_conocidas: Record<string, number>;
  far: number;
  auroc: number;
  estados_desconocidas: Record<string, number>;
  desconocidas_respuesta_segura: number;
  desconocidas_nivel_correcto: number;
};

export type RealComparison = {
  fecha: string;
  datos: {
    referencias: number;
    prueba_conocidas: number;
    val_calibracion: number;
    desconocidas: number;
    especies_desconocidas: string[];
    prueba_con_altitud: number;
    desconocidas_con_altitud: number;
  };
  viejo: {
    top1_visual_sin_rechazo: number;
    kar: number;
    aceptadas_y_correctas: number;
    far: number;
    auroc: number;
    desconocidas_respuesta_segura: number;
  desconocidas_nivel_correcto: number;
    tau: number;
  };
  nuevo: Record<string, PathResult>;
  encoder?: string;
  misma_exigencia: { kar_objetivo: number; far_viejo: number; far_nuevo_capa1: number };
  clusters: { id: string; miembros: string[]; epsilon: number; columnas: number; bytes_fp16: number }[];
  tamano: { viejo_bytes: number; nuevo_vectores_y_matrices_bytes_fp16: number };
};

export const REAL = seed as unknown as Seed;
export const REAL_SPECIES: RealSpecies[] = REAL.especies;
export const REAL_COMPARISON = REAL.comparacion;

const bySlug = new Map(REAL_SPECIES.map((s) => [slug(s.especie), s]));

export function slug(especie: string) {
  return especie.toLowerCase().replace(/\s+/g, "-");
}

export function realSpecies(id: string): RealSpecies | undefined {
  return bySlug.get(id);
}
