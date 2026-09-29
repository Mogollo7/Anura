"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ImageOff, Lock, MapPin, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Table, TBody, TD, TH, THead, TRow } from "@/components/ui/table";
import { DataState } from "@/components/app-data/data-state";
import {
  appApi, formatDate, PENDING_STATUSES, speciesLabel, STATUS_INFO, thumbUrl, useAppResource,
  type AppObservation,
} from "@/lib/app-data/app-client";
import { cn } from "@/lib/utils";

type Tab = "pendientes" | "validated" | "rejected" | "todas";

const TABS: { id: Tab; label: string; match: (o: AppObservation) => boolean }[] = [
  { id: "pendientes", label: "Por revisar", match: (o) => PENDING_STATUSES.includes(o.status) },
  { id: "validated", label: "Aprobadas", match: (o) => o.status === "validated" },
  { id: "rejected", label: "Rechazadas", match: (o) => o.status === "rejected" },
  { id: "todas", label: "Todas", match: () => true },
];

const QUICK_REASONS = ["No se ve ningún anfibio", "Foto borrosa o muy lejos", "La especie sugerida no corresponde", "Foto repetida"];

export function ObservationsReview() {
  const { value, reload, set } = useAppResource(appApi.observations);
  return (
    <DataState value={value} onRetry={reload}>
      {(observations) => <ReviewList observations={observations} onChange={(o) => set((all) => all.map((x) => (x.id === o.id ? { ...x, ...o } : x)))} />}
    </DataState>
  );
}

function ReviewList({ observations, onChange }: { observations: AppObservation[]; onChange: (o: Partial<AppObservation> & { id: string }) => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const usuario = params.get("usuario");
  const [tab, setTab] = useState<Tab>(usuario ? "todas" : "pendientes");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(params.get("id"));

  const scoped = useMemo(() => (usuario ? observations.filter((o) => o.username === usuario) : observations), [observations, usuario]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = TABS.find((t) => t.id === tab)!.match;
    return scoped.filter(
      (o) => match(o) && (!q || [speciesLabel(o), o.username, o.place_guess ?? "", o.notes ?? ""].some((s) => s.toLowerCase().includes(q)))
    );
  }, [scoped, tab, query]);

  const open = observations.find((o) => o.id === openId) ?? null;

  // Después de decidir, pasa a la siguiente del mismo filtro: revisar es un flujo, no clics sueltos.
  function afterDecision(id: string) {
    const idx = visible.findIndex((o) => o.id === id);
    // En "Por revisar" la decidida sale de la lista: sigue con la de abajo y, al final, vuelve arriba.
    const next =
      tab === "pendientes"
        ? [...visible.slice(idx + 1), ...visible.slice(0, Math.max(idx, 0))][0]
        : visible[idx + 1];
    setOpenId(next?.id ?? null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Estado">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                tab === t.id ? "bg-accent-wash text-accent-ink" : "bg-surface-subtle text-label-secondary hover:text-label-primary"
              )}
            >
              {t.label} ({scoped.filter(t.match).length})
            </button>
          ))}
        </div>
        <label className="relative sm:w-72">
          <span className="sr-only">Buscar observaciones</span>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-label-tertiary" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Especie, usuario o lugar" className="pl-8" />
        </label>
      </div>

      {usuario && (
        <div className="flex items-center gap-2 text-sm text-label-secondary">
          Solo las de <strong className="text-label-primary">@{usuario}</strong>
          <button onClick={() => router.replace("/observaciones")} className="flex items-center gap-1 rounded-full bg-surface-subtle px-2 py-0.5 text-xs hover:text-label-primary">
            <X size={12} aria-hidden /> Ver todas
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-label-secondary">
          {tab === "pendientes" ? "No queda ninguna observación por revisar." : "Ninguna observación coincide con este filtro."}
        </p>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH className="w-14"><span className="sr-only">Foto</span></TH>
              <TH>Especie sugerida</TH>
              <TH>Usuario</TH>
              <TH>Lugar</TH>
              <TH>Fecha</TH>
              <TH>Estado</TH>
            </tr>
          </THead>
          <TBody>
            {visible.map((o) => (
              <TRow key={o.id} clickable onClick={() => setOpenId(o.id)}>
                <TD><Thumb o={o} size="h-10 w-10" /></TD>
                <TD>
                  <span className="italic text-label-primary">{speciesLabel(o)}</span>
                  {o.ai_prob != null && <span className="block text-[11px] text-label-tertiary">{Math.round(o.ai_prob * 100)} % según el modelo</span>}
                </TD>
                <TD className="text-label-secondary">@{o.username}</TD>
                <TD className="max-w-56 truncate text-label-secondary" title={o.place_guess ?? undefined}>{shortPlace(o.place_guess)}</TD>
                <TD className="whitespace-nowrap text-label-secondary">{formatDate(o.recorded_at ?? o.created_at)}</TD>
                <TD>
                  <span className="flex items-center gap-1.5">
                    <Badge tone={STATUS_INFO[o.status].tone}>{STATUS_INFO[o.status].label}</Badge>
                    {o.is_private && <Lock size={12} className="text-label-tertiary" aria-label="Privada" />}
                  </span>
                </TD>
              </TRow>
            ))}
          </TBody>
        </Table>
      )}

      {open && (
        <ReviewDialog
          key={open.id}
          observation={open}
          position={visible.findIndex((o) => o.id === open.id) + 1}
          total={visible.length}
          onClose={() => setOpenId(null)}
          onDecided={(o) => {
            onChange(o);
            afterDecision(o.id);
          }}
        />
      )}
    </div>
  );
}

