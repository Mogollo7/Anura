"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Lock, RotateCcw, ShieldCheck } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RealComparisonCard } from "@/components/real/real-comparison-card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ANTIOQUIA_SUBREGIONES, speciesForSubregion } from "@/lib/packages/antioquia-subregiones";
import { usePanelSession } from "@/lib/session/panel-session";
import { useClusterStore } from "@/lib/adapters/cluster-store";
import { clusterFingerprint, trainAdapter } from "@/lib/adapters/adapters";
import { useOsrStore } from "@/lib/osr/osr-store";
import {
  DEFAULT_OSR_CONFIG,
  ESTADOS,
  MEDIDO_VAULT,
  RANGO_TAU_FUENTE,
  calibratePackage,
  evaluateOsr,
  osrFingerprint,
  type ClusterGate,
  type NodeThreshold,
  type OsrConfig,
} from "@/lib/osr/osr";

const pct = (x: number) => `${(x * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;
const num = (x: number, d = 3) => x.toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });

function defaultSubregion() {
  return ANTIOQUIA_SUBREGIONES.find((s) => s.id === "01_valle_de_aburra")?.id ?? ANTIOQUIA_SUBREGIONES[0].id;
}

export function OsrConsole() {
  const session = usePanelSession();
  const canConfig = session.can("configurarOSR");
  const [subregionId, setSubregionId] = useState(defaultSubregion);
  const osr = useOsrStore(subregionId);
  const { clusters } = useClusterStore();

  const species = useMemo(() => speciesForSubregion(subregionId), [subregionId]);
  const byId = useMemo(() => new Map(species.map((s) => [s.id, s])), [species]);
  const calib = useMemo(() => calibratePackage(subregionId), [subregionId]);

  // Capa 2: solo los clústeres de ESTA subregión cuyo entrenamiento sigue vigente (F19).
  const gates: ClusterGate[] = useMemo(
    () =>
      clusters
        .filter((c) => c.subregionId === subregionId && c.entrenado?.fingerprint === clusterFingerprint(c))
        .map((c) => {
          const members = c.miembros.map((id) => byId.get(id)).filter((s) => !!s);
          const r = trainAdapter(c, members, species);
          return {
            id: c.id,
            clusterId: c.clusterId,
            miembros: c.miembros,
            epsilonPropuesto: r.epsilon,
            erecMiembros: r.erecMiembros,
            intrusos: r.intrusos,
            erec: r.erec,
          };
        }),
    [clusters, subregionId, byId, species]
  );
  const clustersSinEntrenar = clusters.filter(
    (c) => c.subregionId === subregionId && c.entrenado?.fingerprint !== clusterFingerprint(c)
  ).length;

  const ev = useMemo(() => evaluateOsr(calib, osr.config, gates), [calib, osr.config, gates]);
  const fingerprint = osrFingerprint(subregionId, osr.config, gates);
  const validada = osr.validacion?.fingerprint === fingerprint;
  const vencida = !!osr.validacion && !validada;
  const name = (id: string) => byId.get(id)?.especie ?? id;
  const coseno = ev.paths.find((p) => p.id === "coseno_weibull")!;
  const mahal = ev.paths.find((p) => p.id === "mahalanobis")!;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Subregión (una calibración por paquete)">
          <Select value={subregionId} onChange={(e) => setSubregionId(e.target.value)} className="min-w-[220px]">
            {ANTIOQUIA_SUBREGIONES.map((s) => (
              <option key={s.id} value={s.id}>{s.numero} {s.nombre}</option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={validada ? "accent" : vencida ? "warning" : "neutral"}>
            {validada
              ? `Validada por ${osr.validacion!.por} · ${osr.validacion!.fecha}`
              : vencida
                ? "Validación vencida: cambió la calibración"
                : "Propuesta del worker · sin validar"}
          </Badge>
          <Button
            variant="primary"
            className="text-xs"
            disabled={!canConfig || validada}
            onClick={() => osr.validar(fingerprint, session.acting?.name ?? "—")}
          >
            {canConfig ? <ShieldCheck size={12} /> : <Lock size={12} />} Validar calibración
          </Button>
        </div>
      </div>
      {!canConfig && (
        <p className="text-xs text-label-tertiary">
          <Lock size={11} className="mr-1 inline" />
          {session.acting?.name} puede ver y revisar la calibración; ajustarla o validarla requiere &quot;Configurar OSR técnico&quot;.
        </p>
      )}
      <p className="text-xs text-label-tertiary">
        {species.length} especies en el paquete · ajustado con el 80 % de individuos de entrenamiento · medido con {ev.paths[0].conocidas} fotos
        de individuos apartados y {ev.paths[0].desconocidas} fotos de {calib.unknown.length} especies que el paquete no conoce. Embeddings
        simulados: la mecánica es real, las cifras de referencia siguen siendo las medidas del vault.
      </p>

      <RealComparisonCard />

      {/* ── Comparación ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="mb-2">
          <CardTitle>Simulación de esta subregión: coseno contra Mahalanobis</CardTitle>
          <Badge tone="warning">vectores simulados, optimistas</Badge>
        </CardHeader>
        <Table>
          <THead>
            <tr><TH>Camino</TH><TH>Qué viaja al teléfono</TH><TH className="text-right">KAR</TH><TH className="text-right">FAR</TH><TH className="text-right">AUROC</TH><TH className="text-right">Acierto entre aceptadas</TH></tr>
          </THead>
          <TBody>
            {ev.paths.map((p) => (
              <TRow key={p.id}>
                <TD className="text-xs font-medium">{p.nombre}</TD>
                <TD className="text-xs text-label-secondary">{p.viaja}</TD>
                <TD className="text-right text-xs tabular-nums">{pct(p.kar)}</TD>
                <TD className="text-right text-xs tabular-nums">{pct(p.far)}</TD>
                <TD className="text-right text-xs tabular-nums">{num(p.auroc)}</TD>
                <TD className="text-right text-xs tabular-nums">{pct(p.aciertoAceptadas)}</TD>
              </TRow>
            ))}
            <TRow>
              <TD className="text-xs font-medium text-label-tertiary">Medido en el vault (Mahalanobis real)</TD>
              <TD className="text-xs text-label-tertiary">FASE 13 / DECISION_LOG C-16, τ {num(MEDIDO_VAULT.tauMahalanobis, 2)}</TD>
              <TD className="text-right text-xs tabular-nums text-label-tertiary">{pct(MEDIDO_VAULT.kar)}</TD>
              <TD className="text-right text-xs tabular-nums text-label-tertiary">{pct(MEDIDO_VAULT.far)}</TD>
              <TD className="text-right text-xs tabular-nums text-label-tertiary">{num(MEDIDO_VAULT.auroc, 4)}</TD>
              <TD className="text-right text-xs text-label-tertiary">—</TD>
            </TRow>
          </TBody>
        </Table>
        <p className="mt-2 text-[11px] text-label-tertiary">
          KAR: fotos de especies del paquete que pasan la capa 1. FAR: fotos de especies desconocidas que pasan como si fueran una especie del
          paquete. AUROC: qué tan bien el puntaje separa conocidas de desconocidas, sin depender del corte.
        </p>

        <p className="mb-1 mt-4 text-xs font-medium">A la misma exigencia (cobertura p en los dos caminos)</p>
        <Table>
          <THead>
            <tr><TH>p</TH><TH className="text-right">Coseno KAR</TH><TH className="text-right">Coseno FAR</TH><TH className="text-right">Mahalanobis KAR</TH><TH className="text-right">Mahalanobis FAR</TH></tr>
          </THead>
          <TBody>
            {ev.curva.map((c) => (
              <TRow key={c.cobertura} className={cn(c.cobertura === osr.config.cobertura && "bg-surface-subtle")}>
                <TD className="text-xs tabular-nums">{c.cobertura}</TD>
                <TD className="text-right text-xs tabular-nums">{pct(c.coseno.kar)}</TD>
                <TD className={cn("text-right text-xs tabular-nums", c.coseno.far < c.mahalanobis.far && "font-semibold text-accent-ink")}>{pct(c.coseno.far)}</TD>
                <TD className="text-right text-xs tabular-nums">{pct(c.mahalanobis.kar)}</TD>
                <TD className={cn("text-right text-xs tabular-nums", c.mahalanobis.far < c.coseno.far && "font-semibold text-accent-ink")}>{pct(c.mahalanobis.far)}</TD>
              </TRow>
            ))}
          </TBody>
        </Table>
        <p className="mt-2 text-xs text-label-secondary">
          En esta subregión, a p = {osr.config.cobertura}: coseno deja pasar {pct(coseno.far)} de desconocidas y Mahalanobis {pct(mahal.far)}
          {coseno.far < mahal.far ? " — Mahalanobis es más permisivo, igual que en la medición real del vault." : "."} La elección no se hace
          aquí: la validación técnica (F22) la repite con sus pruebas y el compilador (F23) emite el camino que gane, con esta tabla como
          evidencia. Si ganara Mahalanobis, el vault (decisión #5) dice que cambia el calibrador del Admin, no lo que viaja.
        </p>
      </Card>

      {/* ── Parámetros ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="mb-2"><CardTitle>Parámetros: propuesto, manual y efectivo</CardTitle></CardHeader>
        <p className="mb-3 text-xs text-label-tertiary">
          El worker propone; la persona valida o ajusta. Un ajuste manual queda marcado y nunca se pisa en silencio.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Param label="Cobertura p (cuantil de la Weibull)" k="cobertura" osr={osr} disabled={!canConfig} step={0.005} min={0.5} max={0.999} />
          <Param label="α (elasticidad del radio)" k="alpha" osr={osr} disabled={!canConfig} step={0.05} min={0.5} max={2} />
          <Param label="Percentil Mahalanobis" k="percentilMahalanobis" osr={osr} disabled={!canConfig} step={1} min={50} max={99.9} />
          <Param label="umbral_geo (P de altitud)" k="umbralGeo" osr={osr} disabled={!canConfig} step={0.01} min={0.001} max={0.5} />
          <div>
            <Field label="Política geográfica">
              <Select
                value={osr.config.politicaGeo}
                disabled={!canConfig}
                onChange={(e) => osr.set("politicaGeo", e.target.value as OsrConfig["politicaGeo"])}
              >
                <option value="rechazo">Rechazo (OSR_GEO)</option>
                <option value="penalizacion">Solo penalización</option>
              </Select>
            </Field>
            <ManualTag manual={osr.manual.politicaGeo !== undefined} onReset={() => osr.reset("politicaGeo")} disabled={!canConfig} propuesto="rechazo" />
          </div>
        </div>
      </Card>

      {/* ── Capa 1 ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="mb-2">
          <CardTitle>Capa 1 · radio por especie</CardTitle>
          <Badge tone="neutral">tau_kind: cosine_similarity</Badge>
        </CardHeader>
        <p className="mb-3 text-xs text-label-tertiary">
          Weibull ajustada a d = 1 − coseno de los vectores de entrenamiento de cada especie contra su centroide. Radio = α · F⁻¹(p); lo que
          viaja es el corte ya convertido a similitud, τ = 1 − radio. Un solo umbral para todo el paquete daría τ = {num(ev.tauUnico)}.
          La fuente propone {RANGO_TAU_FUENTE.especie[0]}–{RANGO_TAU_FUENTE.especie[1]} para especie como hipótesis.
        </p>
        <div className="max-h-[420px] overflow-y-auto">
          <Table>
            <THead>
              <tr>
                <TH>Especie</TH><TH className="text-right">Entren. / apart.</TH><TH className="text-right">β</TH><TH className="text-right">η</TH>
                <TH className="text-right">τ coseno</TH><TH className="text-right">Pasa (apartados)</TH><TH>Grupo</TH>
                <TH className="text-right">τ Mahalanobis</TH><TH className="text-right">Pasa (apartados)</TH>
              </tr>
            </THead>
            <TBody>
              {[...ev.especies].sort((a, b) => a.tauCos - b.tauCos).map((s) => (
                <TRow key={s.species.id}>
                  <TD className="text-xs italic">{s.species.especie}</TD>
                  <TD className="text-right text-xs tabular-nums">{s.nTrain} / {s.nTest}</TD>
                  <TD className="text-right text-xs tabular-nums">{num(s.beta, 2)}</TD>
                  <TD className="text-right text-xs tabular-nums">{num(s.eta)}</TD>
                  <TD className={cn("text-right text-xs font-medium tabular-nums", (s.tauCos < RANGO_TAU_FUENTE.especie[0] || s.tauCos > RANGO_TAU_FUENTE.especie[1]) && "text-warning")}>{num(s.tauCos)}</TD>
                  <TD className={cn("text-right text-xs tabular-nums", s.karCos < 0.8 && "text-warning")}>{pct(s.karCos)}</TD>
                  <TD className="text-xs">{s.grupo === "A" ? "A · propia" : "B · agrupada"}</TD>
                  <TD className="text-right text-xs tabular-nums">{num(s.tauMahal, 1)}</TD>
                  <TD className={cn("text-right text-xs tabular-nums", s.karMahal < 0.8 && "text-warning")}>{pct(s.karMahal)}</TD>
                </TRow>
              ))}
            </TBody>
          </Table>
        </div>
        <p className="mt-2 text-[11px] text-label-tertiary">
          Lectura honesta: en los embeddings simulados la dispersión casi no cambia entre especies (β y η parecidos), así que el radio por
          especie apenas se aparta del umbral único. La ventaja que la fuente espera (radio holgado para una polimórfica como{" "}
          <span className="italic">Oophaga histrionica</span>, estrecho para una uniforme) solo se puede medir con vectores reales. Mahalanobis
          se ajusta con covarianza regularizada (16 ejes propios + varianza isotrópica); el grupo A usa la suya contraída hacia la agrupada
          porque aquí tiene ≤ 16 individuos de entrenamiento, no 200.
        </p>
      </Card>

      {/* ── Cascada ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="mb-2"><CardTitle>Cascada: especie → género → familia → rechazo</CardTitle></CardHeader>
        <p className="mb-3 text-xs text-label-tertiary">
          Supercentroide de género = suma L2 de sus especies; de familia = suma L2 de sus géneros, un voto por género. Su τ sale de la misma
          Weibull sobre los vectores de entrenamiento de sus especies. Los rangos de la fuente son hipótesis: se muestran, no se imponen.
        </p>
        <div className="grid gap-4 xl:grid-cols-2">
          <NodeTable
            titulo={`Géneros (fuente: ${RANGO_TAU_FUENTE.genero.join("–")})`}
            nodes={ev.generos}
            disabled={!canConfig}
            onSet={(id, v) => osr.setMapEntry("tauGeneroManual", id, v)}
          />
          <NodeTable
            titulo={`Familias (fuente: ${RANGO_TAU_FUENTE.familia.join("–")})`}
            nodes={ev.familias}
            disabled={!canConfig}
            onSet={(id, v) => osr.setMapEntry("tauFamiliaManual", id, v)}
          />
        </div>

        <p className="mb-1 mt-5 text-xs font-medium">Qué devuelve la app (camino coseno, capas 1 y 2)</p>
        <Table>
          <THead>
            <tr>
              <TH>Fotos de…</TH><TH className="text-right">n</TH>
              {ESTADOS.map((e) => <TH key={e} className="text-right font-mono text-[11px]">{e}</TH>)}
              <TH>Lo correcto</TH><TH className="text-right">Correctas</TH>
            </tr>
          </THead>
          <TBody>
            {ev.cascada.map((r) => (
              <TRow key={r.grupo}>
                <TD className="min-w-[200px] text-xs">{r.etiqueta}</TD>
                <TD className="text-right text-xs tabular-nums">{r.n}</TD>
                {ESTADOS.map((e) => (
                  <TD key={e} className={cn("text-right text-xs tabular-nums", r.estados[e] === 0 && "text-label-tertiary", r.grupo !== "conocida" && e === "MATCH_SPECIES" && r.estados[e] > 0 && "text-warning")}>
                    {r.estados[e]}
                  </TD>
                ))}
                <TD className="text-xs text-label-secondary">{r.esperado}</TD>
                <TD className="text-right text-xs font-medium tabular-nums">{pct(r.correctos / r.n)}</TD>
              </TRow>
            ))}
          </TBody>
        </Table>
        <p className="mt-2 text-[11px] text-label-tertiary">
          Una desconocida en MATCH_SPECIES es el error que importa: la app le pondría el nombre de otra especie. Las congéneres son las que
          más se cuelan por la capa 1 — es lo que dice la fuente, y por eso existe la capa 2. Especies desconocidas usadas:{" "}
          {calib.unknown.map((u) => u.nombre).join(" · ")}.
        </p>
      </Card>

      {/* ── Capa 2 ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="mb-2">
          <CardTitle>Capa 2 · ε de reconstrucción por clúster</CardTitle>
          <Badge tone={ev.clusters.length ? "info" : "neutral"}>{ev.clusters.length} clúster(es) entrenados</Badge>
        </CardHeader>
        {ev.clusters.length === 0 ? (
          <p className="text-xs text-label-secondary">
            No hay clústeres entrenados en esta subregión
            {clustersSinEntrenar > 0 ? ` (${clustersSinEntrenar} creado(s) sin entrenar o desactualizado(s))` : ""}. El ε se propone al entrenar
            en <Link href="/micro-adaptadores" className="text-accent-ink underline">Micro-adaptadores</Link> y se calibra aquí.
          </p>
        ) : (
          <div className="space-y-5">
            {ev.clusters.map((c) => (
              <div key={c.id} className="space-y-2 border-b border-border pb-4 last:border-0 last:pb-0">
                <p className="text-xs">
                  <span className="font-mono font-medium">{c.clusterId}</span>
                  <span className="text-label-tertiary"> · {c.miembros.map(name).join(" · ")}</span>
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <NumField
                    key={`${c.id}:${c.epsilonEfectivo}`}
                    label={`ε (propuesto p95 en F19: ${num(c.epsilonPropuesto)})`}
                    value={c.epsilonEfectivo}
                    step={0.001}
                    min={0.0001}
                    max={1}
                    disabled={!canConfig}
                    onCommit={(v) => osr.setMapEntry("epsilonManual", c.id, v)}
                  />
                  <ManualTag manual={c.epsilonManual !== null} onReset={() => osr.setMapEntry("epsilonManual", c.id, null)} disabled={!canConfig} propuesto={num(c.epsilonPropuesto)} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <Stat label="Miembros rechazados" value={pct(c.falsoRechazoMiembros)} tone={c.falsoRechazoMiembros > 0.1 ? "text-warning" : undefined} />
                  <Stat label="Desconocidas atajadas" value={`${c.desconocidasAtajadas} / ${c.desconocidasQueEntran}`} sub="las que la capa 1 metió en un miembro" />
                  <Stat label="Intrusos del mismo género" value={c.rechazoIntrusosGenero === null ? "—" : pct(c.rechazoIntrusosGenero)} sub="rechazados" />
                  <Stat label="Intrusos de otros géneros" value={c.rechazoIntrusosOtros === null ? "—" : pct(c.rechazoIntrusosOtros)} sub="rechazados" />
                </div>
                <Table>
                  <THead><tr><TH>ε en el percentil</TH><TH className="text-right">ε</TH><TH className="text-right">Miembros rechazados</TH><TH className="text-right">Desconocidas atajadas</TH><TH></TH></tr></THead>
                  <TBody>
                    {c.curva.map((p) => (
                      <TRow key={p.etiqueta}>
                        <TD className="text-xs">{p.etiqueta}</TD>
                        <TD className="text-right text-xs tabular-nums">{num(p.eps)}</TD>
                        <TD className="text-right text-xs tabular-nums">{pct(p.falsoRechazo)}</TD>
                        <TD className="text-right text-xs tabular-nums">{p.atajadas} / {c.desconocidasQueEntran}</TD>
                        <TD className="text-right">
                          <Button variant="ghost" className="text-xs" disabled={!canConfig} onClick={() => osr.setMapEntry("epsilonManual", c.id, p.eps)}>Usar</Button>
                        </TD>
                      </TRow>
                    ))}
                  </TBody>
                </Table>
              </div>
            ))}
            <p className="text-[11px] text-label-tertiary">
              ε más bajo ataja más desconocidas y rechaza más miembros reales (quedan en OSR_CLUSTER, no en su especie). Es la decisión que
              aquí se valida; la matriz W no cambia.
            </p>
          </div>
        )}
      </Card>

      {/* ── Capa 3 ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="mb-2">
          <CardTitle>Capa 3 · umbral_geo contra registros curados</CardTitle>
          <Badge tone="neutral">{osr.config.politicaGeo === "rechazo" ? "OSR_GEO" : "penalización"}</Badge>
        </CardHeader>
        <p className="mb-3 text-xs text-label-tertiary">
          P(altitud | especie) = 2·(1 − Φ(|h − μ| / σ)), con μ y σ de la ficha de cada especie. Se prueba contra las observaciones curadas
          (F13): son registros verdaderos de la especie, así que lo que caiga bajo el umbral es un GPS malo (atípica, F20) o un rechazo injusto.
          0,05 es el valor inicial de las notas, no una constante (decisión #4).
        </p>
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <Stat label="Observaciones curadas" value={String(ev.geo.observaciones)} />
          <Stat label="Bajo el umbral" value={String(ev.geo.bajoUmbral)} sub={`umbral_geo ${ev.geo.umbral}`} />
          <Stat label="Atípicas atajadas" value={`${ev.geo.atipicasAtajadas} / ${ev.geo.atipicasTotal}`} sub="GPS fuera del rango real" />
          <Stat
            label={osr.config.politicaGeo === "rechazo" ? "Registros buenos rechazados" : "Registros buenos penalizados"}
            value={`${ev.geo.normalesAfectadas} (${pct(ev.geo.normalesAfectadas / Math.max(1, ev.geo.observaciones - ev.geo.atipicasTotal))})`}
            tone={ev.geo.normalesAfectadas > 0 ? "text-warning" : undefined}
          />
        </div>
        {ev.geo.peores.length > 0 && (
          <ul className="mt-3 space-y-0.5 text-xs text-label-secondary">
            {ev.geo.peores.map((p) => (
              <li key={p.species.id}>
                <span className="italic">{p.species.especie}</span>: {p.afectadas} de {p.n} registros buenos bajo el umbral · μ {p.mu} ± {p.sigma} m
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-label-tertiary">
          {osr.config.politicaGeo === "rechazo"
            ? "Con rechazo, esos registros saldrían como OSR_GEO con su geographic_context (altitud leída, P, umbral y política) para que el herpetólogo vea por qué."
            : "Con penalización, P(altitud) solo baja el puntaje wv·s + wg·P(alt) + wm·P(háb); el hábitat no rescata una cota que la política marcó."}
          {" "}
          <Link href="/laboratorio" className="font-medium text-accent-ink hover:underline">El simulador</Link> aplica esta política foto por foto, solo sobre un release publicado.
        </p>
      </Card>

      {/* ── Contrato ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="mb-2"><CardTitle>Lo que recibirá el compilador (F23)</CardTitle></CardHeader>
        <pre className="max-h-64 overflow-auto rounded-md bg-surface-subtle p-3 text-[11px] leading-relaxed">
          {JSON.stringify(
            {
              subregion: subregionId,
              osr_validado: validada ? { por: osr.validacion!.por, fecha: osr.validacion!.fecha } : null,
              species_catalog: ev.especies.slice(0, 2).map((s) => ({ taxon_id: s.species.taxonId, rejection_tau: +s.tauCos.toFixed(4), tau_kind: "cosine_similarity" })),
              genus_nodes: ev.generos.slice(0, 1).map((g) => ({ genus_id: g.id, rejection_tau_genus: +g.tauEfectivo.toFixed(4), tau_kind: "cosine_similarity" })),
              family_nodes: ev.familias.slice(0, 1).map((f) => ({ family_id: f.id, rejection_tau_family: +f.tauEfectivo.toFixed(4), tau_kind: "cosine_similarity" })),
              cryptic_clusters: ev.clusters.map((c) => ({ cluster_id: c.clusterId, epsilon_reconstruction: +c.epsilonEfectivo.toFixed(4) })),
              context: { umbral_geo: osr.config.umbralGeo, politica_geo: osr.config.politicaGeo },
              calibracion: { cobertura: osr.config.cobertura, alpha: osr.config.alpha, comparacion_mahalanobis: { percentil: osr.config.percentilMahalanobis, far: +mahal.far.toFixed(4), kar: +mahal.kar.toFixed(4) } },
              "…": `${ev.especies.length} especies, ${ev.generos.length} géneros, ${ev.familias.length} familias`,
            },
            null,
            2
          )}
        </pre>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-label-tertiary">
          <CheckCircle2 size={11} /> Mahalanobis no viaja: su resultado queda como evidencia de la comparación.
        </p>
      </Card>
    </div>
  );
}

// ── Piezas ────────────────────────────────────────────────────────────────
type OsrHook = ReturnType<typeof useOsrStore>;
type NumKey = "cobertura" | "alpha" | "percentilMahalanobis" | "umbralGeo";

function Param({ label, k, osr, disabled, step, min, max }: { label: string; k: NumKey; osr: OsrHook; disabled: boolean; step: number; min: number; max: number }) {
  return (
    <div>
      <NumField key={`${k}:${osr.config[k]}`} label={label} value={osr.config[k]} step={step} min={min} max={max} disabled={disabled} onCommit={(v) => osr.set(k, v)} />
      <ManualTag manual={osr.manual[k] !== undefined} onReset={() => osr.reset(k)} disabled={disabled} propuesto={String(DEFAULT_OSR_CONFIG[k])} />
    </div>
  );
}

/** Se remonta con `key` cuando cambia el valor guardado; guarda al salir del campo o con Enter. */
function NumField({ label, value, step, min, max, disabled, onCommit }: { label: string; value: number; step: number; min: number; max: number; disabled?: boolean; onCommit: (v: number) => void }) {
  const shown = String(Number(value.toPrecision(4)));
  const [draft, setDraft] = useState(shown);
  const parsed = Number(draft);
  const valid = draft.trim() !== "" && Number.isFinite(parsed) && parsed >= min && parsed <= max;
  const commit = () => {
    if (valid && draft !== shown) onCommit(parsed);
    else if (!valid) setDraft(shown);
  };
  return (
    <Field label={label} error={!valid ? `Entre ${min} y ${max}` : undefined}>
      <Input
        type="number"
        step={step}
        min={min}
        max={max}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </Field>
  );
}

function ManualTag({ manual, onReset, disabled, propuesto }: { manual: boolean; onReset: () => void; disabled?: boolean; propuesto: string }) {
  if (!manual) return <p className="mt-1 text-[11px] text-label-tertiary">Propuesto por el worker</p>;
  return (
    <p className="mt-1 flex items-center gap-1 text-[11px] text-warning">
      Manual (propuesto {propuesto})
      <button type="button" className="inline-flex items-center gap-0.5 underline disabled:opacity-50" disabled={disabled} onClick={onReset}>
        <RotateCcw size={10} /> volver
      </button>
    </p>
  );
}

function NodeTable({ titulo, nodes, disabled, onSet }: { titulo: string; nodes: NodeThreshold[]; disabled: boolean; onSet: (id: string, v: number | null) => void }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium">{titulo}</p>
      <div className="max-h-72 overflow-y-auto">
        <Table>
          <THead><tr><TH>Nodo</TH><TH className="text-right">Especies</TH><TH className="text-right">τ calculado</TH><TH className="text-right">τ efectivo</TH><TH></TH></tr></THead>
          <TBody>
            {nodes.map((n) => (
              <TRow key={n.id}>
                <TD className="text-xs italic">{n.id}</TD>
                <TD className="text-right text-xs tabular-nums">{n.especies}</TD>
                <TD className={cn("text-right text-xs tabular-nums", !n.enRangoFuente && "text-warning")} title={n.enRangoFuente ? "Dentro del rango de la fuente" : "Fuera del rango hipotético de la fuente"}>
                  {num(n.tauCalc)}{!n.enRangoFuente && <AlertTriangle size={10} className="ml-1 inline" />}
                </TD>
                <TD className="w-28 text-right">
                  <input
                    key={`${n.id}:${n.tauEfectivo}`}
                    type="number"
                    step={0.005}
                    min={0}
                    max={1}
                    defaultValue={+n.tauEfectivo.toFixed(3)}
                    disabled={disabled}
                    aria-label={`τ efectivo de ${n.id}`}
                    className={cn("w-20 rounded border border-border bg-transparent px-1 py-0.5 text-right text-xs tabular-nums", n.tauManual !== null && "border-warning text-warning")}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v > 0 && v < 1 && Math.abs(v - n.tauEfectivo) > 1e-6) onSet(n.id, v);
                    }}
                  />
                </TD>
                <TD className="w-8">
                  {n.tauManual !== null && (
                    <button type="button" disabled={disabled} className="text-label-tertiary disabled:opacity-50" title="Volver al calculado" onClick={() => onSet(n.id, null)}>
                      <RotateCcw size={11} />
                    </button>
                  )}
                </TD>
              </TRow>
            ))}
          </TBody>
        </Table>
      </div>
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
