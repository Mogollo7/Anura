"use client";

import { useMemo } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppKpis } from "@/components/app-data/app-kpis";
import { ActivityGraphCard } from "@/components/analytics/activity-graph-card";
import { GeoGridMapLoader } from "@/components/analytics/geo-grid-map-loader";
import {
  appApi,
  useAppResource,
  speciesLabel,
  type AppObservation,
  type ActivityApiResponse,
} from "@/lib/app-data/app-client";
import { emptyActivitySeries, type ActivitySeries } from "@/lib/analytics/activity";
import type { ObservationPoint } from "@/lib/analytics/geo-grid";

function pointsFromObservations(obs: AppObservation[]): ObservationPoint[] {
  return obs
    .filter((o) => o.lat != null && o.lon != null)
    .map((o) => ({
      id: o.id,
      lat: o.lat!,
      lng: o.lon!,
      count: 1,
      common_name: o.common_name || speciesLabel(o),
      ai_class: o.ai_class || undefined,
      username: o.username,
      thumbnail_key: o.thumbnail_key,
      created_at: o.created_at,
    }));
}

function pointsFromActivity(data: ActivityApiResponse | null): ObservationPoint[] | null {
  if (!data?.geo?.points) return null;
  return data.geo.points.map((p) => ({
    id: p.id,
    lat: p.lat,
    lng: p.lng,
    count: p.count || 1,
    common_name: p.common_name,
    ai_class: p.ai_class,
    username: p.username,
    thumbnail_key: p.thumbnail_key,
    created_at: p.created_at,
  }));
}

export function AnalyticsLiveView() {
  const activityResource = useAppResource(appApi.activity);
  const obsResource = useAppResource(appApi.observations);

  const activityData = activityResource.value.state === "listo" ? activityResource.value.data : null;
  const observations = obsResource.value.state === "listo" ? obsResource.value.data : null;

  const series: ActivitySeries | null = useMemo(() => {
    if (activityData?.series) return activityData.series;
    if (activityResource.value.state === "listo") return emptyActivitySeries();
    return null;
  }, [activityData, activityResource.value.state]);

  const realPoints: ObservationPoint[] | null = useMemo(() => {
    const fromActivity = pointsFromActivity(activityData);
    if (fromActivity && fromActivity.length > 0) return fromActivity;
    if (observations) return pointsFromObservations(observations);
    // Vacío solo cuando ya respondió el listado de observaciones (o falló y no hay geo del panel).
    if (obsResource.value.state === "listo") return [];
    if (obsResource.value.state === "error" && activityResource.value.state === "listo") {
      return fromActivity ?? [];
    }
    return null;
  }, [activityData, observations, activityResource.value.state, obsResource.value.state]);

  const loading =
    activityResource.value.state === "cargando" ||
    activityResource.value.state === "sin-sesion" ||
    (obsResource.value.state === "cargando" && realPoints === null);

  const activityError = activityResource.value.state === "error" ? activityResource.value.message : null;
  const obsError = obsResource.value.state === "error" ? obsResource.value.message : null;

  const totalGeolocalizadas = realPoints?.length ?? 0;
  const hasSeries = series !== null;
  const seriesTotal = series
    ? series.observaciones.reduce((sum, d) => sum + d.count, 0)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-label-primary">Analítica</h1>
          {hasSeries && realPoints !== null && (
            <Badge tone="accent" className="text-[11px]">
              Datos del servidor
            </Badge>
          )}
        </div>
        <p className="mt-1 max-w-2xl text-sm text-label-secondary">
          Usuarios, dispositivos, observaciones y avisos salen del servidor. La serie de actividad y el mapa
          usan observaciones reales (created_at, lat/lon) del observation-service — sin cifras inventadas.
        </p>
      </div>

      <AppKpis show={["usuarios", "dispositivos", "observaciones", "avisos"]} />

      <div className="space-y-2">
        {activityError && (
          <p className="text-sm text-danger">No se pudo cargar la serie de actividad: {activityError}</p>
        )}
        {!hasSeries && loading && (
          <Card className="p-6 text-sm text-label-secondary">Cargando serie de actividad…</Card>
        )}
        {hasSeries && series && (
          <>
            {seriesTotal === 0 && (
              <p className="text-xs text-label-secondary">
                Aún no hay observaciones con fecha en el periodo: la cuadrícula queda en cero.
              </p>
            )}
            <ActivityGraphCard series={series} />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Actividad geográfica</CardTitle>
          {realPoints !== null && (
            <Badge tone={totalGeolocalizadas > 0 ? "accent" : "neutral"}>
              {totalGeolocalizadas > 0
                ? `${totalGeolocalizadas.toLocaleString("es-CO")} con coordenadas`
                : "Sin georreferencia"}
            </Badge>
          )}
        </CardHeader>
        {obsError && !realPoints?.length && (
          <p className="mb-3 text-sm text-danger">No se pudieron leer observaciones: {obsError}</p>
        )}
        {realPoints === null && (
          <p className="text-sm text-label-secondary">Cargando observaciones georreferenciadas…</p>
        )}
        {realPoints !== null && totalGeolocalizadas === 0 && (
          <p className="text-sm text-label-secondary">
            No hay observaciones con latitud y longitud en el servidor. Cuando lleguen, aquí se dibuja la
            cuadrícula de densidad según el conteo real — no un mapa de ejemplo.
          </p>
        )}
        {realPoints !== null && totalGeolocalizadas > 0 && (
          <>
            <p className="mb-3 text-xs text-label-secondary">
              Densidad por cuadrícula adaptativa a partir de {totalGeolocalizadas.toLocaleString("es-CO")}{" "}
              observaciones georreferenciadas. Con zoom 12+ se ven los puntos individuales.
            </p>
            <div className="h-[440px] w-full overflow-hidden rounded-md border border-border">
              <GeoGridMapLoader points={realPoints} />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
