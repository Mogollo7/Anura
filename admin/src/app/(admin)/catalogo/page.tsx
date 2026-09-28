import { getCatalogTree, getAllSpecies, getSpeciesDetail } from "@/lib/mock/catalog";
import { CatalogoView } from "@/components/catalog/catalogo-view";
import { SpeciesIntakeForm } from "@/components/catalog/species-intake-form";

export default function CatalogoPage() {
  const tree = getCatalogTree();
  const species = getAllSpecies();
  const detailsById = Object.fromEntries(species.map((s) => [s.id, getSpeciesDetail(s.id)]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Especies</h1>
        <p className="max-w-3xl text-sm text-label-secondary">
          Todas las especies del dataset, por familia. Desde aquí se va a curar sus fotos o a editar su ficha pública.
        </p>
      </div>
      <CatalogoView tree={tree} species={species} detailsById={detailsById} />
      <details className="rounded-lg border border-border bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium text-label-primary">
          Añadir una especie nueva <span className="font-normal text-label-tertiary">· simulado, se guarda en este navegador</span>
        </summary>
        <div className="mt-4">
          <SpeciesIntakeForm />
        </div>
      </details>
    </div>
  );
}
