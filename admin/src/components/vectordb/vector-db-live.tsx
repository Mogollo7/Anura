"use client";

import { useMemo } from "react";
import Link from "next/link";
import { catalogVectorTotal, subregionVectorCollections } from "@/lib/mock/vector-db";
import { ENCODER } from "@/lib/worker/encoder";
import { auditarIntake } from "@/lib/catalog/intake";
import { useIntakeStore } from "@/lib/catalog/intake-store";
import { VectorDbExplorer } from "./vector-db-explorer";

export function VectorDbLive() {
  const { especies } = useIntakeStore();
  const base = useMemo(() => subregionVectorCollections(), []);
  const catalogo = useMemo(() => catalogVectorTotal(), []);
  const extra = especies.reduce((n, s) => n + auditarIntake(s).vectores, 0);
  const collections = base.map((c) => {
    const add = especies.filter((s) => s.subregionId === c.packageId).reduce((n, s) => n + auditarIntake(s).vectores, 0);
    return { ...c, totalVectores: c.totalVectores + add };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">DB vectorial</h1>
        <p className="max-w-2xl text-sm text-label-secondary">
          Cada subregión cuenta los vectores con la membresía curada y el tope del worker, encoder {ENCODER.id} de {ENCODER.dimensiones} dimensiones.
          El catálogo completo son {catalogo.toLocaleString("es-CO")} vectores. No es la suma de las subregiones: una especie puede estar en varias.
          {extra > 0 ? ` Las especies que añadiste suman ${extra.toLocaleString("es-CO")} vectores, solo en su región.` : ""}
        </p>
        <p className="text-sm">
          <Link href="/ia" className="font-medium text-accent-ink hover:underline">Worker que los escribe</Link>
          <span className="text-label-tertiary"> · </span>
          <Link href="/catalogo#anadir" className="font-medium text-accent-ink hover:underline">Añadir especie</Link>
        </p>
      </div>
      <VectorDbExplorer collections={collections} />
    </div>
  );
}
