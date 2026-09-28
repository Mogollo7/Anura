"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Copy,
  History,
  Image as ImageIcon,
  Layers,
  ScanEye,
  Search,
  ShieldOff,
  Trash2,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import type { SpeciesEntry } from "@/lib/mock/catalog";
import { useMorphStore } from "@/lib/centroids/morph-store";
import { useCurationStore } from "@/lib/curation/curation-store";
import { realSpecies } from "@/lib/data/real";
import { usePanelSession } from "@/lib/session/panel-session";
import { ServerPhotosCard } from "@/components/curation/server-photos-card";
import { getResumen, type DatasetEspecie } from "@/lib/dataset/dataset-client";
import {
  INVALID_OBSERVATION_REASONS,
  LIFE_STAGE_LABEL,
  MIN_FOTOS_ENTRENABLE,
  SUBSTRATO_LABEL,
  getCurationSample,
  type CurationSample,
  type LifeStage,
} from "@/lib/mock/curation";

const slug = (nombre: string) => nombre.trim().toLowerCase().replace(/\s+/g, "-");

/**
 * Con sesión: la curación real (lista de especies del servidor, fotos agrupadas por
 * observación). Sin sesión: la muestra simulada de siempre.
 */
export function CurationManager({ species }: { species: SpeciesEntry[] }) {
  const session = usePanelSession();
  if (session.cargando) return <p className="text-sm text-label-secondary">Comprobando la sesión…</p>;
  if (session.isReal) return <ServerCuration mockSpecies={species} />;
  return <MockCuration species={species} />;
}

