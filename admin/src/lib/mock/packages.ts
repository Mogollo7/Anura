import { getDevices } from "./devices";
import { getDepartamento, type BiogeoZone } from "@/lib/packages/departamentos";

export type PipelineStage =
  | "borrador"
  | "edicion"
  | "validacion"
  | "pruebas"
  | "revision"
  | "programado"
  | "publicado";

export const PIPELINE_STAGES: { id: PipelineStage; label: string }[] = [
  { id: "borrador", label: "Borrador" },
  { id: "edicion", label: "Edición" },
  { id: "validacion", label: "Validación" },
  { id: "pruebas", label: "Pruebas" },
  { id: "revision", label: "Revisión" },
  { id: "programado", label: "Programado" },
  { id: "publicado", label: "Publicado" },
];

export const REVIEW_STAGES: PipelineStage[] = ["validacion", "pruebas", "revision"];

export type PackageVersion = {
  version: string;
  stage: PipelineStage;
  vigente: boolean; // la versión publicada que hoy descargan los celulares
  fecha: string;
  especies: number;
  vectores: number;
  changelog: string;
  issue?: string;
};

export type MobilePackage = {
  id: string;
  nombre: string;
  departamentoId: string;
  versions: PackageVersion[]; // de la más antigua a la más reciente
};

export type PackageSummary = MobilePackage & {
  latest: PackageVersion;
  live: PackageVersion | null;
  fileName: string;
  sizeMb: number;
  installs: number;
  zonas: BiogeoZone[];
};

const PACKAGES: MobilePackage[] = [
  {
    id: "antioquia",
    nombre: "Antioquia",
    departamentoId: "antioquia",
    versions: [
      { version: "1.0.0", stage: "publicado", vigente: false, fecha: "2026-06-02", especies: 18, vectores: 2210, changelog: "Primer paquete piloto (29 especies del scrape inicial, 18 habilitadas)" },
      { version: "2.0.0", stage: "publicado", vigente: false, fecha: "2026-08-14", especies: 26, vectores: 3380, changelog: "Identidad por taxon_id; set de referencia balanceado por individuo" },
      { version: "2.3.1", stage: "publicado", vigente: true, fecha: "2026-09-13", especies: 30, vectores: 4034, changelog: "Zonas biogeográficas v1 (4 zonas); 30 taxones habilitados visualmente" },
      { version: "2.4.0", stage: "validacion", vigente: false, fecha: "2026-09-24", especies: 41, vectores: 4410, changelog: "Centroides Grupo A (9) + Grupo B (32); open set por Mahalanobis", issue: "3 especies con centroides fuera de rango en la matriz de confusión" },
    ],
  },
  {
    id: "valle-del-cauca",
    nombre: "Valle del Cauca",
    departamentoId: "valle-del-cauca",
    versions: [
      { version: "0.9.0", stage: "publicado", vigente: false, fecha: "2026-07-20", especies: 11, vectores: 980, changelog: "Versión beta" },
      { version: "1.0.0", stage: "publicado", vigente: false, fecha: "2026-08-22", especies: 14, vectores: 1260, changelog: "Primera versión estable" },
      { version: "1.1.0", stage: "publicado", vigente: true, fecha: "2026-09-10", especies: 16, vectores: 1415, changelog: "Tope por individuo aplicado al set de referencia" },
    ],
  },
  {
    id: "cauca",
    nombre: "Cauca",
    departamentoId: "cauca",
    versions: [
      { version: "0.9.0", stage: "publicado", vigente: false, fecha: "2026-08-01", especies: 9, vectores: 720, changelog: "Versión beta" },
      { version: "1.0.0", stage: "publicado", vigente: true, fecha: "2026-09-05", especies: 12, vectores: 1030, changelog: "Primera versión estable" },
    ],
  },
  {
    id: "choco",
    nombre: "Chocó",
    departamentoId: "choco",
    versions: [
      { version: "0.9.0", stage: "publicado", vigente: true, fecha: "2026-09-02", especies: 13, vectores: 1120, changelog: "Versión beta (386 registros de base)" },
      { version: "1.0.0", stage: "revision", vigente: false, fecha: "2026-09-23", especies: 17, vectores: 1490, changelog: "Primera versión estable" },
    ],
  },
  {
    id: "cundinamarca",
    nombre: "Cundinamarca",
    departamentoId: "cundinamarca",
    versions: [
      { version: "0.1.0", stage: "revision", vigente: false, fecha: "2026-09-21", especies: 15, vectores: 1340, changelog: "Primer paquete (1.234 registros de base)" },
    ],
  },
  {
    id: "risaralda",
    nombre: "Risaralda",
    departamentoId: "risaralda",
    versions: [
      { version: "0.1.0", stage: "borrador", vigente: false, fecha: "2026-09-18", especies: 8, vectores: 0, changelog: "Borrador inicial" },
    ],
  },
  {
    id: "caldas",
    nombre: "Caldas",
    departamentoId: "caldas",
    versions: [
      { version: "0.2.0", stage: "edicion", vigente: false, fecha: "2026-09-22", especies: 10, vectores: 860, changelog: "Ajuste de cobertura y especies" },
    ],
  },
];

/** Tamaño del .sqlite: vectores float32 de 512-D + metadatos y ocurrencias. */
export function estimateSqliteMb(vectores: number, especies: number) {
  const vectorBytes = vectores * 512 * 4;
  const metadataBytes = 350_000 + especies * 28_000;
  return Math.round(((vectorBytes + metadataBytes) / 1_048_576) * 10) / 10;
}

export function getPackages(): PackageSummary[] {
  const devices = getDevices();

  return PACKAGES.map((pkg) => {
    const latest = pkg.versions[pkg.versions.length - 1];
    const live = pkg.versions.find((v) => v.vigente) ?? null;
    const ref = live ?? latest;
    const major = ref.version.split(".")[0];

    return {
      ...pkg,
      latest,
      live,
      fileName: `${pkg.id.replace(/-/g, "_")}_v${major}.sqlite`,
      sizeMb: estimateSqliteMb(ref.vectores, ref.especies),
      installs: devices.filter((d) =>
        d.installedPackages.some((p) => p.startsWith(`${pkg.nombre} v`))
      ).length,
      zonas: getDepartamento(pkg.departamentoId)?.zonas ?? [],
    };
  });
}

export function getPackage(id: string) {
  return getPackages().find((p) => p.id === id);
}

export function getPackageVersionStats() {
  const versions = PACKAGES.flatMap((p) => p.versions);
  return {
    total: versions.length,
    publicados: versions.filter((v) => v.stage === "publicado").length,
    enRevision: versions.filter((v) => REVIEW_STAGES.includes(v.stage)).length,
  };
}

/** Versión vigente y tamaño por nombre de paquete, para las reglas de salud de dispositivos. */
export function getLivePackages(): Record<string, { version: string; sizeMb: number }> {
  const out: Record<string, { version: string; sizeMb: number }> = {};
  for (const p of getPackages()) {
    if (p.live) out[p.nombre] = { version: p.live.version, sizeMb: p.sizeMb };
  }
  return out;
}
