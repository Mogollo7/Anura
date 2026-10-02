"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, MapPin, TriangleAlert } from "lucide-react";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import {
  DatasetError,
  LICENCIAS_SUBIDA,
  subirFoto,
  ubicar,
  type Ubicacion,
} from "@/lib/dataset/dataset-client";

const TIPOS = ["image/jpeg", "image/png", "image/webp"];
const km = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 1 });
/** Acepta coma decimal ("6,25"): así se escribe en Colombia. */
const numero = (s: string) => (s.trim() === "" ? NaN : Number(s.trim().replace(",", ".")));
const coordValida = (lat: number, lon: number) =>
  Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;

type Form = {
  archivo: File | null;
  vista: string | null;
  lat: string;
  lon: string;
  fuente: "exif" | "manual";
  exif: "leyendo" | "con_gps" | "sin_gps" | null;
  /** Coordenada leída del EXIF, para saber si la que se envía sigue siendo esa. */
  exifLat: string;
  exifLon: string;
  precision: string;
  fecha: string;
  licencia: string;
  atribucion: string;
  fuera: boolean;
};

const VACIO: Form = {
  archivo: null, vista: null, lat: "", lon: "", fuente: "manual", exif: null, exifLat: "", exifLon: "",
  precision: "", fecha: "", licencia: "", atribucion: "", fuera: false,
};

