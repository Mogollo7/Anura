"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Boxes,
  Globe2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { INFRA, SERVICES, uncheckedServices, type ServiceCheck, type ServiceStatus } from "@/lib/system/services";
import { getIntegrations } from "@/lib/system/integrations";
import { useAppResource } from "@/lib/app-data/app-client";
import { getResumen, getTrabajos } from "@/lib/dataset/dataset-client";
import { PanelAccountsManager } from "@/components/system/panel-accounts-manager";
import { usePanelSession } from "@/lib/session/panel-session";

type Tab = "servicios" | "integraciones" | "roles";

const STATUS_TONE: Record<ServiceStatus, "accent" | "warning" | "danger" | "neutral"> = {
  operativo: "accent",
  degradado: "warning",
  caido: "danger",
  sin_verificar: "neutral",
};

const STATUS_LABEL: Record<ServiceStatus, string> = {
  operativo: "Operativo",
  degradado: "Degradado",
  caido: "Caído",
  sin_verificar: "Sin datos",
};

function formatCheckTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function SystemConsole() {
  const session = usePanelSession();
  const resumen = useAppResource(getResumen);
  const worker = useAppResource(getTrabajos);
  const integrations = getIntegrations({
    resumen: resumen.value.state === "listo" ? resumen.value.data : null,
    worker: worker.value.state === "listo" ? worker.value.data : null,
  });
  const [tab, setTab] = useState<Tab>("servicios");
  const [checks, setChecks] = useState<Record<string, ServiceCheck>>(() => uncheckedServices());
  const [checking, setChecking] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);

  const verify = useCallback(async () => {
    setChecking(true);
    setProbeError(null);
    try {
      const res = await fetch("/api/system/health", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);
      setChecks(body.checks ?? uncheckedServices());
    } catch (err) {
      setProbeError(err instanceof Error ? err.message : "No se pudo consultar /health");
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void verify();
  }, [verify]);

  const down = Object.values(checks).filter((c) => c.status === "caido").length;
  const degraded = Object.values(checks).filter((c) => c.status === "degradado").length;
  const ok = Object.values(checks).filter((c) => c.status === "operativo").length;
  const sinDatos = Object.values(checks).filter((c) => c.status === "sin_verificar").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={Boxes} value={SERVICES.length} label="Microservicios con /health" />
        <Kpi
          icon={Activity}
          value={ok}
          label={
            sinDatos === SERVICES.length
              ? "Operativos (sin datos aún)"
              : `Operativos · ${degraded} degradados · ${down} caídos`
          }
          tone="text-accent-ink"
        />
        <Kpi icon={Globe2} value={integrations.length} label="Integraciones externas" />
        <Kpi icon={ShieldCheck} value={session.accounts.length} label="Cuentas del panel administrativo" />
      </div>

      <div className="flex gap-1 border-b border-border text-sm">
        {([["servicios", "Estado de servicios"], ["integraciones", "Integraciones"], ["roles", "Roles y permisos"]] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 px-3 pb-2 text-sm transition-colors",
              tab === t ? "border-accent-ink font-medium text-accent-ink" : "border-transparent text-label-secondary hover:text-label-primary"
            )}
          >
            {label}
          </button>
        ))}
      </div>


      {tab === "servicios" && (
        <div className="space-y-4">
          <p className="text-xs text-label-secondary">
            El panel consulta el <code className="rounded bg-surface-subtle px-1 py-0.5">/health</code> de cada servicio
            desde el servidor del Admin (direcciones <span className="font-mono">*_SERVICE_URL</span>). La latencia es la de
            esa consulta; no se guarda historial.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {INFRA.map((i) => (
              <Badge key={i.id} tone="neutral" className="text-[11px]" title={i.detalle}>
                {i.nombre}
              </Badge>
            ))}
            <Button variant="outline" className="ml-auto text-xs" onClick={() => void verify()} disabled={checking}>
              <RefreshCw size={13} className={checking ? "animate-spin" : undefined} /> Verificar ahora
            </Button>
          </div>
          {probeError && <p className="text-sm text-danger">{probeError}</p>}

          <Table>
            <THead>
              <tr>
                <TH>Servicio</TH>
                <TH>Puerto</TH>
                <TH>Depende de</TH>
                <TH>Estado</TH>
                <TH>Latencia</TH>
                <TH>Última sonda</TH>
              </tr>
            </THead>
            <TBody>
              {SERVICES.map((s) => {
                const c = checks[s.id] ?? { status: "sin_verificar" as const, latencyMs: null, lastCheck: null, detalle: null };
                return (
                  <TRow key={s.id}>
                    <TD>
                      <p className="font-medium">{s.nombre}</p>
                      <p className="text-xs text-label-secondary">{s.descripcion}</p>
                      {c.detalle && <p className="mt-1 text-[11px] text-warning">{c.detalle}</p>}
                    </TD>
                    <TD className="text-xs">{s.puerto ? `:${s.puerto}` : "interno"}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {s.dependeDe.map((d) => (
                          <Badge key={d} tone="neutral" className="text-[11px]">{d}</Badge>
                        ))}
                      </div>
                    </TD>
                    <TD><Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge></TD>
                    <TD className="text-xs">{c.latencyMs != null ? `${c.latencyMs} ms` : "—"}</TD>
                    <TD className="text-xs">{formatCheckTime(c.lastCheck)}</TD>
                  </TRow>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}

      {tab === "integraciones" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {integrations.map((i) => (
            <Card key={i.id}>
              <CardHeader className="mb-2"><CardTitle>{i.nombre}</CardTitle></CardHeader>
              <p className="text-sm text-label-primary">{i.proposito}</p>
              <dl className="mt-3 space-y-1.5 text-xs">
                <Row label="Se usa en" value={i.usadaEn} />
                <Row label="Límite" value={i.limite} />
                {i.usoActual && <Row label="Uso actual" value={i.usoActual} />}
              </dl>
              <p className="mt-3 rounded-md bg-surface-subtle p-2 text-[11px] text-label-secondary">{i.nota}</p>
            </Card>
          ))}
        </div>
      )}

      {tab === "roles" && (
        <div className="space-y-4">
          <p className="text-xs text-label-secondary">
            Esto es distinto de <Link href="/usuarios" className="text-accent-ink hover:underline">Usuarios</Link>:
            ahí están los exploradores/curadores de ANURA Mobile. Aquí están las cuentas que operan este panel
            (administrador técnico / herpetólogo), con permiso por acción, no por pantalla completa.
          </p>
          <PanelAccountsManager />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-label-tertiary">{label}</dt>
      <dd className="text-right text-label-primary">{value}</dd>
    </div>
  );
}

function Kpi({ icon: Icon, value, label, tone }: { icon: typeof Boxes; value: number; label: string; tone?: string }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <Icon size={18} className={cn("shrink-0 text-label-tertiary", tone)} />
      <div>
        <p className={cn("text-xl font-semibold", tone ?? "text-label-primary")}>{value}</p>
        <p className="text-xs text-label-secondary">{label}</p>
      </div>
    </Card>
  );
}
