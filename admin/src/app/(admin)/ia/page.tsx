import Link from "next/link";
import { WorkerConsole } from "@/components/worker/worker-console";

export default function IaPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Worker y embeddings</h1>
        <p className="text-sm text-label-secondary">
          Un trabajo le pide al worker del PC con GPU que calcule, con el mismo encoder del teléfono, el vector de 512 de
          cada foto que aún no lo tiene. El worker calcula; no decide ciencia ni publica. Lo que guarda se mira en la{" "}
          <Link href="/vectorial" className="font-medium text-accent-ink hover:underline">DB vectorial</Link> y se usa en{" "}
          <Link href="/centroides" className="font-medium text-accent-ink hover:underline">Centroides</Link>.
        </p>
      </div>
      <WorkerConsole />
    </div>
  );
}
