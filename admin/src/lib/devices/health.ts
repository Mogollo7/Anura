import type { MockDevice } from "@/lib/mock/devices";
import { ENCODER } from "@/lib/worker/encoder";

/**
 * Reglas de salud de un dispositivo ANURA Mobile. Son funciones puras para
 * poder recalcularlas en el cliente después de una acción (enviar
 * actualización, forzar sync…) y, más adelante, contra telemetría real.
 */

/** minSdk del proyecto anura-android. */
export const MIN_API_LEVEL = 26;
/** Versiones anteriores no entienden taxon_id / centroides Grupo A+B. */
export const MIN_APP_VERSION = "1.0.0";
/** Image Encoder BioCLIP ONNX FP16 empaquetado en la app (medido, DECISION_LOG). */
export const MODEL_SIZE_MB = ENCODER.onnxMb;
/** Criterio provisional: por debajo, la inferencia on-device es inestable. */
export const MIN_RAM_GB_FOR_AI = 3;
/** Margen para fotos, audio y borradores de observación. */
export const STORAGE_MARGIN_MB = 200;

export type IssueLevel = "error" | "warning";
export type DeviceIssue = { level: IssueLevel; code: string; text: string };

/** nombre de paquete → versión vigente y tamaño del .sqlite (MB) */
export type LivePackages = Record<string, { version: string; sizeMb: number }>;

export function parsePackage(entry: string) {
  const idx = entry.lastIndexOf(" v");
  return { name: entry.slice(0, idx), version: entry.slice(idx + 2) };
}

export function versionLt(a: string, b: string) {
  const pa = a.replace(/-.*/, "").split(".").map(Number);
  const pb = b.replace(/-.*/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0);
  }
  return a.includes("-") && !b.includes("-");
}

export function outdatedPackages(device: MockDevice, live: LivePackages) {
  return device.installedPackages
    .map(parsePackage)
    .filter((p) => live[p.name] && live[p.name].version !== p.version)
    .map((p) => ({ ...p, liveVersion: live[p.name].version }));
}

/** Espacio que necesita el dispositivo para tener al día sus paquetes. */
export function storageNeededMb(device: MockDevice, live: LivePackages) {
  const pending = outdatedPackages(device, live).reduce((s, p) => s + (live[p.name]?.sizeMb ?? 0), 0);
  return Math.ceil(pending) + STORAGE_MARGIN_MB;
}

export function getDeviceIssues(device: MockDevice, live: LivePackages): DeviceIssue[] {
  const issues: DeviceIssue[] = [];

  if (device.bloqueo) {
    issues.push({ level: "error", code: "bloqueado", text: `Bloqueado: ${device.bloqueo.motivo}` });
  }
  if (device.apiLevel < MIN_API_LEVEL) {
    issues.push({ level: "error", code: "api", text: `Android ${device.androidVersion} no soportado (mínimo 8.0)` });
  }
  if (versionLt(device.appVersion, MIN_APP_VERSION)) {
    issues.push({ level: "error", code: "app", text: `ANURA v${device.appVersion} por debajo de la mínima (${MIN_APP_VERSION}): no lee taxon_id ni centroides A/B` });
  }
  if (device.syncStatus === "error" && !device.bloqueo) {
    issues.push({ level: "error", code: "sync", text: "Última sincronización falló" });
  }
  if (device.ramGb < MIN_RAM_GB_FOR_AI) {
    issues.push({ level: "warning", code: "ram", text: `${device.ramGb} GB de RAM: IA en el dispositivo desactivada, identifica solo con red` });
  }
  const outdated = outdatedPackages(device, live);
  for (const p of outdated) {
    issues.push({ level: "warning", code: "paquete", text: `${p.name} v${p.version} desactualizado (vigente v${p.liveVersion})` });
  }
  const needed = storageNeededMb(device, live);
  if (device.storageFreeMb < needed) {
    issues.push({ level: outdated.length ? "error" : "warning", code: "espacio", text: `${device.storageFreeMb} MB libres; necesita ~${needed} MB` });
  }
  if (device.pendingUploads >= 8) {
    issues.push({ level: "warning", code: "cola", text: `${device.pendingUploads} observaciones sin subir` });
  }
  return issues;
}

/** Fecha de referencia de todos los mocks ("hoy" para el panel). */
export const MOCK_TODAY = "2026-09-25";
