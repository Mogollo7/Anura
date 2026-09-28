export type Bbox = { south: number; north: number; west: number; east: number };

export type BiogeoZone = {
  id: string;
  banda: string;
  medianaDem: number;
  celdas: number;
  registros: number;
  especies: number;
};

export type Departamento = {
  id: string;
  nombre: string;
  bbox: Bbox;
  // Perfil altitudinal de referencia: el mock de OpenTopoData genera muestras
  // con esta forma. La API real lo reemplaza sin cambiar la interfaz.
  elevacion: { min: number; max: number; mean: number };
  zonas: BiogeoZone[];
};

// Zonas v1 (2026-09-13) calculadas por recambio de composición (βsim).
const ZONAS_ANTIOQUIA: BiogeoZone[] = [
  { id: "ZONE_005", banda: "Tierras bajas", medianaDem: 157, celdas: 87, registros: 8600, especies: 175 },
  { id: "ZONE_006", banda: "Montano", medianaDem: 1950, celdas: 18, registros: 4868, especies: 141 },
  { id: "ZONE_002", banda: "Premontano", medianaDem: 1005, celdas: 10, registros: 819, especies: 93 },
  { id: "ZONE_001", banda: "Montano", medianaDem: 1910, celdas: 7, registros: 794, especies: 86 },
];

export const DEPARTAMENTOS: Departamento[] = [
  {
    id: "antioquia",
    nombre: "Antioquia",
    bbox: { south: 5.42, north: 8.88, west: -77.13, east: -73.88 },
    elevacion: { min: 2, max: 4080, mean: 1180 },
    zonas: ZONAS_ANTIOQUIA,
  },
  {
    id: "choco",
    nombre: "Chocó",
    bbox: { south: 3.97, north: 8.67, west: -77.9, east: -75.85 },
    elevacion: { min: 0, max: 3960, mean: 420 },
    zonas: [],
  },
  {
    id: "valle-del-cauca",
    nombre: "Valle del Cauca",
    bbox: { south: 3.08, north: 5.05, west: -77.55, east: -75.7 },
    elevacion: { min: 0, max: 4200, mean: 1050 },
    zonas: [],
  },
  {
    id: "cauca",
    nombre: "Cauca",
    bbox: { south: 0.95, north: 3.33, west: -77.95, east: -75.75 },
    elevacion: { min: 0, max: 5360, mean: 1650 },
    zonas: [],
  },
  {
    id: "risaralda",
    nombre: "Risaralda",
    bbox: { south: 4.68, north: 5.47, west: -76.35, east: -75.4 },
    elevacion: { min: 850, max: 5100, mean: 1850 },
    zonas: [],
  },
  {
    id: "caldas",
    nombre: "Caldas",
    bbox: { south: 4.8, north: 5.75, west: -75.95, east: -74.65 },
    elevacion: { min: 150, max: 5300, mean: 1700 },
    zonas: [],
  },
  {
    id: "cundinamarca",
    nombre: "Cundinamarca",
    bbox: { south: 3.73, north: 5.83, west: -74.9, east: -73.05 },
    elevacion: { min: 200, max: 4000, mean: 2100 },
    zonas: [],
  },
];

export function getDepartamento(id: string) {
  return DEPARTAMENTOS.find((d) => d.id === id);
}

// Límites de Colombia continental — validación de la cobertura del paquete.
export const COLOMBIA_BOUNDS: Bbox = { south: -4.3, north: 13.5, west: -79.1, east: -66.8 };
