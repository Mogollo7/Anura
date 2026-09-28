"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Table, TBody, TD, TH, THead, TRow } from "@/components/ui/table";
import { DataState } from "@/components/app-data/data-state";
import { Thumb } from "@/components/observations/observations-review";
import {
  appApi, formatDate, formatRelative, PENDING_STATUSES, speciesLabel, STATUS_INFO, useAppResource,
  type AppDevice, type AppObservation, type AppUser, type Loadable,
} from "@/lib/app-data/app-client";
import { usePanelSession } from "@/lib/session/panel-session";
import { cn } from "@/lib/utils";

type Tab = "todos" | "con-obs" | "suspendidos" | "panel";
type Sort = "recientes" | "observaciones";

export function AppUsers() {
  const users = useAppResource(appApi.users);
  const observations = useAppResource(appApi.observations);
  const devices = useAppResource(appApi.devices);
  return (
    <DataState value={users.value} onRetry={users.reload}>
      {(list) => (
        <UsersList
          users={list}
          observations={observations.value}
          devices={devices.value}
          onUserChange={(u) => users.set((all) => all.map((x) => (x.id === u.id ? { ...x, ...u } : x)))}
        />
      )}
    </DataState>
  );
}

function UsersList({
  users,
  observations,
  devices,
  onUserChange,
}: {
  users: AppUser[];
  observations: Loadable<AppObservation[]>;
  devices: Loadable<AppDevice[]>;
  onUserChange: (u: Partial<AppUser> & { id: string }) => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("todos");
  const [sort, setSort] = useState<Sort>("recientes");
  const [query, setQuery] = useState("");
  const selectedId = params.get("id");

  const obsByUser = useMemo(() => {
    const m = new Map<string, AppObservation[]>();
    if (observations.state === "listo") for (const o of observations.data) m.set(o.user_id, [...(m.get(o.user_id) ?? []), o]);
    return m;
  }, [observations]);
  const obsKnown = observations.state === "listo";

  const tabs: { id: Tab; label: string; match: (u: AppUser) => boolean }[] = [
    { id: "todos", label: "Todos", match: () => true },
    ...(obsKnown ? [{ id: "con-obs" as Tab, label: "Con observaciones", match: (u: AppUser) => (obsByUser.get(u.id)?.length ?? 0) > 0 }] : []),
    { id: "suspendidos", label: "Suspendidos", match: (u) => !u.is_active },
    { id: "panel", label: "También en el panel", match: (u) => u.en_panel },
  ];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = tabs.find((t) => t.id === tab)?.match ?? (() => true);
    const list = users.filter((u) => match(u) && (!q || u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));
    return sort === "observaciones"
      ? [...list].sort((a, b) => (obsByUser.get(b.id)?.length ?? 0) - (obsByUser.get(a.id)?.length ?? 0))
      : list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, tab, sort, query, obsByUser]);

  const selected = users.find((u) => u.id === selectedId) ?? null;
  const select = (id: string | null) => router.replace(id ? `/usuarios?id=${id}` : "/usuarios", { scroll: false });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtro">
          {tabs.map((t) => (
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
              {t.label} ({users.filter(t.match).length})
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {obsKnown && (
            <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-48" aria-label="Ordenar">
              <option value="recientes">Más recientes primero</option>
              <option value="observaciones">Más observaciones primero</option>
            </Select>
          )}
          <label className="relative w-full sm:w-64">
            <span className="sr-only">Buscar usuarios</span>
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-label-tertiary" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Usuario o correo" className="pl-8" />
          </label>
        </div>
      </div>

      <p className="text-xs text-label-tertiary">
        Las cuentas se crean desde la app o la web (correo o Google). Aquí se revisan y, si hace falta, se suspenden.
      </p>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-label-secondary">Ninguna cuenta coincide con este filtro.</p>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Usuario</TH>
              <TH>Acceso</TH>
              <TH>Observaciones</TH>
              <TH>Teléfonos</TH>
              <TH>Se unió</TH>
              <TH>Estado</TH>
            </tr>
          </THead>
          <TBody>
            {visible.map((u) => {
              const obs = obsByUser.get(u.id) ?? [];
              const pending = obs.filter((o) => PENDING_STATUSES.includes(o.status)).length;
              return (
                <TRow key={u.id} clickable onClick={() => select(u.id)}>
                  <TD>
                    <span className="flex items-center gap-2.5">
                      <Avatar user={u} />
                      <span className="min-w-0">
                        <span className="block font-medium text-label-primary">@{u.username}</span>
                        <span className="block truncate text-xs text-label-tertiary">{u.email}</span>
                      </span>
                    </span>
                  </TD>
                  <TD className="text-label-secondary">{u.auth_provider === "google" ? "Google" : "Correo"}</TD>
                  <TD className="text-label-secondary">
                    {obsKnown ? (obs.length ? <>{obs.length}{pending > 0 && <span className="text-warning"> · {pending} por revisar</span>}</> : "Ninguna") : "—"}
                  </TD>
                  <TD className="text-label-secondary">{u.dispositivos || "—"}</TD>
                  <TD className="whitespace-nowrap text-label-secondary">{formatDate(u.created_at)}</TD>
                  <TD>
                    <span className="flex flex-wrap gap-1">
                      <Badge tone={u.is_active ? "accent" : "danger"}>{u.is_active ? "Activa" : "Suspendida"}</Badge>
                      {u.en_panel && <Badge tone="info">Panel</Badge>}
                    </span>
                  </TD>
                </TRow>
              );
            })}
          </TBody>
        </Table>
      )}

      {selected && (
        <UserDialog
          key={selected.id}
          user={selected}
          observations={obsKnown ? obsByUser.get(selected.id) ?? [] : null}
          devices={devices.state === "listo" ? devices.data.filter((d) => d.user_id === selected.id) : null}
          onClose={() => select(null)}
          onChange={onUserChange}
        />
      )}
    </div>
  );
}

