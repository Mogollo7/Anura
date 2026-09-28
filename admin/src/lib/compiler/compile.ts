import type { SpeciesEntry } from "@/lib/mock/catalog";
import { getSpeciesSheet } from "@/lib/mock/species-sheet";
import { SUBSTRATO_LABEL } from "@/lib/mock/curation";
import { speciesForSubregion, getAntioquiaSubregion } from "@/lib/packages/antioquia-subregiones";
import { getSpeciesCentroids, MIN_INDIVIDUOS_REGIONAL, type MorphInput } from "@/lib/centroids/centroids";
import { ENCODER } from "@/lib/worker/encoder";
import { clusterFingerprint, trainAdapter, type ClusterDef } from "@/lib/adapters/adapters";
import { calibratePackage, evaluateOsr, type ClusterGate, type OsrConfig } from "@/lib/osr/osr";
import { mulberry32 } from "@/lib/mock/rng";
import { CURRENT_DATASET_VERSION } from "@/lib/mock/curation";

/**
 * Compilador (19_ADMIN fase 12, `/admin/compile`; [[Esquema JSON del Paquete]]).
 * Une taxonomía + centroides + morfos + contexto + OSR + micro-adaptadores en
 * UN JSON por subregión (decisión #8: nueve descargas, no treinta y seis).
 * No recalcula nada: cada pieza ya existe en F15–F21, esto solo las junta y
 * aplica los rechazos duros que la fuente exige antes de que exista un
 * artefacto siquiera. Los vectores de 512 son marcador de posición, igual
 * que en los tres ejemplos del vault — no hay BioCLIP real todavía y fingir
 * un vector como si lo fuera sería inventar un dato que el sistema no puede
 * producir.
 */

export type SpeciesJsonEntry = {
  taxon_id: string;
  genus_id: string;
  nombre: string;
  sub_centroids: { morph_id: string; dim: number; vector: string }[];
  rejection_tau: number;
  tau_kind: "cosine_similarity";
  context_parameters: {
    altitude_mean_msnm: number;
    altitude_std_dev: number;
    weights: { visual: number; geo: number; habitat: number };
    substrate_priors: Record<string, number>;
    audio_signature_id: null;
  };
};

/** Supercentroide: sin él el teléfono no puede bajar a "Género sp." ni a la familia (cascada). */
type NodeCentroid = { dim: number; vector: string; regla: string };
export type GenusNode = { genus_id: string; family_id: string; nombre: string; centroid: NodeCentroid; rejection_tau_genus: number; tau_kind: "cosine_similarity" };
export type FamilyNode = { family_id: string; nombre_comun: string; centroid: NodeCentroid; rejection_tau_family: number; tau_kind: "cosine_similarity" };

export type CrypticClusterJson = {
  cluster_id: string;
  especies: string[];
  dim: number;
  columnas: number;
  bytes: number;
  epsilon_reconstruction: number;
};

export type PackageManifest = {
  package_metadata: {
    package_id: string;
    region_name: string;
    version: string;
    last_updated: string;
    embedding_dim: number;
    quantization: "FP16" | "FP32";
    encoder: string;
  };
  family_nodes: FamilyNode[];
  genus_nodes: GenusNode[];
  species_catalog: SpeciesJsonEntry[];
  cryptic_clusters: CrypticClusterJson[];
  provenance: {
    dataset_version: string;
    species_count: number;
    generated_by: string;
    generated_at: string;
  };
  /**
   * Capa 3 congelada en el artefacto. Sin esto el simulador no puede aplicar
   * la política que la persona validó: el release diría una cosa y la pantalla
   * de OSR otra. Releases compilados antes de F24 pueden no traerla.
   */
  decision?: {
    umbral_geo: number;
    politica_geo: "rechazo" | "penalizacion";
  };
};

export type CompilerReject = { id: string; label: string; detalle: string; speciesId?: string };

function fakeSha(text: string) {
  const rand = mulberry32(text.split("").reduce((a, c) => (a * 33 + c.charCodeAt(0)) | 0, 5381));
  return Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(rand() * 16)]).join("");
}

