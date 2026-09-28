import Link from "next/link";
import { getAllSpecies } from "@/lib/mock/catalog";
import { TOPE_DEFAULT } from "@/lib/packages/constants";
import { getSeedJobs } from "@/lib/worker/jobs";
import { WorkerConsole } from "@/components/worker/worker-console";
import { ServerWorkerCard } from "@/components/worker/server-worker-card";

export default function IaPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Worker y embeddings</h1>
        <p className="text-sm text-label-secondary">
          Job → worker del PC → encoder del teléfono (BioCLIP 1 con fine-tuning) → vectores de 512 → validación → almacenamiento. La entrada es la
          membresía curada del dataset, no la referencia bruta. El worker calcula; no decide ciencia ni publica.
          Lo que guarda se mira en la{" "}
          <Link href="/vectorial" className="font-medium text-accent-ink hover:underline">DB vectorial</Link>.
        </p>
      </div>
      <ServerWorkerCard />
      <div className="space-y-1 border-t border-border pt-6">
        <h2 className="text-sm font-semibold text-label-primary">Simulación</h2>
        <p className="text-sm text-label-secondary">
          Cola por especie, tope por observación y validación de vectores todavía son simulados: el worker real de arriba ya calcula los vectores de
          todas las fotos del servidor; el resto llega con M3.
        </p>
      </div>
      <WorkerConsole
        species={getAllSpecies()}
        seedJobs={getSeedJobs()}
        defaultTope={TOPE_DEFAULT}
      />
    </div>
  );
}