function ReviewDialog({
  observation: o,
  position,
  total,
  onClose,
  onDecided,
}: {
  observation: AppObservation;
  position: number;
  total: number;
  onClose: () => void;
  onDecided: (o: Partial<AppObservation> & { id: string }) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(estado: "validated" | "rejected") {
    setBusy(true);
    setError(null);
    try {
      const r = await appApi.reviewObservation(o.id, estado, estado === "rejected" ? reason.trim() : undefined);
      onDecided(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la decisión");
      setBusy(false);
    }
  }

  const img = thumbUrl(o.thumbnail_key ?? o.image_key, "large");
  const status = STATUS_INFO[o.status];

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} className="w-[min(720px,94vw)] overflow-y-auto p-6">
      <DialogHeader
        title={speciesLabel(o)}
        description={position > 0 ? `${position} de ${total} · reportada por @${o.username}` : `Reportada por @${o.username}`}
      />
      <div className="grid gap-5 sm:grid-cols-[1fr_16rem]">
        <div className="overflow-hidden rounded-lg border border-border bg-surface-subtle">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={`Foto de la observación: ${speciesLabel(o)}`} className="aspect-[4/3] w-full object-contain" />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center text-label-tertiary"><ImageOff size={28} aria-label="Sin foto" /></div>
          )}
        </div>
        <dl className="space-y-3 text-sm">
          <Row label="Estado"><Badge tone={status.tone}>{status.label}</Badge>{o.is_private && <span className="ml-2 text-xs text-label-tertiary">Privada</span>}</Row>
          <Row label="Sugerencia del modelo">{o.ai_class ? `${speciesLabel(o)}${o.ai_prob != null ? ` · ${Math.round(o.ai_prob * 100)} %` : ""}` : "Sin sugerencia"}</Row>
          <Row label="Fecha">{formatDate(o.recorded_at ?? o.created_at)}</Row>
          <Row label="Lugar">
            {o.place_guess ? shortPlace(o.place_guess) : "Sin lugar"}
            {o.altitude_m != null && <span className="block text-xs text-label-tertiary">{Math.round(o.altitude_m).toLocaleString("es-CO")} m s. n. m.</span>}
            {o.lat != null && o.lon != null && (
              <a
                className="mt-0.5 inline-flex items-center gap-1 text-xs text-accent-ink hover:underline"
                href={`https://www.openstreetmap.org/?mlat=${o.lat}&mlon=${o.lon}#map=14/${o.lat}/${o.lon}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MapPin size={12} aria-hidden /> Ver en el mapa
              </a>
            )}
          </Row>
          {o.field_trip_id && (<Row label="Salida de campo">{o.field_trip_place ? shortPlace(o.field_trip_place) : "Salida sin lugar"}{o.field_trip_started && <span className="block text-xs text-label-tertiary">{formatDate(o.field_trip_started)}</span>}</Row>)}
          {o.notes && <Row label="Nota de quien la reportó">{o.notes}</Row>}
          {o.review_reason && <Row label="Motivo de la última decisión">{o.review_reason}</Row>}
          <Row label="Usuario">
            <Link href={`/usuarios?id=${o.user_id}`} className="text-accent-ink hover:underline">@{o.username}</Link>
          </Row>
        </dl>
      </div>

      {rejecting && (
        <div className="mt-5 space-y-2 rounded-lg border border-border p-4">
          <Field label="¿Por qué la rechazas?" hint="Lo lee la persona que la reportó.">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} autoFocus />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} className="rounded-full bg-surface-subtle px-2.5 py-1 text-xs text-label-secondary hover:text-label-primary">
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-danger" role="alert">{error}</p>}

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
        {rejecting ? (
          <>
            <Button variant="ghost" onClick={() => { setRejecting(false); setReason(""); }} disabled={busy}>Cancelar</Button>
            <Button variant="danger" onClick={() => decide("rejected")} disabled={busy || !reason.trim()}>Rechazar observación</Button>
          </>
        ) : (
          <>
            <Button variant="outline" className="text-danger" onClick={() => setRejecting(true)} disabled={busy}>Rechazar…</Button>
            <Button variant="primary" onClick={() => decide("validated")} disabled={busy || o.status === "validated"}>
              {o.status === "validated" ? "Ya está aprobada" : "Aprobar"}
            </Button>
          </>
        )}
      </div>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-label-tertiary">{label}</dt>
      <dd className="text-label-primary">{children}</dd>
    </div>
  );
}

export function Thumb({ o, size }: { o: Pick<AppObservation, "thumbnail_key" | "image_key" | "ai_class">; size: string }) {
  const src = thumbUrl(o.thumbnail_key ?? o.image_key, "small");
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className={cn(size, "rounded-md border border-border object-cover")} />
  ) : (
    <span className={cn(size, "flex items-center justify-center rounded-md bg-surface-subtle text-label-tertiary")}><ImageOff size={14} aria-hidden /></span>
  );
}

/** "Vereda X, Caldas, Valle de Aburrá, Antioquia, …, Colombia" → "Vereda X, Caldas". */
function shortPlace(place: string | null) {
  if (!place) return "—";
  return place.split(",").map((s) => s.trim()).filter((s) => s && !/^\d/.test(s)).slice(0, 2).join(", ");
}
