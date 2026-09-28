"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";

type InatRow = {
  id: number;
  renacuajo: boolean;
  lat: number | null;
  lon: number | null;
  precision_m: number | null;
  fecha: string | null;
  lugar: string | null;
  autor: string | null;
  calidad: string | null;
  sexo: string | null;
  fotos: number;
  licencia: string | null;
};

type InatPayload = {
  taxon: { id: number; cientifico?: string; comun: string | null; genero: string | null; familia: string | null; orden: string | null; observaciones: number | null };
  total: number;
  filas: InatRow[];
};

type GbifRow = {
  cientifico: string | null;
  lat: number | null;
  lon: number | null;
  fecha: string | null;
  base: string | null;
  departamento: string | null;
  dataset: string | null;
};

const INAT_CAMPOS = [
  "Árbol taxonómico (orden, familia, género, especie, nombres comunes)",
  "Fotos de Colombia (place_id 7196) y, si no llegan al mínimo, el resto del mundo",
  "Coordenada, precisión, fecha, lugar, autor y licencia de cada foto",
  "Sexo anotado, si iNaturalist lo trae. Los renacuajos se saltan",
  "Audios globales, salvo que se omitan",
];

export function ScrapingConsole() {
  return (
    <div className="space-y-4">
      <Inaturalist />
      <Gbif />
    </div>
  );
}

