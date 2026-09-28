"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Scale } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Select } from "@/components/ui/field";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import { ANTIOQUIA_SUBREGIONES } from "@/lib/packages/antioquia-subregiones";
import { useMorphStore } from "@/lib/centroids/morph-store";
import {
  CENTROID_BYTES,
  COVARIANZA_BYTES,
  MIN_FOTOS_SUBCENTROIDE_JUVENIL,
  MIN_INDIVIDUOS_REGIONAL,
  PROCEDENCIA,
  TRAIN_FRACTION,
  getAllSpeciesCentroids,
  getPackageCentroids,
  type SpeciesCentroids,
} from "@/lib/centroids/centroids";

const ESTADO_TONE: Record<SpeciesCentroids["estado"], "accent" | "warning" | "danger" | "neutral"> = {
  CENTROID_READY: "accent",
  WARNING: "warning",
  INSUFICIENTE: "danger",
  SIN_EMBEDDINGS: "neutral",
};

function fmtBytes(b: number) {
  if (b >= 1_048_576) return `${(b / 1_048_576).toLocaleString("es-CO", { maximumFractionDigits: 1 })} MiB`;
  return `${(b / 1024).toLocaleString("es-CO", { maximumFractionDigits: 1 })} KiB`;
}

export function CentroidsConsole() {
  const { store } = useMorphStore();
  const all = useMemo(() => getAllSpeciesCentroids(store), [store]);
  const [subregionId, setSubregionId] = useState(ANTIOQUIA_SUBREGIONES[8].id);
  const [speciesId, setSpeciesId] = useState<string | null>(null);

  const pkg = useMemo(() => getPackageCentroids(subregionId, all), [subregionId, all]);
  const selected = all.find((c) => c.species.id === speciesId) ?? null;
  const counts = {
    ready: all.filter((c) => c.estado === "CENTROID_READY").length,
    warning: all.filter((c) => c.estado === "WARNING").length,
    otros: all.filter((c) => c.estado === "INSUFICIENTE" || c.estado === "SIN_EMBEDDINGS").length,
  };
  const pkgWarnings = pkg.especies.filter(
    (c) => c.regionales.find((r) => r.subregionId === subregionId)?.estado === "WARNING"
  ).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="mb-2">
          <CardTitle>Vista mecánica, vectores simulados</CardTitle>
          <Badge tone="warning">No es el lote del servidor</Badge>
        </CardHeader>
        <p className="text-xs text-label-secondary">
          Estos conteos y la dispersión salen de vectores generados en el navegador, no de pgvector. Sirven para ver la
          regla (global, prestado si hay menos de {MIN_INDIVIDUOS_REGIONAL} individuos, morfo solo si está declarado) con
          el corte del {Math.round(TRAIN_FRACTION * 100)} % por individuo. La referencia {PROCEDENCIA.lote} es de esta
          vista, no de una corrida real.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-label-tertiary">Estado de la especie:</span>
          <Badge tone="accent">{counts.ready} con centroide listo</Badge>
          {counts.warning > 0 && <Badge tone="warning">{counts.warning} WARNING</Badge>}
          {counts.otros > 0 && <Badge tone="danger">{counts.otros} sin centroide</Badge>}
          <span className="text-label-tertiary">· los préstamos y morfos sin datos se avisan por especie y subregión, abajo.</span>
        </div>
      </Card>

      <Card>
        <CardHeader className="mb-3">
          <CardTitle>Paquete por subregión</CardTitle>
          <Field label="">
            <Select value={subregionId} onChange={(e) => setSubregionId(e.target.value)} className="min-w-[220px]">
              {ANTIOQUIA_SUBREGIONES.map((s) => (
                <option key={s.id} value={s.id}>{s.numero} {s.nombre}</option>
              ))}
            </Select>
          </Field>
        </CardHeader>

        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-5">
          <Stat label="Especies con centroide" value={pkg.especies.length} />
          <Stat label="Regionales propios" value={pkg.regionalesPropios} />
          <Stat label="Globales prestados" value={pkg.prestados} tone={pkg.prestados ? "text-warning" : undefined} sub={`${pkgWarnings} especie(s) en WARNING aquí`} />
          <Stat label="Sub-centroides de morfo" value={pkg.subCentroidesMorfo} />
          <Stat label="Supercentroides" value={pkg.generos + pkg.familias} sub={`${pkg.generos} géneros · ${pkg.familias} familias`} />
        </div>

        <div className="mt-4 rounded-md border border-border p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium"><Scale size={13} /> Peso del paquete según el camino (decisión: comparar ambos)</p>
          <Table>
            <THead>
              <tr><TH>Camino</TH><TH>Qué viaja al teléfono</TH><TH>Tamaño</TH></tr>
            </THead>
            <TBody>
              <TRow>
                <TD className="text-xs font-medium">Coseno (vault)</TD>
                <TD className="text-xs">Centroides y supercentroides FP16, {fmtBytes(CENTROID_BYTES)} c/u</TD>
                <TD className="text-xs">{fmtBytes(pkg.bytesCoseno)}</TD>
              </TRow>
              <TRow>
                <TD className="text-xs font-medium">Mahalanobis (app actual)</TD>
                <TD className="text-xs">Lo anterior + covarianza {fmtBytes(COVARIANZA_BYTES)} por especie Grupo A + 1 agrupada Grupo B</TD>
                <TD className="text-xs">{fmtBytes(pkg.bytesMahalanobis)}</TD>
              </TRow>
              <TRow>
                <TD className="text-xs font-medium">.sqlite viejo</TD>
                <TD className="text-xs">Todos los vectores de referencia en float32</TD>
                <TD className="text-xs">{fmtBytes(pkg.bytesSqliteViejo)}</TD>
              </TRow>
            </TBody>
          </Table>
          <p className="mt-2 text-[11px] text-label-tertiary">
            El tamaño no decide cuál gana: decide la comparación de FAR, KAR y AUROC que harán el rechazo (F21) y la
            validación (F22) sobre los individuos apartados.
          </p>
        </div>

        <div className="mt-4 max-h-96 overflow-y-auto">
          <Table>
            <THead>
              <tr><TH>Especie</TH><TH>Estado en esta subregión</TH><TH>Centroide regional</TH><TH>Morfos</TH><TH>Dispersión</TH><TH>Grupo Mahalanobis</TH></tr>
            </THead>
            <TBody>
              {pkg.especies.map((c) => {
                const reg = c.regionales.find((r) => r.subregionId === subregionId);
                const morfosAqui = c.morfos.filter((x) => x.subregionId === subregionId);
                const estadoAqui = c.estado === "CENTROID_READY" && reg ? reg.estado : c.estado;
                return (
                  <TRow key={c.species.id} onClick={() => setSpeciesId(c.species.id)} clickable>
                    <TD className="text-xs italic">{c.species.especie}</TD>
                    <TD><Badge tone={ESTADO_TONE[estadoAqui]} className="text-[11px]">{estadoAqui}</Badge></TD>
                    <TD className="text-xs">
                      {reg && !reg.borrowed ? `propio · ~${reg.individuos} individuos` : <span className="text-warning">global prestado (borrowed)</span>}
                    </TD>
                    <TD className="text-xs">
                      {morfosAqui.length ? morfosAqui.map((x) => `${x.nombre}${x.calculado ? "" : " (sin datos)"}`).join(", ") : "—"}
                    </TD>
                    <TD className="text-xs tabular-nums">{c.dispersion.toFixed(3)}</TD>
                    <TD className="text-xs">{c.grupoMahalanobis === "A" ? "A · covarianza propia" : "B · agrupada"}</TD>
                  </TRow>
                );
              })}
            </TBody>
          </Table>
        </div>
      </Card>

      {selected && <SpeciesDetail c={selected} />}
    </div>
  );
}

