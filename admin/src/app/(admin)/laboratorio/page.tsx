import { getDevices, APP_VERSIONS } from "@/lib/mock/devices";
import { estimateSqliteMb, getPackages } from "@/lib/mock/packages";
import { getNotifications } from "@/lib/mock/notifications";
import { getAllSpecies } from "@/lib/mock/catalog";
import { parsePackage } from "@/lib/devices/health";
import { LaboratorioShell } from "@/components/lab/laboratorio-shell";
import type { FleetPreset } from "@/components/lab/lab-console";
import type { PackageOption } from "@/lib/lab/sim";

export default function LaboratorioPage() {
  // Versiones de todas las etapas: el laboratorio existe para probar las que aún no se publican.
  const packages: PackageOption[] = getPackages().flatMap((p) =>
    [...p.versions].reverse().map((v) => ({
      name: p.nombre,
      version: v.version,
      stage: v.stage,
      especies: v.especies,
      vectores: v.vectores,
      sizeMb: estimateSqliteMb(v.vectores, v.especies),
    }))
  );

  // Perfiles variados: primero los que exponen casos límite (poco espacio, poca RAM, app beta).
  const fleet = getDevices().filter((d) => !d.bloqueo);
  const interesting = [
    fleet.find((d) => d.storageFreeMb < 400),
    fleet.find((d) => d.ramGb < 3),
    fleet.find((d) => d.appVersion.includes("beta")),
  ].filter((d): d is NonNullable<typeof d> => !!d);
  const picked = [...new Set([...interesting, ...fleet.slice(0, 8)])];

  const presets: FleetPreset[] = picked.map((d) => ({
    id: d.id,
    label: `${d.model} · v${d.appVersion} · ${d.storageFreeMb.toLocaleString("es-CO")} MB (${d.ownerName})`,
    model: d.model,
    apiLevel: d.apiLevel,
    ramGb: d.ramGb,
    appVersion: d.appVersion,
    storageFreeMb: d.storageFreeMb,
    installed: d.installedPackages.map((e) => ({ ...parsePackage(e), stage: "publicado" as const })),
  }));

  return (
    <LaboratorioShell
      presets={presets}
      packages={packages}
      appVersions={APP_VERSIONS}
      species={getAllSpecies().map((s) => s.especie).sort()}
      notifTemplates={getNotifications().map((n) => ({ id: n.id, titulo: n.titulo, cuerpo: n.cuerpo }))}
    />
  );
}
