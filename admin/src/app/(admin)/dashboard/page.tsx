import { AppKpis } from "@/components/app-data/app-kpis";
import { DashboardLive } from "@/components/dashboard/dashboard-live";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <AppKpis show={["usuarios", "dispositivos", "observaciones", "avisos"]} />
      <DashboardLive />
    </div>
  );
}
