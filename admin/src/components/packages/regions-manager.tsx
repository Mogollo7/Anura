"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, MapPinned, Paintbrush, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { cn, plural } from "@/lib/utils";
import { usePanelSession } from "@/lib/session/panel-session";
import {
  activarRegion,
  agregarRegion,
  asignarMunicipios,
  asignarEspecieSubregion,
  borrarSubregion,
  crearSubregion,
  getEspeciesSubregion,
  getRegion,
  getRegiones,
  quitarEspecieSubregion,
  quitarRegion,
  renombrarSubregion,
  type Departamento,
  type EspecieSubregion,
  type Poligono,
  type RegionDetalle,
  type Subregion,
} from "@/lib/dataset/dataset-client";

/** Un color por subregión (categórico, legible en tema claro y oscuro). */
const PALETA = [
  "hsl(152 55% 42%)", "hsl(28 80% 55%)", "hsl(210 65% 55%)", "hsl(330 55% 55%)", "hsl(48 85% 50%)",
  "hsl(265 50% 60%)", "hsl(185 60% 42%)", "hsl(0 60% 55%)", "hsl(95 45% 45%)", "hsl(230 40% 65%)",
  "hsl(15 45% 45%)", "hsl(300 30% 50%)",
];
const color = (i: number) => PALETA[i % PALETA.length];
const n = (v: number) => v.toLocaleString("es-CO");

// ── Proyección simple (equirectangular corregida por la latitud media): basta para ver formas ──

type Proyeccion = { path: (p: Poligono) => string; ancho: number; alto: number };

function proyectar(todos: Poligono[], ancho: number): Proyeccion {
  let [minLon, minLat, maxLon, maxLat] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of todos) for (const [lon, lat] of p[0]) {
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  }
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const s = ancho / ((maxLon - minLon) * kx || 1);
  const alto = (maxLat - minLat) * s;
  const xy = ([lon, lat]: [number, number]) => `${((lon - minLon) * kx * s).toFixed(1)} ${((maxLat - lat) * s).toFixed(1)}`;
  return {
    ancho,
    alto,
    path: (p) => p.map((anillo) => `M${anillo.map(xy).join("L")}Z`).join(""),
  };
}

const poligonosDe = (g: { type: string; coordinates: unknown }): Poligono[] =>
  g.type === "Polygon" ? [g.coordinates as Poligono] : (g.coordinates as Poligono[]);

/**
 * Admin → Regiones: los departamentos que tiene ANURA y su división en subregiones (la unidad
 * que se versiona y se descarga). Datos en dataset-service (phase12.sql); límites DANE en
 * geo-service.
 */
export function RegionsManager() {
  const session = usePanelSession();
  const canEditar = session.can("generarPaquete");
  const [deps, setDeps] = useState<Departamento[] | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (!session.isReal) return;
    let cancelado = false;
    getRegiones(true)
      .then((r) => {
        if (cancelado) return;
        setDeps(r.departamentos);
        setCodigo((c) => c ?? r.departamentos.find((d) => d.en_anura)?.codigo ?? null);
      })
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [session.isReal, recarga]);

  if (!session.isReal) return null;
  if (error) return <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">No se pudieron cargar las regiones: {error}</p>;
  if (!deps) return <p className="text-sm text-label-secondary">Cargando regiones…</p>;

  const enAnura = deps.filter((d) => d.en_anura);

  return (
    <Card>
      <CardHeader className="mb-2">
        <CardTitle>
          <MapPinned size={16} className="mr-1.5 inline" aria-hidden /> Regiones de ANURA
        </CardTitle>
      </CardHeader>
      <p className="mb-4 max-w-3xl text-sm text-label-secondary">
        Cada departamento se divide en subregiones, y cada subregión es un paquete que el teléfono descarga. Agrega un departamento y
        reparte sus municipios; cuando todos tienen subregión, se activa.
      </p>
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <MapaColombia deps={deps} seleccionado={codigo} onSelect={setCodigo} />
          <ul className="space-y-1.5">
            {enAnura.map((d) => (
              <li key={d.codigo}>
                <button
                  type="button"
                  aria-current={d.codigo === codigo ? "true" : undefined}
                  onClick={() => setCodigo(d.codigo)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm",
                    d.codigo === codigo ? "border-accent bg-accent-wash/60" : "border-border hover:bg-surface-subtle"
                  )}
                >
                  <span>
                    <span className="font-medium text-label-primary">{d.nombre}</span>
                    <span className="block text-xs text-label-secondary">
                      {d.subregiones === 1 ? "1 subregión" : `${d.subregiones} subregiones`} · {n(d.municipios_asignados)} municipios asignados
                    </span>
                  </span>
                  <Badge tone={d.estado === "activa" ? "accent" : "warning"}>{d.estado === "activa" ? "Activo" : "Borrador"}</Badge>
                </button>
              </li>
            ))}
          </ul>
          {canEditar && (
            <AgregarDepartamento
              disponibles={deps.filter((d) => !d.en_anura)}
              onAgregado={(c) => {
                setCodigo(c);
                setRecarga((x) => x + 1);
              }}
            />
          )}
        </div>
        {codigo && enAnura.some((d) => d.codigo === codigo) ? (
          <RegionPanel
            key={codigo}
            codigo={codigo}
            canEditar={canEditar}
            onCambio={() => setRecarga((x) => x + 1)}
            onQuitado={() => {
              setCodigo(enAnura.find((d) => d.codigo !== codigo)?.codigo ?? null);
              setRecarga((x) => x + 1);
            }}
          />
        ) : (
          <p className="text-sm text-label-secondary">
            {codigo ? `${deps.find((d) => d.codigo === codigo)?.nombre} todavía no está en ANURA.` : "Elige un departamento."}
            {canEditar && " Agrégalo con el formulario de la izquierda."}
          </p>
        )}
      </div>
    </Card>
  );
}

