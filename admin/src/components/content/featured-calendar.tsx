"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Sparkles, Sun, Image as ImageIcon, ShieldAlert, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { usePanelSession } from "@/lib/session/panel-session";
import {
  DatasetError,
  getDestacados,
  getElegibles,
  programarDestacado,
  quitarDestacado,
  type CategoriaDestacado,
  type Destacado,
} from "@/lib/dataset/dataset-client";

const CATEGORIAS: { id: CategoriaDestacado; label: string; icon: typeof Sun; condicion: string }[] = [
  { id: "rana_del_dia", label: "Rana del día", icon: Sun, condicion: "Ficha publicada con foto principal y dato curioso" },
  { id: "donde_buscarla", label: "Dónde buscarla", icon: ShieldAlert, condicion: "Ficha con hábitat escrito" },
  { id: "foto_destacada", label: "Foto destacada", icon: ImageIcon, condicion: "Foto con licencia CC y autor" },
  { id: "especie_amenazada", label: "Especie amenazada", icon: Sparkles, condicion: "UICN vulnerable, en peligro o en peligro crítico" },
];

// Fecha local (no UTC): pasadas las 7 p. m. en Colombia, UTC ya es "mañana".
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hoyISO = () => isoLocal(new Date());
const sumarDias = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return isoLocal(d);
};
const fechaLarga = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });

