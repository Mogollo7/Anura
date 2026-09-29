"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Lock, RotateCcw, ShieldCheck } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import { cn, plural } from "@/lib/utils";
import { usePanelSession } from "@/lib/session/panel-session";
import { SesionRequerida, pct } from "@/components/vectordb/sesion-requerida";
import { calibrarOsr, getOsr, validarOsr } from "@/lib/dataset/dataset-client";
import { dec, fecha, tasaAceptadas, type CalibracionOsr, type EstadoOsr, type PaqueteId } from "@/lib/dataset/osr";
import { PaqueteSelect } from "./paquete-select";

const KAR_OPCIONES = [0.9, 0.95, 0.975, 0.99];

/**
 * OSR real: el servidor calcula τ con los vectores de pgvector (Mahalanobis + Ledoit-Wolf, el
 * mismo rechazo del teléfono) y lo propone; una persona con "Configurar OSR técnico" lo valida
 * tal cual o ajustado. La validación queda en el servidor con su auditoría.
 */
export function OsrConsole() {
  const session = usePanelSession();
  const puede = session.can("configurarOSR");
  const [paquete, setPaquete] = useState<PaqueteId>(null);
  const [estado, setEstado] = useState<EstadoOsr | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [karObjetivo, setKarObjetivo] = useState(0.95);
  const [calculando, setCalculando] = useState(false);

  const cargar = useCallback((id: PaqueteId) => {
    setError(null);
    getOsr(id)
      .then((e) => {
        setEstado(e);
        if (e.calibracion) setKarObjetivo(e.calibracion.kar_objetivo);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (session.isReal) cargar(paquete);
  }, [session.isReal, paquete, cargar]);

  if (!session.isReal) return <SesionRequerida cargando={session.cargando} que="la calibración OSR del servidor" />;

  async function calcular() {
    setCalculando(true);
    setError(null);
    try {
      setEstado(await calibrarOsr(paquete, karObjetivo));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCalculando(false);
    }
  }

  const c = estado?.calibracion ?? null;
  const vigente = estado?.vigente ?? null;
  const vigenteVencido = !!vigente && !!estado?.experimento && vigente.experimento_id !== estado.experimento.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {estado ? (
          <PaqueteSelect paquetes={estado.paquetes} value={paquete} onChange={setPaquete} label="Paquete (una calibración por paquete)" />
        ) : (
          <span className="text-sm text-label-secondary">{error ? "" : "Cargando del servidor…"}</span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {vigente ? (
            <Badge tone={vigenteVencido ? "warning" : "accent"}>
              <ShieldCheck size={12} /> τ vigente {dec(vigente.tau, 2)} · {vigente.validado_nombre ?? "sin nombre"} · {fecha(vigente.validado)}
            </Badge>
          ) : (
            <Badge tone="neutral">Sin τ validado</Badge>
          )}
          {estado?.propuesta && <Badge tone="warning">Propuesta sin validar: τ {dec(estado.propuesta.tau, 2)}</Badge>}
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {vigenteVencido && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          El τ vigente se validó con otro lote de centroides (#{vigente!.experimento_id}; el vigente es #{estado!.experimento!.id}). Calcula una
          propuesta nueva y valídala antes de compilar.
        </p>
      )}

      {estado && !estado.experimento ? (
        <Card className="text-sm text-label-secondary">
          Aún no hay centroides en el servidor. Para empezar, calcúlalos en{" "}
          <Link href="/centroides" className="font-medium text-accent-ink hover:underline">Centroides</Link>: la calibración usa sus
          mismas fotos de entrenamiento.
        </Card>
      ) : estado ? (
        <>
          <Card>
            <CardHeader className="mb-2 flex-wrap gap-2">
              <div>
                <CardTitle>Calcular la propuesta</CardTitle>
                <p className="mt-1 max-w-3xl text-xs text-label-secondary">
                  Distancia de Mahalanobis mínima a las medias de las especies del paquete, con la covarianza Ledoit-Wolf de las fotos de
                  entrenamiento (igual que el teléfono). τ es el percentil del KAR objetivo en la partición val; KAR, FAR y AUROC se miden en
                  test y con fotos reales de especies que el paquete no trae.
                </p>
              </div>
            </CardHeader>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="KAR objetivo" hint="Fracción de fotos de especies del paquete que deben pasar.">
                <select
                  className="w-40 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-label-primary disabled:opacity-60"
                  value={karObjetivo}
                  disabled={!puede}
                  onChange={(e) => setKarObjetivo(Number(e.target.value))}
                >
                  {KAR_OPCIONES.map((k) => (
                    <option key={k} value={k}>{pct(k)}</option>
                  ))}
                </select>
              </Field>
              <Button variant="primary" disabled={!puede || calculando} onClick={calcular}>
                {puede ? null : <Lock size={12} />} {calculando ? "Calculando…" : c ? "Recalcular propuesta" : "Calcular propuesta"}
              </Button>
            </div>
            {!puede && (
              <p className="mt-2 text-xs text-label-tertiary">
                <Lock size={11} className="mr-1 inline" />
                Puedes revisar la calibración; calcularla o validarla pide el permiso &quot;Configurar OSR técnico&quot;.
              </p>
            )}
          </Card>

          {c ? (
            <Calibracion
              key={c.id}
              c={c}
              propuesta={estado.propuesta?.calibracion_id === c.id}
              puede={puede}
              onValidado={setEstado}
              experimentoVigente={estado.experimento?.id ?? null}
            />
          ) : (
            <Card className="text-sm text-label-secondary">
              Aún no hay una calibración para este paquete. Para empezar, calcula la propuesta: el servidor mide τ con las fotos de validación
              y te muestra cuántas conocidas pasan y cuántas desconocidas se cuelan.
            </Card>
          )}

          <Historial estado={estado} />
          <p className="text-[11px] text-label-tertiary">
            La capa 2 (ε de cada clúster) se decide en <Link href="/micro-adaptadores" className="underline">Clústeres</Link>. El simulador aplica el τ
            validado a una foto: <Link href="/laboratorio" className="underline">Simulador</Link>.
          </p>
        </>
      ) : null}
    </div>
  );
}

function Calibracion({
  c,
  propuesta,
  puede,
  onValidado,
  experimentoVigente,
}: {
  c: CalibracionOsr;
  propuesta: boolean;
  puede: boolean;
  onValidado: (e: EstadoOsr) => void;
  experimentoVigente: number | null;
}) {
  const r = c.resultado;
  const [borrador, setBorrador] = useState(String(Number(c.tau_propuesto.toFixed(4))));
  const [nota, setNota] = useState("");
  const [validando, setValidando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tau = Number(borrador);
  const valido = borrador.trim() !== "" && Number.isFinite(tau) && tau > 0;
  const manual = valido && Math.abs(tau - c.tau_propuesto) > 1e-4;
  const karBorrador = valido ? tasaAceptadas(r.puntajes.conocidas, tau) : null;
  const farBorrador = valido ? tasaAceptadas(r.puntajes.desconocidas, tau) : null;
  const sinDesconocidas = c.n_desconocidas === 0;
  const otroLote = experimentoVigente !== null && c.experimento_id !== experimentoVigente;

  async function validar() {
    setValidando(true);
    setError(null);
    try {
      onValidado(await validarOsr(c.id, tau, nota.trim() || undefined));
      setNota("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setValidando(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="mb-2 flex-wrap gap-2">
          <CardTitle>Propuesta del servidor</CardTitle>
          <Badge tone={propuesta ? "warning" : "neutral"}>
            Calibración #{c.id} · {fecha(c.creado)}
          </Badge>
        </CardHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label={`τ propuesto (KAR ${pct(c.kar_objetivo)})`} value={dec(c.tau_propuesto, 2)} />
          <Stat label={`KAR medido (${c.particion_medida})`} value={pct(r.kar)} tone={r.kar != null && r.kar < 0.8 ? "text-warning" : undefined} />
          <Stat label="FAR (desconocidas aceptadas)" value={pct(r.far)} tone={r.far != null && r.far > 0.2 ? "text-warning" : undefined} />
          <Stat label="AUROC" value={dec(r.auroc, 4)} />
          <Stat label="Especie más cercana correcta" value={pct(r.acierto_entre_aceptadas)} sub="entre las conocidas aceptadas" />
        </div>
        <p className="mt-3 text-xs text-label-tertiary">
          {plural(c.especies, "especie", "especies")} · {plural(c.n_train, "foto", "fotos")} de entrenamiento (covarianza, contracción{" "}
          {dec(c.shrinkage, 3)}) · {c.n_calibracion.toLocaleString("es-CO")} de calibración (val) · {c.n_conocidas.toLocaleString("es-CO")}{" "}
          medidas ({c.particion_medida}) · {c.n_desconocidas.toLocaleString("es-CO")} de especies fuera del paquete · lote de centroides #
          {c.experimento_id}
        </p>
        {c.particion_medida === "val" && (
          <p className="mt-1 text-xs text-warning">
            Las especies de este paquete no tienen fotos en test: el KAR se midió en val, la misma partición que fijó τ, y sale optimista.
          </p>
        )}
        {sinDesconocidas && (
          <p className="mt-1 text-xs text-warning">
            No hay fotos de especies fuera de este paquete: sin ellas no se mide FAR ni AUROC. Suben al elegir una subregión (las especies de
            otras subregiones cuentan como desconocidas) o al cargar especies que el catálogo no trae.
          </p>
        )}
        {otroLote && (
          <p className="mt-1 text-xs text-warning">Los centroides cambiaron después de esta calibración. Recalcula la propuesta antes de validar.</p>
        )}
      </Card>

      <Card>
        <CardHeader className="mb-2"><CardTitle>Puntos de operación</CardTitle></CardHeader>
        <p className="mb-2 text-xs text-label-tertiary">
          τ más alto acepta más fotos del paquete y deja pasar más desconocidas. Elige uno o escribe el tuyo abajo.
        </p>
        <Table>
          <THead>
            <tr><TH>KAR objetivo</TH><TH className="text-right">τ</TH><TH className="text-right">KAR medido</TH><TH className="text-right">FAR</TH><TH /></tr>
          </THead>
          <TBody>
            {r.puntos.map((p) => (
              <TRow key={p.kar_objetivo} className={cn(Math.abs(p.tau - tau) < 1e-4 && "bg-surface-subtle")}>
                <TD className="text-xs tabular-nums">{pct(p.kar_objetivo)}</TD>
                <TD className="text-right text-xs tabular-nums">{dec(p.tau, 2)}</TD>
                <TD className="text-right text-xs tabular-nums">{pct(p.kar)}</TD>
                <TD className="text-right text-xs tabular-nums">{pct(p.far)}</TD>
                <TD className="text-right">
                  <Button variant="ghost" className="px-2 py-1 text-xs" disabled={!puede} onClick={() => setBorrador(String(p.tau))}>
                    Usar
                  </Button>
                </TD>
              </TRow>
            ))}
          </TBody>
        </Table>
        {r.coseno && (
          <p className="mt-3 text-xs text-label-secondary">
            Con los mismos vectores, el camino coseno + Weibull (τ por especie de Centroides) da KAR {pct(r.coseno.kar)}, FAR{" "}
            {pct(r.coseno.far)} y AUROC {dec(r.coseno.auroc, 4)}. El teléfono usa Mahalanobis.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader className="mb-2"><CardTitle>Validar τ</CardTitle></CardHeader>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="τ (distancia de Mahalanobis)" error={!valido ? "Escribe un número mayor que 0" : undefined}>
            <Input type="number" step={0.01} min={0} className="w-40" value={borrador} disabled={!puede} onChange={(e) => setBorrador(e.target.value)} />
          </Field>
          <Field label="Nota (opcional)" className="min-w-[240px] flex-1">
            <Input value={nota} disabled={!puede} maxLength={500} placeholder="Por qué este τ" onChange={(e) => setNota(e.target.value)} />
          </Field>
          <Button variant="primary" disabled={!puede || !valido || validando || otroLote} onClick={validar}>
            {puede ? <ShieldCheck size={13} /> : <Lock size={12} />} {validando ? "Validando…" : "Validar τ"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-label-secondary">
          Con τ {valido ? dec(tau, 2) : "—"}: pasan {pct(karBorrador)} de las fotos del paquete ({c.particion_medida}) y se cuelan{" "}
          {sinDesconocidas ? "— (sin desconocidas)" : pct(farBorrador)} de las desconocidas.
          {manual && (
            <span className="ml-1 inline-flex items-center gap-1 text-warning">
              Ajuste manual (propuesto {dec(c.tau_propuesto, 2)})
              <button type="button" className="inline-flex items-center gap-0.5 underline" onClick={() => setBorrador(String(Number(c.tau_propuesto.toFixed(4))))}>
                <RotateCcw size={10} /> volver
              </button>
            </span>
          )}
        </p>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader className="mb-2"><CardTitle>Por especie</CardTitle></CardHeader>
          <div className="max-h-[420px] overflow-y-auto">
            <Table>
              <THead>
                <tr>
                  <TH>Especie</TH><TH className="text-right">Individuos</TH><TH className="text-right">Train / val / medidas</TH>
                  <TH className="text-right">Pasa con τ propuesto</TH><TH className="text-right">Distancia mediana</TH>
                </tr>
              </THead>
              <TBody>
                {[...r.especies].sort((a, b) => (a.kar ?? 2) - (b.kar ?? 2)).map((e) => (
                  <TRow key={e.especie_id}>
                    <TD className="text-xs italic">{e.nombre_cientifico}</TD>
                    <TD className="text-right text-xs tabular-nums">{e.n_observaciones}</TD>
                    <TD className="text-right text-xs tabular-nums">{e.n_train} / {e.n_val} / {e.n_medidas}</TD>
                    <TD className={cn("text-right text-xs tabular-nums", e.kar != null && e.kar < 0.8 && "text-warning")}>{pct(e.kar)}</TD>
                    <TD className="text-right text-xs tabular-nums">{dec(e.mediana, 2)}</TD>
                  </TRow>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
        <Card>
          <CardHeader className="mb-2"><CardTitle>Desconocidas usadas</CardTitle></CardHeader>
          {r.desconocidas.length === 0 ? (
            <p className="text-sm text-label-secondary">Ninguna: todas las especies con fotos están en este paquete.</p>
          ) : (
            <ul className="divide-y divide-border text-xs">
              {r.desconocidas.map((d) => (
                <li key={d.especie_id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate italic" title={d.nombre_cientifico}>{d.nombre_cientifico}</span>
                  <span className={cn("shrink-0 tabular-nums", d.se_cuelan > 0 ? "text-warning" : "text-label-secondary")}>
                    {d.se_cuelan} de {d.fotos} se cuelan
                  </span>
                </li>
              ))}
            </ul>
          )}
          {r.se_cuelan_en.length > 0 && (
            <p className="mt-3 text-xs text-label-secondary">
              Entran por: {r.se_cuelan_en.slice(0, 4).map((s) => `${s.nombre_cientifico} (${s.fotos})`).join(" · ")}
            </p>
          )}
        </Card>
      </div>
    </>
  );
}

function Historial({ estado }: { estado: EstadoOsr }) {
  if (!estado.historial.length) return null;
  return (
    <Card>
      <CardHeader className="mb-2"><CardTitle>Validaciones de este paquete</CardTitle></CardHeader>
      <Table>
        <THead>
          <tr><TH>Fecha</TH><TH className="text-right">τ</TH><TH className="text-right">KAR</TH><TH className="text-right">FAR</TH><TH>Validó</TH><TH>Nota</TH></tr>
        </THead>
        <TBody>
          {estado.historial.map((u, i) => (
            <TRow key={u.id} className={cn(i === 0 && "font-medium")}>
              <TD className="text-xs">{fecha(u.validado)}{i === 0 ? " · vigente" : ""}</TD>
              <TD className="text-right text-xs tabular-nums">{dec(u.tau, 2)}</TD>
              <TD className="text-right text-xs tabular-nums">{pct(u.kar)}</TD>
              <TD className="text-right text-xs tabular-nums">{pct(u.far)}</TD>
              <TD className="text-xs">{u.validado_nombre ?? "—"}</TD>
              <TD className="text-xs text-label-secondary">{u.nota ?? ""}</TD>
            </TRow>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-xs text-label-tertiary">{label}</p>
      <p className={cn("text-base font-semibold tabular-nums", tone ?? "text-label-primary")}>{value}</p>
      {sub && <p className="text-[11px] text-label-tertiary">{sub}</p>}
    </div>
  );
}
