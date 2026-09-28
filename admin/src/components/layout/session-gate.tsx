"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePanelSession } from "@/lib/session/panel-session";

/** Sin sesión real no se muestra ninguna pantalla del panel: se va a /login. */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const session = usePanelSession();
  const router = useRouter();
  const blocked = !session.cargando && !session.isReal;

  useEffect(() => {
    if (blocked) router.replace("/login");
  }, [blocked, router]);

  if (!session.isReal) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-label-secondary" role="status">
        {session.cargando ? "Comprobando tu sesión…" : "Llevándote a iniciar sesión…"}
      </div>
    );
  }
  return <>{children}</>;
}
