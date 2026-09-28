import { REAL_SPECIES } from "@/lib/data/real";
import { mulberry32, pick, seededInt } from "./rng";
import { getUsers } from "./users";

export type ObservationStatus = "pendiente" | "en_revision" | "aprobada" | "rechazada";

export type DecisionEntry = {
  id: string;
  action: string;
  actor: string;
  note: string;
  timestamp: string;
};

export type Refutation = {
  author: string;
  reason: string;
  proposedSpecies: string;
  createdAt: string;
};

export type MockObservation = {
  id: string;
  species: string;
  observer: string;
  status: ObservationStatus;
  municipio: string;
  departamento: string;
  lat: number;
  lng: number;
  altitude: number;
  recordedAt: string;
  reportCount: number;
  refutation: Refutation | null;
  history: DecisionEntry[];
};

// Especies reales del paquete de Antioquia (lib/data/real.ts), no una lista escrita a mano.
const SPECIES = REAL_SPECIES.filter((s) => s.estadoVisual === "VISUAL_ENABLED").map((s) => s.especie);

const MUNICIPIOS: [string, string][] = [
  ["Medellín", "Antioquia"],
  ["Rionegro", "Antioquia"],
  ["Jardín", "Antioquia"],
  ["Santa Fe de Antioquia", "Antioquia"],
  ["Amagá", "Antioquia"],
  ["Urrao", "Antioquia"],
  ["Frontino", "Antioquia"],
  ["Andes", "Antioquia"],
];

const STATUSES: ObservationStatus[] = [
  "pendiente", "pendiente", "en_revision", "aprobada", "aprobada", "aprobada", "rechazada",
];

const REFUTATION_REASONS = [
  "La morfología dorsal no coincide con la especie identificada",
  "El patrón de coloración corresponde a un juvenil de otra especie",
  "La distribución reportada está fuera del rango conocido",
  "Confusión con especie críptica del mismo género",
];

const DECISION_ACTIONS = [
  "Observación creada",
  "Identificación automática asignada",
  "Marcada para revisión",
  "Refutación recibida",
];

function daysAgo(n: number) {
  const d = new Date("2026-09-25T00:00:00");
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function buildHistory(rand: () => number, status: ObservationStatus, hasRefutation: boolean): DecisionEntry[] {
  const entries: DecisionEntry[] = [
    {
      id: "h-0",
      action: "Observación creada",
      actor: "App móvil",
      note: "Identificación automática vía inferencia on-device",
      timestamp: `hace ${seededInt(rand, 6, 20)}d`,
    },
  ];

  if (hasRefutation) {
    entries.push({
      id: "h-1",
      action: "Refutación científica recibida",
      actor: "Curador científico",
      note: pick(rand, REFUTATION_REASONS),
      timestamp: `hace ${seededInt(rand, 1, 5)}d`,
    });
  }

  if (status === "aprobada" || status === "rechazada") {
    entries.push({
      id: "h-2",
      action: status === "aprobada" ? "Observación aprobada" : "Observación rechazada",
      actor: "Admin ANURA",
      note: status === "aprobada" ? "Identificación confirmada por curador" : "No cumple criterios de calidad",
      timestamp: `hace ${seededInt(rand, 0, 3)}d`,
    });
  }

  return entries;
}

export function getObservations(): MockObservation[] {
  const rand = mulberry32(40001);
  const users = getUsers();

  return Array.from({ length: 56 }, (_, i) => {
    const status = pick(rand, STATUSES);
    const hasRefutation = rand() < 0.22;
    const [municipio, departamento] = pick(rand, MUNICIPIOS);
    const observer = pick(rand, users).name;

    return {
      id: `obs-${String(i + 1).padStart(4, "0")}`,
      species: pick(rand, SPECIES),
      observer,
      status,
      municipio,
      departamento,
      lat: 5.4 + rand() * 3.5,
      lng: -77.1 + rand() * 3.2,
      altitude: seededInt(rand, 120, 3200),
      recordedAt: daysAgo(seededInt(rand, 0, 25)),
      reportCount: rand() < 0.12 ? seededInt(rand, 1, 4) : 0,
      refutation: hasRefutation
        ? {
            author: "Curador científico",
            reason: pick(rand, REFUTATION_REASONS),
            proposedSpecies: pick(rand, SPECIES),
            createdAt: daysAgo(seededInt(rand, 0, 5)),
          }
        : null,
      history: buildHistory(rand, status, hasRefutation),
    };
  });
}

export const OBSERVATION_DECISION_ACTIONS = DECISION_ACTIONS;
