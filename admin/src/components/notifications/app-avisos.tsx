"use client";

import { useMemo, useRef, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Table, TBody, TD, TH, THead, TRow } from "@/components/ui/table";
import { DataState } from "@/components/app-data/data-state";
import {
  appApi,
  formatDate,
  useAppResource,
  type AppUser,
  type Aviso,
  type AvisoEnlace,
  type AvisoEnvio,
  type AvisoVistaPrevia,
} from "@/lib/app-data/app-client";
import { plural } from "@/lib/utils";

const MAX_TITULO = 80;
const MAX_CUERPO = 4000;
const MAX_ENLACES = 5;
const MAX_IMAGEN = 2 * 1024 * 1024;

/**
 * Avisos reales: un envío guarda una fila por destinatario en notification-service. La web y
 * la app Android los leen con GET /api/notifications (la app no cambia): title y body.
 *
 * Un aviso puede llevar texto largo, enlaces e imagen, como un correo. Eso no cabe en la
 * notificación del teléfono, así que el body lleva un resumen y el enlace público /a/<token>
 * con el contenido completo. La vista previa muestra exactamente lo que recibirá el teléfono.
 */
export function AppAvisos() {
  const avisos = useAppResource(appApi.avisos);
  const users = useAppResource(appApi.users);
  return (
    <DataState value={avisos.value} onRetry={avisos.reload}>
      {(list) => (
        <div className="grid gap-6 xl:grid-cols-[26rem_1fr]">
          <Composer users={users.value.state === "listo" ? users.value.data.filter((u) => u.is_active) : []} onSent={avisos.reload} />
          <Sent avisos={list} onChanged={avisos.reload} />
        </div>
      )}
    </DataState>
  );
}

/** Quita el pie «Ver completo: url» que el teléfono guarda en el body. La web lo muestra como botón. */
function cuerpoWeb(cuerpo: string | null | undefined) {
  if (!cuerpo) return "";
  return cuerpo.replace(/\n*Ver completo\b[\s\S]*$/, "").trim();
}

