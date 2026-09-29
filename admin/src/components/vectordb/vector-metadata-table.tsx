"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import { getMetadatosVectores, type EspecieVectores, type FilaVector } from "@/lib/vectores/vectores-client";
import { num } from "./sesion-requerida";

const POR_PAGINA = 25;
const PARTICION: Record<string, string> = { train: "Train", val: "Val", test: "Test" };

export function VectorMetadataTable({ encoder, especies }: { encoder: string; especies: EspecieVectores[] }) {
  const [especie, setEspecie] = useState("");
  const [offset, setOffset] = useState(0);
  const [datos, setDatos] = useState<{ total: number; filas: FilaVector[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    getMetadatosVectores({ encoder, especie_id: especie ? Number(especie) : null, offset, limit: POR_PAGINA })
      .then((d) => !cancelado && (setDatos(d), setError(null)))
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [encoder, especie, offset]);

  return (
    <div className="space-y-3">
      <Field label="Especie">
        <Select value={especie} onChange={(e) => { setEspecie(e.target.value); setOffset(0); }} className="max-w-sm">
          <option value="">Todas</option>
          {especies.map((e) => (
            <option key={e.id} value={e.id}>{e.nombre_cientifico} ({num(e.vectores)})</option>
          ))}
        </Select>
      </Field>
      {error && <p className="text-sm text-danger">{error}</p>}
      {!datos ? (
        !error && <p className="text-sm text-label-secondary">Cargando…</p>
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>Foto (sha256)</TH>
                <TH>Especie</TH>
                <TH>Individuo</TH>
                <TH>Fuente</TH>
                <TH>Licencia</TH>
                <TH>Partición</TH>
                <TH>Trabajo</TH>
                <TH>Norma</TH>
                <TH>Vector (primeras 6 de 512)</TH>
              </tr>
            </THead>
            <TBody>
              {datos.filas.map((r) => (
                <TRow key={r.sha256}>
                  <TD className="font-mono text-xs">
                    {r.sha256.slice(0, 12)}…
                    {r.excluida && <Badge tone="warning" className="ml-1 text-[10px]">excluida</Badge>}
                  </TD>
                  <TD className="text-xs italic">{r.especie}</TD>
                  <TD className="font-mono text-xs text-label-secondary">{r.observacion_id ?? "—"}</TD>
                  <TD className="text-xs">{r.fuente === "inaturalist" ? "iNaturalist" : r.fuente === "manual" ? "Subida a mano" : "—"}</TD>
                  <TD className="text-xs">
                    {r.licencia ? <Badge tone={r.licencia.startsWith("cc") ? "neutral" : "warning"}>{r.licencia}</Badge> : <span className="text-label-tertiary">sin dato</span>}
                  </TD>
                  <TD className="text-xs">{r.particion ? PARTICION[r.particion] : <span className="text-label-tertiary">fuera del manifiesto</span>}</TD>
                  <TD className="text-xs tabular-nums">{r.trabajo_id ? `#${r.trabajo_id}` : "—"}</TD>
                  <TD className="text-xs tabular-nums">{r.norma.toFixed(4)}</TD>
                  <TD className="font-mono text-[11px] text-label-tertiary">[{r.inicio.map((x) => x.toFixed(3)).join(", ")}, …]</TD>
                </TRow>
              ))}
            </TBody>
          </Table>
          <div className="flex items-center justify-between text-xs text-label-tertiary">
            <span>
              {datos.total ? `${num(offset + 1)}–${num(Math.min(offset + POR_PAGINA, datos.total))} de ${num(datos.total)} vectores` : "Sin vectores"}
            </span>
            <span className="flex gap-2">
              <Button variant="outline" className="text-xs" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - POR_PAGINA))}>
                Anteriores
              </Button>
              <Button variant="outline" className="text-xs" disabled={offset + POR_PAGINA >= datos.total} onClick={() => setOffset(offset + POR_PAGINA)}>
                Siguientes
              </Button>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
