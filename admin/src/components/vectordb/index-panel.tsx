import { Database } from "lucide-react";
import type { IndexInfo } from "@/lib/mock/vector-db";
import { ENCODER } from "@/lib/worker/encoder";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-subtle p-3">
      <p className="text-lg font-semibold tabular-nums text-label-primary">{value}</p>
      <p className="text-xs text-label-secondary">{label}</p>
    </div>
  );
}

export function IndexPanel({ info }: { info: IndexInfo }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 font-mono text-xs text-label-secondary">
        <Database size={13} className="text-label-tertiary" />
        {info.tabla} · sqlite-vec (vec0)
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Encoder" value={ENCODER.id} />
        <Stat label="Dimensiones" value={`${info.dimensiones}`} />
        <Stat label="Métrica" value={info.metrica} />
        <Stat label="Tipo de índice" value={info.tipo} />
        <Stat label="Vectores" value={info.vectores.toLocaleString("es-CO")} />
        <Stat label="Tamaño del índice" value={`${info.tamanoIndiceMb} MB`} />
        <Stat label="Construcción" value={`${info.construccionMs.toLocaleString("es-CO")} ms`} />
        <Stat label="Latencia p50" value={`${info.latenciaP50Ms} ms`} />
        <Stat label="Latencia p95" value={`${info.latenciaP95Ms} ms`} />
      </div>
      <p className="text-[11px] text-label-tertiary">
        El conteo de vectores es el de la membresía curada con el tope del worker, encoder {ENCODER.id}. Un vector del BioCLIP 2.5 del servidor (1024) no entra en esta colección ni en el paquete del teléfono.
      </p>
    </div>
  );
}
