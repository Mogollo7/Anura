import type { SpeciesEntry } from "@/lib/mock/catalog";
import { getReferenceStats } from "@/lib/mock/reference";
import { getCurationSample } from "@/lib/mock/curation";

/**
 * Membresía del dataset que entra al worker: el material de referencia menos
 * lo que la curación (F13) descarta de forma automática — duplicados por
 * pHash y borrosas por Laplaciano. El material completo no está enumerado
 * foto por foto (son cientos por especie), así que la tasa de descarte se
 * MIDE en la muestra curada de esa especie y se aplica al total. Es la única
 * cifra de vectores que usan Paquetes, DB vectorial y el worker: antes cada
 * uno contaba la referencia bruta e ignoraba la curación.
 *
 * Las exclusiones manuales de /curacion son estado de sesión del navegador y
 * no llegan aquí (no hay backend que las persista todavía).
 */
export type DatasetMembership = {
  speciesId: string;
  individuos: number;
  fotosReferencia: number;
  descartadasDuplicado: number;
  descartadasBorrosa: number;
  fotosActivas: number;
  sinLicencia: number;
};

export function datasetMembership(species: SpeciesEntry): DatasetMembership {
  const ref = getReferenceStats(species);
  const sample = getCurationSample(species).photos;
  const n = sample.length || 1;
  const dupRate = sample.filter((p) => p.duplicateGroup).length / n;
  const blurRate = sample.filter((p) => !p.duplicateGroup && p.isBlurry).length / n;

  const descartadasDuplicado = Math.round(ref.fotos * dupRate);
  const descartadasBorrosa = Math.round(ref.fotos * blurRate);
  const fotosActivas = Math.max(0, ref.fotos - descartadasDuplicado - descartadasBorrosa);

  return {
    speciesId: species.id,
    individuos: ref.individuos,
    fotosReferencia: ref.fotos,
    descartadasDuplicado,
    descartadasBorrosa,
    fotosActivas,
    sinLicencia: Math.round(ref.sinLicencia * (fotosActivas / ref.fotos)),
  };
}

/** Vectores que produce el worker para una especie: fotos activas con tope por especie. */
export function vectorsFor(m: DatasetMembership, tope: number) {
  return Math.min(m.fotosActivas, tope);
}
