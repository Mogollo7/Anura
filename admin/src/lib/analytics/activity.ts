export type ActivityMetric =
  | "actividad"
  | "usuarios"
  | "observaciones"
  | "identificaciones"
  | "sincronizaciones"
  | "paquetes";

export const ACTIVITY_METRICS: { id: ActivityMetric; label: string }[] = [
  { id: "actividad", label: "Actividad general" },
  { id: "usuarios", label: "Usuarios activos" },
  { id: "observaciones", label: "Observaciones" },
  { id: "identificaciones", label: "Identificaciones" },
  { id: "sincronizaciones", label: "Sincronizaciones" },
  { id: "paquetes", label: "Descargas de paquetes" },
];

export type DayActivity = { date: string; count: number };

export type ActivitySeries = Record<ActivityMetric, DayActivity[]>;

export function emptyActivitySeries(): ActivitySeries {
  return {
    actividad: [],
    usuarios: [],
    observaciones: [],
    identificaciones: [],
    sincronizaciones: [],
    paquetes: [],
  };
}
