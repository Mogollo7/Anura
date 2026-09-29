"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MapPinned, ShieldAlert, ShieldCheck } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import { DataState } from "@/components/app-data/data-state";
import { Motivos } from "@/components/release/motivos";
import { SubregionPicker, subregionInicial } from "@/components/release/subregion-picker";
import { cn } from "@/lib/utils";
import { useAppResource } from "@/lib/app-data/app-client";
import { fecha, releaseApi, type ResumenSubregion, type Validacion } from "@/lib/release/release-client";

/**
 * Validación técnica: el servidor dice si el paquete de una subregión se puede compilar y, si no,
 * por qué y dónde se arregla. Aquí no se calcula nada.
 */
export function TechnicalValidationConsole() {
  const resumen = useAppResource(releaseApi.resumen);
  return (
    <DataState value={resumen.value} onRetry={resumen.reload}>
      {(subregiones) =>
        subregiones.length ? (
          <Detalle subregiones={subregiones} />
        ) : (
          <Card className="flex items-start gap-3 p-6">
            <MapPinned size={18} className="mt-0.5 text-label-secondary" aria-hidden />
            <div className="text-sm text-label-secondary">
              <p className="font-medium text-label-primary">Aún no hay subregiones para validar</p>
              Para empezar, agrega un departamento y divídelo en subregiones en{" "}
              <Link href="/paquetes" className="text-accent-ink underline">Regiones</Link>.
            </div>
          </Card>
        )
      }
    </DataState>
  );
}