/** Huella de todo lo que alimenta la compilación: si algo de esto cambia, el release queda vencido (patrón de OSR/Centroides). */
export function compileFingerprint(subregionId: string, version: string, morphs: MorphInput, clusters: ClusterDef[], osrConfig: OsrConfig) {
  return JSON.stringify([
    subregionId,
    version,
    morphs.declarations.filter((d) => d.subregion === subregionId),
    Object.entries(morphs.tags).sort(),
    clusters.filter((c) => c.subregionId === subregionId).map((c) => ({ id: c.id, miembros: c.miembros, config: c.config, entrenado: c.entrenado, validado: c.validado })),
    osrConfig,
  ]);
}

function buildGates(subregionId: string, pkgSpecies: SpeciesEntry[], clusters: ClusterDef[]): ClusterGate[] {
  const byId = new Map(pkgSpecies.map((s) => [s.id, s]));
  return clusters
    .filter((c) => c.subregionId === subregionId && c.entrenado?.fingerprint === clusterFingerprint(c) && c.validado?.fingerprint === clusterFingerprint(c))
    .map((c) => {
      const miembros = c.miembros.map((id) => byId.get(id)).filter((s): s is SpeciesEntry => !!s);
      const r = trainAdapter(c, miembros, pkgSpecies);
      return { id: c.id, clusterId: c.clusterId, miembros: c.miembros, epsilonPropuesto: r.epsilon, erecMiembros: r.erecMiembros, intrusos: r.intrusos, erec: r.erec };
    });
}

