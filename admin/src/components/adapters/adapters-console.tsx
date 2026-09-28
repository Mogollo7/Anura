"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Lock, Play, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SpeciesEntry } from "@/lib/mock/catalog";
import { ANTIOQUIA_SUBREGIONES, speciesForSubregion } from "@/lib/packages/antioquia-subregiones";
import { usePanelSession } from "@/lib/session/panel-session";
import { useClusterStore } from "@/lib/adapters/cluster-store";
import {
  DEFAULT_CONFIG,
  GAP_MINIMO,
  MAX_CLUSTER_SPECIES,
  clusterFingerprint,
  confusionAlerts,
  matrixBytes,
  trainAdapter,
  type AdapterConfig,
  type AdapterResult,
  type ClusterDef,
} from "@/lib/adapters/adapters";

const pct = (x: number) => `${(x * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;
const kib = (b: number) => `${(b / 1024).toLocaleString("es-CO", { maximumFractionDigits: 1 })} KiB`;

function defaultSubregion() {
  return ANTIOQUIA_SUBREGIONES.reduce((best, s) => {
    const n = speciesForSubregion(s.id).filter((x) => x.genero === "Pristimantis").length;
    const nb = speciesForSubregion(best.id).filter((x) => x.genero === "Pristimantis").length;
    return n > nb ? s : best;
  }).id;
}

export function AdaptersConsole() {
  const session = usePanelSession();
  const canCreate = session.can("crearComplejo");
  const canTrain = session.can("ejecutarEntrenamiento");
  const canValidate = session.can("aprobarCientifico");
  const { clusters, create, update, remove } = useClusterStore();

  const [subregionId, setSubregionId] = useState(defaultSubregion);
  const species = useMemo(() => speciesForSubregion(subregionId), [subregionId]);
  const byId = useMemo(() => new Map(species.map((s) => [s.id, s])), [species]);
  const analysis = useMemo(() => confusionAlerts(species), [species]);

  const [draft, setDraft] = useState<{ clusterId: string; miembros: string[]; config: AdapterConfig } | null>(null);
  const [results, setResults] = useState<Record<string, AdapterResult>>({});
  const [training, setTraining] = useState<string | null>(null);

  const subClusters = clusters.filter((c) => c.subregionId === subregionId);

  function startDraft(miembros: string[]) {
    const genero = byId.get(miembros[0])?.genero.toLowerCase() ?? "cluster";
    setDraft({ clusterId: `${genero}_${subregionId}_cluster`, miembros, config: { ...DEFAULT_CONFIG } });
    // El formulario aparece debajo de la lista: llevar la vista y el foco hasta él.
    requestAnimationFrame(() => {
      const el = document.getElementById("nuevo-cluster");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      el?.querySelector("input")?.focus({ preventScroll: true });
    });
  }

  function saveDraft() {
    if (!draft || !canCreate || draft.miembros.length < 2) return;
    create({
      clusterId: draft.clusterId.trim(),
      subregionId,
      miembros: draft.miembros,
      config: draft.config,
      creadoPor: session.acting?.name ?? "—",
    });
    setDraft(null);
  }

  function train(c: ClusterDef) {
    if (!canTrain) return;
    setTraining(c.id);
    setTimeout(() => {
      const members = c.miembros.map((id) => byId.get(id)).filter((s): s is SpeciesEntry => !!s);
      const res = trainAdapter(c, members, species);
      setResults((r) => ({ ...r, [c.id]: res }));
      update(c.id, { entrenado: { fingerprint: res.fingerprint, por: session.acting?.name ?? "—" }, validado: undefined });
      setTraining(null);
    }, 600);
  }

  function resultFor(c: ClusterDef): AdapterResult | null {
    const fp = clusterFingerprint(c);
    const cached = results[c.id];
    if (cached && cached.fingerprint === fp) return cached;
    if (c.entrenado?.fingerprint === fp) {
      const members = c.miembros.map((id) => byId.get(id)).filter((s): s is SpeciesEntry => !!s);
      return trainAdapter(c, members, species);
    }
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Subregión (un clúster vive en un paquete)">
          <Select value={subregionId} onChange={(e) => { setSubregionId(e.target.value); setDraft(null); }} className="min-w-[220px]">
            {ANTIOQUIA_SUBREGIONES.map((s) => (
              <option key={s.id} value={s.id}>{s.numero} {s.nombre}</option>
            ))}
          </Select>
        </Field>
        <p className="mb-2 text-xs text-label-tertiary">
          Acierto con centroides de 512-d en este paquete: {pct(analysis.accuracy)} (individuos apartados, embeddings simulados).
        </p>
      </div>

      <Card>
        <CardHeader className="mb-2">
          <CardTitle><AlertTriangle size={14} className="mr-1.5 inline" />Alta confusión detectada</CardTitle>
          <Badge tone={analysis.alerts.length ? "warning" : "accent"}>{analysis.alerts.length} pares</Badge>
        </CardHeader>
        <p className="mb-3 text-xs text-label-tertiary">
          El sistema señala; no arma el complejo. Quién pertenece a un clúster lo decide el herpetólogo.
        </p>
        {analysis.alerts.length === 0 ? (
          <p className="text-xs text-label-secondary">Ningún par supera el umbral de confusión en esta subregión.</p>
        ) : (
          <ul className="space-y-1.5">
            {analysis.alerts.slice(0, 10).map((al) => (
              <li key={`${al.a.id}-${al.b.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-xs">
                <span>
                  <span className="italic">{al.a.especie}</span> ↔ <span className="italic">{al.b.especie}</span>
                  <span className="text-label-tertiary"> · se confunden {pct(al.tasa)} · coseno {al.cos.toFixed(3)}</span>
                </span>
                <Button variant="ghost" className="text-xs" disabled={!canCreate} onClick={() => startDraft([al.a.id, al.b.id])}>
                  {canCreate ? <Plus size={12} /> : <Lock size={12} />} Proponer clúster
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <Button variant="outline" className="text-xs" disabled={!canCreate} onClick={() => startDraft([])}>
            {canCreate ? <Plus size={12} /> : <Lock size={12} />} Clúster manual
          </Button>
          {!canCreate && <span className="ml-2 text-xs text-label-tertiary">Falta el permiso &quot;Crear complejo críptico&quot;.</span>}
        </div>
      </Card>

      {draft && (
        <Card id="nuevo-cluster" className="scroll-mt-4">
          <CardHeader className="mb-3"><CardTitle>Nuevo clúster críptico</CardTitle></CardHeader>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <Field label="cluster_id">
                <Input value={draft.clusterId} onChange={(e) => setDraft({ ...draft, clusterId: e.target.value })} />
              </Field>
              <p className="text-xs font-medium text-label-secondary">
                Miembros ({draft.miembros.length}{draft.miembros.length > MAX_CLUSTER_SPECIES ? ` — supera ${MAX_CLUSTER_SPECIES}` : ""})
              </p>
              <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
                {species.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={draft.miembros.includes(s.id)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          miembros: e.target.checked ? [...draft.miembros, s.id] : draft.miembros.filter((x) => x !== s.id),
                        })
                      }
                    />
                    <span className="italic">{s.especie}</span>
                  </label>
                ))}
              </div>
              {draft.miembros.length > MAX_CLUSTER_SPECIES && (
                <p className="text-xs text-warning">
                  Supera el límite operativo recomendado ({MAX_CLUSTER_SPECIES}). Se puede crear; conviene dividirlo en subclústeres.
                </p>
              )}
            </div>
            <div className="space-y-3">
              <p className="text-xs font-medium text-label-secondary">Matriz W (el encoder no se toca)</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Columnas de W">
                  <Select value={draft.config.columnas} onChange={(e) => setDraft({ ...draft, config: { ...draft.config, columnas: Number(e.target.value) } })}>
                    {[32, 64, 128, 512].map((c) => <option key={c} value={c}>512 × {c}</option>)}
                  </Select>
                </Field>
                <Field label="Tipo">
                  <Select value={draft.config.dtype} onChange={(e) => setDraft({ ...draft, config: { ...draft.config, dtype: e.target.value as AdapterConfig["dtype"] } })}>
                    <option value="FP16">FP16</option>
                    <option value="FP32">FP32</option>
                  </Select>
                </Field>
              </div>
              <fieldset className="space-y-2 rounded-md border border-border p-3">
                <legend className="px-1 text-xs font-medium text-label-secondary">ArcFace (margen angular aditivo)</legend>
                <p className="text-xs text-label-secondary">
                  Un prototipo por especie, entrenado por descenso de gradiente con estos cuatro números — igual que el
                  ArcFace real, sobre los embeddings simulados. Al inferir, la especie gana por el coseno más alto contra su
                  prototipo.
                </p>
                <div className="grid grid-cols-2 gap-3">
                <Field label="Margen (m)">
                  <Input type="number" step="0.01" value={draft.config.margen} onChange={(e) => setDraft({ ...draft, config: { ...draft.config, margen: Number(e.target.value) } })} />
                </Field>
                <Field label="Escala (s)">
                  <Input type="number" value={draft.config.escala} onChange={(e) => setDraft({ ...draft, config: { ...draft.config, escala: Number(e.target.value) } })} />
                </Field>
                <Field label="Épocas (20–50)">
                  <Input type="number" min={20} max={50} value={draft.config.epocas} onChange={(e) => setDraft({ ...draft, config: { ...draft.config, epocas: Number(e.target.value) } })} />
                </Field>
                <Field label="Learning rate" hint="La fuente no fija el número; 0,05 converge en 20–50 épocas">
                  <Input type="number" step="0.0001" value={draft.config.lr} onChange={(e) => setDraft({ ...draft, config: { ...draft.config, lr: Number(e.target.value) } })} />
                </Field>
                </div>
              </fieldset>
              <p className="text-xs text-label-secondary">
                Tamaño de W: 512 × {draft.config.columnas} × {draft.config.dtype === "FP16" ? 2 : 4} B ={" "}
                <strong>{kib(matrixBytes(draft.config.columnas, draft.config.dtype))}</strong>
                {draft.config.columnas === 512 && " — pesa como otro modelo, no es el default"}
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" onClick={saveDraft} disabled={!canCreate || draft.miembros.length < 2 || !draft.clusterId.trim()}>
              Crear clúster
            </Button>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancelar</Button>
          </div>
        </Card>
      )}

      {subClusters.length === 0 ? (
        <p className="text-sm text-label-tertiary">No hay clústeres en esta subregión.</p>
      ) : (
        subClusters.map((c) => {
          const fp = clusterFingerprint(c);
          const trained = c.entrenado?.fingerprint === fp;
          const validated = trained && c.validado?.fingerprint === fp;
          const mismoQueEntreno = !!c.entrenado && c.entrenado.por === session.acting?.name;
          const res = trained ? resultFor(c) : null;
          return (
            <Card key={c.id}>
              <CardHeader className="mb-2">
                <CardTitle className="font-mono">{c.clusterId}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge tone={validated ? "accent" : trained ? "info" : c.entrenado ? "warning" : "neutral"}>
                    {validated ? "Validado" : trained ? "Entrenado · sin validar" : c.entrenado ? "Desactualizado" : "Sin entrenar"}
                  </Badge>
                  <Button variant="ghost" className="text-xs text-danger" disabled={!canCreate} onClick={() => remove(c.id)}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              </CardHeader>
              <p className="text-xs text-label-secondary">
                {c.miembros.map((id) => byId.get(id)?.especie ?? id).join(" · ")}
              </p>
              <p className="mt-1 text-[11px] text-label-tertiary">
                W 512 × {c.config.columnas} {c.config.dtype} · ArcFace m={c.config.margen}, s={c.config.escala} · {c.config.epocas} épocas · creado por {c.creadoPor}
                {c.entrenado && ` · entrenado por ${c.entrenado.por}`}
                {validated && ` · validado por ${c.validado!.por}`}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" className="text-xs" disabled={!canTrain || training === c.id} onClick={() => train(c)}>
                  {canTrain ? <Play size={12} /> : <Lock size={12} />} {training === c.id ? "Entrenando en el worker…" : trained ? "Reentrenar" : "Entrenar"}
                </Button>
                <Button
                  variant="outline"
                  className="text-xs"
                  disabled={!canValidate || !trained || validated || mismoQueEntreno}
                  title={mismoQueEntreno ? "Lo valida una persona distinta de quien lo entrenó" : undefined}
                  onClick={() => update(c.id, { validado: { fingerprint: fp, por: session.acting?.name ?? "—" } })}
                >
                  {canValidate ? <ShieldCheck size={12} /> : <Lock size={12} />} Validar
                </Button>
                {!canTrain && <span className="text-xs text-label-secondary">Entrenar requiere &quot;Ejecutar entrenamiento&quot;.</span>}
                {trained && !validated && mismoQueEntreno && (
                  <span className="text-xs text-label-secondary">Lo entrenó {c.entrenado!.por}: debe validarlo otra persona (cámbiala arriba a la derecha).</span>
                )}
              </div>
              {res && <AdapterResultView res={res} byId={byId} />}
            </Card>
          );
        })
      )}
    </div>
  );
}

