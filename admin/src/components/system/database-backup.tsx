"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { DatabaseBackup as IconoRespaldo, Download } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { getToken } from "@/lib/auth/panel-client";
import { usePanelSession } from "@/lib/session/panel-session";

type Respaldo = {
  archivo: string; base: string; creado: string; bytes: number; sha256: string; por: string | null;
  fotos?: { objetos: number } | null; fotos_nota?: string | null;
};
type Estado = { base: string; permiteLimpiar: boolean; respaldos: Respaldo[] };

const auth = (): Record<string, string> => (getToken() ? { Authorization: `Bearer ${getToken()}` } : {});

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...auth() } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { message?: string }).message || `Error ${res.status}`);
  return body as T;
}

const tamano = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const cuando = (iso: string) => new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });

/**
 * Sistema → Respaldar base. El respaldo no cambia nada en la base. Al terminar, la copia queda
 * descargable en esta tarjeta y un diálogo pregunta qué hacer con la base actual: conservarla o
 * limpiarla (esto último pide escribir el nombre de la base). El diálogo no tiene otra salida.
 */
export function DatabaseBackup() {
  const session = usePanelSession();
  const puede = session.can("debugTecnico");
  const [estado, setEstado] = useState<Estado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [haciendo, setHaciendo] = useState(false);
  const [bajando, setBajando] = useState<string | null>(null);
  const [avance, setAvance] = useState<{ leidos: number; total: number } | null>(null);
  const [hecho, setHecho] = useState<Respaldo | null>(null);
  const [recuperar, setRecuperar] = useState<Respaldo | null>(null);
  const [nombreRecuperar, setNombreRecuperar] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const cancelarRef = useRef<AbortController | null>(null);
  const [eliminar, setEliminar] = useState<Respaldo | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [conFotos, setConFotos] = useState(true);
  const [borrarFotos, setBorrarFotos] = useState(true);

  const cargar = useCallback(async () => {
    try {
      setEstado(await pedir<Estado>("/api/system/respaldo"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer los respaldos.");
    }
  }, []);

  useEffect(() => {
    if (puede) void cargar();
  }, [puede, cargar]);

  async function respaldar(conFotosCopia = true) {
    setHaciendo(true);
    setError(null);
    setMensaje(null);
    try {
      const r = await pedir<Respaldo>("/api/system/respaldo", { method: "POST", body: JSON.stringify({ conFotos: conFotosCopia }) });
      setPreparando(false);
      setHecho(r);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo hacer el respaldo.");
    } finally {
      setHaciendo(false);
    }
  }

  async function descargar(archivo: string, totalConocido = 0) {
    setBajando(archivo);
    setAvance({ leidos: 0, total: totalConocido });
    setError(null);
    const control = new AbortController();
    cancelarRef.current = control;
    try {
      const res = await fetch(`/api/system/respaldo/${encodeURIComponent(archivo)}`, { headers: auth(), cache: "no-store", signal: control.signal });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { message?: string }).message || `Error ${res.status}`);
      const total = Number(res.headers.get("Content-Length")) || totalConocido;
      const partes: Uint8Array[] = [];
      let leidos = 0;
      if (res.body) {
        const lector = res.body.getReader();
        for (;;) {
          const { done, value } = await lector.read();
          if (done) break;
          partes.push(value);
          leidos += value.byteLength;
          setAvance({ leidos, total });
        }
      } else {
        partes.push(new Uint8Array(await res.arrayBuffer()));
      }
      const url = URL.createObjectURL(new Blob(partes as BlobPart[], { type: "application/octet-stream" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = archivo;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      if (control.signal.aborted) setMensaje("Descarga cancelada. No se guardó nada.");
      else setError(e instanceof Error ? e.message : "No se pudo descargar la copia.");
    } finally {
      cancelarRef.current = null;
      setBajando(null);
      setAvance(null);
    }
  }

  async function eliminarCopia() {
    if (!eliminar) return;
    setHaciendo(true);
    setError(null);
    try {
      await pedir(`/api/system/respaldo/${encodeURIComponent(eliminar.archivo)}`, { method: "DELETE" });
      setMensaje(`Copia ${eliminar.archivo} eliminada. La base y las fotos no se tocaron.`);
      setEliminar(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar la copia.");
    } finally {
      setHaciendo(false);
    }
  }

  async function cargarDump(file: File | undefined) {
    if (!file) return;
    setHaciendo(true);
    setError(null);
    setMensaje(null);
    try {
      const body = new FormData();
      body.set("dump", file);
      const res = await fetch("/api/system/respaldo/cargar", { method: "POST", headers: auth(), body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { message?: string }).message || `Error ${res.status}`);
      setMensaje(`Dump cargado: ${(json as Respaldo).archivo}. Puedes descargarlo o recuperarlo.`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el dump.");
    } finally {
      setHaciendo(false);
    }
  }

  async function recuperarAhora() {
    if (!recuperar) return;
    setHaciendo(true);
    setError(null);
    try {
      const r = await pedir<{ fotos: { objetos: number } | null; fotos_nota: string | null }>("/api/system/respaldo/recuperar", {
        method: "POST",
        body: JSON.stringify({ archivo: recuperar.archivo, confirmacion: nombreRecuperar }),
      });
      setMensaje(`Base recuperada.${r.fotos ? ` Fotos subidas: ${r.fotos.objetos}.` : ""}${r.fotos_nota ? ` ${r.fotos_nota}` : ""}`);
      setRecuperar(null);
      setNombreRecuperar("");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo recuperar la base.");
    } finally {
      setHaciendo(false);
    }
  }

  return (
    <Card>
      <CardHeader className="mb-2">
        <CardTitle>Respaldo de la base de datos</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" className="text-xs" disabled={!puede || haciendo} onClick={() => { setConFotos(true); setBorrarFotos(true); void respaldar(true); }}>
            <IconoRespaldo size={14} aria-hidden /> {haciendo ? "Trabajando…" : "Respaldar base"}
          </Button>
          <Button variant="outline" className="text-xs text-danger" disabled={!puede || haciendo} onClick={() => setPreparando(true)}>
            Limpiar base…
          </Button>
          <label className={`inline-flex cursor-pointer items-center rounded-md border border-border px-2.5 py-1 text-xs ${!puede || haciendo ? "pointer-events-none opacity-50" : ""}`}>
            Cargar dump
            <input type="file" accept=".dump,application/octet-stream" className="sr-only" disabled={!puede || haciendo}
              onChange={(e) => { void cargarDump(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
      </CardHeader>
      <p className="text-xs text-label-secondary">
        Hace una copia de {estado ? <span className="font-mono">{estado.base}</span> : "la base"} y, si MinIO está configurado, de las fotos y los paquetes.
        Descargar baja el dump. Cargar guarda un dump que trajiste. Recuperar sustituye la base y las fotos por esa copia: está apagado mientras el servidor no tenga BACKUP_ALLOW_CLEAN=1.
        {!puede && " Necesita el permiso Debug técnico."}
      </p>
      {mensaje && <p role="status" className="mt-3 rounded-md bg-accent-wash px-3 py-2 text-sm text-accent-ink">{mensaje}</p>}
      {error && <p role="alert" className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {estado && estado.respaldos.length > 0 && (
        <ul className="mt-3 divide-y divide-border text-sm">
          {estado.respaldos.map((r) => (
            <li key={r.archivo} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <p className="font-mono text-xs text-label-primary">{r.archivo}</p>
                <p className="text-[11px] text-label-tertiary">
                  {cuando(r.creado)} · {tamano(r.bytes)}
                  {r.por ? ` · ${r.por}` : ""} · sha256 {r.sha256.slice(0, 12)}…
                  {r.fotos ? ` · ${r.fotos.objetos} fotos` : ""}
                  {r.fotos_nota ? ` · ${r.fotos_nota}` : ""}
                </p>
              </div>
              <Button variant="outline" className="px-2.5 py-1 text-xs" disabled={bajando === r.archivo} onClick={() => void descargar(r.archivo, r.bytes)}>
                <Download size={12} aria-hidden /> {bajando === r.archivo ? "Descargando…" : "Descargar"}
              </Button>
              {bajando === r.archivo && (
                <Button variant="outline" className="px-2.5 py-1 text-xs" onClick={() => cancelarRef.current?.abort()}>
                  Cancelar descarga
                </Button>
              )}
              {bajando === r.archivo && avance && (() => {
                const pct = avance.total > 0 ? Math.min(100, Math.floor((avance.leidos / avance.total) * 100)) : null;
                return (
                  <div className="basis-full" role="progressbar" aria-label="Avance de la descarga"
                    aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                      <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct ?? 100}%`, opacity: pct === null ? 0.4 : 1 }} />
                    </div>
                    <p className="mt-1 text-[11px] text-label-tertiary">
                      {pct === null ? tamano(avance.leidos) : `${pct} % · ${tamano(avance.leidos)} de ${tamano(avance.total)}`}
                    </p>
                  </div>
                );
              })()}
              <Button variant="outline" className="px-2.5 py-1 text-xs" disabled={haciendo} onClick={() => setRecuperar(r)}>
                Recuperar
              </Button>
              <Button variant="outline" className="px-2.5 py-1 text-xs text-danger" disabled={haciendo || bajando === r.archivo} onClick={() => setEliminar(r)}>
                Eliminar copia
              </Button>
            </li>
          ))}
        </ul>
      )}
      {estado && estado.respaldos.length === 0 && !error && <p className="mt-3 text-xs text-label-tertiary">Todavía no hay respaldos de esta base.</p>}

      {eliminar && (
        <RadixDialog.Root open onOpenChange={(abierto) => { if (!abierto && !haciendo) setEliminar(null); }}>
          <RadixDialog.Portal>
            <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
            <RadixDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 shadow-modal focus:outline-none">
              <RadixDialog.Title className="text-base font-semibold text-label-primary">¿Eliminar esta copia?</RadixDialog.Title>
              <RadixDialog.Description className="mt-1 text-sm text-label-secondary">
                Borra <span className="font-mono text-xs">{eliminar.archivo}</span> ({tamano(eliminar.bytes)}) y su carpeta de fotos del servidor. La base y las fotos actuales no se tocan. No se puede deshacer.
              </RadixDialog.Description>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" disabled={haciendo} onClick={() => setEliminar(null)}>Cancelar</Button>
                <Button variant="danger" disabled={haciendo} onClick={() => void eliminarCopia()}>
                  {haciendo ? "Eliminando…" : "Eliminar copia"}
                </Button>
              </div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        </RadixDialog.Root>
      )}

      {recuperar && estado && (
        <RadixDialog.Root open onOpenChange={() => {}}>
          <RadixDialog.Portal>
            <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
            <RadixDialog.Content
              onEscapeKeyDown={(e) => e.preventDefault()}
              onInteractOutside={(e) => e.preventDefault()}
              className="fixed left-1/2 top-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 shadow-modal focus:outline-none"
            >
              <RadixDialog.Title className="text-base font-semibold text-label-primary">¿Recuperar esta copia?</RadixDialog.Title>
              <RadixDialog.Description className="mt-1 text-sm text-label-secondary">
                Sustituye la base <span className="font-mono text-xs">{estado.base}</span> y las fotos por {recuperar.archivo}. Lo que hay ahora se pierde.
              </RadixDialog.Description>
              {!estado.permiteLimpiar && (
                <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-label-primary">
                  Este servidor tiene la recuperación apagada (BACKUP_ALLOW_CLEAN). El botón funciona, pero el servidor rechazará la orden hasta que se active.
                </p>
              )}
              <label className="mt-4 block space-y-1">
                <span className="text-xs font-medium text-label-secondary">Escribe el nombre de la base para confirmar</span>
                <Input value={nombreRecuperar} onChange={(e) => setNombreRecuperar(e.target.value)} placeholder={estado.base} autoComplete="off" spellCheck={false} disabled={haciendo} />
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" disabled={haciendo} onClick={() => { setRecuperar(null); setNombreRecuperar(""); }}>Cancelar</Button>
                <Button variant="danger" disabled={nombreRecuperar !== estado.base || haciendo} onClick={() => void recuperarAhora()}>
                  {haciendo ? "Recuperando…" : "Recuperar todo"}
                </Button>
              </div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        </RadixDialog.Root>
      )}

      {preparando && estado && (
        <RadixDialog.Root open onOpenChange={(abierto) => { if (!abierto && !haciendo) setPreparando(false); }}>
          <RadixDialog.Portal>
            <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
            <RadixDialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-modal focus:outline-none">
              <RadixDialog.Title className="text-base font-semibold text-label-primary">Antes de limpiar la base</RadixDialog.Title>
              <RadixDialog.Description className="mt-1 text-sm text-label-secondary">
                Primero se hace una copia de <span className="font-mono text-xs">{estado.base}</span>. Elige qué se guarda; la limpieza se confirma en el paso siguiente.
              </RadixDialog.Description>
              <div className="mt-4 space-y-3 text-sm text-label-primary">
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={conFotos} disabled={haciendo} onChange={(e) => setConFotos(e.target.checked)} />
                  <span>Guardar en la copia las fotos y los paquetes de MinIO<br /><span className="text-xs text-label-tertiary">Sin esto, la copia solo trae la base y recuperarla no devuelve las fotos.</span></span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={borrarFotos} disabled={haciendo} onChange={(e) => setBorrarFotos(e.target.checked)} />
                  <span>Borrar también las fotos de MinIO al limpiar<br /><span className="text-xs text-label-tertiary">Desmárcalo para dejarlas donde están y limpiar solo la base.</span></span>
                </label>
                {!conFotos && borrarFotos && (
                  <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">Así las fotos se borrarían sin copia. No podrás recuperarlas.</p>
                )}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" disabled={haciendo} onClick={() => setPreparando(false)}>Cancelar</Button>
                <Button variant="primary" disabled={haciendo} onClick={() => void respaldar(conFotos)}>
                  {haciendo ? "Haciendo la copia…" : "Hacer la copia y continuar"}
                </Button>
              </div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        </RadixDialog.Root>
      )}

      {hecho && estado && (
        <PreguntaBase
          borrarFotos={borrarFotos}
          respaldo={hecho}
          base={estado.base}
          permiteLimpiar={estado.permiteLimpiar}
          onConservar={() => {
            setHecho(null);
            setMensaje(`Copia ${hecho.archivo} lista para descargar. La base actual se conserva.`);
          }}
          onLimpiada={() => {
            setHecho(null);
            setMensaje(`La base se limpió. La copia ${hecho.archivo} se conserva y se puede descargar.`);
            void cargar();
          }}
        />
      )}
    </Card>
  );
}

function PreguntaBase({
  borrarFotos,
  respaldo,
  base,
  permiteLimpiar,
  onConservar,
  onLimpiada,
}: {
  borrarFotos: boolean;
  respaldo: Respaldo;
  base: string;
  permiteLimpiar: boolean;
  onConservar: () => void;
  onLimpiada: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function limpiar() {
    setTrabajando(true);
    setError(null);
    try {
      await pedir("/api/system/respaldo/limpiar", { method: "POST", body: JSON.stringify({ archivo: respaldo.archivo, confirmacion: nombre, borrarFotos }) });
      onLimpiada();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo limpiar la base.");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    // Sin cerrar con Escape, clic fuera ni «X»: solo las dos acciones de la pregunta.
    <RadixDialog.Root open onOpenChange={() => {}}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <RadixDialog.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-modal focus:outline-none"
        >
          <RadixDialog.Title className="text-base font-semibold text-label-primary">Respaldo hecho. ¿Qué pasa con la base actual?</RadixDialog.Title>
          <RadixDialog.Description className="mt-1 text-sm text-label-secondary">
            La copia <span className="font-mono text-xs">{respaldo.archivo}</span> ({tamano(respaldo.bytes)}) ya está guardada y se puede descargar desde
            esta pantalla. La base <span className="font-mono text-xs">{base}</span> sigue intacta.
          </RadixDialog.Description>

          {confirmando && (
            <div className="mt-4 space-y-2 rounded-md bg-danger/10 p-3">
              <p className="text-sm text-danger">
                Limpiar borra los datos de todas las tablas de <span className="font-mono">{base}</span> {borrarFotos ? "y también las fotos y los archivos de paquete en MinIO" : "pero deja las fotos de MinIO como están"}. No se puede deshacer; solo queda la copia.
              </p>
              {!permiteLimpiar && (
                <p className="text-sm text-label-primary">La limpieza está desactivada en este servidor, así que el servidor la rechazará.</p>
              )}
              <label className="block space-y-1">
                <span className="text-xs font-medium text-label-secondary">Escribe el nombre de la base para confirmar</span>
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={base} autoComplete="off" spellCheck={false} disabled={trabajando} />
              </label>
              {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            </div>
          )}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="primary" disabled={trabajando} onClick={onConservar}>
              Conservar la base actual
            </Button>
            {!confirmando ? (
              <Button variant="outline" className="text-danger" onClick={() => setConfirmando(true)}>
                Limpiar la actual y conservar la copia
              </Button>
            ) : (
              <Button variant="danger" disabled={nombre !== base || trabajando} onClick={() => void limpiar()}>
                {trabajando ? "Limpiando…" : "Confirmar limpieza"}
              </Button>
            )}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
