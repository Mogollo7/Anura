import { TechnicalValidationConsole } from "@/components/validation/technical-validation-console";
import { M3MethodCard } from "@/components/centroids/m3-method-card";

export default function ValidacionTecnicaPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Validación técnica</h1>
        <p className="text-sm text-label-secondary">
          Antes de compilar (F23): revisa que dataset, embeddings, centroides, morfos y OSR sean consistentes para
          el paquete de una subregión. No inventa una métrica de modelo que no exista — reutiliza el KAR/FAR/AUROC
          ya medido en OSR y los checks del job de embeddings ya corrido.
        </p>
      </div>
      <M3MethodCard foco="validacion" />
      <TechnicalValidationConsole />
    </div>
  );
}