function SpeciesDetail({ c }: { c: SpeciesCentroids }) {
  return (
    <Card>
      <CardHeader className="mb-3">
        <CardTitle className="italic">{c.species.especie}</CardTitle>
        <Badge tone={ESTADO_TONE[c.estado]}>{c.estado}</Badge>
      </CardHeader>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-1 text-xs">
          <p className="font-medium">Corte por individuo</p>
          <p className="text-label-secondary">Entrenamiento: {c.individuosTrain} individuos · {c.vectoresTrain.toLocaleString("es-CO")} vectores</p>
          <p className="text-label-secondary">Apartados: {c.individuosTest} individuos · {c.vectoresTest.toLocaleString("es-CO")} vectores</p>
          <p className="text-label-tertiary">Taxon {c.species.taxonId} · {c.species.genero} · {c.species.familia}</p>
          <p className="text-label-secondary">Dispersión (1 − coseno medio al centroide): {c.dispersion.toFixed(3)}</p>
          {c.vecino && (
            <p className={c.vecino.cos > 0.9 ? "text-warning" : "text-label-secondary"}>
              Especie más cercana: <span className="italic">{c.vecino.especie}</span> (coseno {c.vecino.cos.toFixed(3)})
              {c.vecino.cos > 0.9 && " — candidata a micro-adaptador"}
            </p>
          )}
        </div>
        <div className="space-y-1 text-xs">
          <p className="font-medium">Regionales (≥ {MIN_INDIVIDUOS_REGIONAL} individuos o se presta el global)</p>
          {c.regionales.map((r) => (
            <p key={r.subregionId} className={r.estado === "WARNING" ? "text-warning" : "text-label-secondary"}>
              {r.nombre}: {r.borrowed ? `prestado (${r.individuos} ind.)` : `propio (~${r.individuos} ind.)`} · {r.estado}
            </p>
          ))}
        </div>
        <div className="space-y-1 text-xs">
          <p className="font-medium">Morfos y juveniles</p>
          {c.morfos.length === 0 ? (
            <p className="text-label-secondary">
              Sin morfos declarados. Se declaran en{" "}
              <Link href={`/ficha-especie?especie=${c.species.id}`} className="text-accent-ink hover:underline">Ficha de especie</Link>.
            </p>
          ) : (
            c.morfos.map((x) => (
              <p key={x.morphId} className={x.calculado ? "text-label-secondary" : "text-warning"}>
                {x.nombre}: {x.individuosEtiquetados} individuos etiquetados {x.calculado ? "· sub-centroide calculado" : `· faltan etiquetas en Curación`}
              </p>
            ))
          )}
          <p className="text-label-secondary">
            Juveniles: ~{c.juveniles.fotosEstimadas} fotos ·{" "}
            {c.juveniles.elegible
              ? "elegible, pero el sub-centroide juvenil entra en un release posterior (Fase 2)"
              : `menos de ${MIN_FOTOS_SUBCENTROIDE_JUVENIL}: contrato sub_centroids vacío`}
          </p>
        </div>
      </div>
      {c.avisos.length > 0 && (
        <ul className="mt-3 space-y-1">
          {c.avisos.map((a) => (
            <li key={a} className="flex items-start gap-1.5 text-xs text-warning"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{a}</li>
          ))}
        </ul>
      )}
      {c.estado === "CENTROID_READY" && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-accent-ink">
          <CheckCircle2 size={12} /> Centroide global listo para calibrar el rechazo (F21)
          {c.paquetesConAviso > 0 && ` · con aviso en ${c.paquetesConAviso} de ${c.regionales.length} subregiones`}.
        </p>
      )}
    </Card>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-label-tertiary">{label}</p>
      <p className={`text-lg font-semibold ${tone ?? "text-label-primary"}`}>{value}</p>
      {sub && <p className="text-[11px] text-label-tertiary">{sub}</p>}
    </div>
  );
}
