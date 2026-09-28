import { mulberry32, pick, seededInt } from "./rng";

export type UserRole = "explorador" | "curador" | "admin";
export type UserStatus = "activo" | "invitado" | "inactivo" | "suspendido";

/** Qué habilita cada rol en ANURA Mobile y en este panel. */
export const ROLE_INFO: Record<UserRole, { label: string; permisos: string[] }> = {
  explorador: {
    label: "Explorador",
    permisos: ["Registrar observaciones (foto/audio)", "Descargar paquetes regionales", "Comentar y refutar identificaciones"],
  },
  curador: {
    label: "Curador científico",
    permisos: ["Todo lo del explorador", "Aprobar o rechazar observaciones", "Proponer correcciones al catálogo"],
  },
  admin: {
    label: "Administrador",
    permisos: ["Todo lo del curador", "Acceso a este panel", "Publicar paquetes y gestionar usuarios/dispositivos"],
  },
};

export type ObservationTally = { aprobadas: number; rechazadas: number; pendientes: number };

export type MockUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  suspensionReason?: string;
  institution: string;
  /** Departamento donde más observa; decide qué paquete le sugiere la app. */
  departamento: string;
  deviceCount: number;
  observaciones: ObservationTally;
  /** Revisiones hechas (solo curadores/admin). */
  revisiones: number;
  joinedAt: string;
  /** Última sincronización desde cualquiera de sus dispositivos. */
  lastActive: string;
};

export function totalObservations(u: Pick<MockUser, "observaciones">) {
  return u.observaciones.aprobadas + u.observaciones.rechazadas + u.observaciones.pendientes;
}

const FIRST_NAMES = [
  "Sebastián", "Valentina", "Camilo", "Laura", "Andrés", "Mariana", "Julián",
  "Daniela", "Santiago", "Isabella", "Felipe", "Camila", "Nicolás", "Sofía",
  "Diego", "Gabriela", "Alejandro", "Paula", "Tomás", "Natalia",
];
const LAST_NAMES = [
  "Martínez", "Gómez", "Rodríguez", "López", "García", "Hernández", "Ramírez",
  "Torres", "Vargas", "Castro", "Ortiz", "Rojas", "Molina", "Jiménez",
];
const ROLES: UserRole[] = ["explorador", "explorador", "explorador", "explorador", "curador"];
const STATUSES: UserStatus[] = [
  "activo", "activo", "activo", "activo", "activo", "activo", "activo", "activo",
  "inactivo", "inactivo", "suspendido",
];

export const INSTITUTIONS = [
  "Instituto Alexander von Humboldt",
  "Universidad Nacional de Colombia",
  "Universidad de Antioquia — Grupo Herpetológico",
  "Universidad del Valle",
  "Parques Nacionales Naturales de Colombia",
  "Pontificia Universidad Javeriana",
  "Ciencia ciudadana (sin institución)",
];

const DEPARTAMENTOS = ["Antioquia", "Antioquia", "Antioquia", "Valle del Cauca", "Cauca", "Chocó"];

export const SUSPENSION_REASONS = [
  "Observaciones duplicadas o fabricadas de forma reiterada",
  "Coordenadas falsificadas (fuera de rango de forma sistemática)",
  "Lenguaje ofensivo en comentarios/refutaciones",
  "Solicitud de la institución responsable",
];

function daysAgo(n: number) {
  const d = new Date("2026-09-25T00:00:00");
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function getUsers(): MockUser[] {
  const rand = mulberry32(30001);
  const usedEmails = new Set<string>();

  return Array.from({ length: 42 }, (_, i) => {
    const first = pick(rand, FIRST_NAMES);
    const last = pick(rand, LAST_NAMES);
    const role: UserRole = i === 0 ? "admin" : pick(rand, ROLES);
    const status: UserStatus = i === 0 ? "activo" : pick(rand, STATUSES);

    const total = status === "inactivo" ? seededInt(rand, 0, 12) : seededInt(rand, 3, 260);
    const rejectRate = status === "suspendido" ? 0.35 + rand() * 0.3 : 0.04 + rand() * 0.14;
    const pendientes = Math.min(total, seededInt(rand, 0, 9));
    const rechazadas = Math.round((total - pendientes) * rejectRate);

    let email = `${first}.${last}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + "@correo.co";
    if (usedEmails.has(email)) email = email.replace("@", `${i}@`);
    usedEmails.add(email);

    return {
      id: `user-${String(i + 1).padStart(3, "0")}`,
      name: `${first} ${last}`,
      email,
      role,
      status,
      suspensionReason: status === "suspendido" ? pick(rand, SUSPENSION_REASONS) : undefined,
      institution: pick(rand, INSTITUTIONS),
      departamento: pick(rand, DEPARTAMENTOS),
      deviceCount: status === "inactivo" ? seededInt(rand, 0, 1) : seededInt(rand, 1, 2),
      observaciones: { aprobadas: total - pendientes - rechazadas, rechazadas, pendientes },
      revisiones: role === "explorador" ? 0 : seededInt(rand, 40, 900),
      joinedAt: daysAgo(seededInt(rand, 30, 640)),
      lastActive: daysAgo(status === "inactivo" ? seededInt(rand, 90, 240) : seededInt(rand, 0, 30)),
    };
  });
}
