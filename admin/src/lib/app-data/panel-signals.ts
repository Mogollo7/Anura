import type { EstadoLimpieza } from "@/lib/dataset/dataset-client";
import { daysAgo, PENDING_STATUSES, type AppDevice, type AppObservation, type AuditEntry } from "./app-client";
import { plural } from "@/lib/utils";

/** Días sin reportarse para que un teléfono deje de contar como activo. Único umbral del panel. */
export const DIAS_DISPOSITIVO_ACTIVO = 30;

export type PanelAlert = {
  id: string;
  severity: "warning" | "info";
  title: string;
  detail: string;
  href: string;
};

/**
 * Problemas abiertos que salen de datos reales: observaciones pendientes, refutaciones sin
 * resolver, hallazgos de Calidad sin decidir y teléfonos bloqueados o sin reportarse. Resumen
 * y Operación usan esta misma función: el número es el mismo en las dos pantallas.
 */
export function problemasAbiertos(input: {
  observaciones: AppObservation[];
  dispositivos: AppDevice[];
  limpieza: EstadoLimpieza | null;
}): PanelAlert[] {
  const pendientes = input.observaciones.filter((o) => PENDING_STATUSES.includes(o.status));
  const refutadas = pendientes.filter((o) => o.refutaciones > 0);
  const hallazgos = (input.limpieza?.conteos ?? []).filter((c) => c.estado === "pendiente").reduce((n, c) => n + c.n, 0);
  const bloqueados = input.dispositivos.filter((d) => d.bloqueado);
  const inactivos = input.dispositivos.filter((d) => !d.bloqueado && daysAgo(d.last_seen) > DIAS_DISPOSITIVO_ACTIVO);

  const alerts: PanelAlert[] = [];
  if (refutadas.length)
    alerts.push({
      id: "refutadas",
      severity: "warning",
      title: `${plural(refutadas.length, "observación refutada", "observaciones refutadas")} sin decidir`,
      detail: "Alguien comentó que la especie no corresponde. Revísalas antes que las demás.",
      href: "/observaciones",
    });
  if (pendientes.length)
    alerts.push({
      id: "pendientes",
      severity: "warning",
      title: `${plural(pendientes.length, "observación", "observaciones")} por revisar`,
      detail: "Llegaron de la app y esperan que alguien las apruebe o las rechace.",
      href: "/observaciones",
    });
  if (hallazgos)
    alerts.push({
      id: "hallazgos",
      severity: "warning",
      title: `${plural(hallazgos, "hallazgo", "hallazgos")} de Calidad sin decidir`,
      detail: "Coordenadas dudosas o atípicas que la limpieza propuso y nadie ha decidido.",
      href: "/calidad",
    });
  if (bloqueados.length)
    alerts.push({
      id: "bloqueados",
      severity: "info",
      title: `${plural(bloqueados.length, "teléfono bloqueado", "teléfonos bloqueados")}`,
      detail: "No sincronizan hasta que alguien los desbloquee.",
      href: "/dispositivos",
    });
  if (inactivos.length)
    alerts.push({
      id: "inactivos",
      severity: "info",
      title: `${plural(inactivos.length, "teléfono", "teléfonos")} sin reportarse en ${DIAS_DISPOSITIVO_ACTIVO} días`,
      detail: "Pueden tener un paquete viejo instalado.",
      href: "/dispositivos",
    });
  return alerts;
}

const ACCIONES: Record<string, string> = {
  "observation.validated": "aprobó una observación",
  "observation.rejected": "rechazó una observación",
  "observation.in_review": "puso en revisión una observación",
  "aviso.send": "envió un aviso",
  "app_user.suspend": "suspendió una cuenta de la app",
  "app_user.reactivate": "reactivó una cuenta de la app",
  "device.block": "bloqueó un teléfono",
  "device.unblock": "desbloqueó un teléfono",
  "panel_account.create": "creó una cuenta del panel",
  "panel_account.permission_change": "cambió permisos de una cuenta del panel",
  "panel_account.remove": "quitó una cuenta del panel",
  "dataset.limpieza": "corrió la limpieza de calidad",
  "dataset.hallazgo.decision": "decidió hallazgos de calidad",
  "dataset.centroides.calculados": "calculó centroides",
  "dataset.contenido.guardado": "guardó una ficha pública",
  "dataset.contenido.enviado_revision": "envió una ficha a revisión",
  "dataset.contenido.devuelto": "devolvió una ficha",
  "dataset.contenido.publicado": "publicó una ficha",
  "dataset.destacado.programado": "programó un destacado",
  "dataset.destacado.quitado": "quitó un destacado",
  "dataset.foto.exclusion": "excluyó una foto",
  "dataset.foto.reinclusion": "volvió a incluir una foto",
  "dataset.foto.subida": "subió una foto",
  "dataset.observacion.invalidacion": "invalidó una observación del dataset",
  "dataset.observacion.reversion": "revirtió una invalidación",
  "dataset.region.agregada": "agregó una región",
  "dataset.region.activada": "activó una región",
  "dataset.region.quitada": "quitó una región",
  "dataset.subregion.creada": "creó una subregión",
  "dataset.subregion.renombrada": "renombró una subregión",
  "dataset.subregion.municipios": "cambió los municipios de una subregión",
  "dataset.subregion.borrada": "borró una subregión",
  "dataset.trabajo.creado": "lanzó un trabajo del worker",
  "dataset.trabajo.cancelado": "canceló un trabajo del worker",
};

/** La acción de audit.log en palabras; si no se conoce, el código tal cual. */
export const accionLegible = (e: Pick<AuditEntry, "action">) => ACCIONES[e.action] ?? e.action;
