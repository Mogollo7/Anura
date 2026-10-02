import { NextRequest, NextResponse } from "next/server";
import { recuperarBase, requireAdminTecnico, respuestaDeError } from "@/lib/system/respaldo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { archivo, confirmacion }: sustituye la base y las fotos por esa copia. */
export async function POST(req: NextRequest) {
  const quien = await requireAdminTecnico(req);
  if (quien instanceof NextResponse) return quien;
  try {
    const body = (await req.json().catch(() => ({}))) as { archivo?: string; confirmacion?: string };
    if (!body.archivo) return NextResponse.json({ message: "Falta la copia que hay que recuperar." }, { status: 400 });
    return NextResponse.json(await recuperarBase(body.archivo, body.confirmacion || "", quien.nombre));
  } catch (err) {
    return respuestaDeError(err);
  }
}
