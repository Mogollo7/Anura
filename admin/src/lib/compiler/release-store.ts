"use client";

import { createLocalStore } from "@/lib/storage/local-store";
import type { PackageManifest } from "./compile";

/**
 * Releases por subregión (19_ADMIN fase 13, Worker Releases y Sandbox):
 * DRAFT → VALIDATING → READY → APPROVED → PUBLISHED, y ROLLED_BACK. Sin
 * publicación automática — cada flecha la mueve una persona con su permiso.
 * Vive en el navegador, igual que morfos/clústeres/OSR, hasta que haya
 * backend real para el compilador.
 */
export type ReleaseEstado = "VALIDATING" | "READY" | "APPROVED" | "PUBLISHED" | "ROLLED_BACK";

export type Release = {
  id: string;
  subregionId: string;
  version: string;
  estado: ReleaseEstado;
  manifest: PackageManifest;
  checksum: string;
  fingerprint: string;
  compiladoPor: string;
  compiladoEn: string;
  cientifico: { por: string; fecha: string } | null;
  tecnico: { por: string; fecha: string } | null;
  publicadoEn: string | null;
  publicadoPor: string | null;
  revertidoEn: string | null;
};

type ReleaseStoreState = { releases: Release[] };

const store = createLocalStore<ReleaseStoreState>("anura-admin:releases:v1", { releases: [] });

/** Todos los releases de todas las subregiones. El simulador (F24) solo consume los PUBLISHED. */
export function useAllReleases() {
  return store.useStore().releases;
}

export function useReleaseStore(subregionId: string) {
  const state = store.useStore();
  const releases = state.releases.filter((r) => r.subregionId === subregionId).sort((a, b) => b.compiladoEn.localeCompare(a.compiladoEn));
  const vigente = releases.find((r) => r.estado === "PUBLISHED") ?? null;

  function write(next: Release[]) {
    const cur = store.read();
    store.write({ releases: [...cur.releases.filter((r) => r.subregionId !== subregionId), ...next] });
  }

  return {
    releases,
    vigente,
    generar(manifest: PackageManifest, checksum: string, fingerprint: string, version: string, por: string) {
      const id = `${subregionId}-${version}`;
      const otros = releases.filter((r) => r.id !== id);
      write([
        ...otros,
        {
          id,
          subregionId,
          version,
          estado: "VALIDATING",
          manifest,
          checksum,
          fingerprint,
          compiladoPor: por,
          compiladoEn: new Date().toISOString(),
          cientifico: null,
          tecnico: null,
          publicadoEn: null,
          publicadoPor: null,
          revertidoEn: null,
        },
      ]);
      return id;
    },
    avalarCientifico(id: string, por: string) {
      write(releases.map((r) => (r.id === id && r.estado === "VALIDATING" ? { ...r, estado: "READY", cientifico: { por, fecha: new Date().toISOString().slice(0, 10) } } : r)));
    },
    avalarTecnico(id: string, por: string) {
      write(releases.map((r) => (r.id === id && r.estado === "READY" ? { ...r, estado: "APPROVED", tecnico: { por, fecha: new Date().toISOString().slice(0, 10) } } : r)));
    },
    publicar(id: string, por: string) {
      write(
        releases.map((r) => {
          if (r.id === id && r.estado === "APPROVED") return { ...r, estado: "PUBLISHED" as const, publicadoEn: new Date().toISOString(), publicadoPor: por };
          if (r.estado === "PUBLISHED" && r.id !== id) return { ...r, estado: "ROLLED_BACK" as const, revertidoEn: new Date().toISOString() };
          return r;
        })
      );
    },
    revertir(id: string) {
      const target = releases.find((r) => r.id === id);
      if (!target || target.estado !== "PUBLISHED") return;
      const anterior = releases
        .filter((r) => r.id !== id && (r.estado === "ROLLED_BACK" || r.estado === "PUBLISHED"))
        .sort((a, b) => (b.publicadoEn ?? "").localeCompare(a.publicadoEn ?? ""))[0];
      write(
        releases.map((r) => {
          if (r.id === id) return { ...r, estado: "ROLLED_BACK" as const, revertidoEn: new Date().toISOString() };
          if (anterior && r.id === anterior.id) return { ...r, estado: "PUBLISHED" as const, publicadoEn: new Date().toISOString() };
          return r;
        })
      );
    },
  };
}
