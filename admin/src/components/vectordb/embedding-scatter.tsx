"use client";

import { useEffect, useMemo, useState } from "react";
import { getProyeccion, type Proyeccion } from "@/lib/vectores/vectores-client";
import { num, pct } from "./sesion-requerida";

const SIZE = 520;
const PAD = 24;
/** Colores del sistema, uno por familia en el orden en que llegan (no hay familias escritas aquí). */
const PALETA = [
  "var(--sys-blue)",
  "var(--sys-orange)",
  "var(--sys-purple)",
  "var(--sys-teal)",
  "var(--sys-red)",
  "var(--sys-yellow)",
  "var(--green-dark)",
  "var(--accent-ink)",
];

/**
 * Proyección 2D calculada en el servidor (PCA por iteración de potencia sobre una muestra fija).
 * Aquí solo se dibuja: escala igual en los dos ejes para no deformar distancias.
 */
export function EmbeddingScatter({ encoder, vectores, experimentoId }: { encoder: string; vectores: number; experimentoId: number | null }) {
  const [datos, setDatos] = useState<Proyeccion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [foco, setFoco] = useState<number | null>(null);

  useEffect(() => {
    let cancelado = false;
    getProyeccion(encoder)
      .then((d) => !cancelado && (setDatos(d), setError(null)))
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [encoder, vectores, experimentoId]);

  const vista = useMemo(() => {
    if (!datos || !datos.puntos.length) return null;
    const familias = [...new Set(datos.especies.map((e) => e.familia))];
    const colorFamilia = new Map(familias.map((f, i) => [f, PALETA[i % PALETA.length]]));
    const especie = new Map(datos.especies.map((e) => [e.id, e]));
    const color = (id: number) => colorFamilia.get(especie.get(id)?.familia ?? "") ?? "var(--label-tertiary)";
    const todos = [...datos.puntos, ...datos.centroides];
    const xs = todos.map((p) => p.x);
    const ys = todos.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const rango = Math.max(x1 - x0, y1 - y0) || 1;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const k = (SIZE - PAD * 2) / rango;
    const px = (x: number) => SIZE / 2 + (x - cx) * k;
    const py = (y: number) => SIZE / 2 - (y - cy) * k;
    return { familias, colorFamilia, especie, color, px, py };
  }, [datos]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!datos) return <p className="text-sm text-label-secondary">Calculando la proyección…</p>;
  if (!vista) {
    return (
      <p className="text-sm text-label-secondary">
        Hacen falta al menos 3 vectores sin exclusión para proyectar. Crea un trabajo de extracción en Worker.
      </p>
    );
  }
  const { familias, colorFamilia, especie, color, px, py } = vista;
  const nombre = (id: number) => especie.get(id)?.nombre_cientifico ?? `Especie ${id}`;

  return (
    <div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full" style={{ maxHeight: 560 }} role="img" aria-label="Proyección 2D de los vectores">
        <rect x={0} y={0} width={SIZE} height={SIZE} rx={8} className="fill-surface-subtle" />
        {datos.puntos.map((p) => {
          const dim = foco !== null && foco !== p.especie_id;
          return (
            <circle
              key={p.sha256}
              cx={px(p.x)}
              cy={py(p.y)}
              r={foco === p.especie_id ? 3.4 : 2.4}
              fill={color(p.especie_id)}
              opacity={dim ? 0.12 : 0.75}
              onMouseEnter={() => setFoco(p.especie_id)}
              onMouseLeave={() => setFoco(null)}
            >
              <title>{`${nombre(p.especie_id)} · foto ${p.sha256}…${p.observacion_id ? ` · individuo ${p.observacion_id}` : ""}`}</title>
            </circle>
          );
        })}
        {datos.centroides.map((c) => {
          const x = px(c.x);
          const y = py(c.y);
          return (
            <g
              key={c.especie_id}
              opacity={foco !== null && foco !== c.especie_id ? 0.3 : 1}
              onMouseEnter={() => setFoco(c.especie_id)}
              onMouseLeave={() => setFoco(null)}
            >
              <path d={`M ${x} ${y - 6} L ${x + 6} ${y} L ${x} ${y + 6} L ${x - 6} ${y} Z`} fill={color(c.especie_id)} stroke="var(--background)" strokeWidth={1.5} />
              <title>{`Centroide · ${nombre(c.especie_id)}`}</title>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-label-tertiary">
        {familias.map((f) => (
          <span key={f} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: colorFamilia.get(f) }} />
            {f}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-label-tertiary">
        PCA de {num(datos.muestra)} de {num(vectores)} vectores (hasta {datos.por_especie} por especie, elegidos por sha256, así que
        siempre es la misma muestra), dos ejes por iteración de potencia en el servidor: explican{" "}
        {pct(datos.varianza?.[0] ?? null)} y {pct(datos.varianza?.[1] ?? null)} de la varianza.
        {datos.centroides.length > 0 ? ` ◆ centroide de cada especie, lote #${datos.experimento_id}.` : " Sin centroides calculados todavía."}{" "}
        Pasa el cursor sobre un punto para ver su especie.
      </p>
    </div>
  );
}
