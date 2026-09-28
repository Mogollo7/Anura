"use client";

import dynamic from "next/dynamic";
import type { ObservationPoint } from "@/lib/analytics/geo-grid";

const GeoGridMap = dynamic(() => import("./geo-grid-map").then((m) => m.GeoGridMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-md bg-surface-subtle text-xs text-label-tertiary">
      Cargando mapa…
    </div>
  ),
});

export function GeoGridMapLoader({ points }: { points: ObservationPoint[] }) {
  return <GeoGridMap points={points} />;
}