function AdapterResultView({ res, byId }: { res: AdapterResult; byId: Map<string, SpeciesEntry> }) {
  const name = (id: string) => byId.get(id)?.especie ?? id;
  const intrusosGen = res.intrusos.filter((i) => i.relacion === "mismo género");
  const intrusosOtros = res.intrusos.filter((i) => i.relacion !== "mismo género");
  const rate = (xs: typeof res.intrusos) => {
    const n = xs.reduce((s, x) => s + x.n, 0);
    return n ? xs.reduce((s, x) => s + x.rechazados, 0) / n : null;
  };
  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      <p className="text-[11px] text-label-tertiary">
        ArcFace real (margen angular aditivo, descenso de gradiente) sobre embeddings simulados: el algoritmo es el mismo que
        correrá en el worker; lo simulado son los vectores de entrada, no el entrenamiento. Todo lo de abajo está medido con
        los individuos apartados.
      </p>
      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <Stat label="Acierto antes (512-d)" value={pct(res.accAntes)} />
        <Stat label="Acierto con el adaptador" value={pct(res.accDespues)} tone={res.accDespues > res.accAntes ? "text-accent-ink" : "text-warning"} />
        <Stat label="ε propuesto (p95)" value={res.epsilon.toFixed(3)} sub={`falso rechazo de miembros ${pct(res.falsoRechazo)}`} />
        <Stat label="Peso en el JSON" value={kib(res.bytesMatriz + res.bytesCentroidesCluster)} sub={`W ${kib(res.bytesMatriz)} + centroides ${kib(res.bytesCentroidesCluster)}`} />
      </div>

      {res.avisos.length > 0 && (
        <ul className="space-y-1">
          {res.avisos.map((a) => (
            <li key={a} className="flex items-start gap-1.5 text-xs text-warning"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{a}</li>
          ))}
        </ul>
      )}
      {res.gapMin && (
        <p className={cn("text-xs", res.gapMin.despues < GAP_MINIMO ? "text-warning" : "text-label-secondary")}>
          Par más cercano: <span className="italic">{name(res.gapMin.a)}</span> ↔ <span className="italic">{name(res.gapMin.b)}</span> ·
          distancia coseno en 512-d {res.gapMin.antes.toFixed(3)} (el teléfono sin adaptador) → con los prototipos de ArcFace ya entrenados{" "}
          {res.gapMin.despues.toFixed(3)} (aviso bajo {GAP_MINIMO})
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium">Matriz de confusión con el adaptador (filas: real)</p>
          <Table>
            <THead>
              <tr>
                <TH></TH>
                {res.matriz.ids.map((id, j) => <TH key={id} className="text-center">{j + 1}</TH>)}
              </tr>
            </THead>
            <TBody>
              {res.matriz.ids.map((id, i) => (
                <TRow key={id}>
                  <TD className="text-xs"><span className="text-label-tertiary">{i + 1}.</span> <span className="italic">{name(id)}</span></TD>
                  {res.matriz.counts[i].map((n, j) => (
                    <TD key={j} className={cn("text-center text-xs tabular-nums", i === j ? "font-semibold" : n > 0 ? "text-warning" : "text-label-tertiary")}>{n}</TD>
                  ))}
                </TRow>
              ))}
            </TBody>
          </Table>
        </div>
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-medium">Intrusos (especies no vistas por el adaptador)</p>
            <ul className="space-y-0.5 text-xs text-label-secondary">
              {res.intrusos.map((i) => (
                <li key={i.speciesId}>
                  <span className="italic">{name(i.speciesId)}</span> ({i.relacion}): rechazados{" "}
                  {i.rechazados}/{i.n} por E_rec &gt; ε
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-label-tertiary">
              Rechazo de intrusos del mismo género: {rate(intrusosGen) === null ? "—" : pct(rate(intrusosGen)!)} · de otros géneros:{" "}
              {rate(intrusosOtros) === null ? "—" : pct(rate(intrusosOtros)!)}. Lo que la capa 2 no rechaza lo tienen que atajar la capa 1 y el contexto (capa 3).
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium">Contexto para desempatar (de la ficha de cada especie)</p>
            <ul className="space-y-0.5 text-xs text-label-secondary">
              {res.contexto.map((c) => (
                <li key={c.speciesId}>
                  <span className="italic">{name(c.speciesId)}</span>: {c.altitudMedia} ± {c.altitudDesv} m · {c.sustrato}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-label-tertiary">
        <CheckCircle2 size={11} /> Contrato en el paquete: cryptic_clusters[] con cluster_id, miembros, matriz, centroides del clúster,
        epsilon_reconstruction y desempate por contexto.
      </p>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-label-tertiary">{label}</p>
      <p className={cn("text-base font-semibold", tone ?? "text-label-primary")}>{value}</p>
      {sub && <p className="text-[11px] text-label-tertiary">{sub}</p>}
    </div>
  );
}
