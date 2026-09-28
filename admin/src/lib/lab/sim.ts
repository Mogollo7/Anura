import type { PipelineStage } from "@/lib/mock/packages";
import { MIN_APP_VERSION, STORAGE_MARGIN_MB, versionLt } from "@/lib/devices/health";

/**
 * Lógica del Laboratorio ANURA Mobile. Todo es determinista: los resultados
 * dependen del perfil del dispositivo y de las fallas que se inyecten, nunca
 * del azar, para que un escenario se pueda repetir igual.
 */

export type Network = "wifi" | "movil" | "lenta" | "intermitente" | "offline";

export const NETWORK_LABEL: Record<Network, string> = {
  wifi: "Wi-Fi",
  movil: "Datos móviles 4G",
  lenta: "Señal débil (EDGE)",
  intermitente: "Intermitente",
  offline: "Sin conexión",
};

/** MB/s simulados (comprimidos para que una descarga dure segundos, no minutos). */
export const NETWORK_SPEED: Record<Network, number> = {
  wifi: 6,
  movil: 3,
  lenta: 0.8,
  intermitente: 2,
  offline: 0,
};

export type Faults = {
  checksum: boolean;
  timeout: boolean;
  conflicto: boolean;
  servidor500: boolean;
};

export const FAULT_LABEL: Record<keyof Faults, { label: string; text: string }> = {
  checksum: { label: "Paquete corrupto", text: "El SHA-256 del .sqlite descargado no coincide." },
  timeout: { label: "Timeout de descarga", text: "La conexión se corta al 60 % de la descarga." },
  conflicto: { label: "Observación duplicada", text: "El servidor responde 409: ya existe una con el mismo hash." },
  servidor500: { label: "Servidor caído", text: "El endpoint de sync responde 500 a todo." },
};

export type LabPackage = { name: string; version: string; stage: PipelineStage };

export type LabDevice = {
  model: string;
  apiLevel: number;
  ramGb: number;
  appVersion: string;
  storageFreeMb: number;
  installed: LabPackage[];
};

export type PackageOption = LabPackage & { sizeMb: number; vectores: number; especies: number };

export type Precheck = { ok: boolean; level: "error" | "warning" | "info"; text: string };

export function downloadPrechecks(device: LabDevice, pkg: PackageOption, network: Network, cellularAllowed: boolean): Precheck[] {
  const out: Precheck[] = [];
  if (pkg.vectores === 0) {
    out.push({ ok: false, level: "error", text: "Esta versión aún no tiene .sqlite generado (sin vectores)." });
  }
  if (pkg.stage !== "publicado") {
    out.push({ ok: true, level: "info", text: `Versión en etapa "${pkg.stage}": solo se puede instalar en el sandbox.` });
  }
  if (Number(pkg.version.split(".")[0]) >= 2 && versionLt(device.appVersion, MIN_APP_VERSION)) {
    out.push({ ok: false, level: "error", text: `Los paquetes v2+ usan taxon_id y centroides A/B: requieren ANURA ≥ ${MIN_APP_VERSION}.` });
  }
  const current = device.installed.find((p) => p.name === pkg.name);
  // La versión anterior se borra solo después de verificar la nueva, así que no libera espacio antes.
  const needed = Math.ceil(pkg.sizeMb) + STORAGE_MARGIN_MB;
  if (device.storageFreeMb < needed) {
    out.push({ ok: false, level: "error", text: `Espacio insuficiente: ${device.storageFreeMb} MB libres, necesita ${needed} MB (paquete + margen; la versión anterior se borra después de verificar).` });
  }
  if (current?.version === pkg.version) {
    out.push({ ok: true, level: "warning", text: "Ya tiene esta versión: se reinstalará." });
  }
  if (network === "offline") {
    out.push({ ok: true, level: "warning", text: "Sin conexión: la descarga queda en cola hasta que vuelva la red." });
  } else if (network === "movil" && !cellularAllowed) {
    out.push({ ok: true, level: "warning", text: "Política solo Wi-Fi: la descarga espera a una red Wi-Fi." });
  }
  return out;
}

export function downloadDurationMs(sizeMb: number, network: Network) {
  const speed = NETWORK_SPEED[network] || 1;
  const base = (sizeMb / speed) * 1000;
  const factor = network === "intermitente" ? 1.6 : 1;
  return Math.min(12_000, Math.max(1_500, base * factor));
}

export type LabObservation = {
  id: string;
  species: string;
  sinGps: boolean;
  altitud: number;
  sinFoto: boolean;
  /** hash de la foto, para simular la detección de duplicados SHA-256 */
  hash: string;
};

export type SyncOutcome = { obs: LabObservation; status: "subida" | "rechazada" | "marcada" | "conflicto" | "reintentar"; text: string };

/** Lo que respondería el servidor por cada observación de la cola. */
export function evaluateSync(queue: LabObservation[], faults: Faults): SyncOutcome[] {
  const seenHashes = new Set<string>();
  return queue.map((obs, i) => {
    if (faults.servidor500) return { obs, status: "reintentar", text: "500 del servidor: queda en cola, reintento con backoff exponencial." };
    if (obs.sinGps) return { obs, status: "rechazada", text: "422: faltan coordenadas; la app debe pedir ubicación manual." };
    if (obs.sinFoto) return { obs, status: "rechazada", text: "422: observación sin foto ni audio, no es verificable." };
    if ((faults.conflicto && i === 0) || seenHashes.has(obs.hash)) {
      return { obs, status: "conflicto", text: "409: hash SHA-256 ya registrado (duplicado), no se crea otra observación." };
    }
    seenHashes.add(obs.hash);
    if (obs.altitud > 4800 || obs.altitud < 0) {
      return { obs, status: "marcada", text: `Subida, pero ${obs.altitud} m está fuera del rango de anuros de Colombia: va a Calidad de datos.` };
    }
    return { obs, status: "subida", text: "201: subida y en cola de moderación." };
  });
}
