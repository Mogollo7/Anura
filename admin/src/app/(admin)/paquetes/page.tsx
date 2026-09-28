import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, Smartphone } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubregionesFold } from "@/components/packages/subregiones-fold";
import { RegionsManager } from "@/components/packages/regions-manager";
import { REAL, REAL_SPECIES } from "@/lib/data/real";

function mb(bytes: number) {
  return `${(bytes / 1_048_576).toLocaleString("es-CO", { maximumFractionDigits: 1 })} MB`;
}

/**
 * Regiones: qué paquete corre hoy en el teléfono y cómo se reparte Antioquia.
 * El asistente por departamento se eliminó: un paquete nuevo sale del ciclo
 * Conseguir → Limpiar → Procesar → Resultado y se compila en Release.
 */
export default function PaquetesPage() {
  const tel = REAL.paqueteTelefono;
  const enPaquete = REAL_SPECIES.filter((s) => s.estadoVisual === "VISUAL_ENABLED");
  const enRevision = REAL_SPECIES.filter((s) => s.estadoVisual !== "VISUAL_ENABLED");

  return (
    <div className="space-y-6">
      {/* Con sesión: departamentos y subregiones desde el servidor (se agregan y se dividen aquí). */}
      <RegionsManager />
      <Card>
        <CardHeader className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <CardTitle>
            <Smartphone size={16} className="mr-1.5 inline" aria-hidden />
            Paquete instalado en el teléfono
          </CardTitle>
          <Badge tone="accent">Antioquia v{tel.info.package_version}</Badge>
        </CardHeader>
        <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xl font-semibold text-label-primary">{enPaquete.length}</p>
            <p className="text-xs text-label-secondary">especies que reconoce ({enRevision.length} más en revisión)</p>
          </div>
          <div>
            <p className="text-xl font-semibold text-label-primary">{Number(tel.info.reference_vectors).toLocaleString("es-CO")}</p>
            <p className="text-xs text-label-secondary">vectores de referencia de 512</p>
          </div>
          <div>
            <p className="text-xl font-semibold text-label-primary">{mb(tel.bytes + tel.openSet.bytes)}</p>
            <p className="text-xs text-label-secondary">paquete + modelo de rechazo</p>
          </div>
          <div>
            <p className="text-xl font-semibold text-label-primary">{tel.info.created_on}</p>
            <p className="text-xs text-label-secondary">fecha de compilación</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-label-secondary">
          Cómo decide hoy: {tel.decision}. Rechaza con {tel.openSet.metodo}. El sqlite de identificación y el catálogo
          JSON de cada subregión ya se descargan desde el servidor. Un release compilado en esta pantalla sigue siendo
          un JSON de este navegador: el teléfono no lo instala.
        </p>
        <p className="mt-1 font-mono text-xs text-label-secondary">{tel.archivo}</p>
        <Link
          href="/compilador"
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-cta-bg px-3.5 py-2 text-sm font-medium text-cta-fg hover:opacity-90"
        >
          Crear un release nuevo
          <ArrowRight size={15} aria-hidden />
        </Link>
      </Card>

      <Suspense fallback={null}>
        <SubregionesFold />
      </Suspense>
    </div>
  );
}
