"use client";

import { Activity, BookMarked, Package, ShieldQuestion } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AlertsPanel } from "@/components/dashboard/alerts-panel";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { appApi, aplanarPaquetes, PENDING_STATUSES, useAppResource, type Loadable } from "@/lib/app-data/app-client";
import { problemasAbiertos } from "@/lib/app-data/panel-signals";
import { getLimpieza, getResumen } from "@/lib/dataset/dataset-client";

const listo = <T,>(v: Loadable<T>) => (v.state === "listo" ? v.data : null);
const valor = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("es-CO"));

/** Hook compartido: los mismos problemas abiertos en Resumen y Operación. */
export function useProblemasAbiertos() {
  const observaciones = useAppResource(appApi.observations);
  const dispositivos = useAppResource(appApi.devices);
  const limpieza = useAppResource(getLimpieza);
  const obs = listo(observaciones.value);
  const devs = listo(dispositivos.value);
  const alerts = obs && devs ? problemasAbiertos({ observaciones: obs, dispositivos: devs, limpieza: listo(limpieza.value) }) : null;
  return { alerts, observaciones: obs };
}

export function DashboardLive() {
  const { alerts, observaciones } = useProblemasAbiertos();
  const resumen = useAppResource(getResumen);
  const paquetes = useAppResource(appApi.packages);
  const actividad = useAppResource(() => appApi.activity(4));
  const bitacora = useAppResource(appApi.audit);

  const refutadas = observaciones?.filter((o) => o.refutaciones > 0) ?? null;
  const especies = listo(resumen.value)?.especies ?? null;
  const entregables = listo(paquetes.value) ? aplanarPaquetes(listo(paquetes.value)!).filter((f) => f.nodo.formato) : null;
  const serie = listo(actividad.value)?.series.actividad ?? null;
  const semana = serie ? serie.slice(-7).reduce((n, d) => n + d.count, 0) : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={ShieldQuestion}
          label="Observaciones refutadas"
          value={valor(refutadas?.length)}
          hint={refutadas ? `${refutadas.filter((o) => PENDING_STATUSES.includes(o.status)).length} sin decidir` : undefined}
          href="/observaciones"
        />
        <KpiCard
          icon={Package}
          label="Paquetes descargables"
          value={valor(entregables?.length)}
          hint={entregables ? `${entregables.filter((f) => f.nodo.nivel === "subregion").length} subregiones` : undefined}
          href="/paquetes"
        />
        <KpiCard
          icon={BookMarked}
          label="Especies en el dataset"
          value={valor(especies?.length)}
          hint={especies ? `${especies.filter((e) => e.taxon_id).length} en el catálogo` : undefined}
          href="/catalogo"
        />
        <KpiCard icon={Activity} label="Actividad en 7 días" value={valor(semana)} hint="eventos de la app" href="/analitica" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {alerts ? <AlertsPanel alerts={alerts} /> : <Pendiente titulo="Problemas abiertos" />}
        {listo(bitacora.value) ? <ActivityFeed items={listo(bitacora.value)!.slice(0, 8)} /> : <Pendiente titulo="Actividad reciente" />}
      </div>
    </>
  );
}

function Pendiente({ titulo }: { titulo: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 text-sm text-label-secondary" role="status">
      <p className="mb-1 font-semibold text-label-primary">{titulo}</p>
      Leyendo del servidor…
    </div>
  );
}
