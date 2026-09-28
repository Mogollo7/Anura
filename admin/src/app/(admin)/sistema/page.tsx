import { SystemConsole } from "@/components/system/system-console";

export default function SistemaPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Sistema</h1>
        <p className="text-sm text-label-secondary">
          Microservicios, puertos e integraciones del repo. El estado de cada servicio es una sonda real a{" "}
          <code className="rounded bg-surface-subtle px-1 py-0.5 text-xs">/health</code>; sin Prometheus/Grafana aún no
          hay series de disponibilidad.
        </p>
      </div>
      <SystemConsole />
    </div>
  );
}
