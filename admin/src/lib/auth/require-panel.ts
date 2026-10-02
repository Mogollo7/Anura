import { NextRequest, NextResponse } from "next/server";

/**
 * Las rutas /api/* del Admin que no reenvían a un microservicio (scraping, health) no tienen quien
 * valide la sesión por ellas. Con el Admin público, nadie sin cuenta del panel puede usarlas:
 * se le pregunta a auth-service con el mismo token, igual que hacen los demás servicios.
 * Devuelve null si la cuenta es del panel, o la respuesta de error lista para devolver.
 */
export async function requirePanelAccount(req: NextRequest): Promise<NextResponse | null> {
  const authorization = req.headers.get("authorization");
  if (!authorization) return NextResponse.json({ message: "Inicia sesión en el panel" }, { status: 401 });
  const base = process.env.AUTH_SERVICE_URL || "http://localhost:3001";
  try {
    const res = await fetch(`${base}/api/panel/me`, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (res.status === 401) return NextResponse.json({ message: "La sesión ya no es válida" }, { status: 401 });
    if (res.status === 403) return NextResponse.json({ message: "Esta cuenta no está en el panel administrativo" }, { status: 403 });
    if (!res.ok) return NextResponse.json({ message: "No se pudo verificar la cuenta" }, { status: 502 });
    return null;
  } catch {
    return NextResponse.json({ message: "No se pudo verificar la cuenta con el servicio de cuentas" }, { status: 502 });
  }
}
