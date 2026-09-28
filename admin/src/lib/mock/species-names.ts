import { getAllSpecies } from "./catalog";

export const SPECIES_BY_ID = new Map(getAllSpecies().map((s) => [s.id, s]));

export function speciesName(id: string) {
  return SPECIES_BY_ID.get(id)?.especie ?? id;
}
