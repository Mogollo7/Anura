"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Download, Images, MapPin, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { usePanelSession } from "@/lib/session/panel-session";
import { esEntrenable, MIN_FOTOS_ENTRENABLE, MIN_INDIVIDUOS } from "@/lib/dataset/reglas";
import { slugEspecie } from "@/lib/catalog/intake";
import {
  getContenidoLista,
  getFotos,
  getResumen,
  type ContenidoResumen,
  type DatasetEspecie,
  type DatasetFoto,
  type EspecieCreada,
} from "@/lib/dataset/dataset-client";
import { SpeciesIntakeForm } from "@/components/catalog/species-intake-form";
import { DeleteSpeciesDialog } from "@/components/catalog/delete-species-dialog";

const n = (v: number) => v.toLocaleString("es-CO");
const ESTADO_FICHA: Record<string, string> = { borrador: "Borrador", en_revision: "En revisión", publicada: "Publicada" };
const aviso = (e: DatasetEspecie) => ({ activas: e.fotos - e.excluidas, individuos: e.observaciones });

/**
 * Admin → Especies. Todo sale de dataset-service: la lista es dataset.especie (la misma que
 * curan Imágenes y Contenido) con sus cifras reales. Aquí también se crea y se corrige una
 * especie; no hay otro camino.
 */
export function ServerCatalog() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = usePanelSession();
  const puedeEditar = session.can("editarTaxonomia");
  const [especies, setEspecies] = useState<DatasetEspecie[] | null>(null);
  const [fichas, setFichas] = useState<Map<number, ContenidoResumen>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [recarga, setRecarga] = useState(0);
  const [formulario, setFormulario] = useState<{ especie: DatasetEspecie | null } | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [aBorrar, setABorrar] = useState<DatasetEspecie | null>(null);

  useEffect(() => {
    let cancelado = false;
    Promise.all([getResumen(), getContenidoLista().catch(() => ({ especies: [] as ContenidoResumen[] }))])
      .then(([r, c]) => {
        if (cancelado) return;
        setEspecies(r.especies);
        setFichas(new Map(c.especies.map((f) => [f.especie_id, f])));
        setError(null);
      })
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [recarga]);

  // Los enlaces de otras pantallas (?anadir=1) abren el formulario y limpian la dirección.
  useEffect(() => {
    if (searchParams.get("anadir") !== "1" || !especies) return;
    if (puedeEditar) setFormulario({ especie: null });
    router.replace("/catalogo");
  }, [searchParams, especies, puedeEditar, router]);

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

  const alGuardar = useCallback(
    (e: EspecieCreada, corregidas: number) => {
      const creada = !especies?.some((x) => x.id === e.id);
      setFormulario(null);
      setBusqueda("");
      setRecarga((v) => v + 1);
      setMensaje(
        creada
          ? `Creaste ${e.nombre_cientifico} (${e.taxon_id}).`
          : corregidas > 0
            ? `Guardaste ${e.nombre_cientifico} y corregiste la familia de ${corregidas === 1 ? "otra especie" : `otras ${corregidas} especies`} del género.`
            : `Guardaste los cambios de ${e.nombre_cientifico}.`
      );
      router.push(`/catalogo?especie=${e.id}`);
    },
    [especies, router]
  );

  const cabecera = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-2xl text-sm text-label-secondary">
        {puedeEditar ? "" : "Crear o corregir una especie necesita el permiso Editar taxonomía."}
      </p>
      <Button variant="primary" disabled={!puedeEditar || !especies} onClick={() => setFormulario({ especie: null })}>
        <Plus size={14} aria-hidden /> Añadir especie
      </Button>
    </div>
  );

  if (error) {
    return (
      <div className="space-y-4">
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          No se pudo cargar el catálogo: {error}. Recarga la página; si sigue igual, revisa que dataset-service esté encendido.
        </p>
      </div>
    );
  }
  if (!especies) return <p className="text-sm text-label-secondary">Cargando especies…</p>;

  const dialogo = (
    <SpeciesIntakeForm
      abierto={!!formulario}
      onCerrar={() => setFormulario(null)}
      especie={formulario?.especie ?? null}
      onGuardada={alGuardar}
      onAbrirExistente={(id) => {
        setFormulario(null);
        setBusqueda("");
        router.push(`/catalogo?especie=${id}`);
      }}
    />
  );

  const dialogoBorrar = (
    <DeleteSpeciesDialog
      especie={aBorrar}
      onCerrar={() => setABorrar(null)}
      onBorrada={(nombre) => {
        setABorrar(null);
        setRecarga((v) => v + 1);
        setMensaje(`Borraste ${nombre}.`);
        router.push("/catalogo");
      }}
    />
  );

  if (especies.length === 0) {
    return (
      <div className="space-y-6">
        {cabecera}
        <Card className="space-y-2 p-6">
          <h2 className="text-base font-semibold text-label-primary">Aún no hay especies</h2>
          <p className="max-w-xl text-sm text-label-secondary">
            Para empezar, añade la primera: escribe su nombre científico y su familia. Después podrás traer sus fotos desde
            Scraping o subirlas en Imágenes, y escribir su ficha en Contenido.
          </p>
        </Card>
        {dialogo}
        {dialogoBorrar}
      </div>
    );
  }

  const param = searchParams.get("especie") ?? "";
  const selected =
    especies.find((e) => String(e.id) === param || slugEspecie(e.nombre_cientifico) === param) ?? arbol[0]?.especies[0] ?? especies[0];
  const familias = new Set(especies.map((e) => e.familia)).size;
  const generos = new Set(especies.map((e) => e.genero)).size;
  const sinEntrenar = especies.filter((e) => !esEntrenable({ fotosActivas: aviso(e).activas, individuos: aviso(e).individuos })).length;
  const publicadas = [...fichas.values()].filter((f) => f.en_catalogo).length;
  const deSuGenero = (e: DatasetEspecie) => especies.filter((x) => x.genero === e.genero).length;

  return (
    <div className="space-y-6">
      {cabecera}
      {mensaje && (
        <p role="status" className="flex items-center justify-between gap-3 rounded-md bg-accent-wash px-3 py-2 text-sm text-accent-ink">
          {mensaje}
          <button type="button" className="text-xs underline" onClick={() => setMensaje(null)}>
            Cerrar
          </button>
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Kpi valor={familias} label="Familias" />
        <Kpi valor={generos} label="Géneros" />
        <Kpi valor={especies.length} label="Especies" />
        <Kpi valor={sinEntrenar} label="Aún no entrenan" tono={sinEntrenar ? "text-warning" : undefined} />
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
                        onClick={() => router.push(`/catalogo?especie=${e.id}`)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-subtle",
                          e.id === selected?.id && "bg-accent-wash/60"
                        )}
                      >
                        <span className="truncate italic text-label-primary">{e.nombre_cientifico}</span>
                        {e.fotos === 0 ? (
                          <Badge tone="neutral" className="shrink-0 text-[10px]">Sin fotos</Badge>
                        ) : (
                          !e.taxon_id && <Badge tone="warning" className="shrink-0 text-[10px]">Sin taxon_id</Badge>
                        )}
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
            unicaDeSuGenero={deSuGenero(selected) === 1}
            puedeEditar={puedeEditar}
            onEditar={() => setFormulario({ especie: selected })}
            onBorrar={() => setABorrar(selected)}
          />
        )}
      </div>
      {dialogo}
      {dialogoBorrar}
    </div>
  );
}

