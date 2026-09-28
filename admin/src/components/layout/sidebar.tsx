import { Suspense } from "react";
import { Leaf } from "lucide-react";
import { NavContent } from "./nav-content";

export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-cta-bg text-cta-fg">
          <Leaf size={16} strokeWidth={2.5} />
        </span>
        <span className="text-sm font-semibold tracking-tight">ANURA Admin</span>
      </div>

      <Suspense fallback={null}>
        <NavContent />
      </Suspense>
    </aside>
  );
}
