"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskProgress } from "@/components/ui/task-progress";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { usePanelSession } from "@/lib/session/panel-session";
import {
  correrLimpieza,
  decidirHallazgos,
  getHallazgos,
  getLimpieza,
  type EstadoLimpieza,
  type Hallazgo,
  type OpcionHallazgo,
  type ParametrosLimpieza,
  type TipoHallazgo,
} from "@/lib/dataset/dataset-client";

const PARAMETROS: { clave: keyof ParametrosLimpieza; etiqueta: string; ayuda: string }[] = [
  { clave: "umbral_incertidumbre_m", etiqueta: "Incertidumbre máxima (m)", ayuda: "Por encima, la coordenada cuenta como aproximada." },
  { clave: "celda_grados", etiqueta: "Celda (grados)", ayuda: "iNaturalist desplaza las ocultas dentro de una celda de 0,2°." },
  { clave: "min_vecinos", etiqueta: "Vecinos para usar la mediana", ayuda: "Registros precisos de la especie en la celda." },
  { clave: "z_atipica", etiqueta: "z robusto para atípica", ayuda: "Distancia al vecino, en unidades de MAD." },
  { clave: "distancia_min_atipica_km", etiqueta: "Aislamiento mínimo (km)", ayuda: "Más cerca que esto nunca se marca como atípica." },
  { clave: "min_puntos_especie", etiqueta: "Puntos mínimos por especie", ayuda: "Con menos, no se buscan atípicas." },
];

const TIPOS: { tipo: TipoHallazgo; titulo: string; ayuda: string }[] = [
  {
    tipo: "coordenada_aproximada",
    titulo: "Coordenadas aproximadas",
    ayuda: "Ocultas por iNaturalist o con más incertidumbre que el umbral. La propuesta usa la mediana de los registros precisos de la misma especie en su celda; si hay menos del mínimo, solo se usa a nivel de celda.",
  },
  {
    tipo: "coordenada_atipica",
    titulo: "Coordenadas atípicas",
    ayuda: "Precisas, pero aisladas: lejos de cualquier otro registro preciso de su especie (mediana y MAD de la distancia al vecino más cercano). Puede ser un error o una población real poco muestreada: mira la foto antes de decidir.",
  },
  { tipo: "sin_coordenada", titulo: "Sin coordenada", ayuda: "iNaturalist no devolvió ubicación." },
  {
    tipo: "derechos_reservados",
    titulo: "Todos los derechos reservados",
    ayuda: "Sin licencia Creative Commons en iNaturalist.",
  },
  { tipo: "sin_licencia", titulo: "Sin licencia", ayuda: "La foto no tiene metadatos de licencia ni autoría." },
];

const OPCION: Record<OpcionHallazgo, string> = {
  usar_mediana: "Usar la mediana",
  solo_celda: "Solo a nivel de celda",
  excluir: "Excluir de las capas geográficas",
  corregir: "Corregir a mano",
  mantener: "Mantener la coordenada",
  solo_entrenamiento: "Solo para entrenar",
  excluir_del_entrenamiento: "Excluir del entrenamiento",
};

const USO: Record<string, string> = {
  punto: "como punto",
  celda: "solo por celda",
  excluida: "excluidas",
  sin_decidir: "esperando decisión",
};

const fmt = (n: number) => n.toLocaleString("es-CO");

function evidencia(h: Hallazgo) {
  const d = h.detalle;
  if (h.tipo === "coordenada_aproximada") {
    const motivo =
      d.motivo === "oculta_por_inaturalist"
        ? "Oculta por iNaturalist"
        : `Incertidumbre de ${fmt(Math.round(Number(d.incertidumbre_m ?? 0)))} m`;
    return `${motivo} · ${d.vecinos_precisos ?? 0} registros precisos de la especie en su celda`;
  }
  if (h.tipo === "coordenada_atipica") {
    return `A ${fmt(Number(d.distancia_vecino_km ?? 0))} km de sus registros precisos más cercanos; lo típico en la especie es ${fmt(
      Number(d.mediana_vecino_km ?? 0)
    )} km (z robusto ${d.z_robusto}, ${d.puntos_especie} puntos)`;
  }
  return h.propuesta.explicacion;
}

