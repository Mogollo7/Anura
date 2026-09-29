import { Suspense } from "react";
import { SpeciesSheetManager } from "@/components/species-sheet/species-sheet-manager";

export default function FichaEspeciePage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Ficha de especie</h1>
        <p className="text-sm text-label-secondary">
          El perfil ecológico y los pesos propuestos se calculan con las observaciones válidas de cada especie: altitud
          por observación, sustrato etiquetado y morfos declarados en Imágenes. Lo que decide una persona (rango de
          altitud, pesos y LRC) se guarda en el servidor, con quién y cuándo.
        </p>
      </div>
      <Suspense fallback={null}>
        <SpeciesSheetManager />
      </Suspense>
    </div>
  );
}
