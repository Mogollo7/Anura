"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { usePanelSession } from "@/lib/session/panel-session";
import { getResumenVectores, type ResumenVectores } from "@/lib/vectores/vectores-client";
import { SesionRequerida } from "./sesion-requerida";
import { VectorDbExplorer } from "./vector-db-explorer";

/** DB vectorial: lo que hay en dataset.embedding (pgvector), por encoder. */
export function VectorDbLive() {
  const session = usePanelSession();
  const [encoder, setEncoder] = useState<string | null>(null);
  const [resumen, setResumen] = useState<ResumenVectores | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session.isReal) return;
    let cancelado = false;
    getResumenVectores(encoder)
      .then((r) => !cancelado && (setResumen(r), setError(null)))
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [session.isReal, encoder]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">DB vectorial</h1>
        <p className="max-w-3xl text-sm text-label-secondary">
          Los vectores que el worker guardó en el servidor (pgvector, float32, normalizados L2), uno por foto y encoder.
          Solo se comparan vectores del mismo encoder. De aquí salen los centroides y la matriz de clústeres.
        </p>
        <p className="text-sm">
          <Link href="/ia" className="font-medium text-accent-ink hover:underline">Worker que los escribe</Link>
          <span className="text-label-tertiary"> · </span>
          <Link href="/centroides" className="font-medium text-accent-ink hover:underline">Centroides</Link>
        </p>
      </div>

      {!session.isReal ? (
        <SesionRequerida cargando={session.cargando} que="los vectores del servidor" />
      ) : error ? (
        <Card><p className="text-sm text-danger">{error}</p></Card>
      ) : !resumen ? (
        <Card><p className="text-sm text-label-secondary">Cargando los vectores…</p></Card>
      ) : !resumen.encoder ? (
        <Card>
          <p className="text-sm text-label-secondary">
            Aún no hay vectores. Conecta el worker y crea un trabajo de extracción en{" "}
            <Link href="/ia" className="text-accent-ink underline decoration-dotted underline-offset-2">Worker</Link>.
          </p>
        </Card>
      ) : (
        <>
          {resumen.encoders.length > 1 && (
            <Field label="Encoder">
              <Select value={resumen.encoder.sha256} onChange={(e) => setEncoder(e.target.value)} className="max-w-md">
                {resumen.encoders.map((e) => (
                  <option key={e.sha256} value={e.sha256}>
                    {e.nombre} · {e.sha256.slice(0, 12)}… · {e.vectores.toLocaleString("es-CO")} vectores
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <VectorDbExplorer resumen={resumen} />
        </>
      )}
    </div>
  );
}
