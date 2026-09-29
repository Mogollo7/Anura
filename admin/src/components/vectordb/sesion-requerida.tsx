"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";

/** Lo que muestran Worker, DB vectorial, Centroides y Clústeres sin sesión del panel. */
export function SesionRequerida({ cargando, que }: { cargando: boolean; que: string }) {
  return (
    <Card>
      <p className="text-sm text-label-secondary">
        {cargando ? "Comprobando la sesión…" : `Inicia sesión para ver ${que}.`}{" "}
        {!cargando && (
          <Link href="/login" className="text-accent-ink underline decoration-dotted underline-offset-2">
            Iniciar sesión
          </Link>
        )}
      </p>
    </Card>
  );
}

export const num = (n: number) => n.toLocaleString("es-CO");

export const pct = (x: number | null | undefined, decimales = 1) =>
  x == null ? "—" : `${(x * 100).toLocaleString("es-CO", { maximumFractionDigits: decimales })} %`;

export function hace(segundos: number) {
  if (segundos < 60) return `hace ${segundos} s`;
  if (segundos < 3600) return `hace ${Math.round(segundos / 60)} min`;
  if (segundos < 86400) return `hace ${Math.round(segundos / 3600)} h`;
  return `hace ${Math.round(segundos / 86400)} d`;
}

export function Barra({ valor, total }: { valor: number; total: number }) {
  const ancho = total > 0 ? Math.min(100, (valor / total) * 100) : 0;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle"
      role="progressbar"
      aria-valuenow={valor}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <div className="h-full rounded-full bg-accent-ink" style={{ width: `${ancho}%` }} />
    </div>
  );
}
