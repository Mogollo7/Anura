import { mulberry32, pick, seededInt } from "./rng";
import { getAllSpecies, type SpeciesEntry } from "./catalog";
import { getDepartamento } from "@/lib/packages/departamentos";
import { suggestedSpecies, TOPE_DEFAULT } from "@/lib/packages/constants";
import { getReferenceStats } from "./reference";
import { datasetMembership, vectorsFor } from "@/lib/worker/membership";
import { getPackages, estimateSqliteMb, type PackageSummary } from "./packages";
import { ANTIOQUIA_SUBREGIONES, speciesForSubregion } from "@/lib/packages/antioquia-subregiones";

export type VectorCollection = {
  packageId: string;
  nombre: string;
  tabla: string; // nombre de la tabla virtual sqlite-vec
  especies: SpeciesEntry[];
  totalVectores: number;
  sizeMb: number;
};

export type EmbeddingPoint = {
  id: string;
  speciesId: string;
  x: number;
  y: number;
  isCentroid?: boolean;
};

export type VectorMetadataRow = {
  vectorId: string;
  speciesId: string;
  individuoId: string;
  fuente: "iNaturalist" | "GBIF" | "campo";
  licencia: string;
  preview: number[]; // primeras componentes del vector 512-D, solo para mostrar
};

export type IndexInfo = {
  tabla: string;
  dimensiones: 512;
  metrica: "coseno" | "L2";
  tipo: "flat (fuerza bruta)" | "IVF_FLAT";
  vectores: number;
  tamanoIndiceMb: number;
  construccionMs: number;
  latenciaP50Ms: number;
  latenciaP95Ms: number;
};

const FAMILY_COLORS: Record<string, string> = {
  Hylidae: "#34C759",
  Phyllomedusidae: "#30B0C7",
  Centrolenidae: "#64D2FF",
  Craugastoridae: "#FF9500",
  Bufonidae: "#8A6100",
  Dendrobatidae: "#FF453A",
  Aromobatidae: "#AF52DE",
  Leptodactylidae: "#FFD60A",
  Hemiphractidae: "#5E5CE6",
  Microhylidae: "#8E8E93",
};

export function familyColor(familia: string) {
  return FAMILY_COLORS[familia] ?? "#8E8E93";
}

function seedFrom(...parts: (string | number)[]) {
  return parts.join("|").split("").reduce((acc, c) => (acc * 33 + c.charCodeAt(0)) | 0, 5381);
}

const ALL_SPECIES_BY_ID = new Map(getAllSpecies().map((s) => [s.id, s]));

function collectionSpecies(pkg: PackageSummary): SpeciesEntry[] {
  const dep = getDepartamento(pkg.departamentoId);
  if (!dep) return [];
  return suggestedSpecies(dep.id)
    .map((id) => ALL_SPECIES_BY_ID.get(id))
    .filter((s): s is SpeciesEntry => !!s);
}

export function getVectorCollections(): VectorCollection[] {
  return getPackages()
    .map((pkg) => {
      const especies = collectionSpecies(pkg);
      const totalVectores = especies.reduce(
        (sum, sp) => sum + vectorsFor(datasetMembership(sp), TOPE_DEFAULT),
        0
      );
      return {
        packageId: pkg.id,
        nombre: pkg.nombre,
        tabla: `vec_${pkg.id.replace(/-/g, "_")}`,
        especies,
        totalVectores,
        sizeMb: estimateSqliteMb(totalVectores, especies.length),
      };
    })
    .filter((c) => c.especies.length > 0);
}

/** Un conteo del catálogo: la misma membresía y el mismo tope que el worker. No es la suma de las subregiones. */
export function catalogVectorTotal() {
  return getAllSpecies().reduce((sum, sp) => sum + vectorsFor(datasetMembership(sp), TOPE_DEFAULT), 0);
}

/** Vectores por subregión, con el solape de altitud y la membresía curada. */
export function subregionVectorCollections(): VectorCollection[] {
  return ANTIOQUIA_SUBREGIONES.map((sub) => {
    const especies = speciesForSubregion(sub.id);
    const totalVectores = especies.reduce((sum, sp) => sum + vectorsFor(datasetMembership(sp), TOPE_DEFAULT), 0);
    return {
      packageId: sub.id,
      nombre: `${sub.numero} ${sub.nombre}`,
      tabla: `vec_${sub.id}`,
      especies,
      totalVectores,
      sizeMb: estimateSqliteMb(totalVectores, especies.length),
    };
  });
}

