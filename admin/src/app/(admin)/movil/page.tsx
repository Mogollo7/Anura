import { NAV_AREAS } from "@/config/nav";
import { AreaBoard } from "@/components/overview/area-board";
import { AppKpis } from "@/components/app-data/app-kpis";

export default function MovilPage() {
  const area = NAV_AREAS.find((a) => a.href === "/movil")!;
  const cards = area.sections.flatMap((s) => s.items).map((item) => ({ ...item, text: item.blurb }));
  return (
    <div className="space-y-6">
      <AppKpis />
      <AreaBoard title={area.label} summary={area.summary} cards={cards} />
    </div>
  );
}
