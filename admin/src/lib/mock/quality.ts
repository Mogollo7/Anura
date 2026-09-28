import type { MockObservation } from "./observations";

export type DuplicateCandidate = {
  id: string;
  a: MockObservation;
  b: MockObservation;
  similarity: number;
};

export type CoordinateAnomaly = {
  observation: MockObservation;
  reason: string;
};

export type IncompleteRecord = {
  observation: MockObservation;
  missing: string[];
};

export type TaxonomicIssue = {
  taxon: string;
  detail: string;
  fuente: string;
};

/**
 * Ya no se inventan candidatos: sin hash de imagen en observations.observations
 * no hay señal reproducible en el panel.
 */
export function getDuplicateCandidates(): DuplicateCandidate[] {
  return [];
}

export function getCoordinateAnomalies(): CoordinateAnomaly[] {
  return [];
}

export function getIncompleteRecords(): IncompleteRecord[] {
  return [];
}

export const TAXONOMIC_ISSUES: TaxonomicIssue[] = [];

/** Cifras del dataset de referencia (documentación); integrations.ts las cita. */
export const LICENSING_GAP = {
  sinResolver: 1450,
  total: 4034,
  nota:
    "El embedding es una transformación numérica derivada de la foto, no la obra protegida — no bloquea el paquete. Si en el futuro la app muestra fotos de referencia como evidencia visual, la atribución vuelve a aplicar.",
};

export const GBIF_TRUNCATION = {
  celdasCortadas: 6,
  celdasTotal: 90,
  limitePorCelda: 300,
};
