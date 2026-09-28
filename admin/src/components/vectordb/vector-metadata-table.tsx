import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import type { VectorMetadataRow } from "@/lib/mock/vector-db";
import { speciesName } from "@/lib/mock/species-names";

export function VectorMetadataTable({ rows, total }: { rows: VectorMetadataRow[]; total: number }) {
  return (
    <div className="space-y-2">
      <Table>
        <THead>
          <tr>
            <TH>Vector</TH>
            <TH>Especie</TH>
            <TH>Individuo</TH>
            <TH>Fuente</TH>
            <TH>Licencia</TH>
            <TH>Vector (primeras 6 de 512)</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TRow key={r.vectorId}>
              <TD className="font-mono text-xs">{r.vectorId}</TD>
              <TD className="italic">{speciesName(r.speciesId)}</TD>
              <TD className="font-mono text-xs text-label-secondary">{r.individuoId}</TD>
              <TD>{r.fuente}</TD>
              <TD>
                <Badge tone={r.licencia === "sin resolver" ? "warning" : "neutral"}>{r.licencia}</Badge>
              </TD>
              <TD className="font-mono text-[11px] text-label-tertiary">[{r.preview.join(", ")}, …]</TD>
            </TRow>
          ))}
        </TBody>
      </Table>
      <p className="text-[11px] text-label-tertiary">
        Vista previa de {rows.length} de {total.toLocaleString("es-CO")} vectores de la tabla.
      </p>
    </div>
  );
}
