"use client";

import { Suspense, useState } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { Menu, X, Leaf } from "lucide-react";
import { NavContent } from "./nav-content";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <RadixDialog.Trigger asChild>
        <button
          type="button"
          aria-label="Abrir menú"
          className="flex h-8 w-8 items-center justify-center rounded-md text-label-secondary hover:bg-surface-subtle hover:text-label-primary md:hidden"
        >
          <Menu size={18} />
        </button>
      </RadixDialog.Trigger>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/40 md:hidden" />
        <RadixDialog.Content className="fixed inset-y-0 left-0 z-50 flex h-full w-72 max-w-[80vw] flex-col border-r border-border bg-surface shadow-modal focus:outline-none md:hidden">
          <div className="flex h-14 items-center justify-between gap-2 border-b border-border px-4">
            <RadixDialog.Title asChild>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-cta-bg text-cta-fg">
                  <Leaf size={16} strokeWidth={2.5} />
                </span>
                <span className="text-sm font-semibold tracking-tight">ANURA Admin</span>
              </div>
            </RadixDialog.Title>
            <RadixDialog.Close className="flex h-7 w-7 items-center justify-center rounded-md text-label-tertiary hover:bg-surface-subtle hover:text-label-primary">
              <X size={16} />
            </RadixDialog.Close>
          </div>

          <Suspense fallback={null}>
            <NavContent onNavigate={() => setOpen(false)} />
          </Suspense>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
