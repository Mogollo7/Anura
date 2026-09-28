import { NextResponse } from "next/server";
import { probeAllServices, SERVICES } from "@/lib/system/services";

/** Health real de los microservicios (desde el contenedor Admin, misma red o túnel). */
export async function GET() {
  const checks = await probeAllServices();
  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    services: SERVICES.map((s) => ({
      id: s.id,
      nombre: s.nombre,
      contenedor: s.contenedor,
      puerto: s.puerto,
      envUrl: s.envUrl,
      check: checks[s.id],
    })),
    checks,
  });
}
