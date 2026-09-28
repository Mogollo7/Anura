import { getAllSpecies } from "@/lib/mock/catalog";
import { getDepartamento } from "./departamentos";

/** Versión de un release: mayor.menor.parche. */
export const SEMVER = /^\d+\.\d+\.\d+$/;

/** Vectores por especie que el worker procesa como máximo (round-robin por individuo). */
export const TOPE_DEFAULT = 120;

/**
 * Especies que el paquete de un departamento puede llevar. Solo Antioquia tiene datos
 * reales exportados: sus especies con estado visual habilitado. Los demás departamentos
 * no tienen catálogo cargado todavía y devuelven una lista vacía, no una inventada.
 */
export function suggestedSpecies(departamentoId: string) {
  const dep = getDepartamento(departamentoId);
  if (dep?.id !== "antioquia") return [];
  return getAllSpecies().filter((s) => s.enPaquete).map((s) => s.id);
}
