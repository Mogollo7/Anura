import { Suspense } from "react";
import { ServerCatalog } from "@/components/catalog/server-catalog";

export default function CatalogoPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Especies</h1>
        <p className="max-w-3xl text-sm text-label-secondary">
          Todas las especies del dataset, por familia. Toda especie empieza aquí, con su nombre científico y su familia: así la ven
          Imágenes, Contenido y los paquetes. Desde aquí se cura sus fotos o se edita su ficha pública.
        </p>
      </div>
      <Suspense fallback={null}>
        <ServerCatalog />
      </Suspense>
    </div>
  );
}
