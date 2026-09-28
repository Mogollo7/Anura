"use client";

import { createLocalStore } from "@/lib/storage/local-store";
import { intakeId, type SpeciesIntake } from "./intake";

const store = createLocalStore<{ especies: SpeciesIntake[] }>("anura-admin:especies:v1", { especies: [] });

export function useIntakeStore() {
  const { especies } = store.useStore();

  function write(next: SpeciesIntake[]) {
    store.write({ especies: next });
  }

  return {
    especies,
    guardar(input: Omit<SpeciesIntake, "id" | "actualizado" | "cerrado"> & { id?: string }) {
      const cur = store.read().especies;
      const id = input.id ?? intakeId(input);
      const prev = cur.find((s) => s.id === id);
      const next: SpeciesIntake = {
        ...input,
        id,
        cerrado: prev?.cerrado ?? false,
        actualizado: new Date().toISOString(),
      };
      write([next, ...cur.filter((s) => s.id !== id)]);
      return id;
    },
    cerrar(id: string) {
      write(store.read().especies.map((s) => (s.id === id ? { ...s, cerrado: true, actualizado: new Date().toISOString() } : s)));
    },
    /** El resultado no sirvió: se abre de nuevo en limpieza, sin borrar las fotos. */
    repetir(id: string) {
      write(store.read().especies.map((s) => (s.id === id ? { ...s, cerrado: false, actualizado: new Date().toISOString() } : s)));
    },
    quitar(id: string) {
      write(store.read().especies.filter((s) => s.id !== id));
    },
  };
}