function leerImagen(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function Composer({ users, onSent }: { users: AppUser[]; onSent: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [enlaces, setEnlaces] = useState<AvisoEnlace[]>([]);
  const [imagen, setImagen] = useState<{ dataUrl: string; nombre: string; bytes: number } | null>(null);
  const [destino, setDestino] = useState<"todos" | "usuario" | "usuarios">("todos");
  const [usuarioId, setUsuarioId] = useState("");
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [preview, setPreview] = useState<AvisoVistaPrevia | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; link?: string | null } | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  const reach = destino === "todos" ? users.length : destino === "usuario" ? (usuarioId ? 1 : 0) : elegidos.size;
  const enlacesValidos = enlaces.every((e) => e.texto.trim() && e.url.trim());
  const ready = titulo.trim().length > 0 && reach > 0 && enlacesValidos;
  const people = reach === 1 ? "1 persona" : `${reach} personas`;
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return q ? users.filter((u) => u.username.toLowerCase().includes(q)) : users;
  }, [users, busqueda]);

  const envio = (): AvisoEnvio => ({
    titulo: titulo.trim(),
    cuerpo: cuerpo.trim(),
    destino,
    ...(destino === "usuario" ? { usuario_id: usuarioId } : {}),
    ...(destino === "usuarios" ? { usuario_ids: [...elegidos] } : {}),
    ...(enlaces.length ? { enlaces: enlaces.map((e) => ({ texto: e.texto.trim(), url: e.url.trim() })) } : {}),
    ...(imagen ? { imagen: { base64: imagen.dataUrl } } : {}),
  });

  const cambia = () => {
    setConfirming(false);
    setPreview(null);
    setResult(null);
  };

  async function elegirImagen(file: File | undefined) {
    if (!file) return;
    cambia();
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      setResult({ ok: false, text: "La imagen debe ser JPG, PNG, WebP o GIF." });
      return;
    }
    if (file.size > MAX_IMAGEN) {
      setResult({ ok: false, text: `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)} MB; el máximo es 2 MB.` });
      return;
    }
    try {
      setImagen({ dataUrl: await leerImagen(file), nombre: file.name, bytes: file.size });
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : "No se pudo leer la imagen." });
    }
  }

  async function vistaPrevia() {
    setBusy(true);
    setResult(null);
    try {
      setPreview(await appApi.previewAviso(envio()));
      setConfirming(true);
    } catch (err) {
      setPreview(null);
      setResult({ ok: false, text: err instanceof Error ? err.message : "No se pudo preparar el aviso" });
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setResult(null);
    try {
      const r = await appApi.sendAviso(envio());
      setResult({
        ok: true,
        text: `Aviso guardado para ${r.destinatarios === 1 ? "1 persona" : `${r.destinatarios} personas`}.`,
        link: r.enlace_publico,
      });
      setTitulo("");
      setCuerpo("");
      setEnlaces([]);
      setImagen(null);
      setElegidos(new Set());
      setPreview(null);
      setConfirming(false);
      onSent();
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : "No se pudo enviar el aviso" });
    } finally {
      setBusy(false);
    }
  }

  const setEnlace = (i: number, parte: Partial<AvisoEnlace>) => {
    cambia();
    setEnlaces((l) => l.map((e, k) => (k === i ? { ...e, ...parte } : e)));
  };

  return (
    <Card className="h-fit p-5">
      <CardHeader><CardTitle>Nuevo aviso</CardTitle></CardHeader>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ready && !busy) void vistaPrevia(); }}>
        <Field label="Título" hint={`${titulo.length}/${MAX_TITULO}`}>
          <Input value={titulo} onChange={(e) => { setTitulo(e.target.value); cambia(); }} maxLength={MAX_TITULO} required />
        </Field>
        <Field label="Mensaje (opcional)" hint={`${cuerpo.length}/${MAX_CUERPO}. Las direcciones web se vuelven enlaces; una línea en blanco separa párrafos.`}>
          <Textarea value={cuerpo} onChange={(e) => { setCuerpo(e.target.value); cambia(); }} maxLength={MAX_CUERPO} rows={6} />
        </Field>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-label-secondary">Botones con enlace ({enlaces.length}/{MAX_ENLACES})</span>
            <Button type="button" variant="ghost" className="px-2 py-1 text-xs" disabled={enlaces.length >= MAX_ENLACES}
              onClick={() => { cambia(); setEnlaces((l) => [...l, { texto: "", url: "" }]); }}>
              + Añadir enlace
            </Button>
          </div>
          {enlaces.map((e, i) => (
            <div key={i} className="grid grid-cols-[1fr_1.4fr_auto] items-center gap-2">
              <Input aria-label={`Texto del enlace ${i + 1}`} placeholder="Texto del botón" value={e.texto} maxLength={60} onChange={(ev) => setEnlace(i, { texto: ev.target.value })} />
              <Input aria-label={`Dirección del enlace ${i + 1}`} placeholder="https://…" inputMode="url" value={e.url} maxLength={500} onChange={(ev) => setEnlace(i, { url: ev.target.value })} />
              <Button type="button" variant="ghost" className="px-2 py-1 text-xs" aria-label={`Quitar enlace ${i + 1}`}
                onClick={() => { cambia(); setEnlaces((l) => l.filter((_, k) => k !== i)); }}>
                Quitar
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <span className="text-xs font-medium text-label-secondary">Imagen (opcional, hasta 2 MB)</span>
          <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
            onChange={(e) => { void elegirImagen(e.target.files?.[0]); e.target.value = ""; }} />
          {imagen ? (
            <div className="flex items-center gap-3 rounded-lg border border-border p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local de un archivo que la persona acaba de elegir */}
              <img src={imagen.dataUrl} alt="Vista previa de la imagen adjunta" className="h-14 w-14 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-label-primary">{imagen.nombre}</p>
                <p className="text-xs text-label-tertiary">{(imagen.bytes / 1024).toFixed(0)} KB</p>
              </div>
              <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => { cambia(); setImagen(null); }}>Quitar</Button>
            </div>
          ) : (
            <Button type="button" variant="outline" className="w-full" onClick={() => archivo.current?.click()}>Elegir imagen…</Button>
          )}
        </div>

        <Field label="Para quién">
          <Select value={destino} onChange={(e) => { setDestino(e.target.value as typeof destino); cambia(); }}>
            <option value="todos">Todas las cuentas activas ({users.length})</option>
            <option value="usuario">Una sola cuenta</option>
            <option value="usuarios">Varias cuentas</option>
          </Select>
        </Field>
        {destino === "usuario" && (
          <Field label="Cuenta">
            <Select value={usuarioId} onChange={(e) => { setUsuarioId(e.target.value); cambia(); }}>
              <option value="">Elige una cuenta</option>
              {users.map((u) => <option key={u.id} value={u.id}>@{u.username}</option>)}
            </Select>
          </Field>
        )}
        {destino === "usuarios" && (
          <div className="space-y-2">
            <Input aria-label="Buscar cuenta" placeholder="Buscar cuenta…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            <ul className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1.5">
              {visibles.map((u) => (
                <li key={u.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-label-primary hover:bg-surface-subtle">
                    <input type="checkbox" checked={elegidos.has(u.id)}
                      onChange={(e) => { cambia(); setElegidos((s) => { const n = new Set(s); if (e.target.checked) n.add(u.id); else n.delete(u.id); return n; }); }} />
                    @{u.username}
                  </label>
                </li>
              ))}
              {visibles.length === 0 && <li className="px-1.5 py-1 text-xs text-label-tertiary">Ninguna cuenta coincide.</li>}
            </ul>
            <p className="text-[11px] text-label-tertiary">{plural(elegidos.size, "cuenta elegida", "cuentas elegidas")}</p>
          </div>
        )}

        {confirming && preview ? (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-xs font-medium text-label-secondary">Así llega al teléfono (la app no cambia)</p>
            <div className="rounded-xl bg-surface-subtle p-3">
              <p className="text-sm font-semibold text-label-primary">{preview.titulo}</p>
              {preview.cuerpo_telefono && <p className="mt-1 whitespace-pre-line break-words text-sm text-label-secondary">{preview.cuerpo_telefono}</p>}
            </div>
            <p className="text-xs font-medium text-label-secondary">Así se ve en la campana de la web</p>
            <div className="rounded-xl border border-border bg-surface p-3">
              <p className="text-sm font-semibold text-label-primary">{preview.titulo}</p>
              {cuerpoWeb(preview.cuerpo_telefono) && (
                <p className="mt-1 whitespace-pre-line break-words text-sm text-label-secondary">{cuerpoWeb(preview.cuerpo_telefono)}</p>
              )}
              {preview.rico && (
                <p className="mt-2 text-xs font-semibold text-accent-ink underline">Ver completo</p>
              )}
            </div>
            {preview.rico && (
              <p className="text-xs text-label-tertiary">
                En la web, «Ver completo» abre la página con el texto, los botones y la imagen. El enlace <span className="font-mono">/a/…</span> se genera al enviar. El teléfono sigue llevando esa dirección dentro del mensaje.
              </p>
            )}
            <p className="text-sm text-label-primary">¿Enviar a {preview.destinatarios === 1 ? "1 persona" : `${preview.destinatarios} personas`}?{" "}
              Podrás retirarlo después, pero quien ya lo vio lo vio.</p>
            <div className="flex justify-between gap-2">
              <Button type="button" variant="ghost" onClick={() => { setConfirming(false); setPreview(null); }} disabled={busy}>Seguir editando</Button>
              <Button type="button" variant="primary" onClick={send} disabled={busy}>{busy ? "Enviando…" : "Enviar aviso"}</Button>
            </div>
          </div>
        ) : (
          <Button type="submit" variant="primary" className="w-full" disabled={!ready || busy}>
            {busy ? "Preparando…" : reach ? `Revisar y enviar a ${people}` : "Revisar y enviar"}
          </Button>
        )}
        {result && (
          <div role="status" className={result.ok ? "text-sm text-accent-ink" : "text-sm text-danger"}>
            <p>{result.text}</p>
            {result.link && (
              <p className="mt-1 break-all text-xs">
                Enlace público: <a className="underline" href={result.link} target="_blank" rel="noopener noreferrer">{result.link}</a>
              </p>
            )}
          </div>
        )}
        <p className="text-[11px] text-label-tertiary">
          Queda guardado en el servidor para cada persona. La web lo muestra en la campana y, si lleva texto largo, enlaces o imagen, añade «Ver completo». El teléfono lo muestra en Avisos y, si el permiso está concedido, en la barra de notificaciones.
        </p>
      </form>
    </Card>
  );
}

function Sent({ avisos, onChanged }: { avisos: Aviso[]; onChanged: () => void }) {
  const [retirando, setRetirando] = useState<Aviso | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retirar() {
    if (!retirando) return;
    setBusy(true);
    setError(null);
    try {
      await appApi.retirarAviso(retirando.id);
      setRetirando(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo retirar el aviso");
      setRetirando(null);
    } finally {
      setBusy(false);
    }
  }

  if (avisos.length === 0) {
    return (
      <p className="h-fit rounded-lg border border-dashed border-border p-8 text-center text-sm text-label-secondary">
        Todavía no se ha enviado ningún aviso. Escribe el primero a la izquierda.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <ConfirmDialog
        open={!!retirando}
        danger
        busy={busy}
        title={`¿Retirar «${retirando?.titulo ?? ""}»?`}
        description="Desaparece de la web y de la app de todas las personas que lo recibieron, y el enlace público deja de funcionar. Queda anotado en la auditoría."
        confirmLabel="Retirar aviso"
        onConfirm={retirar}
        onCancel={() => setRetirando(null)}
      />
      <Table>
        <THead>
          <tr>
            <TH>Aviso</TH>
            <TH>Para</TH>
            <TH>Leído</TH>
            <TH>Enviado</TH>
            <TH></TH>
          </tr>
        </THead>
        <TBody>
          {avisos.map((a) => (
            <TRow key={a.id}>
              <TD>
                <span className="block font-medium text-label-primary">{a.titulo}</span>
                {a.cuerpo && <span className="block max-w-md truncate text-xs text-label-tertiary">{a.cuerpo}</span>}
                {(a.con_imagen || (a.enlaces ?? 0) > 0 || a.enlace_publico) && (
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    {a.con_imagen && <Badge tone="info">Imagen</Badge>}
                    {(a.enlaces ?? 0) > 0 && <Badge tone="neutral">{plural(a.enlaces ?? 0, "enlace", "enlaces")}</Badge>}
                    {a.enlace_publico && (
                      <a className="text-xs text-accent-ink underline" href={a.enlace_publico} target="_blank" rel="noopener noreferrer">Ver página</a>
                    )}
                  </span>
                )}
              </TD>
              <TD className="text-label-secondary">
                {a.destino === "usuario" && a.usuario ? `@${a.usuario}` : plural(a.destinatarios, "cuenta", "cuentas")}
              </TD>
              <TD className="text-label-secondary">{a.leidos} de {a.destinatarios}</TD>
              <TD className="whitespace-nowrap text-label-secondary">
                {formatDate(a.enviado)}
                {a.autor && <span className="block text-xs text-label-tertiary">por {a.autor}</span>}
              </TD>
              <TD className="text-right">
                <Button variant="ghost" className="px-2 py-1 text-xs text-danger" onClick={() => setRetirando(a)}>Retirar</Button>
              </TD>
            </TRow>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
