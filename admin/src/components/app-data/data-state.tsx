"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LogIn, ServerCrash, ShieldOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Loadable } from "@/lib/app-data/app-client";

/**
 * Lo que se ve mientras un recurso real no está listo. Nunca muestra datos de ejemplo: sin
 * sesión pide iniciarla, sin permiso lo dice, y si el servicio no responde lo nombra.
 */
export function DataState<T>({
  value,
  onRetry,
  children,
}: {
  value: Loadable<T>;
  onRetry?: () => void;
  children: (data: T) => ReactNode;
}) {
  if (value.state === "listo") return <>{children(value.data)}</>;
  if (value.state === "cargando") {
    return <Card className="p-6 text-sm text-label-secondary">Cargando del servidor…</Card>;
  }
  if (value.state === "sin-sesion") {
    return (
      <Message icon={LogIn} title="Inicia sesión para ver estos datos">
        Salen del servidor real y solo los ve una cuenta del panel.
        <div className="mt-3">
          <Link href="/login" className="inline-flex rounded-md bg-cta-bg px-3.5 py-2 text-sm font-medium text-cta-fg hover:opacity-90">
            Iniciar sesión
          </Link>
        </div>
      </Message>
    );
  }
  if (value.status === 403) {
    return (
      <Message icon={ShieldOff} title="Tu cuenta no tiene este permiso">
        {value.message}. Pídeselo a quien administra las cuentas en Sistema.
      </Message>
    );
  }
  return (
    <Message icon={ServerCrash} title="No se pudo leer del servidor">
      {value.message}
      {onRetry && (
        <div className="mt-3">
          <Button variant="outline" onClick={onRetry}>Reintentar</Button>
        </div>
      )}
    </Message>
  );
}

function Message({ icon: Icon, title, children }: { icon: typeof LogIn; title: string; children: ReactNode }) {
  return (
    <Card className="flex items-start gap-3 p-6">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-subtle text-label-secondary">
        <Icon size={16} />
      </span>
      <div className="text-sm text-label-secondary">
        <p className="font-medium text-label-primary">{title}</p>
        <div className="mt-0.5">{children}</div>
      </div>
    </Card>
  );
}
