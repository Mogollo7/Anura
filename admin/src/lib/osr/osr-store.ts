"use client";

import { createLocalStore } from "@/lib/storage/local-store";
import { DEFAULT_OSR_CONFIG, type OsrConfig } from "./osr";

/**
 * Ajustes y validación del OSR por subregión (un paquete = una calibración).
 * Lo que no esté aquí es lo que propuso el worker. Vive en el navegador,
 * igual que morfos y clústeres, hasta que haya backend.
 */
type Validacion = { fingerprint: string; por: string; fecha: string };
type OsrState = { configs: Record<string, Partial<OsrConfig>>; validaciones: Record<string, Validacion> };

const store = createLocalStore<OsrState>("anura-admin:osr:v1", { configs: {}, validaciones: {} });

export function useOsrStore(subregionId: string) {
  const state = store.useStore();
  const manual = state.configs[subregionId] ?? {};
  const config: OsrConfig = { ...DEFAULT_OSR_CONFIG, ...manual };

  function write(nextManual: Partial<OsrConfig>) {
    const cur = store.read();
    store.write({ ...cur, configs: { ...cur.configs, [subregionId]: nextManual } });
  }

  return {
    config,
    manual,
    validacion: state.validaciones[subregionId] ?? null,
    set<K extends keyof OsrConfig>(key: K, value: OsrConfig[K]) {
      write({ ...manual, [key]: value });
    },
    reset(key: keyof OsrConfig) {
      const next = { ...manual };
      delete next[key];
      write(next);
    },
    setMapEntry(key: "tauGeneroManual" | "tauFamiliaManual" | "epsilonManual", id: string, value: number | null) {
      const map = { ...config[key] };
      if (value === null) delete map[id];
      else map[id] = value;
      write({ ...manual, [key]: map });
    },
    validar(fingerprint: string, por: string) {
      const cur = store.read();
      store.write({
        ...cur,
        validaciones: { ...cur.validaciones, [subregionId]: { fingerprint, por, fecha: new Date().toISOString().slice(0, 10) } },
      });
    },
  };
}
