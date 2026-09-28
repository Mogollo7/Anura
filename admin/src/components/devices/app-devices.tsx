"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Smartphone, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Table, TBody, TD, TH, THead, TRow } from "@/components/ui/table";
import { DataState } from "@/components/app-data/data-state";
import { appApi, daysAgo, formatDate, formatRelative, useAppResource, type AppDevice } from "@/lib/app-data/app-client";
import { DIAS_DISPOSITIVO_ACTIVO } from "@/lib/app-data/panel-signals";
import { cn } from "@/lib/utils";

type Tab = "todos" | "bloqueados" | "sin-reporte";

const TABS: { id: Tab; label: string; match: (d: AppDevice) => boolean }[] = [
  { id: "todos", label: "Todos", match: () => true },
  { id: "bloqueados", label: "Bloqueados", match: (d) => d.bloqueado },
  { id: "sin-reporte", label: `Sin reportarse en ${DIAS_DISPOSITIVO_ACTIVO} días`, match: (d) => daysAgo(d.last_seen) > DIAS_DISPOSITIVO_ACTIVO },
];

export function AppDevices() {
  const { value, reload, set } = useAppResource(appApi.devices);
  return (
    <DataState value={value} onRetry={reload}>
      {(devices) =>
        devices.length === 0 ? (
          <EmptyDevices />
        ) : (
          <DevicesList devices={devices} onChange={(d) => set((all) => all.map((x) => (x.id === d.id ? { ...x, ...d } : x)))} />
        )
      }
    </DataState>
  );
}

function EmptyDevices() {
  return (
    <Card className="flex items-start gap-3 p-6">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-wash text-accent-ink"><Smartphone size={16} /></span>
      <div className="text-sm text-label-secondary">
        <p className="font-medium text-label-primary">Todavía ningún teléfono se ha reportado</p>
        <p className="mt-0.5 max-w-xl">
          Cada teléfono aparece aquí cuando abre ANURA Mobile con la sesión iniciada: manda su modelo, la versión de Android y
          de la app, los paquetes que tiene y el espacio libre. Desde aquí se puede bloquear uno si se pierde o se usa mal.
        </p>
      </div>
    </Card>
  );
}

function DevicesList({ devices, onChange }: { devices: AppDevice[]; onChange: (d: Partial<AppDevice> & { id: string }) => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const usuario = params.get("usuario");
  const [tab, setTab] = useState<Tab>("todos");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const scoped = useMemo(() => (usuario ? devices.filter((d) => d.user_id === usuario) : devices), [devices, usuario]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = TABS.find((t) => t.id === tab)!.match;
    return scoped.filter((d) => match(d) && (!q || [d.modelo ?? "", d.username, d.app_version ?? ""].some((s) => s.toLowerCase().includes(q))));
  }, [scoped, tab, query]);
  const open = devices.find((d) => d.id === openId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtro">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                tab === t.id ? "bg-accent-wash text-accent-ink" : "bg-surface-subtle text-label-secondary hover:text-label-primary"
              )}
            >
              {t.label} ({scoped.filter(t.match).length})
            </button>
          ))}
        </div>
        <label className="relative sm:w-64">
          <span className="sr-only">Buscar teléfonos</span>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-label-tertiary" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Modelo, usuario o versión" className="pl-8" />
        </label>
      </div>

      {usuario && (
        <div className="flex items-center gap-2 text-sm text-label-secondary">
          Solo los de <strong className="text-label-primary">@{scoped[0]?.username ?? "este usuario"}</strong>
          <button onClick={() => router.replace("/dispositivos")} className="flex items-center gap-1 rounded-full bg-surface-subtle px-2 py-0.5 text-xs hover:text-label-primary">
            <X size={12} aria-hidden /> Ver todos
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-label-secondary">Ningún teléfono coincide con este filtro.</p>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Teléfono</TH>
              <TH>Usuario</TH>
              <TH>Paquetes</TH>
              <TH>Espacio libre</TH>
              <TH>Último reporte</TH>
              <TH>Estado</TH>
            </tr>
          </THead>
          <TBody>
            {visible.map((d) => (
              <TRow key={d.id} clickable onClick={() => setOpenId(d.id)}>
                <TD>
                  <span className="block font-medium text-label-primary">{d.modelo ?? "Teléfono sin nombre"}</span>
                  <span className="block text-xs text-label-tertiary">Android {d.android ?? "?"} · app {d.app_version ?? "?"}</span>
                </TD>
                <TD className="text-label-secondary">@{d.username}</TD>
                <TD className="text-label-secondary">{d.paquetes.length ? d.paquetes.map((p) => `${p.subregion ?? "?"} ${p.version ?? ""}`.trim()).join(", ") : "Ninguno"}</TD>
                <TD className="text-label-secondary">{mb(d.espacio_libre_mb)}</TD>
                <TD className="whitespace-nowrap text-label-secondary">{formatRelative(d.last_seen)}</TD>
                <TD>
                  <Badge tone={d.bloqueado ? "danger" : !d.cuenta_activa ? "warning" : "accent"}>
                    {d.bloqueado ? "Bloqueado" : !d.cuenta_activa ? "Cuenta suspendida" : "Activo"}
                  </Badge>
                </TD>
              </TRow>
            ))}
          </TBody>
        </Table>
      )}

      {open && <DeviceDialog key={open.id} device={open} onClose={() => setOpenId(null)} onChange={onChange} />}
    </div>
  );
}

