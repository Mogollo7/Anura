import { NextRequest, NextResponse } from "next/server";
import { cargarDump, requireAdminTecnico, respuestaDeError } from "@/lib/system/respaldo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST multipart campo `dump`: guarda un dump custom para descargarlo o recuperarlo. */
export async function POST(req: NextRequest) {
  const quien = await requireAdminTecnico(req);
  if (quien instanceof NextResponse) return quien;
  try {
    const form = await req.formData();
    const file = form.get("dump");
    if (!(file instanceof File)) return NextResponse.json({ message: "Falta el archivo dump." }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    return NextResponse.json(await cargarDump(bytes, quien.nombre), { status: 201 });
  } catch (err) {
    return respuestaDeError(err);
  }
}
