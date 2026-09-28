"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import { appApi, useAppResource, type AuditEntry } from "@/lib/app-data/app-client";
import { accionLegible } from "@/lib/app-data/panel-signals";

type Entrada = AuditEntry;

const PAGE_SIZE = 50;

function objetivo(e: Entrada) {
  const tipo = (e.target_type || "").trim();
  const id = (e.target_id || "").trim();
  if (!tipo && !id) return "—";
  if (!id) return tipo;
  if (!tipo) return id;
  return `${tipo} · ${id}`;
}

function metadataTexto(meta: unknown) {
  if (meta == null) return "—";
  if (typeof meta === "string") {
    const t = meta.trim();
    return t || "—";
  }
  try {
    const s = JSON.stringify(meta);
    return !s || s === "{}" || s === "[]" || s === "null" ? "—" : s;
  } catch {
    return "—";
  }
}

function fecha(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

/** Bitácora de audit.log. Si el servidor no responde, no se inventan filas. */
export function AuditLive() {
  const { value } = useAppResource(appApi.audit);
  const entradas: Entrada[] | null = value.state === "listo" ? value.data : value.state === "error" ? [] : null;
  const error = value.state === "error" ? value.message : null;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (entradas ?? []).filter((e) => {
      if (!q) return true;
      return (
        e.action.toLowerCase().includes(q) ||
        accionLegible(e).toLowerCase().includes(q) ||
        e.actor.toLowerCase().includes(q) ||
        objetivo(e).toLowerCase().includes(q) ||
        metadataTexto(e.metadata).toLowerCase().includes(q)
      );
    });
  }, [entradas, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Auditoría</h1>
        <p className="mt-1 max-w-2xl text-sm text-label-secondary">
          Acciones que los servicios ya escriben en la bitácora del servidor. Si no hay filas, es que todavía no se registró ninguna.
        </p>
      </div>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(0);
        }}
        placeholder="Buscar actor, acción, objetivo o metadata…"
        className="w-full max-w-xs rounded-md border border-border bg-surface py-1.5 px-3 text-sm text-label-primary placeholder:text-label-tertiary focus:outline-none focus:ring-2 focus:ring-accent-tint"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      {entradas === null ? (
        <p className="text-sm text-label-secondary">Leyendo la bitácora…</p>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Actor</TH>
              <TH>Acción</TH>
              <TH>Objetivo</TH>
              <TH>Fecha</TH>
              <TH>Metadata</TH>
            </tr>
          </THead>
          <TBody>
            {pageRows.map((e) => {
              const meta = metadataTexto(e.metadata);
              return (
                <TRow key={e.id}>
                  <TD className="whitespace-nowrap text-label-secondary">{e.actor || "sistema"}</TD>
                  <TD className="font-medium" title={e.action}>{accionLegible(e)}</TD>
                  <TD className="max-w-xs truncate text-xs text-label-secondary" title={objetivo(e)}>
                    {objetivo(e)}
                  </TD>
                  <TD className="whitespace-nowrap text-label-secondary">{fecha(e.created_at)}</TD>
                  <TD className="max-w-md truncate text-xs text-label-secondary" title={meta}>
                    {meta}
                  </TD>
                </TRow>
              );
            })}
            {filtered.length === 0 && !error && (
              <tr>
                <TD colSpan={5} className="py-8 text-center text-label-secondary">
                  La bitácora está vacía.
                </TD>
              </tr>
            )}
          </TBody>
        </Table>
      )}
      {entradas && (
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="neutral">
            {filtered.length} de {entradas.length} acciones
            {entradas.length >= 200 ? " (límite 200)" : ""}
          </Badge>
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center gap-2 text-sm text-label-secondary">
              <button
                type="button"
                disabled={safePage <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded-md border border-border px-2 py-1 disabled:opacity-40"
              >
                Anterior
              </button>
              <span>
                {safePage + 1} / {pageCount}
              </span>
              <button
                type="button"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                className="rounded-md border border-border px-2 py-1 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
