import { mulberry32, pick, seededInt } from "./rng";
import { getSpeciesDetail, type SpeciesEntry } from "./catalog";
import { getReferenceStats } from "./reference";

/**
 * Jerarquía real del dataset científico (19_ADMIN/Modelo de Datos del Admin):
 * Especie → Individuo → Observación → Fotografía. El dataset es la membresía
 * versionada de fotografías, no el padre biológico — train/test se parten
 * por individuo para no colar el mismo animal en ambos lados.
 *
 * No se enumera 1:1 el material de referencia real (`getReferenceStats` ya da
 * el total agregado, cientos de individuos por especie); esto genera una
 * MUESTRA representativa navegable para curar, con la misma proporción de
 * duplicados/borrosas/sin licencia que ya usa el resto del admin.
 */

export type PhotoSource = "iNaturalist" | "GBIF" | "campo";

/** Chips de sustrato de la fuente (Contexto Ecológico y Pesos): unifica hojarasca/vegetación/quebrada/roca. */
export type Substrato = "hojarasca" | "vegetacion" | "quebrada" | "roca";

export const SUBSTRATO_LABEL: Record<Substrato, string> = {
  hojarasca: "Hojarasca",
  vegetacion: "Vegetación / hoja",
  quebrada: "Quebrada / agua",
  roca: "Roca",
};

/**
 * Sesgo de sustrato por familia — no es aleatorio puro: una rana de cristal
 * (Centrolenidae) se registra junto a quebradas con mucha más frecuencia que
 * un sapo terrestre (Bufonidae). Reflejar esto es lo que permite que el
 * perfil ecológico "calculado" de la ficha (F15) salga de datos con sentido
 * biológico, no de un dado sin memoria.
 */
const SUBSTRATO_W_BY_FAMILY: Record<string, Substrato[]> = {
  Centrolenidae: ["quebrada", "quebrada", "quebrada", "vegetacion", "roca"],
  Hylidae: ["vegetacion", "vegetacion", "vegetacion", "hojarasca", "quebrada"],
  Phyllomedusidae: ["vegetacion", "vegetacion", "vegetacion", "hojarasca"],
  Bufonidae: ["hojarasca", "hojarasca", "hojarasca", "roca"],
  Craugastoridae: ["hojarasca", "hojarasca", "vegetacion", "roca"],
  Dendrobatidae: ["hojarasca", "hojarasca", "vegetacion"],
  Aromobatidae: ["quebrada", "hojarasca", "roca"],
  Leptodactylidae: ["hojarasca", "quebrada", "vegetacion"],
  Hemiphractidae: ["vegetacion", "vegetacion", "hojarasca"],
  Microhylidae: ["hojarasca", "hojarasca", "vegetacion"],
};
const SUBSTRATO_W_DEFAULT: Substrato[] = ["hojarasca", "vegetacion", "quebrada", "roca"];

export const BLUR_VAR_THRESHOLD = 100;

export const CURRENT_DATASET_VERSION = "antioquia_dataset_2026_09_24";

export { MIN_FOTOS_ENTRENABLE } from "@/lib/dataset/reglas";

export type LifeStage = "adulto" | "juvenil" | "metamorfico" | "larva" | "desconocido";

export const LIFE_STAGE_LABEL: Record<LifeStage, string> = {
  adulto: "Adulto",
  juvenil: "Juvenil",
  metamorfico: "Metamórfico",
  larva: "Larva",
  desconocido: "Desconocido",
};

const LIFE_STAGE_W: LifeStage[] = [
  "adulto", "adulto", "adulto", "adulto", "adulto", "adulto", "adulto",
  "juvenil", "juvenil", "metamorfico", "desconocido",
];

export const INVALID_OBSERVATION_REASONS = [
  "GPS fuera del rango de distribución conocido de la especie",
  "El individuo ya está registrado en otra observación (duplicado cruzado)",
  "La foto no permite verificar caracteres diagnósticos",
  "Metadatos de fecha o ubicación inconsistentes con la fuente",
] as const;

export type MockPhoto = {
  id: string;
  observationId: string;
  individualId: string;
  speciesId: string;
  fuente: PhotoSource;
  licencia: string;
  blurVar: number;
  isBlurry: boolean;
  duplicateGroup: string | null;
};