function ServerCuration({ mockSpecies }: { mockSpecies: SpeciesEntry[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [especies, setEspecies] = useState<DatasetEspecie[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let cancelado = false;
    getResumen()
      .then((r) => !cancelado && setEspecies([...r.especies].sort((a, b) => a.nombre_cientifico.localeCompare(b.nombre_cientifico))))
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [recarga]);

  // Al entrar por un enlace (?especie=…) la especie elegida puede estar abajo en la lista.
  useEffect(() => {
    document.querySelector('nav [aria-current="true"], ul [aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [especies, searchParams]);

  if (error) return <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">No se pudo cargar el dataset: {error}</p>;
  if (!especies) return <p className="text-sm text-label-secondary">Cargando especies…</p>;

  // ?especie= acepta el id del servidor o el nombre en minúsculas con guiones (enlaces viejos).
  const param = searchParams.get("especie") ?? "";
  const selected =
    especies.find((e) => String(e.id) === param) ?? especies.find((e) => slug(e.nombre_cientifico) === param) ?? especies[0];
  const needle = busqueda.trim().toLowerCase();
  const visibles = needle
    ? especies.filter((e) => e.nombre_cientifico.toLowerCase().includes(needle) || e.familia.toLowerCase().includes(needle))
    : especies;
  const mock = selected ? mockSpecies.find((m) => m.especie.toLowerCase() === selected.nombre_cientifico.toLowerCase()) : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <Card className="h-fit p-0">
        <div className="border-b border-border p-3">
          <label className="relative block">
            <span className="sr-only">Buscar especie</span>
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-label-tertiary" />
            <Input value={busqueda} onChange={(ev) => setBusqueda(ev.target.value)} placeholder="Especie o familia" className="pl-8" />
          </label>
          <p className="mt-2 text-xs text-label-tertiary">
            {especies.length} especies en el servidor · {especies.reduce((n, e) => n + e.fotos, 0).toLocaleString("es-CO")} fotos
          </p>
        </div>
        <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
          {visibles.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => router.push(`/curacion?especie=${slug(e.nombre_cientifico)}`)}
                aria-current={e.id === selected?.id ? "true" : undefined}
                className={cn(
                  "flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-surface-subtle",
                  e.id === selected?.id && "bg-accent-wash/60"
                )}
              >
                <span className="text-sm italic text-label-primary">{e.nombre_cientifico}</span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-label-secondary">
                  <span className="tabular-nums">{e.fotos.toLocaleString("es-CO")} fotos</span>
                  {e.excluidas > 0 && <Badge tone="danger" className="text-[10px]">{e.excluidas} excluidas</Badge>}
                  {!e.taxon_id && <Badge tone="warning" className="text-[10px]">Fuera del paquete</Badge>}
                </span>
              </button>
            </li>
          ))}
          {visibles.length === 0 && <li className="px-3 py-4 text-sm text-label-secondary">Ninguna especie coincide con «{busqueda}».</li>}
        </ul>
      </Card>

      <div className="space-y-4">
        {selected && <ServerPhotosCard key={selected.id} especie={selected} onCambio={() => setRecarga((n) => n + 1)} />}
        {mock && (
          <details className="rounded-lg border border-border bg-surface p-4">
            <summary className="cursor-pointer text-sm font-medium text-label-primary">
              Estadio y morfo por individuo <span className="font-normal text-label-tertiary">· muestra simulada, se guarda en este navegador</span>
            </summary>
            <div className="mt-4">
              <MockCuration species={[mock]} embedded />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

/** Muestra simulada (sin sesión, o estadio y morfo con sesión — todavía no están en el servidor). */
function MockCuration({ species, embedded = false }: { species: SpeciesEntry[]; embedded?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = embedded ? species[0]?.id ?? "" : searchParams.get("especie") ?? species[0]?.id ?? "";
  const selected = species.find((s) => s.id === selectedId) ?? species[0];

  const sample: CurationSample | null = useMemo(
    () => (selected ? getCurationSample(selected) : null),
    [selected]
  );
  const real = selected ? realSpecies(selected.id) : undefined;

  const curation = useCurationStore();
  const session = usePanelSession();
  const actor = session.acting?.name ?? "—";
  const canFotos = session.can("revisarFotografias");
  const canEstadio = session.can("validarEstadio");
  const canMorfo = session.can("definirMorfo");
  // Con sesión real, excluir e invalidar se hacen sobre las fotos reales (ServerPhotosCard) y
  // quedan en el servidor; la muestra simulada solo conserva estadio y morfo (todavía en el navegador).
  const mockCuracion = !session.isReal;
  const excludedPhotos = useMemo(() => new Set(curation.state.excludedPhotos), [curation.state.excludedPhotos]);
  const invalidated = curation.state.invalidated;
  const morph = useMorphStore();
  const declaredMorphs = morph.store.declarations.filter((d) => d.speciesId === selected?.id);
  const [invalidateTarget, setInvalidateTarget] = useState<string | null>(null);
  const [reason, setReason] = useState<string>(INVALID_OBSERVATION_REASONS[0]);

  function excludePhoto(photoId: string) {
    if (!canFotos) return;
    curation.excludePhoto(photoId, actor);
  }

  function confirmInvalidate() {
    if (!invalidateTarget || !canFotos) return;
    curation.invalidate(invalidateTarget, reason, actor);
    setInvalidateTarget(null);
    setReason(INVALID_OBSERVATION_REASONS[0]);
  }

  function tagMorph(individualId: string, morphId: string | null) {
    if (!canMorfo) return;
    morph.tag(individualId, morphId);
    curation.logMorph(individualId, declaredMorphs.find((d) => d.id === morphId)?.nombre ?? "sin morfo", actor);
  }

  function setEstadio(individualId: string, estadio: LifeStage) {
    if (!canEstadio) return;
    curation.setEstadio(individualId, estadio, LIFE_STAGE_LABEL[estadio], actor);
  }

  if (!sample || !selected) return null;

  const activePhotos = sample.photos.filter((p) => !excludedPhotos.has(p.id) && !invalidated[p.observationId]);
  const duplicateCount = sample.photos.filter((p) => p.duplicateGroup).length;
  const blurryCount = sample.photos.filter((p) => p.isBlurry).length;
  const sinLicenciaCount = activePhotos.filter((p) => p.licencia === "sin resolver").length;
  const sampleIds = new Set(sample.photos.map((p) => p.id));
  const changed =
    curation.state.excludedPhotos.some((id) => sampleIds.has(id)) ||
    sample.observations.some((o) => invalidated[o.id]) ||
    sample.individuals.some((i) => curation.state.estadios[i.id]);
  const logEspecie = curation.state.log.filter((e) => e.action.includes(`${selected.id}-`));
  const orphanRisk = activePhotos.length < MIN_FOTOS_ENTRENABLE;

  return (
    <div className="space-y-6">
      {!embedded && (
      <>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-label-secondary">Especie</span>
          <Select
            value={selectedId}
            onChange={(e) => router.push(`/curacion?especie=${e.target.value}`)}
            className="min-w-[280px]"
          >
            {species.map((s) => (
              <option key={s.id} value={s.id}>
                {s.especie} {s.lowData ? "· cola larga" : ""}
              </option>
            ))}
          </Select>
        </label>
        <Badge tone="neutral" className="mb-0.5">
          Dataset {sample.datasetVersion}
        </Badge>
        {changed && (
          <Badge tone="warning" className="mb-0.5">
            <AlertTriangle size={11} /> Curación manual guardada — el próximo job del worker ya la descuenta; los centroides actuales vienen del job anterior
          </Badge>
        )}
      </div>

      {real && (
        <p className="text-sm text-label-secondary">
          Datos reales: {real.fotosCuradas.toLocaleString("es-CO")} fotos curadas de {real.individuosCurados.toLocaleString("es-CO")} individuos en{" "}
          <span className="font-mono text-xs">data cleaned/{real.carpetaDataset}</span> · {real.fotosReferenciaPaquete} viajan en el paquete del
          teléfono · {real.fotosVal} de validación y {real.fotosPrueba} de prueba
          {real.estadoVisual !== "VISUAL_ENABLED" && ` · fuera del paquete: ${real.motivoExclusion ?? "en revisión"}`}.
        </p>
      )}
      <ServerPhotosCardSinSesion />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi icon={Layers} value={sample.totalIndividuosReferencia} label="Individuos curados" />
        <Kpi icon={ImageIcon} value={sample.totalFotosReferencia} label="Fotos curadas" />
        <Kpi icon={ScanEye} value={activePhotos.length} label={`Activas en la muestra simulada (${sample.photos.length})`} />
        <Kpi icon={Copy} value={duplicateCount} label="Duplicadas" tone={duplicateCount > 0 ? "text-warning" : undefined} />
        <Kpi icon={AlertTriangle} value={blurryCount} label="Borrosas" tone={blurryCount > 0 ? "text-warning" : undefined} />
      </div>

      {orphanRisk && (
        <p className="flex items-center gap-1.5 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertTriangle size={13} /> Menos de {MIN_FOTOS_ENTRENABLE} fotos activas: por debajo del piso mínimo para
          que la especie sea entrenable — en riesgo de quedar huérfana (sin centroide) en este paquete.
        </p>
      )}
      {sinLicenciaCount > 0 && (
        <p className="text-xs text-label-tertiary">
          {sinLicenciaCount === 1 ? "1 foto activa sin licencia resuelta" : `${sinLicenciaCount} fotos activas sin licencia resuelta`} — no
          bloquean la curación, sí bloquean la publicación del paquete.
        </p>
      )}
      </>
      )}
      <div className="space-y-4">
        {sample.individuals.map((ind) => {
          const estadio = curation.state.estadios[ind.id] ?? ind.estadio;
          return (
          <Card key={ind.id}>
            <CardHeader className="mb-3">
              <CardTitle>{ind.id}</CardTitle>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-label-tertiary">
                  {ind.observationIds.length === 1 ? "1 observación" : `${ind.observationIds.length} observaciones`}
                </span>
                <label className="flex items-center gap-1.5 text-xs text-label-secondary">
                  Estadio
                  <Select
                    value={estadio}
                    disabled={!canEstadio}
                    onChange={(e) => setEstadio(ind.id, e.target.value as LifeStage)}
                    className="w-auto py-1 text-xs"
                  >
                    {(Object.keys(LIFE_STAGE_LABEL) as LifeStage[]).map((s) => (
                      <option key={s} value={s}>
                        {LIFE_STAGE_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                </label>
                {declaredMorphs.length > 0 && (
                  <label className="flex items-center gap-1.5 text-xs text-label-secondary">
                    Morfo
                    <Select
                      value={morph.store.tags[ind.id] ?? ""}
                      disabled={!canMorfo}
                      onChange={(e) => tagMorph(ind.id, e.target.value || null)}
                      className="w-auto py-1 text-xs"
                    >
                      <option value="">Sin morfo</option>
                      {declaredMorphs.map((d) => (
                        <option key={d.id} value={d.id}>{d.nombre}</option>
                      ))}
                    </Select>
                  </label>
                )}
              </div>
            </CardHeader>
            <div className="space-y-3">
              {sample.observations
                .filter((o) => o.individualId === ind.id)
                .map((obs) => {
                  const invalidReason = invalidated[obs.id];
                  const photos = sample.photos.filter((p) => p.observationId === obs.id);
                  return (
                    <div
                      key={obs.id}
                      className={cn(
                        "rounded-md border p-3",
                        invalidReason ? "border-danger/40 bg-danger/5" : "border-border"
                      )}
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-label-secondary">
                          <Badge tone="neutral">{obs.fuente}</Badge>
                          <span>{obs.fecha}</span>
                          <span>{obs.altitudRaw} m (altitud sin corregir)</span>
                          <Badge tone="neutral">{SUBSTRATO_LABEL[obs.substrato]}</Badge>
                        </div>
                        {invalidReason ? (
                          <Badge tone="danger">
                            <ShieldOff size={11} /> Invalidada: {invalidReason}
                          </Badge>
                        ) : mockCuracion ? (
                          <Button
                            variant="ghost"
                            className="text-xs text-danger"
                            disabled={!canFotos}
                            onClick={() => setInvalidateTarget(obs.id)}
                          >
                            <ShieldOff size={13} /> Invalidar observación
                          </Button>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {photos.map((photo) => {
                          const excluded = excludedPhotos.has(photo.id) || !!invalidReason;
                          return (
                            <div
                              key={photo.id}
                              className={cn(
                                "flex w-40 flex-col gap-1 rounded-md border p-2 text-[11px]",
                                excluded ? "border-border bg-surface-subtle opacity-50" : "border-border"
                              )}
                            >
                              <div className="flex h-16 items-center justify-center rounded bg-surface-subtle text-label-tertiary">
                                <ImageIcon size={20} />
                              </div>
                              <span className="truncate text-label-tertiary">{photo.id}</span>
                              <div className="flex flex-wrap gap-1">
                                {photo.duplicateGroup && (
                                  <Badge tone="warning" className="text-[11px]">
                                    <Copy size={9} /> dup. de {photo.duplicateGroup.split("-").pop()}
                                  </Badge>
                                )}
                                {photo.isBlurry && (
                                  <Badge tone="warning" className="text-[11px]">
                                    Var {photo.blurVar}
                                  </Badge>
                                )}
                                {photo.licencia === "sin resolver" && (
                                  <Badge tone="neutral" className="text-[11px]">
                                    sin licencia
                                  </Badge>
                                )}
                              </div>
                              {!invalidReason && mockCuracion && (
                                <Button
                                  variant="ghost"
                                  className="mt-1 justify-start px-0 text-[11px] text-danger"
                                  disabled={!canFotos}
                                  onClick={() => (excludedPhotos.has(photo.id) ? curation.restorePhoto(photo.id, actor) : excludePhoto(photo.id))}
                                >
                                  <Trash2 size={11} />
                                  {excludedPhotos.has(photo.id) ? "Reincluir" : "Excluir del dataset"}
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          </Card>
          );
        })}
      </div>

      {!(canFotos && canEstadio && canMorfo) && (
        <p className="text-xs text-label-tertiary">
          {actor} puede revisar esta muestra; {[!canFotos && "excluir fotos o invalidar observaciones (Revisar fotografías)", !canEstadio && "corregir estadio (Validar adulto o juvenil)", !canMorfo && "etiquetar morfos (Definir morph id)"].filter(Boolean).join(", ")} necesita permiso.
        </p>
      )}

      {logEspecie.length > 0 && (
        <Card>
          <CardHeader className="mb-3">
            <CardTitle>
              <History size={14} className="mr-1.5 inline" /> Trazabilidad de la curación de esta especie
            </CardTitle>
          </CardHeader>
          <ul className="space-y-2 text-xs">
            {logEspecie.map((entry) => (
              <li key={entry.id} className="flex flex-col rounded-md border border-border p-2">
                <span className="font-medium text-label-primary">{entry.action}</span>
                <span className="text-label-tertiary">{entry.fecha} · {entry.actor} · {entry.motivo}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Dialog open={!!invalidateTarget} onOpenChange={(o) => !o && setInvalidateTarget(null)}>
        <DialogHeader
          title="Invalidar observación"
          description="Excluye todas sus fotografías del dataset activo. La observación y el motivo quedan registrados, no se borran."
        />
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-label-secondary">Motivo</span>
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {INVALID_OBSERVATION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setInvalidateTarget(null)}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={!canFotos} onClick={confirmInvalidate}>
              Invalidar
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function Kpi({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof Layers;
  value: number;
  label: string;
  tone?: string;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <Icon size={18} className={cn("shrink-0 text-label-tertiary", tone)} />
      <div>
        <p className={cn("text-xl font-semibold", tone ?? "text-label-primary")}>{value}</p>
        <p className="text-xs text-label-secondary">{label}</p>
      </div>
    </Card>
  );
}

/** Sin sesión no hay fotos reales que mostrar: se dice y se ofrece entrar. */
function ServerPhotosCardSinSesion() {
  return (
    <Card>
      <p className="text-sm text-label-secondary">
        Inicia sesión para ver y curar las fotos reales del servidor. Sin sesión, lo de abajo es una muestra simulada.{" "}
        <a href="/login" className="text-accent-ink underline decoration-dotted underline-offset-2">
          Iniciar sesión
        </a>
      </p>
    </Card>
  );
}
