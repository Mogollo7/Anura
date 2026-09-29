import { SystemConsole } from "@/components/system/system-console";

export default function SistemaPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Sistema</h1>
        <p className="text-sm text-label-secondary">
          Servicios, integraciones y cuentas del panel. El estado de cada servicio sale de una consulta real a{" "}
          <code className="rounded bg-surface-subtle px-1 py-0.5 text-xs">/health</code>, hecha cuando abres la pantalla o
          pulsas «Verificar ahora». Todavía no se guarda el historial de disponibilidad.
        </p>
      </div>
      <SystemConsole />
    </div>
  );
}
