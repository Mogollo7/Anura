import { ENCODER } from "@/lib/worker/encoder";
import { MIN_FOTOS_ENTRENABLE } from "@/lib/mock/curation";
import { TOPE_DEFAULT } from "@/lib/packages/constants";
import { getAntioquiaSubregion } from "@/lib/packages/antioquia-subregiones";
import type { Substrato } from "@/lib/mock/curation";

/**
 * Alta de una especie hecha por una persona (Entradas y Ficha de Especie).
 * Los números que se muestran después salen de estos campos, no de otra tabla.
 * El encoder del paquete es BioCLIP 1. BioCLIP 2.5 no entra: es de 1024 y no es el del teléfono.
 */
export type SpeciesIntake = {
  id: string;
  familia: string;
  genero: string;
  epiteto: string;
  nombreComun: string;
  fotos: number;
  descartadas: number;
  fuente: "inaturalist" | "gbif" | "campo";
  altitudMin: number;
  altitudMax: number;
  subregionId: string;
  sustrato: Record<Substrato, number>;
  wv: number;
  wg: number;
  wm: number;
  morfos: string[];
  /** La persona cerró el resultado. Si lo repite, vuelve a limpiar. */
  cerrado: boolean;
  actualizado: string;
};

export type EtapaIntake = "conseguir" | "limpiar" | "procesar" | "resultado";

export type IntakeCheck = { ok: boolean; label: string };

export function especieNombre(s: Pick<SpeciesIntake, "genero" | "epiteto">) {
  return `${s.genero.trim()} ${s.epiteto.trim()}`.replace(/\s+/g, " ").trim();
}

export function intakeId(s: Pick<SpeciesIntake, "genero" | "epiteto">) {
  return especieNombre(s).toLowerCase().replace(/\s+/g, "-");
}

/** Misma regla que el worker: fotos que quedan después de limpiar, con el tope por especie. */
export function vectoresDeIntake(s: Pick<SpeciesIntake, "fotos" | "descartadas">) {
  const activas = Math.max(0, s.fotos - s.descartadas);
  return { activas, vectores: Math.min(activas, TOPE_DEFAULT) };
}

export function auditarIntake(s: SpeciesIntake): {
  fotosActivas: number;
  vectores: number;
  checks: IntakeCheck[];
  etapa: EtapaIntake;
  entrenable: boolean;
} {
  const { activas, vectores } = vectoresDeIntake(s);
  const pesos = s.wv + s.wg + s.wm;
  const pesosOk = Math.abs(pesos - 1) <= 0.001;
  const priors = Object.values(s.sustrato);
  const priorsOk = priors.length === 4 && priors.every((v) => v >= 0.01 && v <= 1);
  const sub = getAntioquiaSubregion(s.subregionId);
  const cotaOk = !!sub && s.altitudMin <= sub.cotaMax && s.altitudMax >= sub.cotaMin && s.altitudMin < s.altitudMax;
  const fotosOk = activas >= MIN_FOTOS_ENTRENABLE;
  const checks: IntakeCheck[] = [
    { ok: fotosOk, label: `${activas} fotos activas de ${s.fotos} cargadas (mínimo ${MIN_FOTOS_ENTRENABLE})` },
    { ok: cotaOk, label: sub ? `Altitud ${s.altitudMin}–${s.altitudMax} m solapa ${sub.nombre} (${sub.cotaMin}–${sub.cotaMax} m)` : "Falta la región" },
    { ok: pesosOk, label: `Pesos wv+wg+wm = ${pesos.toFixed(2)}` },
    { ok: priorsOk, label: "Priors de sustrato entre 0,01 y 1" },
    { ok: true, label: `${ENCODER.id} · ${ENCODER.dimensiones} dimensiones · BioCLIP 2.5 no entra al paquete` },
  ];
  const baseOk = checks.every((c) => c.ok);
  const etapa: EtapaIntake = !fotosOk || !cotaOk ? "conseguir" : !pesosOk || !priorsOk ? "limpiar" : s.cerrado ? "resultado" : "procesar";
  return { fotosActivas: activas, vectores, checks, etapa, entrenable: baseOk };
}
