"use client";

import type { ReactNode } from "react";
import { Bell, ClipboardList, Smartphone, Users } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import type { NavIcon } from "@/config/nav";
import { appApi, daysAgo, PENDING_STATUSES, useAppResource, type Loadable } from "@/lib/app-data/app-client";
import { DIAS_DISPOSITIVO_ACTIVO } from "@/lib/app-data/panel-signals";

type Kpi = "usuarios" | "dispositivos" | "observaciones" | "avisos";

/**
 * Totales reales del área App. Mismo origen que las páginas Usuarios, Dispositivos,
 * Observaciones y Notificaciones: lo que dice la tarjeta es lo que hay en la lista.
 */
export function AppKpis({ show = ["usuarios", "dispositivos", "observaciones"] }: { show?: Kpi[] }) {
  // Solo se pide lo que la página muestra; `show` no cambia entre renders de una misma página.
  const users = useAppResource(show.includes("usuarios") ? appApi.users : skip);
  const devices = useAppResource(show.includes("dispositivos") ? appApi.devices : skip);
  const obs = useAppResource(show.includes("observaciones") ? appApi.observations : skip);
  const avisos = useAppResource(show.includes("avisos") ? appApi.avisos : skip);

  const cards: Record<Kpi, () => ReactNode> = {
    usuarios: () =>
      card(users.value, (u) => ({
        value: u.length,
        trend: plus(u.filter((x) => daysAgo(x.created_at) <= 7).length, "en 7 días"),
        hint: `${u.filter((x) => !x.is_active).length} suspendidos`,
      }), { icon: Users, label: "Usuarios", href: "/usuarios" }),
    dispositivos: () =>
      card(devices.value, (d) => ({
        value: d.length,
        hint: d.length ? `${d.filter((x) => daysAgo(x.last_seen) <= DIAS_DISPOSITIVO_ACTIVO).length} activos en ${DIAS_DISPOSITIVO_ACTIVO} días` : "Ningún teléfono se ha reportado",
      }), { icon: Smartphone, label: "Dispositivos", href: "/dispositivos" }),
    observaciones: () =>
      card(obs.value, (o) => ({
        value: o.length,
        hint: `${o.filter((x) => PENDING_STATUSES.includes(x.status)).length} por revisar`,
      }), { icon: ClipboardList, label: "Observaciones", href: "/observaciones" }),
    avisos: () =>
      card(avisos.value, (a) => ({
        value: a.length,
        hint: a.length ? `${a.reduce((n, x) => n + x.leidos, 0)} lecturas` : "Ninguno enviado",
      }), { icon: Bell, label: "Avisos enviados", href: "/notificaciones" }),
  };

  return (
    <div className={`grid grid-cols-2 gap-4 ${show.length >= 4 ? "lg:grid-cols-4" : "sm:grid-cols-3"}`}>
      {show.map((k) => (
        <div key={k}>{cards[k]()}</div>
      ))}
    </div>
  );
}

const skip = () => Promise.resolve([] as never[]);
const plus = (n: number, what: string) => (n > 0 ? `+${n} ${what}` : undefined);

function card<T>(
  value: Loadable<T>,
  pick: (data: T) => { value: number; hint?: string; trend?: string },
  base: { icon: NavIcon; label: string; href: string }
) {
  if (value.state === "listo") {
    const p = pick(value.data);
    return <KpiCard {...base} value={p.value.toLocaleString("es-CO")} hint={p.hint} trend={p.trend} />;
  }
  const hint =
    value.state === "cargando" ? "Cargando…" :
    value.state === "sin-sesion" ? "Inicia sesión para verlo" :
    value.status === 403 ? "Tu cuenta no tiene este permiso" : "El servidor no respondió";
  return <KpiCard {...base} value="—" hint={hint} />;
}
