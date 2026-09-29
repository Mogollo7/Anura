"use client";

import { Field, Select } from "@/components/ui/field";
import type { ResumenSubregion } from "@/lib/release/release-client";

/** Subregiones de los departamentos en ANURA, con su estado de validación (lo usa Validación y Release). */
export function SubregionPicker({
  subregiones,
  value,
  onChange,
}: {
  subregiones: ResumenSubregion[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  return (
    <Field label="Subregión (un paquete por subregión)">
      <Select value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))} className="min-w-[260px]">
        {subregiones.map((s) => (
          <option key={s.id} value={s.id}>
            {s.region_nombre} · {s.nombre} — {s.lista ? "lista" : `${s.motivos.length} pendiente${s.motivos.length === 1 ? "" : "s"}`}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** La primera subregión lista; si ninguna, la primera. */
export function subregionInicial(subregiones: ResumenSubregion[]) {
  return (subregiones.find((s) => s.lista) ?? subregiones[0])?.id ?? null;
}
