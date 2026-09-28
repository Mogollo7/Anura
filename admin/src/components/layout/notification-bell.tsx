"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { appApi, formatRelative, type Aviso } from "@/lib/app-data/app-client";
import { usePanelSession } from "@/lib/session/panel-session";

/** Campana del panel: avisos ya enviados y cuántas personas faltan por leerlos. */
export function NotificationBell() {
  const session = usePanelSession();
  const [open, setOpen] = useState(false);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session.isReal) return;
    let alive = true;
    appApi.avisos()
      .then((rows) => { if (alive) setAvisos(rows); })
      .catch(() => { if (alive) setAvisos([]); });
    return () => { alive = false; };
  }, [session.isReal]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  const pending = avisos.reduce((sum, a) => sum + Math.max(0, a.destinatarios - a.leidos), 0);
  const recent = avisos.slice(0, 6);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-label-secondary hover:bg-surface-subtle hover:text-label-primary"
        aria-label="Avisos"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={16} />
        {pending > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {pending > 9 ? "9+" : pending}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-lg border border-border bg-surface p-2 shadow-lg">
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="text-xs font-semibold text-label-primary">Avisos enviados</p>
            <Link href="/notificaciones" className="text-xs text-accent-ink hover:underline" onClick={() => setOpen(false)}>
              Ver todos
            </Link>
          </div>
          {!session.isReal ? (
            <p className="px-2 py-4 text-center text-xs text-label-secondary">
              Inicia sesión para ver los avisos enviados.{" "}
              <Link href="/login" className="text-accent-ink hover:underline" onClick={() => setOpen(false)}>Entrar</Link>
            </p>
          ) : recent.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-label-secondary">Todavía no se ha enviado ningún aviso.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {recent.map((a) => (
                <li key={a.id} className="rounded-md px-2 py-2 hover:bg-surface-subtle">
                  <p className="text-sm font-medium text-label-primary">{a.titulo}</p>
                  {a.cuerpo && <p className="mt-0.5 line-clamp-2 text-xs text-label-secondary">{a.cuerpo}</p>}
                  <p className="mt-1 text-[11px] text-label-tertiary">
                    {a.leidos} de {a.destinatarios} leídos · {formatRelative(a.enviado)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
