import { mulberry32, pick, seededInt } from "./rng";
import { getUsers } from "./users";

export type SyncStatus = "sincronizado" | "pendiente" | "error";

export type DevicePolicies = {
  /** Inferencia BioCLIP (ONNX) en el dispositivo; si se apaga, la ID queda en cola hasta tener red. */
  offlineAi: boolean;
  /** Permite sincronizar observaciones y paquetes por datos móviles, no solo Wi-Fi. */
  cellularSync: boolean;
  /** Instala automáticamente la versión vigente de los paquetes que ya tiene. */
  autoPackageUpdates: boolean;
};

export type DeviceBlock = {
  motivo: string;
  fecha: string;
  /** Borra datos locales (paquetes, borradores, caché) en la próxima conexión. */
  borrarDatos: boolean;
};

export type MockDevice = {
  id: string;
  /** Identificador de instalación que genera la app al registrarse (no el IMEI/serial). */
  installId: string;
  ownerId: string;
  ownerName: string;
  model: string;
  tablet: boolean;
  androidVersion: string;
  apiLevel: number;
  ramGb: number;
  appVersion: string;
  installedPackages: string[];
  syncStatus: SyncStatus;
  lastSync: string;
  linkedAt: string;
  storageFreeMb: number;
  /** Observaciones capturadas offline que todavía no han subido. */
  pendingUploads: number;
  policies: DevicePolicies;
  bloqueo: DeviceBlock | null;
};

/** Solo Android: ANURA Mobile es una app Android (minSdk 26 = Android 8.0). */
const DEVICE_SPECS: { model: string; android: string; api: number; ram: number; tablet?: boolean }[] = [
  { model: "Samsung Galaxy A54", android: "14", api: 34, ram: 6 },
  { model: "Xiaomi Redmi Note 13", android: "13", api: 33, ram: 6 },
  { model: "Motorola Moto G84", android: "14", api: 34, ram: 8 },
  { model: "Samsung Galaxy A14", android: "13", api: 33, ram: 4 },
  { model: "Google Pixel 7a", android: "15", api: 35, ram: 8 },
  { model: "Samsung Galaxy Tab Active4 Pro", android: "13", api: 33, ram: 4, tablet: true },
  { model: "Motorola Moto E13", android: "13 (Go)", api: 33, ram: 2 },
  { model: "Xiaomi Redmi 9A", android: "10", api: 29, ram: 2 },
  { model: "Samsung Galaxy J7 Prime", android: "8.1", api: 27, ram: 3 },
];

/** Versiones de ANURA Mobile en la flota simulada. La app real hoy es 1.0. */
export const APP_VERSIONS = ["0.9.2-beta", "1.0.0", "1.0.1"];
/** La mayoría ya actualizó; quedan pocos testers en la beta. */
const APP_VERSION_WEIGHTS = ["1.0.1", "1.0.1", "1.0.1", "1.0.1", "1.0.1", "1.0.0", "1.0.0", "1.0.0", "0.9.2-beta"];

/**
 * Solo versiones publicadas: una versión en validación nunca llega a un teléfono.
 * Se repiten las vigentes para que dominen, pero quedan versiones anteriores
 * (Antioquia 2.0.0, Valle 1.0.0) para que haya actualizaciones pendientes reales.
 */
const PUBLISHED = [
  "Antioquia v2.3.1", "Antioquia v2.3.1", "Antioquia v2.3.1", "Antioquia v2.0.0",
  "Valle del Cauca v1.1.0", "Valle del Cauca v1.1.0", "Valle del Cauca v1.0.0",
  "Cauca v1.0.0", "Chocó v0.9.0",
];

const SYNC_STATUSES: SyncStatus[] = [
  "sincronizado", "sincronizado", "sincronizado", "sincronizado", "sincronizado",
  "pendiente", "pendiente", "error",
];

export const BLOCK_REASONS = [
  "Dispositivo reportado como extraviado en campo",
  "Dispositivo reportado como robado",
  "Fin del convenio / devolución del equipo institucional",
  "Anomalías de datos en revisión (observaciones sospechosas)",
];

function daysAgo(n: number) {
  const d = new Date("2026-09-25T00:00:00");
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function getDevices(): MockDevice[] {
  const rand = mulberry32(30002);
  const devices: MockDevice[] = [];

  for (const user of getUsers()) {
    for (let d = 0; d < user.deviceCount; d++) {
      // Gama media domina en campo; los de 2 GB son minoría.
      const spec = rand() < 0.12 ? pick(rand, DEVICE_SPECS.filter((x) => x.ram < 3)) : pick(rand, DEVICE_SPECS.filter((x) => x.ram >= 3));
      const packageCount = seededInt(rand, 1, 2);
      const installed = new Map<string, string>();
      while (installed.size < packageCount) {
        const pkg = pick(rand, PUBLISHED);
        const name = pkg.slice(0, pkg.lastIndexOf(" v"));
        if (!installed.has(name)) installed.set(name, pkg);
      }

      const suspended = user.status === "suspendido";
      const lostOrStolen = !suspended && rand() < 0.05;
      const bloqueo: DeviceBlock | null = suspended
        ? { motivo: "Cuenta del usuario suspendida", fecha: daysAgo(seededInt(rand, 1, 20)), borrarDatos: false }
        : lostOrStolen
          ? { motivo: pick(rand, BLOCK_REASONS.slice(0, 2)), fecha: daysAgo(seededInt(rand, 1, 10)), borrarDatos: true }
          : null;

      const syncStatus = bloqueo ? "error" : pick(rand, SYNC_STATUSES);
      const lowRam = spec.ram < 3;

      devices.push({
        id: `device-${String(devices.length + 1).padStart(3, "0")}`,
        installId: `inst-${(seededInt(rand, 0x1000, 0xffff)).toString(16)}${(seededInt(rand, 0x1000, 0xffff)).toString(16)}`,
        ownerId: user.id,
        ownerName: user.name,
        model: spec.model,
        tablet: spec.tablet ?? false,
        androidVersion: spec.android,
        apiLevel: spec.api,
        ramGb: spec.ram,
        appVersion: pick(rand, APP_VERSION_WEIGHTS),
        installedPackages: Array.from(installed.values()),
        syncStatus,
        lastSync: daysAgo(syncStatus === "sincronizado" ? seededInt(rand, 0, 3) : seededInt(rand, 2, 24)),
        linkedAt: user.joinedAt,
        storageFreeMb: rand() < 0.15 ? seededInt(rand, 90, 380) : seededInt(rand, 900, 24000),
        pendingUploads: syncStatus === "sincronizado" ? 0 : seededInt(rand, 1, 10),
        policies: {
          offlineAi: !lowRam,
          cellularSync: rand() > 0.35,
          autoPackageUpdates: rand() > 0.3,
        },
        bloqueo,
      });
    }
  }

  return devices;
}
