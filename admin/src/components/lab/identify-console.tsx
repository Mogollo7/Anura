"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Lock, ShieldQuestion } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { useAllReleases, type Release } from "@/lib/compiler/release-store";
import { useClusterStore } from "@/lib/adapters/cluster-store";
import { clusterFingerprint, trainAdapter } from "@/lib/adapters/adapters";
import { ANTIOQUIA_SUBREGIONES, speciesForSubregion } from "@/lib/packages/antioquia-subregiones";
import { calibratePackage, type ClusterGate, type PackageCalib } from "@/lib/osr/osr";
import { SUBSTRATO_LABEL, type Substrato } from "@/lib/mock/curation";
import { usePanelSession } from "@/lib/session/panel-session";
import { CICLO } from "@/lib/cycle/stages";
import {
  identificar,
  listarSondas,
  sustratoDominante,
  type IdentifyResult,
  type ProbeGrupoResumen,
} from "@/lib/lab/identify";

function contextoDe(origenId: string, calib: PackageCalib, release: Release, medio: number) {
  const sp = calib.species.find((s) => s.species.id === origenId);
  const entry = sp ? release.manifest.species_catalog.find((e) => e.taxon_id === sp.species.taxonId) : undefined;
  if (!entry) return { origen: origenId, altitud: medio, sustrato: "hojarasca" as Substrato };
  return {
    origen: origenId,
    altitud: Math.round(entry.context_parameters.altitude_mean_msnm),
    sustrato: sustratoDominante(entry.context_parameters.substrate_priors),
  };
}

const GRUPO_LABEL: Record<ProbeGrupoResumen["grupo"], string> = {
  conocida: "Especie del paquete (foto apartada)",
  congenere: "Congénere que el paquete no catalogó",
  genero_nuevo: "Género fuera del catálogo",
  familia_ausente: "Familia fuera del catálogo",
  fuera_del_paquete: "Especie del catálogo, de otra subregión",
};

const CODIGO_TONE: Record<IdentifyResult["codigo"], "accent" | "info" | "warning" | "danger"> = {
  "00_MATCH_OK": "accent",
  STATUS_GENUS: "info",
  STATUS_FAMILY: "info",
  "01_OSR_GLOBAL": "warning",
  "02_OSR_CLUSTER": "warning",
  "03_OSR_GEO_FAIL": "danger",
};

const sinSuscripcion = () => () => {};

