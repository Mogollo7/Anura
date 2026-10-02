"use client";

import { useState } from "react";
import { CheckCircle2, Clock, AlertTriangle, Smartphone, RefreshCw } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import { DataState } from "@/components/app-data/data-state";
import {
  appApi,
  daysAgo,
  formatRelative,
  speciesLabel,
  STATUS_INFO,
  useAppResource,
  type AppDevice,
  type AppObservation,
} from "@/lib/app-data/app-client";

const RECENT_DAYS = 2;

function deviceTone(device: AppDevice): "accent" | "warning" | "danger" {
  if (device.bloqueado) return "danger";
  if (daysAgo(device.last_seen) <= RECENT_DAYS) return "accent";
  return "warning";
}

/**
 * Sincronización real: el teléfono se reporta en `POST /api/auth/dispositivos` y sube
 * observaciones con foto a `POST /api/observations`. Esta pantalla lee esas dos fuentes.
 * La entrega de paquetes regionales sigue fuera de aquí.
 */
export function SyncConsole() {
  const devices = useAppResource(appApi.devices);
  const observations = useAppResource(appApi.observations);
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pedir() {
    setBusy(true);
    setError(null);
    setAviso(null);
    try {
      const res = await appApi.pedirSincronizacion();
      setAviso(res.mensaje);
      devices.reload();
      observations.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo pedir la sincronización");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DataState value={devices.value} onRetry={() => { devices.reload(); observations.reload(); }}>
      {(deviceList) => (
        <DataState value={observations.value} onRetry={observations.reload}>
          {(obsList) => (
            <SyncBody
              devices={deviceList}
              observations={obsList}
              busy={busy}
              aviso={aviso}
              error={error}
              onSync={pedir}
            />
          )}
        </DataState>
      )}
    </DataState>
  );
}

function SyncBody({
  devices,
  observations,
  busy,
  aviso,
  error,
  onSync,
}: {
  devices: AppDevice[];
  observations: AppObservation[];
  busy: boolean;
  aviso: string | null;
  error: string | null;
  onSync: () => void;
}) {
  const recent = devices.filter((d) => !d.bloqueado && daysAgo(d.last_seen) <= RECENT_DAYS);
  const stale = devices.filter((d) => !d.bloqueado && daysAgo(d.last_seen) > RECENT_DAYS);
  const blocked = devices.filter((d) => d.bloqueado);
  const publicObs = observations.filter((o) => o.is_private !== true);
  const latest = [...observations].slice(0, 12);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-3xl text-sm text-label-secondary">
          Cada teléfono con sesión se anuncia al abrir la app y vuelve a subir las observaciones con foto que
          se quedaron solo en el aparato. Las públicas aparecen en Observaciones de la web, de todas las cuentas.
          Las privadas llegan al servidor y se ven aquí, no en el mapa público.
        </p>
        <Button variant="primary" onClick={onSync} loading={busy} disabled={busy} className="shrink-0">
          <RefreshCw size={14} aria-hidden />
          Pedir sincronización
        </Button>
      </div>
      {aviso && <p className="text-sm text-accent-ink">{aviso}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xl font-semibold text-label-primary">{devices.length}</p>
          <p className="text-xs text-label-secondary">Teléfonos registrados</p>
        </Card>
        <Card className="p-4">
          <p className="text-xl font-semibold text-accent-ink">{recent.length}</p>
          <p className="text-xs text-label-secondary">Vistos en 48 h</p>
        </Card>
        <Card className="p-4">
          <p className="text-xl font-semibold text-warning">{stale.length}</p>
          <p className="text-xs text-label-secondary">Sin contacto reciente</p>
        </Card>
        <Card className="p-4">
          <p className="text-xl font-semibold text-label-primary">{observations.length}</p>
          <p className="text-xs text-label-secondary">Observaciones en el servidor</p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Teléfonos</CardTitle>
          <Badge tone="neutral">{devices.length}</Badge>
        </CardHeader>
        <Table>
          <THead>
            <tr>
              <TH>Dispositivo</TH>
              <TH>Usuario</TH>
              <TH>Paquetes</TH>
              <TH>Último contacto</TH>
              <TH>Estado</TH>
            </tr>
          </THead>
          <TBody>
            {devices.slice(0, 20).map((d) => {
              const tone = deviceTone(d);
              const label = d.bloqueado ? "Bloqueado" : tone === "accent" ? "Al día" : "Sin contacto";
              return (
                <TRow key={d.id}>
                  <TD>
                    <span className="flex items-center gap-1.5">
                      <Smartphone size={13} className="text-label-tertiary" />
                      {d.modelo || "Android"}
                      {d.android ? <span className="text-label-tertiary">· {d.android}</span> : null}
                    </span>
                  </TD>
                  <TD>@{d.username}</TD>
                  <TD className="text-xs text-label-secondary">
                    {(d.paquetes ?? []).length
                      ? d.paquetes.map((p) => `${p.subregion || "paquete"}${p.version ? ` v${p.version}` : ""}`).join(", ")
                      : "Ninguno"}
                  </TD>
                  <TD className="text-label-secondary">{formatRelative(d.last_seen)}</TD>
                  <TD>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={tone}>{label}</Badge>
                      {d.sync_pedida ? <Badge tone="info">Sincronización pedida</Badge> : null}
                    </span>
                  </TD>
                </TRow>
              );
            })}
            {devices.length === 0 && (
              <tr>
                <TD colSpan={5} className="py-6 text-center text-label-secondary">
                  Ningún teléfono se ha reportado todavía.
                </TD>
              </tr>
            )}
          </TBody>
        </Table>
        {devices.length > 20 && (
          <p className="mt-2 text-xs text-label-tertiary">Mostrando 20 de {devices.length}.</p>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Observaciones subidas</CardTitle>
          <Badge tone="accent">{publicObs.length} públicas</Badge>
        </CardHeader>
        <p className="mb-3 text-xs text-label-secondary">
          {publicObs.length} se pueden buscar en la web. {observations.length - publicObs.length} siguen privadas en el servidor.
        </p>
        <Table>
          <THead>
            <tr>
              <TH>Especie</TH>
              <TH>Usuario</TH>
              <TH>Visibilidad</TH>
              <TH>Estado</TH>
              <TH>Subida</TH>
            </tr>
          </THead>
          <TBody>
            {latest.map((o) => {
              const status = STATUS_INFO[o.status] ?? STATUS_INFO.synced;
              return (
                <TRow key={o.id}>
                  <TD>{o.common_name || speciesLabel(o)}</TD>
                  <TD>@{o.username}</TD>
                  <TD>{o.is_private ? "Privada" : "Pública"}</TD>
                  <TD><Badge tone={status.tone}>{status.label}</Badge></TD>
                  <TD className="text-label-secondary">{formatRelative(o.created_at)}</TD>
                </TRow>
              );
            })}
            {latest.length === 0 && (
              <tr>
                <TD colSpan={5} className="py-6 text-center text-label-secondary">
                  Todavía no hay observaciones en el servidor.
                </TD>
              </tr>
            )}
          </TBody>
        </Table>
      </Card>

      <Card>
        <CardHeader><CardTitle>Estado general</CardTitle></CardHeader>
        <div className="flex flex-wrap gap-6 text-sm">
          <span className="flex items-center gap-1.5 text-label-secondary">
            <CheckCircle2 size={14} className="text-accent-ink" /> {recent.length} con contacto en las últimas 48 h
          </span>
          <span className="flex items-center gap-1.5 text-label-secondary">
            <Clock size={14} className="text-warning" /> {stale.length} hace más de 48 h que no abren la app
          </span>
          <span className="flex items-center gap-1.5 text-label-secondary">
            <AlertTriangle size={14} className="text-danger" /> {blocked.length} bloqueados: no suben observaciones
          </span>
        </div>
      </Card>
    </div>
  );
}
