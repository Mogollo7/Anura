"use client";

import { useSearchParams } from "next/navigation";
import { AntioquiaSubregionesPanel } from "./antioquia-subregiones-panel";

export function SubregionesFold() {
  const sub = useSearchParams().get("sub");
  return (
    <details key={sub ?? "cerrado"} open={sub ? true : undefined} className="rounded-lg border border-border bg-surface p-4">
      <summary className="cursor-pointer text-sm font-medium text-label-primary">
        Lectura ecológica de las 9 subregiones de Antioquia <span className="font-normal text-label-tertiary">· cotas, pisos térmicos y especies del paquete</span>
      </summary>
      <div className="mt-4">
        <AntioquiaSubregionesPanel destacada={sub} />
      </div>
    </details>
  );
}
