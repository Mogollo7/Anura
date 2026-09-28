import { ANTIOQUIA_SUBREGIONES, speciesForSubregion } from "@/lib/packages/antioquia-subregiones";
import type { MockCurationObservation } from "@/lib/mock/curation";

/**
 * Coordenadas de la cabecera principal de cada subregión. Aproximación del
 * point-in-polygon DANE (que existe en el pipeline de datos, no en el admin):
 * cada observación va a la subregión más cercana cuya cota admite su altitud.
 * Reemplazar por el polígono real cuando el admin lea el geo-service.
 */
const CABECERAS: Record<string, { lat: number; lng: number }> = {
  "01_valle_de_aburra": { lat: 6.244, lng: -75.581 },
  "02_oriente": { lat: 6.155, lng: -75.374 },
  "03_suroeste": { lat: 5.657, lng: -75.878 },
  "04_occidente": { lat: 6.557, lng: -75.828 },
  "05_norte": { lat: 6.964, lng: -75.418 },
  "06_nordeste": { lat: 7.08, lng: -74.7 },
  "07_magdalena_medio": { lat: 6.49, lng: -74.4 },
  "08_bajo_cauca": { lat: 7.986, lng: -75.195 },
  "09_uraba_antioqueno": { lat: 7.883, lng: -76.625 },
};

const TOLERANCIA_COTA_M = 150;

export function subregionOf(obs: Pick<MockCurationObservation, "lat" | "lng" | "altitudRaw">): string {
  const byCota = ANTIOQUIA_SUBREGIONES.filter(
    (s) => obs.altitudRaw >= s.cotaMin - TOLERANCIA_COTA_M && obs.altitudRaw <= s.cotaMax + TOLERANCIA_COTA_M
  );
  const candidatas = byCota.length ? byCota : ANTIOQUIA_SUBREGIONES;
  let best = candidatas[0].id;
  let bestD = Infinity;
  for (const s of candidatas) {
    const c = CABECERAS[s.id];
    const d = (c.lat - obs.lat) ** 2 + (c.lng - obs.lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s.id;
    }
  }
  return best;
}

/** ¿La especie pertenece al paquete de la subregión? (solape de altitud, F16) */
export function speciesInSubregion(speciesId: string, subregionId: string) {
  return speciesForSubregion(subregionId).some((s) => s.id === speciesId);
}
