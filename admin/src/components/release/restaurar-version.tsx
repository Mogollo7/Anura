"use client";

import { useState } from "react";
import { Lock, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { usePanelSession } from "@/lib/session/panel-session";
import { ETIQUETA_IMPORTADO, releaseApi, type Paquete } from "@/lib/release/release-client";

/** Etiqueta de una versión que se importó ya validada (el paquete que traía la app antes). */
export function EtiquetaImportado({ p }: { p: Pick<Paquete, "origen"> }) {
  return p.origen === "legado" ? <Badge tone="info">{ETIQUETA_IMPORTADO}</Badge> : null;
}

/**
 * «Restaurar esta versión»: solo para versiones retiradas. Vuelve a entregarla en su subregión y la que se
 * entrega ahora pasa a retirada; no pide aprobaciones nuevas (el archivo no cambia). El servidor decide y
 * valida; aquí solo se confirma y se avisa qué pasó.
 *
 * @param subregion nombre para leer ("Valle de Aburrá")
 * @param vigente la versión que hoy se entrega en esa subregión, si hay
 */
export function RestaurarVersion({
  p,
  subregion,
  vigente,
  ocupado,
  onHecho,
  onError,
}: {
  p: Paquete;
  subregion: string;
  vigente: Pick<Paquete, "version"> | null;
  ocupado: boolean;
  onHecho: (mensaje: string) => void;
  onError: (mensaje: string) => void;
}) {
  const session = usePanelSession();
  const [abierto, setAbierto] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  if (p.estado !== "retirado") return null;
  const permitido = session.can("publicarPaquete");

  async function restaurar() {
    setRestaurando(true);
    try {
      await releaseApi.restaurar(p.id);
      setAbierto(false);
      onHecho(`Versión ${p.version} restaurada: es la que se entrega ahora en ${subregion}.`);
    } catch (e) {
      setAbierto(false);
      onError(e instanceof Error ? e.message : "No se pudo restaurar la versión");
    } finally {
      setRestaurando(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className="text-xs"
        disabled={!permitido || ocupado}
        title={!permitido ? 'Falta el permiso "Publicar paquete"' : undefined}
        onClick={() => setAbierto(true)}
      >
        {permitido ? <Undo2 size={12} aria-hidden /> : <Lock size={12} aria-hidden />} Restaurar esta versión
      </Button>
      <ConfirmDialog
        open={abierto}
        title={`¿Restaurar la versión ${p.version} de ${subregion}?`}
        description={
          (vigente
            ? `La versión ${vigente.version}, que se entrega ahora, queda retirada y la versión ${p.version} vuelve a ser la que descargan los teléfonos. `
            : `La versión ${p.version} vuelve a ser la que descargan los teléfonos. `) +
          (vigente
            ? `Los teléfonos que ya instalaron la versión ${vigente.version} no se tocan: la conservan hasta que bajen la que se entrega ahora. `
            : "") +
          "No necesita aprobaciones nuevas: es un archivo que ya se validó y no cambia."
        }
        confirmLabel={`Restaurar versión ${p.version}`}
        busy={restaurando}
        onCancel={() => setAbierto(false)}
        onConfirm={() => void restaurar()}
      />
    </>
  );
}
