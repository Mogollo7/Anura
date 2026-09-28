import { OsrConsole } from "@/components/osr/osr-console";
import { M3MethodCard } from "@/components/centroids/m3-method-card";

export default function OsrPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">OSR · rechazo de desconocidas</h1>
        <p className="text-sm text-label-secondary">
          Calibra las tres capas que impiden que la app le ponga nombre a una rana que no conoce: radio por especie (Weibull),
          ε de cada clúster y umbral geográfico. El worker propone, la persona valida o ajusta. Coseno y Mahalanobis se miden
          sobre los mismos vectores y se comparan; ninguno se elige aquí. La decisión de una foto, con su altitud, la hace el simulador
          contra el release publicado.
        </p>
      </div>
      <M3MethodCard foco="osr" />
      <OsrConsole />
    </div>
  );
}
