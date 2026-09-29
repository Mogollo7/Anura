"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2, Lock, Mountain, Ruler, Sparkles } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { usePanelSession } from "@/lib/session/panel-session";
import { getEtiquetas, getResumen, type DatasetEspecie } from "@/lib/dataset/dataset-client";
import { MIN_INDIVIDUOS } from "@/lib/dataset/reglas";
import { SUSTRATO_LABEL, type EtiquetasEspecie, type Sustrato } from "@/lib/dataset/etiquetas";
import {
  calcularAltitudes,
  getFichaTecnica,
  guardarAjustesFicha,
  type FichaTecnica,
  type LrcMetodo,
  type PerfilPesos,
} from "@/lib/dataset/ficha";

const slug = (nombre: string) => nombre.trim().toLowerCase().replace(/\s+/g, "-");
const num = (v: number, dec = 0) => v.toLocaleString("es-CO", { maximumFractionDigits: dec });

const ESTADO_FICHA: Record<string, string> = {
  DRAFT: "Sin fotos suficientes",
  DATASET_READY: "Dataset listo",
  EMBEDDINGS_READY: "Vectores listos",
  CENTROID_READY: "Centroide listo",
};

const PERFIL_LABEL: Record<PerfilPesos, string> = {
  generalista: "Generalista",
  endemica_montana: "Endémica de montaña",
  especialista_quebrada: "Especialista de quebrada",
  par_criptico: "Par críptico / indefinido",
};

/** Ficha técnica de una especie del dataset: lo calculado sale del servidor; lo que decide una persona se guarda ahí. */
export function SpeciesSheetManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [especies, setEspecies] = useState<DatasetEspecie[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    getResumen()
      .then((r) => !cancelado && setEspecies([...r.especies].sort((a, b) => a.nombre_cientifico.localeCompare(b.nombre_cientifico))))
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, []);

  if (error) return <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">No se pudo cargar el dataset: {error}</p>;
  if (!especies) return <p className="text-sm text-label-secondary">Cargando especies…</p>;
  if (!especies.length) {
    return (
      <Card>
        <p className="text-sm text-label-secondary">
          Aún no hay especies en el dataset. Para empezar, importa las fotos de una especie y luego vuelve a esta pantalla.
        </p>
      </Card>
    );
  }

  // ?especie= acepta el id del servidor o el nombre científico con guiones (los enlaces de Curación).
  const param = searchParams.get("especie") ?? "";
  const selected = especies.find((e) => String(e.id) === param) ?? especies.find((e) => slug(e.nombre_cientifico) === param) ?? especies[0];

  return (
    <div className="space-y-6">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-label-secondary">Especie</span>
        <Select
          value={selected.id}
          onChange={(e) => router.push(`/ficha-especie?especie=${e.target.value}`)}
          className="min-w-[280px]"
        >
          {especies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre_cientifico}
            </option>
          ))}
        </Select>
      </label>
      <SpeciesDetail key={selected.id} especieId={selected.id} slugEspecie={slug(selected.nombre_cientifico)} />
    </div>
  );
}

