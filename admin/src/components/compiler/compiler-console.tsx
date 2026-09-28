"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, Lock, PackageCheck, RotateCcw, ShieldCheck, Undo2, XCircle } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import { ANTIOQUIA_SUBREGIONES, getAntioquiaSubregion } from "@/lib/packages/antioquia-subregiones";
import { SEMVER } from "@/lib/packages/constants";
import { usePanelSession } from "@/lib/session/panel-session";
import { useMorphStore } from "@/lib/centroids/morph-store";
import { useClusterStore } from "@/lib/adapters/cluster-store";
import { useOsrStore } from "@/lib/osr/osr-store";
import { buildTechnicalValidation } from "@/lib/validation/technical";
import { checksumOf, compileFingerprint, compilePackage, estimatedBytes, type CompilerReject } from "@/lib/compiler/compile";
import { useReleaseStore, type Release, type ReleaseEstado } from "@/lib/compiler/release-store";

const ESTADO_LABEL: Record<ReleaseEstado, string> = {
  VALIDATING: "Esperando aval científico",
  READY: "Esperando aval técnico",
  APPROVED: "Aprobada, sin publicar",
  PUBLISHED: "Publicada, vigente",
  ROLLED_BACK: "Revertida",
};
const ESTADO_TONE: Record<ReleaseEstado, "neutral" | "accent" | "warning" | "danger" | "info"> = {
  VALIDATING: "info",
  READY: "info",
  APPROVED: "warning",
  PUBLISHED: "accent",
  ROLLED_BACK: "neutral",
};

function defaultSubregion() {
  return ANTIOQUIA_SUBREGIONES.find((s) => s.id === "01_valle_de_aburra")?.id ?? ANTIOQUIA_SUBREGIONES[0].id;
}
function nextVersion(releases: Release[]) {
  if (releases.length === 0) return "1.0.0";
  const [maj, min, patch] = releases[0].version.split(".").map(Number);
  return `${maj}.${min}.${patch + 1}`;
}

