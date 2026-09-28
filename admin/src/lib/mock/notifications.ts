import { getDevices, type SyncStatus } from "./devices";
import { DEPARTAMENTOS } from "@/lib/packages/departamentos";

export type NotifTipo = "correccion_cientifica" | "nueva_version" | "aviso_general";
export type NotifEstado = "borrador" | "programada" | "enviada";

export const NOTIF_TIPOS: { id: NotifTipo; label: string }[] = [
  { id: "nueva_version", label: "Nueva versión de paquete" },
  { id: "correccion_cientifica", label: "Corrección científica" },
  { id: "aviso_general", label: "Aviso general" },
];

export type NotifSegment = {
  departamentoId: string; // id de departamento o "todos"
  appVersion: string; // versión exacta o "todas"
  syncStatus: SyncStatus | "todos";
};

export type MockNotification = {
  id: string;
  tipo: NotifTipo;
  titulo: string;
  cuerpo: string;
  segmento: NotifSegment;
  estado: NotifEstado;
  fecha: string | null; // enviada o programada
  creadaPor: string;
};

export { APP_VERSIONS } from "./devices";

export function segmentLabel(segmento: NotifSegment): string {
  const parts: string[] = [];
  const dep = DEPARTAMENTOS.find((d) => d.id === segmento.departamentoId);
  parts.push(dep ? `paquete ${dep.nombre}` : "todos los departamentos");
  if (segmento.appVersion !== "todas") parts.push(`ANURA v${segmento.appVersion}`);
  if (segmento.syncStatus !== "todos") parts.push(`sync ${segmento.syncStatus}`);
  return parts.join(" · ");
}

export function computeReach(segmento: NotifSegment): number {
  const devices = getDevices();
  const dep = DEPARTAMENTOS.find((d) => d.id === segmento.departamentoId);

  return devices.filter((d) => {
    if (dep && !d.installedPackages.some((p) => p.startsWith(`${dep.nombre} v`))) return false;
    if (segmento.appVersion !== "todas" && d.appVersion !== segmento.appVersion) return false;
    if (segmento.syncStatus !== "todos" && d.syncStatus !== segmento.syncStatus) return false;
    return true;
  }).length;
}

const SEED: MockNotification[] = [
  {
    id: "notif-1",
    tipo: "nueva_version",
    titulo: "Antioquia v2.3.1 disponible",
    cuerpo: "Nuevas zonas biogeográficas y 30 especies habilitadas. Actualiza el paquete desde Ajustes.",
    segmento: { departamentoId: "antioquia", appVersion: "todas", syncStatus: "todos" },
    estado: "enviada",
    fecha: "2026-09-13",
    creadaPor: "Admin ANURA",
  },
  {
    id: "notif-2",
    tipo: "correccion_cientifica",
    titulo: "Corrección: rango de Rhinella marina",
    cuerpo: "Se ajustó la longitud rostro-cloaca reportada tras revisión de curador.",
    segmento: { departamentoId: "todos", appVersion: "todas", syncStatus: "todos" },
    estado: "programada",
    fecha: "2026-09-28T09:00",
    creadaPor: "Curador científico",
  },
  {
    id: "notif-3",
    tipo: "aviso_general",
    titulo: "Mantenimiento programado del servicio",
    cuerpo: "El domingo habrá una ventana de mantenimiento de 2 horas. La app sigue funcionando offline.",
    segmento: { departamentoId: "todos", appVersion: "todas", syncStatus: "todos" },
    estado: "borrador",
    fecha: null,
    creadaPor: "Admin ANURA",
  },
  {
    id: "notif-4",
    tipo: "aviso_general",
    titulo: "Dispositivos con errores de sincronización",
    cuerpo: "Detectamos que tu app no ha podido sincronizar. Revisa tu conexión y vuelve a intentarlo.",
    segmento: { departamentoId: "todos", appVersion: "todas", syncStatus: "error" },
    estado: "enviada",
    fecha: "2026-09-21",
    creadaPor: "Sistema",
  },
];

export function getNotifications(): MockNotification[] {
  return SEED;
}
