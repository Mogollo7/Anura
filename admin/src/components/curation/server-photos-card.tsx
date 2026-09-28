"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RotateCcw, ShieldOff, Trash2, Upload } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { usePanelSession } from "@/lib/session/panel-session";
import { INVALID_OBSERVATION_REASONS } from "@/lib/mock/curation";
import { UploadPhotoDialog } from "@/components/curation/upload-photo-dialog";
import {
  excluirFoto,
  getFotos,
  invalidarObservacion,
  reincluirFoto,
  revertirInvalidacion,
  type DatasetEspecie,
  type DatasetFoto,
  type FiltroFotos,
} from "@/lib/dataset/dataset-client";

const PAGINA = 36;
const PARTICION: Record<string, string> = { train: "Entrenamiento", val: "Validación", test: "Prueba" };
const MOTIVOS_FOTO = [
  "Foto borrosa o fuera de foco",
  "No se ve el animal, o no es un anuro",
  "Duplicada de otra foto",
  "La foto no corresponde a esta especie",
] as const;
const OTRO = "otro";

/** Solo las Creative Commons se pueden mostrar en la ficha pública o el Explorador. */
function licenciaBadge(licencia: string | null) {
  if (licencia === null) return <Badge tone="warning">Sin licencia</Badge>;
  if (licencia === "all-rights-reserved") return <Badge tone="warning">Derechos reservados</Badge>;
  return <Badge tone="neutral">{licencia === "cc0" ? "CC0" : licencia.toUpperCase().replace(/^CC-/, "CC ")}</Badge>;
}

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-CO")} ${n === 1 ? uno : varios}`;

/** Filtros con su conteo (sale del resumen de la especie, así el chip dice cuántas hay antes de tocarlo). */
function filtrosDe(e: DatasetEspecie): { id: FiltroFotos | null; label: string; n: number }[] {
  return [
    { id: null, label: "Todas", n: e.fotos },
    { id: "excluidas", label: "Excluidas", n: e.excluidas },
    { id: "sin_cc", label: "Sin licencia CC", n: e.derechos_reservados + e.sin_licencia },
    { id: "aproximada", label: "Coordenada aproximada", n: e.coordenada_oculta },
    { id: "sin_coordenada", label: "Sin coordenada", n: e.fotos - e.con_coordenada },
    { id: "subidas", label: "Subidas a mano", n: e.subidas_a_mano },
    { id: "train", label: "Entrenamiento", n: e.train },
    { id: "val", label: "Validación", n: e.val },
    { id: "test", label: "Prueba", n: e.test },
  ];
}

type Grupo = { clave: string; fotos: DatasetFoto[] };

/** Especie → Observación → Fotografía: el servidor ya las devuelve juntas por observación. */
function agrupar(fotos: DatasetFoto[]): Grupo[] {
  const grupos: Grupo[] = [];
  for (const f of fotos) {
    const clave = f.observacion_id != null ? `obs-${f.observacion_id}` : `foto-${f.sha256}`;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.clave === clave) ultimo.fotos.push(f);
    else grupos.push({ clave, fotos: [f] });
  }
  return grupos;
}

type Accion = { tipo: "excluir"; foto: DatasetFoto } | { tipo: "invalidar"; foto: DatasetFoto };

