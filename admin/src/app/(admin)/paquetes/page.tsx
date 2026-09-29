import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { RegionsManager } from "@/components/packages/regions-manager";

/**
 * Regiones: departamentos y subregiones del servidor. El panel no sabe qué
 * paquete tiene cada teléfono; eso se publica en Release y se lista en Actualizaciones.
 */
export default function PaquetesPage() {
  return (
    <div className="space-y-6">
      <RegionsManager />
      <Card>
        <CardHeader>
          <CardTitle>Paquetes que puede instalar el teléfono</CardTitle>
        </CardHeader>
        <p className="text-sm text-label-secondary">
          Este panel no sabe qué paquete tiene cada teléfono. La app descarga lo que esté publicado en Release.
        </p>
        <Link
          href="/actualizaciones"
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-cta-bg px-3.5 py-2 text-sm font-medium text-cta-fg hover:opacity-90"
        >
          Ver paquetes publicados
          <ArrowRight size={15} aria-hidden />
        </Link>
      </Card>
    </div>
  );
}
