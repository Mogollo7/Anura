import { Shuffle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ParConfundido } from "@/lib/dataset/osr";

export function SimilarSpeciesList({ pares }: { pares: ParConfundido[] }) {
  if (pares.length === 0) {
    return <p className="text-sm text-label-secondary">Ninguna foto de test cayó en otra especie del paquete.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {pares.map((p) => (
        <li key={`${p.a.especie_id}~${p.b.especie_id}`} className="flex items-center justify-between gap-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <Shuffle size={13} className="shrink-0 text-label-tertiary" />
            <span
              title={`${p.a.nombre_cientifico} ↔ ${p.b.nombre_cientifico}`}
              className="min-w-0 truncate italic text-label-primary"
            >
              {p.a.nombre_cientifico} ↔ {p.b.nombre_cientifico}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {p.mismoGenero && <Badge tone="warning">mismo género</Badge>}
            <span className="tabular-nums text-xs text-label-secondary">{p.fotos} {p.fotos === 1 ? "foto" : "fotos"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
