/** Etiquetas de curación que guarda el servidor (dataset.observacion_etiqueta, bloque 1). */
export type Estadio = "adulto" | "juvenil" | "metamorfico" | "larva" | "desconocido";
export type Sustrato = "hojarasca" | "vegetacion" | "quebrada" | "roca";

export const ESTADIO_LABEL: Record<Estadio, string> = {
  adulto: "Adulto",
  juvenil: "Juvenil",
  metamorfico: "Metamórfico",
  larva: "Larva",
  desconocido: "Desconocido",
};

export const SUSTRATO_LABEL: Record<Sustrato, string> = {
  hojarasca: "Hojarasca",
  vegetacion: "Vegetación / hoja",
  quebrada: "Quebrada / agua",
  roca: "Roca",
};

export type Morfo = {
  id: number;
  subregion_id: number;
  subregion: string;
  region: string;
  nombre: string;
  nota: string | null;
  creado: string;
  individuos: number;
};

export type EtiquetaObservacion = {
  observacion_id: number;
  estadio: Estadio | null;
  sustrato: Sustrato | null;
  morfo_id: number | null;
  actualizado: string;
};

/** Subregión de un departamento activo, donde se puede declarar un morfo. */
export type SubregionActiva = { id: number; nombre: string; region: string };

export type EtiquetasEspecie = { morfos: Morfo[]; observaciones: EtiquetaObservacion[]; subregiones: SubregionActiva[] };

/** Motivos frecuentes para invalidar una observación del dataset (Admin → Imágenes). */
export const MOTIVOS_INVALIDACION = [
  "GPS fuera del rango de distribución conocido de la especie",
  "El individuo ya está registrado en otra observación (duplicado cruzado)",
  "La foto no permite verificar caracteres diagnósticos",
  "Metadatos de fecha o ubicación inconsistentes con la fuente",
] as const;
