import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative, type AuditEntry } from "@/lib/app-data/app-client";
import { accionLegible } from "@/lib/app-data/panel-signals";

/** Últimas acciones de la bitácora (audit.log). La lista completa está en Auditoría. */
export function ActivityFeed({ items }: { items: AuditEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Actividad reciente</CardTitle>
        <Link href="/auditoria" className="text-xs font-medium text-accent-ink hover:underline">
          Ver todo
        </Link>
      </CardHeader>
      {items.length === 0 ? (
        <p className="text-sm text-label-secondary">Todavía no hay acciones en la bitácora.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-tint" aria-hidden />
              <p className="min-w-0 text-label-secondary">
                <span className="font-medium text-label-primary">{entry.actor || "Sistema"}</span> {accionLegible(entry)}
                <span className="ml-2 whitespace-nowrap text-xs text-label-tertiary">{formatRelative(entry.created_at)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