function DeviceDialog({ device: d, onClose, onChange }: { device: AppDevice; onClose: () => void; onChange: (d: Partial<AppDevice> & { id: string }) => void }) {
  const [blocking, setBlocking] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setBlocked(bloqueado: boolean) {
    setBusy(true);
    setError(null);
    try {
      onChange(await appApi.setDeviceBlocked(d.id, bloqueado, bloqueado ? reason.trim() : undefined));
      setBlocking(false);
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el bloqueo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogHeader title={d.modelo ?? "Teléfono sin nombre"} description={`Android ${d.android ?? "?"} · app ${d.app_version ?? "?"}`} />
      <dl className="mb-5 grid grid-cols-2 gap-3 text-sm">
        <Info label="Usuario"><Link href={`/usuarios?id=${d.user_id}`} className="text-accent-ink hover:underline">@{d.username}</Link></Info>
        <Info label="Último reporte">{formatRelative(d.last_seen)}</Info>
        <Info label="Primer reporte">{formatDate(d.created_at)}</Info>
        <Info label="Espacio libre">{mb(d.espacio_libre_mb)}</Info>
        <Info label="Paquetes instalados">
          {d.paquetes.length ? (
            <ul>{d.paquetes.map((p, i) => <li key={i}>{p.subregion ?? "?"} <span className="text-label-tertiary">{p.version}</span></li>)}</ul>
          ) : "Ninguno"}
        </Info>
      </dl>

      <div className="border-t border-border pt-4">
        {d.bloqueado ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-label-secondary">
              <span className="block text-xs text-label-tertiary">Motivo del bloqueo</span>
              {d.bloqueo_motivo ?? "Sin motivo registrado"}
            </p>
            <Button variant="primary" onClick={() => setBlocked(false)} disabled={busy}>Desbloquear teléfono</Button>
          </div>
        ) : blocking ? (
          <div className="space-y-3">
            <Field label="¿Por qué lo bloqueas?" hint="Queda en Auditoría. La próxima vez que la app se reporte, sabrá que está bloqueado.">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} autoFocus />
            </Field>
            <div className="flex justify-between gap-3">
              <Button variant="ghost" onClick={() => { setBlocking(false); setReason(""); }} disabled={busy}>Cancelar</Button>
              <Button variant="danger" onClick={() => setBlocked(true)} disabled={busy || !reason.trim()}>Bloquear teléfono</Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-label-tertiary">Bloquea solo este teléfono; la cuenta sigue activa.</p>
            <Button variant="outline" className="text-danger" onClick={() => setBlocking(true)}>Bloquear…</Button>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}

const mb = (v: number | null) => (v == null ? "—" : v >= 1024 ? `${(v / 1024).toLocaleString("es-CO", { maximumFractionDigits: 1 })} GB` : `${v} MB`);

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-label-tertiary">{label}</dt>
      <dd className="text-label-primary">{children}</dd>
    </div>
  );
}
