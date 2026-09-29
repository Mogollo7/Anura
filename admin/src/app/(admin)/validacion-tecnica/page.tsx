import { TechnicalValidationConsole } from "@/components/validation/technical-validation-console";
import { M3MethodCard } from "@/components/centroids/m3-method-card";

export default function ValidacionTecnicaPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Validación técnica</h1>
        <p className="text-sm text-label-secondary">
          Antes de compilar, el servidor revisa el paquete de cada subregión: especies entrenables, vectores del
          encoder del teléfono, centroides al día y umbral OSR validado por una persona. Si algo falta, dice qué es y
          dónde se arregla.
        </p>
      </div>
      <TechnicalValidationConsole />
      <M3MethodCard foco="validacion" />
    </div>
  );
}
