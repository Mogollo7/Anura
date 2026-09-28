"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import { usePanelSession } from "@/lib/session/panel-session";
import { calcularCentroides, getCentroides, type CentroideRegional, type LoteCentroides } from "@/lib/dataset/dataset-client";

const num = (n: number) => n.toLocaleString("es-CO");

/** Lote real (M3): centroide global L2 de las fotos de entrenamiento que ya tienen vector. */
export function RealCentroidsCard() {
  const session = usePanelSession();
  const [lote, setLote] = useState<LoteCentroides | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);

  useEffect(() => {
    if (!session.isReal) return;
    let cancelado = false;
    getCentroides()
      .then((r) => !cancelado && setLote(r))
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [session.isReal]);

  async function calcular() {
    setCalculando(true);
    setError(null);
    try {
      setLote(await calcularCentroides());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCalculando(false);
    }
  }

  if (!session.isReal) {
    return (
      <Card>
        <p className="text-sm text-label-secondary">
          {session.cargando ? "Comprobando la sesión…" : "Inicia sesión para ver los centroides del servidor."}{" "}
          {!session.cargando && (
            <Link href="/login" className="text-accent-ink underline decoration-dotted underline-offset-2">
              Iniciar sesión
            </Link>
          )}
        </p>
      </Card>
    );
  }

  const exp = lote?.experimento;
  const cobertura = exp ? `${num(exp.fotos_train_con_vector)} de ${num(exp.fotos_train)}` : null;

  return (
    <Card>
      <CardHeader className="mb-2 flex-wrap gap-2">
        <div>
          <CardTitle>Centroides del servidor</CardTitle>
          <p className="mt-1 text-xs text-label-secondary">
            Media L2 de las fotos de entrenamiento del manifiesto, con el encoder del teléfono. El supercentroide de un
            género o una familia es la media de esos centroides, un voto por especie. El regional usa solo las
            observaciones que caen dentro de la subregión (municipios de Regiones) y exige 3 individuos; si no, ese
            paquete presta el global.
          </p>
        </div>
        {session.can("ejecutarEntrenamiento") && (
          <Button variant="primary" disabled={calculando} onClick={calcular}>
            {calculando ? "Calculando…" : exp ? "Recalcular" : "Calcular centroides"}
          </Button>
        )}
      </CardHeader>

      {error && <p className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {!lote && !error && <p className="text-sm text-label-secondary">Cargando el lote…</p>}
      {lote && !exp && (
        <p className="text-sm text-label-secondary">Todavía no hay un lote. Calcula los centroides con los vectores que el worker ya guardó.</p>
      )}

      {exp && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="accent">{exp.especies} especies</Badge>
            <Badge tone="neutral">{cobertura} fotos de entrenamiento con vector</Badge>
            <Badge tone="neutral">{lote.supercentroides.generos} supercentroides de género</Badge>
            <Badge tone="neutral">{lote.supercentroides.familias} de familia</Badge>
            <span className="text-label-tertiary">
              Corrida #{exp.id} · {new Date(exp.creado).toLocaleString("es-CO")}
            </span>
          </div>
          {exp.fotos_train_con_vector < exp.fotos_train && (
            <p className="mb-3 text-xs text-label-secondary">
              El worker sigue calculando embeddings. Este lote usa solo las fotos de entrenamiento que ya tienen vector;
              vuelve a calcular cuando avance.
            </p>
          )}
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <THead>
                <tr>
                  <TH>Especie</TH>
                  <TH>Vectores</TH>
                  <TH>Observaciones</TH>
                    <TH>Dispersión</TH>
                    <TH>τ</TH>
                    <TH>Especie más cercana</TH>
                </tr>
              </THead>
              <TBody>
                {lote.especies.map((e) => (
                  <TRow key={e.nombre_cientifico}>
                    <TD className="text-xs italic">{e.nombre_cientifico}</TD>
                    <TD className="text-xs tabular-nums">{num(e.n_vectores)}</TD>
                    <TD className="text-xs tabular-nums">{num(e.n_observaciones)}</TD>
                    <TD className="text-xs tabular-nums">{e.dispersion.toFixed(3)}</TD>
                    <TD className="text-xs tabular-nums">{e.tau == null ? "—" : e.tau.toFixed(3)}</TD>
                    <TD className="text-xs">
                      {e.vecino ? (
                        <span className={e.coseno_vecino !== null && e.coseno_vecino > 0.9 ? "text-warning" : ""}>
                          <span className="italic">{e.vecino}</span>
                          {e.coseno_vecino !== null && ` · ${e.coseno_vecino.toFixed(3)}`}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TD>
                  </TRow>
                ))}
              </TBody>
            </Table>
          </div>
          <RegionalCentroids regionales={lote.regionales ?? []} />
        </>
      )}
    </Card>
  );
}

function RegionalCentroids({ regionales }: { regionales: CentroideRegional[] }) {
  const subregiones = [...new Map(regionales.map((r) => [r.subregion_id, r.subregion])).entries()];
  const [actual, setActual] = useState<number | null>(subregiones[0]?.[0] ?? null);

  if (!regionales.length) {
    return (
      <p className="mt-4 text-xs text-label-secondary">
        Esta corrida no tiene centroides regionales: se calcularon antes de ubicar las observaciones por subregión, o
        ningún departamento tiene municipios asignados en Regiones. Recalcula para obtenerlos.
      </p>
    );
  }

  const filas = regionales.filter((r) => r.subregion_id === actual);
  return (
    <div className="mt-6">
      <h4 className="text-sm font-semibold text-label-primary">Centroides regionales</h4>
      <p className="mb-3 mt-0.5 text-xs text-label-secondary">
        {regionales.filter((r) => r.propio).length} propios y {regionales.filter((r) => !r.propio).length} que prestan
        el global, en {subregiones.length} subregiones.
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Subregión">
        {subregiones.map(([id, nombre]) => {
          const propios = regionales.filter((r) => r.subregion_id === id && r.propio).length;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={actual === id}
              onClick={() => setActual(id)}
              className={
                actual === id
                  ? "rounded-full bg-accent-wash px-3 py-1 text-xs font-medium text-accent-ink"
                  : "rounded-full bg-surface-subtle px-3 py-1 text-xs font-medium text-label-secondary hover:text-label-primary"
              }
            >
              {nombre} ({propios})
            </button>
          );
        })}
      </div>
      <div className="max-h-80 overflow-y-auto">
        <Table>
          <THead>
            <tr>
              <TH>Especie</TH>
              <TH>Individuos en la subregión</TH>
              <TH>Centroide</TH>
              <TH>Dispersión</TH>
              <TH>Coseno con el global</TH>
            </tr>
          </THead>
          <TBody>
            {filas.map((r) => (
              <TRow key={r.nombre_cientifico}>
                <TD className="text-xs italic">{r.nombre_cientifico}</TD>
                <TD className="text-xs tabular-nums">{num(r.n_observaciones)}</TD>
                <TD className="text-xs">
                  {r.propio ? <Badge tone="accent">Propio</Badge> : <Badge tone="neutral">Presta el global</Badge>}
                </TD>
                <TD className="text-xs tabular-nums">{r.dispersion == null ? "—" : r.dispersion.toFixed(3)}</TD>
                <TD className="text-xs tabular-nums">{r.coseno_global == null ? "—" : r.coseno_global.toFixed(3)}</TD>
              </TRow>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