function SpeciesDetail({ especieId, slugEspecie }: { especieId: number; slugEspecie: string }) {
  const session = usePanelSession();
  const canPesos = session.can("definirPesos");
  const canContexto = session.can("definirMicrohabitat");
  const canLrc = session.can("definirLRC");

  const [ficha, setFicha] = useState<FichaTecnica | null>(null);
  const [etiquetas, setEtiquetas] = useState<EtiquetasEspecie | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [f, e] = await Promise.all([getFichaTecnica(especieId), getEtiquetas(especieId)]);
      setFicha(f);
      setEtiquetas(e);
      setErrorCarga(null);
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : "No se pudo cargar la ficha");
    }
  }, [especieId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (errorCarga && !ficha) return <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">No se pudo cargar la ficha: {errorCarga}</p>;
  if (!ficha) return <p className="text-sm text-label-secondary">Cargando ficha…</p>;

  const estadoTone = ficha.dataset.estado === "DRAFT" ? "danger" : ficha.dataset.estado === "DATASET_READY" ? "info" : "accent";
  const hrefImagenes = `/curacion?especie=${slugEspecie}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <Badge tone="neutral" className="mb-0.5">
          Dataset {ficha.dataset.version ?? "sin versión"}
        </Badge>
        <Badge tone={estadoTone} className="mb-0.5">
          {ESTADO_FICHA[ficha.dataset.estado] ?? ficha.dataset.estado}
        </Badge>
        <span className="mb-1 text-xs text-label-tertiary">
          {num(ficha.dataset.fotos_activas)} fotos activas · {ficha.dataset.individuos} individuos
          {!ficha.dataset.entrenable && ` · para entrenar se necesitan ${ficha.dataset.min_fotos} fotos y ${ficha.dataset.min_individuos} individuos`}
          {" · "}
          <Link href="/centroides" className="text-accent-ink hover:underline">
            Centroides
          </Link>
        </span>
      </div>

      {(!canPesos || !canContexto || !canLrc) && (
        <p className="flex items-center gap-1.5 text-xs text-label-tertiary">
          <Lock size={11} /> {session.acting?.name} ve la ficha completa; editar{" "}
          {[!canContexto && "altitud (Definir microhábitat)", !canPesos && "pesos", !canLrc && "LRC"].filter(Boolean).join(", ")} necesita permiso.
        </p>
      )}

      <PerfilEcologico ficha={ficha} especieId={especieId} hrefImagenes={hrefImagenes} canContexto={canContexto} onCambio={cargar} onFicha={setFicha} />
      <PesosCard ficha={ficha} especieId={especieId} canPesos={canPesos} onFicha={setFicha} />
      <MorfosCard etiquetas={etiquetas} hrefImagenes={hrefImagenes} />
      <LrcCard ficha={ficha} especieId={especieId} canLrc={canLrc} onFicha={setFicha} />

      <p className="flex items-center gap-1.5 rounded-md bg-surface-subtle px-3 py-2 text-xs text-label-tertiary">
        <AlertTriangle size={13} />{" "}
        <span>
          Complejo críptico y calibración OSR de esta especie se configuran en{" "}
          <Link href="/micro-adaptadores" className="underline">
            Micro-adaptadores
          </Link>{" "}
          y{" "}
          <Link href="/osr" className="underline">
            OSR
          </Link>
          . La media y la desviación de altitud de esta ficha son las que usa la capa geográfica del OSR.
        </span>
      </p>
    </div>
  );
}

/** Por qué no hay altitud todavía y qué hacer, en orden de lo que más frena. */
function motivoSinAltitud(f: FichaTecnica): string {
  const o = f.observaciones;
  if (o.validas === 0) return "Esta especie no tiene observaciones válidas. Sube fotos con su coordenada en Imágenes.";
  if (o.falta_altitud > 0) return `Hay ${o.falta_altitud} observaciones con coordenada y sin altitud. Pulsa «Calcular altitudes faltantes».`;
  if (o.sin_limpiar > 0 || o.solo_celda > 0) {
    return `${o.sin_limpiar + o.solo_celda} observaciones esperan la limpieza de coordenadas: decídelas en Calidad y vuelve.`;
  }
  if (o.sin_coordenada > 0) return "Ninguna observación tiene coordenada, y sin coordenada no hay altitud.";
  return "Las observaciones válidas no tienen altitud disponible en el servicio de elevación.";
}

function PerfilEcologico({
  ficha,
  especieId,
  hrefImagenes,
  canContexto,
  onCambio,
  onFicha,
}: {
  ficha: FichaTecnica;
  especieId: number;
  hrefImagenes: string;
  canContexto: boolean;
  onCambio: () => Promise<void>;
  onFicha: (f: FichaTecnica) => void;
}) {
  const { altitud, observaciones: obs, sustrato } = ficha;
  const r = altitud.resumen;
  const [calculando, setCalculando] = useState<{ hechas: number } | null>(null);
  const [avisoAltitud, setAvisoAltitud] = useState<string | null>(null);
  const [errorAltitud, setErrorAltitud] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<{ min: string; max: string } | null>(null);
  const [errorRango, setErrorRango] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function calcular() {
    setCalculando({ hechas: 0 });
    setErrorAltitud(null);
    setAvisoAltitud(null);
    let desde = 0;
    let con = 0;
    let sin = 0;
    try {
      for (;;) {
        const lote = await calcularAltitudes({ especie_id: especieId, desde_id: desde });
        con += lote.con_altitud;
        sin += lote.sin_dato;
        setCalculando({ hechas: con + sin });
        if (lote.siguiente_id === null) break;
        desde = lote.siguiente_id;
      }
      setAvisoAltitud(
        `${con} altitudes calculadas${sin ? `; ${sin} sin dato en el servicio de elevación (fuera de su cobertura o sin respuesta: vuelve a intentarlo más tarde)` : ""}.`
      );
    } catch (err) {
      setErrorAltitud(err instanceof Error ? err.message : "No se pudieron calcular las altitudes");
    } finally {
      setCalculando(null);
      await onCambio();
    }
  }

  const efectivo = altitud.efectivo;
  const valorBorrador = borrador ?? { min: efectivo ? String(efectivo.min) : "", max: efectivo ? String(efectivo.max) : "" };

  async function guardarRango(rango: { min: number; max: number } | null) {
    setGuardando(true);
    setErrorRango(null);
    try {
      onFicha(await guardarAjustesFicha(especieId, { altitud: rango }));
      setBorrador(null);
    } catch (err) {
      setErrorRango(err instanceof Error ? err.message : "No se pudo guardar el rango");
    } finally {
      setGuardando(false);
    }
  }

  function guardarManual() {
    const min = Number(valorBorrador.min.replace(",", "."));
    const max = Number(valorBorrador.max.replace(",", "."));
    if (valorBorrador.min.trim() === "" || valorBorrador.max.trim() === "" || !Number.isFinite(min) || !Number.isFinite(max)) {
      setErrorRango("Escribe el mínimo y el máximo en metros.");
      return;
    }
    void guardarRango({ min, max });
  }

  const sustratoMax = sustrato.priors ? Math.max(...Object.values(sustrato.priors)) : 0;

  return (
    <Card>
      <CardHeader className="mb-3">
        <CardTitle>
          <Mountain size={14} className="mr-1.5 inline" aria-hidden /> Perfil ecológico
        </CardTitle>
      </CardHeader>
      <p className="mb-3 text-sm text-label-secondary">
        La altitud sale de las observaciones válidas de la especie (sin invalidar y con al menos una foto activa), con la coordenada que
        decidió la limpieza. El sustrato sale de lo que se etiquetó en{" "}
        <Link href={hrefImagenes} className="text-accent-ink hover:underline">
          Imágenes
        </Link>
        .
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-label-secondary">Altitud (media ± desviación)</p>
          {r ? (
            <>
              <p className="text-lg font-semibold">
                {num(r.media)} m <span className="text-sm text-label-tertiary">± {num(r.desviacion)} m</span>
              </p>
              <p className="text-xs text-label-tertiary">
                {r.n} observaciones · mínimo {num(r.min)} m · máximo {num(r.max)} m
              </p>
              {r.poco_confiable && (
                <p className="mt-1 flex items-center gap-1 text-xs text-warning">
                  <AlertTriangle size={11} aria-hidden /> Pocas observaciones (menos de {altitud.min_puntos}): la desviación y los percentiles todavía no dicen mucho.
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm text-label-secondary">Sin altitudes todavía: {motivoSinAltitud(ficha)}</p>
          )}
          <p className="mt-2 text-xs text-label-tertiary">
            Subregiones con registros:{" "}
            {ficha.subregiones === null
              ? `no se pudieron ubicar (${ficha.subregiones_motivo}).`
              : ficha.subregiones.length
                ? ficha.subregiones.map((s) => s.nombre).join(", ")
                : (ficha.subregiones_motivo ?? "ninguna todavía.")}
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs text-label-secondary">Prior de sustrato (calculado)</p>
          {sustrato.priors ? (
            <>
              <div className="space-y-1">
                {(Object.keys(sustrato.priors) as Sustrato[]).map((k) => (
                  <div key={k} className="flex items-center gap-2 text-xs">
                    <span className="w-28 shrink-0 text-label-tertiary">{SUSTRATO_LABEL[k]}</span>
                    <div className="h-1.5 flex-1 rounded-full bg-surface-subtle">
                      <div className="h-1.5 rounded-full bg-accent-ink" style={{ width: `${(sustrato.priors![k] / (sustratoMax || 1)) * 100}%` }} />
                    </div>
                    <span className="w-8 text-right">{sustrato.priors![k].toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-label-tertiary">
                {sustrato.n} individuos con sustrato etiquetado. Proporción por sustrato con piso de 0,01: un 0 anularía la capa de hábitat.
              </p>
            </>
          ) : (
            <p className="text-sm text-label-secondary">
              Sin sustrato todavía: ningún individuo tiene sustrato etiquetado. Asígnalo en{" "}
              <Link href={hrefImagenes} className="text-accent-ink hover:underline">
                Imágenes
              </Link>
              .
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="text-xs" disabled={!canContexto || !!calculando} onClick={calcular}>
            {calculando ? <Loader2 size={12} className="animate-spin" aria-hidden /> : !canContexto && <Lock size={12} aria-hidden />}
            {calculando ? `Calculando… ${calculando.hechas}` : "Calcular altitudes faltantes"}
          </Button>
          <span className="text-xs text-label-tertiary">
            {num(obs.con_altitud)} de {num(obs.validas)} observaciones con altitud
            {obs.falta_altitud > 0 && ` · ${obs.falta_altitud} por calcular`}
            {obs.sin_limpiar > 0 && ` · ${obs.sin_limpiar} esperan la limpieza`}
            {obs.solo_celda > 0 && ` · ${obs.solo_celda} solo a nivel de celda`}
            {obs.sin_coordenada > 0 && ` · ${obs.sin_coordenada} sin coordenada`}
          </span>
        </div>
        {avisoAltitud && <p role="status" className="mt-2 text-xs text-label-secondary">{avisoAltitud}</p>}
        {errorAltitud && <p role="alert" className="mt-2 text-sm text-danger">{errorAltitud}</p>}
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <p className="mb-2 text-xs font-medium text-label-secondary">Rango de altitud efectivo (mínimo–máximo)</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Mínimo (m)">
            <Input
              type="number"
              value={valorBorrador.min}
              disabled={!canContexto}
              onChange={(e) => { setBorrador({ ...valorBorrador, min: e.target.value }); setErrorRango(null); }}
              className="w-28"
            />
          </Field>
          <Field label="Máximo (m)">
            <Input
              type="number"
              value={valorBorrador.max}
              disabled={!canContexto}
              onChange={(e) => { setBorrador({ ...valorBorrador, max: e.target.value }); setErrorRango(null); }}
              className="w-28"
            />
          </Field>
          <Button variant="primary" className="text-xs" disabled={!canContexto || guardando} onClick={guardarManual}>
            {!canContexto && <Lock size={12} aria-hidden />} Guardar como manual
          </Button>
          {altitud.manual && (
            <Button variant="outline" className="text-xs" disabled={!canContexto || guardando} onClick={() => guardarRango(null)}>
              Volver al calculado
            </Button>
          )}
        </div>
        {errorRango && <p role="alert" className="mt-1 text-xs text-danger">{errorRango}</p>}
        <p className="mt-1 text-xs text-label-tertiary">
          {efectivo
            ? `Efectivo: ${efectivo.origen === "manual" ? "manual" : "calculado"}, ${num(efectivo.min)}–${num(efectivo.max)} m. `
            : "Sin rango: no hay altitudes ni rango manual. "}
          {altitud.calculado
            ? `Calculado: percentiles 5 y 95 de las altitudes (${num(altitud.calculado.min)}–${num(altitud.calculado.max)} m), para que un GPS malo no estire el rango.`
            : "El calculado es el percentil 5 al 95 de las altitudes, y aparece cuando haya observaciones con altitud."}
        </p>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <p className="mb-2 text-xs font-medium text-label-secondary">Altitudes atípicas</p>
        {altitud.atipicas.length === 0 ? (
          <p className="text-xs text-label-tertiary">
            {r && r.n >= altitud.min_puntos
              ? "Ninguna observación se aleja de la mediana más de lo esperable."
              : `Se revisan cuando hay al menos ${altitud.min_puntos} observaciones con altitud.`}
          </p>
        ) : (
          <>
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {altitud.atipicas.map((a) => (
                <li key={a.observacion_id} className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/5 px-2.5 py-1.5 text-xs">
                  <Badge tone="warning" className="text-[11px]">
                    <AlertTriangle size={9} aria-hidden /> {num(a.altitud_m)} m
                  </Badge>
                  <span className="text-label-secondary">
                    {num(Math.abs(a.desviacion_m))} m {a.desviacion_m > 0 ? "por encima" : "por debajo"} de la mediana ({num(a.mediana_m)} m)
                  </span>
                  <span className="text-label-tertiary">
                    {a.fuente === "manual" ? "subida a mano" : `iNaturalist ${a.fuente_id ?? ""}`} · observación {a.observacion_id}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-label-tertiary">
              Mismo criterio que la limpieza (mediana y MAD) más una distancia mínima de 150 m a la mediana. Si el GPS está mal, invalida la
              observación en{" "}
              <Link href={hrefImagenes} className="text-accent-ink hover:underline">
                Imágenes
              </Link>
              ; la altitud se recalcula sola.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

function PesosCard({
  ficha,
  especieId,
  canPesos,
  onFicha,
}: {
  ficha: FichaTecnica;
  especieId: number;
  canPesos: boolean;
  onFicha: (f: FichaTecnica) => void;
}) {
  const { pesos } = ficha;
  const base = pesos.efectivo;
  const [borrador, setBorrador] = useState<{ wv: string; wg: string; wm: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const valor = borrador ?? { wv: base ? String(base.wv) : "", wg: base ? String(base.wg) : "", wm: base ? String(base.wm) : "" };

  async function guardar(cuerpo: { wv: number; wg: number; wm: number } | null) {
    setGuardando(true);
    setError(null);
    try {
      onFicha(await guardarAjustesFicha(especieId, { pesos: cuerpo }));
      setBorrador(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar los pesos");
    } finally {
      setGuardando(false);
    }
  }

  function guardarManual() {
    const n = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));
    const wv = n(valor.wv);
    const wg = n(valor.wg);
    const wm = n(valor.wm);
    if (![wv, wg, wm].every(Number.isFinite)) {
      setError("Escribe los tres pesos.");
      return;
    }
    void guardar({ wv, wg, wm });
  }

  const campo = (k: "wv" | "wg" | "wm", etiqueta: string) => (
    <label className="block space-y-1">
      <span className="text-label-secondary">{etiqueta}</span>
      <Input
        type="number"
        step="0.01"
        min={0}
        max={1}
        value={valor[k]}
        disabled={!canPesos}
        onChange={(e) => { setBorrador({ ...valor, [k]: e.target.value }); setError(null); }}
      />
    </label>
  );

  return (
    <Card>
      <CardHeader className="mb-3">
        <CardTitle>
          <Sparkles size={14} className="mr-1.5 inline" aria-hidden /> Pesos wv / wg / wm
        </CardTitle>
        {pesos.calculado && <Badge tone="neutral">{PERFIL_LABEL[pesos.calculado.perfil]}</Badge>}
      </CardHeader>
      <p className="mb-3 text-xs text-label-tertiary">
        Calculado: lo propone el perfil ecológico de arriba (desviación de altitud y sustrato), no una tabla fija. Manual: lo que el
        herpetólogo confirme aquí. Efectivo: el manual si existe, si no el calculado. Nunca se pisa en silencio.
      </p>
      {!pesos.calculado && pesos.motivo && <p className="mb-3 text-sm text-label-secondary">Sin pesos calculados todavía: {pesos.motivo}</p>}
      <div className="grid grid-cols-3 gap-3 text-xs">
        {campo("wv", "wv (visual)")}
        {campo("wg", "wg (geográfico)")}
        {campo("wm", "wm (microhábitat)")}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" className="text-xs" disabled={!canPesos || guardando} onClick={guardarManual}>
          {!canPesos && <Lock size={12} aria-hidden />} Guardar como manual
        </Button>
        {pesos.manual && (
          <Button variant="outline" className="text-xs" disabled={!canPesos || guardando} onClick={() => guardar(null)}>
            Volver al calculado
          </Button>
        )}
        <span className="text-xs text-label-tertiary">
          {base
            ? `Efectivo: ${base.origen === "manual" ? "manual" : "calculado"}, wv ${base.wv} · wg ${base.wg} · wm ${base.wm}`
            : "Sin pesos efectivos: escribe los tuyos o completa las altitudes y el sustrato."}
        </span>
      </div>
    </Card>
  );
}

function MorfosCard({ etiquetas, hrefImagenes }: { etiquetas: EtiquetasEspecie | null; hrefImagenes: string }) {
  const morfos = useMemo(() => etiquetas?.morfos ?? [], [etiquetas]);
  const porSubregion = useMemo(() => {
    const m = new Map<string, typeof morfos>();
    for (const x of morfos) m.set(x.subregion, [...(m.get(x.subregion) ?? []), x]);
    return [...m.entries()];
  }, [morfos]);

  return (
    <Card>
      <CardHeader className="mb-3">
        <CardTitle>Morfos por paquete</CardTitle>
        <Badge tone="neutral">{morfos.length}</Badge>
      </CardHeader>
      <p className="mb-3 text-xs text-label-tertiary">
        Los declara el herpetólogo, especie por especie y subregión por subregión. Un morfo no es una especie nueva.
        Aquí solo se ven: se declaran y se asignan a cada individuo en{" "}
        <Link href={hrefImagenes} className="text-accent-ink hover:underline">
          Imágenes
        </Link>
        .
      </p>
      {morfos.length === 0 ? (
        <p className="text-sm text-label-secondary">
          Sin morfos declarados: el centroide global es la única referencia. Si la especie tiene variantes de color o patrón, decláralas en Imágenes.
        </p>
      ) : (
        <div className="space-y-3">
          {porSubregion.map(([subregion, lista]) => (
            <div key={subregion}>
              <p className="mb-1 text-xs font-medium text-label-secondary">{subregion}</p>
              <ul className="space-y-1.5">
                {lista.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-xs">
                    <span>
                      <strong>{m.nombre}</strong>
                      {m.nota && <span className="text-label-tertiary"> · {m.nota}</span>}
                    </span>
                    <span className="text-label-tertiary">
                      {m.individuos === 1 ? "1 individuo" : `${m.individuos} individuos`}
                      {m.individuos >= MIN_INDIVIDUOS
                        ? " · alcanza para su sub-centroide"
                        : ` · faltan ${MIN_INDIVIDUOS - m.individuos} para su sub-centroide`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function LrcCard({
  ficha,
  especieId,
  canLrc,
  onFicha,
}: {
  ficha: FichaTecnica;
  especieId: number;
  canLrc: boolean;
  onFicha: (f: FichaTecnica) => void;
}) {
  const [borrador, setBorrador] = useState<{ metodo: LrcMetodo; min: string; max: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const valor = borrador ?? {
    metodo: ficha.lrc.metodo,
    min: ficha.lrc.min === null ? "" : String(ficha.lrc.min),
    max: ficha.lrc.max === null ? "" : String(ficha.lrc.max),
  };
  const cambiado = borrador !== null;

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const n = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
      onFicha(await guardarAjustesFicha(especieId, { lrc: { metodo: valor.metodo, min: n(valor.min), max: n(valor.max) } }));
      setBorrador(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la LRC");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card>
      <CardHeader className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle>
          <Ruler size={14} className="mr-1.5 inline" aria-hidden /> LRC (longitud rostro-cloaca)
        </CardTitle>
        <Badge tone="neutral">Fase 2 · todavía no la usa ningún paso</Badge>
      </CardHeader>
      <p className="mb-3 text-sm text-label-secondary">
        Se guarda para la Fase 2 (separar un juvenil de una especie grande de un adulto pequeño). Hoy no la leen el worker, el OSR ni el
        compilador: cambiarla no cambia el paquete. No hay mediciones reales que importar hasta conectar CVAT.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Método">
          <Select
            value={valor.metodo}
            disabled={!canLrc}
            onChange={(e) => { setBorrador({ ...valor, metodo: e.target.value as LrcMetodo }); setError(null); }}
          >
            <option value="pendiente">Pendiente</option>
            <option value="manual">Manual</option>
          </Select>
        </Field>
        {valor.metodo === "manual" && (
          <>
            <Field label="Mínimo (mm)">
              <Input type="number" value={valor.min} disabled={!canLrc} className="w-24" onChange={(e) => { setBorrador({ ...valor, min: e.target.value }); setError(null); }} />
            </Field>
            <Field label="Máximo (mm)">
              <Input type="number" value={valor.max} disabled={!canLrc} className="w-24" onChange={(e) => { setBorrador({ ...valor, max: e.target.value }); setError(null); }} />
            </Field>
          </>
        )}
        <Button variant="primary" className="text-xs" disabled={!canLrc || guardando || !cambiado} onClick={guardar}>
          {!canLrc && <Lock size={12} aria-hidden />} Guardar LRC
        </Button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
    </Card>
  );
}
