import { realSpecies } from "@/lib/data/real";
import type { SpeciesEntry } from "./catalog";

export type ReferenceStats = {
  individuos: number; // obs_id distintos
  fotos: number;
  audios: number;
  sinLicencia: number; // fotos sin license_code/attribution resuelto
};


/**
 * Conteos REALES del dataset curado de Antioquia (catalog_v1: photos_curated e
 * individuals_curated). No hay audio en el dataset de referencia todavía: 0, no
 * un número simulado. Las licencias sin resolver no están exportadas: 0 hasta
 * que el backend lea `reference_images.license_code`.
 */
export function getReferenceStats(species: SpeciesEntry): ReferenceStats {
  const r = realSpecies(species.id);
  return {
    individuos: r?.individuosCurados ?? 0,
    fotos: r?.fotosCuradas ?? 0,
    audios: 0,
    sinLicencia: 0,
  };
}

export { GRUPO_A_MIN_INDIVIDUOS } from "@/lib/dataset/reglas";
