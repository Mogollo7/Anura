import type { AnchorHTMLAttributes, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  href?: string;
}

export function Card({ className, href, ...props }: CardProps) {
  const baseClassName = cn(
    "rounded-lg border border-border bg-surface p-5 shadow-card",
    className
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(baseClassName, "block transition-all hover:border-accent-wash hover:shadow-md")}
        {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {props.children}
      </Link>
    );
  }

  return (
    <div
      className={baseClassName}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-3 flex items-center justify-between", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold text-label-primary", className)} {...props} />;
}
