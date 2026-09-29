import { AdaptersConsole } from "@/components/adapters/adapters-console";

export default function MicroAdaptadoresPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Clústeres</h1>
        <p className="text-sm text-label-secondary">
          Especies casi idénticas que el encoder del teléfono confunde. La matriz sale de las fotos de validación contra los
          centroides reales; el herpetólogo decide qué especies forman un clúster. El encoder no se vuelve a entrenar.
        </p>
      </div>
      <AdaptersConsole />
    </div>
  );
}