function Detalle({ subregiones }: { subregiones: ResumenSubregion[] }) {
  const [id, setId] = useState<number | null>(() => subregionInicial(subregiones));
  const [v, setV] = useState<Validacion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id == null) return;
    let vivo = true;
    releaseApi
      .validacion(id)
      .then((r) => { if (vivo) { setV(r); setError(null); } })
      .catch((e: Error) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, [id]);

  const actual = v && v.subregion.id === id ? v : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SubregionPicker subregiones={subregiones} value={id} onChange={(n) => { setId(n); setError(null); }} />
        {actual && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
              actual.lista ? "bg-accent-wash text-accent-ink" : "bg-danger/10 text-danger"
            )}
          >
            {actual.lista ? <ShieldCheck size={14} aria-hidden /> : <ShieldAlert size={14} aria-hidden />}
            {actual.lista ? "Lista para compilar" : "No está lista para compilar"}
          </span>
        )}
      </div>

      {error && <Card className="text-sm text-danger">{error}</Card>}
      {!actual && !error && <Card className="p-6 text-sm text-label-secondary">Revisando la subregión en el servidor…</Card>}

      {actual && (
        <>
          <Card>
            {actual.lista ? (
              <p className="text-sm text-label-secondary">
                Todo lo que exige el paquete está al día. Compílalo en{" "}
                <Link href="/compilador" className="text-accent-ink underline">Release</Link>.
              </p>
            ) : (
              <>
                <p className="mb-2 text-sm font-medium text-label-primary">Falta resolver esto antes de compilar</p>
                <Motivos items={actual.motivos} tipo="motivo" />
              </>
            )}
            {actual.avisos.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-label-tertiary">No bloquea, pero conviene saberlo</p>
                <Motivos items={actual.avisos} tipo="aviso" />
              </div>
            )}
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader className="mb-1"><CardTitle>Encoder del teléfono</CardTitle></CardHeader>
              {actual.encoder ? (
                <p className="text-xs text-label-secondary">
                  {actual.encoder.archivo} · {actual.encoder.dimension} dimensiones
                  <span className="block font-mono text-label-tertiary">{actual.encoder.sha256.slice(0, 16)}…</span>
                </p>
              ) : (
                <p className="text-xs text-danger">Sin registrar.</p>
              )}
            </Card>
            <Card>
              <CardHeader className="mb-1">
                <CardTitle>Centroides</CardTitle>
                {actual.centroides && (
                  <Badge tone={actual.centroides.vigente ? "accent" : "warning"}>{actual.centroides.vigente ? "al día" : "desactualizados"}</Badge>
                )}
              </CardHeader>
              <p className="text-xs text-label-secondary">
                {actual.centroides
                  ? `Corrida ${actual.centroides.experimento_id} · ${fecha(actual.centroides.creado)}`
                  : "Todavía no se calcularon."}
                {actual.dataset_version && <span className="block text-label-tertiary">Dataset {actual.dataset_version.nombre}</span>}
              </p>
            </Card>
            <Card>
              <CardHeader className="mb-1">
                <CardTitle>Umbral OSR</CardTitle>
                <Badge tone={actual.osr ? "accent" : "neutral"}>{actual.osr ? "validado" : "sin validar"}</Badge>
              </CardHeader>
              <p className="text-xs text-label-secondary">
                {actual.osr ? `τ ${actual.osr.tau.toLocaleString("es-CO", { maximumFractionDigits: 4 })} · ${fecha(actual.osr.validado)}` : "Una persona lo valida en OSR."}
              </p>
            </Card>
          </div>

          <Card>
            <CardHeader className="mb-2">
              <CardTitle>Especies de la subregión</CardTitle>
              <Badge tone="neutral">{actual.especies.filter((e) => e.incluida).length} entran al paquete</Badge>
            </CardHeader>
            {actual.especies.length === 0 ? (
              <p className="text-sm text-label-secondary">
                Ninguna especie tiene individuos de entrenamiento ubicados en esta subregión. Sube fotos con coordenada en{" "}
                <Link href="/curacion" className="text-accent-ink underline">Imágenes</Link> y recalcula los centroides.
              </p>
            ) : (
              <>
                <Table>
                  <THead>
                    <tr>
                      <TH>Especie</TH>
                      <TH>Paquete</TH>
                      <TH className="text-right">Fotos activas</TH>
                      <TH className="text-right">Individuos</TH>
                      <TH className="text-right">Aquí</TH>
                      <TH>Centroide</TH>
                      <TH className="text-right">Sin vector</TH>
                      <TH>Pesos</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {actual.especies.map((e) => (
                      <TRow key={e.especie_id}>
                        <TD className="text-xs italic">{e.nombre_cientifico}</TD>
                        <TD>
                          <Badge tone={e.incluida ? "accent" : "neutral"}>
                            {e.incluida ? "entra" : !e.entrenable ? "bajo el piso" : !e.taxon_id ? "sin taxon_id" : "sin centroide"}
                          </Badge>
                        </TD>
                        <TD className="text-right text-xs tabular-nums">{e.fotos_activas}</TD>
                        <TD className="text-right text-xs tabular-nums">{e.individuos}</TD>
                        <TD className="text-right text-xs tabular-nums">{e.individuos_subregion}</TD>
                        <TD className="text-xs">{e.centroide_propio ? "regional" : "global prestado"}</TD>
                        <TD className={cn("text-right text-xs tabular-nums", e.incluida && e.sin_vector > 0 && "text-danger")}>{e.sin_vector || "—"}</TD>
                        <TD className="text-xs">
                          {e.contexto?.pesos
                            ? `${e.contexto.pesos.wv} / ${e.contexto.pesos.wg} / ${e.contexto.pesos.wm}`
                            : e.incluida ? "sin pesos" : "—"}
                        </TD>
                      </TRow>
                    ))}
                  </TBody>
                </Table>
                <p className="mt-2 text-[11px] text-label-tertiary">
                  Entra al paquete una especie con al menos {actual.reglas.min_fotos_entrenable} fotos activas y {actual.reglas.min_individuos} individuos,
                  con taxon_id del catálogo y centroide. «Aquí» son sus individuos de entrenamiento dentro de la subregión: con menos de{" "}
                  {actual.reglas.min_individuos_regional}, el paquete usa su centroide global. Pesos: visual / geográfico / microhábitat de la Ficha.
                </p>
                <p className="mt-2 text-xs text-label-secondary">
                  Morfos de esta subregión:{" "}
                  {actual.morfos.length
                    ? actual.morfos.map((mo) => `${mo.nombre} (${mo.calculado ? "con centroide" : "usa el de su especie"})`).join(" · ")
                    : "ninguno declarado"}
                  . Clústeres aceptados:{" "}
                  {actual.clusteres.length ? actual.clusteres.map((c) => c.nombre).join(" · ") : "ninguno"}.
                </p>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
