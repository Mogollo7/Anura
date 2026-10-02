import { NextRequest, NextResponse } from "next/server";
import { limpiarBase, requireAdminTecnico, respuestaDeError } from "@/lib/system/respaldo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { archivo, confirmacion }: vacía la base actual y conserva la copia. Apagada salvo BACKUP_ALLOW_CLEAN=1. */
export async function POST(req: NextRequest) {
  const quien = await requireAdminTecnico(req);
  if (quien instanceof NextResponse) return quien;
  try {
    const body = (await req.json().catch(() => ({}))) as { archivo?: unknown; confirmacion?: unknown; borrarFotos?: unknown };
    if (typeof body.archivo !== "string" || typeof body.confirmacion !== "string") {
      return NextResponse.json({ message: "Falta la copia o el nombre de la base." }, { status: 400 });
    }
    return NextResponse.json(await limpiarBase(body.archivo, body.confirmacion, { borrarFotos: body.borrarFotos !== false }));
  } catch (err) {
    return respuestaDeError(err);
  }
}
