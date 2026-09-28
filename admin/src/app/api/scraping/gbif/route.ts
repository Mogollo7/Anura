import { NextRequest, NextResponse } from "next/server";

const GBIF = "https://api.gbif.org/v1/occurrence/search";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const departamento = req.nextUrl.searchParams.get("departamento")?.trim() ?? "";
  const soloCoordenadas = req.nextUrl.searchParams.get("coordenadas") !== "false";
  const perPage = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("per_page")) || 8));

  const params = new URLSearchParams({
    country: "CO",
    taxonKey: "952",
    limit: String(perPage),
  });
  if (q) params.set("scientificName", q);
  if (departamento) params.set("stateProvince", departamento);
  if (soloCoordenadas) params.set("hasCoordinate", "true");

  try {
    const res = await fetch(`${GBIF}?${params}`, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return NextResponse.json({ message: "GBIF no respondió" }, { status: 502 });
    const body = (await res.json()) as { count?: number; results?: Record<string, unknown>[] };
    const filas = (body.results ?? []).map((row) => ({
      cientifico: row.scientificName ?? row.species ?? null,
      lat: row.decimalLatitude ?? null,
      lon: row.decimalLongitude ?? null,
      fecha: row.eventDate ?? null,
      base: row.basisOfRecord ?? null,
      departamento: row.stateProvince ?? null,
      dataset: row.datasetName ?? null,
      ocurrencia: row.occurrenceID ?? row.key ?? null,
    }));
    return NextResponse.json({ total: body.count ?? filas.length, filas });
  } catch {
    return NextResponse.json({ message: "No hay conexión con GBIF" }, { status: 502 });
  }
}