function MapaColombia({ deps, seleccionado, onSelect }: { deps: Departamento[]; seleccionado: string | null; onSelect: (c: string) => void }) {
  const proy = useMemo(() => proyectar(deps.flatMap((d) => d.poligonos ?? []), 320), [deps]);
  return (
    <svg viewBox={`0 0 ${proy.ancho} ${proy.alto}`} className="w-full" role="img" aria-label="Mapa de departamentos de Colombia">
      {deps.map((d) => (
        <path
          key={d.codigo}
          d={(d.poligonos ?? []).map(proy.path).join("")}
          fillRule="evenodd"
          onClick={() => onSelect(d.codigo)}
          className={cn(
            "cursor-pointer stroke-[0.6] transition-colors",
            d.codigo === seleccionado ? "stroke-label-primary" : "stroke-border"
          )}
          style={{
            fill:
              d.estado === "activa"
                ? "var(--accent-tint, hsl(152 55% 42%))"
                : d.estado === "borrador"
                  ? "hsl(40 85% 55%)"
                  : "var(--surface-subtle, hsl(0 0% 50% / 0.15))",
            opacity: d.codigo === seleccionado || !seleccionado ? 1 : d.en_anura ? 0.75 : 0.9,
          }}
        >
          <title>
            {d.nombre}
            {d.en_anura ? (d.estado === "activa" ? " · activo" : " · borrador") : " · no está en ANURA"}
          </title>
        </path>
      ))}
    </svg>
  );
}

