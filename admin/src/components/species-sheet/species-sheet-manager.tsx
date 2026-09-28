"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMorphStore } from "@/lib/centroids/morph-store";
import { getSpeciesCentroids } from "@/lib/centroids/centroids";
import { ANTIOQUIA_SUBREGIONES } from "@/lib/packages/antioquia-subregiones";
import { AlertTriangle, Lock, Mountain, Plus, Ruler, Sparkles, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import type { SpeciesEntry } from "@/lib/mock/catalog";
import { SUBSTRATO_LABEL } from "@/lib/mock/curation";
import {
  getEcologicalObservations,
  getSpeciesSheet,
  type AltitudRango,
  type LrcMetodo,
  type Pesos,
  type SpeciesSheet,
} from "@/lib/mock/species-sheet";
import { useSheetStore } from "@/lib/species-sheet/sheet-store";
import { usePanelSession } from "@/lib/session/panel-session";

const ESTADO_FICHA: Record<string, string> = {
  DRAFT: "Sin fotos suficientes",
  DATASET_READY: "Dataset listo",
  EMBEDDINGS_READY: "Vectores listos",
  CENTROID_READY: "Centroide listo",
  WARNING: "Con advertencias",
};

const PERFIL_LABEL: Record<SpeciesSheet["calculado"]["perfil"], string> = {
  generalista: "Generalista",
  endemica_montana: "Endémica de montaña",
  especialista_quebrada: "Especialista de quebrada",
  par_criptico: "Par críptico / indefinido",
};

export function SpeciesSheetManager({ species }: { species: SpeciesEntry[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("especie") ?? species[0]?.id ?? "";
  const selected = species.find((s) => s.id === selectedId) ?? species[0];

  return (
    <div className="space-y-6">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-label-secondary">Especie</span>
        <Select
          value={selectedId}
          onChange={(e) => router.push(`/ficha-especie?especie=${e.target.value}`)}
          className="min-w-[280px]"
        >
          {species.map((s) => (
            <option key={s.id} value={s.id}>
              {s.especie}
            </option>
          ))}
        </Select>
      </label>
      {selected && <SpeciesDetail key={selected.id} species={selected} />}
    </div>
  );
}

/**
 * Con `key={species.id}` en el padre: cambiar de especie remonta y reinicia los borradores.
 * Lo guardado (exclusiones, rango y pesos manuales, LRC) vive en `useSheetStore` y sobrevive a recargar.
 */
function SpeciesDetail({ species: selected }: { species: SpeciesEntry }) {
  const selectedId = selected.id;
  const session = usePanelSession();
  const canPesos = session.can("definirPesos");
  const canContexto = session.can("definirMicrohabitat");
  const canMorfo = session.can("definirMorfo");
  const canLrc = session.can("definirLRC");
  const sheets = useSheetStore();
  const ov = sheets.get(selectedId);

  const excluidas = useMemo(() => new Set(ov.excluidas ?? []), [ov.excluidas]);
  const altitudManual = ov.altitudManual ?? null;
  const [altitudDraft, setAltitudDraft] = useState<AltitudRango | null>(null);
  const [altitudError, setAltitudError] = useState<string | null>(null);

  const sheet: SpeciesSheet = useMemo(
    () => getSpeciesSheet(selected, { excluidas, altitudManual }),
    [selected, excluidas, altitudManual]
  );
  const observaciones = useMemo(() => getEcologicalObservations(selected), [selected]);

  const pesosManual = ov.pesosManual ?? null;
  const [pesosDraft, setPesosDraft] = useState<Pesos | null>(null);
  const [pesosError, setPesosError] = useState<string | null>(null);

  const morphStore = useMorphStore();
  const morfos = morphStore.store.declarations.filter((d) => d.speciesId === selected?.id);
  const [morfoForm, setMorfoForm] = useState({ paquete: "", nombre: "", nota: "" });

  const centroids = useMemo(
    () => (selected ? getSpeciesCentroids(selected, morphStore.store) : null),
    [selected, morphStore.store]
  );

  const lrc = ov.lrc ?? { metodo: "pendiente" as LrcMetodo, min: null, max: null };
  const setLrc = (patch: Partial<typeof lrc>) => sheets.patch(selectedId, { lrc: { ...lrc, ...patch } });

  const estado =
    centroids && (centroids.estado === "CENTROID_READY" || centroids.estado === "WARNING") ? centroids.estado : sheet.estado;
  const estadoTone =
    estado === "DRAFT" ? "danger" : estado === "WARNING" ? "warning" : estado === "DATASET_READY" ? "info" : "accent";

  function subregionName(id: string) {
    const s = ANTIOQUIA_SUBREGIONES.find((x) => x.id === id);
    return s ? `${s.numero} ${s.nombre}` : id;
  }

  function morphStatus(morphId: string) {
    const mc = centroids?.morfos.find((x) => x.morphId === morphId);
    if (!mc) return "sin datos";
    return mc.calculado
      ? `sub-centroide calculado con ${mc.individuosEtiquetados} individuos`
      : `${mc.individuosEtiquetados} individuos etiquetados en Curación (faltan para 3)`;
  }

  const pesosEfectivo = pesosManual ?? sheet.calculado.pesos;
  const draft = pesosDraft ?? pesosEfectivo;

  function updateDraft(key: keyof Pesos, value: number) {
    setPesosDraft({ ...draft, [key]: value });
    setPesosError(null);
  }

  function savePesos() {
    if (!canPesos) return;
    const sum = draft.wv + draft.wg + draft.wm;
    if (Math.abs(sum - 1) > 0.011) {
      setPesosError(`wv + wg + wm debe sumar 1.0 (hoy suma ${sum.toFixed(2)})`);
      return;
    }
    // Se guarda normalizado: el compilador rechaza pesos que no sumen 1 exacto.
    const r = (v: number) => Math.round((v / sum) * 1000) / 1000;
    const wv = r(draft.wv);
    const wg = r(draft.wg);
    sheets.patch(selectedId, { pesosManual: { wv, wg, wm: Math.round((1 - wv - wg) * 1000) / 1000 } });
    setPesosDraft(null);
  }

  function resetPesos() {
    sheets.patch(selectedId, { pesosManual: null });
    setPesosDraft(null);
    setPesosError(null);
  }

  function toggleExcluida(id: string) {
    if (!canContexto) return;
    const next = new Set(excluidas);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    sheets.patch(selectedId, { excluidas: [...next] });
  }

  const altitudRangoEfectivo = altitudManual ?? sheet.calculado.altitudRango;
  const altitudDraftValue = altitudDraft ?? altitudRangoEfectivo;

  function saveAltitudManual() {
    if (!canContexto) return;
    if (altitudDraftValue.min >= altitudDraftValue.max) {
      setAltitudError("El mínimo debe ser menor que el máximo.");
      return;
    }
    sheets.patch(selectedId, { altitudManual: altitudDraftValue });
    setAltitudDraft(null);
    setAltitudError(null);
  }

  function resetAltitudManual() {
    sheets.patch(selectedId, { altitudManual: null });
    setAltitudDraft(null);
    setAltitudError(null);
  }

  function addMorfo() {
    if (!canMorfo || !selected || !morfoForm.paquete || !morfoForm.nombre.trim()) return;
    morphStore.declare({
      speciesId: selected.id,
      subregion: morfoForm.paquete,
      nombre: morfoForm.nombre.trim(),
      nota: morfoForm.nota,
    });
    setMorfoForm({ paquete: "", nombre: "", nota: "" });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <Badge tone="neutral" className="mb-0.5">
          Dataset {sheet.datasetVersion}
        </Badge>
        <Badge tone={estadoTone} className="mb-0.5">
          {ESTADO_FICHA[estado] ?? estado}
        </Badge>
        <span className="mb-1 text-xs text-label-tertiary">
          {sheet.fotosActivas.toLocaleString("es-CO")} fotos activas · {sheet.individuos} individuos
          {centroids?.global && (
            <>
              {" · "}
              <Link href="/centroides" className="text-accent-ink hover:underline">
                centroides
                {centroids.paquetesConAviso
                  ? ` · aviso en ${centroids.paquetesConAviso} de ${centroids.regionales.length} subregiones`
                  : " listos en todas sus subregiones"}
              </Link>
            </>
          )}
        </span>
      </div>

      {(!canPesos || !canContexto || !canMorfo || !canLrc) && (
        <p className="flex items-center gap-1.5 text-xs text-label-tertiary">
          <Lock size={11} /> {session.acting?.name} ve la ficha completa; editar{" "}
          {[!canContexto && "contexto/altitud (Definir microhábitat)", !canPesos && "pesos", !canMorfo && "morfos", !canLrc && "LRC"].filter(Boolean).join(", ")}{" "}
          necesita permiso.
        </p>
      )}

      <Card>
        <CardHeader className="mb-3">
          <CardTitle>
            <Mountain size={14} className="mr-1.5 inline" aria-hidden /> Perfil ecológico
          </CardTitle>
        </CardHeader>
        <p className="mb-3 text-sm text-label-secondary">
          {sheet.calculado.altitudFuente === "registros_reales"
            ? `La altitud sale de ${sheet.calculado.nRegistrosAltitud.toLocaleString("es-CO")} registros reales de Antioquia (GBIF e iNaturalist). `
            : "Esta especie no tiene registros con altitud: se usa la muestra de curación. "}
          El sustrato sale de la muestra de{" "}
          <a href={`/curacion?especie=${selectedId}`} className="text-accent-ink hover:underline">
            Curación
          </a>
          , que todavía es simulada
          {sheet.calculado.nExcluidas > 0 && `; ${sheet.calculado.nExcluidas} observación(es) excluida(s) abajo`}.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-label-secondary">Altitud (media ± desviación)</p>
            <p className="text-lg font-semibold">
              {sheet.calculado.altitudMedia} m <span className="text-sm text-label-tertiary">± {sheet.calculado.altitudDesviacion} m</span>
            </p>
            <p className="text-xs text-label-tertiary">Distribución registrada: {sheet.calculado.distribucion.join(", ") || "sin datos"}</p>
            <p className="text-xs text-label-tertiary">
              Subregiones con registros reales: {sheet.calculado.subregionesAntioquia.join(", ") || "ninguna"}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs text-label-secondary">Prior de sustrato (calculado)</p>
            <div className="space-y-1">
              {(Object.keys(sheet.calculado.habitatPriors) as Array<keyof typeof sheet.calculado.habitatPriors>).map((k) => (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 text-label-tertiary">{SUBSTRATO_LABEL[k]}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-surface-subtle">
                    <div
                      className="h-1.5 rounded-full bg-accent-ink"
                      style={{ width: `${sheet.calculado.habitatPriors[k] * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right">{sheet.calculado.habitatPriors[k].toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-xs font-medium text-label-secondary">Rango de altitud efectivo (min–max)</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block space-y-1 text-xs">
              <span className="text-label-secondary">Mínimo (m)</span>
              <Input
                type="number"
                value={altitudDraftValue.min}
                onChange={(e) => { setAltitudDraft({ ...altitudDraftValue, min: Number(e.target.value) }); setAltitudError(null); }}
                className="w-28"
              />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="text-label-secondary">Máximo (m)</span>
              <Input
                type="number"
                value={altitudDraftValue.max}
                onChange={(e) => { setAltitudDraft({ ...altitudDraftValue, max: Number(e.target.value) }); setAltitudError(null); }}
                className="w-28"
              />
            </label>
            <Button variant="primary" className="text-xs" disabled={!canContexto} onClick={saveAltitudManual}>{!canContexto && <Lock size={12} />} Guardar como manual</Button>
            {altitudManual && (
              <Button variant="outline" className="text-xs" disabled={!canContexto} onClick={resetAltitudManual}>Volver al calculado (min–max real)</Button>
            )}
          </div>
          {altitudError && <p className="mt-1 text-xs text-danger">{altitudError}</p>}
          <p className="mt-1 text-xs text-label-tertiary">
            Efectivo: {altitudManual ? "manual" : "calculado"} — {altitudRangoEfectivo.min}–{altitudRangoEfectivo.max} m.{" "}
            {sheet.calculado.altitudFuente === "registros_reales"
              ? "Calculado: percentiles 5 y 95 de los registros reales, para que un GPS malo no estire el rango."
              : "Calculado: mínimo y máximo de la muestra de curación."}
          </p>
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-xs font-medium text-label-secondary">
            Muestra de curación ({observaciones.length}, simulada): de aquí sale el sustrato
          </p>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {observaciones.map((o) => {
              const excluida = excluidas.has(o.id);
              return (
                <div
                  key={o.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs",
                    excluida ? "border-border bg-surface-subtle opacity-50" : o.esAtipica ? "border-warning/40 bg-warning/5" : "border-border"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral" className="text-[11px]">{o.fuente}</Badge>
                    {/* Ids simulados: enlazarlos abriría la observación real de otra persona en iNaturalist o GBIF. */}
                    <span className="text-label-secondary">{o.fuenteId ? `id ${o.fuenteId} (simulado)` : "campo, sin id externo"}</span>
                    <span className={o.esAtipica ? "font-medium text-warning" : ""}>{o.altitudRaw} m</span>
                    <span className="text-label-tertiary">{SUBSTRATO_LABEL[o.substrato]}</span>
                    {o.esAtipica && (
                      <Badge tone="warning" className="text-[11px]">
                        <AlertTriangle size={9} /> atípica: fuera del rango real de la especie (Catálogo)
                      </Badge>
                    )}
                  </div>
                  <Button variant="ghost" className="text-[11px]" disabled={!canContexto} onClick={() => toggleExcluida(o.id)}>
                    {excluida ? "Reincluir" : "Excluir del cálculo"}
                  </Button>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-label-tertiary">
            Excluir una observación solo la saca de este cálculo ecológico (altitud, sustrato, pesos propuestos) — no
            toca el dataset de entrenamiento de Curación, que se cura aparte.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader className="mb-3">
          <CardTitle>
            <Sparkles size={14} className="mr-1.5 inline" /> Pesos wv / wg / wm
          </CardTitle>
          <Badge tone="neutral">{PERFIL_LABEL[sheet.calculado.perfil]}</Badge>
        </CardHeader>
        <p className="mb-3 text-xs text-label-tertiary">
          Calculado: propuesto por el perfil ecológico de arriba (no una tabla fija). Manual: lo que el herpetólogo
          confirme aquí. Efectivo: el manual si existe, si no el calculado — nunca se pisa en silencio.
        </p>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <PesoField label="wv (visual)" value={draft.wv} disabled={!canPesos} onChange={(v) => updateDraft("wv", v)} />
          <PesoField label="wg (geográfico)" value={draft.wg} disabled={!canPesos} onChange={(v) => updateDraft("wg", v)} />
          <PesoField label="wm (microhábitat)" value={draft.wm} disabled={!canPesos} onChange={(v) => updateDraft("wm", v)} />
        </div>
        {pesosError && <p className="mt-2 text-xs text-danger">{pesosError}</p>}
        <div className="mt-3 flex items-center gap-2">
          <Button variant="primary" className="text-xs" disabled={!canPesos} onClick={savePesos}>
            {!canPesos && <Lock size={12} />} Guardar como manual
          </Button>
          {pesosManual && (
            <Button variant="outline" className="text-xs" disabled={!canPesos} onClick={resetPesos}>
              Volver al calculado
            </Button>
          )}
          <span className="text-xs text-label-tertiary">
            Efectivo: {pesosManual ? "manual" : "calculado"} — wv {pesosEfectivo.wv} · wg {pesosEfectivo.wg} · wm {pesosEfectivo.wm}
          </span>
        </div>
      </Card>

      <Card>
        <CardHeader className="mb-3">
          <CardTitle>Morfos por paquete</CardTitle>
        </CardHeader>
        <p className="mb-3 text-xs text-label-tertiary">
          Los declara el herpetólogo, especie por especie y paquete por paquete. Un morfo no es una especie nueva ni se
          da de alta por aparecer en un ejemplo.
        </p>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Field label="Paquete (subregión)">
            <Select
              value={morfoForm.paquete}
              onChange={(e) => setMorfoForm((f) => ({ ...f, paquete: e.target.value }))}
              className="min-w-[160px]"
            >
              <option value="">Seleccionar…</option>
              {ANTIOQUIA_SUBREGIONES.filter((s) =>
                sheet.calculado.subregionesAntioquia.includes(`${s.numero} ${s.nombre}`)
              ).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.numero} {s.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nombre del morfo">
            <Input
              value={morfoForm.nombre}
              onChange={(e) => setMorfoForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="ej. red_morph"
            />
          </Field>
          <Field label="Nota">
            <Input
              value={morfoForm.nota}
              onChange={(e) => setMorfoForm((f) => ({ ...f, nota: e.target.value }))}
              placeholder="criterio de campo"
            />
          </Field>
          <Button variant="outline" className="text-xs" disabled={!canMorfo} onClick={addMorfo}>
            {canMorfo ? <Plus size={13} /> : <Lock size={13} />} Declarar morfo
          </Button>
        </div>
        {morfos.length === 0 ? (
          <p className="text-xs text-label-tertiary">Sin morfos declarados — el centroide global es la única referencia.</p>
        ) : (
          <ul className="space-y-1.5">
            {morfos.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-xs">
                <span>
                  <strong>{m.nombre}</strong> en {subregionName(m.subregion)}{" "}
                  {m.nota && <span className="text-label-tertiary">· {m.nota}</span>}{" "}
                  <span className="text-label-tertiary">
                    · {morphStatus(m.id)}
                  </span>
                </span>
                <Button variant="ghost" className="text-danger" disabled={!canMorfo} onClick={() => morphStore.remove(m.id)}>
                  <Trash2 size={12} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            <Ruler size={14} className="mr-1.5 inline" aria-hidden /> LRC (longitud rostro-cloaca)
          </CardTitle>
          <Badge tone="neutral">Fase 2 · todavía no la usa ningún paso</Badge>
        </CardHeader>
        <p className="mb-3 text-sm text-label-secondary">
          Se guarda para la Fase 2 (separar un juvenil de una especie grande de un adulto pequeño). Hoy no la leen el
          worker, el OSR ni el compilador: cambiarla no cambia el paquete. No hay mediciones reales que importar
          hasta conectar CVAT.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Método">
            <Select value={lrc.metodo} disabled={!canLrc} onChange={(e) => setLrc({ metodo: e.target.value as LrcMetodo })}>
              <option value="pendiente">Pendiente</option>
              <option value="manual">Manual</option>
              <option value="regla_lrc" disabled>Regla LRC (CVAT, sin conectar)</option>
            </Select>
          </Field>
          {lrc.metodo !== "pendiente" && (
            <>
              <Field label="Mínimo (mm)">
                <Input value={lrc.min ?? ""} disabled={!canLrc} onChange={(e) => setLrc({ min: e.target.value === "" ? null : Number(e.target.value) })} type="number" className="w-24" />
              </Field>
              <Field label="Máximo (mm)">
                <Input value={lrc.max ?? ""} disabled={!canLrc} onChange={(e) => setLrc({ max: e.target.value === "" ? null : Number(e.target.value) })} type="number" className="w-24" />
              </Field>
            </>
          )}
        </div>
      </Card>

      <p className="flex items-center gap-1.5 rounded-md bg-surface-subtle px-3 py-2 text-xs text-label-tertiary">
        <AlertTriangle size={13} /> <span>
          Complejo críptico y calibración OSR de esta especie se configuran en{" "}
          <Link href="/micro-adaptadores" className="underline">Micro-adaptadores</Link> y{" "}
          <Link href="/osr" className="underline">OSR</Link>. La μ y σ de altitud de esta ficha son las que usa la capa geográfica del OSR.
        </span>
      </p>
    </div>
  );
}

function PesoField({ label, value, disabled, onChange }: { label: string; value: number; disabled?: boolean; onChange: (v: number) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-label-secondary">{label}</span>
      <Input
        type="number"
        step="0.01"
        min={0}
        max={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
