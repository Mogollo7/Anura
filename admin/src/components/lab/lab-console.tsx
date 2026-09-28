"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bell,
  CloudUpload,
  Copy,
  DownloadCloud,
  FlaskConical,
  RotateCcw,
  Smartphone,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  FAULT_LABEL,
  NETWORK_LABEL,
  downloadDurationMs,
  downloadPrechecks,
  evaluateSync,
  type Faults,
  type LabDevice,
  type LabObservation,
  type Network,
  type PackageOption,
  type SyncOutcome,
} from "@/lib/lab/sim";

export type FleetPreset = LabDevice & { id: string; label: string };
export type NotifTemplate = { id: string; titulo: string; cuerpo: string };

type LogLevel = "info" | "ok" | "warn" | "error";
type LogEntry = { id: number; t: string; level: LogLevel; text: string };
type Download = { pkg: PackageOption; progress: number; phase: "descargando" | "verificando" };

const LOG_TONE: Record<LogLevel, string> = {
  info: "text-label-secondary",
  ok: "text-accent-ink",
  warn: "text-warning",
  error: "text-danger",
};

const NO_FAULTS: Faults = { checksum: false, timeout: false, conflicto: false, servidor500: false };

export function LabConsole({
  presets,
  packages,
  appVersions,
  species,
  notifTemplates,
}: {
  presets: FleetPreset[];
  packages: PackageOption[];
  appVersions: string[];
  species: string[];
  notifTemplates: NotifTemplate[];
}) {
  const [presetId, setPresetId] = useState(presets[0].id);
  const [device, setDevice] = useState<LabDevice>(presets[0]);
  const [network, setNetwork] = useState<Network>("wifi");
  const [cellularAllowed, setCellularAllowed] = useState(true);
  const [faults, setFaults] = useState<Faults>(NO_FAULTS);
  const [log, setLog] = useState<LogEntry[]>([]);

  const [pkgKey, setPkgKey] = useState(`${packages[0].name}|${packages[0].version}`);
  const [download, setDownload] = useState<Download | null>(null);
  const [queuedDownload, setQueuedDownload] = useState<PackageOption | null>(null);

  const [obsQueue, setObsQueue] = useState<LabObservation[]>([]);
  const [obsSpecies, setObsSpecies] = useState(species[0]);
  const [obsFlags, setObsFlags] = useState({ sinGps: false, sinFoto: false, altitudAnomala: false });
  const [lastSync, setLastSync] = useState<SyncOutcome[] | null>(null);

  const [notifTitle, setNotifTitle] = useState("");
  const [notifBody, setNotifBody] = useState("");
  const [pendingNotifs, setPendingNotifs] = useState<{ titulo: string; cuerpo: string }[]>([]);
  const [banner, setBanner] = useState<{ titulo: string; cuerpo: string } | null>(null);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const logSeq = useRef(0);
  const obsSeq = useRef(0);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const selectedPkg = packages.find((p) => `${p.name}|${p.version}` === pkgKey)!;
  const prechecks = downloadPrechecks(device, selectedPkg, network, cellularAllowed);

  function push(level: LogLevel, text: string) {
    logSeq.current += 1;
    const t = new Date().toLocaleTimeString("es-CO", { hour12: false });
    const id = logSeq.current;
    setLog((prev) => [{ id, t, level, text }, ...prev].slice(0, 200));
  }

  function showBanner(n: { titulo: string; cuerpo: string }) {
    setBanner(n);
    setTimeout(() => setBanner(null), 4500);
  }

  function loadPreset(id: string) {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    if (timer.current) clearInterval(timer.current);
    setPresetId(id);
    setDevice(p);
    setDownload(null);
    setQueuedDownload(null);
    setObsQueue([]);
    setLastSync(null);
    push("info", `Perfil cargado: ${p.label}.`);
  }

  function canUseNetwork(n: Network) {
    return n !== "offline" && !(n === "movil" && !cellularAllowed);
  }

  function runDownload(pkg: PackageOption, net: Network, activeFaults: Faults) {
    if (timer.current) clearInterval(timer.current);
    const duration = downloadDurationMs(pkg.sizeMb, net);
    const start = Date.now();
    let warnedDrop = false;
    push("info", `Descargando ${pkg.name} v${pkg.version} (${pkg.sizeMb} MB) por ${NETWORK_LABEL[net]}…`);
    setDownload({ pkg, progress: 0, phase: "descargando" });

    timer.current = setInterval(() => {
      const ratio = Math.min(1, (Date.now() - start) / duration);

      if (activeFaults.timeout && ratio >= 0.6) {
        clearInterval(timer.current!);
        setDownload(null);
        push("error", `Timeout al 60 %: descarga abortada. Se conserva la versión instalada; la app reintentará en la próxima sync.`);
        return;
      }
      if (net === "intermitente" && ratio >= 0.4 && !warnedDrop) {
        warnedDrop = true;
        push("warn", "Red perdida al 40 %: reanudando desde el último byte (petición HTTP Range).");
      }
      if (ratio < 1) {
        setDownload({ pkg, progress: ratio, phase: "descargando" });
        return;
      }

      clearInterval(timer.current!);
      setDownload({ pkg, progress: 1, phase: "verificando" });
      setTimeout(() => {
        setDownload(null);
        if (activeFaults.checksum) {
          push("error", "SHA-256 no coincide: archivo descartado. La versión anterior sigue activa.");
          return;
        }
        setDevice((d) => ({
          ...d,
          storageFreeMb: d.storageFreeMb - Math.ceil(pkg.sizeMb),
          installed: [
            ...d.installed.filter((p) => p.name !== pkg.name),
            { name: pkg.name, version: pkg.version, stage: pkg.stage },
          ],
        }));
        push("ok", `${pkg.name} v${pkg.version} verificado e instalado: ${pkg.especies} especies, ${pkg.vectores.toLocaleString("es-CO")} vectores.`);
      }, 700);
    }, 100);
  }

  function requestDownload() {
    const blocking = prechecks.filter((c) => !c.ok);
    if (blocking.length) {
      blocking.forEach((c) => push("error", c.text));
      return;
    }
    if (!canUseNetwork(network)) {
      setQueuedDownload(selectedPkg);
      push("warn", `${selectedPkg.name} v${selectedPkg.version} en cola: ${network === "offline" ? "sin conexión" : "esperando Wi-Fi"}.`);
      return;
    }
    runDownload(selectedPkg, network, faults);
  }

  function changeNetwork(n: Network) {
    setNetwork(n);
    push("info", `Red: ${NETWORK_LABEL[n]}.`);
    if (n === "offline" && download?.phase === "descargando") {
      if (timer.current) clearInterval(timer.current);
      setDownload(null);
      setQueuedDownload(download.pkg);
      push("warn", `Conexión perdida: ${download.pkg.name} vuelve a la cola.`);
      return;
    }
    const usable = n !== "offline" && !(n === "movil" && !cellularAllowed);
    if (usable && queuedDownload) {
      setQueuedDownload(null);
      runDownload(queuedDownload, n, faults);
    }
    if (n !== "offline" && pendingNotifs.length) {
      push("ok", `${pendingNotifs.length} notificación(es) entregada(s) al reconectar.`);
      showBanner(pendingNotifs[pendingNotifs.length - 1]);
      setPendingNotifs([]);
    }
  }

  function addObservation(duplicateOfLast = false) {
    obsSeq.current += 1;
    const last = obsQueue[obsQueue.length - 1];
    const obs: LabObservation = duplicateOfLast && last
      ? { ...last, id: `lab-obs-${obsSeq.current}` }
      : {
          id: `lab-obs-${obsSeq.current}`,
          species: obsSpecies,
          sinGps: obsFlags.sinGps,
          sinFoto: obsFlags.sinFoto,
          altitud: obsFlags.altitudAnomala ? 6200 : 1450 + obsSeq.current * 37,
          hash: `h${obsSeq.current}`,
        };
    setObsQueue((q) => [...q, obs]);
    push("info", `Observación capturada offline: ${obs.species}${duplicateOfLast ? " (misma foto que la anterior)" : ""}.`);
  }

  function syncObservations() {
    if (!canUseNetwork(network)) {
      push("warn", `Sync pospuesta: ${network === "offline" ? "sin conexión" : "política solo Wi-Fi"}. ${obsQueue.length} observaciones siguen en el teléfono.`);
      return;
    }
    if (obsQueue.length === 0) {
      push("info", "Sync: no hay observaciones pendientes.");
      return;
    }
    const outcomes = evaluateSync(obsQueue, faults);
    setLastSync(outcomes);
    setObsQueue(outcomes.filter((o) => o.status === "reintentar").map((o) => o.obs));
    for (const o of outcomes) {
      const level: LogLevel = o.status === "subida" ? "ok" : o.status === "marcada" || o.status === "reintentar" ? "warn" : "error";
      push(level, `${o.obs.id} (${o.obs.species}): ${o.text}`);
    }
  }

  function sendNotification() {
    const n = { titulo: notifTitle.trim(), cuerpo: notifBody.trim() };
    if (!n.titulo) return;
    if (network === "offline") {
      setPendingNotifs((p) => [...p, n]);
      push("warn", `Push "${n.titulo}" en cola de FCM: se entrega al reconectar.`);
      return;
    }
    push("ok", `Push entregado: "${n.titulo}".`);
    showBanner(n);
  }

  function reset() {
    loadPreset(presetId);
    setNetwork("wifi");
    setFaults(NO_FAULTS);
    setPendingNotifs([]);
    setLog([]);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <FlaskConical size={18} className="mt-0.5 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-semibold text-label-primary">Sandbox ≠ producción</p>
            <p className="text-label-secondary">
              Todo ocurre en un teléfono simulado en este navegador. Nada llega a dispositivos reales, al servidor ni a
              las cifras del panel. Sirve para probar versiones de paquete que aún no se publican.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={reset} className="shrink-0">
          <RotateCcw size={14} /> Reiniciar sandbox
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader><CardTitle>1 · Dispositivo y red</CardTitle></CardHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Clonar un dispositivo de la flota" hint="Copia su modelo, versión de app, espacio y paquetes.">
                <Select value={presetId} onChange={(e) => loadPreset(e.target.value)}>
                  {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </Select>
              </Field>
              <Field label="Versión de ANURA Mobile">
                <Select value={device.appVersion} onChange={(e) => { setDevice((d) => ({ ...d, appVersion: e.target.value })); push("info", `App cambiada a v${e.target.value}.`); }}>
                  {appVersions.map((v) => <option key={v}>{v}</option>)}
                </Select>
              </Field>
              <Field label={`Espacio libre: ${device.storageFreeMb.toLocaleString("es-CO")} MB`}>
                <input
                  type="range"
                  min={50}
                  max={8000}
                  step={50}
                  value={Math.min(device.storageFreeMb, 8000)}
                  onChange={(e) => setDevice((d) => ({ ...d, storageFreeMb: Number(e.target.value) }))}
                  className="w-full accent-accent-ink"
                />
              </Field>
              <Field label="Red">
                <Select value={network} onChange={(e) => changeNetwork(e.target.value as Network)}>
                  {(Object.keys(NETWORK_LABEL) as Network[]).map((n) => <option key={n} value={n}>{NETWORK_LABEL[n]}</option>)}
                </Select>
              </Field>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cellularAllowed} onChange={(e) => setCellularAllowed(e.target.checked)} />
              Política: permitir sincronizar con datos móviles
            </label>

            <div className="mt-4 border-t border-border pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-label-tertiary">Fallas inyectadas</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(FAULT_LABEL) as (keyof Faults)[]).map((k) => (
                  <label key={k} className={cn("flex items-start gap-2 rounded-md border p-2.5 text-sm", faults[k] ? "border-danger/40 bg-danger/5" : "border-border")}>
                    <input
                      type="checkbox"
                      checked={faults[k]}
                      onChange={(e) => {
                        setFaults((f) => ({ ...f, [k]: e.target.checked }));
                        push(e.target.checked ? "warn" : "info", `Falla "${FAULT_LABEL[k].label}" ${e.target.checked ? "activada" : "desactivada"}.`);
                      }}
                      className="mt-1"
                    />
                    <span>
                      <span className="block font-medium">{FAULT_LABEL[k].label}</span>
                      <span className="block text-xs text-label-secondary">{FAULT_LABEL[k].text}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader><CardTitle>2 · Descargar o actualizar un paquete</CardTitle></CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Paquete y versión (incluye versiones sin publicar)" className="flex-1">
                <Select value={pkgKey} onChange={(e) => setPkgKey(e.target.value)}>
                  {packages.map((p) => (
                    <option key={`${p.name}|${p.version}`} value={`${p.name}|${p.version}`}>
                      {p.name} v{p.version} — {p.stage} · {p.sizeMb} MB
                    </option>
                  ))}
                </Select>
              </Field>
              <Button variant="primary" onClick={requestDownload} disabled={!!download}>
                <DownloadCloud size={14} /> Descargar
              </Button>
            </div>
            {prechecks.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs">
                {prechecks.map((c) => (
                  <li key={c.text} className={c.level === "error" ? "text-danger" : c.level === "warning" ? "text-warning" : "text-label-secondary"}>
                    • {c.text}
                  </li>
                ))}
              </ul>
            )}
            {queuedDownload && !download && (
              <p className="mt-3 text-xs text-warning">En cola: {queuedDownload.name} v{queuedDownload.version} (se descarga al tener red permitida).</p>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3 · Observaciones offline y sincronización</CardTitle>
              <Badge tone={obsQueue.length ? "warning" : "neutral"}>{obsQueue.length} en el teléfono</Badge>
            </CardHeader>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <Field label="Especie">
                <Select value={obsSpecies} onChange={(e) => setObsSpecies(e.target.value)}>
                  {species.map((s) => <option key={s}>{s}</option>)}
                </Select>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => addObservation()}>Capturar</Button>
                <Button variant="ghost" disabled={obsQueue.length === 0} onClick={() => addObservation(true)} title="Misma foto que la anterior">
                  <Copy size={14} /> Duplicar última
                </Button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <span className="text-xs font-medium text-label-secondary">Datos corruptos/incompletos:</span>
              {([["sinGps", "Sin GPS"], ["sinFoto", "Sin foto ni audio"], ["altitudAnomala", "Altitud 6.200 m"]] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={obsFlags[k]} onChange={(e) => setObsFlags((f) => ({ ...f, [k]: e.target.checked }))} />
                  {label}
                </label>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button variant="primary" onClick={syncObservations}>
                <CloudUpload size={14} /> Sincronizar
              </Button>
              <Button variant="ghost" disabled={obsQueue.length === 0} onClick={() => { setObsQueue([]); push("info", "Cola local vaciada."); }}>
                <Trash2 size={14} /> Vaciar cola
              </Button>
            </div>
            {lastSync && (
              <ul className="mt-3 space-y-1 text-xs">
                {lastSync.map((o) => (
                  <li key={o.obs.id} className="flex items-start gap-2">
                    <Badge tone={o.status === "subida" ? "accent" : o.status === "marcada" || o.status === "reintentar" ? "warning" : "danger"}>{o.status}</Badge>
                    <span className="text-label-secondary">{o.obs.id} · <span className="italic">{o.obs.species}</span> — {o.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader><CardTitle>4 · Notificación push</CardTitle></CardHeader>
            <div className="space-y-3">
              <Field label="Usar una notificación existente">
                <Select
                  value=""
                  onChange={(e) => {
                    const t = notifTemplates.find((n) => n.id === e.target.value);
                    if (t) { setNotifTitle(t.titulo); setNotifBody(t.cuerpo); }
                  }}
                >
                  <option value="">— Escribir una nueva —</option>
                  {notifTemplates.map((n) => <option key={n.id} value={n.id}>{n.titulo}</option>)}
                </Select>
              </Field>
              <Field label="Título">
                <Input value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)} maxLength={65} />
              </Field>
              <Field label="Cuerpo" hint={`${notifBody.length}/240 — Android recorta el texto largo en la vista compacta.`}>
                <Textarea value={notifBody} onChange={(e) => setNotifBody(e.target.value)} maxLength={240} />
              </Field>
              <div className="flex justify-end">
                <Button variant="primary" disabled={!notifTitle.trim()} onClick={sendNotification}>
                  <Bell size={14} /> Enviar al sandbox
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Phone device={device} network={network} download={download} queueCount={obsQueue.length} banner={banner} />

          <Card className="p-4">
            <CardHeader className="mb-2">
              <CardTitle>Registro de eventos</CardTitle>
              <button type="button" onClick={() => setLog([])} className="text-xs text-label-tertiary hover:text-label-primary">Limpiar</button>
            </CardHeader>
            <div className="max-h-80 space-y-1 overflow-y-auto font-mono text-[11px] leading-relaxed" aria-live="polite">
              {log.length === 0 && <p className="text-label-tertiary">Sin eventos todavía.</p>}
              {log.map((e) => (
                <p key={e.id} className={LOG_TONE[e.level]}>
                  <span className="text-label-tertiary">{e.t}</span> {e.text}
                </p>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Phone({
  device,
  network,
  download,
  queueCount,
  banner,
}: {
  device: LabDevice;
  network: Network;
  download: Download | null;
  queueCount: number;
  banner: { titulo: string; cuerpo: string } | null;
}) {
  return (
    <div className="mx-auto w-[280px] rounded-[2.2rem] border-[10px] border-label-primary bg-label-primary shadow-float">
      <div className="relative h-[500px] overflow-hidden rounded-[1.6rem] bg-surface">
        <div className="flex items-center justify-between px-5 pt-3 text-[11px] font-medium text-label-primary">
          <span>9:41</span>
          <span className="flex items-center gap-1">
            {network === "offline" ? <WifiOff size={12} /> : <Wifi size={12} className={network === "lenta" || network === "intermitente" ? "text-warning" : undefined} />}
            {NETWORK_LABEL[network]}
          </span>
        </div>

        {banner && (
          <div className="absolute inset-x-3 top-8 z-10 rounded-xl border border-border bg-surface p-3 shadow-float">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-label-tertiary">
              <Bell size={10} /> ANURA · ahora
            </p>
            <p className="mt-0.5 text-xs font-semibold text-label-primary">{banner.titulo}</p>
            <p className="line-clamp-2 text-[11px] text-label-secondary">{banner.cuerpo}</p>
          </div>
        )}

        <div className="px-4 pt-6">
          <p className="flex items-center gap-1.5 text-lg font-semibold text-label-primary">
            <Smartphone size={16} /> ANURA
            <Badge tone="warning" className="ml-auto text-[11px]">sandbox</Badge>
          </p>
          <p className="text-[11px] text-label-secondary">
            {device.model} · v{device.appVersion} · {device.storageFreeMb.toLocaleString("es-CO")} MB libres
          </p>

          <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-label-tertiary">Paquetes offline</p>
          <ul className="mt-1.5 space-y-1.5">
            {device.installed.length === 0 && <li className="text-xs text-label-tertiary">Ninguno: identifica solo con red.</li>}
            {device.installed.map((p) => (
              <li key={p.name} className="flex items-center justify-between rounded-lg bg-surface-subtle px-2.5 py-2 text-xs">
                <span className="font-medium">{p.name}</span>
                <span className="flex items-center gap-1">
                  v{p.version}
                  {p.stage !== "publicado" && <Badge tone="warning" className="px-1.5 text-[11px]">{p.stage}</Badge>}
                </span>
              </li>
            ))}
          </ul>

          {download && (
            <div className="mt-4 rounded-lg border border-border p-2.5 text-xs">
              <p className="font-medium">
                {download.phase === "verificando" ? "Verificando SHA-256…" : `Descargando ${download.pkg.name} v${download.pkg.version}`}
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-subtle">
                <div className="h-full bg-accent-ink transition-[width]" style={{ width: `${Math.round(download.progress * 100)}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-label-tertiary">
                {Math.round(download.progress * download.pkg.sizeMb * 10) / 10} / {download.pkg.sizeMb} MB
              </p>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between rounded-lg bg-surface-subtle px-2.5 py-2 text-xs">
            <span>Observaciones por subir</span>
            <span className={cn("font-semibold", queueCount ? "text-warning" : "text-label-secondary")}>{queueCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
