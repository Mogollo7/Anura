"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, DatabaseZap, Image as ImageIcon, Send, ShieldCheck, Undo2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { cn, plural } from "@/lib/utils";
import { usePanelSession } from "@/lib/session/panel-session";
import {
  DatasetError,
  enviarARevision,
  devolverABorrador,
  getContenidoLista,
  getFicha,
  getFotos,
  guardarContenido,
  precargarContenido,
  type DatosDelProyecto,
  publicarContenido,
  type CamposContenido,
  type ContenidoResumen,
  type DatasetFoto,
  type EstadoContenido,
  type FichaContenido,
  type Actividad,
  type NivelToxicidad,
  type UicnCategoria,
} from "@/lib/dataset/dataset-client";

const ESTADO_LABEL: Record<EstadoContenido, string> = { borrador: "Borrador", en_revision: "En revisión", publicada: "Publicada" };
const ESTADO_TONO: Record<EstadoContenido, "neutral" | "info" | "accent"> = { borrador: "neutral", en_revision: "info", publicada: "accent" };
const UICN_OPCIONES: UicnCategoria[] = ["LC", "NT", "VU", "EN", "CR", "EW", "EX", "DD"];
const UICN_LABEL: Record<UicnCategoria, string> = {
  LC: "Preocupación menor (LC)", NT: "Casi amenazada (NT)", VU: "Vulnerable (VU)", EN: "En peligro (EN)",
  CR: "En peligro crítico (CR)", EW: "Extinta en estado silvestre (EW)", EX: "Extinta (EX)", DD: "Datos insuficientes (DD)",
};
const AMENAZADA: UicnCategoria[] = ["VU", "EN", "CR"];
const TOXICIDAD_LABEL: Record<NivelToxicidad, string> = {
  inofensiva: "Inofensiva", toxica_tacto: "Tóxica al tacto", toxica_ingestion: "Tóxica si se ingiere",
};

const ACTIVIDAD_LABEL: Record<Actividad, string> = {
  diurna: "Diurna", nocturna: "Nocturna", crepuscular: "Crepuscular", diurna_y_nocturna: "Diurna y nocturna",
};

const esCC = (licencia: string | null) => !!licencia && licencia !== "all-rights-reserved";
const VACIO: Partial<CamposContenido> = {};

// Listas escritas una por línea. Se guardan las líneas tal cual (el servidor quita las vacías):
// filtrar aquí borraría la línea nueva en cuanto se presiona Enter.
const aLineas = (v: string[] | null | undefined) => (v ?? []).join("\n");
const deLineas = (t: string) => (t.trim() ? t.split("\n") : null);

/** Dónde se ve cada bloque: la app Android (ficha, Explorar, carrusel) y la web (ficha de especie). */
/**
 * Lo que el proyecto ya tiene de la especie, en las mismas secciones del formulario de abajo.
 * «Cargar datos del proyecto» lo pone en esos campos si están vacíos; lo que no tiene fuente en el
 * proyecto (UICN, toxicidad, morfología…) se dice aparte: lo completa el herpetólogo.
 */
function DatosProyecto({ datos }: { datos: DatosDelProyecto }) {
  const cat = datos.catalogo;
  const secciones: { titulo: string; filas: [string, string][]; sinDato?: string }[] = [
    {
      titulo: "Identidad, estado y toxicidad",
      filas: [
        ["Nombre común", cat?.nombre_comun ?? (cat?.otro_nombre ? `${cat.otro_nombre} (en inglés: va a «Otros nombres»)` : "sin dato")],
        ["Autoría", cat?.autoria ?? "sin dato"],
        ["Sinónimos", cat?.sinonimos.length ? cat.sinonimos.join(", ") : "sin dato"],
      ],
      sinDato: "UICN y toxicidad: el proyecto no las tiene; las completa el herpetólogo con su fuente.",
    },
    {
      titulo: "Dónde vive",
      filas: [
        ["Observaciones válidas", String(datos.observaciones)],
        [
          "Altitud de los registros",
          datos.altitud
            ? `${Math.round(datos.altitud.min)}–${Math.round(datos.altitud.max)} m · ${datos.altitud.origen === "manual" ? "fijada a mano" : `p5–p95 de ${datos.altitud.n}`}`
            : "sin altitudes todavía",
        ],
        ["Subregiones con registros", datos.subregiones === null ? "no disponible" : datos.subregiones.length ? datos.subregiones.map((s) => s.nombre).join(", ") : "ninguna"],
        ["Sustrato etiquetado", datos.sustrato.n ? datos.sustrato.conteos.map((s) => `${s.nombre} ${s.n}`).join(" · ") : "sin etiquetar"],
      ],
      sinDato: "Altitud según la literatura y endemismo: el proyecto no los tiene.",
    },
    {
      titulo: "Cómo reconocerla",
      filas: [["LRC medida (LHC)", datos.lrc ? `${datos.lrc.min}–${datos.lrc.max} mm` : "pendiente"]],
      sinDato: "Tímpano, discos, pliegues, patrones y rasgos diagnósticos: los escribe el herpetólogo.",
    },
  ];
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {secciones.map((sec) => (
          <section key={sec.titulo} className="space-y-1.5">
            <h4 className="text-xs font-semibold text-label-primary">{sec.titulo}</h4>
            <dl className="space-y-1 text-xs">
              {sec.filas.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="shrink-0 text-label-tertiary">{k}</dt>
                  <dd className="text-right text-label-primary">{v}</dd>
                </div>
              ))}
            </dl>
            {sec.sinDato && <p className="text-[11px] text-label-tertiary">{sec.sinDato}</p>}
          </section>
        ))}
      </div>
      {cat && <p className="mt-3 text-[11px] text-label-tertiary">Identidad: {cat.fuente}.</p>}
      {datos.motivo && <p className="mt-1 text-[11px] text-warning">{datos.motivo}</p>}
      <p className="mt-1 text-[11px] text-label-tertiary">
        Al cargarlo se llenan solo los campos vacíos de cada sección; nunca se pisa lo que ya escribiste. El nombre común queda con la fuente «por confirmar».
      </p>
    </>
  );
}

