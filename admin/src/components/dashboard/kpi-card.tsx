import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { NavIcon } from "@/config/nav";

export function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  trend,
  href,
}: {
  icon: NavIcon;
  label: string;
  value: string;
  hint?: string;
  trend?: string;
  href?: string;
}) {
  return (
    <Card href={href} className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-wash text-accent-ink">
          <Icon size={16} />
        </span>
        {trend && (
          <span className="flex items-center gap-0.5 text-xs font-medium text-success">
            <ArrowUpRight size={12} />
            {trend}
          </span>
        )}
      </div>
      <p className="text-2xl font-semibold tracking-tight text-label-primary">{value}</p>
      <p className="text-xs text-label-secondary">{label}</p>
      {hint && <p className="mt-1 text-[11px] text-label-tertiary">{hint}</p>}
    </Card>
  );
}
