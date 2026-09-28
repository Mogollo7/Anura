import { Shuffle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SimilarSpeciesPair } from "@/lib/mock/validation";
import { speciesName } from "@/lib/mock/species-names";

export function SimilarSpeciesList({ pairs }: { pairs: SimilarSpeciesPair[] }) {
  if (pairs.length === 0) {
    return <p className="text-sm text-label-secondary">Sin pares confundibles relevantes en este paquete.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {pairs.map((p) => (
        <li key={`${p.aId}~${p.bId}`} className="flex items-center justify-between gap-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <Shuffle size={13} className="shrink-0 text-label-tertiary" />
            <span
              title={`${speciesName(p.aId)} ↔ ${speciesName(p.bId)}`}
              className="min-w-0 truncate italic text-label-primary"
            >
              {speciesName(p.aId)} ↔ {speciesName(p.bId)}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {p.sameGenus && <Badge tone="warning">mismo género</Badge>}
            <span className="tabular-nums text-xs text-label-secondary">{p.count} confusiones</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
