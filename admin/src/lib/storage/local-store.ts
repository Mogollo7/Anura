"use client";

import { useSyncExternalStore } from "react";

/**
 * Estado del admin que debe sobrevivir a recargas y verse igual en varias
 * pantallas mientras no exista backend (morfos, cuentas del panel,
 * clústeres). Vive en el navegador de cada persona: no se comparte.
 * Si el almacenamiento falla, el cambio dura hasta recargar.
 */
export function createLocalStore<T>(key: string, empty: T) {
  const listeners = new Set<() => void>();
  let cacheRaw: string | null | undefined;
  let cacheValue: T = empty;

  function read(): T {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      return cacheValue;
    }
    if (raw === cacheRaw) return cacheValue;
    cacheRaw = raw;
    try {
      cacheValue = raw ? { ...empty, ...(JSON.parse(raw) as T) } : empty;
    } catch {
      cacheValue = empty;
    }
    return cacheValue;
  }

  function write(next: T) {
    const raw = JSON.stringify(next);
    try {
      window.localStorage.setItem(key, raw);
    } catch {
      // sin almacenamiento disponible
    }
    cacheRaw = raw;
    cacheValue = next;
    listeners.forEach((l) => l());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => e.key === key && listener();
    window.addEventListener("storage", onStorage);
    // Tras hidratar, React se queda con la instantánea del servidor: forzar una lectura real.
    queueMicrotask(listener);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  function useStore(): T {
    return useSyncExternalStore(subscribe, read, () => empty);
  }

  return { useStore, read, write };
}
