"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import type { FamilyNode, SpeciesEntry, SpeciesDetail } from "@/lib/mock/catalog";
import { CatalogTree } from "./catalog-tree";
import { SpeciesDetailPanel } from "./species-detail";

export function CatalogExplorer({
  tree,
  initialSpecies,
  detailsById,
}: {
  tree: FamilyNode[];
  initialSpecies: SpeciesEntry;
  detailsById: Record<string, SpeciesDetail>;
}) {
  const [selected, setSelected] = useState<SpeciesEntry>(initialSpecies);

  function handleSelect(species: SpeciesEntry) {
    setSelected(species);
  }

  const detail = detailsById[selected.id];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
      <Card className="max-h-[70vh] overflow-y-auto p-3">
        <CatalogTree tree={tree} selectedId={selected.id} onSelect={handleSelect} />
      </Card>

      <SpeciesDetailPanel species={selected} detail={detail} />
    </div>
  );
}
