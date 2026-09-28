"use client";

import { createLocalStore } from "@/lib/storage/local-store";

/**
 * Morfos declarados por el herpetólogo (Ficha de especie) y la etiqueta de
 * morfo de cada individuo (Curación). Centroides lee los dos.
 */
export type MorphDecl = { id: string; speciesId: string; subregion: string; nombre: string; nota: string };
export type MorphStore = { declarations: MorphDecl[]; tags: Record<string, string> };

const store = createLocalStore<MorphStore>("anura-admin:morfos:v1", { declarations: [], tags: {} });

export function useMorphStore() {
  const value = store.useStore();

  return {
    store: value,
    declare(decl: Omit<MorphDecl, "id">) {
      const cur = store.read();
      store.write({ ...cur, declarations: [...cur.declarations, { ...decl, id: `morfo-${Date.now()}` }] });
    },
    remove(id: string) {
      const cur = store.read();
      const tags = Object.fromEntries(Object.entries(cur.tags).filter(([, m]) => m !== id));
      store.write({ declarations: cur.declarations.filter((d) => d.id !== id), tags });
    },
    tag(individualId: string, morphId: string | null) {
      const cur = store.read();
      const tags = { ...cur.tags };
      if (morphId) tags[individualId] = morphId;
      else delete tags[individualId];
      store.write({ ...cur, tags });
    },
  };
}
