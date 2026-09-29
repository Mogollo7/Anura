import Link from "next/link";
import { AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Motivo } from "@/lib/release/release-client";

const PANTALLA: Record<string, string> = {
  "/paquetes": "Regiones",
  "/ia": "Worker",
  "/centroides": "Centroides",
  "/curacion": "Imágenes",
  "/catalogo": "Especies",
  "/osr": "OSR",
  "/ficha-especie": "Ficha",
};

/** Motivos (bloquean) o avisos (no bloquean) del servidor, cada uno con el enlace a donde se arregla. */
export function Motivos({ items, tipo }: { items: Motivo[]; tipo: "motivo" | "aviso" }) {
  const Icon = tipo === "motivo" ? XCircle : AlertTriangle;
  return (
    <ul className="space-y-1.5">
      {items.map((m) => (
        <li key={m.codigo} className={cn("flex items-start gap-1.5 text-sm", tipo === "motivo" ? "text-danger" : "text-warning")}>
          <Icon size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {m.texto}{" "}
            <Link href={m.pantalla} className="whitespace-nowrap text-accent-ink underline decoration-dotted underline-offset-2">
              Ir a {PANTALLA[m.pantalla] ?? m.pantalla}
            </Link>
          </span>
        </li>
      ))}
    </ul>
  );
}
