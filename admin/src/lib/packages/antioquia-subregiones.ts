import { getAllSpecies, type SpeciesEntry } from "@/lib/mock/catalog";
import { realSpecies } from "@/lib/data/real";

/**
 * Las 9 subregiones reales de Antioquia (19_ADMIN/Paquetes Geograficos de
 * Antioquia — grafo raíz Antioquia + parent_id). Esta es la unidad que se
 * versiona y se descarga según la decisión de escalabilidad #8 ("nueve
 * descargas, no treinta y seis"): el piso térmico NO crea un paquete propio,
 * solo filtra en memoria.
 *
 * IMPORTANTE — alcance de esta fase (F16): esto agrega la estructura
 * territorial REAL y el filtro de especies por subregión (grounded en el
 * rango de altitud real de cada especie, `catalog.getSpeciesDetail`, no en
 * números inventados). NO migra todavía el modelo de versiones/releases de
 * `packages.ts` (Antioquia sigue siendo 1 paquete con historial de versiones
 * ahí) — ese historial alimenta Dispositivos, Notificaciones, Sincronización
 * y Validación en ~15 archivos distintos, y migrarlo de verdad es una fase
 * propia (ver auditoría en el vault, nota de implementación de F16).
 */

export type PisoTermico = "lowland" | "premontane" | "montane" | "paramo";

export const PISO_LABEL: Record<PisoTermico, string> = {
  lowland: "Tierras bajas (< 1000 m)",
  premontane: "Premontano (1000–2000 m)",
  montane: "Montano (2000–3000 m)",
  paramo: "Páramo (> 3000 m)",
};

export type AntioquiaSubregion = {
  id: string;
  numero: string;
  nombre: string;
  municipios: string[];
  cotaMin: number;
  cotaMax: number;
  lecturaEcologica: string;
  riquezaTeorica: [number, number];
  entrenablesPunto: number;
};

export const ANTIOQUIA_SUBREGIONES: AntioquiaSubregion[] = [
  { id: "01_valle_de_aburra", numero: "01", nombre: "Valle de Aburrá", municipios: ["Medellín", "Caldas", "Envigado", "Bello", "Girardota", "Barbosa", "Sabaneta", "Itagüí", "La Estrella", "Copacabana"], cotaMin: 1300, cotaMax: 2800, lecturaEcologica: "Periurbano y ladera.", riquezaTeorica: [25, 35], entrenablesPunto: 25 },
  { id: "02_oriente", numero: "02", nombre: "Oriente", municipios: ["Rionegro", "La Ceja", "Guarne", "Marinilla", "El Retiro", "Sonsón", "Guatapé", "San Carlos"], cotaMin: 200, cotaMax: 3000, lecturaEcologica: "Altiplano y vertiente al Magdalena.", riquezaTeorica: [50, 70], entrenablesPunto: 42 },
  { id: "03_suroeste", numero: "03", nombre: "Suroeste", municipios: ["Jardín", "Andes", "Jericó", "Ciudad Bolívar", "Támesis", "Fredonia", "Santa Bárbara"], cotaMin: 600, cotaMax: 3400, lecturaEcologica: "Cafetero y Farallones del Citará.", riquezaTeorica: [60, 80], entrenablesPunto: 40 },
  { id: "04_occidente", numero: "04", nombre: "Occidente", municipios: ["Santa Fe de Antioquia", "Sopetrán", "San Jerónimo", "Cañasgordas", "Dabeiba", "Frontino"], cotaMin: 500, cotaMax: 3800, lecturaEcologica: "Cañón seco hasta páramo de Frontino.", riquezaTeorica: [70, 90], entrenablesPunto: 45 },
  { id: "05_norte", numero: "05", nombre: "Norte", municipios: ["Santa Rosa de Osos", "Belmira", "Yarumal", "San Pedro de los Milagros", "Ituango"], cotaMin: 1000, cotaMax: 3300, lecturaEcologica: "Belmira y cañón del Cauca.", riquezaTeorica: [45, 65], entrenablesPunto: 32 },
  { id: "06_nordeste", numero: "06", nombre: "Nordeste", municipios: ["Amalfi", "Anorí", "Vegachí", "Yolombó", "San Roque", "Segovia", "Remedios"], cotaMin: 200, cotaMax: 2500, lecturaEcologica: "Porce, Nechí, transición andina.", riquezaTeorica: [55, 80], entrenablesPunto: 35 },
  { id: "07_magdalena_medio", numero: "07", nombre: "Magdalena Medio", municipios: ["Puerto Berrío", "Puerto Nare", "Puerto Triunfo", "Yondó", "Maceo"], cotaMin: 100, cotaMax: 600, lecturaEcologica: "Tierras bajas, Hylidae y Leptodactylidae.", riquezaTeorica: [40, 55], entrenablesPunto: 38 },
  { id: "08_bajo_cauca", numero: "08", nombre: "Bajo Cauca", municipios: ["Caucasia", "El Bagre", "Nechí", "Tarazá", "Zaragoza", "Cáceres"], cotaMin: 50, cotaMax: 400, lecturaEcologica: "Ciénagas.", riquezaTeorica: [35, 50], entrenablesPunto: 28 },
  { id: "09_uraba_antioqueno", numero: "09", nombre: "Urabá", municipios: ["Turbo", "Apartadó", "Chigorodó", "Carepa", "Mutatá", "Necoclí", "Arboletes", "Murindó", "Vigía del Fuerte"], cotaMin: 0, cotaMax: 800, lecturaEcologica: "Chocó y Darién. Dendrobatidae y Centrolenidae.", riquezaTeorica: [90, 120], entrenablesPunto: 55 },
];

export function pisosFor(sub: AntioquiaSubregion): PisoTermico[] {
  const pisos: PisoTermico[] = [];
  if (sub.cotaMin < 1000) pisos.push("lowland");
  if (sub.cotaMax >= 1000 && sub.cotaMin < 2000) pisos.push("premontane");
  if (sub.cotaMax >= 2000 && sub.cotaMin < 3000) pisos.push("montane");
  if (sub.cotaMax >= 3000) pisos.push("paramo");
  return pisos;
}

/**
 * Especies del paquete presentes en la subregión: las que viajan en el paquete
 * (estado visual habilitado) con al menos un registro ubicado en uno de sus
 * municipios (point-in-polygon DANE, lib/data/real.ts). Antes se solapaba un
 * rango de altitud simulado contra la cota de la subregión.
 */
export function speciesForSubregion(subregionId: string): SpeciesEntry[] {
  return getAllSpecies().filter((sp) => sp.enPaquete && (realSpecies(sp.id)?.subregiones[subregionId] ?? 0) > 0);
}

/** Registros reales de la especie en la subregión (GBIF + iNaturalist). */
export function registrosEnSubregion(speciesId: string, subregionId: string) {
  return realSpecies(speciesId)?.subregiones[subregionId] ?? 0;
}

export function getAntioquiaSubregion(id: string) {
  return ANTIOQUIA_SUBREGIONES.find((s) => s.id === id);
}
