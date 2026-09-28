"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ENCODER } from "@/lib/worker/encoder";
import { ANTIOQUIA_SUBREGIONES } from "@/lib/packages/antioquia-subregiones";
import { useMorphStore } from "@/lib/centroids/morph-store";
import { auditarIntake, especieNombre, type SpeciesIntake } from "@/lib/catalog/intake";
import { useIntakeStore } from "@/lib/catalog/intake-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

const VACIO: Omit<SpeciesIntake, "id" | "actualizado" | "cerrado"> = {
  familia: "Hylidae",
  genero: "",
  epiteto: "",
  nombreComun: "",
  fotos: 12,
  descartadas: 0,
  fuente: "inaturalist",
  altitudMin: 800,
  altitudMax: 1600,
  subregionId: "01_valle_de_aburra",
  sustrato: { hojarasca: 0.2, vegetacion: 0.6, quebrada: 0.15, roca: 0.05 },
  wv: 0.5,
  wg: 0.3,
  wm: 0.2,
  morfos: [],
};

export function SpeciesIntakeForm() {
  const intake = useIntakeStore();
  const morphs = useMorphStore();
  const [draft, setDraft] = useState(VACIO);
  const [morfosTexto, setMorfosTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [elegida, setElegida] = useState<string | null>(null);

  const preview = useMemo(() => {
    const morfos = morfosTexto.split(",").map((s) => s.trim()).filter(Boolean);
    return auditarIntake({ ...draft, morfos, id: "preview", cerrado: false, actualizado: "" });
  }, [draft, morfosTexto]);

  function set<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function guardar() {
    if (!draft.genero.trim() || !draft.epiteto.trim()) return;
    const morfos = morfosTexto.split(",").map((s) => s.trim()).filter(Boolean);
    const id = intake.guardar({ ...draft, morfos });
    const nombre = especieNombre(draft);
    for (const nombreMorfo of morfos) {
      const ya = morphs.store.declarations.some((d) => d.speciesId === id && d.subregion === draft.subregionId && d.nombre === nombreMorfo);
      if (!ya) morphs.declare({ speciesId: id, subregion: draft.subregionId, nombre: nombreMorfo, nota: `Declarado al crear ${nombre}` });
    }
    setElegida(id);
    setDraft(VACIO);
    setMorfosTexto("");
    setAbierto(false);
  }

  const seleccion = intake.especies.find((s) => s.id === elegida) ?? intake.especies[0] ?? null;
  const flujo = seleccion ? auditarIntake(seleccion) : null;

  return (
    <div id="anadir" className="scroll-mt-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-label-primary">Especies que añadiste en este navegador</h2>
          <p className="text-xs text-label-secondary">
            Borrador de una especie con sus fotos, su cota y su contexto; todavía no llega al servidor (allí las especies entran con el
            scraper). El encoder del paquete es {ENCODER.id}.
          </p>
        </div>
        <Button variant="primary" onClick={() => setAbierto((v) => !v)}>
          {abierto ? "Cerrar" : "Añadir especie"}
        </Button>
      </div>

      {abierto && (
        <Card className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Familia">
              <Input value={draft.familia} onChange={(e) => set("familia", e.target.value)} />
            </Field>
            <Field label="Género">
              <Input value={draft.genero} onChange={(e) => set("genero", e.target.value)} placeholder="Pristimantis" />
            </Field>
            <Field label="Epíteto">
              <Input value={draft.epiteto} onChange={(e) => set("epiteto", e.target.value)} placeholder="illex" />
            </Field>
            <Field label="Nombre común">
              <Input value={draft.nombreComun} onChange={(e) => set("nombreComun", e.target.value)} placeholder="rana de lluvia" />
            </Field>
            <Field label="Fotos cargadas" hint="iNaturalist, GBIF o campo. Este número es el que sigue el flujo.">
              <Input type="number" min={0} value={draft.fotos} onChange={(e) => set("fotos", Number(e.target.value))} />
            </Field>
            <Field label="Descartadas al limpiar">
              <Input type="number" min={0} value={draft.descartadas} onChange={(e) => set("descartadas", Number(e.target.value))} />
            </Field>
            <Field label="Fuente">
              <Select value={draft.fuente} onChange={(e) => set("fuente", e.target.value as SpeciesIntakeFuente)}>
                <option value="inaturalist">iNaturalist</option>
                <option value="gbif">GBIF</option>
                <option value="campo">Campo</option>
              </Select>
            </Field>
            <Field label="Región">
              <Select value={draft.subregionId} onChange={(e) => set("subregionId", e.target.value)}>
                {ANTIOQUIA_SUBREGIONES.map((s) => (
                  <option key={s.id} value={s.id}>{s.numero} {s.nombre}</option>
                ))}
              </Select>
            </Field>
            <Field label="Altitud mínima (m)">
              <Input type="number" value={draft.altitudMin} onChange={(e) => set("altitudMin", Number(e.target.value))} />
            </Field>
            <Field label="Altitud máxima (m)">
              <Input type="number" value={draft.altitudMax} onChange={(e) => set("altitudMax", Number(e.target.value))} />
            </Field>
            <Field label="Morfos" hint="Separados por coma. Vacío si no es polimórfica.">
              <Input value={morfosTexto} onChange={(e) => setMorfosTexto(e.target.value)} placeholder="red_morph, yellow_morph" />
            </Field>
            <Field label="wv visual">
              <Input type="number" step={0.05} value={draft.wv} onChange={(e) => set("wv", Number(e.target.value))} />
            </Field>
            <Field label="wg geográfico">
              <Input type="number" step={0.05} value={draft.wg} onChange={(e) => set("wg", Number(e.target.value))} />
            </Field>
            <Field label="wm microhábitat">
              <Input type="number" step={0.05} value={draft.wm} onChange={(e) => set("wm", Number(e.target.value))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(Object.keys(draft.sustrato) as (keyof typeof draft.sustrato)[]).map((k) => (
              <Field key={k} label={`Prior ${k}`}>
                <Input
                  type="number"
                  step={0.05}
                  value={draft.sustrato[k]}
                  onChange={(e) => set("sustrato", { ...draft.sustrato, [k]: Number(e.target.value) })}
                />
              </Field>
            ))}
          </div>
          <p className="text-xs text-label-secondary">
            Vista previa: {preview.vectores} vectores de {ENCODER.dimensiones}-d con {ENCODER.id}. {preview.checks.filter((c) => !c.ok).map((c) => c.label).join(" · ") || "Los chequeos cierran."}
          </p>
          <Button variant="primary" onClick={guardar} disabled={!draft.genero.trim() || !draft.epiteto.trim()}>
            Guardar especie
          </Button>
        </Card>
      )}

      {intake.especies.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {intake.especies.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setElegida(s.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs",
                seleccion?.id === s.id ? "bg-cta-bg text-cta-fg" : "bg-surface-subtle text-label-secondary"
              )}
            >
              {especieNombre(s)}
            </button>
          ))}
        </div>
      )}

      {seleccion && flujo && <Flujo especie={seleccion} onCerrar={() => intake.cerrar(seleccion.id)} onRepetir={() => intake.repetir(seleccion.id)} onQuitar={() => { intake.quitar(seleccion.id); setElegida(null); }} onEditar={() => {
        setDraft({ ...seleccion });
        setMorfosTexto(seleccion.morfos.join(", "));
        setAbierto(true);
      }} />}
    </div>
  );
}

