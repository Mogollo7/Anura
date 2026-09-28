import { FlaskConical } from "lucide-react";

/**
 * Lo que todavía no sale del servidor. Se borra este componente cuando la lista quede vacía
 * (C3 no cuenta: depende de BioCLIP en el servidor y se muestra en Sincronización).
 */
export function MockBanner() {
  return (
    <div
      role="note"
      className="flex items-start gap-2 border-b border-border bg-warning/10 px-5 py-1.5 text-xs text-label-primary"
    >
      <FlaskConical size={13} strokeWidth={2.5} className="mt-0.5 shrink-0 text-warning" aria-hidden />
      <span>
        <strong className="font-semibold">Todavía se ensaya en este navegador, no en el servidor:</strong> la consola del
        Worker, DB vectorial, Clústeres, OSR, Validación técnica, Release, Simulador y Métricas; morfos, estadio, ficha
        técnica y «Añadir especie». Todo lo demás del panel sale del servidor.
      </span>
    </div>
  );
}
