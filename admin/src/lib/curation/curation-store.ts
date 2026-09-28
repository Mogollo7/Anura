"use client";

import { createLocalStore } from "@/lib/storage/local-store";
import type { LifeStage } from "@/lib/mock/curation";

/**
 * Decisiones de curación manual (F13): fotos excluidas, observaciones
 * invalidadas con motivo, estadio corregido e historial con quién lo hizo.
 * Antes eran estado de la pantalla y se perdían al recargar. El material
 * original nunca se borra: esto es la membresía, no los archivos.
 */
export type CurationLogEntry = { id: string; fecha: string; action: string; actor: string; motivo: string };

export type CurationState = {
  excludedPhotos: string[];
  invalidated: Record<string, string>;
  estadios: Record<string, LifeStage>;
  log: CurationLogEntry[];
};

const store = createLocalStore<CurationState>("anura-admin:curacion:v1", { excludedPhotos: [], invalidated: {}, estadios: {}, log: [] });

export function useCurationStore() {
  const state = store.useStore();
  const push = (cur: CurationState, entry: Omit<CurationLogEntry, "id" | "fecha">): CurationLogEntry[] => [
    { id: `log-${Date.now()}-${cur.log.length}`, fecha: new Date().toISOString().slice(0, 16).replace("T", " "), ...entry },
    ...cur.log,
  ];
  return {
    state,
    excludePhoto(photoId: string, actor: string) {
      const cur = store.read();
      if (cur.excludedPhotos.includes(photoId)) return;
      store.write({ ...cur, excludedPhotos: [...cur.excludedPhotos, photoId], log: push(cur, { action: `Foto excluida: ${photoId}`, actor, motivo: "Descartada manualmente de la muestra activa" }) });
    },
    restorePhoto(photoId: string, actor: string) {
      const cur = store.read();
      store.write({ ...cur, excludedPhotos: cur.excludedPhotos.filter((p) => p !== photoId), log: push(cur, { action: `Foto reincluida: ${photoId}`, actor, motivo: "Revertida la exclusión manual" }) });
    },
    invalidate(observationId: string, motivo: string, actor: string) {
      const cur = store.read();
      store.write({ ...cur, invalidated: { ...cur.invalidated, [observationId]: motivo }, log: push(cur, { action: `Observación invalidada: ${observationId}`, actor, motivo }) });
    },
    setEstadio(individualId: string, estadio: LifeStage, label: string, actor: string) {
      const cur = store.read();
      store.write({ ...cur, estadios: { ...cur.estadios, [individualId]: estadio }, log: push(cur, { action: `Estadio corregido: ${individualId} → ${label}`, actor, motivo: "Revisión manual de estadio de vida" }) });
    },
    logMorph(individualId: string, nombre: string, actor: string) {
      const cur = store.read();
      store.write({ ...cur, log: push(cur, { action: `Morfo asignado: ${individualId} → ${nombre}`, actor, motivo: "Etiqueta de morfo declarada en la ficha" }) });
    },
  };
}

/** Fotos de la muestra de una especie que la curación manual sacó (excluidas o de una observación invalidada). */
export function manualExclusionsFor(state: CurationState, photos: { id: string; observationId: string }[]) {
  const ex = new Set(state.excludedPhotos);
  return photos.filter((p) => ex.has(p.id) || state.invalidated[p.observationId]).length;
}