/** Subida manual de una foto con su coordenada (EXIF o escrita), validada con geo-service. */
export function UploadPhotoDialog({
  open,
  onOpenChange,
  especieId,
  especie,
  onSubida,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  especieId: number;
  especie: string;
  onSubida: (mensaje: string) => void;
}) {
  const [f, setF] = useState<Form>(VACIO);
  const [ubicacion, setUbicacion] = useState<{ para: string; u: Ubicacion | null; error: string | null } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lat = numero(f.lat);
  const lon = numero(f.lon);
  const clave = `${lat},${lon}`;
  const coordOk = coordValida(lat, lon);

  // Valida contra los límites DANE mientras se escribe (con pausa, para no llamar en cada tecla).
  useEffect(() => {
    if (!coordOk) return;
    let cancelado = false;
    const t = setTimeout(() => {
      ubicar(lat, lon)
        .then((u) => !cancelado && setUbicacion({ para: clave, u, error: null }))
        .catch((e: Error) => !cancelado && setUbicacion({ para: clave, u: null, error: e.message }));
    }, 400);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [coordOk, lat, lon, clave]);

  useEffect(() => () => {
    if (f.vista) URL.revokeObjectURL(f.vista);
  }, [f.vista]);

  function cerrar(abierto: boolean) {
    if (!abierto) {
      setF(VACIO);
      setUbicacion(null);
      setError(null);
    }
    onOpenChange(abierto);
  }

  async function elegirArchivo(archivo: File | null) {
    setError(null);
    if (!archivo) return;
    if (!TIPOS.includes(archivo.type)) {
      setError(`No se puede subir "${archivo.name}": solo JPG, PNG o WebP. Si es una foto HEIC del iPhone, expórtala como JPG primero.`);
      return;
    }
    setF((s) => ({ ...s, archivo, vista: URL.createObjectURL(archivo), exif: "leyendo" }));
    try {
      const exifr = (await import("exifr")).default;
      const [gps, datos] = await Promise.all([
        exifr.gps(archivo).catch(() => null),
        exifr.parse(archivo, ["DateTimeOriginal"]).catch(() => null),
      ]);
      // El EXIF trae la hora local sin zona y exifr la lee como hora local: con toISOString()
      // una foto de las 8 p. m. en Colombia quedaría con la fecha del día siguiente.
      const d = datos?.DateTimeOriginal;
      const fecha = d instanceof Date && !isNaN(d.getTime())
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
        : "";
      if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
        setF((s) => ({
          ...s, exif: "con_gps", fuente: "exif", fecha: s.fecha || fecha,
          lat: gps.latitude.toFixed(6), lon: gps.longitude.toFixed(6),
          exifLat: gps.latitude.toFixed(6), exifLon: gps.longitude.toFixed(6),
        }));
      } else {
        setF((s) => ({ ...s, exif: "sin_gps", fecha: s.fecha || fecha }));
      }
    } catch {
      setF((s) => ({ ...s, exif: "sin_gps" }));
    }
  }

  // Si se cambia la coordenada del EXIF deja de ser del EXIF, y vuelve a serlo si se restaura.
  const editarCoord = (campo: "lat" | "lon", valor: string) =>
    setF((s) => {
      const n = { ...s, [campo]: valor, fuera: false };
      const igual = (a: string, b: string) => b !== "" && numero(a) === numero(b);
      return { ...n, fuente: igual(n.lat, s.exifLat) && igual(n.lon, s.exifLon) ? "exif" : "manual" };
    });

  const u = ubicacion?.para === clave ? ubicacion : null;
  const fueraSinConfirmar = !!u?.u && !u.u.en_colombia && !f.fuera;
  const listo =
    !!f.archivo && coordOk && !!u?.u && !fueraSinConfirmar && !!f.licencia && f.atribucion.trim() !== "" && !enviando;

  async function enviar() {
    if (!f.archivo || !listo) return;
    setEnviando(true);
    setError(null);
    const form = new FormData();
    form.set("foto", f.archivo);
    form.set("latitud", String(lat));
    form.set("longitud", String(lon));
    form.set("coordenada_fuente", f.fuente);
    if (f.precision.trim()) form.set("incertidumbre_m", String(numero(f.precision)));
    if (f.fecha) form.set("observada_en", f.fecha);
    form.set("licencia", f.licencia);
    form.set("atribucion", f.atribucion.trim());
    if (f.fuera) form.set("confirmar_fuera_de_colombia", "true");
    try {
      const r = await subirFoto(especieId, form);
      onSubida(`Foto subida a ${especie}${r.departamento ? ` (${r.departamento})` : ""}.`);
      cerrar(false);
    } catch (e) {
      setError(e instanceof DatasetError && e.status === 409 ? "Esta foto ya está en el dataset; no se subió otra vez." : (e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={cerrar} className="overflow-y-auto p-6 w-[min(640px,94vw)]">
      <DialogHeader
        title={`Subir foto de ${especie}`}
        description="La coordenada sale del EXIF de la foto o se escribe a mano, y se valida con los límites de los departamentos de Colombia."
      />
      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-subtle text-[11px] text-label-tertiary">
            {f.vista ? (
              // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
              <img src={f.vista} alt="Vista previa de la foto elegida" className="h-full w-full object-cover" />
            ) : (
              "Sin foto"
            )}
          </div>
          <Field
            label="Foto"
            className="flex-1"
            hint={
              f.exif === "leyendo"
                ? "Leyendo el EXIF…"
                : f.exif === "con_gps"
                  ? f.fuente === "exif"
                    ? "Coordenada tomada del EXIF de la foto."
                    : "Cambiaste la coordenada del EXIF: se guarda como escrita a mano."
                  : f.exif === "sin_gps"
                    ? "La foto no trae coordenada en el EXIF: escríbela abajo."
                    : "JPG, PNG o WebP, hasta 25 MB."
            }
          >
            <Input type="file" accept={TIPOS.join(",")} onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Latitud" error={f.lat && !Number.isFinite(lat) ? "Escribe grados decimales, p. ej. 6,2518" : null}>
            <Input inputMode="decimal" value={f.lat} onChange={(e) => editarCoord("lat", e.target.value)} />
          </Field>
          <Field label="Longitud" error={f.lon && !Number.isFinite(lon) ? "Escribe grados decimales, p. ej. -75,5636" : null}>
            <Input inputMode="decimal" value={f.lon} onChange={(e) => editarCoord("lon", e.target.value)} />
          </Field>
          <Field label="Precisión en metros (opcional)" hint="Si la conoces, p. ej. 10 para un GPS de teléfono.">
            <Input inputMode="decimal" value={f.precision} onChange={(e) => setF((s) => ({ ...s, precision: e.target.value }))} />
          </Field>
        </div>

        {coordOk && (
          <div className="rounded-md border border-border p-3 text-sm">
            {!u ? (
              <span className="text-label-secondary">Validando la coordenada…</span>
            ) : u.error ? (
              <span className="text-danger">{u.error}</span>
            ) : u.u?.en_colombia ? (
              <span className="flex items-center gap-1.5 text-label-primary">
                <CheckCircle2 size={14} className="text-success" /> <MapPin size={13} /> {u.u.departamento}, Colombia
              </span>
            ) : (
              <div className="space-y-2">
                <span className="flex items-center gap-1.5 text-warning">
                  <TriangleAlert size={14} /> Cae fuera de Colombia
                  {u.u?.cercano && ` (a ${km(u.u.cercano.distancia_km)} km de ${u.u.cercano.departamento})`}.
                </span>
                <p className="text-xs text-label-secondary">
                  Cerca de la costa puede ser el borde simplificado del mapa; lejos, casi siempre es una coordenada mal escrita
                  (revisa el signo de la longitud: en Colombia es negativa).
                </p>
                <label className="flex items-center gap-2 text-xs text-label-primary">
                  <input type="checkbox" checked={f.fuera} onChange={(e) => setF((s) => ({ ...s, fuera: e.target.checked }))} />
                  La coordenada es correcta aunque caiga fuera de Colombia
                </label>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Fecha de la observación (opcional)">
            <Input type="date" value={f.fecha} onChange={(e) => setF((s) => ({ ...s, fecha: e.target.value }))} />
          </Field>
          <Field label="Licencia" hint="Solo las CC se pueden mostrar en la ficha pública.">
            <Select value={f.licencia} onChange={(e) => setF((s) => ({ ...s, licencia: e.target.value }))}>
              <option value="">Elige una licencia</option>
              {LICENCIAS_SUBIDA.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Autor de la foto" hint="Va en la atribución, p. ej. Ana Pérez.">
            <Input value={f.atribucion} maxLength={200} onChange={(e) => setF((s) => ({ ...s, atribucion: e.target.value }))} />
          </Field>
        </div>

        <p className="text-xs text-label-tertiary">
          La foto se guarda como JPG sin metadatos (el GPS queda en la base de datos, no en el archivo). Entra al entrenamiento en la
          próxima versión del dataset y a las capas geográficas en la próxima corrida de la limpieza, en Calidad.
        </p>

        {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => cerrar(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={enviando} disabled={!listo || enviando} onClick={enviar}>
            {enviando ? "Subiendo…" : "Subir foto"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
