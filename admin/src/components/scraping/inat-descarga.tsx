"use client";

import { useCallback, useEffect, useState } from "react";
import { send } from "@/lib/dataset/dataset-client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";

type Progreso = {
  estado: "en_curso" | "terminada" | "cancelada" | "con_error";
  max: number;
  observaciones_total: number | null;
  observaciones_revisadas: number;
  guardadas: number;
  ya_estaban: number;
  fallidas: number;
  renacuajos_omitidos: number;
  sin_licencia_omitidas: number;
  errores: string[];
  error: string | null;
};

type Resumen = {
  nombre_cientifico: string;
  local: { almacenadas: number; de_inaturalist: number; con_licencia_cc: number; sin_licencia_cc: number; observaciones_inat: number };
  remoto: { taxon_id: number; observaciones_candidatas: number } | null;
  remoto_error: string | null;
  pendientes_observaciones: number | null;
  descarga: Progreso | null;
};

const n = (v: number) => v.toLocaleString("es-CO");

/** Resumen real (candidatas vs almacenadas) y descarga de las fotos de iNaturalist de una especie guardada en el dataset. */
export function InatDescarga({ especieId, nombre, calidad }: { especieId: number | null; nombre: string; calidad: string }) {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [max, setMax] = useState(70);
  const [soloCc, setSoloCc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [inicioDescarga, setInicioDescarga] = useState<number | null>(null);
  const [ahora, setAhora] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (especieId === null) return;
    setBusy(true);
    setError(null);
    try {
      const r = await send<Resumen>("GET", `/api/dataset/especies/${especieId}/inaturalist?calidad=${calidad}`);
      setResumen(r);
      setProgreso(r.descarga);
    } catch (err) {
      setResumen(null);
      setError(err instanceof Error ? err.message : "No se pudo contar las fotos");
    } finally {
      setBusy(false);
    }
  }, [especieId, calidad]);

  useEffect(() => {
    setResumen(null);
    setProgreso(null);
    setError(null);
  }, [especieId, calidad]);

  // Mientras la descarga corre, el progreso se pregunta cada 2 s; al terminar se recuentan las fotos.
  const enCurso = progreso?.estado === "en_curso";
  useEffect(() => {
    if (!enCurso || especieId === null) return;
    const t = setInterval(async () => {
      try {
        const r = await send<{ descarga: Progreso | null }>("GET", `/api/dataset/especies/${especieId}/inaturalist/descarga`);
        setProgreso(r.descarga);
        setAhora(Date.now());
        if (r.descarga && r.descarga.estado !== "en_curso") {
          setInicioDescarga(null);
          setAhora(null);
          void cargar();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Se perdió el contacto con el servidor");
      }
    }, 2000);
    return () => clearInterval(t);
  }, [enCurso, especieId, cargar]);

  async function descargar() {
    if (especieId === null) return;
    setError(null);
    const inicio = Date.now();
    setInicioDescarga(inicio);
    setAhora(inicio);
    try {
      const r = await send<Progreso>("POST", `/api/dataset/especies/${especieId}/inaturalist/descargar`, { calidad, max, solo_cc: soloCc });
      setProgreso(r);
      if (r.estado !== "en_curso") {
        setInicioDescarga(null);
        setAhora(null);
      }
    } catch (err) {
      setInicioDescarga(null);
      setAhora(null);
      setError(err instanceof Error ? err.message : "No se pudo iniciar la descarga");
    }
  }

  async function cancelar() {
    if (especieId === null) return;
    setCancelando(true);
    try {
      setProgreso(await send<Progreso>("DELETE", `/api/dataset/especies/${especieId}/inaturalist/descarga`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cancelar");
    } finally {
      setCancelando(false);
    }
  }
  const avance = progreso
    ? progreso.observaciones_total
      ? progreso.observaciones_revisadas / progreso.observaciones_total
      : progreso.guardadas / progreso.max
    : 0;
  const restanteMs = enCurso && inicioDescarga && ahora && avance > 0 && avance < 1
    ? ((ahora - inicioDescarga) * (1 - avance)) / avance
    : null;
  const restante = restanteMs === null ? null : (() => {
    const segundos = Math.ceil(restanteMs / 1000);
    const minutos = Math.floor(segundos / 60);
    return minutos ? `${minutos} min ${segundos % 60} s` : `${segundos} s`;
  })();

  if (especieId === null) {
    return (
      <div className="rounded-md border border-border bg-surface-subtle p-3 text-sm text-label-secondary">
        {nombre.trim().length < 3
          ? "Elige una especie para ver cuántas fotos hay y descargarlas."
          : "Esta especie aún no está en el dataset. Para descargar sus fotos, añádela primero en Especies."}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface-subtle p-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium text-label-primary">Fotos de {nombre}</p>
        <Button disabled={busy || enCurso} onClick={cargar}>{busy ? "Contando…" : "Contar fotos"}</Button>
        <Button loading={busy} disabled={busy || enCurso} onClick={cargar}>{busy ? "Contando…" : "Contar fotos"}</Button>
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {resumen && (
        <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Dato titulo="Candidatas en iNaturalist" valor={resumen.remoto ? `${n(resumen.remoto.observaciones_candidatas)} observaciones` : "sin dato"} />
          <Dato titulo="Pendientes de bajar" valor={resumen.pendientes_observaciones === null ? "sin dato" : `${n(resumen.pendientes_observaciones)} observaciones`} />
          <Dato titulo="Fotos almacenadas" valor={`${n(resumen.local.almacenadas)} (${n(resumen.local.de_inaturalist)} de iNaturalist)`} />
          <Dato titulo="Licencia" valor={`${n(resumen.local.con_licencia_cc)} CC · ${n(resumen.local.sin_licencia_cc)} sin CC`} />
        </dl>
      )}
      {resumen?.remoto_error && <p className="text-sm text-warning">{resumen.remoto_error} Los datos locales sí son reales.</p>}
      {resumen && resumen.local.almacenadas === 0 && !enCurso && (
        <p className="text-sm text-label-secondary">Aún no hay fotos de esta especie. Para empezar, elige cuántas bajar y pulsa «Descargar fotos».</p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Fotos nuevas a bajar" hint="Hasta 500 por descarga.">
          <Input type="number" min={1} max={500} value={max} onChange={(e) => setMax(Number(e.target.value) || 1)} />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm text-label-secondary">
          <input type="checkbox" checked={soloCc} onChange={(e) => setSoloCc(e.target.checked)} />
          Solo con licencia CC
        </label>
        <Button variant="primary" disabled={enCurso} onClick={descargar}>Descargar fotos</Button>
        <Button variant="primary" loading={enCurso && !cancelando} disabled={enCurso} onClick={descargar}>Descargar fotos</Button>
        {enCurso && <Button loading={cancelando} disabled={cancelando} onClick={cancelar}>Cancelar descarga</Button>}
      </div>
      {progreso && (
        <div className="space-y-2" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2 text-sm text-label-primary">
            <Badge tone={progreso.estado === "con_error" ? "danger" : progreso.estado === "terminada" ? "accent" : "warning"}>
              {{ en_curso: "Descargando", terminada: "Terminada", cancelada: "Cancelada", con_error: "Con error" }[progreso.estado]}
            </Badge>
            <span>{n(progreso.guardadas)} de {n(progreso.max)} fotos guardadas</span>
                        <span>{n(progreso.guardadas)} de {n(progreso.max)} fotos guardadas{restante && ` · estimado restante ~${restante}`}</span>
            <span className="text-label-secondary">
              · {n(progreso.observaciones_revisadas)} observaciones revisadas · {n(progreso.ya_estaban)} ya estaban · {n(progreso.fallidas)} fallidas
              {progreso.renacuajos_omitidos > 0 ? ` · ${n(progreso.renacuajos_omitidos)} renacuajos omitidos` : ""}
              {progreso.sin_licencia_omitidas > 0 ? ` · ${n(progreso.sin_licencia_omitidas)} sin CC omitidas` : ""}
            </span>
          </div>
          <progress className="h-2 w-full" max={progreso.max} value={progreso.guardadas} aria-label="Progreso de la descarga" />
          {progreso.error && <p className="text-sm text-danger">{progreso.error}</p>}
          {progreso.errores.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-label-secondary">{progreso.errores.map((e) => <li key={e}>{e}</li>)}</ul>
          )}
          {progreso.estado === "terminada" && progreso.guardadas === 0 && (
            <p className="text-sm text-label-secondary">No había fotos nuevas con este filtro. Prueba otro grado de calidad.</p>
          )}
          {progreso.guardadas > 0 && progreso.estado !== "en_curso" && (
            <p className="text-sm text-label-secondary">Las fotos ya están en Curación y en el dataset de la especie. Siguiente paso: revisarlas y limpiar coordenadas en Calidad.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-label-secondary">{titulo}</dt>
      <dd className="font-medium text-label-primary">{valor}</dd>
    </div>
  );
}
