import { Suspense } from "react";
import { getAllSpecies } from "@/lib/mock/catalog";
import { CurationManager } from "@/components/curation/curation-manager";
import { PhotoSourcesCard } from "@/components/curation/photo-sources-card";

export default function CuracionPage() {
  const species = getAllSpecies();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Curación</h1>
        <p className="max-w-3xl text-sm text-label-secondary">
          Revisa las fotos de cada especie. Excluir una foto la saca del entrenamiento; invalidar una observación saca
          todas sus fotos. Siempre con motivo, y nada se borra: todo se puede revertir.
        </p>
      </div>
      <Suspense fallback={null}>
        <CurationManager species={species} />
      </Suspense>
      <details className="rounded-lg border border-border bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium text-label-primary">Cómo llegan las fotos al servidor</summary>
        <div className="mt-4">
          <PhotoSourcesCard />
        </div>
      </details>
    </div>
  );
}
