import { NextRequest, NextResponse } from "next/server";

const INAT = "https://api.inaturalist.org/v1";
const COLOMBIA = "7196";
const GRADES = new Set(["research", "needs_id", "casual"]);

type Taxon = {
  id?: number;
  name?: string;
  preferred_common_name?: string;
  observations_count?: number;
  ancestor_ids?: number[];
  ancestors?: { rank?: string; name?: string; preferred_common_name?: string }[];
};

function ancestor(taxon: Taxon, rank: string) {
  return taxon.ancestors?.find((a) => a.rank === rank);
}

function isTadpole(obs: { annotations?: { controlled_attribute?: { label?: string }; controlled_value?: { label?: string } }[] }) {
  for (const annotation of obs.annotations ?? []) {
    const attribute = (annotation.controlled_attribute?.label ?? "").toLowerCase();
    const value = (annotation.controlled_value?.label ?? "").toLowerCase();
    if (["life stage", "etapa de vida", "stage"].includes(attribute) && ["tadpole", "renacuajo", "larva", "larvae"].includes(value)) {
      return true;
    }
  }
  return false;
}

function sexOf(obs: { sex?: string; annotations?: { controlled_attribute?: { label?: string }; controlled_value?: { label?: string } }[] }) {
  if (obs.sex) return obs.sex;
  for (const annotation of obs.annotations ?? []) {
    const attribute = (annotation.controlled_attribute?.label ?? "").toLowerCase();
    if (attribute === "sex" || attribute === "sexo") return annotation.controlled_value?.label ?? null;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const grade = req.nextUrl.searchParams.get("quality_grade") ?? "research";
  const perPage = Math.min(20, Math.max(1, Number(req.nextUrl.searchParams.get("per_page")) || 8));
  if (q.length < 3) return NextResponse.json({ message: "Escribe al menos el género y la especie" }, { status: 400 });
  if (grade !== "none" && !GRADES.has(grade)) return NextResponse.json({ message: "Grado de calidad no válido" }, { status: 400 });

  try {
    const taxaRes = await fetch(`${INAT}/taxa?q=${encodeURIComponent(q)}&rank=species&per_page=5&is_active=true`, { signal: AbortSignal.timeout(12_000) });
    if (!taxaRes.ok) return NextResponse.json({ message: "iNaturalist no respondió el taxón" }, { status: 502 });
    const taxa = (await taxaRes.json()) as { results?: Taxon[] };
    const hallado = taxa.results?.[0];
    if (!hallado?.id) return NextResponse.json({ message: "No hay una especie con ese nombre" }, { status: 404 });
    const detailRes = await fetch(`${INAT}/taxa/${hallado.id}`, { signal: AbortSignal.timeout(12_000) });
    // /taxa/{id} responde { results: [taxón] } y solo ahí vienen los ancestros (género, familia, orden).
    const detalle = detailRes.ok ? ((await detailRes.json()) as { results?: Taxon[] }).results?.[0] : undefined;
    const taxon = detalle?.id ? detalle : hallado;

    const params = new URLSearchParams({
      taxon_id: String(taxon.id),
      place_id: COLOMBIA,
      per_page: String(perPage),
      order_by: "id",
      order: "desc",
    });
    params.append("has[]", "photos");
    if (grade !== "none") params.set("quality_grade", grade);

    const obsRes = await fetch(`${INAT}/observations?${params}`, { signal: AbortSignal.timeout(12_000) });
    if (!obsRes.ok) return NextResponse.json({ message: "iNaturalist no respondió las observaciones" }, { status: 502 });
    const body = (await obsRes.json()) as { total_results?: number; results?: Record<string, unknown>[] };

    const rows = (body.results ?? []).map((obs) => {
      const photos = (obs.photos as { license_code?: string; attribution?: string }[] | undefined) ?? [];
      const location = typeof obs.location === "string" ? obs.location.split(",") : [];
      const user = obs.user as { login?: string } | undefined;
      return {
        id: obs.id,
        renacuajo: isTadpole(obs as never),
        lat: location[0] ? Number(location[0]) : null,
        lon: location[1] ? Number(location[1]) : null,
        precision_m: obs.positional_accuracy ?? null,
        fecha: obs.observed_on ?? null,
        lugar: obs.place_guess ?? null,
        autor: user?.login ?? null,
        calidad: obs.quality_grade ?? null,
        sexo: sexOf(obs as never),
        fotos: photos.length,
        licencia: photos[0]?.license_code ?? null,
        atribucion: photos[0]?.attribution ?? null,
      };
    });

    return NextResponse.json({
      taxon: {
        id: taxon.id,
        cientifico: taxon.name,
        comun: taxon.preferred_common_name ?? null,
        genero: ancestor(taxon, "genus")?.name ?? null,
        familia: ancestor(taxon, "family")?.name ?? null,
        orden: ancestor(taxon, "order")?.name ?? "Anura",
        observaciones: taxon.observations_count ?? null,
      },
      total: body.total_results ?? rows.length,
      place_id: Number(COLOMBIA),
      filas: rows,
    });
  } catch {
    return NextResponse.json({ message: "No hay conexión con iNaturalist" }, { status: 502 });
  }
}