function AgregarDepartamento({ disponibles, onAgregado }: { disponibles: Departamento[]; onAgregado: (codigo: string) => void }) {
  const [codigo, setCodigo] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elegido = disponibles.find((d) => d.codigo === codigo);
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <Field label="Agregar un departamento">
        <Select value={codigo} onChange={(e) => setCodigo(e.target.value)}>
          <option value="">Elige un departamento</option>
          {disponibles.map((d) => (
            <option key={d.codigo} value={d.codigo}>
              {d.nombre}
              {d.limites_municipales ? "" : " (sin límites municipales todavía)"}
            </option>
          ))}
        </Select>
      </Field>
      {elegido && !elegido.limites_municipales && (
        <p className="text-xs text-label-secondary">
          Se puede agregar ya, pero para dividirlo en subregiones faltan sus límites municipales (MGN del DANE).
        </p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      <Button
        variant="outline"
        className="text-xs"
        disabled={!codigo || trabajando}
        onClick={async () => {
          setTrabajando(true);
          setError(null);
          try {
            await agregarRegion(codigo);
            onAgregado(codigo);
            setCodigo("");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setTrabajando(false);
          }
        }}
      >
        <Plus size={13} /> Agregar {elegido?.nombre ?? "departamento"}
      </Button>
    </div>
  );
}

function RegionPanel({
  codigo,
  canEditar,
  onCambio,
  onQuitado,
}: {
  codigo: string;
  canEditar: boolean;
  onCambio: () => void;
  onQuitado: () => void;
}) {
  const [d, setD] = useState<RegionDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [subSel, setSubSel] = useState<number | null>(null);
  const [pintando, setPintando] = useState(false);
  const [nueva, setNueva] = useState("");
  const [renombrando, setRenombrando] = useState<{ id: number; nombre: string } | null>(null);

  useEffect(() => {
    let cancelado = false;
    getRegion(codigo)
      .then((r) => !cancelado && setD(r))
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [codigo, recarga]);

  async function hacer(fn: () => Promise<unknown>, ok?: string) {
    setError(null);
    try {
      await fn();
      if (ok) setAviso(ok);
      setRecarga((x) => x + 1);
      onCambio();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!d) return error ? <p className="text-sm text-danger">{error}</p> : <p className="text-sm text-label-secondary">Cargando {codigo}…</p>;

  const indice = new Map(d.subregiones.map((s, i) => [s.id, i]));
  const subDe = new Map<string, Subregion>();
  for (const s of d.subregiones) for (const m of s.municipios) subDe.set(m, s);
  const nombreMun = new Map(d.municipios.map((m) => [m.codigo, m.nombre]));
  const seleccionada = d.subregiones.find((s) => s.id === subSel) ?? null;
  const cifraSel = seleccionada && d.cifras ? d.cifras.subregiones[String(seleccionada.id)] : d.cifras?.departamento;
  const faltaParaActivar = !d.limites_municipales
    ? "faltan los límites municipales"
    : !d.subregiones.length
      ? "falta crear subregiones"
      : d.sin_subregion.length
        ? `faltan ${d.sin_subregion.length} municipios por asignar`
        : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-label-primary">{d.region.nombre}</h3>
        <Badge tone={d.region.estado === "activa" ? "accent" : "warning"}>{d.region.estado === "activa" ? "Activo" : "Borrador"}</Badge>
        {d.cifras && (
          <span className="text-xs text-label-secondary">
            {n(d.cifras.departamento.observaciones)} observaciones del dataset · {plural(d.cifras.departamento.especies.length, "especie", "especies")} con fotos
          </span>
        )}
        {canEditar && d.region.estado === "borrador" && (
          <Button
            variant="primary"
            className="ml-auto text-xs"
            disabled={!!faltaParaActivar}
            title={faltaParaActivar ? `No se puede activar: ${faltaParaActivar}` : undefined}
            onClick={() => hacer(() => activarRegion(codigo), `${d.region.nombre} quedó activo.`)}
          >
            <CheckCircle2 size={13} /> Activar departamento
          </Button>
        )}
        {canEditar && d.region.estado === "borrador" && (
          <Button
            variant="ghost"
            className="text-xs text-danger"
            onClick={async () => {
              setError(null);
              try {
                await quitarRegion(codigo);
                onQuitado();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Trash2 size={12} /> Quitar {d.region.nombre}
          </Button>
        )}
      </div>
      {canEditar && d.region.estado === "borrador" && faltaParaActivar && (
        <p className="text-xs text-label-secondary">Para activarlo {faltaParaActivar}.</p>
      )}
      {aviso && <p role="status" className="rounded-md bg-accent-wash px-3 py-2 text-sm text-accent-ink">{aviso}</p>}
      {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {!d.limites_municipales || !d.geometria ? (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-label-secondary">
          Todavía no hay límites municipales de {d.region.nombre}. Con el MGN del DANE (polígonos de municipios) se generan igual que
          los de Antioquia (<span className="font-mono text-xs">tools/admin/build_antioquia_subregiones.py</span>) y aquí se reparten en
          subregiones.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
          <div>
            <MapaMunicipios
              detalle={d}
              subDe={subDe}
              indice={indice}
              seleccionada={subSel}
              pintando={pintando && !!seleccionada && canEditar}
              onMunicipio={(m) => {
                if (pintando && seleccionada && canEditar) {
                  if (subDe.get(m)?.id !== seleccionada.id) hacer(() => asignarMunicipios(codigo, seleccionada.id, [m]));
                } else {
                  setSubSel(subDe.get(m)?.id ?? null);
                }
              }}
            />
            {pintando && seleccionada && (
              <p className="mt-2 text-xs text-label-secondary">
                Toca un municipio para pasarlo a <strong>{seleccionada.nombre}</strong>.
              </p>
            )}
            {d.sin_subregion.length > 0 && (
              <p className="mt-2 text-xs text-warning">
                {d.sin_subregion.length === 1 ? "1 municipio sin subregión" : `${d.sin_subregion.length} municipios sin subregión`} (en gris):{" "}
                {d.sin_subregion.map((c) => nombreMun.get(c) ?? c).join(", ")}.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <ul className="space-y-1">
              {d.subregiones.map((s, i) => {
                const c = d.cifras?.subregiones[String(s.id)];
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      aria-pressed={s.id === subSel}
                      onClick={() => setSubSel(s.id === subSel ? null : s.id)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                        s.id === subSel ? "bg-accent-wash/60" : "hover:bg-surface-subtle"
                      )}
                    >
                      <span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: color(i) }} aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-label-primary">
                          {s.numero} · {s.nombre}
                        </span>
                        <span className="block text-xs text-label-secondary">
                          {s.municipios.length === 1 ? "1 municipio" : `${s.municipios.length} municipios`}
                          {c && ` · ${n(c.observaciones)} obs. · ${plural(c.especies.length, "especie", "especies")}`}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {canEditar && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!nueva.trim()) return;
                  hacer(() => crearSubregion(codigo, nueva.trim()), `Subregión «${nueva.trim()}» creada. Elígela y pinta sus municipios.`);
                  setNueva("");
                }}
              >
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Nombre de la subregión nueva</span>
                  <Input value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Nombre de la subregión nueva" />
                </label>
                <Button type="submit" variant="outline" className="shrink-0 text-xs" disabled={!nueva.trim()}>
                  <Plus size={13} /> Crear
                </Button>
              </form>
            )}
          </div>
        </div>
      )}

      {seleccionada ? (
        <div className="rounded-md border border-border p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ background: color(indice.get(seleccionada.id) ?? 0) }} aria-hidden />
            <p className="text-sm font-medium text-label-primary">{seleccionada.nombre}</p>
            {canEditar && (
              <span className="ml-auto flex flex-wrap gap-1">
                <Button variant={pintando ? "primary" : "outline"} className="text-xs" aria-pressed={pintando} onClick={() => setPintando((p) => !p)}>
                  <Paintbrush size={12} /> {pintando ? "Terminar de pintar" : "Pintar municipios"}
                </Button>
                <Button variant="ghost" className="text-xs" onClick={() => setRenombrando({ id: seleccionada.id, nombre: seleccionada.nombre })}>
                  <Pencil size={12} /> Renombrar
                </Button>
                <Button
                  variant="ghost"
                  className="text-xs text-danger"
                  disabled={seleccionada.municipios.length > 0}
                  title={seleccionada.municipios.length ? "Primero pasa sus municipios a otra subregión" : undefined}
                  onClick={() => {
                    setSubSel(null);
                    hacer(() => borrarSubregion(codigo, seleccionada.id), `Subregión «${seleccionada.nombre}» borrada.`);
                  }}
                >
                  <Trash2 size={12} /> Borrar
                </Button>
              </span>
            )}
          </div>
          {renombrando?.id === seleccionada.id && (
            <form
              className="mb-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                hacer(() => renombrarSubregion(codigo, renombrando.id, renombrando.nombre), "Subregión renombrada.");
                setRenombrando(null);
              }}
            >
              <label className="min-w-0 flex-1">
                <span className="sr-only">Nombre nuevo</span>
                <Input value={renombrando.nombre} onChange={(e) => setRenombrando({ ...renombrando, nombre: e.target.value })} />
              </label>
              <Button type="submit" variant="outline" className="text-xs">
                Guardar nombre
              </Button>
              <Button type="button" variant="ghost" className="text-xs" onClick={() => setRenombrando(null)}>
                Cancelar
              </Button>
            </form>
          )}
          <p className="mb-1 text-xs text-label-secondary">
            Municipios: {seleccionada.municipios.map((m) => nombreMun.get(m) ?? m).join(", ") || "ninguno todavía"}.
          </p>
          {cifraSel && (
            <p className="text-xs text-label-secondary">
              Especies con fotos en el dataset ({cifraSel.especies.length}): <i>{cifraSel.especies.join(", ") || "ninguna"}</i>.
            </p>
          )}
          <EspeciesManuales codigo={codigo} subregion={seleccionada} />
        </div>
      ) : (
        d.cifras && (
          <p className="text-xs text-label-tertiary">
            Toca una subregión (en el mapa o en la lista) para ver sus municipios y especies. Las cifras salen de las observaciones del
            dataset ubicadas por municipio, sin contar las invalidadas.
          </p>
        )
      )}
    </div>
  );
}

function EspeciesManuales({ codigo, subregion }: { codigo: string; subregion: Subregion }) {
  const [especies, setEspecies] = useState<EspecieSubregion[] | null>(null);
  const [especieId, setEspecieId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  async function cargar() {
    const r = await getEspeciesSubregion(codigo, subregion.id);
    setEspecies(r.especies);
  }

  useEffect(() => {
    let cancelado = false;
    getEspeciesSubregion(codigo, subregion.id)
      .then((r) => !cancelado && setEspecies(r.especies))
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [codigo, subregion.id]);

  async function cambiar(fn: () => Promise<unknown>) {
    setTrabajando(true);
    setError(null);
    try {
      await fn();
      await cargar();
      setEspecieId("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTrabajando(false);
    }
  }

  const manuales = especies?.filter((e) => e.asignada_manual) ?? [];
  const disponibles = especies?.filter((e) => !e.asignada_manual) ?? [];

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <div>
        <p className="text-sm font-medium text-label-primary">Incluir especies manualmente</p>
        <p className="text-xs text-label-secondary">
          Se suman en el próximo cálculo de Centroides. Luego revisa OSR y Validación antes de compilar el paquete.
        </p>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (especieId) void cambiar(() => asignarEspecieSubregion(codigo, subregion.id, Number(especieId)));
        }}
      >
        <Field label="Especie">
          <Select value={especieId} onChange={(ev) => setEspecieId(ev.target.value)} disabled={!especies || !disponibles.length || trabajando}>
            <option value="">{!especies ? "Cargando…" : disponibles.length ? "Elige una especie" : "No hay más especies"}</option>
            {disponibles.map((e) => <option key={e.id} value={e.id}>{e.nombre_cientifico}</option>)}
          </Select>
        </Field>
        <Button type="submit" variant="outline" className="text-xs" disabled={!especieId || trabajando}>
          <Plus size={13} aria-hidden /> Añadir
        </Button>
      </form>
      {manuales.length > 0 && (
        <ul className="divide-y divide-border">
          {manuales.map((e) => (
            <li key={e.id} className="flex items-center gap-2 py-1.5 text-sm">
              <i className="min-w-0 flex-1 text-label-primary">{e.nombre_cientifico}</i>
              <Button
                type="button"
                variant="ghost"
                className="px-1.5 py-1 text-xs text-danger"
                aria-label={`Quitar ${e.nombre_cientifico} de ${subregion.nombre}`}
                disabled={trabajando}
                onClick={() => void cambiar(() => quitarEspecieSubregion(codigo, subregion.id, e.id))}
              >
                <Trash2 size={13} aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {especies && manuales.length === 0 && <p className="text-xs text-label-tertiary">No hay inclusiones manuales en esta subregión.</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function MapaMunicipios({
  detalle: d,
  subDe,
  indice,
  seleccionada,
  pintando,
  onMunicipio,
}: {
  detalle: RegionDetalle;
  subDe: Map<string, Subregion>;
  indice: Map<number, number>;
  seleccionada: number | null;
  pintando: boolean;
  onMunicipio: (codigo: string) => void;
}) {
  const features = d.geometria!.features;
  const proy = useMemo(() => proyectar(features.flatMap((f) => poligonosDe(f.geometry)), 560), [features]);
  return (
    <svg
      viewBox={`0 0 ${proy.ancho} ${proy.alto}`}
      className={cn("w-full rounded-md bg-surface-subtle/50", pintando && "cursor-crosshair")}
      role="img"
      aria-label={`Municipios de ${d.region.nombre} por subregión`}
    >
      {features.map((f) => {
        const codigo = f.properties.codigo;
        const sub = subDe.get(codigo);
        const i = sub ? indice.get(sub.id) ?? 0 : null;
        const apagado = seleccionada !== null && sub?.id !== seleccionada;
        const obs = d.cifras?.municipios[codigo] ?? 0;
        return (
          <path
            key={codigo}
            d={poligonosDe(f.geometry).map(proy.path).join("")}
            fillRule="evenodd"
            onClick={() => onMunicipio(codigo)}
            className="cursor-pointer stroke-[0.5] transition-opacity"
            style={{
              fill: i === null ? "hsl(0 0% 60% / 0.35)" : color(i),
              stroke: "var(--surface, #fff)",
              opacity: apagado ? 0.3 : 1,
            }}
          >
            <title>
              {f.properties.nombre} · {sub ? sub.nombre : "sin subregión"} · {obs === 1 ? "1 observación" : `${obs.toLocaleString("es-CO")} observaciones`}
            </title>
          </path>
        );
      })}
    </svg>
  );
}
