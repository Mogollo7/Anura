"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { IdentifyConsole } from "./identify-console";
import { LabConsole, type FleetPreset, type NotifTemplate } from "./lab-console";
import type { PackageOption } from "@/lib/lab/sim";

export function LaboratorioShell({
  presets,
  packages,
  appVersions,
  species,
  notifTemplates,
}: {
  presets: FleetPreset[];
  packages: PackageOption[];
  appVersions: string[];
  species: string[];
  notifTemplates: NotifTemplate[];
}) {
  const [tab, setTab] = useState<"identificar" | "dispositivo">("identificar");

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-label-primary">Simulador</h1>
          <p className="max-w-3xl text-sm text-label-secondary">
            Cierra el ciclo: una foto, con altitud y sustrato, contra un release ya publicado. Devuelve especie, género, familia o rechazo, y dice qué capa decidió. No escribe en el paquete.
          </p>
        </div>
        <div className="flex gap-1 rounded-md bg-surface-subtle p-1">
          {(
            [
              ["identificar", "Identificación"],
              ["dispositivo", "Sandbox del teléfono"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                tab === id ? "bg-surface font-medium text-label-primary shadow-card" : "text-label-secondary hover:text-label-primary"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "identificar" ? (
        <IdentifyConsole />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-label-tertiary">
            Prueba descarga, espacio y sincronización de un teléfono. Es el sandbox: nada de esto toca el release publicado ni la identificación.
          </p>
          <LabConsole
            presets={presets}
            packages={packages}
            appVersions={appVersions}
            species={species}
            notifTemplates={notifTemplates}
          />
        </div>
      )}
    </div>
  );
}
