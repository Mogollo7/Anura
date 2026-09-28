import type { DatasetResumen, EstadoWorker } from "@/lib/dataset/dataset-client";

/** Puntos por consulta que acepta la API pública de OpenTopoData. */
const OPENTOPODATA_MAX_POINTS = 100;

/**
 * Integraciones externas que usa el pipeline. El uso sale del servidor (dataset y worker);
 * si no hay una cifra medible, la fila no la inventa.
 */
export type Integration = {
  id: string;
  nombre: string;
  proposito: string;
  usadaEn: string;
  limite: string;
  usoActual: string | null;
  nota: string;
};

export function getIntegrations(datos: { resumen: DatasetResumen | null; worker: EstadoWorker | null }): Integration[] {
  const especies = datos.resumen?.especies ?? null;
  const fotos = especies ? especies.reduce((n, e) => n + e.fotos, 0) : null;
  const enCatalogo = especies ? especies.filter((e) => e.taxon_id).length : null;
  const vectores = datos.worker ? datos.worker.encoders.reduce((n, e) => n + e.vectores, 0) : null;
  const n = (v: number) => v.toLocaleString("es-CO");

  return [
    {
      id: "opentopodata",
      nombre: "OpenTopoData",
      proposito: "Altitud de cada celda de la cuadrícula y de los registros sin elevación (pipeline_dataset/elevacion_celdas.py).",
      usadaEn: "Paquetes → Cobertura y altitud",
      limite: `${OPENTOPODATA_MAX_POINTS} coordenadas por solicitud (API pública)`,
      usoActual: null,
      nota: "Sin API key: hay que trocear en lotes de 100 y respetar su límite de tasa.",
    },
    {
      id: "gbif",
      nombre: "GBIF",
      proposito: "Backbone taxonómico y registros de ocurrencia para poblar el catálogo por departamento.",
      usadaEn: "Especies, Calidad",
      limite: "300 registros por celda en su API de ocurrencias (paginación)",
      usoActual: especies && enCatalogo != null ? `${n(enCatalogo)} de ${n(especies.length)} especies del dataset con taxón del catálogo` : null,
      nota: "Las especies sin equivalente en su backbone quedan fuera del catálogo hasta resolverlas a mano.",
    },
    {
      id: "inaturalist",
      nombre: "iNaturalist",
      proposito: "Fotos y observaciones de referencia para el set de entrenamiento y validación.",
      usadaEn: "Imágenes, DB vectorial",
      limite: "Sin autenticación: límite de tasa compartido de su API pública",
      usoActual:
        fotos != null
          ? `${n(fotos)} fotos en el dataset${vectores != null ? ` · ${n(vectores)} vectores calculados` : ""}`
          : null,
      nota: "quality_grade filtra por consenso de identificación, no por nitidez de la foto.",
    },
  ];
}
