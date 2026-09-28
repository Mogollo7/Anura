/**
 * Ciclo del modelo, repetible: conseguir fotos → limpiar → procesar → resultado.
 * Si el resultado no sirve, se vuelve a limpiar. No es una lista de pantallas sueltas.
 */
export type CicloEtapa = {
  id: "conseguir" | "limpiar" | "procesar" | "resultado";
  href: string;
  label: string;
  cierra: string;
};

export const CICLO: CicloEtapa[] = [
  { id: "conseguir", href: "/modelo#conseguir", label: "Conseguir", cierra: "Fotos, especies y regiones." },
  { id: "limpiar", href: "/modelo#limpiar", label: "Limpiar", cierra: "Curación, ficha y calidad." },
  { id: "procesar", href: "/modelo#procesar", label: "Procesar", cierra: "Vectores, centroides y OSR." },
  { id: "resultado", href: "/modelo#resultado", label: "Resultado", cierra: "Si no sirve, se repite." },
];