export type MockCurationObservation = {
  id: string;
  individualId: string;
  speciesId: string;
  fuente: PhotoSource;
  /** Id real del scraping en su plataforma de origen — iNaturalist/GBIF traen uno; "campo" no. */
  fuenteId: string | null;
  fecha: string;
  lat: number;
  lng: number;
  altitudRaw: number;
  substrato: Substrato;
  photoIds: string[];
};

export type MockIndividual = {
  id: string;
  speciesId: string;
  observationIds: string[];
  estadio: LifeStage;
};

export type CurationSample = {
  speciesId: string;
  datasetVersion: string;
  totalIndividuosReferencia: number;
  totalFotosReferencia: number;
  individuals: MockIndividual[];
  observations: MockCurationObservation[];
  photos: MockPhoto[];
};

const FUENTES_W: PhotoSource[] = ["iNaturalist", "iNaturalist", "iNaturalist", "GBIF", "campo"];

function seedFor(id: string, salt: string) {
  return `${id}::${salt}`.split("").reduce((acc, c) => (acc * 33 + c.charCodeAt(0)) | 0, 9973);
}

export function getCurationSample(species: SpeciesEntry): CurationSample {
  const stats = getReferenceStats(species);
  const rand = mulberry32(seedFor(species.id, "curation"));
  const substratoW = SUBSTRATO_W_BY_FAMILY[species.familia] ?? SUBSTRATO_W_DEFAULT;
  const detail = getSpeciesDetail(species.id);

  const sampleSize = Math.min(stats.individuos, species.lowData ? 6 : 10);

  const individuals: MockIndividual[] = [];
  const observations: MockCurationObservation[] = [];
  const photos: MockPhoto[] = [];
  let lastPhotoInIndividual: string | null = null;

  for (let i = 0; i < sampleSize; i++) {
    const individualId = `${species.id}-ind-${String(i + 1).padStart(3, "0")}`;
    const observationIds: string[] = [];
    const obsCount = seededInt(rand, 1, 3);

    for (let o = 0; o < obsCount; o++) {
      const observationId = `${individualId}-obs-${o + 1}`;
      const fuente = pick(rand, FUENTES_W);
      const photoCount = seededInt(rand, 1, 4);
      const photoIds: string[] = [];

      for (let p = 0; p < photoCount; p++) {
        const photoId = `${observationId}-foto-${p + 1}`;
        const isDup = lastPhotoInIndividual && rand() < 0.14;
        const blurVar = seededInt(rand, 15, 340);
        photos.push({
          id: photoId,
          observationId,
          individualId,
          speciesId: species.id,
          fuente,
          licencia: rand() < 0.28 ? "sin resolver" : "CC-BY-NC",
          blurVar,
          isBlurry: blurVar < BLUR_VAR_THRESHOLD,
          duplicateGroup: isDup ? lastPhotoInIndividual : null,
        });
        photoIds.push(photoId);
        lastPhotoInIndividual = photoId;
      }

      observations.push({
        id: observationId,
        individualId,
        speciesId: species.id,
        fuente,
        fuenteId:
          fuente === "iNaturalist"
            ? String(seededInt(rand, 40_000_000, 199_999_999))
            : fuente === "GBIF"
              ? String(seededInt(rand, 1_000_000_000, 4_999_999_999))
              : null,
        fecha: `2026-${String(seededInt(rand, 1, 9)).padStart(2, "0")}-${String(seededInt(rand, 1, 28)).padStart(2, "0")}`,
        lat: 5.4 + rand() * 3.5,
        lng: -77.1 + rand() * 3.2,
        // Dentro del rango de la especie (Catálogo), con un 6 % de registros fuera de rango
        // para que Calidad de datos y el aviso de GPS tengan algo real que detectar.
        altitudRaw:
          rand() < 0.06
            ? seededInt(rand, 40, 3600)
            : seededInt(rand, Math.max(0, detail.altitudMin - 100), detail.altitudMax + 100),
        substrato: pick(rand, substratoW),
        photoIds,
      });
      observationIds.push(observationId);
    }

    individuals.push({
      id: individualId,
      speciesId: species.id,
      observationIds,
      estadio: pick(rand, LIFE_STAGE_W),
    });
  }

  return {
    speciesId: species.id,
    datasetVersion: CURRENT_DATASET_VERSION,
    totalIndividuosReferencia: stats.individuos,
    totalFotosReferencia: stats.fotos,
    individuals,
    observations,
    photos,
  };
}
