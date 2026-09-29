import { CentroidsConsole } from "@/components/centroids/centroids-console";

export default function CentroidesPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Centroides y morfos</h1>
        <p className="text-sm text-label-secondary">
          Todo sale de los embeddings del worker: centroides globales, regionales por subregión, supercentroides de género y
          familia, y un centroide por cada morfo con individuos suficientes.
        </p>
      </div>
      <CentroidsConsole />
    </div>
  );
}