/** Calendario del carrusel de inicio ("Rana del día"): un día, una categoría, una especie elegible. */
export function FeaturedCalendar() {
  const session = usePanelSession();
  const canEditar = session.can("editarContenido");
  const [desde, setDesde] = useState(hoyISO());
  const [dias, setDias] = useState<Destacado[][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [recarga, setRecarga] = useState(0);
  const [abriendo, setAbriendo] = useState<{ fecha: string; categoria: CategoriaDestacado } | null>(null);

  const hasta = useMemo(() => sumarDias(desde, 13), [desde]);
  const fechas = useMemo(() => Array.from({ length: 14 }, (_, i) => sumarDias(desde, i)), [desde]);

  useEffect(() => {
    if (!session.isReal) return;
    let cancelado = false;
    // Sin poner cargando=true aquí: el rango anterior se queda a la vista mientras llega el
    // nuevo (igual que ServerPhotosCard), en vez de parpadear a un estado de carga en cada clic.
    getDestacados(desde, hasta)
      .then(({ destacados }) => {
        if (cancelado) return;
        setDias(fechas.map((f) => destacados.filter((d) => d.fecha.slice(0, 10) === f)));
        setError(null);
      })
      .catch((e: Error) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fechas se deriva de desde/hasta, no hace falta re-listar
  }, [session.isReal, desde, hasta, recarga]);

  async function quitar(id: number) {
    try {
      await quitarDestacado(id);
      setRecarga((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!session.isReal) {
    return (
      <Card>
        <p className="text-sm text-label-secondary">
          {session.cargando ? "Comprobando la sesión…" : "Inicia sesión para programar el carrusel de inicio."}{" "}
          {!session.cargando && (
            <Link href="/login" className="text-accent-ink underline decoration-dotted underline-offset-2">
              Iniciar sesión
            </Link>
          )}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => setDesde((d) => sumarDias(d, -14))}>
          ← 2 semanas antes
        </Button>
        <Button variant="outline" onClick={() => setDesde(hoyISO())}>
          Hoy
        </Button>
        <Button variant="outline" onClick={() => setDesde((d) => sumarDias(d, 14))}>
          2 semanas después →
        </Button>
        <span className="text-xs text-label-tertiary">
          {fechaLarga(desde)} – {fechaLarga(hasta)}
        </span>
      </div>

      {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[900px] border-collapse text-left text-xs">
          <thead>
            <tr>
              <th className="w-32 border-b border-border p-2 font-medium text-label-tertiary">Día</th>
              {CATEGORIAS.map((c) => (
                <th key={c.id} className="border-b border-border p-2 font-medium text-label-tertiary">
                  <c.icon size={12} className="mb-0.5 inline" /> {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fechas.map((fecha, i) => (
              <tr key={fecha} className={cn("border-b border-border", fecha === hoyISO() && "bg-accent-wash/30")}>
                <td className="p-2 font-medium text-label-primary first-letter:uppercase">{fechaLarga(fecha)}</td>
                {CATEGORIAS.map((c) => {
                  const d = dias[i]?.find((x) => x.categoria === c.id);
                  return (
                    <td key={c.id} className="p-2 align-top">
                      {cargando ? (
                        <span className="text-label-tertiary">…</span>
                      ) : d ? (
                        <div className="flex items-start justify-between gap-1 rounded-md bg-surface-subtle px-2 py-1.5">
                          <span className="italic text-label-primary">{d.nombre_comun || d.nombre_cientifico}</span>
                          {canEditar && (
                            <button type="button" onClick={() => quitar(d.id)} className="shrink-0 text-label-tertiary hover:text-danger">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ) : canEditar ? (
                        <button
                          type="button"
                          onClick={() => setAbriendo({ fecha, categoria: c.id })}
                          className="flex w-full items-center justify-center rounded-md border border-dashed border-border py-1.5 text-label-tertiary hover:border-accent hover:text-accent-ink"
                        >
                          <Plus size={12} />
                        </button>
                      ) : (
                        <span className="text-label-tertiary">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-label-tertiary">
        Un día sin programar no queda vacío en la app: elige entre las especies elegibles de esa categoría, de forma
        determinista y sin conexión. {!canEditar && "Programar necesita el permiso Editar contenido."}
      </p>

      <Dialog open={!!abriendo} onOpenChange={(o) => !o && setAbriendo(null)}>
        {abriendo && (
          <ProgramarForm
            fecha={abriendo.fecha}
            categoria={abriendo.categoria}
            onCancelar={() => setAbriendo(null)}
            onProgramado={() => {
              setAbriendo(null);
              setRecarga((n) => n + 1);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function ProgramarForm({
  fecha,
  categoria,
  onCancelar,
  onProgramado,
}: {
  fecha: string;
  categoria: CategoriaDestacado;
  onCancelar: () => void;
  onProgramado: () => void;
}) {
  const cat = CATEGORIAS.find((c) => c.id === categoria)!;
  const [elegibles, setElegibles] = useState<{ especie_id: number; nombre_cientifico: string }[] | null>(null);
  const [especieId, setEspecieId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    getElegibles(categoria)
      .then((r) => {
        setElegibles(r.especies);
        setEspecieId(r.especies[0]?.especie_id ?? null);
      })
      .catch((e: Error) => setError(e.message));
  }, [categoria]);

  async function enviar() {
    if (!especieId) return;
    setEnviando(true);
    setError(null);
    try {
      await programarDestacado(fecha, categoria, especieId);
      onProgramado();
    } catch (e) {
      setError(e instanceof DatasetError ? e.message : (e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <DialogHeader title={`Programar «${cat.label}»`} description={`${fechaLarga(fecha)} · condición: ${cat.condicion}.`} />
      <div className="space-y-3">
        {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        {!elegibles ? (
          <p className="text-sm text-label-secondary">Cargando especies elegibles…</p>
        ) : elegibles.length === 0 ? (
          <p className="text-sm text-label-secondary">
            Ninguna ficha publicada cumple esta condición todavía. Complétala en{" "}
            <Link href="/contenido" className="text-accent-ink underline decoration-dotted underline-offset-2">
              Contenido
            </Link>
            .
          </p>
        ) : (
          <Select value={especieId ?? ""} onChange={(e) => setEspecieId(Number(e.target.value))}>
            {elegibles.map((e) => (
              <option key={e.especie_id} value={e.especie_id}>
                {e.nombre_cientifico}
              </option>
            ))}
          </Select>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!especieId || enviando} onClick={enviar}>
            Programar
          </Button>
        </div>
      </div>
    </>
  );
}
