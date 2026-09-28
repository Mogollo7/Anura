import { MapPin, Mountain, Ruler, Palette, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SpeciesEntry, SpeciesDetail } from "@/lib/mock/catalog";

export function SpeciesDetailPanel({
  species,
  detail,
}: {
  species: SpeciesEntry;
  detail: SpeciesDetail;
}) {
  return (
    <Card>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-label-tertiary">
            <span className="font-mono">{species.taxonId}</span> · {species.familia} · {species.genero}
          </p>
          <h2 className="text-lg font-semibold italic text-label-primary">{species.especie}</h2>
        </div>
        <div className="flex gap-1.5">
          {species.orphanGenus && <Badge tone="warning">Género huérfano</Badge>}
          {species.lowData && <Badge tone="danger">Pocos datos (&lt;70 individuos)</Badge>}
        </div>
      </div>

      <div className="aspect-[16/9] w-full rounded-md bg-surface-subtle flex items-center justify-center text-xs text-label-tertiary mb-4">
        Sin imágenes cargadas en simulación
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm mb-4">
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-label-tertiary">
            <MapPin size={12} /> Distribución
          </p>
          <div className="flex flex-wrap gap-1">
            {detail.distribucion.map((d) => (
              <Badge key={d} tone="neutral">{d}</Badge>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-label-tertiary">
            <Mountain size={12} /> Rango altitudinal
          </p>
          <p className="text-label-primary">{detail.altitudMin} – {detail.altitudMax} m s.n.m.</p>
        </div>
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-label-tertiary">
            <Ruler size={12} /> Longitud rostro-cloaca
          </p>
          <p className="text-label-primary">{detail.svlMin} – {detail.svlMax} mm</p>
        </div>
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-label-tertiary">
            <Palette size={12} /> Morfología
          </p>
          <p className="text-label-primary capitalize">{detail.patron}</p>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-label-tertiary">
          <ExternalLink size={12} /> Fuentes
        </p>
        <div className="flex flex-wrap gap-4 text-sm text-label-secondary">
          <span><span className="font-medium text-label-primary">{detail.iNaturalistObs}</span> observaciones en iNaturalist</span>
          <span><span className="font-medium text-label-primary">{detail.gbifRecords}</span> registros en GBIF</span>
        </div>
        <p className="mt-2 text-[11px] text-label-tertiary">
          El filtro quality_grade de iNaturalist selecciona por consenso de identificación, no por
          nitidez de la imagen — mejora pendiente en el scraper para especies con abundancia de datos.
        </p>
      </div>
    </Card>
  );
}
