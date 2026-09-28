import { DataCleaningConsole } from "@/components/quality/data-cleaning-console";
import { QualitySignals } from "@/components/quality/quality-signals";

export default function CalidadPage() {
  return (
    <div className="space-y-6">
      <DataCleaningConsole />
      <QualitySignals />
    </div>
  );
}
