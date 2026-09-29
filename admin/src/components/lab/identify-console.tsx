"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { usePanelSession } from "@/lib/session/panel-session";
import { SesionRequerida, pct } from "@/components/vectordb/sesion-requerida";
import { PaqueteSelect } from "@/components/osr/paquete-select";
import { getFotosSimulador, getPaquetesOsr, getSimulador, identificarFoto } from "@/lib/dataset/dataset-client";
import {
  dec,
  fecha,
  type FotoSimulador,
  type OpcionesSimulador,
  type PaqueteId,
  type PaqueteOsr,
  type ResultadoSimulador,
} from "@/lib/dataset/osr";

const PARTICION: Record<string, string> = { train: "entrenamiento", val: "validación", test: "prueba" };
const particion = (p: string | null) => (p ? PARTICION[p] ?? p : "fuera del manifiesto");

/**
 * Simulador: una foto contra un paquete, sin modificarlo. Lo calcula el servidor con el vector
 * que la foto ya tiene (k-NN como el teléfono + rechazo Mahalanobis con el τ validado o propuesto).
 */
export function IdentifyConsole() {
  const session = usePanelSession();
  const [paquetes, setPaquetes] = useState<PaqueteOsr[] | null>(null);
  const [paquete, setPaquete] = useState<PaqueteId>(null);
  const [opciones, setOpciones] = useState<OpcionesSimulador | null>(null);
  const [umbral, setUmbral] = useState<"validado" | "propuesta">("validado");
  const [especieId, setEspecieId] = useState<number | null>(null);
  const [fotos, setFotos] = useState<FotoSimulador[]>([]);
  const [hayMas, setHayMas] = useState(false);
  const [sha, setSha] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoSimulador | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [corriendo, setCorriendo] = useState(false);

  useEffect(() => {
    if (!session.isReal) return;
    getPaquetesOsr()
      .then((r) => setPaquetes(r.paquetes))
      .catch((e: Error) => setError(e.message));
  }, [session.isReal]);

  useEffect(() => {
    if (!session.isReal) return;
    let cancelado = false;
    setOpciones(null);
    setResultado(null);
    setError(null);
    getSimulador(paquete)
      .then((o) => {
        if (cancelado) return;
        setOpciones(o);
        setUmbral(o.umbrales.validado ? "validado" : "propuesta");
        setEspecieId((actual) => (actual && o.especies.some((e) => e.id === actual) ? actual : o.especies.find((e) => e.en_paquete)?.id ?? o.especies[0]?.id ?? null));
      })
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [session.isReal, paquete]);

  useEffect(() => {
    if (!especieId) {
      setFotos([]);
      return;
    }
    let cancelado = false;
    setSha(null);
    setResultado(null);
    getFotosSimulador(especieId)
      .then((r) => {
        if (cancelado) return;
        setFotos(r.fotos);
        setHayMas(r.fotos.length === 24);
        setSha(r.fotos[0]?.sha256 ?? null);
      })
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [especieId]);

  if (!session.isReal) return <SesionRequerida cargando={session.cargando} que="el simulador" />;

  async function masFotos() {
    if (!especieId) return;
    try {
      const r = await getFotosSimulador(especieId, fotos.length);
      setFotos((f) => [...f, ...r.fotos]);
      setHayMas(r.fotos.length === 24);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function identificar() {
    if (!sha) return;
    setCorriendo(true);
    setError(null);
    try {
      setResultado(await identificarFoto(paquete, sha, umbral));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCorriendo(false);
    }
  }

  const delPaquete = opciones?.especies.filter((e) => e.en_paquete) ?? [];
  const ajenas = opciones?.especies.filter((e) => !e.en_paquete) ?? [];
  const u = opciones ? (umbral === "validado" ? opciones.umbrales.validado : opciones.umbrales.propuesta) : null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-label-tertiary">
        El servidor no embebe fotos nuevas (el encoder corre en el worker), así que el simulador usa fotos del dataset que ya tienen vector.
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}

      <Card className="flex flex-wrap items-end gap-4">
        {paquetes ? (
          <PaqueteSelect paquetes={paquetes} value={paquete} onChange={setPaquete} />
        ) : (
          <span className="text-sm text-label-secondary">Cargando del servidor…</span>
        )}
        {opciones && (
          <Field
            label="Umbral de rechazo"
            hint={u ? `τ ${dec(u.tau, 2)}${u.validado ? ` · validado por ${u.validado_nombre ?? "—"} · ${fecha(u.validado)}` : " · sin validar"}` : undefined}
          >
            <Select value={umbral} onChange={(e) => setUmbral(e.target.value as "validado" | "propuesta")} className="min-w-[240px]">
              <option value="validado" disabled={!opciones.umbrales.validado}>
                Validado (lo que viaja en el release)
              </option>
              <option value="propuesta" disabled={!opciones.umbrales.propuesta}>
                Propuesta sin validar (borrador)
              </option>
            </Select>
          </Field>
        )}
      </Card>

      {opciones && !opciones.umbrales.validado && !opciones.umbrales.propuesta && (
        <Card className="text-sm text-label-secondary">
          Este paquete todavía no tiene τ. Sin él la foto recibe nombre pero no se decide si se rechaza. Para empezar, calcula la propuesta en{" "}
          <Link href="/osr" className="font-medium text-accent-ink hover:underline">OSR</Link>.
        </Card>
      )}

      {opciones && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <Card className="space-y-3">
            <CardHeader className="mb-0"><CardTitle>Foto de prueba</CardTitle></CardHeader>
            {opciones.especies.length === 0 ? (
              <p className="text-sm text-label-secondary">
                Aún no hay fotos con vector. Para empezar, procesa el dataset en <Link href="/ia" className="underline">Worker</Link>.
              </p>
            ) : (
              <>
                <Field label="Especie">
                  <Select value={especieId ?? ""} onChange={(e) => setEspecieId(Number(e.target.value))}>
                    <optgroup label={`Del paquete (${delPaquete.length})`}>
                      {delPaquete.map((e) => (
                        <option key={e.id} value={e.id}>{e.nombre_cientifico} · {e.fotos} fotos</option>
                      ))}
                    </optgroup>
                    {ajenas.length > 0 && (
                      <optgroup label="Fuera del paquete (debería rechazarse)">
                        {ajenas.map((e) => (
                          <option key={e.id} value={e.id}>{e.nombre_cientifico} · {e.fotos} fotos</option>
                        ))}
                      </optgroup>
                    )}
                  </Select>
                </Field>
                <div className="grid max-h-[360px] grid-cols-4 gap-1.5 overflow-y-auto">
                  {fotos.map((f) => (
                    <button
                      key={f.sha256}
                      type="button"
                      onClick={() => {
                        setSha(f.sha256);
                        setResultado(null);
                      }}
                      title={`Partición: ${particion(f.particion)}`}
                      className={cn(
                        "relative aspect-square overflow-hidden rounded-md border-2",
                        f.sha256 === sha ? "border-accent-ink" : "border-transparent"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt="" className="h-full w-full bg-surface-subtle object-cover" loading="lazy" />
                      <span className="absolute bottom-0 left-0 right-0 bg-black/55 px-1 text-[10px] text-white">{particion(f.particion)}</span>
                    </button>
                  ))}
                </div>
                {hayMas && (
                  <Button variant="ghost" className="text-xs" onClick={masFotos}>Ver más fotos</Button>
                )}
                <Button variant="primary" disabled={!sha || corriendo} onClick={identificar}>
                  {corriendo ? "Identificando…" : "Identificar"}
                </Button>
              </>
            )}
          </Card>

          <div>
            {resultado ? (
              <ResultadoCard r={resultado} canDebug={session.can("debugTecnico")} />
            ) : (
              <Card className="text-sm text-label-secondary">
                Elige una foto. Identificar vota con los 5 vecinos más cercanos del paquete y decide con la distancia de Mahalanobis frente a τ.
                No guarda nada.
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultadoCard({ r, canDebug }: { r: ResultadoSimulador; canDebug: boolean }) {
  const ganadora = r.knn.candidatas[0];
  const nombre = r.codigo === "MATCH_SPECIES" && ganadora ? ganadora.nombre_cientifico : null;
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {r.codigo ? (
          <Badge tone={r.codigo === "MATCH_SPECIES" ? "accent" : "warning"}>{r.codigo}</Badge>
        ) : (
          <Badge tone="neutral">Sin τ: no se decide el rechazo</Badge>
        )}
        {r.acierto !== null && (
          <Badge tone={r.acierto ? "accent" : "danger"}>{r.acierto ? "Coincide con lo esperado" : "No coincide con lo esperado"}</Badge>
        )}
        <Badge tone="neutral">Esperado: {r.esperado === "su especie" ? r.foto.nombre_cientifico : "rechazo"}</Badge>
      </div>

      <div>
        <p className="text-base font-semibold text-label-primary">
          {nombre ? <span className="italic">{nombre}</span> : r.codigo === "OSR_GLOBAL" ? "Fuera del catálogo de este paquete" : ganadora ? <span className="italic">{ganadora.nombre_cientifico}</span> : "Sin vecinos"}
        </p>
        <p className="mt-1 text-sm text-label-secondary">
          Foto de <span className="italic">{r.foto.nombre_cientifico}</span> ({particion(r.foto.particion)}
          {r.foto.del_paquete ? ", especie del paquete" : ", especie fuera del paquete"}).
        </p>
      </div>

      {r.foto.particion === "train" && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          Esta foto es una referencia del paquete: su vecino más cercano es ella misma. Para medir, usa fotos de prueba o validación.
        </p>
      )}

      <ol className="space-y-2">
        <li className="rounded-md border border-border px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-label-tertiary">1 · especie (k-NN, k = {r.knn.k})</p>
          {r.knn.candidatas.length ? (
            <ul className="mt-1 space-y-0.5 text-xs text-label-secondary">
              {r.knn.candidatas.map((c) => (
                <li key={c.especie_id}>
                  <span className="italic text-label-primary">{c.nombre_cientifico}</span> · {pct(c.parte)} del voto
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-label-secondary">El paquete no tiene fotos de referencia.</p>
          )}
          <p className="mt-1 text-[11px] text-label-tertiary">
            Vecinos: {r.knn.vecinos.map((v) => `${v.nombre_cientifico} ${dec(1 - v.distancia, 3)}`).join(" · ")} (coseno)
          </p>
        </li>
        <li className="rounded-md border border-border px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-label-tertiary">
            2 · rechazo (Mahalanobis){r.rechazo ? " · decide" : ""}
          </p>
          {r.rechazo ? (
            <>
              <p className="text-sm font-medium text-label-primary">
                {r.rechazo.acepta ? "Dentro de τ: se acepta" : "Fuera de τ: se rechaza"}
              </p>
              <p className="text-xs text-label-secondary">
                Distancia {dec(r.rechazo.distancia, 2)} {r.rechazo.acepta ? "≤" : ">"} τ {dec(r.rechazo.tau, 2)}
                {r.rechazo.validado ? ` (validado por ${r.rechazo.validado_nombre ?? "—"})` : " (propuesta sin validar)"}. Media más cercana:{" "}
                <span className="italic">{r.rechazo.especie_mas_cercana.nombre_cientifico ?? "—"}</span>.
              </p>
              {r.rechazo.otro_lote && (
                <p className="mt-1 text-xs text-warning">Este τ se calibró con otro lote de centroides. Recalibra en OSR.</p>
              )}
            </>
          ) : (
            <p className="text-xs text-label-secondary">Este paquete no tiene τ de ese tipo todavía.</p>
          )}
        </li>
        <li className="rounded-md border border-border px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-label-tertiary">Centroides más parecidos</p>
          <p className="text-xs text-label-secondary">
            {r.centroides.map((c) => `${c.nombre_cientifico} ${dec(c.coseno, 3)}`).join(" · ")}
          </p>
        </li>
        {r.altitud && (
          <li className="rounded-md border border-border px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-label-tertiary">3 · altitud (informativa, no decide)</p>
            <p className="text-xs text-label-secondary">
              {r.altitud.observacion_m == null
                ? "La observación de esta foto no tiene altitud."
                : `Observación a ${Math.round(r.altitud.observacion_m).toLocaleString("es-CO")} m.`}{" "}
              {r.altitud.rango
                ? `Rango de la ficha: ${r.altitud.rango.min.toLocaleString("es-CO")}–${r.altitud.rango.max.toLocaleString("es-CO")} m (${r.altitud.rango.origen}).`
                : "La ficha técnica de la especie nombrada todavía no tiene rango de altitud."}
              {r.altitud.dentro === false && <span className="text-warning"> Fuera del rango.</span>}
            </p>
          </li>
        )}
      </ol>

      {canDebug ? (
        <p className="text-[11px] text-label-tertiary">
          Traza técnica: encoder {r.traza.encoder_sha256.slice(0, 8)}… · {r.traza.dim}-d · ‖x‖² {dec(r.traza.norma2, 4)} · lote #
          {r.traza.experimento_id}
          {r.rechazo ? ` · calibración #${r.rechazo.calibracion_id} · umbral #${r.rechazo.umbral_id}` : ""}. No se escribió nada.
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-[11px] text-label-tertiary">
          <Lock size={11} /> La traza del encoder pide el permiso Debug técnico.
        </p>
      )}
    </Card>
  );
}
