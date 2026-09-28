import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { NavIcon } from "@/config/nav";

export type AreaCard = {
  href: string;
  label: string;
  text: string;
  icon: NavIcon;
};

/** Página de un botón principal: primero el dibujo de lo que hay dentro, después el salto. */
export function AreaBoard({
  title,
  summary,
  cards,
}: {
  title: string;
  summary: string;
  cards: AreaCard[];
}) {
  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">{title}</h1>
        <p className="mt-1 text-sm text-label-secondary">{summary}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.href} href={card.href} className="flex flex-col p-4">
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-accent-wash text-accent-ink">
                <Icon size={18} />
              </span>
              <p className="text-sm font-semibold text-label-primary">{card.label}</p>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-label-secondary">{card.text}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent-ink">
                Abrir <ArrowRight size={12} />
              </span>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function Jump({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 rounded-md bg-surface px-2.5 py-1 text-xs font-medium text-label-primary ring-1 ring-border hover:bg-surface-subtle">
      {children}
    </Link>
  );
}
