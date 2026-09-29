"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { cn, plural } from "@/lib/utils";
import { ServerPhotosCard } from "@/components/curation/server-photos-card";
import { getResumen, type DatasetEspecie } from "@/lib/dataset/dataset-client";
import { slugEspecie } from "@/lib/catalog/intake";


/** Curación en el servidor: lista de especies del dataset y sus fotos agrupadas por observación. */
export function CurationManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [especies, setEspecies] = useState<DatasetEspecie[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let cancelado = false;
    getResumen()
      .then((r) => !cancelado && setEspecies([...r.especies].sort((a, b) => a.nombre_cientifico.localeCompare(b.nombre_cientifico))))
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [recarga]);

  // Al entrar por un enlace (?especie=…) la especie elegida puede estar abajo en la lista.
  useEffect(() => {
    document.querySelector('nav [aria-current="true"], ul [aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [especies, searchParams]);

  if (error) return <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">No se pudo cargar el dataset: {error}</p>;
  if (!especies) return <p className="text-sm text-label-secondary">Cargando especies…</p>;

  // ?especie= acepta el id del servidor o el nombre en minúsculas con guiones (enlaces viejos).
  const param = searchParams.get("especie") ?? "";
  const selected =
    especies.find((e) => String(e.id) === param) ?? especies.find((e) => slugEspecie(e.nombre_cientifico) === param) ?? especies[0];
  const needle = busqueda.trim().toLowerCase();
  const visibles = needle
    ? especies.filter((e) => e.nombre_cientifico.toLowerCase().includes(needle) || e.familia.toLowerCase().includes(needle))
    : especies;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <Card className="h-fit p-0">
        <div className="border-b border-border p-3">
          <label className="relative block">
            <span className="sr-only">Buscar especie</span>
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-label-tertiary" />
            <Input value={busqueda} onChange={(ev) => setBusqueda(ev.target.value)} placeholder="Especie o familia" className="pl-8" />
          </label>
          <p className="mt-2 text-xs text-label-tertiary">
            {plural(especies.length, "especie", "especies")} en el servidor · {plural(especies.reduce((n, e) => n + e.fotos, 0), "foto", "fotos")}
          </p>
        </div>
        <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
          {visibles.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => router.push(`/curacion?especie=${e.id}`)}
                aria-current={e.id === selected?.id ? "true" : undefined}
                className={cn(
                  "flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-surface-subtle",
                  e.id === selected?.id && "bg-accent-wash/60"
                )}
              >
                <span className="text-sm italic text-label-primary">{e.nombre_cientifico}</span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-label-secondary">
                  <span className="tabular-nums">{plural(e.fotos, "foto", "fotos")}</span>
                  {e.excluidas > 0 && <Badge tone="danger" className="text-[10px]">{e.excluidas} excluidas</Badge>}
                  {!e.taxon_id && <Badge tone="warning" className="text-[10px]">Fuera del paquete</Badge>}
                </span>
              </button>
            </li>
          ))}
          {visibles.length === 0 && <li className="px-3 py-4 text-sm text-label-secondary">Ninguna especie coincide con «{busqueda}».</li>}
        </ul>
      </Card>

      <div className="space-y-4">
        {selected && <ServerPhotosCard key={selected.id} especie={selected} onCambio={() => setRecarga((n) => n + 1)} />}
      </div>
    </div>
  );
}
