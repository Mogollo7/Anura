"use client";

import { ShieldAlert } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { useProblemasAbiertos } from "@/components/dashboard/dashboard-live";

/** Mismo conteo que "Problemas abiertos" del Resumen. */
export function OpenIssuesKpi() {
  const { alerts, error } = useProblemasAbiertos();
  return (
    <KpiCard
      icon={ShieldAlert}
      label="Problemas abiertos"
      value={alerts ? String(alerts.length) : "—"}
      hint={alerts ? (alerts[0]?.title ?? "Nada pendiente") : error ? "El servidor no respondió" : "Leyendo del servidor…"}
      href="/dashboard"
    />
  );
}
