"use client";

import { useMemo, useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Rectangle,
  Tooltip,
  CircleMarker,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { ObservationPoint } from "@/lib/analytics/geo-grid";
import { cellSizeForZoom, buildCellsFromPoints } from "@/lib/analytics/geo-grid";

const GRID_ACCENT = "#FF7A1A";
const GRID_ACCENT_RGB = "255, 122, 26";

function colorForRatio(ratio: number) {
  const alpha = 0.15 + ratio * 0.75;
  return `rgba(${GRID_ACCENT_RGB}, ${alpha.toFixed(2)})`;
}

function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoom(map.getZoom()),
  });
  useEffect(() => {
    onZoom(map.getZoom());
  }, [map, onZoom]);
  return null;
}

export function GeoGridMap({ points }: { points: ObservationPoint[] }) {
  const [zoom, setZoom] = useState(8);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const cellSize = cellSizeForZoom(zoom);
  const cells = useMemo(() => buildCellsFromPoints(points, cellSize), [points, cellSize]);
  const max = useMemo(() => Math.max(...cells.map((c) => c.count), 1), [cells]);

  const center = useMemo<[number, number]>(() => {
    const avgLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
    const avgLng = points.reduce((s, p) => s + p.lng, 0) / points.length;
    return [avgLat, avgLng];
  }, [points]);

  const showPoints = zoom >= 12;

  return (
    <MapContainer center={center} zoom={8} scrollWheelZoom className="h-full w-full rounded-md">
      <ZoomWatcher onZoom={setZoom} />

      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {!showPoints &&
        cells.map((cell) => {
          const ratio = cell.count / max;
          return (
            <Rectangle
              key={cell.id}
              bounds={cell.bounds}
              pathOptions={{
                color: hoveredId === cell.id ? GRID_ACCENT : "transparent",
                weight: hoveredId === cell.id ? 1.5 : 0,
                fillColor: colorForRatio(ratio),
                fillOpacity: 1,
              }}
              eventHandlers={{
                mouseover: () => setHoveredId(cell.id),
                mouseout: () => setHoveredId(null),
              }}
            >
              <Tooltip sticky>{cell.count} observaciones</Tooltip>
            </Rectangle>
          );
        })}

      {showPoints &&
        points.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={6}
            pathOptions={{
              color: GRID_ACCENT,
              weight: 1.5,
              fillColor: "#FFA85C",
              fillOpacity: 0.85,
            }}
          >
            <Tooltip>
              {p.common_name || p.ai_class ? `${p.common_name || p.ai_class} · ` : ""}
              {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
            </Tooltip>
          </CircleMarker>
        ))}
    </MapContainer>
  );
}
