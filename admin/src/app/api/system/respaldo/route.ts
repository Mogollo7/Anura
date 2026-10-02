import { NextRequest, NextResponse } from "next/server";
import { crearRespaldo, listarRespaldos, requireAdminTecnico, respuestaDeError } from "@/lib/system/respaldo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: las copias que hay y el nombre de la base. */
export async function GET(req: NextRequest) {
  const quien = await requireAdminTecnico(req);
  if (quien instanceof NextResponse) return quien;
  try {
    return NextResponse.json(await listarRespaldos());
  } catch (err) {
    return respuestaDeError(err);
  }
}

/** POST: hace una copia completa (pg_dump). No modifica la base. */
export async function POST(req: NextRequest) {
  const quien = await requireAdminTecnico(req);
  if (quien instanceof NextResponse) return quien;
  try {
    const body = (await req.json().catch(() => ({}))) as { conFotos?: unknown };
    return NextResponse.json(await crearRespaldo(quien.nombre, { conFotos: body.conFotos !== false }), { status: 201 });
  } catch (err) {
    return respuestaDeError(err);
  }
}
