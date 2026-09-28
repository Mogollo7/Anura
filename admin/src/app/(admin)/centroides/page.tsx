import { CentroidsConsole } from "@/components/centroids/centroids-console";
import { RealCentroidsCard } from "@/components/centroids/real-centroids-card";

export default function CentroidesPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Centroides y morfos</h1>
        <p className="text-sm text-label-secondary">
          El lote de arriba sale de los embeddings del worker: centroides globales, regionales por subregión y
          supercentroides. La vista de abajo sigue ensayando los sub-centroides de morfo con vectores simulados, hasta
          que un herpetólogo declare morfos reales.
        </p>
      </div>
      <RealCentroidsCard />
      <CentroidsConsole />
    </div>
  );
}
