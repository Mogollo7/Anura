import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/** "1 foto" / "3 fotos": una sola definición para todo el panel. */
export function plural(n: number, uno: string, varios: string) {
  return `${n.toLocaleString("es-CO")} ${n === 1 ? uno : varios}`;
}
