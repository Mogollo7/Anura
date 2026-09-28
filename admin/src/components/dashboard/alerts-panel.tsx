import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PanelAlert } from "@/lib/app-data/panel-signals";

const SEVERITY_META = {
  warning: { icon: AlertTriangle, className: "text-warning" },
  info: { icon: Info, className: "text-info" },
} as const;

export function AlertsPanel({ alerts }: { alerts: PanelAlert[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Problemas abiertos</CardTitle>
        <Badge tone={alerts.length ? "warning" : "accent"}>{alerts.length}</Badge>
      </CardHeader>
      {alerts.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-label-secondary">
          <CheckCircle2 size={16} className="text-accent-ink" aria-hidden /> Nada pendiente por ahora.
        </p>
      ) : (
        <ul className="space-y-1">
          {alerts.map((alert) => {
            const meta = SEVERITY_META[alert.severity];
            const Icon = meta.icon;
            return (
              <li key={alert.id}>
                <Link
                  href={alert.href}
                  className="group -mx-2 flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-surface-subtle"
                >
                  <Icon size={16} className={`mt-0.5 shrink-0 ${meta.className}`} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-label-primary group-hover:text-accent-ink">{alert.title}</span>
                    <span className="block text-xs text-label-secondary">{alert.detail}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