type SpeciesIntakeFuente = SpeciesIntake["fuente"];

function Flujo({
  especie,
  onCerrar,
  onRepetir,
  onQuitar,
  onEditar,
}: {
  especie: SpeciesIntake;
  onCerrar: () => void;
  onRepetir: () => void;
  onQuitar: () => void;
  onEditar: () => void;
}) {
  const flujo = auditarIntake(especie);
  const sub = ANTIOQUIA_SUBREGIONES.find((s) => s.id === especie.subregionId);
  const pasos = [
    { titulo: "Foto", detalle: `${especie.fotos} de ${especie.fuente} · ${flujo.fotosActivas} activas` },
    { titulo: "Ubicación", detalle: `${sub?.nombre ?? especie.subregionId} · ${especie.altitudMin}–${especie.altitudMax} m` },
    { titulo: "Contexto", detalle: `wv ${especie.wv} · wg ${especie.wg} · wm ${especie.wm}` },
    { titulo: "Morfo", detalle: especie.morfos.length ? especie.morfos.join(", ") : "Sin morfos" },
    { titulo: "Vectores", detalle: `${flujo.vectores} × ${ENCODER.dimensiones}-d · ${ENCODER.id}` },
    { titulo: "Paquete", detalle: flujo.entrenable ? "Pasa la auditoría de esta ficha" : "Todavía no cierra" },
  ];
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-label-tertiary">{especie.familia} · {especie.nombreComun || "sin nombre común"}</p>
          <h3 className="text-lg font-semibold italic text-label-primary">{especieNombre(especie)}</h3>
        </div>
        <Badge tone={flujo.entrenable ? "accent" : "warning"}>{flujo.etapa}</Badge>
      </div>
      <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {pasos.map((p, i) => (
          <li key={p.titulo} className="rounded-md bg-surface-subtle p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-label-tertiary">{i + 1} {p.titulo}</p>
            <p className="mt-1 text-xs text-label-primary">{p.detalle}</p>
          </li>
        ))}
      </ol>
      <ul className="space-y-1">
        {flujo.checks.map((c) => (
          <li key={c.label} className={cn("text-xs", c.ok ? "text-label-secondary" : "text-warning")}>
            {c.ok ? "Listo" : "Falta"} · {c.label}
          </li>
        ))}
      </ul>
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-subtle">
        <div className="bg-accent-ink" style={{ width: `${Math.min(100, (flujo.fotosActivas / Math.max(1, especie.fotos)) * 100)}%` }} />
      </div>
      <p className="text-[11px] text-label-tertiary">
        La barra es fotos activas sobre las cargadas. Esos vectores son los que suma la DB vectorial de {sub?.nombre ?? "la región"}.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={onEditar}>Actualizar</Button>
        {flujo.entrenable && !especie.cerrado && <Button variant="primary" onClick={onCerrar}>Cerrar resultado</Button>}
        {especie.cerrado && <Button variant="ghost" onClick={onRepetir}>Repetir desde limpiar</Button>}
        <Button variant="ghost" onClick={onQuitar}>Quitar</Button>
        <Link href="/vectorial" className="inline-flex items-center px-2 text-xs font-medium text-accent-ink hover:underline">Ver en la DB vectorial</Link>
        <Link href="/compilador" className="inline-flex items-center px-2 text-xs font-medium text-accent-ink hover:underline">Ir al release</Link>
      </div>
    </Card>
  );
}
