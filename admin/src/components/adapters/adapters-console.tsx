"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Plus, Undo2, X } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { usePanelSession } from "@/lib/session/panel-session";
import {
  decidirCluster,
  getClusteres,
  retirarCluster,
  type Cluster,
  type DecisionPar,
  type PanoramaClusteres,
} from "@/lib/vectores/vectores-client";
import { SesionRequerida, num, pct } from "@/components/vectordb/sesion-requerida";

const MATRIZ_MAX = 10;

type Propuesta = { miembros: number[]; origen: Cluster["origen"]; estado: Cluster["estado"] };

/**
 * Clústeres: la matriz de confusión real (fotos de validación contra el centroide más cercano),
 * los pares que el sistema señala y las decisiones de la persona. Aceptar o descartar queda en
 * dataset.cluster y en Auditoría; al aceptar, el servidor mide ArcFace con los vectores reales.
 */
export function AdaptersConsole() {
  const session = usePanelSession();
  const puede = session.can("crearComplejo");
  const [subregion, setSubregion] = useState("");
  const [datos, setDatos] = useState<PanoramaClusteres | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);

  useEffect(() => {
    if (!session.isReal) return;
    let cancelado = false;
    getClusteres(subregion ? Number(subregion) : null)
      .then((d) => !cancelado && (setDatos(d), setError(null)))
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [session.isReal, subregion, recarga]);

  const nombre = useMemo(() => new Map((datos?.especies ?? []).map((e) => [e.id, e.nombre_cientifico])), [datos]);

  if (!session.isReal) return <SesionRequerida cargando={session.cargando} que="la matriz de clústeres" />;
  if (error && !datos) return <Card><p className="text-sm text-danger">{error}</p></Card>;
  if (!datos) return <Card><p className="text-sm text-label-secondary">Midiendo la confusión…</p></Card>;

  const recargar = () => setRecarga((n) => n + 1);
  const accion = (miembros: number[], origen: Cluster["origen"], decision: DecisionPar) =>
    decision ? (
      <Badge tone={decision.estado === "aceptado" ? "accent" : "neutral"}>
        {decision.estado === "aceptado" ? `En el clúster «${decision.nombre}»` : "Descartado"}
      </Badge>
    ) : puede ? (
      <span className="flex gap-1">
        <Button variant="outline" className="px-2 py-1 text-xs" onClick={() => setPropuesta({ miembros, origen, estado: "aceptado" })}>
          <Check size={12} /> Aceptar
        </Button>
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setPropuesta({ miembros, origen, estado: "descartado" })}>
          <X size={12} /> Descartar
        </Button>
      </span>
    ) : (
      <span className="text-xs text-label-tertiary">Pendiente</span>
    );

  return (
    <div className="space-y-6">
      {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {!datos.experimento ? (
        <Card>
          <p className="text-sm text-label-secondary">
            Aún no hay centroides, así que no hay con qué medir la confusión. Calcula un lote en{" "}
            <Link href="/centroides" className="text-accent-ink underline decoration-dotted underline-offset-2">Centroides</Link>
            {" "}(necesita vectores del{" "}
            <Link href="/ia" className="text-accent-ink underline decoration-dotted underline-offset-2">Worker</Link>).
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm text-label-primary">
                  {datos.acierto == null ? (
                    "El manifiesto no tiene fotos de validación con vector para estas especies: no hay confusión que medir."
                  ) : (
                    <>
                      {pct(datos.acierto)} de {num(datos.fotos_val ?? 0)} fotos de validación quedan en su especie con el centroide
                      más cercano.
                    </>
                  )}
                </p>
                <p className="text-xs text-label-tertiary">
                  Lote #{datos.experimento.id} · {new Date(datos.experimento.creado).toLocaleString("es-CO")} · se señala un par si se
                  confunde en {pct(datos.umbrales.confusion, 0)} o más de sus fotos, o si sus centroides tienen coseno ≥{" "}
                  {datos.umbrales.coseno.toLocaleString("es-CO")}.
                </p>
              </div>
              {datos.subregiones.length > 0 && (
                <Field label="Especies">
                  <Select value={subregion} onChange={(e) => setSubregion(e.target.value)} className="min-w-[240px]">
                    <option value="">Todas las del lote ({datos.experimento.especies})</option>
                    {datos.subregiones.map((s) => (
                      <option key={s.id} value={s.id}>{s.region} · {s.nombre}</option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader className="mb-2">
              <CardTitle>Pares que se confunden</CardTitle>
              <Badge tone={datos.pares.some((p) => p.senal && !p.decision) ? "warning" : "neutral"}>
                {datos.pares.filter((p) => p.senal).length} señalados
              </Badge>
            </CardHeader>
            <p className="mb-3 text-xs text-label-secondary">
              El sistema señala; no arma el clúster. Quién pertenece a un clúster lo decide el herpetólogo.
            </p>
            {datos.pares.length === 0 ? (
              <p className="text-sm text-label-secondary">Ningún par se confunde ni se parece lo suficiente en estas especies.</p>
            ) : (
              <Table>
                <THead>
                  <tr><TH>Par</TH><TH>Confusiones en validación</TH><TH>Tasa</TH><TH>Coseno</TH><TH>Decisión</TH></tr>
                </THead>
                <TBody>
                  {datos.pares.map((p) => (
                    <TRow key={`${p.a}-${p.b}`}>
                      <TD className="text-xs">
                        <span className="italic">{nombre.get(p.a)}</span> ↔ <span className="italic">{nombre.get(p.b)}</span>
                        {p.senal && <Badge tone="warning" className="ml-1.5 text-[10px]">Señalado</Badge>}
                      </TD>
                      <TD className="text-xs tabular-nums text-label-secondary">
                        {p.a_como_b} de {p.n_a} de la primera van a la segunda · {p.b_como_a} de {p.n_b}, al revés
                      </TD>
                      <TD className="text-xs tabular-nums">{pct(p.tasa)}</TD>
                      <TD className={cn("text-xs tabular-nums", p.coseno >= datos.umbrales.coseno && "text-warning")}>{p.coseno.toFixed(3)}</TD>
                      <TD>{accion([p.a, p.b], "matriz", p.decision)}</TD>
                    </TRow>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          <Matriz datos={datos} nombre={nombre} />

          <Card>
            <CardHeader className="mb-2"><CardTitle>Sugerencias del lote (ArcFace)</CardTitle></CardHeader>
            <p className="mb-3 text-xs text-label-secondary">
              Al calcular centroides, el servidor entrena dos prototipos con margen angular para cada par parecido o confundido y
              mide el acierto en validación. Sirve para decidir si el clúster vale la pena.
            </p>
            {datos.sugerencias.length === 0 ? (
              <p className="text-sm text-label-secondary">Este lote no sugirió ningún par.</p>
            ) : (
              <Table>
                <THead>
                  <tr><TH>Par</TH><TH>Coseno</TH><TH>Confusiones</TH><TH>Acierto antes</TH><TH>Con ArcFace</TH><TH>Decisión</TH></tr>
                </THead>
                <TBody>
                  {datos.sugerencias.map((s) => (
                    <TRow key={`${s.a}-${s.b}`}>
                      <TD className="text-xs italic">{s.nombre_a} · {s.nombre_b}</TD>
                      <TD className="text-xs tabular-nums">{s.coseno.toFixed(3)}</TD>
                      <TD className="text-xs tabular-nums">{s.confusiones} de {s.n_val}</TD>
                      <TD className="text-xs tabular-nums">{pct(s.acc_antes)}</TD>
                      <TD className="text-xs tabular-nums">{pct(s.acc_despues)}</TD>
                      <TD>{accion([s.a, s.b], "sugerido", s.decision)}</TD>
                    </TRow>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          {puede && <ClusterManual datos={datos} onProponer={(miembros) => setPropuesta({ miembros, origen: "manual", estado: "aceptado" })} />}
        </>
      )}

      <Decisiones clusteres={datos.clusteres} puede={puede} onCambio={recargar} />

      {propuesta && (
        <DialogoDecision
          propuesta={propuesta}
          nombre={(id) => nombre.get(id) ?? `Especie ${id}`}
          onCerrar={() => setPropuesta(null)}
          onHecho={() => {
            setPropuesta(null);
            recargar();
          }}
        />
      )}
      {!puede && (
        <p className="text-xs text-label-tertiary">Aceptar o descartar clústeres necesita el permiso &quot;Crear complejo críptico&quot;.</p>
      )}
    </div>
  );
}

function Matriz({ datos, nombre }: { datos: PanoramaClusteres; nombre: Map<number, string> }) {
  const [todas, setTodas] = useState(false);
  const celda = new Map(datos.celdas.map((c) => [`${c.real}>${c.asignada}`, c.n]));
  // Por defecto, solo las especies de los pares señalados (o las más confundidas).
  const enPares = [...new Set(datos.pares.flatMap((p) => [p.a, p.b]))].slice(0, MATRIZ_MAX);
  const ids = todas || enPares.length === 0 ? datos.especies.filter((e) => e.n_val > 0).map((e) => e.id) : enPares;
  if (!datos.fotos_val) return null;
  return (
    <Card>
      <CardHeader className="mb-2">
        <CardTitle>Matriz de confusión</CardTitle>
        {enPares.length > 0 && (
          <Button variant="ghost" className="text-xs" onClick={() => setTodas(!todas)}>
            {todas ? "Solo las que se confunden" : `Ver las ${datos.especies.filter((e) => e.n_val > 0).length} especies`}
          </Button>
        )}
      </CardHeader>
      <p className="mb-3 text-xs text-label-secondary">
        Filas: especie real. Columnas: centroide más cercano. Cada foto de validación cuenta una vez; «Otras» son las que se
        fueron a una especie que no está en la tabla.
      </p>
      <div className="max-h-[32rem] overflow-auto">
        <Table>
          <THead>
            <tr>
              <TH />
              {ids.map((id, j) => <TH key={id} className="text-center" title={nombre.get(id)}>{j + 1}</TH>)}
              <TH className="text-center">Otras</TH>
              <TH className="text-center">Acierto</TH>
            </tr>
          </THead>
          <TBody>
            {ids.map((id, i) => {
              const e = datos.especies.find((x) => x.id === id)!;
              const fila = ids.map((c) => celda.get(`${id}>${c}`) ?? 0);
              const otras = e.n_val - fila.reduce((a, b) => a + b, 0);
              return (
                <TRow key={id}>
                  <TD className="whitespace-nowrap text-xs">
                    <span className="text-label-tertiary">{i + 1}.</span> <span className="italic">{e.nombre_cientifico}</span>
                  </TD>
                  {fila.map((n, j) => (
                    <TD key={j} className={cn("text-center text-xs tabular-nums", i === j ? "font-semibold" : n > 0 ? "text-warning" : "text-label-tertiary")}>
                      {n}
                    </TD>
                  ))}
                  <TD className={cn("text-center text-xs tabular-nums", otras > 0 ? "text-warning" : "text-label-tertiary")}>{otras}</TD>
                  <TD className="text-center text-xs tabular-nums">{e.n_val ? pct(e.aciertos / e.n_val, 0) : "—"}</TD>
                </TRow>
              );
            })}
          </TBody>
        </Table>
      </div>
    </Card>
  );
}

function ClusterManual({ datos, onProponer }: { datos: PanoramaClusteres; onProponer: (miembros: number[]) => void }) {
  const [miembros, setMiembros] = useState<number[]>([]);
  return (
    <Card>
      <CardHeader className="mb-2"><CardTitle>Clúster a mano</CardTitle></CardHeader>
      <p className="mb-3 text-xs text-label-secondary">
        Si sabes que varias especies se parecen aunque el lote no las señale, elígelas (de 2 a 12). Al aceptarlo, el servidor
        mide ArcFace con sus vectores.
      </p>
      <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2 lg:grid-cols-3">
        {datos.especies.map((s) => (
          <label key={s.id} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={miembros.includes(s.id)}
              onChange={(e) => setMiembros(e.target.checked ? [...miembros, s.id] : miembros.filter((x) => x !== s.id))}
            />
            <span className="italic">{s.nombre_cientifico}</span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button variant="primary" className="text-xs" disabled={miembros.length < 2 || miembros.length > 12} onClick={() => onProponer(miembros)}>
          <Plus size={12} /> Proponer clúster de {miembros.length} especies
        </Button>
        {miembros.length > 12 && <span className="text-xs text-warning">Máximo 12 especies: divídelo en dos.</span>}
      </div>
    </Card>
  );
}

function DialogoDecision({
  propuesta,
  nombre,
  onCerrar,
  onHecho,
}: {
  propuesta: Propuesta;
  nombre: (id: number) => string;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const acepta = propuesta.estado === "aceptado";

  async function enviar() {
    setEnviando(true);
    setError(null);
    try {
      await decidirCluster({ ...propuesta, nombre: titulo.trim() || undefined, motivo: motivo.trim() || undefined });
      onHecho();
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogHeader
        title={acepta ? "¿Aceptar este clúster?" : "¿Descartar este clúster?"}
        description={
          acepta
            ? "Queda registrado quién lo aceptó. El servidor mide ArcFace con los vectores de entrenamiento y validación de sus miembros."
            : "El par deja de aparecer como pendiente. Queda registrado quién lo descartó y por qué."
        }
      />
      <p className="mb-3 text-sm text-label-primary">
        {propuesta.miembros.map((id) => <span key={id} className="mr-2 inline-block italic">{nombre(id)}</span>)}
      </p>
      <div className="space-y-3">
        {acepta && (
          <Field label="Nombre del clúster (opcional)" hint="Si lo dejas vacío, se nombra por el género.">
            <Input value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} />
          </Field>
        )}
        <Field label={acepta ? "Nota (opcional)" : "Motivo"}>
          <Textarea value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onCerrar}>Volver</Button>
        <Button variant={acepta ? "primary" : "danger"} disabled={enviando || (!acepta && !motivo.trim())} onClick={enviar}>
          {enviando ? (acepta ? "Midiendo…" : "Guardando…") : acepta ? "Aceptar clúster" : "Descartar"}
        </Button>
      </div>
    </Dialog>
  );
}

const ORIGEN: Record<Cluster["origen"], string> = { sugerido: "sugerencia del lote", matriz: "matriz de confusión", manual: "elegido a mano" };

function Decisiones({ clusteres, puede, onCambio }: { clusteres: Cluster[]; puede: boolean; onCambio: () => void }) {
  const [error, setError] = useState<string | null>(null);
  async function retirar(c: Cluster) {
    if (!window.confirm(`¿Retirar la decisión sobre «${c.nombre}»? Sus pares vuelven a quedar pendientes.`)) return;
    setError(null);
    try {
      await retirarCluster(c.id);
      onCambio();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Card>
      <CardHeader className="mb-2">
        <CardTitle>Decisiones</CardTitle>
        <Badge tone="neutral">{clusteres.filter((c) => c.estado === "aceptado").length} aceptados</Badge>
      </CardHeader>
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      {clusteres.length === 0 ? (
        <p className="text-sm text-label-secondary">Aún no hay clústeres decididos. Acepta o descarta un par de arriba.</p>
      ) : (
        <ul className="divide-y divide-border">
          {clusteres.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="space-y-1 text-xs">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-label-primary">{c.nombre}</span>
                  <Badge tone={c.estado === "aceptado" ? "accent" : "neutral"}>{c.estado === "aceptado" ? "Aceptado" : "Descartado"}</Badge>
                </p>
                <p className="italic text-label-secondary">{c.nombres.join(" · ")}</p>
                {c.medicion && (
                  <p className="text-label-secondary">
                    {c.medicion.acc_antes == null
                      ? c.medicion.sin_vectores.length
                        ? "Sin medir: algún miembro no tiene vectores de entrenamiento."
                        : "Sin medir: no hay fotos de validación de estos miembros."
                      : `Acierto en ${num(c.medicion.n_val)} fotos de validación: ${pct(c.medicion.acc_antes)} con centroides → ${pct(c.medicion.acc_despues)} con ArcFace (${num(c.medicion.n_train)} de entrenamiento).`}
                  </p>
                )}
                {c.motivo && <p className="text-label-secondary">«{c.motivo}»</p>}
                <p className="text-label-tertiary">
                  {ORIGEN[c.origen]} · {new Date(c.decidido_en).toLocaleString("es-CO")}
                  {c.experimento_id ? ` · lote #${c.experimento_id}` : ""} ·{" "}
                  <Link href="/auditoria" className="underline decoration-dotted underline-offset-2">ver en Auditoría</Link>
                </p>
              </div>
              {puede && (
                <Button variant="ghost" className="text-xs" onClick={() => retirar(c)}>
                  <Undo2 size={12} /> Retirar decisión
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-label-tertiary">
        Un clúster aceptado es la entrada del micro-adaptador de ese grupo. El paquete todavía no lleva la matriz W: entrenarla
        en el worker es el paso siguiente.
      </p>
    </Card>
  );
}
