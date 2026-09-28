"use client";

import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { usePanelSession } from "@/lib/session/panel-session";
import type { FamilyNode, SpeciesDetail, SpeciesEntry } from "@/lib/mock/catalog";
import { CatalogExplorer } from "@/components/catalog/catalog-explorer";
import { ServerCatalog } from "@/components/catalog/server-catalog";

/** Con sesión, las especies del servidor; sin sesión, el catálogo de partida exportado (antioquia-real.json). */
export function CatalogoView({
  tree,
  species,
  detailsById,
}: {
  tree: FamilyNode[];
  species: SpeciesEntry[];
  detailsById: Record<string, SpeciesDetail>;
}) {
  const session = usePanelSession();
  if (session.cargando) return <p className="text-sm text-label-secondary">Comprobando la sesión…</p>;
  if (session.isReal) {
    return (
      <Suspense fallback={null}>
        <ServerCatalog mockSpecies={species} detailsById={detailsById} />
      </Suspense>
    );
  }
  const generos = tree.reduce((n, f) => n + f.generos.length, 0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:max-w-xl sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xl font-semibold text-label-primary">{tree.length}</p>
          <p className="text-xs text-label-secondary">Familias</p>
        </Card>
        <Card className="p-4">
          <p className="text-xl font-semibold text-label-primary">{generos}</p>
          <p className="text-xs text-label-secondary">Géneros</p>
        </Card>
        <Card className="p-4">
          <p className="text-xl font-semibold text-label-primary">{species.length}</p>
          <p className="text-xs text-label-secondary">Especies</p>
        </Card>
        <Card className="p-4">
          <p className="text-xl font-semibold text-danger">{species.filter((s) => s.lowData).length}</p>
          <p className="text-xs text-label-secondary">Pocos datos</p>
        </Card>
      </div>
      <CatalogExplorer tree={tree} initialSpecies={species[0]} detailsById={detailsById} />
    </div>
  );
}
