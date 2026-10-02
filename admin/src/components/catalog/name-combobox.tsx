"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/field";

export type OpcionNombre = {
  /** Lo que se escribe en el campo al elegirla. */
  valor: string;
  /** Texto pequeño a la derecha («ya existe», «Hylidae · 4 especies»). */
  detalle?: string;
};

const MAX_OPCIONES = 8;
const sinTilde = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Campo de texto con sugerencias tomadas de lo que ya está guardado. El texto libre siempre
 * vale: si lo escrito no está en la lista se dice que es nuevo y se guarda tal cual.
 * Con `lista` el campo admite varios nombres separados por coma y sugiere para el último.
 */
export function NameCombobox({
  value,
  onChange,
  opciones,
  placeholder,
  maxLength,
  autoFocus,
  italico,
  lista = false,
  etiquetaNuevo = "no está guardado: se usará tal cual",
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  opciones: OpcionNombre[];
  placeholder?: string;
  maxLength?: number;
  autoFocus?: boolean;
  italico?: boolean;
  lista?: boolean;
  etiquetaNuevo?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(0);
  const [navegado, setNavegado] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  // En modo lista solo se edita el último nombre; lo anterior se conserva.
  const corte = lista ? value.lastIndexOf(",") + 1 : 0;
  const previo = value.slice(0, corte);
  const consulta = value.slice(corte).trimStart();

  const visibles = useMemo(() => {
    const q = sinTilde(consulta.trim());
    if (!q) return [];
    const yaPuestos = new Set(lista ? previo.split(",").map((s) => sinTilde(s.trim())).filter(Boolean) : []);
    const comienzo: OpcionNombre[] = [];
    const dentro: OpcionNombre[] = [];
    for (const o of opciones) {
      const v = sinTilde(o.valor);
      if (yaPuestos.has(v)) continue;
      if (v.startsWith(q)) comienzo.push(o);
      else if (v.split(/[\s-]/).some((p) => p.startsWith(q))) dentro.push(o);
    }
    return [...comienzo, ...dentro].slice(0, MAX_OPCIONES);
  }, [consulta, opciones, lista, previo]);

  const esNuevo = consulta.trim() !== "" && !opciones.some((o) => sinTilde(o.valor) === sinTilde(consulta.trim()));
  const hayPanel = abierto && (visibles.length > 0 || esNuevo);

  function elegir(o: OpcionNombre) {
    onChange(`${previo}${previo && !previo.endsWith(" ") ? " " : ""}${o.valor}`);
    setAbierto(false);
    contenedor.current?.querySelector("input")?.focus();
  }

  function alTeclear(ev: KeyboardEvent<HTMLInputElement>) {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      if (!visibles.length) return;
      ev.preventDefault();
      setAbierto(true);
      setNavegado(true);
      setActiva((a) => (ev.key === "ArrowDown" ? (a + 1) % visibles.length : (a - 1 + visibles.length) % visibles.length));
    } else if (ev.key === "Enter" && hayPanel && navegado && visibles[activa]) {
      // Enter solo elige si la persona llegó a la sugerencia con las flechas; si no, envía el formulario con su texto.
      ev.preventDefault();
      elegir(visibles[activa]);
    } else if (ev.key === "Escape" && abierto) {
      ev.stopPropagation();
      setAbierto(false);
    }
  }

  const idOpcion = (i: number) => `${id}-op-${i}`;

  return (
    <div ref={contenedor} className="relative">
      <Input
        role="combobox"
        aria-expanded={hayPanel}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        aria-activedescendant={hayPanel && visibles[activa] ? idOpcion(activa) : undefined}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setAbierto(true);
          setActiva(0);
          setNavegado(false);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setAbierto(false)}
        onKeyDown={alTeclear}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        className={cn(italico && "italic", className)}
      />
      {hayPanel && (
        <ul
          id={`${id}-lista`}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg"
        >
          {visibles.map((o, i) => (
            <li
              key={o.valor}
              id={idOpcion(i)}
              role="option"
              aria-selected={i === activa}
              // mousedown (no click) para elegir antes de que el campo pierda el foco.
              onMouseDown={(ev) => {
                ev.preventDefault();
                elegir(o);
              }}
              onMouseEnter={() => setActiva(i)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-sm text-label-primary",
                i === activa && "bg-accent-wash/60"
              )}
            >
              <span className={cn("truncate", italico && "italic")}>{o.valor}</span>
              {o.detalle && <span className="shrink-0 text-[11px] text-label-tertiary">{o.detalle}</span>}
            </li>
          ))}
          {esNuevo && (
            <li role="presentation" className="border-t border-border px-3 py-1.5 text-[11px] text-label-tertiary first:border-t-0">
              «{consulta.trim()}» {etiquetaNuevo}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