export function IdentifyConsole() {
  // El release vive en el navegador. Servidor y primer render del cliente muestran
  // lo mismo; después se lee el almacenamiento. Si no, React marca un error de hidratación.
  const listo = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  const releases = useAllReleases();
  const publicados = releases.filter((r) => r.estado === "PUBLISHED");
  const [id, setId] = useState(publicados[0]?.id ?? "");
  const release = publicados.find((r) => r.id === id) ?? publicados[0] ?? null;

  if (!listo) {
    return (
      <div className="space-y-4">
        <Ciclo actual="simulador" />
        <Card className="text-sm text-label-secondary">Leyendo los releases de este navegador…</Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Ciclo actual="simulador" />
      {release ? (
        <>
          <Card className="flex flex-wrap items-end justify-between gap-3">
            <Field label="Release publicado" hint="Solo entra lo que ya tiene las dos aprobaciones y está vigente. El simulador no publica.">
              <Select value={release.id} onChange={(e) => setId(e.target.value)} className="min-w-[260px]">
                {publicados.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.manifest.package_metadata.region_name} · v{r.version}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="text-[11px] text-label-tertiary">
              {release.manifest.species_catalog.length} especies · encoder {release.manifest.package_metadata.encoder} · publicado por{" "}
              {release.publicadoPor}
            </p>
          </Card>
          <IdentifyRun key={release.id} release={release} />
        </>
      ) : (
        <SinRelease otros={releases} />
      )}
    </div>
  );
}

function Ciclo({ actual }: { actual: string }) {
  return (
    <ol className="flex gap-1 overflow-x-auto pb-1">
      {CICLO.map((e, i) => {
        const on = e.id === actual;
        return (
          <li key={e.id} className="flex shrink-0 items-center gap-1">
            {i > 0 && <span className="text-label-tertiary">→</span>}
            <Link
              href={e.href}
              title={e.cierra}
              className={
                on
                  ? "rounded-full bg-accent-wash px-2.5 py-1 text-xs font-medium text-accent-ink"
                  : "rounded-full px-2.5 py-1 text-xs text-label-secondary hover:bg-surface-subtle hover:text-label-primary"
              }
            >
              {e.label}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function SinRelease({ otros }: { otros: Release[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-subtle text-label-secondary">
          <ShieldQuestion size={18} />
        </span>
        <div>
          <h2 className="text-base font-semibold text-label-primary">No hay un release publicado</h2>
          <p className="mt-1 text-sm text-label-secondary">
            El simulador identifica contra el JSON que ya salió, no contra la calibración en vivo. Sin un release vigente no hay nada que el teléfono fuera a recibir, y correr igual sería inventar un paquete.
          </p>
        </div>
      </div>
      <p className="text-sm text-label-secondary">
        El ciclo para llegar aquí: validar OSR, pasar la validación técnica, compilar, aval científico, aval técnico y publicar.
      </p>
      <Link href="/compilador" className="inline-flex text-sm font-medium text-accent-ink hover:underline">
        Ir al compilador
      </Link>
      {otros.length > 0 && (
        <ul className="space-y-1 border-t border-border pt-3 text-xs text-label-secondary">
          {otros.map((r) => (
            <li key={r.id}>
              {r.manifest.package_metadata.region_name} v{r.version} está en {r.estado}. Todavía no se simula.
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function IdentifyRun({ release }: { release: Release }) {
  const session = usePanelSession();
  const canDebug = session.can("debugTecnico");
  const { clusters } = useClusterStore();
  const [paquete, setPaquete] = useState<{ calib: PackageCalib; gates: ClusterGate[] } | null>(null);

  useEffect(() => {
    let cancel = false;
    const t = setTimeout(() => {
      const calib = calibratePackage(release.subregionId);
      const species = speciesForSubregion(release.subregionId);
      const byId = new Map(species.map((s) => [s.id, s]));
      const gates: ClusterGate[] = clusters
        .filter(
          (c) =>
            c.subregionId === release.subregionId &&
            c.entrenado?.fingerprint === clusterFingerprint(c) &&
            c.validado?.fingerprint === clusterFingerprint(c)
        )
        .map((c) => {
          const miembros = c.miembros.map((id) => byId.get(id)).filter((s) => !!s);
          const r = trainAdapter(c, miembros, species);
          return {
            id: c.id,
            clusterId: c.clusterId,
            miembros: c.miembros,
            epsilonPropuesto: r.epsilon,
            erecMiembros: r.erecMiembros,
            intrusos: r.intrusos,
            erec: r.erec,
          };
        });
      if (!cancel) setPaquete({ calib, gates });
    }, 30);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [release, clusters]);

  if (!paquete) {
    return <Card className="text-sm text-label-secondary">Preparando la geometría del paquete publicado…</Card>;
  }
  return <IdentifyForm release={release} calib={paquete.calib} gates={paquete.gates} canDebug={canDebug} />;
}

function IdentifyForm({
  release,
  calib,
  gates,
  canDebug,
}: {
  release: Release;
  calib: PackageCalib;
  gates: ClusterGate[];
  canDebug: boolean;
}) {
  const sondas = useMemo(() => listarSondas(calib), [calib]);
  const sub = ANTIOQUIA_SUBREGIONES.find((s) => s.id === release.subregionId);
  const medio = sub ? Math.round((sub.cotaMin + sub.cotaMax) / 2) : 1500;
  const inicial = contextoDe(sondas.find((s) => s.grupo === "conocida")?.origen ?? sondas[0]?.origen ?? "", calib, release, medio);
  const [origen, setOrigen] = useState(inicial.origen);
  const sonda = sondas.find((s) => s.origen === origen) ?? sondas[0];
  const [foto, setFoto] = useState(0);
  const [altitud, setAltitud] = useState(inicial.altitud);
  const [sustrato, setSustrato] = useState<Substrato>(inicial.sustrato);
  const [resultado, setResultado] = useState<IdentifyResult | null>(null);

  function aplicarContextoDe(origenId: string) {
    const ctx = contextoDe(origenId, calib, release, medio);
    setAltitud(ctx.altitud);
    setSustrato(ctx.sustrato);
    setFoto(0);
    setResultado(null);
  }

  function correr(alt = altitud, substra = sustrato, fotoIdx = foto, origenId = origen) {
    setResultado(
      identificar({
        manifest: release.manifest,
        calib,
        gates,
        origen: origenId,
        foto: fotoIdx,
        altitud: alt,
        sustrato: substra,
      })
    );
  }

  function fueraDeCota() {
    const sp = calib.species.find((s) => s.species.id === origen);
    const entry = sp ? release.manifest.species_catalog.find((e) => e.taxon_id === sp.species.taxonId) : undefined;
    const mu = entry?.context_parameters.altitude_mean_msnm ?? medio;
    const sigma = Math.max(80, entry?.context_parameters.altitude_std_dev ?? 200);
    const alt = Math.round(mu + 4 * sigma);
    setAltitud(alt);
    correr(alt, sustrato, foto, origen);
  }

  if (!sonda) return null;

  const conocidas = sondas.filter((s) => s.grupo === "conocida");
  const ajenas = sondas.filter((s) => s.grupo !== "conocida");

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <Card className="space-y-4">
        <CardHeader className="mb-0">
          <CardTitle>Foto de prueba</CardTitle>
        </CardHeader>
        <Field label="Qué se le muestra al paquete">
          <Select
            value={sonda.origen}
            onChange={(e) => {
              setOrigen(e.target.value);
              aplicarContextoDe(e.target.value);
            }}
          >
            <optgroup label="Del paquete">
              {conocidas.map((s) => (
                <option key={s.origen} value={s.origen}>
                  {s.nombre}
                </option>
              ))}
            </optgroup>
            <optgroup label="El paquete no las entrenó">
              {ajenas.map((s) => (
                <option key={s.origen} value={s.origen}>
                  {s.nombre} · {GRUPO_LABEL[s.grupo]}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>
        <p className="text-xs text-label-tertiary">{GRUPO_LABEL[sonda.grupo]}. {sonda.fotos} fotos apartadas.</p>
        {sonda.fotos > 1 && (
          <Field label="Foto">
            <Select
              value={String(Math.min(foto, sonda.fotos - 1))}
              onChange={(e) => {
                setFoto(Number(e.target.value));
                setResultado(null);
              }}
            >
              {Array.from({ length: sonda.fotos }, (_, i) => (
                <option key={i} value={i}>
                  {i + 1} de {sonda.fotos}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Altitud de la observación (m)" hint="La capa 3 usa esta cota, no el promedio de la ficha.">
          <Input
            type="number"
            value={altitud}
            onChange={(e) => {
              setAltitud(Number(e.target.value));
              setResultado(null);
            }}
          />
        </Field>
        <Field label="Sustrato">
          <Select
            value={sustrato}
            onChange={(e) => {
              setSustrato(e.target.value as Substrato);
              setResultado(null);
            }}
          >
            {(Object.keys(SUBSTRATO_LABEL) as Substrato[]).map((k) => (
              <option key={k} value={k}>
                {SUBSTRATO_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => correr()}>
            Identificar
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              aplicarContextoDe(sonda.origen);
            }}
          >
            Cota típica
          </Button>
          <Button variant="ghost" onClick={fueraDeCota} disabled={sonda.grupo !== "conocida"}>
            Fuera de cota
          </Button>
        </div>
        {!release.manifest.decision && (
          <p className="text-xs text-warning">
            Este release se compiló antes de congelar la capa 3. El simulador aplica umbral 0,05 y rechazo, el valor inicial del vault. Vuelve a compilar para guardar la política que está en OSR.
          </p>
        )}
      </Card>

      <div className="space-y-4">
        {resultado ? (
          <ResultadoCard resultado={resultado} canDebug={canDebug} />
        ) : (
          <Card className="text-sm text-label-secondary">
            Elige la foto, la altitud y el sustrato. Identificar recorre las tres capas con los τ de este release y no guarda nada.
          </Card>
        )}
      </div>
    </div>
  );
}

function ResultadoCard({ resultado, canDebug }: { resultado: IdentifyResult; canDebug: boolean }) {
  const r = resultado;
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={CODIGO_TONE[r.codigo]}>{r.codigo}</Badge>
        <Badge tone={r.acierto ? "accent" : "warning"}>{r.acierto ? "Coincide con lo esperado" : "No coincide con lo esperado"}</Badge>
        {!r.geo.congeladaEnRelease && <Badge tone="warning">Capa 3 no venía en el release</Badge>}
      </div>
      <div>
        <p className="text-base font-semibold text-label-primary">{r.veLaPersona}</p>
        <p className="mt-1 text-sm text-label-secondary">
          {r.especie ? <span className="italic">{r.especie}</span> : r.genero ? `Género ${r.genero}` : r.familia ? `Familia ${r.familia}` : "Sin nombre"}
          {" · "}puntaje {r.puntaje.toFixed(3)}
        </p>
      </div>
      <ol className="space-y-2">
        {r.rama.map((paso) => (
          <li key={paso.capa + paso.titulo} className="rounded-md border border-border px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-label-tertiary">
              {paso.capa}
              {paso.decidio ? " · decide" : ""}
            </p>
            <p className="text-sm font-medium text-label-primary">{paso.titulo}</p>
            <p className="text-xs text-label-secondary">{paso.detalle}</p>
          </li>
        ))}
      </ol>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md bg-surface-subtle p-3 text-xs">
          <p className="font-medium text-label-primary">Coseno (viaja en el JSON)</p>
          <p className="mt-1 text-label-secondary">
            {r.comparacion.coseno.acepta ? r.comparacion.coseno.especie : "rechaza en capa 1"} · similitud {r.comparacion.coseno.similitud.toFixed(3)}
            {r.comparacion.coseno.acepta ? ` · τ ${r.comparacion.coseno.tau.toFixed(3)}` : ""}
          </p>
        </div>
        <div className="rounded-md bg-surface-subtle p-3 text-xs">
          <p className="font-medium text-label-primary">Mahalanobis (no viaja)</p>
          <p className="mt-1 text-label-secondary">
            {r.comparacion.mahalanobis.acepta ? r.comparacion.mahalanobis.especie : "rechaza en capa 1"} · d {r.comparacion.mahalanobis.distancia.toFixed(2)}
            {r.comparacion.mahalanobis.acepta ? ` · τ ${r.comparacion.mahalanobis.tau.toFixed(2)}` : ""}
          </p>
          <p className="mt-1 text-label-tertiary">
            {r.comparacion.mismaEspecie
              ? "Los dos caminos nombran la misma especie."
              : r.comparacion.mismoVeredicto
                ? "Los dos rechazan en la capa 1, sin la misma especie."
                : "Los dos caminos no coinciden. El teléfono usa el coseno."}
          </p>
        </div>
      </div>
      <p className="text-sm text-label-secondary">
        <span className="font-medium text-label-primary">Vuelta del ciclo. </span>
        {r.alSincronizar} Lo esperado para esta sonda era: {r.esperado}.
      </p>
      {canDebug ? (
        <p className="text-[11px] text-label-tertiary">
          Traza técnica: foto {r.traza.foto}/{r.traza.fotos} · ‖x‖² {r.traza.norma.toFixed(4)} · {r.traza.encoder} {r.traza.dim}-d. {r.traza.checksumNota}
          {r.capa2 === "sin_matriz" ? " La matriz del clúster no está en esta sesión." : ""}
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-[11px] text-label-tertiary">
          <Lock size={11} /> La traza del encoder pide el permiso Debug técnico. La rama científica de arriba se ve igual.
        </p>
      )}
    </Card>
  );
}
