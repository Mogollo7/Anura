"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Lock, Play } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePanelSession } from "@/lib/session/panel-session";
import { SesionRequerida, pct } from "@/components/vectordb/sesion-requerida";
import { evaluarPaquete, getEvaluacion, getEvaluaciones } from "@/lib/dataset/dataset-client";
import {
  dec,
  fecha,
  nombrePaquete,
  paqueteQuery,
  paresConfundidos,
  type DetalleEvaluacion,
  type PaqueteEvaluado,
  type PaqueteId,
} from "@/lib/dataset/osr";
import { ConfusionMatrix } from "./confusion-matrix";
import { SpeciesResultsTable } from "./species-results-table";
import { SimilarSpeciesList } from "./similar-species";

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md bg-surface-subtle p-3">
      <p className="text-lg font-semibold tabular-nums text-label-primary">{value}</p>
      <p className="text-xs text-label-secondary">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-label-tertiary">{hint}</p>}
    </div>
  );
}

/**
 * Métricas reales: cada evaluación la calcula el servidor con las fotos de test de las especies
 * del paquete contra sus centroides vigentes. Aquí solo se leen y se piden nuevas (auditadas).
 */
export function ValidationExplorer() {
  const session = usePanelSession();
  const puede = session.can("ejecutarEntrenamiento");
  const [lista, setLista] = useState<{ experimento: { id: number } | null; paquetes: PaqueteEvaluado[] } | null>(null);
  const [elegido, setElegido] = useState<PaqueteId>(null);
  const [detalle, setDetalle] = useState<DetalleEvaluacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [evaluando, setEvaluando] = useState(false);

  const cargar = useCallback(() => {
    getEvaluaciones()
      .then(setLista)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (session.isReal) cargar();
  }, [session.isReal, cargar]);

  const paquete = lista?.paquetes.find((p) => p.id === elegido) ?? null;
  const evaluacionId = paquete?.evaluacion_id ?? null;

  useEffect(() => {
    if (!evaluacionId) {
      setDetalle(null);
      return;
    }
    let cancelado = false;
    getEvaluacion(evaluacionId)
      .then((d) => !cancelado && setDetalle(d))
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [evaluacionId]);

  const pares = useMemo(() => (detalle ? paresConfundidos(detalle.filas) : []), [detalle]);

  if (!session.isReal) return <SesionRequerida cargando={session.cargando} que="las métricas del servidor" />;

  async function evaluar() {
    setEvaluando(true);
    setError(null);
    try {
      const d = await evaluarPaquete(elegido);
      setDetalle(d);
      cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEvaluando(false);
    }
  }

  if (!lista) {
    return <Card className="text-sm text-label-secondary">{error ?? "Cargando del servidor…"}</Card>;
  }

  const ev = detalle?.evaluacion;
  const peores = detalle ? [...detalle.filas].filter((f) => f.soporte > 0).sort((a, b) => a.top1 / a.soporte - b.top1 / b.soporte).slice(0, 3) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Paquete">
        {lista.paquetes.map((p) => (
          <button
            key={paqueteQuery(p.id)}
            type="button"
            role="tab"
            aria-selected={p.id === elegido}
            onClick={() => setElegido(p.id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              p.id === elegido ? "bg-cta-bg text-cta-fg" : "bg-surface-subtle text-label-secondary hover:text-label-primary"
            )}
          >
            {nombrePaquete(p)}
            {p.top1 != null ? ` · ${pct(p.top1, 0)}` : ""}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-label-primary">{paquete ? nombrePaquete(paquete) : "Paquete"}</h2>
            <p className="text-xs text-label-secondary">
              {ev
                ? `${ev.especies} especies · ${ev.n.toLocaleString("es-CO")} fotos de ${ev.particion} · lote de centroides #${ev.experimento_id} · ${fecha(ev.creado)}`
                : "Sin evaluación todavía."}
            </p>
          </div>
          <Button variant="primary" disabled={!puede || evaluando || !lista.experimento} onClick={evaluar}>
            {puede ? <Play size={13} /> : <Lock size={12} />} {evaluando ? "Evaluando…" : "Evaluar ahora"}
          </Button>
        </div>
        {!puede && (
          <p className="mt-2 text-xs text-label-tertiary">Evaluar pide el permiso &quot;Ejecutar entrenamiento&quot;. Puedes leer las evaluaciones guardadas.</p>
        )}
        {!lista.experimento && (
          <p className="mt-3 text-sm text-label-secondary">
            Aún no hay centroides en el servidor. Para empezar, calcúlalos en{" "}
            <Link href="/centroides" className="font-medium text-accent-ink hover:underline">Centroides</Link> y vuelve a evaluar.
          </p>
        )}
        {lista.experimento && !ev && (
          <p className="mt-3 text-sm text-label-secondary">
            Evalúa este paquete para ver top-1, top-3 y la matriz de confusión. Se mide con las fotos de la partición test contra los centroides
            vigentes.
          </p>
        )}
        {detalle && !detalle.vigente && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-warning">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            Los centroides cambiaron después de esta evaluación. Evalúa de nuevo para medir el lote vigente.
          </p>
        )}

        {detalle && ev && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Metric label="Top-1" value={pct(ev.top1)} hint="especie correcta en primer lugar" />
              <Metric label="Top-3" value={pct(ev.top3)} hint="entre las tres más parecidas" />
              <Metric label="KAR" value={pct(detalle.osr?.kar)} hint={detalle.osr ? `τ validado ${dec(detalle.osr.tau, 2)}` : "sin τ validado"} />
              <Metric label="FAR" value={pct(detalle.osr?.far)} hint="desconocidas aceptadas" />
              <Metric label="AUROC open set" value={dec(detalle.osr?.auroc, 4)} />
            </div>
            {!detalle.osr && (
              <p className="mt-2 text-xs text-label-tertiary">
                KAR, FAR y AUROC salen del τ validado en <Link href="/osr" className="underline">OSR</Link>; este paquete todavía no tiene uno.
              </p>
            )}
            {peores.length > 0 && (
              <p className="mt-4 border-t border-border pt-3 text-xs text-label-secondary">
                Top-1 más bajo:{" "}
                {peores.map((f) => (
                  <span key={f.especie_id} className="mr-2">
                    <span className="italic">{f.nombre_cientifico}</span> {pct(f.top1 / f.soporte, 0)}
                  </span>
                ))}
              </p>
            )}
          </>
        )}
      </Card>

      {detalle && (
        <>
          <Card>
            <CardHeader><CardTitle>Matriz de confusión</CardTitle><Badge tone="neutral">top-1, fotos de test</Badge></CardHeader>
            <ConfusionMatrix filas={detalle.filas} />
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader><CardTitle>Resultados por especie</CardTitle></CardHeader>
              <SpeciesResultsTable filas={detalle.filas} />
            </Card>
            <Card>
              <CardHeader><CardTitle>Pares más confundidos</CardTitle></CardHeader>
              <SimilarSpeciesList pares={pares} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
