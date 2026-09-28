import { Suspense } from "react";
import { ContentManager } from "@/components/content/content-manager";

export default function ContenidoPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Contenido</h1>
        <p className="text-sm text-label-secondary">
          La ficha pública: lo que lee la gente en la app y la web. Es contenido, no modelo — corregir un nombre común
          no recompila centroides. Un campo vacío no se muestra; todo dato escrito a mano necesita su fuente. Se
          publica con el aval del herpetólogo.
        </p>
      </div>
      <Suspense fallback={null}>
        <ContentManager />
      </Suspense>
    </div>
  );
}
