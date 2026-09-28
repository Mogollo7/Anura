"use client";

import { useMemo, useState } from "react";
import type { EmbeddingPoint, VectorCollection } from "@/lib/mock/vector-db";
import { familyColor } from "@/lib/mock/vector-db";
import { speciesName, SPECIES_BY_ID } from "@/lib/mock/species-names";

const SIZE = 520;
const PAD = 24;

function project(v: number) {
  // v vive aproximadamente en [-1.4, 1.4] (radio máx. ~0.9 + dispersión)
  return PAD + ((v + 1.4) / 2.8) * (SIZE - PAD * 2);
}

export function EmbeddingScatter({
  collection,
  points,
}: {
  collection: VectorCollection;
  points: EmbeddingPoint[];
}) {
  const [hoverSpecies, setHoverSpecies] = useState<string | null>(null);

  const families = useMemo(() => Array.from(new Set(collection.especies.map((s) => s.familia))), [collection]);

  return (
    <div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full" style={{ maxHeight: 560 }}>
        <rect x={0} y={0} width={SIZE} height={SIZE} rx={8} className="fill-surface-subtle" />
        {points.map((p) => {
          const sp = SPECIES_BY_ID.get(p.speciesId);
          const color = sp ? familyColor(sp.familia) : "#8E8E93";
          const active = hoverSpecies === p.speciesId;
          const dim = hoverSpecies !== null && !active;
          const cx = project(p.x);
          const cy = project(p.y);

          if (p.isCentroid) {
            return (
              <g
                key={p.id}
                onMouseEnter={() => setHoverSpecies(p.speciesId)}
                onMouseLeave={() => setHoverSpecies(null)}
                opacity={dim ? 0.35 : 1}
              >
                <path
                  d={`M ${cx} ${cy - 6} L ${cx + 6} ${cy} L ${cx} ${cy + 6} L ${cx - 6} ${cy} Z`}
                  fill={color}
                  stroke="var(--background)"
                  strokeWidth={1.5}
                />
                <title>{`Centroide · ${speciesName(p.speciesId)}`}</title>
              </g>
            );
          }

          return (
            <circle
              key={p.id}
              cx={cx}
              cy={cy}
              r={active ? 3.4 : 2.4}
              fill={color}
              opacity={dim ? 0.15 : 0.75}
              onMouseEnter={() => setHoverSpecies(p.speciesId)}
              onMouseLeave={() => setHoverSpecies(null)}
            >
              <title>{speciesName(p.speciesId)}</title>
            </circle>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-label-tertiary">
        {families.map((f) => (
          <span key={f} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: familyColor(f) }} />
            {f}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-label-tertiary">
        Proyección 2D ilustrativa del espacio de 512 dimensiones (equivalente a una vista PCA/UMAP) — la
        cercanía refleja similitud de género/familia, no coordenadas reales. ◆ marca el centroide de cada
        especie. Muestra representativa, no 1:1 con la tabla.
      </p>
    </div>
  );
}
