export type GeoGridCell = {
  id: string;
  bounds: [[number, number], [number, number]]; // [[south, west], [north, east]]
  count: number;
  centerLat: number;
  centerLng: number;
};

export type ObservationPoint = {
  id: string;
  lat: number;
  lng: number;
  count: number;
  common_name?: string;
  ai_class?: string | null;
  username?: string;
  thumbnail_key?: string | null;
  created_at?: string;
};

/** Resolución de la cuadrícula según el zoom de Leaflet. */
export function cellSizeForZoom(zoom: number): number {
  if (zoom >= 12) return 0.02;
  if (zoom >= 9) return 0.07;
  return 0.28;
}

/** Agrupa puntos reales en celdas; la intensidad es el conteo, no pines inventados. */
export function buildCellsFromPoints(points: ObservationPoint[], cellSize: number): GeoGridCell[] {
  const bins = new Map<string, { lat: number; lng: number; count: number }>();
  for (const pt of points) {
    if (typeof pt.lat !== "number" || typeof pt.lng !== "number" || isNaN(pt.lat) || isNaN(pt.lng)) continue;
    const cellLat = Math.floor(pt.lat / cellSize) * cellSize;
    const cellLng = Math.floor(pt.lng / cellSize) * cellSize;
    const key = `${cellLat.toFixed(4)},${cellLng.toFixed(4)}`;
    const existing = bins.get(key);
    if (existing) {
      existing.count += pt.count || 1;
    } else {
      bins.set(key, { lat: cellLat, lng: cellLng, count: pt.count || 1 });
    }
  }

  return Array.from(bins.entries()).map(([key, item]) => ({
    id: `cell-${key}`,
    bounds: [
      [item.lat, item.lng],
      [item.lat + cellSize, item.lng + cellSize],
    ],
    centerLat: item.lat + cellSize / 2,
    centerLng: item.lng + cellSize / 2,
    count: item.count,
  }));
}