function Inaturalist() {
  const [especie, setEspecie] = useState("");
  const [calidad, setCalidad] = useState("research");
  const [minFotos, setMinFotos] = useState(70);
  const [maxFotos, setMaxFotos] = useState("");
  const [omitirAudio, setOmitirAudio] = useState(true);
  const [espera, setEspera] = useState(1);
  const [ensayo, setEnsayo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InatPayload | null>(null);

  const comando = [
    "python scraper_inaturalist.py",
    especie.trim() ? `--species "${especie.trim()}"` : "--input especies_input.txt",
    `--quality-grade ${calidad}`,
    `--min-photos ${minFotos}`,
    maxFotos.trim() ? `--max-photos ${maxFotos.trim()}` : "",
    omitirAudio ? "--skip-audio" : "",
    `--delay ${espera}`,
    ensayo ? "--dry-run" : "",
  ].filter(Boolean).join(" ");

  async function consultar() {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: especie.trim(), quality_grade: calidad, per_page: "8" });
      const res = await fetch(`/api/scraping/inaturalist?${params}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "No se pudo consultar");
      setData(body);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "No se pudo consultar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details open className="rounded-lg border border-border bg-surface">
      <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-label-primary">iNaturalist</summary>
      <div className="space-y-4 px-5 pb-5">
        <p className="text-sm text-label-secondary">
          Misma consulta que <span className="font-mono text-xs">scraper_inaturalist.py</span>: grado de calidad, fotos en Colombia y el mínimo antes del fallback.
          El grado de investigación es consenso de identificación, no nitidez. Esta pantalla trae una muestra; el script en el PC guarda los archivos en <span className="font-mono text-xs">data dirty</span>.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Especies" hint="Separadas por coma. El script también acepta especies_input.txt." className="sm:col-span-2">
            <Input value={especie} onChange={(e) => setEspecie(e.target.value)} placeholder="Pristimantis paisa" />
          </Field>
          <Field label="Grado de calidad" hint="research es el valor por defecto del script.">
            <Select value={calidad} onChange={(e) => setCalidad(e.target.value)}>
              <option value="research">Investigación (research)</option>
              <option value="needs_id">Necesita identificación</option>
              <option value="casual">Casual</option>
              <option value="none">Sin filtro</option>
            </Select>
          </Field>
          <Field label="Mínimo de fotos" hint="Si Colombia no llega, busca fuera.">
            <Input type="number" min={1} value={minFotos} onChange={(e) => setMinFotos(Number(e.target.value) || 70)} />
          </Field>
          <Field label="Máximo de fotos" hint="Vacío = sin tope.">
            <Input value={maxFotos} onChange={(e) => setMaxFotos(e.target.value)} placeholder="opcional" />
          </Field>
          <Field label="Espera entre peticiones (s)">
            <Input type="number" min={0} step={0.5} value={espera} onChange={(e) => setEspera(Number(e.target.value) || 1)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-label-secondary">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={omitirAudio} onChange={(e) => setOmitirAudio(e.target.checked)} />
            Omitir audios
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={ensayo} onChange={(e) => setEnsayo(e.target.checked)} />
            Ensayo: taxonomía y conteo, sin bajar archivos
          </label>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-label-secondary">
          {INAT_CAMPOS.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={busy || especie.trim().length < 3} onClick={consultar}>
            {busy ? "Consultando…" : "Consultar muestra"}
          </Button>
          <code className="max-w-full overflow-x-auto rounded-md bg-surface-subtle px-2 py-1 text-xs text-label-secondary">{comando}</code>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        {data && (
          <div className="space-y-2">
            <p className="text-sm text-label-primary">
              <span className="font-medium">{data.taxon.cientifico}</span>
              {data.taxon.comun ? ` · ${data.taxon.comun}` : ""} · {data.taxon.familia ?? "sin familia"} · {data.total.toLocaleString("es-CO")} observaciones en Colombia con este filtro
            </p>
            <Muestra
              columnas={["Obs.", "Calidad", "Lugar", "Fecha", "Autor", "Licencia", "Fotos"]}
              filas={data.filas.filter((f) => !f.renacuajo).map((f) => [String(f.id), f.calidad, f.lugar, f.fecha, f.autor, f.licencia, String(f.fotos)])}
            />
            {data.filas.some((f) => f.renacuajo) && <Badge tone="warning">Hay renacuajos en la página: el script no los descarga</Badge>}
          </div>
        )}
      </div>
    </details>
  );
}

function Gbif() {
  const [especie, setEspecie] = useState("");
  const [departamento, setDepartamento] = useState("Antioquia");
  const [coordenadas, setCoordenadas] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [filas, setFilas] = useState<GbifRow[]>([]);

  async function consultar() {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q: especie.trim(),
        departamento,
        coordenadas: coordenadas ? "true" : "false",
        per_page: "8",
      });
      const res = await fetch(`/api/scraping/gbif?${params}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "No se pudo consultar");
      setTotal(body.total);
      setFilas(body.filas);
    } catch (err) {
      setTotal(null);
      setFilas([]);
      setError(err instanceof Error ? err.message : "No se pudo consultar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-lg border border-border bg-surface">
      <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-label-primary">GBIF</summary>
      <div className="space-y-4 px-5 pb-5">
        <p className="text-sm text-label-secondary">
          Ocurrencias sin foto: país Colombia, orden Anura, coordenada obligatoria y departamento. Alimentan altitud y presencia, no el entrenamiento. El tope histórico del pipeline es 300 registros por celda; aquí la muestra es de una página.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Especie" hint="Vacío = todo Anura en el filtro geográfico.">
            <Input value={especie} onChange={(e) => setEspecie(e.target.value)} placeholder="opcional" />
          </Field>
          <Field label="Departamento">
            <Input value={departamento} onChange={(e) => setDepartamento(e.target.value)} />
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm text-label-secondary">
            <input type="checkbox" checked={coordenadas} onChange={(e) => setCoordenadas(e.target.checked)} />
            Solo con coordenada
          </label>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-label-secondary">
          <li>Nombre científico, latitud, longitud, fecha y departamento</li>
          <li>Base del registro y dataset de origen</li>
        </ul>
        <Button variant="primary" disabled={busy} onClick={consultar}>{busy ? "Consultando…" : "Consultar muestra"}</Button>
        {error && <p className="text-sm text-danger">{error}</p>}
        {total !== null && (
          <div className="space-y-2">
            <p className="text-sm text-label-primary">{total.toLocaleString("es-CO")} registros con este filtro</p>
            <Muestra
              columnas={["Especie", "Departamento", "Fecha", "Lat", "Lon"]}
              filas={filas.map((f) => [f.cientifico, f.departamento, f.fecha, f.lat?.toString() ?? null, f.lon?.toString() ?? null])}
            />
          </div>
        )}
      </div>
    </details>
  );
}

function Muestra({ columnas, filas }: { columnas: string[]; filas: (string | null)[][] }) {
  if (filas.length === 0) return <p className="text-sm text-label-secondary">La consulta no trajo filas.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr>{columnas.map((c) => <th key={c} className="border-b border-border px-2 py-1.5 font-medium text-label-secondary">{c}</th>)}</tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr key={i} className="border-b border-border/60">
              {fila.map((celda, j) => <td key={j} className="max-w-[16rem] truncate px-2 py-1.5 text-label-primary">{celda || "—"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
