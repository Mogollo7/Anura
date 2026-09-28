import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { REAL_COMPARISON } from "@/lib/data/real";

const pct = (v: number) => `${(v * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;

type Fila = { etiqueta: string; viejo: number; nuevo: number; mejor: "mas" | "menos"; nota: string };

/**
 * Resultado MEDIDO con los vectores reales: paquete del teléfono (k-NN + Mahalanobis)
 * contra el paquete que arma el creador del Admin (centroides + tres capas), con las
 * mismas fotos. Sale de evaluation/admin_v2_comparison/compare_packages.py.
 */
export function RealComparisonCard({ compacta = false }: { compacta?: boolean }) {
  const c = REAL_COMPARISON;
  if (!c) return null;
  const n = c.nuevo.completo_tres_capas;
  const viejoEquivocada = c.viejo.kar - c.viejo.aceptadas_y_correctas;
  const filas: Fila[] = [
    { etiqueta: "Especie correcta", viejo: c.viejo.aceptadas_y_correctas, nuevo: n.especie_correcta, mejor: "mas", nota: "fotos de especies del paquete" },
    { etiqueta: "Especie equivocada", viejo: viejoEquivocada, nuevo: n.especie_equivocada, mejor: "menos", nota: "responde con otra especie" },
    { etiqueta: "Desconocida con nombre inventado", viejo: c.viejo.far, nuevo: n.far, mejor: "menos", nota: "especie que el paquete no trae, aceptada como una que sí" },
    { etiqueta: "Desconocida con respuesta segura", viejo: c.viejo.desconocidas_respuesta_segura, nuevo: n.desconocidas_respuesta_segura, mejor: "mas", nota: "rechazo, género o familia en vez de una especie" },
  ];
  const mbViejo = c.tamano.viejo_bytes / 1_048_576;
  const kbNuevo = c.tamano.nuevo_vectores_y_matrices_bytes_fp16 / 1024;

  return (
    <Card>
      <CardHeader className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Prueba con los datos reales de Antioquia</CardTitle>
        <Badge tone="accent">medido · {c.fecha}</Badge>
      </CardHeader>
      <p className="mb-4 text-sm text-label-secondary">
        Mismas {c.datos.prueba_conocidas} fotos de prueba de las 30 especies y {c.datos.desconocidas} fotos de{" "}
        {c.datos.especies_desconocidas.length} especies que el paquete no trae. El nuevo equivoca menos la especie y
        acierta igual; todavía nombra una especie en 3 de cada 4 desconocidas.
      </p>

      <div className="space-y-3" role="list" aria-label="Paquete del teléfono contra paquete del Admin">
        {filas.map((f) => {
          const gana = f.mejor === "mas" ? f.nuevo > f.viejo : f.nuevo < f.viejo;
          return (
            <div key={f.etiqueta} role="listitem" className="grid gap-1 sm:grid-cols-[220px_1fr] sm:items-center">
              <div>
                <p className="text-sm font-medium text-label-primary">{f.etiqueta}</p>
                {!compacta && <p className="text-xs text-label-secondary">{f.nota}</p>}
              </div>
              <div className="space-y-1">
                {[
                  { quien: "Teléfono hoy", v: f.viejo, cls: "bg-label-secondary/60" },
                  { quien: "Creador del Admin", v: f.nuevo, cls: gana ? "bg-accent-tint" : "bg-warning" },
                ].map((b) => (
                  <div key={b.quien} className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-xs text-label-secondary">{b.quien}</span>
                    <div className="h-2.5 flex-1 rounded-full bg-surface-subtle" aria-hidden>
                      <div className={`h-2.5 rounded-full ${b.cls}`} style={{ width: `${Math.max(1, b.v * 100)}%` }} />
                    </div>
                    <span className="w-14 shrink-0 text-right text-xs tabular-nums text-label-primary">{pct(b.v)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 border-t border-border pt-3 text-sm sm:grid-cols-3">
        <p>
          <span className="font-semibold tabular-nums text-label-primary">
            {c.viejo.auroc.toFixed(3)} → {n.auroc.toFixed(3)}
          </span>
          <span className="block text-xs text-label-secondary">AUROC: separar conocidas de desconocidas (1 es perfecto)</span>
        </p>
        <p>
          <span className="font-semibold tabular-nums text-label-primary">
            {mbViejo.toFixed(1)} MB → {kbNuevo.toFixed(0)} KB
          </span>
          <span className="block text-xs text-label-secondary">lo que descarga el teléfono (sin el encoder)</span>
        </p>
        <p>
          <span className="font-semibold tabular-nums text-label-primary">{n.estados_conocidas.OSR_GEO ?? 0} fotos</span>
          <span className="block text-xs text-label-secondary">buenas rechazadas por la altitud: el corte de 0,05 cuesta</span>
        </p>
      </div>
      {!compacta && (
        <p className="mt-3 text-xs text-label-secondary">
          Clústeres sugeridos por la confusión real (falta que el herpetólogo los confirme):{" "}
          {c.clusters.map((k) => `${k.id} (${k.miembros.length} especies)`).join(", ")}. Script:{" "}
          <span className="font-mono">evaluation/admin_v2_comparison/compare_packages.py</span>.
        </p>
      )}
    </Card>
  );
}
