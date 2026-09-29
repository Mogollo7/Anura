"use client";

import { Field, Select } from "@/components/ui/field";
import { nombrePaquete, paqueteQuery, type PaqueteId } from "@/lib/dataset/osr";
import { plural } from "@/lib/utils";

type Opcion = { id: PaqueteId; nombre: string; region: string | null; especies?: number | null };

/** Elegir paquete (todas las especies o una subregión). Lo usan OSR, Métricas y Simulador. */
export function PaqueteSelect({
  paquetes,
  value,
  onChange,
  label = "Paquete",
  hint,
}: {
  paquetes: Opcion[];
  value: PaqueteId;
  onChange: (id: PaqueteId) => void;
  label?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <Select
        value={paqueteQuery(value)}
        onChange={(e) => onChange(e.target.value === "todas" ? null : Number(e.target.value))}
        className="min-w-[260px]"
      >
        {paquetes.map((p) => (
          <option key={paqueteQuery(p.id)} value={paqueteQuery(p.id)}>
            {nombrePaquete(p)}
            {p.especies != null ? ` · ${plural(p.especies, "especie", "especies")}` : ""}
          </option>
        ))}
      </Select>
    </Field>
  );
}
