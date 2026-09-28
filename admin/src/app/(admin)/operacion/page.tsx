import { NAV_AREAS } from "@/config/nav";
import { AreaBoard } from "@/components/overview/area-board";
import { AppKpis } from "@/components/app-data/app-kpis";
import { OpenIssuesKpi } from "@/components/overview/open-issues-kpi";

export default function OperacionPage() {
  const area = NAV_AREAS.find((a) => a.href === "/operacion")!;
  const cards = area.sections.flatMap((s) => s.items).map((item) => ({ ...item, text: item.blurb }));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <OpenIssuesKpi />
      </div>
      <AppKpis show={["avisos", "observaciones"]} />
      <AreaBoard title={area.label} summary={area.summary} cards={cards} />
    </div>
  );
}
