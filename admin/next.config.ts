import type { NextConfig } from "next";

// El proxy a auth-service vive en src/app/api/{auth,panel}/[...path]/route.ts, no aquí:
// next.config.ts se evalúa en el build (output: "standalone"), pero AUTH_SERVICE_URL solo
// se conoce en tiempo de arranque del contenedor (docker-compose.server.yml). Un rewrite()
// horneado en el build habría quedado apuntando a localhost siempre.
const nextConfig: NextConfig = {
  output: "standalone",
  // Entornos de prueba en paralelo (varios `next dev` sobre el mismo árbol): cada uno con su carpeta.
  // Sin la variable, la de siempre (.next), así que el build de producción no cambia.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
