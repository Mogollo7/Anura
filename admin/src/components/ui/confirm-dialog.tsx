"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";

/**
 * Confirmación de una acción que cambia datos (quitar, retirar). Sustituye a window.confirm:
 * mismo aspecto que el resto de diálogos y funciona con teclado y lector de pantalla.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogHeader title={title} description={description} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={onCancel}>Volver</Button>
        <Button variant={danger ? "danger" : "primary"} loading={busy} disabled={busy} onClick={onConfirm}>
          {busy ? "Un momento…" : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
