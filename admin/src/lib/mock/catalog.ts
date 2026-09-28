import { realSpecies, REAL_SPECIES, slug } from "@/lib/data/real";

export type SpeciesEntry = {
  id: string;
  taxonId: string; // identidad estable COL_ANURA_XXXX — el nombre científico es metadato
  familia: string;
  genero: string;
  especie: string; // binomial completo
  epiteto: string;
  lowData: boolean; // < 70 individuos en el dataset — cola larga taxonómica
  orphanGenus: boolean; // único representante del género en el catálogo
  enPaquete: boolean; // VISUAL_ENABLED: viaja en el paquete; en revisión queda fuera
};

export type FamilyNode = {
  familia: string;
  generos: { genero: string; especies: SpeciesEntry[] }[];
};

// Especies REALES del catálogo de Antioquia (estado visual habilitado o en revisión),
// exportadas de los datos del proyecto: ver lib/data/real.ts. El orden y los ids
// estables (COL_ANURA_XXXX) son los del catálogo, no un contador local.
export function getCatalogTree(): FamilyNode[] {
  const familias = new Map<string, Map<string, SpeciesEntry[]>>();
  for (const r of REAL_SPECIES) {
    const generos = familias.get(r.familia) ?? new Map<string, SpeciesEntry[]>();
    familias.set(r.familia, generos);
    const lista = generos.get(r.genero) ?? [];
    generos.set(r.genero, lista);
    lista.push({
      id: slug(r.especie),
      taxonId: r.taxonId,
      familia: r.familia,
      genero: r.genero,
      especie: r.especie,
      epiteto: r.epiteto,
      lowData: r.individuosCurados < 70,
      orphanGenus: false,
      enPaquete: r.estadoVisual === "VISUAL_ENABLED",
    });
  }
  const arbol = [...familias].map(([familia, generos]) => ({
    familia,
    generos: [...generos].map(([genero, especies]) => ({ genero, especies })),
  }));
  // Huérfano: único representante de su género en el catálogo y sin congéneres en su familia.
  for (const f of arbol) for (const g of f.generos) for (const e of g.especies) e.orphanGenus = g.especies.length === 1 && f.generos.length === 1;
  return arbol;
}

export function getAllSpecies(): SpeciesEntry[] {
  return getCatalogTree().flatMap((f) => f.generos.flatMap((g) => g.especies));
}

export type SpeciesDetail = {
  distribucion: string[];
  /** Percentiles 5–95 de la altitud real de sus registros en Antioquia (no min/max: un GPS malo no estira el rango). */
  altitudMin: number;
  altitudMax: number;
  /** LRC en mm. No hay medición real todavía (llega con CVAT, Fase 2): null, nunca un número inventado. */
  svlMin: number | null;
  svlMax: number | null;
  patron: string | null;
  iNaturalistObs: number;
  gbifRecords: number;
};

export function getSpeciesDetail(id: string): SpeciesDetail {
  const r = realSpecies(id);
  const alt = r?.altitud;
  return {
    distribucion: r && Object.keys(r.subregiones).length ? ["Antioquia"] : [],
    altitudMin: alt?.p05 ?? 0,
    altitudMax: alt?.p95 ?? 0,
    svlMin: null,
    svlMax: null,
    patron: null,
    iNaturalistObs: r?.registros.inaturalist ?? 0,
    gbifRecords: r?.registros.gbif ?? 0,
  };
}
