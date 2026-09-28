"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Table, TBody, TD, TH, THead, TRow } from "@/components/ui/table";
import { DataState } from "@/components/app-data/data-state";
import { appApi, formatDate, useAppResource, type AppUser, type Aviso } from "@/lib/app-data/app-client";

/**
 * Avisos reales: un envío guarda una fila por destinatario en notification-service. La web y
 * la app Android los leen con GET /api/notifications; en el teléfono, además, salen como
 * notificación del sistema.
 */
export function AppAvisos() {
  const avisos = useAppResource(appApi.avisos);
  const users = useAppResource(appApi.users);
  return (
    <DataState value={avisos.value} onRetry={avisos.reload}>
      {(list) => (
        <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
          <Composer users={users.value.state === "listo" ? users.value.data.filter((u) => u.is_active) : []} onSent={avisos.reload} />
          <Sent avisos={list} />
        </div>
      )}
    </DataState>
  );
}

function Composer({ users, onSent }: { users: AppUser[]; onSent: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [destino, setDestino] = useState<"todos" | "usuario">("todos");
  const [usuarioId, setUsuarioId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const reach = destino === "todos" ? users.length : usuarioId ? 1 : 0;
  const ready = titulo.trim().length > 0 && reach > 0;
  const people = reach === 1 ? "1 persona" : `${reach} personas`;

  async function send() {
    setBusy(true);
    setResult(null);
    try {
      const r = await appApi.sendAviso({ titulo: titulo.trim(), cuerpo: cuerpo.trim(), destino, usuario_id: destino === "usuario" ? usuarioId : undefined });
      setResult({ ok: true, text: `Aviso guardado para ${r.destinatarios === 1 ? "1 persona" : `${r.destinatarios} personas`}.` });
      setTitulo("");
      setCuerpo("");
      setConfirming(false);
      onSent();
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : "No se pudo enviar el aviso" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="h-fit p-5">
      <CardHeader><CardTitle>Nuevo aviso</CardTitle></CardHeader>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ready) setConfirming(true); }}>
        <Field label="Título" hint={`${titulo.length}/80`}>
          <Input value={titulo} onChange={(e) => { setTitulo(e.target.value); setConfirming(false); }} maxLength={80} required />
        </Field>
        <Field label="Mensaje (opcional)" hint={`${cuerpo.length}/500`}>
          <Textarea value={cuerpo} onChange={(e) => { setCuerpo(e.target.value); setConfirming(false); }} maxLength={500} rows={4} />
        </Field>
        <Field label="Para quién">
          <Select value={destino} onChange={(e) => { setDestino(e.target.value as "todos" | "usuario"); setConfirming(false); }}>
            <option value="todos">Todas las cuentas activas ({users.length})</option>
            <option value="usuario">Una sola cuenta</option>
          </Select>
        </Field>
        {destino === "usuario" && (
          <Field label="Cuenta">
            <Select value={usuarioId} onChange={(e) => { setUsuarioId(e.target.value); setConfirming(false); }}>
              <option value="">Elige una cuenta</option>
              {users.map((u) => <option key={u.id} value={u.id}>@{u.username}</option>)}
            </Select>
          </Field>
        )}

        {confirming ? (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm text-label-primary">¿Enviar «{titulo.trim()}» a {people}? No se puede retirar.</p>
            <div className="flex justify-between gap-2">
              <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>Cancelar</Button>
              <Button type="button" variant="primary" onClick={send} disabled={busy}>Enviar aviso</Button>
            </div>
          </div>
        ) : (
          <Button type="submit" variant="primary" className="w-full" disabled={!ready}>
            {reach ? `Enviar a ${people}` : "Enviar aviso"}
          </Button>
        )}
        {result && <p className={result.ok ? "text-sm text-accent-ink" : "text-sm text-danger"} role="status">{result.text}</p>}
        <p className="text-[11px] text-label-tertiary">
          Queda guardado en el servidor para cada persona. La web lo muestra en la campana; el teléfono lo muestra en Avisos y, si el permiso está concedido, en la barra de notificaciones.
        </p>
      </form>
    </Card>
  );
}

function Sent({ avisos }: { avisos: Aviso[] }) {
  if (avisos.length === 0) {
    return (
      <p className="h-fit rounded-lg border border-dashed border-border p-8 text-center text-sm text-label-secondary">
        Todavía no se ha enviado ningún aviso. Escribe el primero a la izquierda.
      </p>
    );
  }
  return (
    <Table>
      <THead>
        <tr>
          <TH>Aviso</TH>
          <TH>Para</TH>
          <TH>Leído</TH>
          <TH>Enviado</TH>
        </tr>
      </THead>
      <TBody>
        {avisos.map((a) => (
          <TRow key={a.id}>
            <TD>
              <span className="block font-medium text-label-primary">{a.titulo}</span>
              {a.cuerpo && <span className="block max-w-md truncate text-xs text-label-tertiary">{a.cuerpo}</span>}
            </TD>
            <TD className="text-label-secondary">{a.destino === "usuario" && a.usuario ? `@${a.usuario}` : `${a.destinatarios} cuentas`}</TD>
            <TD className="text-label-secondary">{a.leidos} de {a.destinatarios}</TD>
            <TD className="whitespace-nowrap text-label-secondary">
              {formatDate(a.enviado)}
              {a.autor && <span className="block text-xs text-label-tertiary">por {a.autor}</span>}
            </TD>
          </TRow>
        ))}
      </TBody>
    </Table>
  );
}
