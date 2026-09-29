import { ValidationExplorer } from "@/components/validation/validation-explorer";

export default function ValidacionPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Métricas</h1>
        <p className="text-sm text-label-secondary">
          Cómo le va a cada paquete con fotos que no vio: las de la partición test, contra sus centroides vigentes. El servidor calcula y
          guarda cada evaluación; el rechazo de desconocidas sale del τ validado en OSR.
        </p>
      </div>
      <ValidationExplorer />
    </div>
  );
}