export function compilePackage(
  subregionId: string,
  version: string,
  morphs: MorphInput,
  clusters: ClusterDef[],
  osrConfig: OsrConfig,
  compiladoPor: string
): { manifest: PackageManifest | null; rechazos: CompilerReject[] } {
  const sub = getAntioquiaSubregion(subregionId);
  const pkgSpecies = speciesForSubregion(subregionId);
  const rechazos: CompilerReject[] = [];

  if (ENCODER.dimensiones !== 512 || ENCODER.id !== "encoder_anura_fp16") {
    rechazos.push({ id: "encoder", label: "Encoder inválido", detalle: `Se esperaba encoder_anura_fp16 de 512-d (el del teléfono); hay ${ENCODER.id} de ${ENCODER.dimensiones}-d. El BioCLIP 2.5 del servidor no entra al paquete.` });
  }

  const gates = buildGates(subregionId, pkgSpecies, clusters);
  const calib = calibratePackage(subregionId);
  const ev = evaluateOsr(calib, osrConfig, gates);
  const tauEsp = new Map(ev.especies.map((e) => [e.species.id, e.tauCos]));

  const species_catalog: SpeciesJsonEntry[] = [];
  for (const sp of pkgSpecies) {
    const sheet = getSpeciesSheet(sp);
    const { wv, wg, wm } = sheet.calculado.pesos;
    if (Math.abs(wv + wg + wm - 1) > 1e-6) {
      rechazos.push({ id: "pesos", label: "Pesos que no suman 1", speciesId: sp.id, detalle: `${sp.especie}: wv+wg+wm = ${(wv + wg + wm).toFixed(3)}` });
      continue;
    }

    const centroides = getSpeciesCentroids(sp, morphs);
    const regional = centroides.regionales.find((r) => r.subregionId === subregionId);
    const morfosSub = centroides.morfos.filter((m) => m.subregionId === subregionId);
    let sub_centroids: SpeciesJsonEntry["sub_centroids"];
    if (morfosSub.length === 0) {
      sub_centroids = [{ morph_id: "global", dim: 512, vector: "… 512 floats …" }];
    } else if (morfosSub.every((m) => m.calculado)) {
      sub_centroids = morfosSub.map((m) => ({ morph_id: m.morphId, dim: 512, vector: "… 512 floats …" }));
    } else {
      rechazos.push({
        id: "morfo_unico",
        label: "Centroide único con morfos opuestos",
        speciesId: sp.id,
        detalle: `${sp.especie}: ${morfosSub.filter((m) => !m.calculado).map((m) => m.nombre).join(", ")} sin ${MIN_INDIVIDUOS_REGIONAL} individuos etiquetados — no se puede fundir con los demás morfos en un solo centroide.`,
      });
      continue;
    }

    const tau = tauEsp.get(sp.id);
    if (tau === undefined || !regional) {
      rechazos.push({ id: "sin_centroide", label: "Sin centroide o sin τ calibrado", speciesId: sp.id, detalle: `${sp.especie} no tiene centroide regional u OSR calibrado para esta subregión.` });
      continue;
    }

    species_catalog.push({
      taxon_id: sp.taxonId,
      genus_id: sp.genero,
      nombre: sp.especie,
      sub_centroids,
      rejection_tau: +tau.toFixed(4),
      tau_kind: "cosine_similarity",
      context_parameters: {
        altitude_mean_msnm: sheet.calculado.altitudMedia,
        altitude_std_dev: sheet.calculado.altitudDesviacion,
        weights: { visual: wv, geo: wg, habitat: wm },
        substrate_priors: Object.fromEntries(Object.entries(sheet.calculado.habitatPriors).map(([k, v]) => [SUBSTRATO_LABEL[k as keyof typeof SUBSTRATO_LABEL], v])),
        audio_signature_id: null,
      },
    });
  }

  if (rechazos.length > 0) return { manifest: null, rechazos };

  const genus_nodes: GenusNode[] = ev.generos.map((g) => ({ genus_id: g.id, family_id: g.familia ?? "", nombre: g.id, centroid: { dim: 512, vector: "… 512 floats …", regla: "suma L2 de los centroides de sus especies" }, rejection_tau_genus: +g.tauEfectivo.toFixed(4), tau_kind: "cosine_similarity" }));
  const family_nodes: FamilyNode[] = ev.familias.map((f) => ({ family_id: f.id, nombre_comun: f.id, centroid: { dim: 512, vector: "… 512 floats …", regla: "suma L2 de los supercentroides de sus géneros, un voto por género" }, rejection_tau_family: +f.tauEfectivo.toFixed(4), tau_kind: "cosine_similarity" }));
  const cryptic_clusters: CrypticClusterJson[] = gates.map((g) => {
    const cluster = clusters.find((c) => c.id === g.id)!;
    return {
      cluster_id: g.clusterId,
      especies: g.miembros,
      dim: 512,
      columnas: cluster.config.columnas,
      bytes: cluster.config.columnas * ENCODER.dimensiones * (cluster.config.dtype === "FP16" ? 2 : 4),
      epsilon_reconstruction: +((osrConfig.epsilonManual[g.id] ?? g.epsilonPropuesto)).toFixed(4),
    };
  });

  const manifest: PackageManifest = {
    package_metadata: {
      package_id: subregionId,
      region_name: sub ? `${sub.numero} ${sub.nombre}` : subregionId,
      version,
      last_updated: new Date().toISOString().slice(0, 10),
      embedding_dim: 512,
      quantization: "FP16",
      encoder: ENCODER.id,
    },
    family_nodes,
    genus_nodes,
    species_catalog,
    cryptic_clusters,
    provenance: {
      dataset_version: CURRENT_DATASET_VERSION,
      species_count: species_catalog.length,
      generated_by: compiladoPor,
      generated_at: new Date().toISOString(),
    },
    decision: {
      umbral_geo: osrConfig.umbralGeo,
      politica_geo: osrConfig.politicaGeo,
    },
  };

  return { manifest, rechazos: [] };
}

export function checksumOf(manifest: PackageManifest) {
  return fakeSha(JSON.stringify(manifest));
}

export function estimatedBytes(manifest: PackageManifest) {
  const centroidBytes = manifest.species_catalog.reduce((s, e) => s + e.sub_centroids.length, 0) * ENCODER.dimensiones * 2;
  const nodeBytes = (manifest.genus_nodes.length + manifest.family_nodes.length) * ENCODER.dimensiones * 2;
  const clusterBytes = manifest.cryptic_clusters.reduce((s, c) => s + c.bytes, 0);
  return centroidBytes + nodeBytes + clusterBytes;
}
