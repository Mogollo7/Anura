"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import { usePanelSession } from "@/lib/session/panel-session";
import { getMorfosCentroide, type EstadoMorfos, type MorfoCentroide } from "@/lib/vectores/vectores-client";
import { SesionRequerida, num } from "@/components/vectordb/sesion-requerida";
import { RealCentroidsCard } from "./real-centroids-card";
import { DatasetVersionCard } from "./dataset-version-card";

/** Centroides del servidor (global, regional, supercentroides) y, debajo, los de cada morfo. */
export function CentroidsConsole() {
  const [version, setVersion] = useState(0);
  return (
    <div className="space-y-6">
      <DatasetVersionCard />
      <RealCentroidsCard onCalculado={() => setVersion((v) => v + 1)} />
      <MorfosCentroides version={version} />
    </div>
  );
}

function MorfosCentroides({ version }: { version: number }) {
  const session = usePanelSession();
  const [datos, setDatos] = useState<EstadoMorfos | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session.isReal) return;
    let cancelado = false;
    getMorfosCentroide()
      .then((d) => !cancelado && (setDatos(d), setError(null)))
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [session.isReal, version]);

  if (!session.isReal) return <SesionRequerida cargando={session.cargando} que="los centroides por morfo" />;

  const morfos = datos?.morfos ?? [];
  const calculados = morfos.filter((m) => m.calculado).length;
  const desactualizados = morfos.filter((m) => m.desactualizado).length;

  return (
    <Card>
      <CardHeader className="mb-2 flex-wrap gap-2">
        <div>
          <CardTitle>Centroides por morfo</CardTitle>
          <p className="mt-1 text-xs text-label-secondary">
            Un morfo (variante de color o patrón) tiene su propio centroide cuando al menos {datos?.minimo ?? "—"} individuos
            etiquetados con él están en entrenamiento y ya tienen vector. Es la media L2 de sus fotos, sin mezclar morfos
            distintos. Con menos individuos, el paquete usa el centroide de la especie.
          </p>
        </div>
        {datos && morfos.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="accent">{calculados} con centroide</Badge>
            {morfos.length - calculados > 0 && <Badge tone="neutral">{morfos.length - calculados} sin datos suficientes</Badge>}
          </div>
        )}
      </CardHeader>

      {error && <p className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {!datos ? (
        !error && <p className="text-sm text-label-secondary">Cargando los morfos…</p>
      ) : morfos.length === 0 ? (
        <p className="text-sm text-label-secondary">
          Aún no hay morfos declarados. Para empezar, abre una especie en{" "}
          <Link href="/curacion" className="text-accent-ink underline decoration-dotted underline-offset-2">Imágenes</Link>, declara
          sus morfos por subregión y asigna el morfo a cada individuo.
        </p>
      ) : (
        <>
          {!datos.experimento && (
            <p className="mb-3 text-xs text-label-secondary">Aún no hay un lote de centroides. Calcúlalo arriba para obtener los de cada morfo.</p>
          )}
          {desactualizados > 0 && datos.experimento && (
            <p className="mb-3 flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              Las etiquetas de {desactualizados === 1 ? "1 morfo cambiaron" : `${desactualizados} morfos cambiaron`} desde el lote #
              {datos.experimento.id}. Recalcula arriba para que el centroide use los individuos de hoy.
            </p>
          )}
          <div className="max-h-[28rem] overflow-y-auto">
            <Table>
              <THead>
                <tr>
                  <TH>Especie</TH>
                  <TH>Morfo</TH>
                  <TH>Subregión</TH>
                  <TH>Individuos</TH>
                  <TH>Centroide</TH>
                  <TH>Dispersión</TH>
                  <TH>Coseno con la especie</TH>
                </tr>
              </THead>
              <TBody>
                {morfos.map((m) => (
                  <FilaMorfo key={m.id} m={m} />
                ))}
              </TBody>
            </Table>
          </div>
          <p className="mt-2 text-[11px] text-label-tertiary">
            Individuos: etiquetados en Imágenes · de ellos, en entrenamiento con vector (los que cuentan). Un coseno con la
            especie cercano a 1 dice que el morfo apenas se separa del centroide global.
          </p>
        </>
      )}
    </Card>
  );
}

function FilaMorfo({ m }: { m: MorfoCentroide }) {
  return (
    <TRow>
      <TD className="text-xs italic">
        <Link href={`/curacion?especie=${m.especie_id}`} className="hover:underline">{m.nombre_cientifico}</Link>
      </TD>
      <TD className="text-xs font-medium">{m.nombre}</TD>
      <TD className="text-xs text-label-secondary">{m.subregion}</TD>
      <TD className="text-xs tabular-nums">
        {num(m.etiquetados)} · {num(m.con_vector)}
      </TD>
      <TD className="text-xs">
        {m.calculado ? (
          <span className="flex flex-wrap items-center gap-1">
            <Badge tone="accent">Propio</Badge>
            <span className="text-label-tertiary">{num(m.n_observaciones ?? 0)} ind. · {num(m.n_vectores ?? 0)} fotos</span>
            {m.desactualizado && <Badge tone="warning">Recalcula</Badge>}
          </span>
        ) : m.faltan > 0 ? (
          <span className="text-label-secondary">
            {m.faltan === 1 ? "Falta 1 individuo" : `Faltan ${m.faltan} individuos`}
            {m.etiquetados > m.con_vector
              ? m.etiquetados - m.con_vector === 1
                ? " (1 etiquetado no cuenta: sin vector o fuera de entrenamiento)"
                : ` (${m.etiquetados - m.con_vector} etiquetados no cuentan: sin vector o fuera de entrenamiento)`
              : ""}
          </span>
        ) : (
          <Badge tone="warning">Recalcula para obtenerlo</Badge>
        )}
      </TD>
      <TD className="text-xs tabular-nums">{m.dispersion == null ? "—" : m.dispersion.toFixed(3)}</TD>
      <TD className="text-xs tabular-nums">{m.coseno_especie == null ? "—" : m.coseno_especie.toFixed(3)}</TD>
    </TRow>
  );
}