export function getVectorCollection(packageId: string) {
  return subregionVectorCollections().find((c) => c.packageId === packageId) ?? getVectorCollections().find((c) => c.packageId === packageId);
}

/**
 * Posición 2D determinista por familia → género, como si fuera una
 * proyección (PCA/UMAP) del espacio de 512 dimensiones. Familias distintas
 * ocupan sectores distintos del plano; dentro de un género los puntos se
 * agrupan — igual que en la matriz de confusión, la cercanía visual
 * corresponde a similitud morfológica real, no es ruido decorativo.
 */
function familySector(familia: string, allFamilies: string[]) {
  const idx = allFamilies.indexOf(familia);
  const angle = (idx / allFamilies.length) * Math.PI * 2;
  return angle;
}

function genusCenter(sp: SpeciesEntry, allFamilies: string[]) {
  const angle = familySector(sp.familia, allFamilies);
  const rand = mulberry32(seedFrom(sp.familia, sp.genero));
  const radius = 0.55 + rand() * 0.35;
  const jitter = (rand() - 0.5) * 0.5;
  return {
    x: Math.cos(angle + jitter) * radius,
    y: Math.sin(angle + jitter) * radius,
  };
}

const MAX_POINTS_PER_SPECIES = 22;

/** Muestra representativa de embeddings proyectados a 2D — no 1:1 con la tabla real. */
export function getEmbeddingScatter(collection: VectorCollection): EmbeddingPoint[] {
  const allFamilies = Array.from(new Set(collection.especies.map((s) => s.familia)));
  const points: EmbeddingPoint[] = [];

  for (const sp of collection.especies) {
    const center = genusCenter(sp, allFamilies);
    const rand = mulberry32(seedFrom(collection.packageId, sp.id, "scatter"));
    const count = Math.min(MAX_POINTS_PER_SPECIES, Math.max(4, Math.round(getReferenceStats(sp).individuos / 12)));
    const dispersion = 0.05 + rand() * 0.05;

    for (let k = 0; k < count; k++) {
      // Suma de variables uniformes ≈ gaussiana (aproximación de Irwin-Hall).
      const gx = (rand() + rand() + rand() - 1.5) / 1.5;
      const gy = (rand() + rand() + rand() - 1.5) / 1.5;
      points.push({
        id: `${sp.id}-${k}`,
        speciesId: sp.id,
        x: center.x + gx * dispersion,
        y: center.y + gy * dispersion,
      });
    }
    points.push({ id: `${sp.id}-centroid`, speciesId: sp.id, x: center.x, y: center.y, isCentroid: true });
  }

  return points;
}

const FUENTES: VectorMetadataRow["fuente"][] = ["iNaturalist", "iNaturalist", "GBIF", "campo"];

export function getVectorMetadataSample(collection: VectorCollection, limit = 18): VectorMetadataRow[] {
  const rows: VectorMetadataRow[] = [];
  let i = 0;
  outer: for (const sp of collection.especies) {
    const rand = mulberry32(seedFrom(collection.packageId, sp.id, "metadata"));
    const count = Math.min(3, Math.ceil(limit / collection.especies.length));
    for (let k = 0; k < count; k++) {
      if (rows.length >= limit) break outer;
      const preview = Array.from({ length: 6 }, () => Math.round((rand() * 2 - 1) * 1000) / 1000);
      rows.push({
        vectorId: `vec_${String(i + 1).padStart(5, "0")}`,
        speciesId: sp.id,
        individuoId: `obs_${seededInt(rand, 100000, 999999)}`,
        fuente: pick(rand, FUENTES),
        licencia: rand() < 0.32 ? "sin resolver" : "CC-BY-NC",
        preview,
      });
      i++;
    }
  }
  return rows;
}

export function getIndexInfo(collection: VectorCollection): IndexInfo {
  const rand = mulberry32(seedFrom(collection.packageId, "index"));
  const large = collection.totalVectores > 2000;
  return {
    tabla: collection.tabla,
    dimensiones: 512,
    metrica: "coseno",
    tipo: large ? "IVF_FLAT" : "flat (fuerza bruta)",
    vectores: collection.totalVectores,
    tamanoIndiceMb: Math.round(collection.totalVectores * 512 * 4 * 1.08 / 1_048_576 * 10) / 10,
    construccionMs: Math.round(collection.totalVectores * (large ? 0.9 : 0.4) + seededInt(rand, 40, 200)),
    latenciaP50Ms: Math.round((large ? 2.2 : 1.1) + rand() * 1.5),
    latenciaP95Ms: Math.round((large ? 5.5 : 2.8) + rand() * 3),
  };
}
