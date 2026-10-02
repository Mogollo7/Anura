"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronRight, Cpu, Play, Square } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/field";
import { cn, plural } from "@/lib/utils";
import { usePanelSession } from "@/lib/session/panel-session";
import {
  cancelarTrabajo,
  crearTrabajoEmbeddings,
  getErroresTrabajo,
  getTrabajos,
  type ErrorTrabajo,
  type EstadoWorker,
  type Trabajo,
} from "@/lib/dataset/dataset-client";
import { getResumenVectores, type EspecieVectores } from "@/lib/vectores/vectores-client";
import { Barra, SesionRequerida, hace, num } from "@/components/vectordb/sesion-requerida";

const ESTADO: Record<Trabajo["estado"], { texto: string; tono: "neutral" | "accent" | "warning" | "danger" | "info" }> = {
  pendiente: { texto: "Esperando worker", tono: "info" },
  en_curso: { texto: "En curso", tono: "accent" },
  hecho: { texto: "Hecho", tono: "neutral" },
  fallido: { texto: "Falló", tono: "danger" },
  cancelado: { texto: "Cancelado", tono: "warning" },
};

function duracion(desde: string, hasta: string | null) {
  const s = Math.max(0, Math.round(((hasta ? new Date(hasta) : new Date()).getTime() - new Date(desde).getTime()) / 1000));
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toLocaleString("es-CO", { maximumFractionDigits: 1 })} h`;
}

const corto = (sha: string | null) => (sha ? `${sha.slice(0, 12)}…` : "—");

function estimadoRestante(t: Trabajo) {
  if (t.estado !== "en_curso" || !t.empezado || !t.total || !t.hechos) return null;
  const transcurrido = Date.now() - new Date(t.empezado).getTime();
  const restante = Math.max(0, (transcurrido * (t.total - t.hechos)) / t.hechos);
  return duracion(new Date().toISOString(), new Date(Date.now() + restante).toISOString());
}

/**
 * Worker de embeddings, real: los workers que se han reportado (model-service en el PC con GPU),
 * los encoders que registraron, la cola y el historial de trabajos, las fotos que fallaron, y
 * crear o cancelar trabajos. Todo sale de dataset-service (dataset.worker, encoder, trabajo…).
 */
export function WorkerConsole() {
  const session = usePanelSession();
  const puedeCorrer = session.can("ejecutarEntrenamiento");
  const [datos, setDatos] = useState<EstadoWorker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [trabajando, setTrabajando] = useState(false);
  const [cancelando, setCancelando] = useState<Trabajo | null>(null);

  const hayActivo = !!datos?.trabajos.some((t) => t.estado === "pendiente" || t.estado === "en_curso");

  useEffect(() => {
    if (!session.isReal) return;
    let cancelado = false;
    const cargar = () =>
      getTrabajos()
        .then((d) => {
          if (!cancelado) {
            setDatos(d);
            setError(null);
          }
        })
        .catch((e: Error) => !cancelado && setError(e.message));
    cargar();
    // Mientras un trabajo anda, el avance se refresca solo; si no, basta con ver si un worker sigue vivo.
    const id = setInterval(cargar, hayActivo ? 4000 : 15000);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, [session.isReal, recarga, hayActivo]);

  const accion = useCallback(async (fn: () => Promise<string | void>) => {
    setTrabajando(true);
    setAviso(null);
    try {
      const texto = await fn();
      setError(null);
      if (texto) setAviso(texto);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTrabajando(false);
      setCancelando(null);
      setRecarga((n) => n + 1);
    }
  }, []);

  if (!session.isReal) return <SesionRequerida cargando={session.cargando} que="el worker y sus trabajos" />;
  if (!datos) {
    return (
      <Card>
        {error ? <p className="text-sm text-danger">{error}</p> : <p className="text-sm text-label-secondary">Cargando el worker…</p>}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {aviso && <p className="rounded-md bg-accent-wash px-3 py-2 text-sm text-accent-ink">{aviso}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Workers datos={datos} />
        <Encoders datos={datos} />
      </div>

      {puedeCorrer ? (
        <NuevoTrabajo datos={datos} trabajando={trabajando} onCrear={(encoder, especie) =>
          accion(async () => {
            const r = await crearTrabajoEmbeddings(encoder, especie ?? undefined);
            return `Trabajo #${r.id} creado: ${num(r.total)} fotos por calcular. El worker lo toma en su próxima consulta (cada 15 s).`;
          })
        } />
      ) : (
        <p className="text-xs text-label-tertiary">
          Crear o cancelar trabajos necesita el permiso &quot;Ejecutar entrenamiento&quot; (se asigna en Sistema → Roles y permisos).
        </p>
      )}

      <Trabajos datos={datos} puedeCorrer={puedeCorrer} onCancelar={setCancelando} />

      <Dialog open={!!cancelando} onOpenChange={(o) => !o && setCancelando(null)}>
        <DialogHeader
          title={`¿Cancelar el trabajo #${cancelando?.id}?`}
          description="Los vectores ya calculados se quedan. Un trabajo nuevo sigue desde las fotos que falten."
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setCancelando(null)}>
            Seguir corriendo
          </Button>
          <Button
            variant="danger"
            loading={trabajando}
            disabled={trabajando}
            onClick={() => cancelando && accion(async () => {
              await cancelarTrabajo(cancelando.id);
              return `Trabajo #${cancelando.id} cancelado.`;
            })}
          >
            Cancelar trabajo
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function Workers({ datos }: { datos: EstadoWorker }) {
  const encoderNombre = new Map(datos.encoders.map((e) => [e.sha256, e.nombre]));
  return (
    <Card>
      <CardHeader className="mb-2">
        <CardTitle><Cpu size={14} className="mr-1.5 inline" aria-hidden />Workers</CardTitle>
        <Badge tone="neutral">{datos.workers.length}</Badge>
      </CardHeader>
      {datos.workers.length === 0 ? (
        <p className="text-sm text-label-secondary">
          Aún no se ha conectado ningún worker. Arranca model-service en el PC con GPU (
          <span className="font-mono text-xs">docker compose -f docker-compose.model.yml --profile model up -d</span>): al
          arrancar registra su encoder aquí y pide trabajo cada 15 s.
        </p>
      ) : (
        <ul className="space-y-3">
          {datos.workers.map((w) => {
            const vivo = w.segundos_sin_ver < datos.worker_vivo_s;
            return (
              <li key={w.nombre} className="space-y-0.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-label-primary">{w.nombre}</span>
                  <Badge tone={vivo ? "accent" : "warning"}>{vivo ? "Conectado" : "Sin contacto"}</Badge>
                  {w.trabajo_en_curso && <Badge tone="info">Trabajo #{w.trabajo_en_curso}</Badge>}
                </div>
                <p className="text-xs text-label-secondary">
                  Último latido {hace(w.segundos_sin_ver)} ({new Date(w.visto).toLocaleString("es-CO")})
                  {" · "}encoder {w.encoder_sha256 ? `${encoderNombre.get(w.encoder_sha256) ?? ""} ${corto(w.encoder_sha256)}` : "—"}
                </p>
                <p className="text-xs text-label-tertiary">
                  {w.info.proveedor?.replace("ExecutionProvider", "") ?? "Proveedor sin reportar"}
                  {w.info.ms_por_foto ? ` · ${num(w.info.ms_por_foto)} ms por foto (último lote)` : ""}
                  {w.info.onnxruntime ? ` · onnxruntime ${w.info.onnxruntime}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-label-tertiary">
        El worker no abre puertos: pide trabajo al servidor, baja de ahí cada foto y le devuelve el vector. Si deja de
        latir {Math.round(datos.latido_vencido_s / 60)} min, otro worker (o él mismo al volver) retoma el trabajo donde iba.
      </p>
    </Card>
  );
}

function Encoders({ datos }: { datos: EstadoWorker }) {
  return (
    <Card>
      <CardHeader className="mb-2">
        <CardTitle>Encoders registrados</CardTitle>
        <Badge tone="neutral">{num(datos.fotos)} fotos en el dataset</Badge>
      </CardHeader>
      {datos.encoders.length === 0 ? (
        <p className="text-sm text-label-secondary">
          Aún no hay encoders. El worker registra el suyo (el mismo ONNX del teléfono) la primera vez que se conecta.
        </p>
      ) : (
        <ul className="space-y-4">
          {datos.encoders.map((e) => (
            <li key={e.sha256} className="space-y-1.5">
              <p className="text-sm text-label-primary">
                <span className="font-medium">{e.nombre}</span>{" "}
                <span className="text-label-secondary">· {e.archivo} · {e.dimension} dimensiones</span>
              </p>
              <p className="text-xs text-label-tertiary">
                sha256 <span className="break-all font-mono">{e.sha256}</span>
                <br />
                {e.preprocesado} · {e.normalizacion} · registrado {new Date(e.registrado).toLocaleDateString("es-CO")}
              </p>
              <p className="text-xs text-label-secondary">
                {num(e.vectores)} de {num(datos.fotos)} fotos con vector
                {datos.fotos > e.vectores ? ` · faltan ${num(datos.fotos - e.vectores)}` : " · completo"}
              </p>
              <Barra valor={e.vectores} total={datos.fotos} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-label-tertiary">
        Dos vectores solo se comparan si salen del mismo encoder (mismo sha256). Se miran en la{" "}
        <Link href="/vectorial" className="text-accent-ink underline decoration-dotted underline-offset-2">DB vectorial</Link>.
      </p>
    </Card>
  );
}

function NuevoTrabajo({
  datos,
  trabajando,
  onCrear,
}: {
  datos: EstadoWorker;
  trabajando: boolean;
  onCrear: (encoder: string, especieId: number | null) => void;
}) {
  const [encoder, setEncoder] = useState(datos.encoders.at(-1)?.sha256 ?? "");
  const [especie, setEspecie] = useState("");
  const [especies, setEspecies] = useState<EspecieVectores[] | null>(null);
  const [errorEspecies, setErrorEspecies] = useState<string | null>(null);
  const actual = datos.encoders.find((e) => e.sha256 === encoder) ?? datos.encoders.at(-1);
  const activo = datos.trabajos.find(
    (t) => (t.estado === "pendiente" || t.estado === "en_curso") && t.parametros.encoder_sha256 === actual?.sha256
  );
  const vectoresActual = actual?.vectores;

  useEffect(() => {
    if (!actual) return;
    let cancelado = false;
    // Faltantes por especie para este encoder: se recargan cuando cambia el conteo de vectores.
    getResumenVectores(actual.sha256)
      .then((r) => !cancelado && (setEspecies(r.especies), setErrorEspecies(null)))
      .catch((e: Error) => !cancelado && setErrorEspecies(e.message));
    return () => {
      cancelado = true;
    };
  }, [actual?.sha256, vectoresActual]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!actual) {
    return (
      <Card>
        <CardHeader className="mb-2"><CardTitle>Nuevo trabajo de vectores</CardTitle></CardHeader>
        <p className="text-sm text-label-secondary">
          Para crear un trabajo, primero conecta un worker: el trabajo se ata al encoder que ese worker registra.
        </p>
      </Card>
    );
  }

  const faltanTodo = datos.fotos - actual.vectores;
  const elegida = especies?.find((e) => String(e.id) === especie);
  const faltan = elegida ? elegida.fotos - elegida.vectores : faltanTodo;

  return (
    <Card>
      <CardHeader className="mb-3">
        <CardTitle>Nuevo trabajo de vectores</CardTitle>
      </CardHeader>
      <div className="flex flex-wrap items-end gap-3">
        {datos.encoders.length > 1 && (
          <Field label="Encoder">
            <Select value={actual.sha256} onChange={(e) => setEncoder(e.target.value)} className="min-w-[220px]">
              {datos.encoders.map((e) => (
                <option key={e.sha256} value={e.sha256}>{e.nombre} · {corto(e.sha256)}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Fotos" hint={errorEspecies ? `No se pudo cargar la lista de especies: ${errorEspecies}` : undefined}>
          <Select value={especie} onChange={(e) => setEspecie(e.target.value)} className="min-w-[280px]">
            <option value="">Todas las que no tienen vector ({num(faltanTodo)})</option>
            {(especies ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre_cientifico} ({e.fotos - e.vectores ? `faltan ${num(e.fotos - e.vectores)}` : "completa"})
              </option>
            ))}
          </Select>
        </Field>
        <Button
          variant="primary"
          className="mb-0.5"
          loading={trabajando}
          disabled={trabajando || !!activo || faltan <= 0}
          onClick={() => onCrear(actual.sha256, elegida ? elegida.id : null)}
        >
          <Play size={14} /> Crear trabajo
        </Button>
      </div>
      <p className="mt-2 text-xs text-label-secondary">
        {activo
          ? `Ya hay un trabajo en marcha con este encoder (#${activo.id}). Espera a que termine o cancélalo para crear otro.`
          : faltan <= 0
            ? elegida
              ? "Todas las fotos de esta especie ya tienen vector con este encoder."
              : "Todas las fotos ya tienen vector con este encoder."
            : `El worker calculará ${num(faltan)} vectores. Las fotos que fallen se anotan y se reintentan en el próximo trabajo.`}
      </p>
    </Card>
  );
}

function Trabajos({
  datos,
  puedeCorrer,
  onCancelar,
}: {
  datos: EstadoWorker;
  puedeCorrer: boolean;
  onCancelar: (t: Trabajo) => void;
}) {
  const [abierto, setAbierto] = useState<number | null>(null);
  return (
    <Card>
      <CardHeader className="mb-3">
        <CardTitle>Cola e historial</CardTitle>
        <span className="text-xs text-label-tertiary">
          {datos.historial > datos.trabajos.length
            ? `Los ${datos.trabajos.length} más recientes de ${num(datos.historial)}`
            : plural(datos.historial, "trabajo", "trabajos")}
        </span>
      </CardHeader>
      {datos.trabajos.length === 0 ? (
        <p className="text-sm text-label-secondary">
          Aún no hay trabajos. Crea uno arriba para calcular los vectores de las fotos del dataset.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-label-tertiary">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Trabajo</th>
                <th className="py-1.5 pr-3 font-medium">Estado</th>
                <th className="w-48 py-1.5 pr-3 font-medium">Avance</th>
                <th className="py-1.5 pr-3 font-medium">Detalle</th>
                <th className="py-1.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {datos.trabajos.map((t) => {
                const e = ESTADO[t.estado];
                const colgado = t.estado === "en_curso" && (t.segundos_sin_latido ?? 0) > datos.latido_vencido_s;
                return (
                  <FilaTrabajo
                    key={t.id}
                    t={t}
                    tono={colgado ? "warning" : e.tono}
                    estado={colgado ? "Sin latido" : e.texto}
                    abierto={abierto === t.id}
                    onAbrir={() => setAbierto(abierto === t.id ? null : t.id)}
                    puedeCancelar={puedeCorrer && (t.estado === "pendiente" || t.estado === "en_curso")}
                    onCancelar={() => onCancelar(t)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function FilaTrabajo({
  t,
  tono,
  estado,
  abierto,
  onAbrir,
  puedeCancelar,
  onCancelar,
}: {
  t: Trabajo;
  tono: "neutral" | "accent" | "warning" | "danger" | "info";
  estado: string;
  abierto: boolean;
  onAbrir: () => void;
  puedeCancelar: boolean;
  onCancelar: () => void;
}) {
  const restante = estimadoRestante(t);
  return (
    <>
      <tr className="border-t border-border align-top">
        <td className="py-2 pr-3 text-label-primary">
          #{t.id} · {t.especie ? <span className="italic">{t.especie}</span> : "todas las fotos"}
          <span className="block text-label-tertiary">{new Date(t.creado).toLocaleString("es-CO")}</span>
        </td>
        <td className="py-2 pr-3">
          <Badge tone={tono}>{estado}</Badge>
        </td>
        <td className="py-2 pr-3">
          <span className="text-label-primary">
            {num(t.hechos)} de {num(t.total ?? 0)}
          </span>
          {t.fallidos > 0 && (
            <button type="button" onClick={onAbrir} className="ml-1 inline-flex items-center gap-0.5 text-danger hover:underline">
              {abierto ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              {num(t.fallidos)} con error
            </button>
          )}
          <div className="mt-1">
            <Barra valor={t.hechos + t.fallidos} total={t.total ?? 0} />
          </div>
        </td>
        <td className={cn("py-2 pr-3", t.estado === "fallido" ? "text-danger" : "text-label-secondary")}>
          {t.mensaje}
          {t.worker && <span className="block text-label-tertiary">{t.worker}</span>}
          {t.empezado && (
            <span className="block text-label-tertiary">
              {t.terminado ? "Duró" : "Lleva"} {duracion(t.empezado, t.terminado)}
              {!t.terminado && restante && ` · estimado restante ~${restante}`}
            </span>
          )}
        </td>
        <td className="py-2 text-right">
          {puedeCancelar && (
            <Button variant="ghost" className="px-1.5 py-1 text-xs text-danger" onClick={onCancelar}>
              <Square size={11} /> Cancelar
            </Button>
          )}
        </td>
      </tr>
      {abierto && (
        <tr>
          <td colSpan={5} className="pb-3">
            <ErroresTrabajo id={t.id} />
          </td>
        </tr>
      )}
    </>
  );
}

function ErroresTrabajo({ id }: { id: number }) {
  const [datos, setDatos] = useState<{ errores: ErrorTrabajo[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelado = false;
    getErroresTrabajo(id)
      .then((d) => !cancelado && setDatos(d))
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [id]);
  if (error) return <p className="text-xs text-danger">{error}</p>;
  if (!datos) return <p className="text-xs text-label-tertiary">Cargando las fotos con error…</p>;
  return (
    <div className="rounded-md bg-surface-subtle p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs text-label-secondary">
        <AlertTriangle size={12} className="text-warning" />
        El worker no pudo leer estas fotos. No se reintentan en este trabajo; un trabajo nuevo las vuelve a intentar. Si
        siguen fallando, revísalas en{" "}
        <Link href="/curacion" className="text-accent-ink underline decoration-dotted underline-offset-2">Imágenes</Link>.
      </p>
      <ul className="max-h-60 space-y-1 overflow-y-auto font-mono text-[11px]">
        {datos.errores.map((x) => (
          <li key={x.sha256} className="text-label-secondary">
            <span className="text-label-tertiary">{x.sha256.slice(0, 12)}…</span>{" "}
            {x.especie && <span className="font-sans italic">{x.especie}</span>}{" "}
            {x.archivo_original && <span className="text-label-tertiary">{x.archivo_original}</span>}{" "}
            <span className="text-danger">{x.error}</span>
          </li>
        ))}
      </ul>
      {datos.total > datos.errores.length && (
        <p className="mt-1 text-[11px] text-label-tertiary">Se muestran {datos.errores.length} de {num(datos.total)}.</p>
      )}
    </div>
  );
}
