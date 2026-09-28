import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "danger" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-cta-bg text-cta-fg hover:opacity-90",
  secondary: "bg-surface-subtle text-label-primary hover:bg-border/60",
  outline: "border border-border text-label-primary hover:bg-surface-subtle",
  danger: "bg-danger text-danger-fg hover:opacity-90",
  ghost: "text-label-secondary hover:bg-surface-subtle hover:text-label-primary",
};

export function Button({
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    />
  );
}
