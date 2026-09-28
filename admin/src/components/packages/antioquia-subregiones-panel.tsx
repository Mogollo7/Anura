import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { REAL } from "@/lib/data/real";
import {
  ANTIOQUIA_SUBREGIONES,
  PISO_LABEL,
  pisosFor,
  speciesForSubregion,
} from "@/lib/packages/antioquia-subregiones";

/**
 * La unidad real que se versiona y se descarga es la SUBREGIÓN, no el
 * departamento (Decisiones de Escalabilidad #8). Esta tabla es la vista
 * territorial real; el paquete "Antioquia" de la tabla de arriba sigue
 * siendo, por ahora, el release trackeado a nivel departamento — ver la nota
 * de auditoría F16 en el vault sobre por qué esa migración queda pendiente.
 */
export function AntioquiaSubregionesPanel({ destacada = null }: { destacada?: string | null }) {
  return (
    <Card>
      <CardHeader className="mb-3">
        <CardTitle>Las 9 subregiones de Antioquia</CardTitle>
      </CardHeader>
      <p className="mb-3 text-xs text-label-tertiary">
        Cada subregión es un release propio. Una especie entra si tiene al menos un registro real (GBIF o iNaturalist)
        en alguno de sus municipios. Las especies comunes aparecen en varias subregiones, así que la suma de la
        columna no da el total de Antioquia.
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {ANTIOQUIA_SUBREGIONES.map((sub) => {
          const especies = speciesForSubregion(sub.id);
          const real = REAL.subregiones.find((r) => r.id === sub.id);
          return (
            <details id={sub.id} key={sub.id} open={destacada === sub.id ? true : undefined} className="rounded-md border border-border p-3">
              <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm font-medium">
                <span>
                  {sub.numero} · {sub.nombre}
                </span>
                <Badge tone={especies.length ? "accent" : "neutral"}>{especies.length} en el paquete</Badge>
              </summary>
              <div className="mt-2 space-y-1.5 text-xs text-label-secondary">
                <p>
                  {sub.cotaMin}–{sub.cotaMax} m
                  {real && ` · ${real.observaciones.toLocaleString("es-CO")} observaciones de iNaturalist · ${real.especiesObservadas} especies observadas (Chao1 ${Math.round(real.chao1)})`}
                </p>
                <p className="text-label-secondary">{especies.map((e) => e.especie).join(", ") || "Ninguna especie del paquete tiene registros aquí."}</p>
                <div className="flex flex-wrap gap-1">
                  {pisosFor(sub).map((p) => (
                    <Badge key={p} tone="neutral" className="text-[11px]">
                      {PISO_LABEL[p]}
                    </Badge>
                  ))}
                </div>
                <p className="text-label-secondary">{sub.lecturaEcologica}</p>
                <p className="text-label-secondary">Municipios: {sub.municipios.join(", ")}</p>
              </div>
            </details>
          );
        })}
      </div>
    </Card>
  );
}
