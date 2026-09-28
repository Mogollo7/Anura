"use client";

import { createLocalStore } from "@/lib/storage/local-store";
import { planJob, type JobPlan, type JobSpec } from "./jobs";

/**
 * Jobs lanzados desde /ia. Se guarda solo la especificación: el plan (etapas,
 * logs, artefactos) se vuelve a derivar de forma determinista con `planJob`,
 * igual que el job semilla. Antes se perdían al recargar y ninguna otra
 * pantalla los veía.
 */
const store = createLocalStore<{ specs: JobSpec[] }>("anura-admin:jobs:v1", { specs: [] });

export function useJobStore(seed: JobPlan[]) {
  const { specs } = store.useStore();
  const lanzados = specs.map(planJob);
  return {
    jobs: [...lanzados, ...seed],
    lanzados,
    add(spec: JobSpec) {
      store.write({ specs: [spec, ...store.read().specs] });
    },
  };
}