/** Fotos reales de la especie, desde MinIO vía dataset-service (M1). Montar con key por especie. */
export function ServerPhotosCard({ especie: e, onCambio }: { especie: DatasetEspecie; onCambio: () => void }) {
  const session = usePanelSession();
  const canFotos = session.can("revisarFotografias");
  const [filtro, setFiltro] = useState<FiltroFotos | null>(null);
  const [fotos, setFotos] = useState<DatasetFoto[] | null>(null);
  const [hayMas, setHayMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [subiendo, setSubiendo] = useState(false);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [motivo, setMotivo] = useState<string>("");
  const [otroMotivo, setOtroMotivo] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);

  useEffect(() => {
    let cancelado = false;
    getFotos(e.id, 0, PAGINA, false, filtro ?? undefined)
      .then(({ fotos: fs }) => {
        if (cancelado) return;
        setFotos(fs);
        setHayMas(fs.length === PAGINA);
        setError(null);
      })
      .catch((err: Error) => !cancelado && setError(err.message));
    return () => {
      cancelado = true;
    };
  }, [e.id, filtro, recarga]);

  /** Después de escribir en el servidor: conteos (en la lista de especies) y fotos otra vez. */
  function recargar(texto: string) {
    setAviso({ tono: "ok", texto });
    setRecarga((n) => n + 1);
    onCambio();
  }

  async function verMas() {
    if (!fotos) return;
    const { fotos: mas } = await getFotos(e.id, fotos.length, PAGINA, false, filtro ?? undefined);
    setFotos([...fotos, ...mas]);
    setHayMas(mas.length === PAGINA);
  }

  function abrir(a: Accion) {
    setAccion(a);
    setMotivo(a.tipo === "excluir" ? MOTIVOS_FOTO[0] : INVALID_OBSERVATION_REASONS[0]);
    setOtroMotivo("");
  }

  async function ejecutar<T>(fn: () => Promise<T>, texto: (r: T) => string) {
    setTrabajando(true);
    try {
      const r = await fn();
      setAccion(null);
      recargar(texto(r));
    } catch (err) {
      setAviso({ tono: "error", texto: (err as Error).message });
      setAccion(null);
    } finally {
      setTrabajando(false);
    }
  }

  const motivoFinal = motivo === OTRO ? otroMotivo.trim() : motivo;

  function confirmar() {
    if (!accion || !motivoFinal) return;
    const { foto } = accion;
    if (accion.tipo === "excluir") {
      ejecutar(() => excluirFoto(foto.sha256, motivoFinal), () => "Foto excluida. Queda fuera de la próxima versión del dataset.");
    } else if (foto.observacion_id) {
      ejecutar(
        () => invalidarObservacion(foto.observacion_id!, motivoFinal),
        (r) => `Observación invalidada: ${plural(r.fotos_excluidas, "foto excluida", "fotos excluidas")}.`
      );
    }
  }

  const filtros = filtrosDe(e);
  const puedeEditar = canFotos && !trabajando;

  return (
    <Card>
      <CardHeader className="mb-1 flex-wrap gap-2">
        <div>
          <CardTitle className="text-base italic">{e.nombre_cientifico}</CardTitle>
          <p className="text-xs text-label-tertiary">
            {e.familia} · {e.taxon_id ?? "sin taxon_id (fuera del paquete)"}
          </p>
        </div>
        {canFotos && (
          <Button variant="primary" className="ml-auto text-xs" onClick={() => setSubiendo(true)}>
            <Upload size={13} /> Subir foto
          </Button>
        )}
      </CardHeader>
      <p className="mb-3 text-sm text-label-secondary">
        {plural(e.fotos, "foto", "fotos")} de {plural(e.observaciones, "observación", "observaciones")}
        {e.excluidas > 0 && ` · ${plural(e.excluidas, "excluida", "excluidas")}`}
        {e.derechos_reservados + e.sin_licencia > 0 &&
          ` · ${plural(e.derechos_reservados + e.sin_licencia, "sin licencia CC", "sin licencia CC")} (sirven para entrenar, no para la ficha pública)`}
      </p>

      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar fotos">
        {filtros
          .filter((f) => f.id === null || f.n > 0)
          .map((f) => (
            <button
              key={f.id ?? "todas"}
              type="button"
              aria-pressed={filtro === f.id}
              onClick={() => setFiltro(f.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs",
                filtro === f.id ? "border-accent bg-accent-wash text-accent-ink" : "border-border text-label-secondary hover:bg-surface-subtle"
              )}
            >
              {f.label} <span className="tabular-nums text-label-tertiary">{f.n.toLocaleString("es-CO")}</span>
            </button>
          ))}
      </div>

      {aviso && (
        <p
          role="status"
          className={cn("mb-3 rounded-md px-3 py-2 text-sm", aviso.tono === "ok" ? "bg-accent-wash text-accent-ink" : "bg-danger/10 text-danger")}
        >
          {aviso.texto}
        </p>
      )}

      {error ? (
        <p className="text-sm text-danger">No se pudieron cargar las fotos: {error}. Revisa que dataset-service esté corriendo.</p>
      ) : !fotos ? (
        <p className="text-sm text-label-secondary">Cargando fotos…</p>
      ) : fotos.length === 0 ? (
        <p className="text-sm text-label-secondary">
          {filtro ? "Ninguna foto cumple este filtro." : `${e.nombre_cientifico} todavía no tiene fotos en el servidor. Sube la primera con «Subir foto».`}
        </p>
      ) : (
        <div className="space-y-3">
          {agrupar(fotos).map((g) => (
            <ObservacionGrupo
              key={g.clave}
              fotos={g.fotos}
              especie={e.nombre_cientifico}
              puedeEditar={puedeEditar}
              onExcluir={(f) => abrir({ tipo: "excluir", foto: f })}
              onInvalidar={(f) => abrir({ tipo: "invalidar", foto: f })}
              onReincluir={(f) => ejecutar(() => reincluirFoto(f.sha256), () => "Foto reincluida en el dataset.")}
              onRevertir={(f) =>
                ejecutar(
                  () => revertirInvalidacion(f.observacion_id!),
                  (r) => `Invalidación revertida: ${plural(r.fotos_reincluidas, "foto vuelve", "fotos vuelven")} al dataset.`
                )
              }
            />
          ))}
          {hayMas && (
            <Button variant="outline" className="text-xs" onClick={verMas}>
              Ver más fotos
            </Button>
          )}
        </div>
      )}
      {!canFotos && <p className="mt-3 text-xs text-label-tertiary">Subir, excluir fotos e invalidar observaciones necesita el permiso Revisar fotografías.</p>}

      <UploadPhotoDialog open={subiendo} onOpenChange={setSubiendo} especieId={e.id} especie={e.nombre_cientifico} onSubida={recargar} />

      <Dialog open={!!accion} onOpenChange={(o) => !o && setAccion(null)}>
        <DialogHeader
          title={accion?.tipo === "invalidar" ? "¿Invalidar la observación?" : "¿Excluir la foto?"}
          description={
            accion?.tipo === "invalidar"
              ? `${accion.foto.fotos_observacion === 1 ? "Su foto sale" : `Sus ${accion.foto.fotos_observacion} fotos salen`} del entrenamiento y la observación sale de las capas geográficas. No se borra nada: se puede revertir.`
              : "Sale del entrenamiento desde la próxima versión del dataset. No se borra del servidor: se puede reincluir."
          }
        />
        <div className="space-y-3">
          <Field label="Motivo">
            <Select value={motivo} onChange={(ev) => setMotivo(ev.target.value)}>
              {(accion?.tipo === "invalidar" ? INVALID_OBSERVATION_REASONS : MOTIVOS_FOTO).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value={OTRO}>Otro motivo</option>
            </Select>
          </Field>
          {motivo === OTRO && (
            <Field label="Escribe el motivo">
              <Input value={otroMotivo} maxLength={300} onChange={(ev) => setOtroMotivo(ev.target.value)} />
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAccion(null)}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={!motivoFinal || trabajando} onClick={confirmar}>
              {accion?.tipo === "invalidar" ? "Invalidar observación" : "Excluir foto"}
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}

/** Una observación con todas sus fotos: fuente, fecha y lugar una sola vez, y su acción una sola vez. */
function ObservacionGrupo({
  fotos,
  especie,
  puedeEditar,
  onExcluir,
  onInvalidar,
  onReincluir,
  onRevertir,
}: {
  fotos: DatasetFoto[];
  especie: string;
  puedeEditar: boolean;
  onExcluir: (f: DatasetFoto) => void;
  onInvalidar: (f: DatasetFoto) => void;
  onReincluir: (f: DatasetFoto) => void;
  onRevertir: (f: DatasetFoto) => void;
}) {
  const f0 = fotos[0];
  const invalidada = fotos.some((f) => f.exclusion_origen === "observacion_invalidada");
  const fecha = f0.observada_en ? new Date(f0.observada_en).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : null;
  return (
    <section className={cn("rounded-md border p-3", invalidada ? "border-danger/40 bg-danger/5" : "border-border")}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-label-secondary">
        {f0.observacion_inat ? (
          <a
            href={`https://www.inaturalist.org/observations/${f0.observacion_inat}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-label-primary underline decoration-dotted underline-offset-2"
          >
            iNaturalist {f0.observacion_inat} <ExternalLink size={11} />
          </a>
        ) : (
          <span className="font-medium text-label-primary">{f0.subida_a_mano ? "Subida a mano" : "Sin observación"}</span>
        )}
        {fecha && <span>{fecha}</span>}
        {f0.lugar && <span className="max-w-[40ch] truncate">{f0.lugar}</span>}
        {f0.observacion_id == null ? null : f0.latitud == null ? (
          <Badge tone="warning">Sin coordenada</Badge>
        ) : f0.coordenada_oculta ? (
          <Badge tone="info">Coordenada aproximada</Badge>
        ) : null}
        {invalidada && (
          <Badge tone="danger">
            <ShieldOff size={11} /> Invalidada: {f0.invalidada_motivo}
          </Badge>
        )}
        {puedeEditar && f0.observacion_id != null && (
          <span className="ml-auto">
            {invalidada ? (
              <Button variant="ghost" className="px-1.5 py-1 text-xs" onClick={() => onRevertir(f0)}>
                <RotateCcw size={12} /> Revertir invalidación
              </Button>
            ) : (
              <Button variant="ghost" className="px-1.5 py-1 text-xs text-danger" onClick={() => onInvalidar(f0)}>
                <ShieldOff size={12} /> Invalidar observación
              </Button>
            )}
          </span>
        )}
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
        {fotos.map((f) => {
          const excluida = f.exclusion_origen !== null;
          return (
            <li key={f.sha256} className={cn("overflow-hidden rounded-md border", excluida ? "border-danger/40" : "border-border")}>
              {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de MinIO que vence en 10 min */}
              <img
                src={f.url}
                alt={`${especie}, ${f.archivo_original}`}
                loading="lazy"
                className={cn("aspect-square w-full bg-surface-subtle object-cover", excluida && "opacity-40")}
                title={f.atribucion ?? undefined}
              />
              <div className="flex flex-wrap gap-1 p-1.5">
                {f.exclusion_origen && f.exclusion_origen !== "observacion_invalidada" && <Badge tone="danger">Excluida</Badge>}
                <Badge tone="neutral">{f.particion ? PARTICION[f.particion] : "Fuera del manifiesto"}</Badge>
                {licenciaBadge(f.licencia)}
              </div>
              {f.exclusion_origen && f.exclusion_origen !== "observacion_invalidada" && (
                <p className="px-1.5 text-[11px] text-label-secondary">{f.exclusion_motivo}</p>
              )}
              {puedeEditar && !invalidada && (
                <div className="border-t border-border px-1 py-0.5">
                  {!excluida ? (
                    <Button variant="ghost" className="px-1.5 py-1 text-xs text-danger" onClick={() => onExcluir(f)}>
                      <Trash2 size={12} /> Excluir
                    </Button>
                  ) : f.exclusion_origen === "curacion" ? (
                    <Button variant="ghost" className="px-1.5 py-1 text-xs" onClick={() => onReincluir(f)}>
                      <RotateCcw size={12} /> Reincluir
                    </Button>
                  ) : (
                    <p className="px-1.5 py-1 text-[11px] text-label-tertiary">Se decidió en Calidad; se cambia allá.</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
