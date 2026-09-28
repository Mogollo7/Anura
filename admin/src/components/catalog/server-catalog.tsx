"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Images, MapPin, Mountain, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import type { SpeciesDetail, SpeciesEntry } from "@/lib/mock/catalog";
import {
  getContenidoLista,
  getFotos,
  getResumen,
  type ContenidoResumen,
  type DatasetEspecie,
  type DatasetFoto,
} from "@/lib/dataset/dataset-client";

const slug = (nombre: string) => nombre.trim().toLowerCase().replace(/\s+/g, "-");
const n = (v: number) => v.toLocaleString("es-CO");
const ESTADO_FICHA: Record<string, string> = { borrador: "Borrador", en_revision: "En revisión", publicada: "Publicada" };

/**
 * Especies del servidor (dataset-service): las mismas que curan Imágenes y Contenido, con sus
 * cifras reales. Lo que todavía no está en el servidor (altitud p5–p95 y registros GBIF de
 * antioquia-real.json) se muestra con su origen dicho.
 */
export function ServerCatalog({ mockSpecies, detailsById }: { mockSpecies: SpeciesEntry[]; detailsById: Record<string, SpeciesDetail> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [especies, setEspecies] = useState<DatasetEspecie[] | null>(null);
  const [fichas, setFichas] = useState<Map<number, ContenidoResumen>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    let cancelado = false;
    Promise.all([getResumen(), getContenidoLista().catch(() => ({ especies: [] as ContenidoResumen[] }))])
      .then(([r, c]) => {
        if (cancelado) return;
        setEspecies(r.especies);
        setFichas(new Map(c.especies.map((f) => [f.especie_id, f])));
      })
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, []);

  const arbol = useMemo(() => {
    const needle = busqueda.trim().toLowerCase();
    const lista = (especies ?? []).filter(
      (e) => !needle || e.nombre_cientifico.toLowerCase().includes(needle) || e.familia.toLowerCase().includes(needle)
    );
    const porFamilia = new Map<string, DatasetEspecie[]>();
    for (const e of lista) porFamilia.set(e.familia, [...(porFamilia.get(e.familia) ?? []), e]);
    return [...porFamilia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([familia, es]) => ({ familia, especies: es.sort((a, b) => a.nombre_cientifico.localeCompare(b.nombre_cientifico)) }));
  }, [especies, busqueda]);

  // Al entrar por un enlace (?especie=…) la especie elegida puede estar abajo en la lista.
  useEffect(() => {
    document.querySelector('nav [aria-current="true"], ul [aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [especies, searchParams]);

  if (error) return <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">No se pudo cargar el catálogo: {error}</p>;
  if (!especies) return <p className="text-sm text-label-secondary">Cargando especies…</p>;

  const param = searchParams.get("especie") ?? "";
  const selected = especies.find((e) => String(e.id) === param || slug(e.nombre_cientifico) === param) ?? arbol[0]?.especies[0] ?? especies[0];
  const familias = new Set(especies.map((e) => e.familia)).size;
  const generos = new Set(especies.map((e) => e.genero)).size;
  const fueraPaquete = especies.filter((e) => !e.taxon_id).length;
  const publicadas = [...fichas.values()].filter((f) => f.en_catalogo).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Kpi valor={familias} label="Familias" />
        <Kpi valor={generos} label="Géneros" />
        <Kpi valor={especies.length} label="Especies en el servidor" />
        <Kpi valor={fueraPaquete} label="Fuera del paquete (en revisión)" tono={fueraPaquete ? "text-warning" : undefined} />
        <Kpi valor={publicadas} label={`Fichas publicadas de ${especies.length}`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit p-0">
          <div className="border-b border-border p-3">
            <label className="relative block">
              <span className="sr-only">Buscar especie</span>
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-label-tertiary" />
              <Input value={busqueda} onChange={(ev) => setBusqueda(ev.target.value)} placeholder="Especie o familia" className="pl-8" />
            </label>
          </div>
          <nav className="max-h-[70vh] overflow-y-auto p-2" aria-label="Especies por familia">
            {arbol.map(({ familia, especies: es }) => (
              <div key={familia} className="mb-2">
                <p className="flex items-center justify-between px-2 py-1 text-xs font-semibold text-label-secondary">
                  {familia} <span className="tabular-nums text-label-tertiary">{es.length}</span>
                </p>
                <ul>
                  {es.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        aria-current={e.id === selected?.id ? "true" : undefined}
                        onClick={() => router.push(`/catalogo?especie=${slug(e.nombre_cientifico)}`)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-subtle",
                          e.id === selected?.id && "bg-accent-wash/60"
                        )}
                      >
                        <span className="truncate italic text-label-primary">{e.nombre_cientifico}</span>
                        {!e.taxon_id && <Badge tone="warning" className="shrink-0 text-[10px]">Revisión</Badge>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {arbol.length === 0 && <p className="px-2 py-4 text-sm text-label-secondary">Ninguna especie coincide con «{busqueda}».</p>}
          </nav>
        </Card>

        {selected && (
          <Detalle
            key={selected.id}
            especie={selected}
            ficha={fichas.get(selected.id)}
            mock={mockSpecies.find((m) => m.especie.toLowerCase() === selected.nombre_cientifico.toLowerCase())}
            detailsById={detailsById}
          />
        )}
      </div>
    </div>
  );
}

function Detalle({
  especie: e,
  ficha,
  mock,
  detailsById,
}: {
  especie: DatasetEspecie;
  ficha?: ContenidoResumen;
  mock?: SpeciesEntry;
  detailsById: Record<string, SpeciesDetail>;
}) {
  const [fotos, setFotos] = useState<DatasetFoto[] | null>(null);
  useEffect(() => {
    let cancelado = false;
    getFotos(e.id, 0, 6, false, "activas")
      .then((r) => !cancelado && setFotos(r.fotos))
      .catch(() => !cancelado && setFotos([]));
    return () => {
      cancelado = true;
    };
  }, [e.id]);
  const d = mock ? detailsById[mock.id] : undefined;
  const activas = e.fotos - e.excluidas;
  const tieneAltitud = d && (d.altitudMin > 0 || d.altitudMax > 0);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-label-tertiary">
            {e.taxon_id && <span className="font-mono">{e.taxon_id} · </span>}
            {e.familia} · {e.genero}
          </p>
          <h2 className="text-lg font-semibold italic text-label-primary">{e.nombre_cientifico}</h2>
          {ficha?.nombre_comun && <p className="text-sm text-label-secondary">{ficha.nombre_comun}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {!e.taxon_id && <Badge tone="warning">Fuera del paquete: en revisión</Badge>}
          {mock?.orphanGenus && <Badge tone="warning">Única de su género</Badge>}
          {mock?.lowData && <Badge tone="danger">Pocos datos (menos de 70 individuos)</Badge>}
        </div>
      </div>

      {fotos === null ? (
        <div className="mb-4 h-24 animate-pulse rounded-md bg-surface-subtle" />
      ) : fotos.length === 0 ? (
        <p className="mb-4 rounded-md bg-surface-subtle p-4 text-sm text-label-secondary">Esta especie todavía no tiene fotos activas en el servidor.</p>
      ) : (
        <ul className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {fotos.map((f) => (
            <li key={f.sha256}>
              {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de MinIO que vence en 10 min */}
              <img src={f.url} alt={`${e.nombre_cientifico}, ${f.archivo_original}`} loading="lazy" className="aspect-square w-full rounded-md bg-surface-subtle object-cover" />
            </li>
          ))}
        </ul>
      )}

      <dl className="mb-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <Dato icono={Images} label="Fotos activas" valor={`${n(activas)} de ${n(e.fotos)}`} />
        <Dato icono={MapPin} label="Observaciones" valor={`${n(e.observaciones)} · ${n(e.con_coordenada)} fotos con coordenada`} />
        <Dato icono={Images} label="En el manifiesto" valor={`${n(e.train)} entrenamiento · ${n(e.val)} validación · ${n(e.test)} prueba`} />
        {tieneAltitud && <Dato icono={Mountain} label="Altitud de los registros (p5–p95)" valor={`${n(d.altitudMin)}–${n(d.altitudMax)} m`} />}
      </dl>
      {d && (d.gbifRecords > 0 || d.iNaturalistObs > 0) && (
        <p className="mb-4 text-xs text-label-tertiary">
          Registros sin foto usados para altitud y subregiones: {n(d.gbifRecords)} de GBIF y {n(d.iNaturalistObs)} de iNaturalist (records_v1, exportado
          al Admin; todavía no está en el servidor).
        </p>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Link
          href={`/curacion?especie=${slug(e.nombre_cientifico)}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-label-primary hover:bg-surface-subtle"
        >
          <Images size={14} /> Curar fotos
        </Link>
        <Link
          href={`/contenido?especie=${e.id}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-label-primary hover:bg-surface-subtle"
        >
          <BookOpen size={14} /> Ficha pública
          <Badge tone={ficha?.en_catalogo ? "accent" : "neutral"} className="text-[10px]">
            {ficha?.en_catalogo ? `v${ficha.version} en la app` : ESTADO_FICHA[ficha?.estado ?? "borrador"]}
          </Badge>
        </Link>
      </div>
    </Card>
  );
}

function Dato({ icono: Icono, label, valor }: { icono: typeof Images; label: string; valor: string }) {
  return (
    <div>
      <dt className="mb-1 flex items-center gap-1.5 text-xs font-medium text-label-tertiary">
        <Icono size={12} /> {label}
      </dt>
      <dd className="text-label-primary">{valor}</dd>
    </div>
  );
}

function Kpi({ valor, label, tono }: { valor: number; label: string; tono?: string }) {
  return (
    <Card className="p-4">
      <p className={cn("text-xl font-semibold", tono ?? "text-label-primary")}>{n(valor)}</p>
      <p className="text-xs text-label-secondary">{label}</p>
    </Card>
  );
}
