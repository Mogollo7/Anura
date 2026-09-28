"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Dialog({
  open,
  onOpenChange,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <RadixDialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[min(560px,92vw)] max-h-[88vh] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface shadow-modal focus:outline-none",
            className ?? "overflow-y-auto p-6"
          )}
        >
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function DialogHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <RadixDialog.Title className="text-base font-semibold text-label-primary">
          {title}
        </RadixDialog.Title>
        {description && (
          <RadixDialog.Description className="mt-0.5 text-sm text-label-secondary">
            {description}
          </RadixDialog.Description>
        )}
      </div>
      <RadixDialog.Close aria-label="Cerrar" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-label-tertiary hover:bg-surface-subtle hover:text-label-primary">
        <X size={16} />
      </RadixDialog.Close>
    </div>
  );
}
