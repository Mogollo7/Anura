"use client";

import { createLocalStore } from "@/lib/storage/local-store";
import type { SheetOverride, SheetOverrides } from "@/lib/mock/species-sheet";

/**
 * Correcciones de la ficha por especie (exclusiones, rango de altitud, pesos,
 * LRC). Sobreviven a recargar y las leen OSR, validación, compilador y
 * laboratorio. En el navegador, como morfos y clústeres, hasta que haya backend.
 */
const store = createLocalStore<{ fichas: SheetOverrides }>("anura-admin:fichas:v1", { fichas: {} });

export function useSheetStore() {
  const { fichas } = store.useStore();
  return {
    fichas,
    get(speciesId: string): SheetOverride {
      return fichas[speciesId] ?? {};
    },
    patch(speciesId: string, patch: Partial<SheetOverride>) {
      const cur = store.read().fichas;
      store.write({ fichas: { ...cur, [speciesId]: { ...(cur[speciesId] ?? {}), ...patch } } });
    },
  };
}
