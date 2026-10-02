import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { eliminarRespaldo, requireAdminTecnico, respuestaDeError, rutaDeRespaldo } from "@/lib/system/respaldo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: descarga el archivo de la copia (necesita la sesión del panel, por eso el cliente lo pide con fetch). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ archivo: string }> }) {
  const quien = await requireAdminTecnico(req);
  if (quien instanceof NextResponse) return quien;
  try {
    const { archivo } = await ctx.params;
    const { ruta, respaldo } = await rutaDeRespaldo(archivo);
    return new NextResponse(Readable.toWeb(createReadStream(ruta)) as ReadableStream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(respaldo.bytes),
        "Content-Disposition": `attachment; filename="${archivo}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return respuestaDeError(err);
  }
}

/** DELETE: borra la copia guardada (no toca la base ni las fotos de MinIO). */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ archivo: string }> }) {
  const quien = await requireAdminTecnico(req);
  if (quien instanceof NextResponse) return quien;
  try {
    const { archivo } = await ctx.params;
    return NextResponse.json(await eliminarRespaldo(archivo, quien.nombre));
  } catch (err) {
    return respuestaDeError(err);
  }
}