function UserDialog({
  user: u,
  observations,
  devices,
  onClose,
  onChange,
}: {
  user: AppUser;
  observations: AppObservation[] | null;
  devices: AppDevice[] | null;
  onClose: () => void;
  onChange: (u: Partial<AppUser> & { id: string }) => void;
}) {
  const session = usePanelSession();
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMe = session.acting?.email?.toLowerCase() === u.email.toLowerCase();

  async function setActive(activo: boolean) {
    setBusy(true);
    setError(null);
    try {
      onChange(await appApi.setUserActive(u.id, activo, activo ? undefined : reason.trim()));
      setSuspending(false);
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el estado");
    } finally {
      setBusy(false);
    }
  }

  const counts = (observations ?? []).reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.status]: (acc[o.status] ?? 0) + 1 }), {});
  const pending = (counts.synced ?? 0) + (counts.in_review ?? 0);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} className="w-[min(640px,94vw)] overflow-y-auto p-6">
      <DialogHeader title={`@${u.username}`} description={u.email} />

      <div className="mb-5 flex flex-wrap gap-1.5">
        <Badge tone={u.is_active ? "accent" : "danger"}>{u.is_active ? "Cuenta activa" : "Cuenta suspendida"}</Badge>
        <Badge>{u.auth_provider === "google" ? "Entra con Google" : "Entra con correo"}</Badge>
        {u.en_panel && <Badge tone="info">También tiene cuenta del panel</Badge>}
      </div>

      <dl className="mb-6 grid grid-cols-2 gap-3 text-sm">
        <Info label="Se unió">{formatDate(u.created_at)}</Info>
        <Info label="Último reporte de un teléfono">{u.ultima_conexion ? formatRelative(u.ultima_conexion) : "Ningún teléfono reportado"}</Info>
      </dl>

      <Section
        title={`Observaciones${observations ? ` (${observations.length})` : ""}`}
        action={observations?.length ? <Link href={`/observaciones?usuario=${encodeURIComponent(u.username)}`} className="text-xs text-accent-ink hover:underline">Revisar sus observaciones</Link> : null}
      >
        {observations === null ? (
          <p className="text-sm text-label-tertiary">Tu cuenta no puede ver observaciones.</p>
        ) : observations.length === 0 ? (
          <p className="text-sm text-label-tertiary">Todavía no ha reportado ninguna.</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-label-secondary">
              {pending} por revisar · {counts.validated ?? 0} aprobadas · {counts.rejected ?? 0} rechazadas
            </p>
            <ul className="space-y-1.5">
              {observations.slice(0, 4).map((o) => (
                <li key={o.id}>
                  <Link href={`/observaciones?usuario=${encodeURIComponent(u.username)}&id=${o.id}`} className="flex items-center gap-2.5 rounded-md p-1 hover:bg-surface-subtle">
                    <Thumb o={o} size="h-8 w-8" />
                    <span className="flex-1 truncate text-sm italic text-label-primary">{speciesLabel(o)}</span>
                    <span className="text-xs text-label-tertiary">{formatDate(o.recorded_at ?? o.created_at)}</span>
                    <Badge tone={STATUS_INFO[o.status].tone}>{STATUS_INFO[o.status].label}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section
        title={`Teléfonos${devices ? ` (${devices.length})` : ""}`}
        action={devices?.length ? <Link href={`/dispositivos?usuario=${u.id}`} className="text-xs text-accent-ink hover:underline">Ver sus teléfonos</Link> : null}
      >
        {devices === null ? (
          <p className="text-sm text-label-tertiary">No se pudo leer la lista de teléfonos.</p>
        ) : devices.length === 0 ? (
          <p className="text-sm text-label-tertiary">Ningún teléfono se ha reportado con esta cuenta.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2">
                <span className="text-label-primary">{d.modelo ?? "Teléfono sin nombre"}<span className="text-label-tertiary"> · app {d.app_version ?? "?"}</span></span>
                <span className="text-xs text-label-tertiary">{d.bloqueado ? "Bloqueado" : formatRelative(d.last_seen)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="mt-6 border-t border-border pt-4">
        {!u.is_active ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-label-secondary">
              <span className="block text-xs text-label-tertiary">Motivo de la suspensión</span>
              {u.suspension_reason ?? "Sin motivo registrado"}
            </p>
            <Button variant="primary" onClick={() => setActive(true)} disabled={busy}>Reactivar cuenta</Button>
          </div>
        ) : suspending ? (
          <div className="space-y-3">
            <Field label="¿Por qué la suspendes?" hint="Queda en Auditoría. La persona no podrá volver a iniciar sesión en la app ni en la web.">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} autoFocus />
            </Field>
            <div className="flex justify-between gap-3">
              <Button variant="ghost" onClick={() => { setSuspending(false); setReason(""); }} disabled={busy}>Cancelar</Button>
              <Button variant="danger" onClick={() => setActive(false)} disabled={busy || !reason.trim()}>Suspender cuenta</Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-label-tertiary">{isMe ? "Es tu propia cuenta: no se puede suspender desde aquí." : "Suspender impide que vuelva a iniciar sesión."}</p>
            <Button variant="outline" className="text-danger" onClick={() => setSuspending(true)} disabled={isMe}>Suspender…</Button>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}

function Avatar({ user }: { user: AppUser }) {
  const src = user.profile_image && /^https?:\/\//.test(user.profile_image) ? user.profile_image : null;
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-label-tertiary"><UserRound size={15} aria-hidden /></span>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-label-tertiary">{label}</dt>
      <dd className="text-label-primary">{children}</dd>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-label-primary">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
