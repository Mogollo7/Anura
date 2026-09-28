"use client";

import { createLocalStore } from "@/lib/storage/local-store";
import type { ClusterDef } from "./adapters";

const store = createLocalStore<{ clusters: ClusterDef[] }>("anura-admin:clusters:v1", { clusters: [] });

export function useClusterStore() {
  const { clusters } = store.useStore();
  const update = (id: string, patch: Partial<ClusterDef>) =>
    store.write({ clusters: store.read().clusters.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

  return {
    clusters,
    create(def: Omit<ClusterDef, "id">) {
      const id = `cluster-${Date.now()}`;
      store.write({ clusters: [...store.read().clusters, { ...def, id }] });
      return id;
    },
    update,
    remove(id: string) {
      store.write({ clusters: store.read().clusters.filter((c) => c.id !== id) });
    },
  };
}
