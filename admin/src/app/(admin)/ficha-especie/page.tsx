import { Suspense } from "react";
import { getAllSpecies } from "@/lib/mock/catalog";
import { SpeciesSheetManager } from "@/components/species-sheet/species-sheet-manager";

export default function FichaEspeciePage() {
  const species = getAllSpecies();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Ficha de especie</h1>
        <p className="text-sm text-label-secondary">
          Los cinco bloques que alimentan al worker: taxonomía, ficha ecológica, morfos, LRC y calibración. El perfil
          ecológico y los pesos propuestos salen de las observaciones curadas de esta especie, no de una tabla escrita
          a mano.
        </p>
      </div>
      <Suspense fallback={null}>
        <SpeciesSheetManager species={species} />
      </Suspense>
    </div>
  );
}