/** Limpieza del dataset con decisiones humanas (M1). Lo automático propone; aquí se decide. */
export function DataCleaningConsole() {
  const session = usePanelSession();
  const canDecide = session.can("revisarFotografias");
  const [estado, setEstado] = useState<EstadoLimpieza | null>(null);
  const [tipo, setTipo] = useState<TipoHallazgo>("coordenada_aproximada");
  const [vista, setVista] = useState<"pendiente" | "decidido">("pendiente");
  const [lista, setLista] = useState<{ hallazgos: Hallazgo[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [proceso, setProceso] = useState("Guardando las decisiones…");
  const [corrigiendo, setCorrigiendo] = useState<{ id: number; lat: string; lon: string } | null>(null);
  const [confirmarLote, setConfirmarLote] = useState(false);
  const [editandoParametros, setEditandoParametros] = useState<Record<string, string> | null>(null);

  const cargar = useCallback(async () => {
    const [e, l] = await Promise.all([getLimpieza(), getHallazgos(tipo, vista)]);
    return { e, l };
  }, [tipo, vista]);

  useEffect(() => {
    if (!session.isReal) return;
    let cancelado = false;
    cargar()
      .then(({ e, l }) => {
        if (cancelado) return;
        setEstado(e);
        setLista(l);
        setError(null);
      })
      .catch((err: Error) => !cancelado && setError(err.message));
    return () => {
      cancelado = true;
    };
  }, [session.isReal, cargar]);

  async function accion(fn: () => Promise<unknown>, etiqueta = "Guardando las decisiones…") {
    setOcupado(true);
    setError(null);
    setProceso(etiqueta);
    try {
      await fn();
      const { e, l } = await cargar();
      setEstado(e);
      setLista(l);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la acción");
    } finally {
      setOcupado(false);
    }
  }

  if (!session.isReal) {
    return (
      <Card>
        <CardHeader className="mb-2">
          <CardTitle>Limpieza del dataset</CardTitle>
        </CardHeader>
        <p className="text-sm text-label-secondary">
          {session.cargando ? "Comprobando la sesión…" : "Inicia sesión para ver los vacíos del dataset real y decidir qué hacer con ellos."}{" "}
          {!session.cargando && (
            <Link href="/login" className="text-accent-ink underline decoration-dotted underline-offset-2">
              Iniciar sesión
            </Link>
          )}
        </p>
      </Card>
    );
  }

  const conteo = (t: TipoHallazgo, e: "pendiente" | "decidido") =>
    estado?.conteos.find((c) => c.tipo === t && c.estado === e)?.n ?? 0;
  const pendientesTipo = conteo(tipo, "pendiente");
  const info = TIPOS.find((t) => t.tipo === tipo)!;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="mb-2">
          <CardTitle>Limpieza del dataset</CardTitle>
          <Button
            variant="outline"
            className="text-xs"
            loading={ocupado}
            disabled={!canDecide || ocupado}
            onClick={() => accion(() => correrLimpieza(estado?.ultima?.parametros), "Analizando observaciones y generando propuestas…")}
          >
            <RefreshCw size={13} /> {estado?.ultima ? "Volver a correr la limpieza" : "Correr la limpieza"}
          </Button>
        </CardHeader>
        <p className="text-sm text-label-secondary">
          La limpieza automática solo propone; lo que decidas aquí queda registrado en la auditoría y ninguna corrida
          nueva lo cambia. La coordenada original nunca se borra.
          {estado?.ultima && ` Última corrida: ${new Date(estado.ultima.creado).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}`}
        </p>
        {estado && (
          <p className="mt-2 text-sm text-label-primary">
            Observaciones que entran a las capas geográficas:{" "}
            {estado.usos.map((u, i) => (
              <span key={u.uso}>
                {i > 0 && " · "}
                {fmt(u.n)} {USO[u.uso] ?? u.uso}
              </span>
            ))}
          </p>
        )}
        {estado && !estado.ultima && (
          <p className="mt-1 text-xs text-warning">
            Aún no se corrió la limpieza. Para empezar, córrela: propone qué coordenada usar en cada observación y sin ella la
            altitud y las capas geográficas no cuentan las observaciones nuevas.
          </p>
        )}
        {estado?.ultima && (
          <p className="mt-1 text-xs text-label-secondary">
            Parámetros: incertidumbre máxima {fmt(estado.ultima.parametros.umbral_incertidumbre_m)} m · celda{" "}
            {fmt(estado.ultima.parametros.celda_grados)}° · mínimo {estado.ultima.parametros.min_vecinos} vecinos para usar la
            mediana · atípica con z robusto &gt; {estado.ultima.parametros.z_atipica} y más de{" "}
            {estado.ultima.parametros.distancia_min_atipica_km} km.
          </p>
        )}
        {canDecide && estado && !editandoParametros && (
          <Button
            variant="ghost"
            className="mt-2 text-xs"
            onClick={() => {
              const base = estado.ultima?.parametros ?? estado.parametros_por_defecto;
              setEditandoParametros(Object.fromEntries(PARAMETROS.map((x) => [x.clave, String(base[x.clave])])));
            }}
          >
            Ajustar parámetros
          </Button>
        )}
        {editandoParametros && estado && (
          <form
            className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              const parametros = Object.fromEntries(
                Object.entries(editandoParametros).map(([k, v]) => [k, Number(v.replace(",", "."))])
              ) as ParametrosLimpieza;
              accion(() => correrLimpieza(parametros), "Analizando observaciones y generando propuestas…").then(() => setEditandoParametros(null));
            }}
          >
            {PARAMETROS.map((x) => (
              <label key={x.clave} className="block space-y-1">
                <span className="text-xs font-medium text-label-secondary">{x.etiqueta}</span>
                <Input
                  value={editandoParametros[x.clave]}
                  onChange={(e) => setEditandoParametros({ ...editandoParametros, [x.clave]: e.target.value })}
                  inputMode="decimal"
                  required
                />
                <span className="block text-[11px] text-label-secondary">
                  {x.ayuda} Por defecto: {fmt(estado.parametros_por_defecto[x.clave])}.
                </span>
              </label>
            ))}
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit" variant="primary" className="text-xs" disabled={ocupado}>
                Correr la limpieza con estos parámetros
              </Button>
              <Button type="button" variant="ghost" className="text-xs" onClick={() => setEditandoParametros(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
        {!canDecide && (
          <p className="mt-2 text-xs text-label-secondary">
            {session.acting?.name} puede ver los hallazgos; decidir requiere el permiso &quot;Revisar fotografías&quot;.
          </p>
        )}
      </Card>
      {ocupado && <TaskProgress taskKey="limpieza-dataset" label={proceso} />}

      <div className="flex flex-wrap gap-2" role="tablist">
        {TIPOS.map((t) => (
          <button
            key={t.tipo}
            role="tab"
            aria-selected={tipo === t.tipo}
            onClick={() => setTipo(t.tipo)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              tipo === t.tipo ? "border-accent-ink bg-accent-wash text-accent-ink" : "border-border text-label-secondary"
            )}
          >
            {t.titulo} · {fmt(conteo(t.tipo, "pendiente"))} {conteo(t.tipo, "pendiente") === 1 ? "pendiente" : "pendientes"}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="mb-2">
          <CardTitle>{info.titulo}</CardTitle>
          <div className="flex gap-1.5">
            <Button variant={vista === "pendiente" ? "secondary" : "ghost"} className="text-xs" onClick={() => setVista("pendiente")}>
              Pendientes ({fmt(pendientesTipo)})
            </Button>
            <Button variant={vista === "decidido" ? "secondary" : "ghost"} className="text-xs" onClick={() => setVista("decidido")}>
              Decididos ({fmt(conteo(tipo, "decidido"))})
            </Button>
          </div>
        </CardHeader>
        <p className="mb-3 text-sm text-label-secondary">{info.ayuda}</p>

        {vista === "pendiente" && pendientesTipo > 0 && canDecide && (
          <Button variant="outline" className="mb-3 text-xs" disabled={ocupado} onClick={() => setConfirmarLote(true)}>
            Aceptar las {fmt(pendientesTipo)} propuestas de este tipo
          </Button>
        )}
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}

        {!lista ? (
          <p className="text-sm text-label-secondary">Cargando…</p>
        ) : lista.hallazgos.length === 0 ? (
          <p className="text-sm text-label-secondary">
            {vista === "pendiente" ? "No queda nada por decidir en este tipo." : "Todavía no hay decisiones en este tipo."}
          </p>
        ) : (
          <ul className="space-y-2">
            {lista.hallazgos.map((h) => (
              <li key={h.id} className="flex gap-3 rounded-md border border-border p-3">
                {h.foto_url && (
                  // eslint-disable-next-line @next/next/no-img-element -- URL firmada de MinIO que vence en 10 min
                  <img src={h.foto_url} alt={h.nombre_cientifico ?? ""} loading="lazy" className="h-20 w-20 shrink-0 rounded object-cover" />
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium italic text-label-primary">{h.nombre_cientifico}</p>
                  <p className="text-xs text-label-secondary">{evidencia(h)}</p>
                  {h.tipo.startsWith("coordenada") && (
                    <p className="text-xs text-label-secondary">
                      Original: {h.detalle.original?.latitud.toFixed(4)}, {h.detalle.original?.longitud.toFixed(4)}
                      {h.propuesta.latitud != null &&
                        ` → propuesta: ${h.propuesta.latitud.toFixed(4)}, ${h.propuesta.longitud?.toFixed(4)}`}
                    </p>
                  )}
                  {h.tipo !== "derechos_reservados" && h.tipo !== "sin_licencia" && (
                    <p className="text-xs text-label-secondary">{h.propuesta.explicacion}</p>
                  )}
                  {h.observacion_inat && (
                    <a
                      href={`https://www.inaturalist.org/observations/${h.observacion_inat}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-label-secondary underline decoration-dotted underline-offset-2"
                    >
                      Ver la observación {h.observacion_inat} en iNaturalist
                    </a>
                  )}
                  {h.estado === "decidido" && h.decision ? (
                    <Badge tone="accent">Decidido: {OPCION[h.decision.opcion]}</Badge>
                  ) : (
                    canDecide && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {h.propuesta.opciones.map((o) =>
                          o === "corregir" ? (
                            <Button
                              key={o}
                              variant="ghost"
                              className="text-xs"
                              disabled={ocupado}
                              onClick={() => setCorrigiendo({ id: h.id, lat: "", lon: "" })}
                            >
                              {OPCION[o]}
                            </Button>
                          ) : (
                            <Button
                              key={o}
                              variant={o === h.propuesta.opcion ? "primary" : "outline"}
                              className="text-xs"
                              disabled={ocupado}
                              onClick={() => accion(() => decidirHallazgos({ ids: [h.id], opcion: o }))}
                            >
                              {OPCION[o]}
                              {o === h.propuesta.opcion && " (propuesta)"}
                            </Button>
                          )
                        )}
                      </div>
                    )
                  )}
                  {corrigiendo?.id === h.id && (
                    <form
                      className="flex flex-wrap items-end gap-2 pt-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        accion(() =>
                          decidirHallazgos({
                            ids: [h.id],
                            opcion: "corregir",
                            latitud: Number(corrigiendo.lat),
                            longitud: Number(corrigiendo.lon),
                          })
                        ).then(() => setCorrigiendo(null));
                      }}
                    >
                      <label className="text-xs text-label-secondary">
                        Latitud
                        <Input
                          value={corrigiendo.lat}
                          onChange={(e) => setCorrigiendo({ ...corrigiendo, lat: e.target.value })}
                          inputMode="decimal"
                          required
                          className="w-32"
                        />
                      </label>
                      <label className="text-xs text-label-secondary">
                        Longitud
                        <Input
                          value={corrigiendo.lon}
                          onChange={(e) => setCorrigiendo({ ...corrigiendo, lon: e.target.value })}
                          inputMode="decimal"
                          required
                          className="w-32"
                        />
                      </label>
                      <Button type="submit" variant="primary" className="text-xs" disabled={ocupado}>
                        Guardar coordenada
                      </Button>
                      <Button type="button" variant="ghost" className="text-xs" onClick={() => setCorrigiendo(null)}>
                        Cancelar
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {lista && lista.total > lista.hallazgos.length && (
          <p className="mt-3 text-xs text-label-secondary">
            Se muestran {lista.hallazgos.length} de {fmt(lista.total)}. Al decidir, los siguientes van apareciendo.
          </p>
        )}
      </Card>

      <Dialog open={confirmarLote} onOpenChange={setConfirmarLote}>
        <DialogHeader
          title={`¿Aceptar ${fmt(pendientesTipo)} propuestas?`}
          description={`Cada hallazgo pendiente de "${info.titulo}" toma su propia propuesta. Queda en la auditoría a tu nombre y ninguna corrida nueva de la limpieza lo cambia.`}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmarLote(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={ocupado}
            onClick={() => {
              setConfirmarLote(false);
              accion(() => decidirHallazgos({ filtro: { tipo }, opcion: "propuesta" }));
            }}
          >
            Aceptar {fmt(pendientesTipo)} propuestas
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
