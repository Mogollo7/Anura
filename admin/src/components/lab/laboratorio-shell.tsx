"use client";

import { IdentifyConsole } from "./identify-console";

export function LaboratorioShell() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Simulador</h1>
        <p className="max-w-3xl text-sm text-label-secondary">
          Una foto contra un paquete, sin modificarlo: qué especie nombraría el teléfono, si la rechazaría con el τ validado (o con la
          propuesta) y qué tan cerca quedó de cada centroide.
        </p>
      </div>
      <IdentifyConsole />
    </div>
  );
}
