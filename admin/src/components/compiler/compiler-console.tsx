"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Lock, MapPinned, PackageCheck, ShieldCheck, XCircle } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskProgress } from "@/components/ui/task-progress";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import { DataState } from "@/components/app-data/data-state";
import { Motivos } from "@/components/release/motivos";
import { SubregionPicker, subregionInicial } from "@/components/release/subregion-picker";
import { EtiquetaImportado, RestaurarVersion } from "@/components/release/restaurar-version";
import { useAppResource } from "@/lib/app-data/app-client";
import { usePanelSession } from "@/lib/session/panel-session";
import {
  ESTADO_PAQUETE,
  REGLA_APROBACIONES,
  TIPO_APROBACION,
  ReleaseError,
  fecha,
  releaseApi,
  tamano,
  type Motivo,
  type Paquete,
  type ResumenSubregion,
  type TipoAprobacion,
  type Validacion,
} from "@/lib/release/release-client";
import { plural } from "@/lib/utils";

/**
 * Release: compilar el paquete de una subregión en el servidor, reunir las dos aprobaciones
 * (científica y técnica; dos cuentas distintas, o una cuenta super que da las dos) y publicarlo para la
 * app. También se puede volver a una versión anterior (restaurar). El servidor valida cada paso; los
 * botones solo evitan pedir lo que ya se sabe que va a rechazar.
 */
export function CompilerConsole() {
  const resumen = useAppResource(releaseApi.resumen);
  return (
    <DataState value={resumen.value} onRetry={resumen.reload}>
      {(subregiones) =>
        subregiones.length ? (
          <Detalle subregiones={subregiones} />
        ) : (
          <Card className="flex items-start gap-3 p-6">
            <MapPinned size={18} className="mt-0.5 text-label-secondary" aria-hidden />
            <div className="text-sm text-label-secondary">
              <p className="font-medium text-label-primary">Aún no hay subregiones para compilar</p>
              Para empezar, agrega un departamento y divídelo en subregiones en{" "}
              <Link href="/paquetes" className="text-accent-ink underline">Regiones</Link>.
            </div>
          </Card>
        )
      }
    </DataState>
  );
}