function SeVeEn({ app, web }: { app?: string; web?: string }) {
  return (
    <p className="mb-3 flex flex-wrap gap-1.5 text-[11px] text-label-tertiary">
      {app && <Badge tone="neutral" className="text-[10px]">App: {app}</Badge>}
      {web && <Badge tone="neutral" className="text-[10px]">Web: {web}</Badge>}
      {!app && <Badge tone="neutral" className="text-[10px]">La app no lo muestra</Badge>}
      {!web && <Badge tone="neutral" className="text-[10px]">La web no lo muestra</Badge>}
    </p>
  );
}

/** Ficha pública (K): una sola fuente de contenido, aparte del modelo. Ver Admin → Contenido. */
export function ContentManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = usePanelSession();
  const [lista, setLista] = useState<ContenidoResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (!session.isReal) return;
    let cancelado = false;
    getContenidoLista()
      .then((r) => !cancelado && setLista(r.especies))
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [session.isReal, recarga]);

  if (!session.isReal) {
    return (
      <Card>
        <p className="text-sm text-label-secondary">
          {session.cargando ? "Comprobando la sesión…" : "Inicia sesión para administrar la ficha pública."}{" "}
          {!session.cargando && (
            <Link href="/login" className="text-accent-ink underline decoration-dotted underline-offset-2">
              Iniciar sesión
            </Link>
          )}
        </p>
      </Card>
    );
  }
  if (error) return <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>;
  if (!lista) return <p className="text-sm text-label-secondary">Cargando especies…</p>;

  const especieId = Number(searchParams.get("especie")) || lista[0]?.especie_id;
  const selected = lista.find((s) => s.especie_id === especieId) ?? lista[0];
  const publicadas = lista.filter((s) => s.en_catalogo).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <Card className="h-fit p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-label-primary">Especies</p>
          <p className="text-xs text-label-tertiary">{publicadas} de {lista.length} publicadas</p>
        </div>
        <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
          {lista.map((s) => (
            <li key={s.especie_id}>
              <button
                type="button"
                onClick={() => router.push(`/contenido?especie=${s.especie_id}`)}
                className={cn(
                  "flex w-full flex-col gap-0.5 px-4 py-2.5 text-left hover:bg-surface-subtle",
                  s.especie_id === selected?.especie_id && "bg-accent-wash/60"
                )}
              >
                <span className="flex items-center gap-1.5 text-sm italic text-label-primary">{s.nombre_cientifico}</span>
                <span className="flex items-center gap-1.5 text-xs text-label-secondary">
                  <Badge tone={ESTADO_TONO[s.estado]} className="text-[10px]">{ESTADO_LABEL[s.estado]}</Badge>
                  {s.en_catalogo && s.estado !== "publicada" && (
                    <Badge tone="accent" className="text-[10px]">v{s.version} en la app</Badge>
                  )}
                  {s.nombre_comun && <span className="truncate">{s.nombre_comun}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {selected && (
        <ContentEditor key={selected.especie_id} especieId={selected.especie_id} lista={lista} onCambio={() => setRecarga((n) => n + 1)} />
      )}
    </div>
  );
}

function ContentEditor({ especieId, lista, onCambio }: { especieId: number; lista: ContenidoResumen[]; onCambio: () => void }) {
  const session = usePanelSession();
  const canEditar = session.can("editarContenido");
  const canPublicar = session.can("publicarContenido");
  const [ficha, setFicha] = useState<FichaContenido | null>(null);
  const [fotos, setFotos] = useState<DatasetFoto[]>([]);
  const [campos, setCampos] = useState<Partial<CamposContenido>>(VACIO);
  const [fotoPrincipal, setFotoPrincipal] = useState<string | null>(null);
  const [galeria, setGaleria] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [devolviendo, setDevolviendo] = useState(false);
  const [cargando, setCargando] = useState(false);
  // Lo último que el servidor tiene (para saber si hay cambios) y la función que lo guarda si la
  // persona se va antes de que corra el temporizador.
  const guardado = useRef<string | null>(null);
  const pendiente = useRef<(() => void) | null>(null);
  const [estadoGuardado, setEstadoGuardado] = useState<"al_dia" | "pendiente" | "guardando">("al_dia");
  const instantanea = (c: Partial<CamposContenido>, fp: string | null, g: string[]) => JSON.stringify({ c, fp, g });

  useEffect(() => {
    let cancelado = false;
    Promise.all([getFicha(especieId), getFotos(especieId, 0, 100, true)])
      .then(([f, { fotos: fs }]) => {
        if (cancelado) return;
        guardado.current = instantanea(f.contenido.campos ?? {}, f.contenido.foto_principal_sha256, f.contenido.galeria ?? []);
        setFicha(f);
        setCampos(f.contenido.campos ?? {});
        setFotoPrincipal(f.contenido.foto_principal_sha256);
        setGaleria(f.contenido.galeria ?? []);
        setFotos(fs);
      })
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [especieId]);

  function actualizar<K extends keyof CamposContenido>(campo: K, valor: CamposContenido[K]) {
    setCampos((c) => ({ ...c, [campo]: valor }));
    setAviso(null);
  }

  async function guardar(): Promise<boolean> {
    if (!ficha) return false;
    setGuardando(true);
    setEstadoGuardado("guardando");
    setError(null);
    const foto = instantanea(campos, fotoPrincipal, galeria);
    try {
      const { faltan, ...c } = await guardarContenido(especieId, { campos, foto_principal_sha256: fotoPrincipal, galeria });
      guardado.current = foto;
      setFicha((f) => (f ? { ...f, contenido: c, faltan } : f));
      onCambio();
      setEstadoGuardado("al_dia");
      return true;
    } catch (e) {
      setError((e as Error).message);
      setEstadoGuardado("pendiente");
      return false;
    } finally {
      setGuardando(false);
    }
  }

  // Guardado automático: lo que se edita se manda al servidor un momento después de dejar de escribir
  // (y al cambiar de especie o salir de la pantalla), sin pulsar «Guardar borrador».
  useEffect(() => {
    if (!ficha || !canEditar || guardando || guardado.current === null) return;
    if (instantanea(campos, fotoPrincipal, galeria) === guardado.current) {
      pendiente.current = null;
      return;
    }
    setEstadoGuardado("pendiente");
    pendiente.current = () => {
      void guardarContenido(especieId, { campos, foto_principal_sha256: fotoPrincipal, galeria }).catch(() => {});
    };
    const t = setTimeout(() => {
      pendiente.current = null;
      void guardar();
    }, 1200);
    return () => clearTimeout(t);
    // guardar() lee el estado de este mismo render: se vuelve a armar con cada cambio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campos, fotoPrincipal, galeria, ficha, canEditar, guardando]);

  useEffect(() => {
    const salir = () => pendiente.current?.();
    window.addEventListener("pagehide", salir);
    return () => {
      window.removeEventListener("pagehide", salir);
      salir();
    };
  }, []);

  async function cargarDelProyecto() {
    setCargando(true);
    setError(null);
    setAviso(null);
    try {
      if (!(await guardar())) return;
      const r = await precargarContenido(especieId);
      guardado.current = instantanea(r.contenido.campos ?? {}, r.contenido.foto_principal_sha256, r.contenido.galeria ?? []);
      setFicha(r);
      setCampos(r.contenido.campos ?? {});
      setAviso(
        r.rellenados.length
          ? `Se cargó del proyecto — ${[...new Set(r.rellenados.map((x) => x.seccion))]
              .map((sec) => `${sec}: ${r.rellenados.filter((x) => x.seccion === sec).map((x) => x.campo).join(", ")}`)
              .join(" · ")}. Revísalo y corrige lo que haga falta; ya quedó guardado.`
          : "No había nada que cargar: los campos que el proyecto puede llenar ya tienen contenido o el proyecto aún no tiene datos."
      );
      onCambio();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  async function accion(fn: () => Promise<unknown>, textoOk: string) {
    setGuardando(true);
    setError(null);
    try {
      await guardar();
      const c = await fn();
      setFicha((f) => (f ? { ...f, contenido: c as FichaContenido["contenido"] } : f));
      setAviso(textoOk);
      onCambio();
      // Vuelve a pedir la ficha para refrescar el checklist de "faltan" con el nuevo estado.
      getFicha(especieId).then(setFicha).catch(() => {});
    } catch (e) {
      setError(e instanceof DatasetError ? (e.body.faltan ? `${e.message}` : e.message) : (e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  if (error && !ficha) return <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>;
  if (!ficha) return <p className="text-sm text-label-secondary">Cargando ficha…</p>;

  const { especie, contenido, auto, faltan } = ficha;
  const soloLectura = !canEditar || guardando;
  const fotosCC = fotos.filter((f) => esCC(f.licencia));
  const fotoSeleccionada = fotos.find((f) => f.sha256 === fotoPrincipal);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="mb-2 flex-wrap gap-2">
          <div>
            <CardTitle className="text-base italic">{especie.nombre_cientifico}</CardTitle>
            <p className="text-xs text-label-tertiary">
              {especie.genero} · {especie.familia} {especie.taxon_id && `· ${especie.taxon_id}`}
            </p>
          </div>
          <Badge tone={ESTADO_TONO[contenido.estado]}>{ESTADO_LABEL[contenido.estado]}</Badge>
          {contenido.version > 0 && <Badge tone="neutral">v{contenido.version} publicada</Badge>}
        </CardHeader>
        {contenido.version > 0 && contenido.estado !== "publicada" && (
          <p className="mb-3 text-xs text-label-secondary">
            La app y la web siguen mostrando la v{contenido.version}. Estos cambios se ven cuando se publique otra vez.
          </p>
        )}

        {aviso && <p className="mb-3 rounded-md bg-accent-wash px-3 py-2 text-sm text-accent-ink">{aviso}</p>}
        {error && <p className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        {faltan.length > 0 && (
          <div className="mb-3 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
            <p className="mb-1 flex items-center gap-1.5 font-medium text-warning">
              <AlertTriangle size={13} /> Falta para publicar
            </p>
            <ul className="list-inside list-disc text-label-secondary">
              {faltan.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={soloLectura} onClick={guardar}>
            Guardar borrador
          </Button>
          <span role="status" className="self-center text-xs text-label-tertiary">
            {estadoGuardado === "guardando" ? "Guardando…" : estadoGuardado === "pendiente" ? "Cambios sin guardar…" : "Todo guardado en el servidor"}
          </span>
          {contenido.estado === "borrador" && canEditar && (
            <Button variant="primary" disabled={guardando} onClick={() => accion(() => enviarARevision(especieId), "Enviada a revisión.")}>
              <Send size={13} /> Enviar a revisión
            </Button>
          )}
          {contenido.estado === "en_revision" && canPublicar && (
            <Button variant="primary" disabled={guardando} onClick={() => accion(() => publicarContenido(especieId), "Ficha publicada.")}>
              <ShieldCheck size={13} /> Publicar ficha
            </Button>
          )}
          {contenido.estado === "en_revision" && canEditar && (
            <Button
              variant="ghost"
              disabled={guardando}
              onClick={() => setDevolviendo(true)}
            >
              <Undo2 size={13} /> Devolver a borrador
            </Button>
          )}
        </div>
        {!canEditar && <p className="mt-2 text-xs text-label-tertiary">Editar la ficha necesita el permiso Editar contenido.</p>}
        {contenido.estado === "en_revision" && !canPublicar && (
          <p className="mt-2 text-xs text-label-tertiary">Publicarla necesita el aval del herpetólogo (permiso Publicar contenido).</p>
        )}
      </Card>

      <Card>
        <CardHeader className="mb-2 flex-wrap gap-2">
          <CardTitle>Datos del proyecto para esta especie</CardTitle>
          <Button variant="outline" className="text-xs" disabled={soloLectura || cargando} onClick={() => void cargarDelProyecto()}>
            <DatabaseZap size={13} aria-hidden /> {cargando ? "Cargando…" : "Cargar datos del proyecto"}
          </Button>
        </CardHeader>
        {auto.proyecto ? (
          <DatosProyecto datos={auto.proyecto} />
        ) : (
          // dataset-service sin actualizar: contesta la ficha sin `auto.proyecto`. No se inventa nada.
          <p className="text-sm text-label-secondary">
            El servidor no devolvió los datos del proyecto de esta especie. Probablemente dataset-service está en una versión anterior
            al panel; hay que actualizarlo para ver y cargar estos datos.
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Card>
            <CardTitle className="mb-1">Identidad, estado y toxicidad</CardTitle>
            <SeVeEn app="ficha, Explorar, carrusel" web="ficha, búsqueda" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre común en español" hint="Con fuente: quién lo confirma o de dónde sale. Acepta un enlace https://…">
                <Input
                  disabled={soloLectura}
                  value={campos.nombre_comun?.valor ?? ""}
                  onChange={(e) => actualizar("nombre_comun", { valor: e.target.value || null, fuente: campos.nombre_comun?.fuente ?? null })}
                />
              </Field>
              <Field label="Fuente del nombre común">
                <Input
                  disabled={soloLectura}
                  value={campos.nombre_comun?.fuente ?? ""}
                  onChange={(e) => actualizar("nombre_comun", { valor: campos.nombre_comun?.valor ?? null, fuente: e.target.value || null })}
                />
              </Field>
              <Field label="Autoría del nombre científico" hint="Ej. Myers & Daly, 1976.">
                <Input disabled={soloLectura} value={campos.autoria ?? ""} onChange={(e) => actualizar("autoria", e.target.value || null)} />
              </Field>
              <Field label="Otros nombres comunes" hint="Uno por línea. Sirven para buscar.">
                <Textarea
                  disabled={soloLectura}
                  rows={2}
                  value={aLineas(campos.otros_nombres)}
                  onChange={(e) => actualizar("otros_nombres", deLineas(e.target.value))}
                />
              </Field>
              <Field label="Sinónimos" className="sm:col-span-2" hint="Nombres científicos anteriores, uno por línea.">
                <Textarea
                  disabled={soloLectura}
                  rows={2}
                  value={aLineas(campos.sinonimos)}
                  onChange={(e) => actualizar("sinonimos", deLineas(e.target.value))}
                />
              </Field>
              <Field label="Estado de conservación (UICN)">
                <Select
                  disabled={soloLectura}
                  value={campos.uicn?.categoria ?? ""}
                  onChange={(e) =>
                    actualizar("uicn", {
                      categoria: (e.target.value || null) as UicnCategoria | null,
                      anio: campos.uicn?.anio ?? null,
                      fuente: campos.uicn?.fuente ?? null,
                    })
                  }
                >
                  <option value="">Sin dato</option>
                  {UICN_OPCIONES.map((u) => (
                    <option key={u} value={u}>
                      {UICN_LABEL[u]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Año de la ficha UICN">
                <Input
                  type="number"
                  disabled={soloLectura}
                  value={campos.uicn?.anio ?? ""}
                  onChange={(e) =>
                    actualizar("uicn", { categoria: campos.uicn?.categoria ?? null, anio: e.target.value ? Number(e.target.value) : null, fuente: campos.uicn?.fuente ?? null })
                  }
                />
              </Field>
              <Field label="Fuente de la UICN" className="sm:col-span-2" hint="Pega el enlace de la ficha (https://www.iucnredlist.org/species/…) o escribe IUCN Red List y el año. Un enlace se ve como botón en la web.">
                <Input
                  disabled={soloLectura}
                  value={campos.uicn?.fuente ?? ""}
                  onChange={(e) => actualizar("uicn", { categoria: campos.uicn?.categoria ?? null, anio: campos.uicn?.anio ?? null, fuente: e.target.value || null })}
                />
              </Field>
              <Field label="Toxicidad">
                <Select
                  disabled={soloLectura}
                  value={campos.toxicidad?.nivel ?? ""}
                  onChange={(e) =>
                    actualizar("toxicidad", { nivel: (e.target.value || null) as NivelToxicidad | null, nota: campos.toxicidad?.nota ?? null, fuente: campos.toxicidad?.fuente ?? null })
                  }
                >
                  <option value="">Sin dato</option>
                  {(Object.keys(TOXICIDAD_LABEL) as NivelToxicidad[]).map((t) => (
                    <option key={t} value={t}>
                      {TOXICIDAD_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Nota de toxicidad">
                <Input
                  disabled={soloLectura}
                  value={campos.toxicidad?.nota ?? ""}
                  onChange={(e) => actualizar("toxicidad", { nivel: campos.toxicidad?.nivel ?? null, nota: e.target.value || null, fuente: campos.toxicidad?.fuente ?? null })}
                />
              </Field>
              <Field label="Fuente de la toxicidad" className="sm:col-span-2">
                <Input
                  disabled={soloLectura}
                  value={campos.toxicidad?.fuente ?? ""}
                  onChange={(e) => actualizar("toxicidad", { nivel: campos.toxicidad?.nivel ?? null, nota: campos.toxicidad?.nota ?? null, fuente: e.target.value || null })}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle className="mb-1">Dónde vive</CardTitle>
            <SeVeEn app="ficha (altitud), carrusel «Dónde buscarla»" web="ficha (altitud, hábitat, distribución)" />
            <p className="mb-3 text-xs text-label-secondary">
              Altitud de registros y subregiones son automáticas (salen de las observaciones curadas); se ven en{" "}
              <Link href="/ficha-especie" className="text-accent-ink underline decoration-dotted underline-offset-2">
                Ficha
              </Link>
              , no se repiten aquí.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Altitud según la literatura, mínima (m)">
                <Input
                  type="number"
                  disabled={soloLectura}
                  value={campos.altitud_literatura?.min ?? ""}
                  onChange={(e) => actualizar("altitud_literatura", { min: e.target.value ? Number(e.target.value) : null, max: campos.altitud_literatura?.max ?? null, fuente: campos.altitud_literatura?.fuente ?? null })}
                />
              </Field>
              <Field label="Altitud según la literatura, máxima (m)">
                <Input
                  type="number"
                  disabled={soloLectura}
                  value={campos.altitud_literatura?.max ?? ""}
                  onChange={(e) => actualizar("altitud_literatura", { min: campos.altitud_literatura?.min ?? null, max: e.target.value ? Number(e.target.value) : null, fuente: campos.altitud_literatura?.fuente ?? null })}
                />
              </Field>
              <Field label="Fuente de la altitud de literatura" className="sm:col-span-2">
                <Input
                  disabled={soloLectura}
                  value={campos.altitud_literatura?.fuente ?? ""}
                  onChange={(e) => actualizar("altitud_literatura", { min: campos.altitud_literatura?.min ?? null, max: campos.altitud_literatura?.max ?? null, fuente: e.target.value || null })}
                />
              </Field>
              <Field label="Hábitat y microhábitat" className="sm:col-span-2" hint="En palabras, para «Dónde buscarla» del carrusel.">
                <Textarea
                  disabled={soloLectura}
                  value={campos.habitat?.texto ?? ""}
                  onChange={(e) => actualizar("habitat", e.target.value ? { texto: e.target.value } : null)}
                />
              </Field>
              <Field label="Distribución" className="sm:col-span-2" hint="En una frase. Ej. «Endémica de Antioquia, en bosque húmedo del Magdalena Medio».">
                <Textarea
                  disabled={soloLectura}
                  rows={2}
                  value={campos.distribucion ?? ""}
                  onChange={(e) => actualizar("distribucion", e.target.value || null)}
                />
              </Field>
              <Field label="¿Es endémica?">
                <Select
                  disabled={soloLectura}
                  value={campos.endemismo?.endemica == null ? "" : String(campos.endemismo.endemica)}
                  onChange={(e) =>
                    actualizar("endemismo", {
                      endemica: e.target.value === "" ? null : e.target.value === "true",
                      alcance: campos.endemismo?.alcance ?? null,
                      fuente: campos.endemismo?.fuente ?? null,
                    })
                  }
                >
                  <option value="">Sin dato</option>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </Select>
              </Field>
              <Field label="Endémica de" hint="Ej. Colombia, Cordillera Central.">
                <Input
                  disabled={soloLectura}
                  value={campos.endemismo?.alcance ?? ""}
                  onChange={(e) =>
                    actualizar("endemismo", { endemica: campos.endemismo?.endemica ?? null, alcance: e.target.value || null, fuente: campos.endemismo?.fuente ?? null })
                  }
                />
              </Field>
              <Field label="Fuente del endemismo" className="sm:col-span-2">
                <Input
                  disabled={soloLectura}
                  value={campos.endemismo?.fuente ?? ""}
                  onChange={(e) =>
                    actualizar("endemismo", { endemica: campos.endemismo?.endemica ?? null, alcance: campos.endemismo?.alcance ?? null, fuente: e.target.value || null })
                  }
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle className="mb-1">Cómo reconocerla</CardTitle>
            <SeVeEn app="ficha (tamaño), pestañas Morfología y Similares" web="ficha (morfología, rasgos diagnósticos)" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Longitud hocico-cloaca (LHC), mínima (mm)">
                <Input
                  type="number"
                  disabled={soloLectura}
                  value={campos.lhc?.min ?? ""}
                  onChange={(e) => actualizar("lhc", { min: e.target.value ? Number(e.target.value) : null, max: campos.lhc?.max ?? null, fuente: campos.lhc?.fuente ?? null })}
                />
              </Field>
              <Field label="LHC máxima (mm)">
                <Input
                  type="number"
                  disabled={soloLectura}
                  value={campos.lhc?.max ?? ""}
                  onChange={(e) => actualizar("lhc", { min: campos.lhc?.min ?? null, max: e.target.value ? Number(e.target.value) : null, fuente: campos.lhc?.fuente ?? null })}
                />
              </Field>
              <Field label="Fuente de la LHC" className="sm:col-span-2">
                <Input
                  disabled={soloLectura}
                  value={campos.lhc?.fuente ?? ""}
                  onChange={(e) => actualizar("lhc", { min: campos.lhc?.min ?? null, max: campos.lhc?.max ?? null, fuente: e.target.value || null })}
                />
              </Field>
              {(["timpano", "discos", "pliegues", "patron_dorsal", "patron_ventral", "membranas"] as const).map((k) => (
                <Field
                  key={k}
                  label={{ timpano: "Tímpano", discos: "Discos", pliegues: "Pliegues", patron_dorsal: "Patrón dorsal", patron_ventral: "Patrón ventral", membranas: "Membranas" }[k]}
                >
                  <Input
                    disabled={soloLectura}
                    value={campos.morfologia?.[k] ?? ""}
                    onChange={(e) =>
                      actualizar("morfologia", {
                        timpano: null, discos: null, pliegues: null, patron_dorsal: null, patron_ventral: null, membranas: null,
                        ...campos.morfologia,
                        [k]: e.target.value || null,
                      })
                    }
                  />
                </Field>
              ))}
              <Field label="Rasgos diagnósticos" className="sm:col-span-2" hint="Lo que la separa de las parecidas. Uno por línea.">
                <Textarea
                  disabled={soloLectura}
                  rows={3}
                  value={aLineas(campos.morfologia?.diagnosticos)}
                  onChange={(e) =>
                    actualizar("morfologia", {
                      timpano: null, discos: null, pliegues: null, patron_dorsal: null, patron_ventral: null, membranas: null,
                      ...campos.morfologia,
                      diagnosticos: deLineas(e.target.value),
                    })
                  }
                />
              </Field>
            </div>
            <p className="mb-2 mt-4 text-sm font-medium text-label-primary">Especies con las que se confunde</p>
            <p className="mb-2 text-xs text-label-secondary">Aparecen en la pestaña Similares de la app.</p>
            <div className="flex flex-wrap gap-1.5">
              {lista
                .filter((o) => o.especie_id !== especieId)
                .map((o) => {
                  const en = (campos.especies_confusion ?? []).includes(o.especie_id);
                  return (
                    <button
                      key={o.especie_id}
                      type="button"
                      disabled={soloLectura}
                      aria-pressed={en}
                      onClick={() => {
                        const actual = campos.especies_confusion ?? [];
                        const nueva = en ? actual.filter((id) => id !== o.especie_id) : [...actual, o.especie_id];
                        actualizar("especies_confusion", nueva.length ? nueva : null);
                      }}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs italic",
                        en ? "border-accent bg-accent-wash text-accent-ink" : "border-border text-label-secondary hover:bg-surface-subtle"
                      )}
                    >
                      {o.nombre_cientifico}
                    </button>
                  );
                })}
            </div>
          </Card>

          <Card>
            <CardTitle className="mb-1">Historia natural</CardTitle>
            <SeVeEn web="ficha («¿Qué es?», actividad, dieta, reproducción, amenazas)" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Descripción" className="sm:col-span-2" hint="Qué es y cómo es, en lenguaje llano. Máximo 1.200 caracteres.">
                <Textarea
                  disabled={soloLectura}
                  rows={4}
                  maxLength={1200}
                  value={campos.descripcion ?? ""}
                  onChange={(e) => actualizar("descripcion", e.target.value || null)}
                />
              </Field>
              <Field label="Actividad">
                <Select
                  disabled={soloLectura}
                  value={campos.actividad ?? ""}
                  onChange={(e) => actualizar("actividad", (e.target.value || null) as Actividad | null)}
                >
                  <option value="">Sin dato</option>
                  {(Object.keys(ACTIVIDAD_LABEL) as Actividad[]).map((a) => (
                    <option key={a} value={a}>
                      {ACTIVIDAD_LABEL[a]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Dieta">
                <Input disabled={soloLectura} value={campos.dieta ?? ""} onChange={(e) => actualizar("dieta", e.target.value || null)} />
              </Field>
              <Field label="Reproducción" className="sm:col-span-2" hint="Ej. desarrollo directo, sin renacuajo.">
                <Textarea
                  disabled={soloLectura}
                  rows={2}
                  value={campos.reproduccion ?? ""}
                  onChange={(e) => actualizar("reproduccion", e.target.value || null)}
                />
              </Field>
              <Field label="Amenazas" hint="Una por línea.">
                <Textarea
                  disabled={soloLectura}
                  rows={3}
                  value={aLineas(campos.amenazas?.lista)}
                  onChange={(e) => {
                    const lista = deLineas(e.target.value);
                    actualizar("amenazas", lista || campos.amenazas?.fuente ? { lista: lista ?? [], fuente: campos.amenazas?.fuente ?? null } : null);
                  }}
                />
              </Field>
              <Field label="Fuente de las amenazas">
                <Input
                  disabled={soloLectura}
                  value={campos.amenazas?.fuente ?? ""}
                  onChange={(e) => actualizar("amenazas", { lista: campos.amenazas?.lista ?? [], fuente: e.target.value || null })}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle className="mb-1">Dato curioso y fotos</CardTitle>
            <SeVeEn app="ficha, carrusel" web="ficha" />
            <Field label="Dato curioso" hint="Máximo 120 caracteres, se muestra en la ficha y el carrusel.">
              <Textarea
                disabled={soloLectura}
                maxLength={120}
                value={campos.dato_curioso?.valor ?? ""}
                onChange={(e) => actualizar("dato_curioso", { valor: e.target.value || null, fuente: campos.dato_curioso?.fuente ?? null })}
              />
            </Field>
            <Field label="Fuente del dato curioso" className="mt-3">
              <Input
                disabled={soloLectura}
                value={campos.dato_curioso?.fuente ?? ""}
                onChange={(e) => actualizar("dato_curioso", { valor: campos.dato_curioso?.valor ?? null, fuente: e.target.value || null })}
              />
            </Field>

            <p className="mb-2 mt-4 text-sm font-medium text-label-primary">Foto principal</p>
            {fotosCC.length === 0 ? (
              <p className="text-sm text-label-secondary">
                Ninguna foto de esta especie tiene licencia Creative Commons todavía; sin eso no se puede publicar la ficha.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {fotosCC.map((f) => (
                  <button
                    key={f.sha256}
                    type="button"
                    disabled={soloLectura}
                    onClick={() => setFotoPrincipal(f.sha256 === fotoPrincipal ? null : f.sha256)}
                    className={cn(
                      "relative aspect-square overflow-hidden rounded-md border-2",
                      f.sha256 === fotoPrincipal ? "border-accent" : "border-transparent"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada, vence en 10 min */}
                    <img src={f.url} alt={f.archivo_original} className="h-full w-full object-cover" />
                    {f.sha256 === fotoPrincipal && (
                      <span className="absolute right-1 top-1 rounded-full bg-accent p-0.5 text-accent-fg">
                        <CheckCircle2 size={12} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <p className="mb-2 mt-4 text-sm font-medium text-label-primary">Galería (opcional)</p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {fotosCC.map((f) => {
                const en = galeria.includes(f.sha256);
                return (
                  <button
                    key={f.sha256}
                    type="button"
                    disabled={soloLectura}
                    onClick={() => setGaleria((g) => (en ? g.filter((s) => s !== f.sha256) : [...g, f.sha256]))}
                    className={cn("relative aspect-square overflow-hidden rounded-md border-2", en ? "border-accent" : "border-transparent")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada, vence en 10 min */}
                    <img src={f.url} alt={f.archivo_original} className="h-full w-full object-cover" />
                    {en && (
                      <span className="absolute right-1 top-1 rounded-full bg-accent p-0.5 text-accent-fg">
                        <CheckCircle2 size={12} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="sticky top-4">
            <CardTitle className="mb-3">Vista previa</CardTitle>
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="flex aspect-[4/3] items-center justify-center bg-surface-subtle">
                {fotoSeleccionada ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL firmada, vence en 10 min
                  <img src={fotoSeleccionada.url} alt={especie.nombre_cientifico} className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon size={28} className="text-label-tertiary" />
                )}
              </div>
              <div className="space-y-2 p-3">
                <p className="text-base font-semibold text-label-primary">
                  {campos.nombre_comun?.valor || <span className="italic">{especie.nombre_cientifico}</span>}
                </p>
                {campos.nombre_comun?.valor && <p className="text-xs italic text-label-tertiary">{especie.nombre_cientifico}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {campos.uicn?.categoria && (
                    <Badge tone={AMENAZADA.includes(campos.uicn.categoria) ? "danger" : "neutral"}>
                      {campos.uicn.categoria === "VU" || campos.uicn.categoria === "EN" || campos.uicn.categoria === "CR"
                        ? "Especie amenazada"
                        : UICN_LABEL[campos.uicn.categoria]}
                    </Badge>
                  )}
                  {campos.toxicidad?.nivel && (
                    <Badge tone={campos.toxicidad.nivel === "inofensiva" ? "neutral" : "warning"}>{TOXICIDAD_LABEL[campos.toxicidad.nivel]}</Badge>
                  )}
                </div>
                {campos.habitat?.texto && <p className="text-xs text-label-secondary">{campos.habitat.texto}</p>}
                {campos.dato_curioso?.valor && <p className="text-xs italic text-label-secondary">&ldquo;{campos.dato_curioso.valor}&rdquo;</p>}
                <p className="text-xs text-label-tertiary">{plural(auto.fotos_referencia, "foto", "fotos")} de referencia</p>
                {fotoSeleccionada?.atribucion && <p className="text-[11px] text-label-tertiary">Foto: {fotoSeleccionada.atribucion}</p>}
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={devolviendo} onOpenChange={setDevolviendo}>
        <DialogHeader title="¿Devolver la ficha a borrador?" description="Vuelve a editarse; hay que enviarla a revisión otra vez para publicarla." />
        <DevolverForm
          onCancelar={() => setDevolviendo(false)}
          onConfirmar={(motivo) => {
            setDevolviendo(false);
            accion(() => devolverABorrador(especieId, motivo), "Devuelta a borrador.");
          }}
        />
      </Dialog>
    </div>
  );
}

function DevolverForm({ onCancelar, onConfirmar }: { onCancelar: () => void; onConfirmar: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState("");
  return (
    <div className="space-y-3">
      <Field label="Motivo (opcional)">
        <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button variant="danger" onClick={() => onConfirmar(motivo)}>
          Devolver a borrador
        </Button>
      </div>
    </div>
  );
}
