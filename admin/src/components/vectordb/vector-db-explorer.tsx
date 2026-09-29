"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import type { ResumenVectores } from "@/lib/vectores/vectores-client";
import { EmbeddingScatter } from "./embedding-scatter";
import { VectorMetadataTable } from "./vector-metadata-table";
import { IndexPanel } from "./index-panel";
import { num } from "./sesion-requerida";

export function VectorDbExplorer({ resumen }: { resumen: ResumenVectores }) {
  const encoder = resumen.encoder!;
  const conVector = resumen.especies.filter((e) => e.vectores > 0);
  const faltan = resumen.fotos - encoder.vectores;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-label-primary">{encoder.nombre}</h2>
            <p className="font-mono text-xs text-label-secondary">
              {encoder.archivo} · sha256 {encoder.sha256.slice(0, 16)}…
            </p>
          </div>
          <div className="flex gap-5 text-right text-sm">
            <Cifra valor={num(encoder.vectores)} etiqueta="vectores" />
            <Cifra valor={num(conVector.length)} etiqueta="especies con vector" />
            <Cifra valor={faltan > 0 ? num(faltan) : "0"} etiqueta="fotos sin vector" />
          </div>
        </div>
        {faltan > 0 && (
          <p className="mt-2 text-xs text-label-secondary">
            Hay {num(faltan)} fotos sin vector con este encoder. Créales un trabajo en{" "}
            <Link href="/ia" className="text-accent-ink underline decoration-dotted underline-offset-2">Worker</Link>.
          </p>
        )}
      </Card>

      {encoder.vectores === 0 ? (
        <Card>
          <p className="text-sm text-label-secondary">
            Este encoder todavía no tiene vectores. Crea un trabajo de extracción en{" "}
            <Link href="/ia" className="text-accent-ink underline decoration-dotted underline-offset-2">Worker</Link>.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
            <Card>
              <CardHeader><CardTitle>Embeddings (proyección 2D)</CardTitle></CardHeader>
              <EmbeddingScatter encoder={encoder.sha256} vectores={encoder.vectores} experimentoId={resumen.experimento?.id ?? null} />
            </Card>
            <Card>
              <CardHeader><CardTitle>Índice</CardTitle></CardHeader>
              {resumen.indice && <IndexPanel indice={resumen.indice} encoder={encoder} />}
            </Card>
          </div>

          <Card>
            <CardHeader className="mb-2">
              <CardTitle>Vectores por especie</CardTitle>
              <span className="text-xs text-label-tertiary">Partición de la versión vigente</span>
            </CardHeader>
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <THead>
                  <tr>
                    <TH>Especie</TH><TH>Familia</TH><TH>Fotos</TH><TH>Vectores</TH><TH>Individuos</TH>
                    <TH>Train</TH><TH>Val</TH><TH>Test</TH><TH>Excluidos</TH>
                  </tr>
                </THead>
                <TBody>
                  {resumen.especies.map((e) => (
                    <TRow key={e.id}>
                      <TD className="text-xs italic">{e.nombre_cientifico}</TD>
                      <TD className="text-xs text-label-secondary">{e.familia}</TD>
                      <TD className="text-xs tabular-nums">{num(e.fotos)}</TD>
                      <TD className={e.vectores < e.fotos ? "text-xs tabular-nums text-warning" : "text-xs tabular-nums"}>{num(e.vectores)}</TD>
                      <TD className="text-xs tabular-nums">{num(e.individuos)}</TD>
                      <TD className="text-xs tabular-nums">{num(e.train)}</TD>
                      <TD className="text-xs tabular-nums">{num(e.val)}</TD>
                      <TD className="text-xs tabular-nums">{num(e.test)}</TD>
                      <TD className="text-xs tabular-nums">{e.excluidas ? num(e.excluidas) : "—"}</TD>
                    </TRow>
                  ))}
                </TBody>
              </Table>
            </div>
            <p className="mt-2 text-[11px] text-label-tertiary">
              Los vectores de fotos excluidas en Imágenes se quedan guardados, pero no entran a centroides ni a la matriz.
              Train/Val/Test cuenta solo las fotos que ya tienen vector.
            </p>
          </Card>

          <Card>
            <CardHeader><CardTitle>Metadatos de vectores</CardTitle></CardHeader>
            <VectorMetadataTable encoder={encoder.sha256} especies={conVector} />
          </Card>
        </>
      )}
    </div>
  );
}

function Cifra({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div>
      <p className="font-semibold tabular-nums text-label-primary">{valor}</p>
      <p className="text-xs text-label-secondary">{etiqueta}</p>
    </div>
  );
}
