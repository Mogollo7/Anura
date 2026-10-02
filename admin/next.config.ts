import type { NextConfig } from "next";

// El proxy a auth-service vive en src/app/api/{auth,panel}/[...path]/route.ts, no aquí:
// next.config.ts se evalúa en el build (output: "standalone"), pero AUTH_SERVICE_URL solo
// se conoce en tiempo de arranque del contenedor (docker-compose.server.yml). Un rewrite()
// horneado en el build habría quedado apuntando a localhost siempre.
// El Admin es público (admin.juanlabs.me): cabeceras que cierran lo básico. Sin CSP de scripts: Next
// necesita los suyos en línea; el control de acceso real está en cada servicio (cuenta del panel).
const SEGURIDAD = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["minio"],
  async headers() {
    return [{ source: "/:path*", headers: SEGURIDAD }];
  },
  // Entornos de prueba en paralelo (varios `next dev` sobre el mismo árbol): cada uno con su carpeta.
  // Sin la variable, la de siempre (.next), así que el build de producción no cambia.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