function Detalle({ subregiones }: { subregiones: ResumenSubregion[] }) {
  const session = usePanelSession();
  const yo = session.acting?.id ?? null;
  const [id, setId] = useState<number | null>(() => subregionInicial(subregiones));
  const [validacion, setValidacion] = useState<Validacion | null>(null);
  const [paquetes, setPaquetes] = useState<Paquete[] | null>(null);
  const [error, setError] = useState<{ message: string; motivos: Motivo[] } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aPublicar, setAPublicar] = useState<Paquete | null>(null);

  const cargar = useCallback(async (subId: number) => {
    const [v, p] = await Promise.all([releaseApi.validacion(subId), releaseApi.paquetes(subId)]);
    setValidacion(v);
    setPaquetes(p);
  }, []);

  useEffect(() => {
    if (id == null) return;
    setValidacion(null);
    setPaquetes(null);
    cargar(id).catch((e: Error) => setError({ message: e.message, motivos: [] }));
  }, [id, cargar]);

  async function accion(clave: string, fn: () => Promise<unknown>, exito: string) {
    if (id == null) return;
    setOcupado(clave);
    setError(null);
    setAviso(null);
    try {
      await fn();
      setAviso(exito);
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : "No se pudo completar la acción", motivos: e instanceof ReleaseError ? e.motivos : [] });
    } finally {
      await cargar(id).catch(() => undefined);
      setOcupado(null);
    }
  }

  const sub = subregiones.find((s) => s.id === id);
  const listo = validacion && validacion.subregion.id === id && paquetes;
  const canGenerar = session.can("generarPaquete");
  const esSuper = !!session.acting?.isSuperAdmin;
  const ultimo = paquetes?.[0] ?? null;
  const vigente = paquetes?.find((p) => p.estado === "publicado") ?? null;
  const restaurada = (mensaje: string) => {
    setError(null);
    setAviso(mensaje);
    if (id != null) void cargar(id).catch(() => undefined);
  };
  const noRestaurada = (mensaje: string) => {
    setAviso(null);
    setError({ message: mensaje, motivos: [] });
    if (id != null) void cargar(id).catch(() => undefined);
  };

  return (
    <div className="space-y-6">
      <Dialog open={!!aPublicar} onOpenChange={(o) => !o && setAPublicar(null)}>
        {aPublicar && (
          <>
            <DialogHeader
              title={`¿Publicar la versión ${aPublicar.version} de ${sub?.nombre ?? aPublicar.paquete_id}?`}
              description="La app empieza a descargar este paquete para la subregión. Si había otra versión publicada, queda retirada."
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAPublicar(null)}>Cancelar</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const p = aPublicar;
                  setAPublicar(null);
                  void accion(`publicar-${p.id}`, () => releaseApi.publicar(p.id), `Versión ${p.version} publicada: la app ya puede descargarla.`);
                }}
              >
                Publicar versión {aPublicar.version}
              </Button>
            </div>
          </>
        )}
      </Dialog>

      <div className="flex flex-wrap items-end gap-3">
        <SubregionPicker subregiones={subregiones} value={id} onChange={(n) => { setId(n); setError(null); setAviso(null); }} />
        <Button
          variant="primary"
          loading={ocupado === "compilar"}
          disabled={!canGenerar || !validacion?.lista || ocupado !== null}
          title={!canGenerar ? 'Falta el permiso "Generar paquete"' : undefined}
          onClick={() => id != null && accion("compilar", () => releaseApi.compilar(id), `Paquete compilado. ${REGLA_APROBACIONES}`)}
        >
          {canGenerar ? <PackageCheck size={14} aria-hidden /> : <Lock size={14} aria-hidden />}
          {ocupado === "compilar" ? "Compilando…" : "Compilar paquete"}
        </Button>
      </div>
      {ocupado === "compilar" && <TaskProgress taskKey={`compilar-paquete:${id}`} label="Compilando el paquete de la subregión…" />}

      {aviso && <Card className="flex items-center gap-1.5 text-sm text-accent-ink"><CheckCircle2 size={14} aria-hidden /> {aviso}</Card>}
      {error && (
        <Card>
          <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-danger"><XCircle size={14} aria-hidden /> {error.message}</p>
          {error.motivos.length > 0 && <Motivos items={error.motivos} tipo="motivo" />}
        </Card>
      )}

      {!listo ? (
        !error && <Card className="p-6 text-sm text-label-secondary">Leyendo la subregión del servidor…</Card>
      ) : (
        <>
          {!validacion.lista && (
            <Card>
              <p className="mb-2 text-sm font-medium text-label-primary">Todavía no se puede compilar</p>
              <Motivos items={validacion.motivos} tipo="motivo" />
              <p className="mt-2 text-xs text-label-tertiary">
                El detalle está en <Link href="/validacion-tecnica" className="text-accent-ink underline">Validación</Link>.
              </p>
            </Card>
          )}

          <Card>
            <CardHeader className="mb-2">
              <CardTitle>Versiones de esta subregión</CardTitle>
              {vigente && <Badge tone="accent">Publicada: versión {vigente.version}</Badge>}
            </CardHeader>
            {paquetes.length === 0 ? (
              <p className="text-sm text-label-secondary">
                Aún no hay versiones. {validacion.lista ? "Compila la primera con el botón de arriba." : "Cuando la validación esté lista, compila la primera."}
              </p>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Versión</TH>
                    <TH>Estado</TH>
                    <TH className="text-right">Especies</TH>
                    <TH className="text-right">Tamaño</TH>
                    <TH>Compilado</TH>
                    <TH>Aprobaciones</TH>
                    <TH></TH>
                  </tr>
                </THead>
                <TBody>
                  {paquetes.map((p) => (
                    <FilaPaquete
                      key={p.id}
                      p={p}
                      yo={yo}
                      esSuper={esSuper}
                      subregion={sub?.nombre ?? p.paquete_id}
                      vigente={vigente}
                      onRestaurada={restaurada}
                      onNoRestaurada={noRestaurada}
                      puede={(permiso) => session.can(permiso)}
                      ocupado={ocupado}
                      onAprobar={(tipo) =>
                        accion(`aprobar-${p.id}-${tipo}`, () => releaseApi.aprobar(p.id, tipo), `Aprobación ${TIPO_APROBACION[tipo].label.toLowerCase()} registrada.`)
                      }
                      onPublicar={() => setAPublicar(p)}
                    />
                  ))}
                </TBody>
              </Table>
            )}
            <p className="mt-2 text-[11px] text-label-tertiary">
              {REGLA_APROBACIONES} La científica pide el permiso «Aprobar paquete científico» y la técnica el permiso «Publicar paquete».
              Si cambian los centroides, el umbral OSR o la Ficha después de compilar, esa versión queda desactualizada: compila otra.
              Una versión retirada se puede restaurar: vuelve a entregarse sin nuevas aprobaciones.
            </p>
          </Card>

          {ultimo?.manifiesto && (
            <Card>
              <CardHeader className="mb-2">
                <CardTitle>Contenido de la versión {ultimo.version}</CardTitle>
                <span className="font-mono text-xs text-label-tertiary">sha256 {ultimo.sha256.slice(0, 16)}…</span>
              </CardHeader>
              <p className="mb-2 text-xs text-label-secondary">
                {plural(ultimo.manifiesto.vectores, "vector", "vectores")} de referencia · {plural(ultimo.manifiesto.puntos_ocurrencia, "punto", "puntos")} de ocurrencia
                {ultimo.tau != null && ` · umbral OSR τ ${ultimo.tau.toLocaleString("es-CO", { maximumFractionDigits: 4 })}`}
                {` · ${plural(ultimo.manifiesto.morfos?.length ?? 0, "morfo", "morfos")} con centroide · ${plural(ultimo.manifiesto.clusteres?.length ?? 0, "clúster aceptado", "clústeres aceptados")}`}
              </p>
              <Table>
                <THead>
                  <tr>
                    <TH>Especie</TH>
                    <TH>taxon_id</TH>
                    <TH className="text-right">Referencias</TH>
                    <TH>Centroide</TH>
                    <TH>Altitud</TH>
                    <TH>Pesos</TH>
                  </tr>
                </THead>
                <TBody>
                  {ultimo.manifiesto.especies.map((e) => (
                    <TRow key={e.taxon_id}>
                      <TD className="text-xs italic">{e.nombre_cientifico}</TD>
                      <TD className="font-mono text-xs">{e.taxon_id}</TD>
                      <TD className="text-right text-xs tabular-nums">{e.referencias}</TD>
                      <TD className="text-xs">
                        {e.centroide === "regional" ? "regional" : e.centroide === "referencias" ? "media de sus referencias" : "global prestado"}
                      </TD>
                      <TD className="text-xs">{e.contexto?.altitud ? `${e.contexto.altitud.min}–${e.contexto.altitud.max} m` : "—"}</TD>
                      <TD className="text-xs">{e.contexto?.pesos ? `${e.contexto.pesos.wv} / ${e.contexto.pesos.wg} / ${e.contexto.pesos.wm}` : "—"}</TD>
                    </TRow>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function FilaPaquete({
  p,
  yo,
  esSuper,
  subregion,
  vigente,
  onRestaurada,
  onNoRestaurada,
  puede,
  ocupado,
  onAprobar,
  onPublicar,
}: {
  p: Paquete;
  yo: string | null;
  /** La cuenta super puede dar las dos aprobaciones de un mismo paquete. */
  esSuper: boolean;
  subregion: string;
  vigente: Paquete | null;
  onRestaurada: (mensaje: string) => void;
  onNoRestaurada: (mensaje: string) => void;
  puede: (permiso: "aprobarCientifico" | "publicarPaquete") => boolean;
  ocupado: string | null;
  onAprobar: (tipo: TipoAprobacion) => void;
  onPublicar: () => void;
}) {
  const yaAprobe = !!yo && p.aprobaciones.some((a) => a.cuenta === yo);
  const pendientes = (Object.keys(TIPO_APROBACION) as TipoAprobacion[]).filter((t) => !p.aprobaciones.some((a) => a.tipo === t));
  const estado = ESTADO_PAQUETE[p.estado];
  return (
    <TRow>
      <TD className="font-mono text-xs">{p.version}</TD>
      <TD>
        <div className="flex flex-wrap items-center gap-1">
          <Badge tone={p.desactualizado ? "warning" : estado.tone}>{p.desactualizado ? "Desactualizado: compila otra" : estado.label}</Badge>
          <EtiquetaImportado p={p} />
        </div>
      </TD>
      <TD className="text-right text-xs tabular-nums">{p.especies}</TD>
      <TD className="text-right text-xs tabular-nums">{tamano(p.size_bytes)}</TD>
      <TD className="text-xs">{p.compilado_nombre ?? "—"} · {fecha(p.compilado)}</TD>
      <TD className="text-xs">
        {p.aprobaciones.length === 0
          ? p.origen === "legado" ? "Ya validado antes" : "—"
          : p.aprobaciones.map((a) => (
            <span key={a.tipo} className="block">
              {TIPO_APROBACION[a.tipo].label}: {a.nombre ?? a.cuenta}
            </span>
          ))}
        {p.estado === "publicado" && p.publicado && <span className="block text-label-tertiary">Publicado {fecha(p.publicado)}</span>}
      </TD>
      <TD>
        <div className="flex flex-wrap justify-end gap-1.5">
          {p.estado === "borrador" &&
            !p.desactualizado &&
            pendientes.map((tipo) => {
              const t = TIPO_APROBACION[tipo];
              const permitido = puede(t.permiso);
              return (
                <Button
                  key={tipo}
                  variant="outline"
                  className="text-xs"
                  disabled={!permitido || (yaAprobe && !esSuper) || ocupado !== null}
                  title={
                    yaAprobe && !esSuper
                      ? "Tu cuenta ya aprobó este paquete: la otra aprobación la da otra cuenta"
                      : !permitido ? `Falta el permiso de aprobación ${t.label.toLowerCase()}` : undefined
                  }
                  onClick={() => onAprobar(tipo)}
                >
                  {permitido ? <ShieldCheck size={12} aria-hidden /> : <Lock size={12} aria-hidden />} Aprobar ({t.label.toLowerCase()})
                </Button>
              );
            })}
          {p.estado === "aprobado" && !p.desactualizado && (
            <Button variant="primary" className="text-xs" disabled={!puede("publicarPaquete") || ocupado !== null} onClick={onPublicar}>
              {puede("publicarPaquete") ? <CheckCircle2 size={12} aria-hidden /> : <Lock size={12} aria-hidden />} Publicar
            </Button>
          )}
          <RestaurarVersion p={p} subregion={subregion} vigente={vigente} ocupado={ocupado !== null} onHecho={onRestaurada} onError={onNoRestaurada} />
        </div>
      </TD>
    </TRow>
  );
}