function Detalle({
  especie: e,
  ficha,
  unicaDeSuGenero,
  puedeEditar,
  onEditar,
  onBorrar,
}: {
  especie: DatasetEspecie;
  ficha?: ContenidoResumen;
  unicaDeSuGenero: boolean;
  puedeEditar: boolean;
  onEditar: () => void;
  onBorrar: () => void;
}) {
  const [fotos, setFotos] = useState<DatasetFoto[] | null>(null);
  useEffect(() => {
    let cancelado = false;
    if (e.fotos === 0) {
      setFotos([]);
      return;
    }
    getFotos(e.id, 0, 6, false, "activas")
      .then((r) => !cancelado && setFotos(r.fotos))
      .catch(() => !cancelado && setFotos([]));
    return () => {
      cancelado = true;
    };
  }, [e.id, e.fotos]);
  const { activas, individuos } = aviso(e);
  const entrena = esEntrenable({ fotosActivas: activas, individuos });

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
        <div className="flex flex-wrap items-center gap-1.5">
          {!e.taxon_id && <Badge tone="warning">Sin taxon_id: no sale en la app</Badge>}
          {unicaDeSuGenero && <Badge tone="warning">Única de su género</Badge>}
          {!entrena && <Badge tone="danger">Aún no entrena</Badge>}
          {puedeEditar && (
            <Button variant="outline" className="px-2.5 py-1 text-xs" onClick={onEditar}>
              <Pencil size={12} aria-hidden /> Editar nombre y familia
            </Button>
          )}
          {puedeEditar && (
            <Button variant="outline" className="px-2.5 py-1 text-xs text-danger" onClick={onBorrar}>
              <Trash2 size={12} aria-hidden /> Borrar
            </Button>
          )}
        </div>
      </div>

      {e.fotos === 0 ? (
        <div className="mb-4 space-y-3 rounded-md bg-surface-subtle p-4">
          <p className="text-sm font-medium text-label-primary">Esta especie todavía no tiene fotos.</p>
          <p className="text-sm text-label-secondary">
            El siguiente paso es traerlas: consíguelas en Scraping (iNaturalist y GBIF) o súbelas una a una en Imágenes.
            Para entrenar necesita al menos {MIN_FOTOS_ENTRENABLE} fotos activas de {MIN_INDIVIDUOS} individuos distintos.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/scraping"
              className="inline-flex items-center gap-1.5 rounded-md bg-cta-bg px-3 py-1.5 text-sm font-medium text-cta-fg hover:opacity-90"
            >
              <Download size={14} aria-hidden /> Conseguir fotos en Scraping
            </Link>
            <Link
              href={`/curacion?especie=${e.id}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-label-primary hover:bg-surface"
            >
              <Upload size={14} aria-hidden /> Subir fotos en Imágenes
            </Link>
          </div>
        </div>
      ) : fotos === null ? (
        <div className="mb-4 h-24 animate-pulse rounded-md bg-surface-subtle" />
      ) : fotos.length === 0 ? (
        <p className="mb-4 rounded-md bg-surface-subtle p-4 text-sm text-label-secondary">
          Todas sus fotos están excluidas. Revísalas en Imágenes si alguna debe volver.
        </p>
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

      <dl className="mb-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <Dato icono={Images} label="Fotos activas" valor={`${n(activas)} de ${n(e.fotos)}`} />
        <Dato icono={MapPin} label="Observaciones" valor={`${n(e.observaciones)} · ${n(e.con_coordenada)} fotos con coordenada`} />
        <Dato icono={Images} label="En la versión del dataset" valor={`${n(e.train)} entrenamiento · ${n(e.val)} validación · ${n(e.test)} prueba`} />
      </dl>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Link
          href={`/curacion?especie=${e.id}`}
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