export function CompilerConsole() {
  const session = usePanelSession();
  const canGenerar = session.can("generarPaquete");
  const canCientifico = session.can("aprobarCientifico");
  const canTecnico = session.can("publicarPaquete");

  const [subregionId, setSubregionId] = useState(defaultSubregion);
  const { store: morphs } = useMorphStore();
  const { clusters } = useClusterStore();
  const osr = useOsrStore(subregionId);
  const releaseStore = useReleaseStore(subregionId);
  const [version, setVersion] = useState(() => nextVersion(releaseStore.releases));

  const validacion = useMemo(() => buildTechnicalValidation(subregionId, morphs, clusters, osr.config, osr.validacion), [subregionId, morphs, clusters, osr.config, osr.validacion]);
  const currentFingerprint = useMemo(() => compileFingerprint(subregionId, version, morphs, clusters, osr.config), [subregionId, version, morphs, clusters, osr.config]);
  // Vigencia de un release YA compilado: su propia versión contra el estado actual — no la versión que esté escrita en el campo de arriba.
  const fingerprintOf = (v: string) => compileFingerprint(subregionId, v, morphs, clusters, osr.config);

  const [rechazos, setRechazos] = useState<CompilerReject[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [aPublicar, setAPublicar] = useState<Release | null>(null);

  function generar() {
    if (!canGenerar || !validacion.gate.aprobado || !SEMVER.test(version)) return;
    setBusy(true);
    setTimeout(() => {
      const { manifest, rechazos: r } = compilePackage(subregionId, version, morphs, clusters, osr.config, session.acting?.name ?? "—");
      if (!manifest) {
        setRechazos(r);
      } else {
        setRechazos(null);
        releaseStore.generar(manifest, checksumOf(manifest), currentFingerprint, version, session.acting?.name ?? "—");
        const [maj, min, patch] = version.split(".").map(Number);
        setVersion(`${maj}.${min}.${patch + 1}`);
      }
      setBusy(false);
    }, 500);
  }

  function descargar(r: Release) {
    const blob = new Blob([JSON.stringify({ ...r.manifest, manifest: { checksum: r.checksum, fingerprint: r.fingerprint } }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${r.subregionId}_v${r.version}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <Dialog open={!!aPublicar} onOpenChange={(o) => !o && setAPublicar(null)}>
        {aPublicar && (
          <>
            <DialogHeader
              title={`¿Publicar v${aPublicar.version} de ${getAntioquiaSubregion(aPublicar.subregionId)?.nombre ?? aPublicar.subregionId}?`}
              description="Pasa a ser la versión vigente de la subregión en este navegador y el simulador empieza a usarla. Este JSON no es el archivo que descarga el teléfono: el teléfono baja el sqlite de identificación y los catálogos de subregión que publica el servidor. Se puede revertir."
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAPublicar(null)}>Cancelar</Button>
              <Button
                variant="primary"
                onClick={() => {
                  releaseStore.publicar(aPublicar.id, session.acting?.name ?? "—");
                  setAPublicar(null);
                }}
              >
                Publicar v{aPublicar.version}
              </Button>
            </div>
          </>
        )}
      </Dialog>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Subregión (un release por paquete)">
          <Select value={subregionId} onChange={(e) => { setSubregionId(e.target.value); setRechazos(null); }} className="min-w-[220px]">
            {ANTIOQUIA_SUBREGIONES.map((s) => (
              <option key={s.id} value={s.id}>{s.numero} {s.nombre}</option>
            ))}
          </Select>
        </Field>
        <Field label="Versión semver">
          <Input value={version} onChange={(e) => setVersion(e.target.value)} className="w-28" />
        </Field>
        <Button variant="primary" disabled={!canGenerar || !validacion.gate.aprobado || !SEMVER.test(version) || busy} onClick={generar}>
          {canGenerar ? <PackageCheck size={14} /> : <Lock size={14} />} {busy ? "Compilando…" : "Generar paquete"}
        </Button>
        {releaseStore.vigente && <Badge tone="accent">Vigente: v{releaseStore.vigente.version}</Badge>}
      </div>

      {!validacion.gate.aprobado && (
        <Card>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-danger"><XCircle size={13} /> No se puede compilar todavía</p>
          <ul className="space-y-1 text-xs text-danger">
            {validacion.gate.motivos.map((m) => <li key={m}>{m}</li>)}
          </ul>
          <p className="mt-2 text-xs text-label-tertiary">
            Resuelve esto en <Link href="/validacion-tecnica" className="text-accent-ink underline">Validación técnica</Link>.
          </p>
        </Card>
      )}

      {rechazos && rechazos.length > 0 && (
        <Card>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-danger"><XCircle size={13} /> El compilador rechazó esta versión</p>
          <ul className="space-y-1.5 text-xs text-danger">
            {rechazos.map((r) => <li key={`${r.id}-${r.speciesId ?? ""}`} className="flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{r.detalle}</li>)}
          </ul>
          <p className="mt-2 text-[11px] text-label-tertiary">
            Corrígelo en Ficha de especie, Centroides y morfos o Curación, y vuelve a generar. Nada se publica a medias.
          </p>
        </Card>
      )}

      <Card>
        <CardHeader className="mb-2"><CardTitle>Releases de esta subregión</CardTitle></CardHeader>
        {releaseStore.releases.length === 0 ? (
          <p className="text-xs text-label-secondary">Sin releases compilados todavía.</p>
        ) : (
          <Table>
            <THead><tr><TH>Versión</TH><TH>Estado</TH><TH className="text-right">Especies</TH><TH className="text-right">Tamaño</TH><TH>Aval científico</TH><TH>Aval técnico</TH><TH></TH></tr></THead>
            <TBody>
              {releaseStore.releases.map((r) => {
                const vencida = (r.estado === "VALIDATING" || r.estado === "READY" || r.estado === "APPROVED") && r.fingerprint !== fingerprintOf(r.version);
                return (
                  <TRow key={r.id}>
                    <TD className="text-xs font-mono">{r.version}</TD>
                    <TD>
                      <Badge tone={vencida ? "warning" : ESTADO_TONE[r.estado]}>{vencida ? "Desactualizada — vuelve a generar" : ESTADO_LABEL[r.estado]}</Badge>
                    </TD>
                    <TD className="text-right text-xs tabular-nums">{r.manifest.species_catalog.length}</TD>
                    <TD className="text-right text-xs tabular-nums">{(estimatedBytes(r.manifest) / 1024).toLocaleString("es-CO", { maximumFractionDigits: 1 })} KiB</TD>
                    <TD className="text-xs">{r.cientifico ? `${r.cientifico.por} · ${r.cientifico.fecha}` : "—"}</TD>
                    <TD className="text-xs">{r.tecnico ? `${r.tecnico.por} · ${r.tecnico.fecha}` : "—"}</TD>
                    <TD>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button variant="ghost" className="text-xs" onClick={() => descargar(r)}><Download size={12} /> JSON</Button>
                        {r.estado === "VALIDATING" && (
                          <Button variant="outline" className="text-xs" disabled={!canCientifico || vencida} onClick={() => releaseStore.avalarCientifico(r.id, session.acting?.name ?? "—")}>
                            {canCientifico ? <ShieldCheck size={12} /> : <Lock size={12} />} Aval científico
                          </Button>
                        )}
                        {r.estado === "READY" && (
                          <Button variant="outline" className="text-xs" disabled={!canTecnico || vencida || r.cientifico?.por === session.acting?.name}
                            title={r.cientifico?.por === session.acting?.name ? "El aval técnico lo da una persona distinta de quien dio el científico" : undefined}
                            onClick={() => releaseStore.avalarTecnico(r.id, session.acting?.name ?? "—")}>
                            {canTecnico ? <ShieldCheck size={12} /> : <Lock size={12} />} Aval técnico
                          </Button>
                        )}
                        {r.estado === "APPROVED" && (
                          <Button variant="primary" className="text-xs" disabled={!canTecnico || vencida} onClick={() => setAPublicar(r)}>
                            {canTecnico ? <CheckCircle2 size={12} /> : <Lock size={12} />} Publicar
                          </Button>
                        )}
                        {r.estado === "PUBLISHED" && (
                          <Button variant="ghost" className="text-xs text-danger" disabled={!canTecnico} onClick={() => releaseStore.revertir(r.id)}>
                            <Undo2 size={12} /> Revertir
                          </Button>
                        )}
                        {r.estado === "ROLLED_BACK" && <Badge tone="neutral"><RotateCcw size={11} className="mr-1 inline" />histórico</Badge>}
                      </div>
                    </TD>
                  </TRow>
                );
              })}
            </TBody>
          </Table>
        )}
        <p className="mt-2 text-[11px] text-label-tertiary">
          Publicar exige las dos aprobaciones, en orden: primero científica (herpetólogo), después técnica (administrador). Ninguna es
          automática. Un release vencido (algo cambió aguas arriba) no se puede avalar ni publicar hasta volver a generarlo.
        </p>
      </Card>

      {releaseStore.releases[0] && (
        <Card>
          <CardHeader className="mb-2"><CardTitle>Manifest — v{releaseStore.releases[0].version}</CardTitle></CardHeader>
          <p className="mb-2 text-xs text-label-tertiary">checksum sha256 {releaseStore.releases[0].checksum.slice(0, 24)}…</p>
          <pre className="max-h-72 overflow-auto rounded-md bg-surface-subtle p-3 text-[11px] leading-relaxed">
            {JSON.stringify({ ...releaseStore.releases[0].manifest, species_catalog: releaseStore.releases[0].manifest.species_catalog.slice(0, 2), cryptic_clusters: releaseStore.releases[0].manifest.cryptic_clusters }, null, 2)}
          </pre>
          <p className="mt-1 text-[11px] text-label-tertiary">
            {releaseStore.releases[0].manifest.species_catalog.length} especies en total; se muestran 2 como ejemplo. Los vectores son
            marcador de posición (&quot;… 512 floats …&quot;), igual que en los ejemplos del vault — no hay BioCLIP real corriendo todavía.
          </p>
        </Card>
      )}
    </div>
  );
}
