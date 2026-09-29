"use client";

import { useState } from "react";
import { Database, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { medirLatencia, type EncoderResumen, type Latencia, type ResumenVectores } from "@/lib/vectores/vectores-client";
import { num } from "./sesion-requerida";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-subtle p-3">
      <p className="text-sm font-semibold tabular-nums text-label-primary">{value}</p>
      <p className="text-xs text-label-secondary">{label}</p>
    </div>
  );
}

const mb = (b: number) =>
  b < 1_048_576
    ? `${(b / 1024).toLocaleString("es-CO", { maximumFractionDigits: 0 })} KB`
    : `${(b / 1_048_576).toLocaleString("es-CO", { maximumFractionDigits: 1 })} MB`;
const ms = (x: number) => `${x.toLocaleString("es-CO", { maximumFractionDigits: 1 })} ms`;

export function IndexPanel({ indice, encoder }: { indice: NonNullable<ResumenVectores["indice"]>; encoder: EncoderResumen }) {
  const [latencia, setLatencia] = useState<Latencia | null>(null);
  const [midiendo, setMidiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function medir() {
    setMidiendo(true);
    setError(null);
    try {
      setLatencia(await medirLatencia(encoder.sha256));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMidiendo(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 font-mono text-xs text-label-secondary">
        <Database size={13} className="text-label-tertiary" />
        {indice.tabla} · pgvector {indice.tipo_columna}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Vectores de este encoder" value={num(encoder.vectores)} />
        <Stat label="Dimensiones" value={String(encoder.dimension)} />
        <Stat label="Métrica" value={indice.metrica} />
        <Stat label="Búsqueda" value={indice.busqueda.split(":")[0]} />
        <Stat label="Tabla + índices (todos los encoders)" value={mb(indice.bytes_total)} />
        <Stat label="Solo la tabla" value={mb(indice.bytes_tabla)} />
      </div>
      <ul className="space-y-0.5 text-[11px] text-label-tertiary">
        {indice.indices.map((i) => (
          <li key={i.nombre} className="font-mono">
            {i.nombre} · {i.tipo} · {mb(i.bytes)}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-label-tertiary">{indice.busqueda}.</p>

      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-label-secondary">Latencia de búsqueda</p>
          <Button variant="outline" className="text-xs" disabled={midiendo} onClick={medir}>
            <Gauge size={12} /> {midiendo ? "Midiendo…" : latencia ? "Medir de nuevo" : "Medir latencia"}
          </Button>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        {latencia ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="p50" value={ms(latencia.p50_ms)} />
              <Stat label="p95" value={ms(latencia.p95_ms)} />
            </div>
            <p className="text-[11px] text-label-tertiary">
              {latencia.consultas} búsquedas reales de los {latencia.k} vecinos más cercanos entre {num(latencia.vectores)} vectores,
              medidas desde dataset-service ({new Date(latencia.medido).toLocaleString("es-CO")}). En el teléfono la búsqueda es
              contra centroides en sqlite-vec, no contra esta tabla.
            </p>
          </>
        ) : (
          <p className="text-[11px] text-label-tertiary">Mide p50 y p95 con búsquedas reales en pgvector.</p>
        )}
      </div>
    </div>
  );
}
