"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { NAV_AREAS, type NavItem } from "@/config/nav";
import { cn } from "@/lib/utils";

function itemActive(pathname: string, href: string, search: string) {
  const [path, query] = href.split("?");
  if (query) {
    if (pathname !== path) return false;
    const want = new URLSearchParams(query);
    const have = new URLSearchParams(search);
    for (const [key, value] of want) if (have.get(key) !== value) return false;
    return true;
  }
  return pathname === path || pathname.startsWith(path + "/");
}

export function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const activeHref = NAV_AREAS.find((a) =>
    a.href === pathname || a.sections.some((s) => s.items.some((i) => itemActive(pathname, i.href, search) || i.children?.some((c) => itemActive(pathname, c.href, search))))
  )?.href ?? null;

  const [openHref, setOpenHref] = useState<string | null>(activeHref);
  // Al cambiar de ruta se abre el área activa; ajuste durante el render, no en un efecto.
  const [ultimaRuta, setUltimaRuta] = useState(pathname);
  if (pathname !== ultimaRuta) {
    setUltimaRuta(pathname);
    if (activeHref) setOpenHref(activeHref);
  }

  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3">
      {NAV_AREAS.map((area) => {
        const children = area.sections.flatMap((s) => s.items).filter((i) => i.href !== area.href);
        const areaOn = area.href === pathname || children.some((i) => itemActive(pathname, i.href, search) || i.children?.some((c) => itemActive(pathname, c.href, search)));
        const open = openHref === area.href && children.length > 0;
        const Icon = area.icon;
        return (
          <div key={area.href} className="mb-0.5">
            <div className="flex items-center gap-0.5">
              <Link
                href={area.href}
                onClick={onNavigate}
                aria-current={area.href === pathname ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-[13px]",
                  areaOn
                    ? "bg-surface-subtle font-medium text-label-primary"
                    : "text-label-secondary hover:bg-surface-subtle hover:text-label-primary"
                )}
              >
                <Icon size={16} strokeWidth={areaOn ? 2.25 : 2} className={areaOn ? "text-accent-ink" : "text-label-tertiary"} />
                <span className="truncate">{area.label}</span>
              </Link>
              {children.length > 0 && (
                <button
                  type="button"
                  aria-expanded={open}
                  aria-label={open ? `Cerrar ${area.label}` : `Abrir ${area.label}`}
                  onClick={() => setOpenHref(open ? null : area.href)}
                  className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-label-tertiary hover:bg-surface-subtle hover:text-label-primary"
                >
                  <ChevronDown size={14} className={cn("transition-transform", !open && "-rotate-90")} />
                </button>
              )}
            </div>
            {open && (
              <div className="mb-2 mt-0.5 ml-3 border-l border-border pl-2">
                {area.sections.map((section) => {
                  const items = section.items.filter((i) => i.href !== area.href);
                  if (items.length === 0) return null;
                  return (
                    <div key={section.title ?? items[0].href} className="mt-1.5">
                      {section.title && (
                        <p className="px-2 pb-0.5 text-[11px] font-medium uppercase tracking-wider text-label-tertiary">
                          {section.title}
                        </p>
                      )}
                      <NavList items={items} pathname={pathname} search={search} onNavigate={onNavigate} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function NavList({
  items,
  pathname,
  search,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  search: string;
  onNavigate?: () => void;
}) {
  return (
    <ul>
      {items.map((item) => (
        <NavRow key={item.href} item={item} pathname={pathname} search={search} onNavigate={onNavigate} />
      ))}
    </ul>
  );
}

function NavRow({
  item,
  pathname,
  search,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  search: string;
  onNavigate?: () => void;
}) {
  const kids = item.children ?? [];
  const active = itemActive(pathname, item.href, search);
  const childOn = kids.some((child) => itemActive(pathname, child.href, search));
  const [open, setOpen] = useState(childOn);
  const [visto, setVisto] = useState(childOn);
  if (childOn !== visto) {
    setVisto(childOn);
    if (childOn) setOpen(true);
  }
  const Icon = item.icon;
  return (
    <li>
      <div className="flex items-center gap-0.5">
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active && !childOn ? "page" : undefined}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-[13px]",
            active || childOn
              ? "bg-accent-wash font-medium text-accent-ink"
              : "text-label-secondary hover:bg-surface-subtle hover:text-label-primary"
          )}
        >
          <Icon size={14} strokeWidth={active || childOn ? 2.25 : 2} />
          <span className="truncate">{item.label}</span>
        </Link>
        {kids.length > 0 && (
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? `Cerrar ${item.label}` : `Abrir ${item.label}`}
            onClick={() => setOpen((value) => !value)}
            className="flex h-7 w-6 shrink-0 items-center justify-center rounded-md text-label-tertiary hover:bg-surface-subtle hover:text-label-primary"
          >
            <ChevronDown size={13} className={cn("transition-transform", !open && "-rotate-90")} />
          </button>
        )}
      </div>
      {open && kids.length > 0 && (
        <div className="ml-3 border-l border-border pl-1">
          <NavList items={kids} pathname={pathname} search={search} onNavigate={onNavigate} />
        </div>
      )}
    </li>
  );
}
