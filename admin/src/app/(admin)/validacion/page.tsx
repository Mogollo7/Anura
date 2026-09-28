import { getValidationReports } from "@/lib/mock/validation";
import { ValidationExplorer } from "@/components/validation/validation-explorer";
import { RealComparisonCard } from "@/components/real/real-comparison-card";

export default function ValidacionPage() {
  const reports = getValidationReports();
  return (
    <div className="space-y-6">
      <RealComparisonCard />
      <p className="text-sm text-label-secondary">
        Lo de abajo es el explorador por especie con métricas simuladas del paquete departamental. Se reemplaza por las
        métricas reales de cada release cuando el backend guarde las evaluaciones.
      </p>
      <ValidationExplorer reports={reports} />
    </div>
  );
}
