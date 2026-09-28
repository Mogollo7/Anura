import { AdaptersConsole } from "@/components/adapters/adapters-console";
import { M3MethodCard } from "@/components/centroids/m3-method-card";

export default function MicroAdaptadoresPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Micro-adaptadores</h1>
        <p className="text-sm text-label-secondary">
          Para especies casi idénticas de una misma subregión: el herpetólogo arma el clúster, el worker entrena solo la
          matriz W (512 × 64, FP16) y alguien valida el resultado. El encoder del teléfono (BioCLIP 1 con fine-tuning) no se vuelve a entrenar ni a descargar.
        </p>
      </div>
      <M3MethodCard foco="adaptadores" />
      <AdaptersConsole />
    </div>
  );
}
