"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import { usePanelSession } from "@/lib/session/panel-session";
import { getCentroides, type LoteCentroides } from "@/lib/dataset/dataset-client";

const pct = (n: number | null) => (n == null ? "—" : `${(n * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`);

/** Lectura del lote M3: cascada medida en validación y pares que ArcFace sugiere, sin publicarlos. */
export function M3MethodCard({ foco }: { foco: "osr" | "adaptadores" | "validacion" }) {
  const session = usePanelSession();
  const [lote, setLote] = useState<LoteCentroides | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session.isReal) return;
    let cancelado = false;
    getCentroides()
      .then((r) => !cancelado && setLote(r))
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [session.isReal]);

  if (!session.isReal) {
    return (
      <Card>
        <p className="text-sm text-label-secondary">
          {session.cargando ? "Comprobando la sesión…" : "Inicia sesión para ver la medición del servidor."}{" "}
          {!session.cargando && (
            <Link href="/login" className="text-accent-ink underline decoration-dotted underline-offset-2">
              Iniciar sesión
            </Link>
          )}
        </p>
      </Card>
    );
  }

  const ev = lote?.experimento?.evaluacion;
  const sugerencias = lote?.sugerencias ?? [];

  return (
    <Card>
      <CardHeader className="mb-2">
        <CardTitle>
          {foco === "adaptadores" ? "Sugerencias de clúster" : foco === "validacion" ? "Medición en validación" : "Rechazo medido en validación"}
        </CardTitle>
      </CardHeader>
      {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {!lote && !error && <p className="text-sm text-label-secondary">Cargando…</p>}
      {lote && !ev && (
        <p className="text-sm text-label-secondary">
          Esta corrida todavía no tiene τ ni cascada. Recalcula en{" "}
          <Link href="/centroides" className="text-accent-ink underline decoration-dotted underline-offset-2">Centroides</Link>.
        </p>
      )}
      {ev && foco !== "adaptadores" && (
        <div className="space-y-3">
          <p className="text-xs text-label-secondary">
            {ev.n.toLocaleString("es-CO")} fotos de validación, que no entraron al centroide ni al τ (cobertura {(ev.cobertura * 100).toLocaleString("es-CO")} %).
            Una foto pasa a especie si su coseno llega al τ de esa especie; si no, a género; si no, a familia; si no, se rechaza.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="accent">Aceptadas en especie {pct(ev.kar)}</Badge>
            <Badge tone="neutral">De esas, la especie correcta {pct(ev.acierto_entre_aceptadas)}</Badge>
            <Badge tone="neutral">Rechazadas {ev.cascada.OSR_GLOBAL.toLocaleString("es-CO")}</Badge>
          </div>
          <Table>
            <THead>
              <tr><TH>Capa</TH><TH>Fotos</TH><TH>En el grupo correcto</TH></tr>
            </THead>
            <TBody>
              <TRow>
                <TD className="text-xs">Especie</TD>
                <TD className="text-xs tabular-nums">{ev.cascada.MATCH_SPECIES.toLocaleString("es-CO")}</TD>
                <TD className="text-xs tabular-nums">{ev.especie_correcta.toLocaleString("es-CO")}</TD>
              </TRow>
              <TRow>
                <TD className="text-xs">Género</TD>
                <TD className="text-xs tabular-nums">{ev.cascada.MATCH_GENUS.toLocaleString("es-CO")}</TD>
                <TD className="text-xs tabular-nums">{ev.genero_correcto.toLocaleString("es-CO")}</TD>
              </TRow>
              <TRow>
                <TD className="text-xs">Familia</TD>
                <TD className="text-xs tabular-nums">{ev.cascada.MATCH_FAMILY.toLocaleString("es-CO")}</TD>
                <TD className="text-xs tabular-nums">{ev.familia_correcta.toLocaleString("es-CO")}</TD>
              </TRow>
              <TRow>
                <TD className="text-xs">Rechazo</TD>
                <TD className="text-xs tabular-nums">{ev.cascada.OSR_GLOBAL.toLocaleString("es-CO")}</TD>
                <TD className="text-xs text-label-tertiary">—</TD>
              </TRow>
            </TBody>
          </Table>
          <p className="text-xs text-label-tertiary">{ev.far_motivo} {ev.altitud_motivo} {ev.regional_motivo}</p>
        </div>
      )}
      {lote && foco !== "osr" && (
        <div className={foco === "validacion" ? "mt-4" : ""}>
          {foco === "adaptadores" && (
            <p className="mb-3 text-xs text-label-secondary">
              Pares con coseno alto entre centroides, o que la validación confunde. ArcFace entrena dos prototipos con margen angular
              y se mide en las fotos de validación. No crea el clúster: lo arma el herpetólogo.
            </p>
          )}
          {sugerencias.length === 0 ? (
            <p className="text-sm text-label-secondary">Ningún par pasa el umbral de parecido o de confusión en esta corrida.</p>
          ) : (
            <Table>
              <THead>
                <tr><TH>Par</TH><TH>Coseno</TH><TH>Confusiones en validación</TH><TH>Acierto antes</TH><TH>Acierto con ArcFace</TH></tr>
              </THead>
              <TBody>
                {sugerencias.map((s) => (
                  <TRow key={`${s.a}-${s.b}`}>
                    <TD className="text-xs italic">{s.a} · {s.b}</TD>
                    <TD className="text-xs tabular-nums">{s.coseno.toFixed(3)}</TD>
                    <TD className="text-xs tabular-nums">{s.confusiones} / {s.n_val}</TD>
                    <TD className="text-xs tabular-nums">{pct(s.acc_antes)}</TD>
                    <TD className="text-xs tabular-nums">{pct(s.acc_despues)}</TD>
                  </TRow>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      )}
    </Card>
  );
}
