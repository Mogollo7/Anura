import { NextRequest, NextResponse } from "next/server";

const SERVICES = {
  "auth-service": { env: "AUTH_SERVICE_URL", local: "http://localhost:3001", nombre: "el servicio de cuentas" },
  "dataset-service": { env: "DATASET_SERVICE_URL", local: "http://localhost:3008", nombre: "el servicio del dataset" },
  "observation-service": { env: "OBSERVATION_SERVICE_URL", local: "http://localhost:3002", nombre: "el servicio de observaciones" },
  "notification-service": { env: "NOTIFICATION_SERVICE_URL", local: "http://localhost:3006", nombre: "el servicio de avisos" },
  "thumbnail-service": { env: "THUMBNAIL_SERVICE_URL", local: "http://localhost:3004", nombre: "el servicio de miniaturas" },
} as const;

type Service = keyof typeof SERVICES;

/**
 * Reenvía cada request al servicio, leyendo su URL en cada llamada (no en el build): así el
 * mismo contenedor sirve en este PC o detrás de nginx en Hostinger sin reconstruir la imagen.
 * El navegador solo ve /api/*, mismo origen — sin CORS, igual que hará nginx cuando el Admin
 * esté detrás de él.
 */
export async function proxyTo(service: Service, req: NextRequest, path: string[]): Promise<NextResponse> {
  const { env, local, nombre } = SERVICES[service];
  const base = process.env[env] || local;
  const url = `${base}/api/${path.join("/")}${req.nextUrl.search}`;

  const init: RequestInit = {
    method: req.method,
    headers: {
      "Content-Type": req.headers.get("content-type") || "application/json",
      ...(req.headers.get("authorization") ? { Authorization: req.headers.get("authorization")! } : {}),
    },
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    // Bytes, no texto: una foto subida (multipart) se corrompe si pasa por req.text().
    const body = await req.arrayBuffer();
    if (body.byteLength) init.body = body;
  }

  try {
    const res = await fetch(url, init);
    // Bytes, no texto: las miniaturas (image/webp) se corrompen si pasan por res.text().
    const body = res.status === 204 ? null : await res.arrayBuffer();
    const headers: Record<string, string> = { "Content-Type": res.headers.get("content-type") || "application/json" };
    const cache = res.headers.get("cache-control");
    if (cache) headers["Cache-Control"] = cache;
    return new NextResponse(body, { status: res.status, headers });
  } catch {
    return NextResponse.json({ message: `No se pudo conectar con ${nombre}. Revisa que esté encendido y vuelve a intentarlo.` }, { status: 502 });
  }
}
