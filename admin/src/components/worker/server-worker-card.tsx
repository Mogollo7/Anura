"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cpu, Play, Square } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { usePanelSession } from "@/lib/session/panel-session";
import {
  cancelarTrabajo,
  crearTrabajoEmbeddings,
  getTrabajos,
  type EstadoWorker,
  type Trabajo,
} from "@/lib/dataset/dataset-client";

const num = (n: number) => n.toLocaleString("es-CO");
const ESTADO: Record<Trabajo["estado"], { texto: string; tono: "neutral" | "accent" | "warning" | "danger" | "info" }> = {
  pendiente: { texto: "Esperando worker", tono: "info" },
  en_curso: { texto: "En curso", tono: "accent" },
  hecho: { texto: "Hecho", tono: "neutral" },
  fallido: { texto: "Falló", tono: "danger" },
  cancelado: { texto: "Cancelado", tono: "warning" },
};

function hace(segundos: number) {
  if (segundos < 60) return `hace ${segundos} s`;
  if (segundos < 3600) return `hace ${Math.round(segundos / 60)} min`;
  return `hace ${Math.round(segundos / 3600)} h`;
}

function duracion(desde: string, hasta: string | null) {
  const s = Math.max(0, Math.round(((hasta ? new Date(hasta) : new Date()).getTime() - new Date(desde).getTime()) / 1000));
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toLocaleString("es-CO", { maximumFractionDigits: 1 })} h`;
}

function Barra({ valor, total }: { valor: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (valor / total) * 100) : 0;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle"
      role="progressbar"
      aria-valuenow={valor}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Estado real del worker de embeddings (model-service) y sus trabajos, desde dataset-service (M2). */
export function ServerWorkerCard() {
  const session = usePanelSession();
  const puedeCorrer = session.can("ejecutarEntrenamiento");
  const [datos, setDatos] = useState<EstadoWorker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [trabajando, setTrabajando] = useState(false);
  const [cancelando, setCancelando] = useState<Trabajo | null>(null);

  const activo = datos?.trabajos.find((t) => t.estado === "pendiente" || t.estado === "en_curso");
  // Booleano, no el objeto: cada carga crea objetos nuevos y re-dispararía el efecto sin parar.
  const hayActivo = !!activo;

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
    // Mientras hay un trabajo andando, el avance se refresca solo.
    const id = setInterval(cargar, hayActivo ? 4000 : 15000);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, [session.isReal, recarga, hayActivo]);

  async function accion(fn: () => Promise<unknown>) {
    setTrabajando(true);
    try {
      await fn();
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTrabajando(false);
      setCancelando(null);
      setRecarga((n) => n + 1);
    }
  }

  if (!session.isReal) {
    return (
      <Card>
        <CardHeader className="mb-2">
          <CardTitle>Worker real</CardTitle>
        </CardHeader>
        <p className="text-sm text-label-secondary">
          {session.cargando ? "Comprobando la sesión…" : "Inicia sesión para ver el worker real y sus trabajos. Sin sesión, la consola de abajo es simulada."}{" "}
          {!session.cargando && (
            <Link href="/login" className="text-accent-ink underline decoration-dotted underline-offset-2">
              Iniciar sesión
            </Link>
          )}
        </p>
      </Card>
    );
  }

  const encoder = datos?.encoders.at(-1);
  const faltan = encoder && datos ? datos.fotos - encoder.vectores : 0;

  return (
    <Card>
      <CardHeader className="mb-3">
        <CardTitle>Worker real</CardTitle>
        <Badge tone="accent">model-service · dataset-service</Badge>
        {puedeCorrer && encoder && (
          <Button
            variant="primary"
            className="ml-auto text-xs"
            disabled={trabajando || !!activo || faltan === 0}
            onClick={() => accion(() => crearTrabajoEmbeddings(encoder.sha256))}
          >
            <Play size={13} />{" "}
            {activo
              ? `Trabajo #${activo.id} en marcha`
              : faltan === 0
                ? "Todas las fotos tienen vector"
                : `Calcular ${num(faltan)} vectores faltantes`}
          </Button>
        )}
      </CardHeader>

      {error && <p className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {!datos ? (
        !error && <p className="text-sm text-label-secondary">Cargando…</p>
      ) : (
        <div className="space-y-4">
          {datos.workers.length === 0 ? (
            <p className="text-sm text-label-secondary">
              Ningún worker se ha conectado todavía. Arranca model-service en el PC con GPU (
              <span className="font-mono text-xs">docker compose -f docker-compose.model.yml up -d</span>): al arrancar se registra aquí y
              pide trabajo cada 15 s.
            </p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {datos.workers.map((w) => {
                const vivo = w.segundos_sin_ver < 60;
                return (
                  <li key={w.nombre} className="flex flex-wrap items-center gap-2">
                    <Cpu size={14} className={vivo ? "text-success" : "text-label-tertiary"} />
                    <span className="font-medium text-label-primary">{w.nombre}</span>
                    <Badge tone={vivo ? "accent" : "warning"}>{vivo ? "Conectado" : `Sin contacto ${hace(w.segundos_sin_ver)}`}</Badge>
                    <span className="text-xs text-label-secondary">
                      {w.info.proveedor?.replace("ExecutionProvider", "") ?? "—"}
                      {w.info.ms_por_foto ? ` · ${num(w.info.ms_por_foto)} ms por foto` : ""}
                      {w.info.onnxruntime ? ` · onnxruntime ${w.info.onnxruntime}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {encoder && (
            <div className="space-y-1.5">
              <p className="text-sm text-label-primary">
                {num(encoder.vectores)} de {num(datos.fotos)} fotos con vector de{" "}
                <span className="font-medium">{encoder.nombre}</span>{" "}
                <span className="text-label-secondary">
                  ({encoder.archivo}, {encoder.dimension} dimensiones, sha256{" "}
                  <span className="font-mono text-xs">{encoder.sha256.slice(0, 12)}…</span>, el mismo del teléfono)
                </span>
              </p>
              <Barra valor={encoder.vectores} total={datos.fotos} />
            </div>
          )}

          {datos.trabajos.length > 0 && (
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
                      <tr key={t.id} className="border-t border-border align-top">
                        <td className="py-2 pr-3 text-label-primary">
                          #{t.id} · vectores
                          <span className="block text-label-tertiary">{new Date(t.creado).toLocaleString("es-CO")}</span>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge tone={colgado ? "warning" : e.tono}>{colgado ? "Sin latido" : e.texto}</Badge>
                        </td>
                        <td className="py-2 pr-3">
                          <span className="text-label-primary">
                            {num(t.hechos)} de {num(t.total ?? 0)}
                          </span>
                          {t.fallidos > 0 && <span className="text-danger"> · {num(t.fallidos)} fallidas</span>}
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
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          {puedeCorrer && (t.estado === "pendiente" || t.estado === "en_curso") && (
                            <Button variant="ghost" className="px-1.5 py-1 text-xs text-danger" onClick={() => setCancelando(t)}>
                              <Square size={11} /> Cancelar
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-label-tertiary">
            El worker vive en el PC con GPU y no abre puertos: pide trabajo a dataset-service, baja cada foto por ahí y devuelve el vector (pgvector,
            float32 × 512, L2). Si deja de latir {Math.round(datos.latido_vencido_s / 60)} min, el trabajo se retoma donde iba. Los vectores se miran en
            la <Link href="/vectorial" className="text-accent-ink underline decoration-dotted underline-offset-2">DB vectorial</Link>.
            {!puedeCorrer && " Lanzar o cancelar trabajos necesita el permiso Ejecutar entrenamiento."}
          </p>
        </div>
      )}

      <Dialog open={!!cancelando} onOpenChange={(o) => !o && setCancelando(null)}>
        <DialogHeader
          title={`¿Cancelar el trabajo #${cancelando?.id}?`}
          description="Los vectores ya calculados se quedan. Un trabajo nuevo sigue desde las fotos que falten."
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setCancelando(null)}>
            Seguir corriendo
          </Button>
          <Button variant="danger" disabled={trabajando} onClick={() => cancelando && accion(() => cancelarTrabajo(cancelando.id))}>
            Cancelar trabajo
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}
