"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, CircleUserRound, LogOut } from "lucide-react";
import { ALL_NAV_ITEMS, NAV_AREAS } from "@/config/nav";
import { MobileNav } from "./mobile-nav";
import { NotificationBell } from "./notification-bell";
import { usePanelSession } from "@/lib/session/panel-session";

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const session = usePanelSession();
  const [query, setQuery] = useState("");
  const [noMatch, setNoMatch] = useState(false);
  const area = NAV_AREAS.find((a) => a.href === pathname);
  const current = area
    ? { label: area.label }
    : ALL_NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(item.href + "/"));

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3 sm:gap-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNav />
        <h1 className="truncate text-sm font-semibold text-label-primary">
          {current?.label ?? "ANURA Admin"}
        </h1>
      </div>

      <div className="flex flex-1 items-center justify-end gap-3">
        <form
          role="search"
          className="relative hidden w-full max-w-xs sm:block"
          onSubmit={(e) => {
            e.preventDefault();
            const q = query.trim().toLowerCase();
            if (!q) return;
            const destino =
              ALL_NAV_ITEMS.find((i) => i.label.toLowerCase() === q) ??
              ALL_NAV_ITEMS.find((i) => `${i.label} ${i.blurb}`.toLowerCase().includes(q));
            if (destino) {
              setQuery("");
              router.push(destino.href);
            } else {
              setNoMatch(true);
            }
          }}
        >
          <Search
            size={14}
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-label-tertiary"
          />
          <input
            type="search"
            list="pantallas-del-panel"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setNoMatch(false);
            }}
            aria-label="Ir a una pantalla del panel"
            aria-invalid={noMatch || undefined}
            placeholder="Ir a una pantalla…"
            className="w-full rounded-md border border-border bg-surface-subtle py-1.5 pl-8 pr-3 text-sm text-label-primary placeholder:text-label-tertiary focus:outline-none focus:ring-2 focus:ring-accent-tint aria-[invalid]:ring-2 aria-[invalid]:ring-danger"
          />
          <datalist id="pantallas-del-panel">
            {ALL_NAV_ITEMS.map((i) => (
              <option key={i.href} value={i.label}>
                {i.blurb}
              </option>
            ))}
          </datalist>
          {noMatch && (
            <p role="status" className="absolute left-0 top-full mt-1 text-[11px] text-danger">
              Ninguna pantalla se llama así.
            </p>
          )}
        </form>
        <NotificationBell />
        <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-subtle py-1 pl-2 pr-1 text-label-secondary">
          <CircleUserRound size={16} aria-hidden />
          <span
            className="max-w-[9rem] truncate text-xs text-label-primary sm:max-w-[14rem]"
            title={session.acting?.email}
          >
            {session.acting?.name}
            {session.acting?.isSuperAdmin ? " · super usuario" : ""}
          </span>
          <button
            onClick={() => {
              session.logout();
              router.push("/login");
            }}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="flex h-7 w-7 items-center justify-center rounded-full text-label-tertiary hover:text-label-primary"
          >
            <LogOut size={14} aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
}
